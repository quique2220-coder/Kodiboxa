import assert from "node:assert/strict";
import { dash0Configuration, deliveryDescription, technicalRequest, type Delivery } from "../src/lib/telemetry-policy";

const config = dash0Configuration("https://ingress.eu-west-1.aws.dash0.com/v1/traces", "Bearer example-token");
assert.equal(config.baseUrl, "https://ingress.eu-west-1.aws.dash0.com");
assert.equal(config.headers.Authorization, "Bearer example-token");
for (const endpoint of [
  "http://ingress.eu-west-1.aws.dash0.com",
  "https://app.dash0.com", "https://ingress.evil.example",
  "https://ingress.eu-west-1.aws.dash0.com.evil.example",
  "https://ingress.eu-west-1.aws.dash0.com:4317",
  "https://user:password@ingress.eu-west-1.aws.dash0.com",
  "https://ingress.eu-west-1.aws.dash0.com?token=private",
  "https://ingress.eu-west-1.aws.dash0.com/private",
]) {
  assert.throws(() => dash0Configuration(endpoint, "example-token"), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(endpoint), "error must not disclose configuration");
    return true;
  });
}
assert.throws(() => dash0Configuration(undefined, undefined), /server Secrets/);
assert.throws(() => dash0Configuration(config.baseUrl, "example\nsecret"), /format/);

assert.deepEqual(technicalRequest("GET", "/sessions/:id/live/captions", 200), {
  "http.request.method": "GET",
  "http.route": "/api/sessions/:id/live/captions",
  "http.response.status_code": 200,
});
assert.equal(technicalRequest("GET", undefined, 404)["http.route"], "/api/unmatched");
assert.equal(technicalRequest("SECRET_VALUE", "/api/workspace", 200)["http.request.method"], "_OTHER");
assert.equal(technicalRequest("GET", undefined, Number.NaN)["http.response.status_code"], 500);
assert.equal(Object.keys(technicalRequest("POST", "/commands", 500)).length, 3);
const never: Delivery = { accepted: 0, failed: 0, lastAccepted: null, lastFailed: null };
const okay: Delivery = { accepted: 1, failed: 0, lastAccepted: 10000, lastFailed: null };
assert.equal(deliveryDescription({ traces: never, metrics: never, logs: never }, 10000).status, "planned");
assert.equal(deliveryDescription({ traces: okay, metrics: okay, logs: okay }, 10000).status, "connected");
assert.equal(deliveryDescription({ traces: okay, metrics: okay, logs: okay }, 150000).status, "unavailable");
assert.equal(deliveryDescription({ traces: okay, metrics: { ...okay, lastFailed: 11000 }, logs: okay }, 12000).status, "unavailable");
assert.equal(deliveryDescription({ traces: okay, metrics: { ...okay, failed: 1, lastFailed: 9000 }, logs: okay }, 12000).status, "connected");
console.log("PASS: Dash0 endpoint restrictions, safe request metadata and truthful delivery/recovery states.");
