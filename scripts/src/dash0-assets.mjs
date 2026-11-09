/**
 * Manage only KODIBOXA-owned development monitoring assets.
 * No credential values, raw API errors or notification destinations are logged.
 * node scripts/src/dash0-assets.mjs verify|apply|enable|test
 */
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const environment = "development";
const dataset = "default";
const scope = 'service_name="kodiboxa-api",deployment_environment_name="development",service_version=~".+"';
const counter = `{otel_metric_name="kodiboxa_http_requests_total",${scope}}`;
const failures = `{otel_metric_name="kodiboxa_http_requests_total",${scope},http_response_status_code=~"5.."}`;
const histogram = `{otel_metric_name="kodiboxa_http_request_duration_seconds",${scope}}`;
export const queries = {
  throughput: `sum(rate(${counter}[5m]))`,
  errors: `(sum(rate(${failures}[5m])) or vector(0)) / clamp_min(sum(rate(${counter}[5m])), 0.000001) * 100`,
  p50: `histogram_quantile(0.50,sum by(service_name)(rate(${histogram}[5m])))`,
  p95: `histogram_quantile(0.95,sum by(service_name)(rate(${histogram}[5m])))`,
  volume: `sum(increase(${counter}[5m]))`,
  freshness: `time()-max(timestamp(${counter}))`,
  missing: `absent_over_time(${counter}[5m])`,
};

export function monitoringAssets({ latencySeconds = 2, enabled = false, channelId } = {}) {
  const panel = (name, expressions) => ({
    kind: "Panel",
    spec: {
      display: { name },
      plugin: { kind: "TimeSeriesChart", spec: { visual: { display: "line", palette: { mode: "auto" } }, yAxis: { min: 0 } } },
      queries: expressions.map(([label, query]) => ({
        kind: "TimeSeriesQuery",
        spec: { plugin: { kind: "PrometheusTimeSeriesQuery", spec: { query, minStep: "30s", seriesNameFormat: label } } },
      })),
    },
  });
  const panels = {
    requests: panel("API requests per second", [["Requests/s", queries.throughput]]),
    errors: panel("Server error rate (%)", [["5xx (%)", queries.errors]]),
    latency: panel("API latency (seconds)", [["p50", queries.p50], ["p95", queries.p95]]),
    volume: panel("Requests in the last five minutes", [["Requests", queries.volume]]),
    freshness: panel("Age of latest request metric (seconds)", [["Age", queries.freshness]]),
    clientFailures: panel("Opt-in client-reported failures (five minutes)", [["Failures", `sum by (diagnostic_event,diagnostic_role)(increase({otel_metric_name="kodiboxa_client_diagnostics_total",${scope},diagnostic_event=~".*failed|.*timeout|.*dropped"}[5m]))`]]),
    captionStartup: panel("Opt-in caption startup p95 (seconds)", [["Startup p95", `histogram_quantile(0.95,sum by(service_name)(rate({otel_metric_name="kodiboxa_client_operation_duration_seconds",${scope},diagnostic_event="captions_ready"}[5m])))`]]),
    operations: panel("Registration/payment operation outcomes (five minutes)", [["Operations", `sum by (operation_name,operation_outcome)(increase({otel_metric_name="kodiboxa_operations_total",${scope}}[5m]))`]]),
  };
  const dashboard = {
    kind: "Dashboard",
    metadata: { name: "kodiboxa-development-operations", dash0Extensions: { id: "kodiboxa-development-operations", dataset } },
    spec: {
      display: { name: "KODIBOXA — Development operations", description: "Development only. Technical telemetry, not participant activity. No automatic remediation." },
      duration: "1h", refreshInterval: "30s", panels,
      layouts: [{ kind: "Grid", spec: { items: Object.keys(panels).map((key, index) => ({
        content: { $ref: `#/spec/panels/${key}` }, height: 8, width: 12, x: index % 2 * 12, y: Math.floor(index / 2) * 8,
      })) } }],
    },
  };
  const rule = (suffix, name, expression, description) => ({
    id: `kodiboxa-${environment}-${suffix}`, dataset, name: `KODIBOXA development — ${name}`,
    expression, interval: "1m", for: "3m", keep_firing_for: "2m", enabled,
    labels: { service: "kodiboxa-api", environment, managed_by: "kodiboxa", severity: "warning" },
    annotations: {
      summary: name, description: `${description} Development only. Investigate; do not automatically restart, merge or modify production.`,
      ...(channelId ? { "dash0.com/notification-channel-ids": channelId } : {}),
    },
  });
  return { dashboard, rules: [
    rule("http-errors", "Sustained server errors",
      `((${queries.errors}) > 5) and ((${queries.volume}) >= 20)`,
      "The HTTP 5xx ratio exceeds 5% with at least 20 requests in five minutes."),
    rule("latency", "Sustained slow API responses",
      `((${queries.p95}) > ${latencySeconds}) and ((${queries.volume}) >= 20)`,
      `The measured p95 exceeds ${latencySeconds.toFixed(3)} seconds with at least 20 requests in five minutes. Threshold uses a fresh measured baseline when enabled.`),
    rule("missing-metrics", "Backend telemetry is missing", `${queries.missing} > 0`,
      "No request counter data has arrived for five minutes. Intentional development shutdowns can trigger this check."),
  ] };
}

