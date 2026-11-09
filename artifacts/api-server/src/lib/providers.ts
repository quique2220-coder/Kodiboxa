/**
 * Capability contracts for Phase 3. None of these providers is configured.
 * Media permission decisions remain server-side and presenter consent is
 * mandatory for remote slide control. Microphone activation is never remote.
 */
export type ProviderStatus = "connected" | "unavailable" | "planned";
export interface VideoProvider {
  readonly name: "livekit" | "jitsi";
  status(): Promise<ProviderStatus>;
  createRoom(sessionId: string): Promise<{ roomId: string }>;
  joinSession(input: { sessionId: string; userId: string; role: "presenter" | "participant"; publishMediaConsent: boolean }): Promise<{ joinUrl: string; expiresAt: string }>;
  leaveSession(sessionId: string, userId: string): Promise<void>;
}
export interface TranslationProvider {
  readonly status: ProviderStatus;
  transcribe(audio: Uint8Array, consentId: string): Promise<{ text: string; language: string; latencyMs: number }>;
  translate(text: string, from: string, to: string): Promise<{ text: string; latencyMs: number }>;
  synthesize(text: string, language: string, participantId: string): Promise<Uint8Array>;
}
export interface LocalInferenceProvider {
  readonly provider: "ollama";
  readonly status: ProviderStatus;
  // Connection configuration must only reference secrets, never return them.
  // An authenticated HTTPS gateway or secure private network is required.
  generate(input: { agentId: string; prompt: string; evidence: string[] }): Promise<{ text: string; model: string; latencyMs: number }>;
}
export interface PrivateCommunicationProvider {
  readonly provider: "simplex";
  readonly status: ProviderStatus;
  sendAuthorizedMessage(input: { senderId: string; presenterId: string; sessionId: string; text: string }): Promise<{ messageId: string }>;
}
export interface MeetingAutomationProvider {
  schedule(input: { eventId: string; calendarId: string }): Promise<{ externalId: string }>;
  summarize(input: { transcriptId: string; consentId: string }): Promise<{ summary: string; decisions: string[]; actionItems: string[] }>;
}
export type AgentAction = "RESET_DEMO_DELAY";
// Model-generated text is evidence only. It must never become commands.
export const allowedAgentActions: readonly AgentAction[] = ["RESET_DEMO_DELAY"];
