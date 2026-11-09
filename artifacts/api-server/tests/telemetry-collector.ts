import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { createTelemetryRuntime, telemetryDelivery } from "../src/lib/telemetry";

// Minimal length-delimited protobuf field reader: no dependency or real account.
function fields(message: Buffer, wanted: number): Buffer[] {
  const found: Buffer[] = [];
  let offset = 0;
  const integer = () => {
    let value = 0, shift = 0;
    while (offset < message.length) {
      const byte = message[offset++]; value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
    throw new Error("Truncated test protobuf");
  };
  while (offset < message.length) {
    const tag = integer(), wire = tag & 7, number = Math.floor(tag / 8);
    if (wire === 2) {
      const length = integer();
      if (number === wanted) found.push(message.subarray(offset, offset + length));
      offset += length;
    } else if (wire === 0) integer();
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error("Unexpected test protobuf wire type");
  }
  return found;
}

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
  const originalError = new Error(sensitive);
  let operation: Promise<unknown> | undefined;
  telemetry.observe(request, response, () => {
    continued = true;
    operation = telemetry.operation("registration.create", () =>
      telemetry.operation("database.transaction", async () => { throw originalError; }));
  });
  assert.equal(continued, true);
  await assert.rejects(operation!, error => error === originalError);
  telemetry.diagnostic({ consent: true, event: "connection_ready", source: "connection", durationMs: 120 }, "participant");
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
  assert.ok(combined.includes("kodiboxa_client_diagnostics_total"), "diagnostic metric missing");
  assert.ok(combined.includes("kodiboxa_operations_total"), "operation metric missing");
  const bounds = Buffer.alloc(12 * 8);
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30].forEach((value, index) => bounds.writeDoubleLE(value, index * 8));
  assert.ok(packets.some(p => p.path === "/v1/metrics" && p.body.includes(bounds)), "second-scale histogram advice was not exported");
  const spans = packets.filter(p => p.path === "/v1/traces").flatMap(p => fields(p.body, 1)
    .flatMap(resource => fields(resource, 2).flatMap(scope => fields(scope, 2))))
    .map(span => ({ name: fields(span, 5)[0]?.toString(), id: fields(span, 2)[0], parent: fields(span, 4)[0], trace: fields(span, 1)[0] }));
  const http = spans.find(s => s.name?.startsWith("POST "));
  const registration = spans.find(s => s.name === "registration.create");
  const database = spans.find(s => s.name === "database.transaction");
  assert.ok(http && registration && database);
  assert.ok(registration.parent?.equals(http.id));
  assert.ok(database.parent?.equals(registration.id));
  const errorRecords = packets.filter(p => p.path === "/v1/logs").flatMap(p => fields(p.body, 1)
    .flatMap(resource => fields(resource, 2).flatMap(scope => fields(scope, 2))))
    .filter(record => record.includes("operation.failed"));
  assert.ok(errorRecords.length >= 2);
  assert.ok(errorRecords.every(record => fields(record, 9)[0]?.equals(http.trace)), "error logs lost request trace correlation");
  console.log("PASS: real SDK OTLP traces, metrics and technical logs reached a local collector; sensitive request fields were excluded.");
} finally {
  await telemetry.shutdown();
  await new Promise<void>((resolve, reject) => collector.close(error => error ? reject(error) : resolve()));
}
