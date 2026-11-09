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

Configure these values on the server:

- `DASH0_AUTH_TOKEN`: an ingestion-authorized Dash0 token, without shell commands.
  Store the complete static Auth Token value, including its `auth_` prefix, in
  the hosting environment's Secrets manager. Never manually reconstruct a token
  by adding a prefix to a partial value. Missing prefixes are rejected locally.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: the organization's HTTPS OTLP/HTTP ingress endpoint.
  This URL is not a credential and can be stored as an environment variable.
  Copy it from Dash0 **Settings → Endpoints → OTLP/HTTP**. Do not use the panel URL,
  API endpoint, gRPC address, an example placeholder or an entire setup snippet.
  The older `DASH0_OTLP_HTTP_ENDPOINT` setting remains supported when the standard
  variable is absent; the standard variable takes precedence.

The endpoint must use the `ingress.*.dash0.com` hostname and HTTPS port 443.
A root endpoint or a `/v1/traces`, `/v1/metrics` or `/v1/logs` suffix is accepted;
the exporter selects the three signal paths itself. Do not add these server
credentials to any `VITE_*` variable or commit them to Git.

All three exporters explicitly send `Dash0-Dataset: default`. The token needs
ingestion access to that dataset for spans, metrics and logs. Do not broaden
permissions just to bypass an ingestion rejection. The regional `api.*` endpoint
and its timerange query are for reading data, not exporting telemetry; API reading
permissions are not required for this integration.

Do not paste tokens or authenticated example commands into chat, source files,
logs or screenshots. If a token is exposed, revoke it and replace it through
Secrets before verifying real delivery. Do not execute an exposed example command.

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

The managed dashboard is **KODIBOXA — Development operations**, in dataset
`default`. It explicitly selects `kodiboxa-api`, development, and versioned
instrumentation. The `service_version` selector excludes older, coarse histogram
data while the second-scale latency instrumentation is introduced.

- Request volume from `kodiboxa_http_requests_total`.
- Response status distribution and 5xx error rate from that counter.
- p50/p95 latency from `kodiboxa_http_request_duration_seconds`.
- Opt-in connection/device failure counts and caption startup latency.
- Technical registration/payment operation outcomes.
- Age of request metric data and missing periodic metrics.
- Use Dash0's log explorer with the same service/environment for correlated
  `http.server.error`, `operation.failed` and `client.diagnostic.failure` records.

Use `otel_metric_name` selectors and an explicit Unix evaluation `time` for
verification API queries. OpenTelemetry-to-Prometheus name translation can vary.
No-data results must be distinguished from ingestion failure. Do not use event
IDs, participant IDs or emails as metric labels. The startup heartbeat is a
connection probe, not a continuously incrementing uptime signal.

## Managed setup and alerting

An ingestion-only token does not authorize account provisioning. Run the following
only with appropriate account permissions. No Kubernetes or Terraform installation
is required:

```sh
pnpm --filter @workspace/scripts dash0 verify
pnpm --filter @workspace/scripts dash0 apply
```

`verify` queries real stored traces, logs and metrics; `apply` idempotently creates
the development dashboard and **disabled** rules. It only manages origins prefixed
with `kodiboxa-development-`. Nothing is deployed to production.

- **Server errors:** 5xx ratio above 5%, with at least 20 requests in five minutes.
- **Slow requests:** p95 greater than three times the measured fresh baseline,
  with a minimum threshold of one second and the same traffic guard.
- **Missing telemetry:** no request metric data for five minutes. Intentional
  development shutdowns can trigger this rule.

All rules evaluate every minute, require three minutes of sustained failure,
and require two minutes of recovery. These are initial development safeguards,
not production SLOs.

After the owner confirms the existing email channel and fresh baseline:

```sh
pnpm --filter @workspace/scripts dash0 enable
pnpm --filter @workspace/scripts dash0 test
```

Enabling fails unless exactly one existing email channel can be selected. The
recipient is not inferred from the application administrator. The test creates
one clearly labelled, time-bounded verification rule. Its expression automatically
stops firing after three minutes and resolves on the next one-minute evaluation,
without changing event/video/payment behavior. An API
success proves rule configuration, not mailbox delivery: confirm receipt of both
the alert and recovery. Do not repeat the test to compensate for an unverified
delivery channel.

## Live-session diagnostics

Participants, presenters and observers can opt in with **Share technical connection
diagnostics** before or during a live session. Consent defaults to off, resets on
account/session change, and turning it off stops future reports. The control
explicitly excludes media, caption text, device names and participant details.

The generated API contract accepts only a fixed event/source, explicit consent,
and a bounded optional duration. Extra keys are rejected. The backend requires
sign-in and the same live-session/paid-registration access as video, derives the
effective role itself and limits each account to 30 events/minute. Session and
user IDs are used only for access/rate-limit checks, not exported. The reporting
failure notice does not disconnect media.

Client events are labelled `client_reported`; they are not authoritative attendance
or attention. They measure connection/reconnect, camera/microphone/screen-share
failure categories and caption start/display/translation failure categories.
They do not measure speech recognition correctness.

## Technical operation tracing and Agent0

Request, registration, room-reservation/attendance, database transaction, checkout,
Stripe checkout creation, payment settlement and video-token operations use
bounded names. Child spans and technical error logs share trace context through
server-local async context; no exception messages, SQL, payment values, customer
details or provider payloads are exported. Operation counters count attempts,
including idempotent retries, not unique payments or participants.

The runtime adds the public repository URL and a service version. Set the
non-secret `KODIBOXA_SOURCE_REVISION` to the actual deployed 40-character Git
revision when release metadata is available. Otherwise the resource honestly
reports `development-unreleased` or `unversioned`; it does not invent a commit.

```sh
pnpm --filter @workspace/scripts dash0 agent0
```

This provisions the **kodiboxa-investigation-only** custom skill from
`docs/observability/agent0/SKILL.md`. It does not create an automation or change
connector permissions. The owner must verify interactive access to the intended
repository in Agent0. Instructions are not a hard tool-permission boundary:
keep connector restrictions appropriate, and require explicit human approval
before any code/operations changes. No automatic fixes, merges, production
restarts or deployments are authorized.

## Focused local checks

The policy test verifies endpoint restrictions and delivery-state behavior.
The collector test uses a local test-only collector and proves the installed SDK
exports all three OTLP signals without forwarding sensitive request fields.
Neither test proves delivery to a real Dash0 account.
