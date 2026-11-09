import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateLiveKitSessionTokenParams,
  CreateLiveKitSessionTokenResponse,
  GetLiveKitSessionParticipantsParams,
  GetLiveKitSessionParticipantsResponse,
  GetLiveKitStatusResponse,
  StartSessionCaptionsBody,
  PublishSessionCaptionBody,
  StopSessionCaptionsBody,
  HeartbeatSessionCaptionsBody,
  StartSessionCaptionsResponse,
  GetSessionCaptionsResponse,
  PublishSessionCaptionResponse,
} from "@workspace/api-zod";
import { rateLimit } from "express-rate-limit";
import { captionAccess, startCaptions, publishCaption, recentCaptions, releaseCaptions, renewCaptions } from "../lib/captions";
import { currentUser } from "../lib/auth";
import {
  createSessionToken,
  getLiveKitStatus,
  LiveKitRequestError,
  readLiveKitSessionParticipants,
} from "../lib/livekit";

const router: IRouter = Router();

// Limits are per authenticated presenter, not per venue IP.
router.use("/sessions/:id/captions", async (req, res, next) => {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Sign in to use session captions." }); return; }
  res.locals.captionUser = user;
  next();
});
const captionLimit = rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (_req, res) => res.locals.captionUser.id,
  skip: req => req.method === "GET",
});
const captionStartLimit = rateLimit({
  windowMs: 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (_req, res) => res.locals.captionUser.id,
});
router.get("/sessions/:id/captions", async (req, res) => {
  try {
    res.json(GetSessionCaptionsResponse.parse(await recentCaptions(String(req.params.id), res.locals.captionUser)));
  } catch (error) { reportCaptionError(error, req, res); }
});
router.post("/sessions/:id/captions/start", captionStartLimit, async (req, res) => {
  const input = StartSessionCaptionsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Choose English or Spanish and explicitly consent to sharing your audio for captions." }); return; }
  try {
    res.json(StartSessionCaptionsResponse.parse(await startCaptions(String(req.params.id), res.locals.captionUser, input.data.sourceLanguage)));
  } catch (error) { reportCaptionError(error, req, res); }
});
router.post("/sessions/:id/captions", captionLimit, async (req, res) => {
  const input = PublishSessionCaptionBody.safeParse(req.body);
  if (!input.success || !input.data.text.trim()) { res.status(400).json({ error: "A valid caption segment is required." }); return; }
  try {
    res.json(PublishSessionCaptionResponse.parse(await publishCaption(String(req.params.id), res.locals.captionUser, input.data)));
  } catch (error) { reportCaptionError(error, req, res); }
});
router.post("/sessions/:id/captions/heartbeat", captionLimit, async (req, res) => {
  const input = HeartbeatSessionCaptionsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid caption lease." }); return; }
  try {
    await captionAccess(String(req.params.id), res.locals.captionUser, true);
    renewCaptions(String(req.params.id), res.locals.captionUser.id, input.data.leaseId);
    res.sendStatus(204);
  } catch (error) { reportCaptionError(error, req, res); }
});
router.post("/sessions/:id/captions/stop", async (req, res) => {
  const input = StopSessionCaptionsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid caption lease." }); return; }
  // Safe after leaving, muting, assignment change or session end; revokes only caller's lease.
  releaseCaptions(String(req.params.id), res.locals.captionUser.id, input.data.leaseId);
  res.sendStatus(204);
});
function reportCaptionError(error: unknown, req: Request, res: Response) {
  if (error instanceof LiveKitRequestError) { res.status(error.status).json({ error: error.message }); return; }
  req.log.warn("Caption provider request failed"); // Never log transcripts or temporary tokens.
  res.status(503).json({ error: "Live captions are temporarily unavailable. Check the speech integration and try again." });
}

function reportLiveKitError(error: unknown, req: Request, res: Response, sessionId?: string) {
  if (error instanceof LiveKitRequestError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.warn({ sessionId }, "LiveKit service request failed");
  res.status(503).json({ error: "LiveKit is temporarily unavailable. Check the configured LiveKit server." });
}

router.get("/livekit/status", (_req, res): void => {
  res.json(GetLiveKitStatusResponse.parse(getLiveKitStatus()));
});

router.post("/sessions/:id/livekit/token", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to join this live session." });
    return;
  }
  const parsed = CreateLiveKitSessionTokenParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "The session ID is invalid." });
    return;
  }
  try {
    res.json(CreateLiveKitSessionTokenResponse.parse(await createSessionToken(parsed.data.id, user)));
  } catch (error) {
    reportLiveKitError(error, req, res, parsed.data.id);
  }
});

router.get("/sessions/:id/livekit/participants", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to monitor this session." });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required to monitor live participants." });
    return;
  }
  const parsed = GetLiveKitSessionParticipantsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "The session ID is invalid." });
    return;
  }
  try {
    res.json(GetLiveKitSessionParticipantsResponse.parse(await readLiveKitSessionParticipants(parsed.data.id)));
  } catch (error) {
    reportLiveKitError(error, req, res, parsed.data.id);
  }
});

export default router;
