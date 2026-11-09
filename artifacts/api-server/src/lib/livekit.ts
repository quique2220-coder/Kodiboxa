import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { and, eq, inArray } from "drizzle-orm";
import { db, registrations, sessions, users } from "@workspace/db";
import { withTelemetryOperation } from "./telemetry";

type LiveKitEnvironment = {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
};
type LiveKitConfig = { configured: true; url: string; apiKey: string; apiSecret: string; setupMessage: string }
  | { configured: false; setupMessage: string };
type AppRole = "admin" | "presenter" | "participant";
type LiveKitTokenRole = "admin" | "presenter" | "participant";

const missingCredentialsMessage =
  "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to Replit Secrets, then restart the API Server workflow.";

export function getLiveKitConfig(env: LiveKitEnvironment = process.env): LiveKitConfig {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return { configured: false, setupMessage: missingCredentialsMessage };

  try {
    const parsed = new URL(url);
    if (!["wss:", "ws:"].includes(parsed.protocol) || !parsed.host || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      return {
        configured: false,
        setupMessage: "LIVEKIT_URL must be a valid LiveKit WebSocket URL (wss://...). Set it with LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Replit Secrets.",
      };
    }
    return { configured: true, url: parsed.origin.replace(/^http/, "ws"), apiKey, apiSecret, setupMessage: "LiveKit is configured for secure event sessions." };
  } catch {
    return {
      configured: false,
      setupMessage: "LIVEKIT_URL must be a valid LiveKit WebSocket URL (wss://...). Set it with LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Replit Secrets.",
    };
  }
}

export function getLiveKitStatus(env: LiveKitEnvironment = process.env) {
  const config = getLiveKitConfig(env);
  return { configured: config.configured, setupMessage: config.setupMessage };
}

export class LiveKitRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "LiveKitRequestError";
  }
}

export async function signLiveKitSessionToken(
  config: Extract<LiveKitConfig, { configured: true }>,
  sessionId: string,
  identity: string,
  displayName: string,
  role: LiveKitTokenRole,
) {
  const canPublish = role === "presenter" || role === "participant";
  const grant = {
    roomJoin: true,
    room: sessionId,
    canPublish,
    canSubscribe: true,
    canPublishData: false,
    ...(canPublish ? {
      canPublishSources: role === "presenter"
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [TrackSource.CAMERA, TrackSource.MICROPHONE],
    } : {}),
  };
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: displayName,
    ttl: "15m",
  });
  token.addGrant(grant);
  return { url: config.url, token: await token.toJwt(), role };
}

export function canPresentLiveKitSession(presenterId: string | null, user: { id: string; role: string }) {
  return presenterId === user.id && (user.role === "presenter" || user.role === "admin");
}

export function hasConfirmedLiveKitRegistration(paymentStatus?: string | null) {
  return ["free", "paid", "no_payment_required"].includes(paymentStatus?.toLowerCase() ?? "");
}

export async function authorizeLiveKitSession(sessionId: string, user: typeof users.$inferSelect) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw new LiveKitRequestError(404, "Session not found.");
  if (session.status !== "live") throw new LiveKitRequestError(409, "This session is not live.");

  const config = getLiveKitConfig();
  if (!config.configured) throw new LiveKitRequestError(503, config.setupMessage);

  let role: LiveKitTokenRole;
  if (canPresentLiveKitSession(session.presenterId, user)) {
    role = "presenter";
  } else if (user.role === "admin") {
    role = "admin";
  } else if (user.role === "participant") {
    const [registration] = await db.select({ paymentStatus: registrations.paymentStatus })
      .from(registrations)
      .where(and(eq(registrations.eventId, session.eventId), eq(registrations.userId, user.id)))
      .limit(1);
    if (!registration || !hasConfirmedLiveKitRegistration(registration.paymentStatus)) {
      throw new LiveKitRequestError(403, "A confirmed registration is required to join this session.");
    }
    role = "participant";
  } else {
    throw new LiveKitRequestError(403, "You do not have access to this session.");
  }

  return { session, config, role };
}

export async function createSessionToken(sessionId: string, user: typeof users.$inferSelect) {
  return withTelemetryOperation("video.issue_token", () => issueSessionToken(sessionId, user));
}
async function issueSessionToken(sessionId: string, user: typeof users.$inferSelect) {
  const { session, config, role } = await authorizeLiveKitSession(sessionId, user);
  return signLiveKitSessionToken(config, session.id, user.id, user.name, role);
}

export function liveKitApiUrl(webSocketUrl: string) {
  const parsed = new URL(webSocketUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  return parsed.origin;
}

function sourceIs(sources: string[], name: string, enumValue: number) {
  return sources.some((source) => source.includes(name) || source === String(enumValue));
}

export async function readLiveKitSessionParticipants(sessionId: string) {
  const [session] = await db.select({ id: sessions.id, status: sessions.status }).from(sessions)
    .where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw new LiveKitRequestError(404, "Session not found.");
  if (session.status !== "live") throw new LiveKitRequestError(409, "This session is not live.");

  const config = getLiveKitConfig();
  if (!config.configured) throw new LiveKitRequestError(503, config.setupMessage);

  const api = new RoomServiceClient(liveKitApiUrl(config.url), config.apiKey, config.apiSecret);
  const liveParticipants = await api.listParticipants(session.id);
  const identities = [...new Set(liveParticipants.map((participant) => participant.identity))];
  const appUsers = identities.length
    ? await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, identities))
    : [];
  const byIdentity = new Map(appUsers.map((user) => [user.id, user]));
  const participants = liveParticipants.map((participant) => {
    const sources = (participant.tracks ?? [])
      .filter((track) => !track.muted)
      .map((track) => String(track.source ?? "").toLowerCase());
    const user = byIdentity.get(participant.identity);
    return {
      identity: participant.identity,
      name: user?.name || participant.name || "LiveKit service",
      role: (user?.role === "admin" || user?.role === "presenter" || user?.role === "participant") ? user.role : "service" as const,
      joinedAt: Math.max(0, Math.floor(Number(participant.joinedAt ?? 0) * 1000)),
      cameraEnabled: sourceIs(sources, "camera", 1),
      microphoneEnabled: sourceIs(sources, "microphone", 2),
      screenSharing: sourceIs(sources, "screen_share", 3),
    };
  });
  return { sessionId: session.id, participantCount: participants.length, participants };
}
