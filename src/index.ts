import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { createApp } from "./app";
import { config } from "./config";
import { findUserById } from "./db/users";
import { setIo } from "./socket";
import type { UserRole } from "./types";

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: config.frontendUrl,
    credentials: true,
  },
});

setIo(io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error("Authentication required"));
    return;
  }
  next();
});

io.on("connection", async (socket) => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { userId: string; role: UserRole };
      const user = await findUserById(payload.userId);
      if (user && user.status === "active") {
        void socket.join(`user:${user.userId}`);
        if (user.facilityId) {
          void socket.join(`facility:${user.facilityId}`);
        }
        console.log(`WebSocket: ${user.email} joined user:${user.userId} + facility:${user.facilityId}`);
      }
    } catch {
      // Invalid token — socket still connects but joins no rooms
    }
  }

  socket.on("disconnect", () => {
    console.log(`WebSocket disconnected: ${socket.id}`);
  });
});

httpServer.listen(config.port, () => {
  console.log(`MedSchedule API running on http://localhost:${config.port}/api`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
});
