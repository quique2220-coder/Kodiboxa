import assert from "node:assert/strict";
import { TokenVerifier } from "livekit-server-sdk";
import { canPresentLiveKitSession, getLiveKitConfig, getLiveKitStatus, hasConfirmedLiveKitRegistration, signLiveKitSessionToken } from "../src/lib/livekit";

async function main() {
  // Test-only credentials; no provider connection or database mutation is needed.
  const config = getLiveKitConfig({
    LIVEKIT_URL: "wss://video.test.invalid",
    LIVEKIT_API_KEY: "test-only-livekit-key",
    LIVEKIT_API_SECRET: "test-only-not-a-real-livekit-secret",
  });
  assert.ok(config.configured);
  assert.equal(getLiveKitStatus({}).configured, false);
  assert.equal(getLiveKitStatus({ LIVEKIT_URL: "not-a-url" }).configured, false);
  assert.equal(canPresentLiveKitSession("assigned-user", { id: "assigned-user", role: "admin" }), true);
  assert.equal(canPresentLiveKitSession("assigned-user", { id: "assigned-user", role: "presenter" }), true);
  assert.equal(canPresentLiveKitSession("assigned-user", { id: "other-admin", role: "admin" }), false);
  assert.equal(canPresentLiveKitSession("assigned-user", { id: "other-presenter", role: "presenter" }), false);
  assert.equal(canPresentLiveKitSession("assigned-user", { id: "assigned-user", role: "participant" }), false);
  assert.equal(canPresentLiveKitSession(null, { id: "admin", role: "admin" }), false);
  for (const status of ["free", "paid", "PAID", "no_payment_required"]) {
    assert.equal(hasConfirmedLiveKitRegistration(status), true);
  }
  for (const status of ["pending", "unpaid", "refunded", "canceled", "", null, undefined]) {
    assert.equal(hasConfirmedLiveKitRegistration(status), false);
  }

  const verifier = new TokenVerifier(config.apiKey, config.apiSecret);
  for (const role of ["presenter", "participant", "admin"] as const) {
    const result = await signLiveKitSessionToken(config, "existing-session-id", `test-${role}`, `Test ${role}`, role);
    const claims = await verifier.verify(result.token);
    assert.equal(claims.sub, `test-${role}`);
    assert.equal(claims.video?.room, "existing-session-id");
    assert.equal(claims.video?.roomJoin, true);
    assert.equal(claims.video?.canPublish, role === "presenter" || role === "participant");
    assert.equal(claims.video?.canSubscribe, true);
    assert.equal(claims.video?.canPublishData, false);
    assert.ok(claims.exp! - (claims.iat ?? claims.nbf!) <= 905);
    assert.deepEqual(Object.keys(result).sort(), ["role", "token", "url"]);
    assert.deepEqual(
      claims.video?.canPublishSources,
      role === "presenter"
        ? ["camera", "microphone", "screen_share", "screen_share_audio"]
        : role === "participant" ? ["camera", "microphone"] : undefined,
      "Participants may publish only camera and microphone; only presenters may share screens; admin observers stay receive-only.",
    );
  }
  console.log("PASS: LiveKit signatures, assigned-admin presentation, confirmed-registration checks, participant camera/mic limits, presenter screen-sharing, observer restrictions, 15-minute expiry, and missing-configuration status.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
