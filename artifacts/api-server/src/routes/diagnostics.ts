import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { CreateSessionDiagnosticBody, CreateSessionDiagnosticParams } from "@workspace/api-zod";
import { currentUser } from "../lib/auth";
import { authorizeLiveKitSession, LiveKitRequestError } from "../lib/livekit";
import { recordSessionDiagnostic } from "../lib/telemetry";

const router: IRouter = Router();
const limit = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (_req, res) => res.locals.diagnosticUser.id,
});
router.post("/sessions/:id/diagnostics", async (req, res, next) => {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Sign in to send technical diagnostics." }); return; }
  res.locals.diagnosticUser = user;
  next();
}, limit, async (req, res) => {
  if (Number(req.headers["content-length"] || 0) > 1024 || JSON.stringify(req.body ?? {}).length > 1024) {
    res.status(413).json({ error: "Technical diagnostic is too large." }); return;
  }
  const params = CreateSessionDiagnosticParams.safeParse(req.params);
  const body = CreateSessionDiagnosticBody.strict().safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A consented, bounded technical event is required. Extra data is not accepted." }); return;
  }
  try {
    // Exactly the same live-session, role and paid-registration access as video.
    const access = await authorizeLiveKitSession(params.data.id, res.locals.diagnosticUser);
    if (!recordSessionDiagnostic(body.data, access.role)) {
      res.status(503).json({ error: "Technical monitoring is not configured." }); return;
    }
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof LiveKitRequestError) { res.status(error.status).json({ error: error.message }); return; }
    req.log.warn("Technical diagnostic could not be processed");
    res.status(503).json({ error: "Technical diagnostics are temporarily unavailable." });
  }
});
export default router;
