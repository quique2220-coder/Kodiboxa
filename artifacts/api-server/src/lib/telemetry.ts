import type { RequestHandler } from "express";
import { SpanKind, SpanStatusCode, SeverityNumber } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, SamplingDecision, TraceIdRatioBasedSampler, TracerProvider, type Sampler } from "@opentelemetry/sdk-trace";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { logger } from "./logger";
import { dash0Configuration, deliveryDescription, technicalRequest, type Delivery, type Signal } from "./telemetry-policy";

const delivery: Record<Signal, Delivery> = {
  traces: { accepted: 0, failed: 0, lastAccepted: null, lastFailed: null },
  metrics: { accepted: 0, failed: 0, lastAccepted: null, lastFailed: null },
  logs: { accepted: 0, failed: 0, lastAccepted: null, lastFailed: null },
};
let setupError: string | null = null;
let started = false;
let runtime: ReturnType<typeof createTelemetryRuntime> | null = null;

// Capture only exporter result codes, never provider error text, endpoints or headers.
function monitorExporter<T>(exporter: T, signal: Signal): T {
  const wrapped = exporter as T & {
    export(data: unknown, callback: (result: { code: number }) => void): void;
  };
  const send = wrapped.export.bind(wrapped);
  wrapped.export = (data, callback) => {
    send(data, result => {
      const state = delivery[signal];
      if (result.code === 0) {
        state.accepted++; state.lastAccepted = Date.now();
      } else {
        state.failed++; state.lastFailed = Date.now();
        // Do not emit this warning back into the same failing exporter.
        if (state.failed === 1 || state.failed % 10 === 0) {
          logger.warn({ signal, failedBatches: state.failed }, "Dash0 export failed; monitoring is degraded");
        }
      }
      callback(result);
    });
  };
  return exporter;
}

