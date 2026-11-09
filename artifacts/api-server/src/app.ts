import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { ZodError } from "zod";
import { getStripeSync } from "./lib/stripeClient";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: false }));
// Stripe signatures require the unmodified body, before JSON and Clerk.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: "Invalid webhook signature or body" }); return; }
  try {
    await (await getStripeSync()).processWebhook(req.body, signature);
    res.json({ received: true });
  } catch {
    res.status(400).json({ error: "Webhook verification or processing failed" });
  }
});
// A valid multi-room agenda can exceed the small default JSON limit.
app.use("/api/commands", express.json({ limit: "1mb" }));
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));
// Attendees may share the venue's Wi-Fi address; isolate authenticated quotas.
app.use("/api/commands", rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: req => getAuth(req).userId ? `user:${getAuth(req).userId}` : ipKeyGenerator(req.ip || ""),
}));
app.use("/api/ticket-checkout", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/storage/uploads", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(["/api/crm", "/api/communication-preferences"], rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
  skip: req => req.method === "GET" || req.method === "HEAD",
  keyGenerator: req => getAuth(req).userId ? `user:${getAuth(req).userId}` : ipKeyGenerator(req.ip || ""),
}));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.get("origin");
    const host = req.get("x-forwarded-host") ?? req.get("host");
    if (origin && new URL(origin).host !== host) {
      res.status(403).json({ error: "Cross-origin writes are not allowed" });
      return;
    }
  }
  next();
});

app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) { res.status(400).json({ error: "Invalid input", details: err.issues }); return; }
  const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: err instanceof Error ? err.message : "Invalid request" });
    return;
  }
  req.log.error({ err }, "Request failed");
  res.status(500).json({ error: "The request could not be completed. Please try again." });
});

export default app;
