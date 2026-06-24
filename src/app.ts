import express from "express";
import cors from "cors";
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

export function createApp() {
  const app = express();

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

  return app;
}
