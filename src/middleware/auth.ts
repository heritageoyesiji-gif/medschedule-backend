import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { findUserById } from "../db/users";
import { findFacilityById } from "../db/facilities";
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

// Returns true if the caller may access the given facility. Access is granted when:
//   - the facility is the caller's own facility (staff and single-facility admins), or
//   - the caller is an admin who owns the facility (multi-location admins, where
//     req.auth.facilityId is only their primary facility).
export async function callerCanAccessFacility(auth: AuthPayload, facilityId: string): Promise<boolean> {
  if (auth.facilityId === facilityId) return true;
  if (auth.role === "admin") {
    const facility = await findFacilityById(facilityId);
    if (facility && facility.adminUserId === auth.userId) return true;
  }
  return false;
}

// Enforces tenant isolation on any route with a :facilityId param.
// Without this, an authenticated admin could read/write another client's
// facility just by changing the ID in the URL (cross-tenant IDOR).
// Must run after requireAuth.
export async function requireFacilityAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }

  const facilityId = req.params.facilityId;
  if (!facilityId || typeof facilityId !== "string") {
    sendError(res, 400, "VALIDATION_ERROR", "facilityId is required");
    return;
  }

  if (await callerCanAccessFacility(req.auth, facilityId)) {
    next();
    return;
  }

  sendError(res, 403, "FORBIDDEN", "You do not have access to this facility");
}
