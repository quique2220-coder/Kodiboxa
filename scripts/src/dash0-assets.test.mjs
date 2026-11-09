import assert from "node:assert/strict";
import { monitoringAssets, queries } from "./dash0-assets.mjs";

const draft = monitoringAssets();
assert.equal(draft.dashboard.kind, "Dashboard");
assert.equal(draft.dashboard.metadata.dash0Extensions.dataset, "default");
assert.ok(Object.keys(draft.dashboard.spec.panels).length >= 8);
assert.equal(draft.rules.length, 3);
for (const rule of draft.rules) {
  assert.equal(rule.enabled, false);
  assert.equal(rule.dataset, "default");
  assert.ok(rule.expression.includes('deployment_environment_name="development"'));
  assert.ok(!rule.annotations["dash0.com/notification-channel-ids"]);
}
const enabled = monitoringAssets({ enabled: true, channelId: "TEST_ONLY_CHANNEL", latencySeconds: 1.5 });
for (const rule of enabled.rules) {
  assert.equal(rule.enabled, true);
  assert.equal(rule.annotations["dash0.com/notification-channel-ids"], "TEST_ONLY_CHANNEL");
}
assert.match(enabled.rules[0].expression, />= 20/);
assert.match(enabled.rules[1].expression, /> 1.5/);
assert.match(queries.missing, /absent_over_time/);
assert.ok(queries.p95.includes("sum by(service_name)"), "Dash0 histogram aggregation must retain a resource grouping");
assert.ok(!queries.missing.includes("heartbeat"), "startup probe is not a continuous heartbeat");
console.log("PASS: environment-scoped monitoring assets, traffic guards, draft defaults and explicit channel binding.");
