import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config";
import authRouter from "./routes/auth";
import facilitiesRouter from "./routes/facilities";
import staffRouter from "./routes/staff";
import shiftsRouter from "./routes/shifts";
import aiRouter from "./routes/ai";
import swapRequestsRouter from "./routes/swapRequests";
import timeOffRouter from "./routes/timeOff";
import notificationsRouter from "./routes/notifications";
import announcementsRouter from "./routes/announcements";
import requirementsRouter from "./routes/requirements";
import superRouter from "./routes/super";
import shiftConfigRouter from "./routes/shiftConfig";
import overtimeConfigRouter from "./routes/overtimeConfig";

// Captured once at process start, so /api/version reflects the running deploy.
const STARTED_AT = new Date().toISOString();

export function createApp() {
  const app = express();

  // Behind Railway's proxy: trust the first proxy hop so express-rate-limit
  // and req.ip see the real client IP (X-Forwarded-For) rather than the proxy's.
  // Required for rate limiting to key on the actual caller (express-rate-limit v8
  // also validates this). "1" = trust exactly one hop, not an open trust.
  app.set("trust proxy", 1);

  // Standard security headers (HSTS, X-Content-Type-Options, frameguard, etc.).
  app.use(helmet());

  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Reports what is actually running, so a stale/frozen deploy is obvious at a glance.
  // Railway injects RAILWAY_GIT_COMMIT_SHA at runtime; falls back to other common vars.
  app.get("/api/version", (_req, res) => {
    const sha =
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.SOURCE_VERSION ??
      null;
    res.json({
      commit: sha,
      commitShort: sha ? sha.slice(0, 7) : null,
      branch: process.env.RAILWAY_GIT_BRANCH ?? null,
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
      startedAt: STARTED_AT,
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/facilities", facilitiesRouter);
  app.use("/api", staffRouter);
  app.use("/api", shiftsRouter);
  app.use("/api", aiRouter);
  app.use("/api", swapRequestsRouter);
  app.use("/api", timeOffRouter);
  app.use("/api", notificationsRouter);
  app.use("/api", announcementsRouter);
  app.use("/api", requirementsRouter);
  app.use("/api", superRouter);
  app.use("/api", shiftConfigRouter);
  app.use("/api", overtimeConfigRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[unhandled]", err);
    res.status(500).json({ success: false, data: null, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  });

  return app;
}
