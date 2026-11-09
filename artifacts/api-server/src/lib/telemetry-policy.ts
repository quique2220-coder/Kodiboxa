export type Signal = "traces" | "metrics" | "logs";
export type Delivery = { accepted: number; failed: number; lastAccepted: number | null; lastFailed: number | null };

export function dash0Configuration(endpoint?: string, token?: string) {
  if (!endpoint?.trim() || !token?.trim()) {
    throw new Error("Add DASH0_OTLP_HTTP_ENDPOINT and DASH0_AUTH_TOKEN in server Secrets.");
  }
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch {
    throw new Error("Dash0 requires an HTTPS OTLP/HTTP endpoint, not a dashboard URL or gRPC address.");
  }
  if (url.protocol !== "https:" || !url.hostname.startsWith("ingress.") ||
    !url.hostname.endsWith(".dash0.com") || url.username || url.password ||
    url.search || url.hash || (url.port && url.port !== "443") ||
    !/^\/(?:v1\/(?:traces|metrics|logs)\/?)?$/.test(url.pathname)) {
    throw new Error("Use the Dash0 ingress HTTPS OTLP/HTTP endpoint on port 443. Dashboard and gRPC endpoints are not supported.");
  }
  const authToken = token.trim().replace(/^Bearer\s+/i, "");
  if (!authToken || /\s/.test(authToken)) throw new Error("The Dash0 ingestion token format is invalid.");
  if (!authToken.startsWith("auth_")) {
    throw new Error("The Dash0 ingestion token must be the complete Auth Token value, including its auth_ prefix. Do not add the prefix to an incomplete value; copy the complete secret from Dash0.");
  }
  return {
    baseUrl: url.origin,
    headers: { Authorization: `Bearer ${authToken}`, "Dash0-Dataset": "default" },
  };
}

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
export function technicalRequest(method: string, route: unknown, status: number) {
  // Only Express's declared route pattern is accepted, never req.url/path/params.
  const pattern = typeof route === "string" && route.startsWith("/") && route.length <= 180
    ? route.startsWith("/api/") ? route : `/api${route}`
    : "/api/unmatched";
  return {
    "http.request.method": methods.has(method) ? method : "_OTHER",
    "http.route": pattern,
    "http.response.status_code": Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500,
  };
}

export function deliveryDescription(delivery: Record<Signal, Delivery>, now = Date.now()) {
  const all = Object.values(delivery);
  if (all.some(signal => signal.lastFailed !== null &&
    (signal.lastAccepted === null || signal.lastFailed >= signal.lastAccepted))) {
    return { status: "unavailable", description: "Dash0 export failed. Check server Secrets, token ingestion permissions and network access. Event operations remain available." };
  }
  if (all.some(signal => signal.lastAccepted === null)) {
    return { status: "planned", description: "Dash0 is configured; waiting for traces, metrics and technical logs to be accepted." };
  }
  const accepted = delivery.metrics.lastAccepted!;
  if (now - accepted > 120_000) {
    return { status: "unavailable", description: "No recent metric delivery acknowledgement from Dash0. Check the server connection." };
  }
  return {
    status: "connected",
    description: `Dash0 accepted traces, metrics and technical logs. Latest metric acknowledgement: ${new Date(accepted).toISOString()}. Monitoring only; automatic fixes are disabled.`,
  };
}