// Exported for local collector tests; production callers validate config first.
export function createTelemetryRuntime(config: ReturnType<typeof dash0Configuration>, sampleRatio = 0.1) {
  const resource = resourceFromAttributes({
    "service.name": "kodiboxa-api",
    "service.namespace": "kodiboxa",
    "deployment.environment.name": process.env.NODE_ENV === "production" ? "production" : "development",
  });
  const options = (signal: Signal) => ({
    url: `${config.baseUrl}/v1/${signal}`, headers: config.headers,
    timeoutMillis: 5000, concurrencyLimit: 1,
  });
  const ratio = new TraceIdRatioBasedSampler(sampleRatio);
  const sampler: Sampler = {
    shouldSample: (...args) => args[4]["kodiboxa.telemetry.probe"] === true
      ? { decision: SamplingDecision.RECORD_AND_SAMPLED }
      : ratio.shouldSample(args[0], args[1]),
    toString: () => "KODIBOXA 10% request traces; explicit connection probes always sampled",
  };
  const traces = new TracerProvider({
    resource, sampler,
    spanLimits: { attributeCountLimit: 12, attributeValueLengthLimit: 200 },
    spanProcessors: [new BatchSpanProcessor({
      exporter: monitorExporter(new OTLPTraceExporter(options("traces")), "traces"),
      scheduledDelayMillis: 5000, exportTimeoutMillis: 6000,
      maxQueueSize: 512, maxExportBatchSize: 64,
    })],
  });
  const metrics = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({
      exporter: monitorExporter(new OTLPMetricExporter(options("metrics")), "metrics"),
      exportIntervalMillis: 30_000, exportTimeoutMillis: 6000,
    })],
  });
  const logs = new LoggerProvider({
    resource,
    logRecordLimits: { attributeCountLimit: 12, attributeValueLengthLimit: 200 },
    processors: [new BatchLogRecordProcessor({
      exporter: monitorExporter(new OTLPLogExporter(options("logs")), "logs"),
      scheduledDelayMillis: 5000, exportTimeoutMillis: 6000,
      maxQueueSize: 128, maxExportBatchSize: 32,
    })],
  });
  const tracer = traces.getTracer("kodiboxa.http");
  const meter = metrics.getMeter("kodiboxa.http");
  const technicalLogs = logs.getLogger("kodiboxa.http");
  const requests = meter.createCounter("kodiboxa_http_requests_total", { description: "Completed API requests, including unsampled requests." });
  const duration = meter.createHistogram("kodiboxa_http_request_duration_seconds", { unit: "s", description: "API request duration." });
  const heartbeats = meter.createCounter("kodiboxa_telemetry_heartbeat_total", { description: "Monitoring connection verification probes." });
  let logWindow = 0;
  let logCount = 0;

  function probe() {
    const span = tracer.startSpan("telemetry.connection.verify", { attributes: { "kodiboxa.telemetry.probe": true } });
    span.end();
    heartbeats.add(1);
    technicalLogs.emit({
      severityNumber: SeverityNumber.INFO, severityText: "INFO",
      body: "telemetry.connection.verify",
      attributes: { "kodiboxa.telemetry.probe": true },
    });
  }
  async function flush() {
    // Never let a telemetry failure reject an application request or shutdown path.
    await Promise.allSettled([traces.forceFlush(), metrics.forceFlush(), logs.forceFlush()]);
  }
  const observe: RequestHandler = (req, res, next) => {
    const startedAt = performance.now();
    const span = tracer.startSpan("HTTP request", { kind: SpanKind.SERVER });
    let complete = false;
    const finish = (aborted: boolean) => {
      if (complete) return;
      complete = true;
      const attrs = technicalRequest(req.method, req.route?.path, aborted ? 499 : res.statusCode);
      const seconds = Math.max(0, performance.now() - startedAt) / 1000;
      span.updateName(`${attrs["http.request.method"]} ${attrs["http.route"]}`);
      span.setAttributes(attrs);
      if (attrs["http.response.status_code"] >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      requests.add(1, attrs); duration.record(seconds, attrs);
      // Deliberately do not forward Pino logs or exception messages/stack traces.
      if (attrs["http.response.status_code"] >= 500) {
        const window = Math.floor(Date.now() / 60_000);
        if (window !== logWindow) { logWindow = window; logCount = 0; }
        if (logCount++ < 20) technicalLogs.emit({
          severityNumber: SeverityNumber.ERROR, severityText: "ERROR",
          body: "http.server.error", attributes: attrs,
        });
      }
    };
    res.once("finish", () => finish(false));
    res.once("close", () => finish(!res.writableFinished));
    next();
  };
  return {
    observe, probe, flush,
    shutdown: async () => {
      await flush();
      await Promise.allSettled([traces.shutdown(), metrics.shutdown(), logs.shutdown()]);
    },
  };
}

export function initializeTelemetry() {
  if (started) return;
  started = true;
  try {
    runtime = createTelemetryRuntime(dash0Configuration(
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.DASH0_OTLP_HTTP_ENDPOINT,
      process.env.DASH0_AUTH_TOKEN,
    ));
    runtime.probe();
    void runtime.flush().then(() => logger.info({
      signals: Object.fromEntries(Object.entries(delivery).map(([signal, state]) => [signal, state.accepted > 0])),
    }, "Dash0 initial delivery verification finished"));
  } catch (error) {
    // Configuration errors are deliberately constructed without supplied values.
    setupError = error instanceof Error && /^(Add DASH0_|Dash0 requires|Use the Dash0|The Dash0 ingestion)/.test(error.message)
      ? error.message : "Dash0 could not initialize. Check the server configuration.";
    logger.warn({ reason: setupError }, "Monitoring is unavailable; API operation is unchanged");
  }
}

export const observeApiRequests: RequestHandler = (req, res, next) =>
  runtime ? runtime.observe(req, res, next) : next();

export function telemetryIntegration() {
  return {
    id: "dash0", name: "Dash0",
    ...(setupError ? { status: "unavailable", description: setupError } : !started
      ? { status: "planned", description: "Dash0 monitoring has not started." }
      : deliveryDescription(delivery)),
  };
}

export function telemetryDelivery() {
  return Object.fromEntries(Object.entries(delivery).map(([signal, state]) => [signal, { ...state }]));
}
export async function shutdownTelemetry() { await runtime?.shutdown(); }
