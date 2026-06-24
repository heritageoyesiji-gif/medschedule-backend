import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { findUserById } from "../db/users";
import { sendError } from "../utils/response";
import type { UserRole } from "../types";

export type AuthPayload = {
  userId: string;
  role: UserRole;
  facilityId: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    const user = await findUserById(payload.userId);
    if (!user || user.status !== "active") {
      sendError(res, 401, "UNAUTHORIZED", "Invalid or inactive account");
      return;
    }
    req.auth = { userId: user.userId, role: user.role, facilityId: user.facilityId };
    next();
  } catch {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    if (!roles.includes(req.auth.role)) {
      sendError(res, 403, "FORBIDDEN", "You do not have permission for this action");
      return;
    }
    next();
  };
}
