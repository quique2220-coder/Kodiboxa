# KODIBOXA monitoring with Dash0

## Scope

The backend exports OpenTelemetry traces, metrics and a small allowlisted set of
technical logs. It does not forward existing Pino logs. It does not automatically
instrument SQL queries, external providers or browser audio/video.

Resource identity:

- `service.name`: `kodiboxa-api`
- `service.namespace`: `kodiboxa`
- `deployment.environment.name`: `development` or `production`

HTTP metadata is restricted to method, the declared Express route pattern and
status code. Unknown routes become `/api/unmatched`. Requests and response bodies,
raw URLs, query strings, headers, IPs, participant identifiers, media and caption
text are not exported.

Request traces are sampled at 10%. Metrics count all completed API requests.
Queues are bounded; exporter failures do not block event requests. Error logs are
limited to 20 per process per minute. Startup probes are explicitly identified as
`telemetry.connection.verify`, not presented as participant traffic.

## Server configuration

Store these values in the hosting environment's Secrets manager:

- `DASH0_AUTH_TOKEN`: an ingestion-authorized Dash0 token, without shell commands.
- `DASH0_OTLP_HTTP_ENDPOINT`: the organization's HTTPS OTLP/HTTP ingress endpoint.
  Copy it from Dash0 **Settings → Endpoints → OTLP/HTTP**. Do not use the panel URL,
  API endpoint, gRPC address, an example placeholder or an entire setup snippet.

The endpoint must use the `ingress.*.dash0.com` hostname and HTTPS port 443.
A root endpoint or a `/v1/traces`, `/v1/metrics` or `/v1/logs` suffix is accepted;
the exporter selects the three signal paths itself. Do not add these server
credentials to any `VITE_*` variable or commit them to Git.

This initial integration uses the token's default ingestion destination. For a
token that requires an explicit dataset header, configure dataset support before
using it; do not broaden permissions just to bypass an ingestion rejection.

Restart the API workflow after configuring Secrets.

## Verify the connection

1. Open the administrator's **Platform** page. Dash0's technical status is omitted
   from participant and anonymous workspace responses.
2. Startup sends one identified probe for traces, metrics and logs. The status is
   not connected until all three exporters acknowledge acceptance.
3. Make an ordinary API request, then inspect Dash0 for `kodiboxa-api`.
4. Metrics export every 30 seconds. Traces/logs batch every five seconds.
5. Check the environment filter; development and production are separate.

A transport acknowledgement proves collector acceptance, not that someone has
opened the Dash0 dashboard. No dashboard or alerting resource is created just by
setting the ingestion token.

## Initial dashboard

In Dash0, select `service.name = kodiboxa-api` and the intended environment. Add:

- Request volume from `kodiboxa_http_requests_total`.
- Response status distribution and 5xx error rate from that counter.
- p50/p95 latency from `kodiboxa_http_request_duration_seconds`.
- The `http.server.error` log view.
- Metric freshness using `kodiboxa_telemetry_heartbeat_total` and ingestion time.

Use the metric/label names shown by Dash0's query builder when creating PromQL
queries; translation of OTLP names and histogram representation can vary.
Do not use event IDs, participant IDs or emails as metric labels.

## Alerting setup still requires account configuration

An ingestion-only token does not authorize creating dashboards, check rules or
notification channels. In Dash0, create rules after confirming the actual signals
and baseline:

- **Server errors:** sustained 5xx rate above the chosen threshold, with a minimum
  request count to avoid noisy alerts during low traffic.
- **Slow requests:** p95 latency above the baseline for several evaluations.
- **Missing telemetry:** no new backend metrics for a defined window, taking
  intentional shutdowns into account.

Choose the notification recipients/channel in Dash0; no contact destination is
inferred from the application's administrator email.

Validate a new rule with Dash0's preview/test facilities before relying on it.
Do not inject failures into payments, registrations or active video sessions to
test an alert. No automatic remediation, merges or restarts are authorized.

## Focused local checks

The policy test verifies endpoint restrictions and delivery-state behavior.
The collector test uses a local test-only collector and proves the installed SDK
exports all three OTLP signals without forwarding sensitive request fields.
Neither test proves delivery to a real Dash0 account.
