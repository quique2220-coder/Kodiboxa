import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { createTelemetryRuntime, telemetryDelivery } from "../src/lib/telemetry";

const packets: Array<{ path: string; body: Buffer; dataset: string | string[] | undefined }> = [];
const collector = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    packets.push({ path: req.url || "", body: Buffer.concat(chunks), dataset: req.headers["dash0-dataset"] });
    res.writeHead(200, { "content-type": "application/x-protobuf" });
    res.end();
  });
});
await new Promise<void>(resolve => collector.listen(0, "127.0.0.1", resolve));
const address = collector.address();
assert.ok(address && typeof address !== "string");
// Explicit test-only collector, not production endpoint validation or a real token.
const telemetry = createTelemetryRuntime({
  baseUrl: `http://127.0.0.1:${address.port}`,
  headers: { Authorization: "Bearer TEST_ONLY_TOKEN", "Dash0-Dataset": "default" },
}, 1);
try {
  telemetry.probe();
  const sensitive = "PRIVATE_PARTICIPANT_TEXT_SHOULD_NEVER_BE_EXPORTED";
  const request = {
    method: "POST", route: { path: "/sessions/:id/answers" },
    url: `/sessions/${sensitive}/answers?token=${sensitive}`,
    headers: { authorization: sensitive, cookie: sensitive },
    params: { id: sensitive }, body: { caption: sensitive, email: sensitive },
  } as unknown as Request;
  const response = Object.assign(new EventEmitter(), { statusCode: 500, writableFinished: true }) as unknown as Response;
  let continued = false;
  telemetry.observe(request, response, () => { continued = true; });
  assert.equal(continued, true);
  response.emit("finish");
  response.emit("close");
  await telemetry.flush();
  for (const signal of ["traces", "metrics", "logs"]) {
    assert.ok(packets.some(p => p.path === `/v1/${signal}`), `missing ${signal} OTLP request`);
    assert.ok(telemetryDelivery()[signal].accepted > 0, `${signal} acknowledgement not recorded`);
  }
  assert.ok(packets.every(p => p.dataset === "default"), "default dataset header missing from an OTLP request");
  const combined = Buffer.concat(packets.map(p => p.body)).toString("utf8");
  assert.ok(!combined.includes(sensitive), "telemetry exposed participant/request content");
  assert.ok(combined.includes("/api/sessions/:id/answers"), "declared route pattern missing");
  assert.ok(combined.includes("http.server.error"), "technical error log missing");
  assert.ok(combined.includes("kodiboxa_http_requests_total"), "request counter missing");
  assert.ok(combined.includes("kodiboxa-api"), "service identity missing");
  console.log("PASS: real SDK OTLP traces, metrics and technical logs reached a local collector; sensitive request fields were excluded.");
} finally {
  await telemetry.shutdown();
  await new Promise<void>((resolve, reject) => collector.close(error => error ? reject(error) : resolve()));
}