function client() {
  const ingress = new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.DASH0_OTLP_HTTP_ENDPOINT || "");
  if (ingress.protocol !== "https:" || !/^ingress\.[a-z0-9-]+\.aws\.dash0\.com$/.test(ingress.hostname)) throw new Error("A supported HTTPS Dash0 ingress endpoint is required.");
  const base = `https://${ingress.hostname.replace(/^ingress\./, "api.")}`;
  const token = (process.env.DASH0_AUTH_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
  if (!token.startsWith("auth_") || /\s/.test(token)) throw new Error("A complete server Auth Token is required.");
  return async (path, method = "GET", body) => {
    const response = await fetch(base + path, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Dash0-Dataset": dataset },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { await response.arrayBuffer(); throw new Error(`Dash0 ${method} ${path.split("?")[0]} returned HTTP ${response.status}.`); }
    return response.json();
  };
}

async function query(api, expression) {
  // Explicit evaluation time avoids empty results from the API's default time.
  const params = new URLSearchParams({ dataset, query: expression, time: String(Date.now() / 1000), timeout: "10s" });
  const result = await api(`/api/prometheus/api/v1/query?${params}`);
  if (result.status !== "success") throw new Error("Dash0 query did not succeed.");
  return result.data?.result || [];
}

async function existingEmail(api) {
  const channels = (await api("/api/notification-channels")).filter(c => ["email", "email_v2"].includes(c.spec?.type));
  if (channels.length !== 1) throw new Error("Exactly one existing email channel must be confirmed before enabling notifications.");
  const id = channels[0].metadata?.labels?.["dash0.com/id"];
  if (!id) throw new Error("Existing email channel has no identifier.");
  return id;
}

export async function run(action) {
  const api = client();
  if (action === "verify") {
    const body = { dataset, timeRange: { from: "now-30m", to: "now" }, filter: [
      { key: "service.name", operator: "is", value: "kodiboxa-api" },
      { key: "deployment.environment.name", operator: "is", value: environment },
    ], pagination: { limit: 5 } };
    const [spans, logs, metrics] = await Promise.all([api("/api/spans", "POST", body), api("/api/logs", "POST", body), query(api, counter)]);
    const visible = {
      traces: (spans.resourceSpans || []).some(r => (r.scopeSpans || []).some(s => s.spans?.length)),
      logs: (logs.resourceLogs || []).some(r => (r.scopeLogs || []).some(s => s.logRecords?.length)),
      metrics: metrics.length > 0,
    };
    console.log(JSON.stringify({ environment, dataset, visible }));
    if (!Object.values(visible).every(Boolean)) throw new Error("Not all three signals are visible.");
    return;
  }
  if (action === "apply" || action === "enable") {
    const enabled = action === "enable";
    const channelId = enabled ? await existingEmail(api) : undefined;
    let latencySeconds = 2;
    if (enabled) {
      const baseline = await query(api, queries.p95);
      const value = Number(baseline[0]?.value?.[1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("A fresh finite p95 baseline is required before enabling.");
      latencySeconds = Math.max(1, Math.ceil(value * 3 * 1000) / 1000);
    }
    const assets = monitoringAssets({ enabled, channelId, latencySeconds });
    await api(`/api/dashboards/${assets.dashboard.metadata.dash0Extensions.id}?dataset=${dataset}`, "PUT", assets.dashboard);
    for (const rule of assets.rules) await api(`/api/alerting/check-rules/${rule.id}?dataset=${dataset}`, "PUT", rule);
    console.log(JSON.stringify({ environment, dashboard: assets.dashboard.metadata.dash0Extensions.id, checkRules: assets.rules.length, enabled, latencyThresholdSeconds: latencySeconds, notificationChannel: enabled ? "existing-confirmed-email" : "none" }));
    return;
  }
  if (action === "test") {
    const channelId = await existingEmail(api);
    // Automatically recovers even if the CLI exits. No real application failures.
    const deadline = Math.floor(Date.now() / 1000) + 180;
    const id = `kodiboxa-${environment}-notification-verification`;
    await api(`/api/alerting/check-rules/${id}?dataset=${dataset}`, "PUT", {
      id, dataset, name: "KODIBOXA — Notification verification (not an incident)",
      expression: `(vector(1) > 0) and on() (vector(time()) < ${deadline})`,
      interval: "1m", for: "0s", keep_firing_for: "0s", enabled: true,
      labels: { service: "kodiboxa-api", environment, managed_by: "kodiboxa", verification: "true" },
      annotations: { summary: "Controlled KODIBOXA notification test — no incident",
        description: "Deliberate notification delivery verification. Stops firing after three minutes, resolving on the next one-minute evaluation. No event, payment, registration or video failure was introduced.",
        "dash0.com/notification-channel-ids": channelId },
    });
    console.log(JSON.stringify({ notificationTestCreated: true, autoRecoveryDeadline: new Date(deadline * 1000).toISOString(), recipient: "existing-confirmed-email", deliveryConfirmed: false }));
    return;
  }
  if (action === "agent0") {
    const content = await readFile(new URL("../../docs/observability/agent0/SKILL.md", import.meta.url), "utf8");
    const origin = "kodiboxa-investigation-only";
    await api(`/api/agent0/custom-skills/${origin}`, "PUT", {
      kind: "Dash0Skill", metadata: { labels: { "dash0.com/origin": origin } },
      spec: { files: [{ relativePath: "SKILL.md", content }] },
    });
    console.log(JSON.stringify({ investigationSkillPrepared: true, origin, automationsCreated: false, toolPermissionsChanged: false, interactiveGithubAccessVerified: false }));
    return;
  }
  throw new Error("Choose verify, apply, enable, test or agent0. Enabling/test require explicit owner confirmation of the existing email channel.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).catch(error => {
    console.error(error instanceof Error && error.message.startsWith("Dash0 ") ? error.message : "Monitoring setup did not complete. Check permissions and the documented prerequisites.");
    process.exitCode = 1;
  });
}
