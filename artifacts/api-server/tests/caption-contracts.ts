import assert from "node:assert/strict";
import {
  StartSessionCaptionsBody, PublishSessionCaptionBody, StopSessionCaptionsBody,
  HeartbeatSessionCaptionsBody, GetSessionCaptionsResponse, PublishSessionCaptionResponse,
} from "@workspace/api-zod";
import { canPresentLiveKitSession } from "../src/lib/livekit";
import { oppositeLanguage, releaseCaptions, renewCaptions } from "../src/lib/captions";

assert.equal(oppositeLanguage("en"), "es");
assert.equal(oppositeLanguage("es"), "en");
for (const sourceLanguage of ["en", "es"]) {
  assert.ok(StartSessionCaptionsBody.safeParse({ sourceLanguage, consent: true }).success);
}
for (const input of [
  { sourceLanguage: "en", consent: false }, { sourceLanguage: "es" },
  { sourceLanguage: "asl", consent: true }, { sourceLanguage: "fr", consent: true },
]) assert.equal(StartSessionCaptionsBody.safeParse(input).success, false);
assert.equal(canPresentLiveKitSession("host", { id: "host", role: "admin" }), true);
assert.equal(canPresentLiveKitSession("host", { id: "observer", role: "admin" }), false);
assert.equal(canPresentLiveKitSession("host", { id: "host", role: "participant" }), false);
assert.equal(PublishSessionCaptionBody.safeParse({ leaseId: "lease", segmentId: "id", text: "Hello." }).success, true);
assert.equal(PublishSessionCaptionBody.safeParse({ leaseId: "", segmentId: "id", text: "Hello." }).success, false);
assert.equal(PublishSessionCaptionBody.safeParse({ leaseId: "lease", segmentId: "id", text: "a".repeat(2001) }).success, false);
assert.equal(StopSessionCaptionsBody.safeParse({}).success, false);
assert.equal(HeartbeatSessionCaptionsBody.safeParse({ leaseId: "" }).success, false);
assert.throws(() => renewCaptions("test-nonexistent-room", "test-user", "unknown"), /expired or was stopped/);
assert.doesNotThrow(() => releaseCaptions("test-nonexistent-room", "test-user", "unknown"));
const caption = {
  id: "lease:segment", text: "Welcome.", translation: "Bienvenidos.",
  sourceLanguage: "en", targetLanguage: "es", speakerName: "Presenter",
  createdAt: new Date().toISOString(), translationStatus: "ready",
};
assert.ok(PublishSessionCaptionResponse.safeParse(caption).success);
assert.ok(GetSessionCaptionsResponse.safeParse({ captions: [caption], active: true, sourceLanguage: "en" }).success);
assert.equal(PublishSessionCaptionResponse.safeParse({ ...caption, translationStatus: "pretend-success" }).success, false);
process.stdout.write("Caption contracts, explicit consent, language bounds, role boundaries and lease rejection passed.\n");
