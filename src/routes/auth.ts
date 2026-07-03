import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import {
  consumeMagicLinkToken,
  consumeQrLoginToken,
  createMagicLinkToken,
  createQrLoginToken,
  createPasswordResetToken,
  consumePasswordResetToken,
  lookupStaffInvite,
  consumeStaffInvite,
} from "../db/tokens";
import { createUser, findUserByEmail, findUserById, rowToUser, updateUserPassword } from "../db/users";
import { findFacilityById } from "../db/facilities";
import {
  createStaffProfile,
  findStaffByEmailAndFacility,
  updateStaffProfile,
} from "../db/staff";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loginLimiter, magicLinkLimiter, signupLimiter, verifyLimiter } from "../middleware/rateLimit";
import { sendError, sendSuccess } from "../utils/response";
import { sendMagicLinkEmail, sendPasswordResetEmail } from "../utils/email";
import { emailSchema, nonEmptyString, userRoleSchema } from "../schemas";
import { z } from "zod";
import type { UserRole } from "../types";

const router = Router();

const signupSchema = z.object({
  email: emailSchema.optional(),
  password: z.string().min(1),
  firstName: nonEmptyString,
  lastName: nonEmptyString,
  role: userRoleSchema.optional(),
  facilityId: z.string().optional(),
  inviteToken: z.string().optional(),
});
const loginSchema = z.object({ email: nonEmptyString, password: z.string().min(1) });
const emailOnlySchema = z.object({ email: emailSchema });
const tokenOnlySchema = z.object({ token: nonEmptyString });
const resetPasswordSchema = z.object({ token: nonEmptyString, password: z.string().min(1) });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

function signJwt(userId: string, role: UserRole): string {
  return jwt.sign({ userId, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

async function loginPayload(userId: string) {
  const user = await findUserById(userId);
  if (!user || user.status !== "active") return null;
  const token = signJwt(user.userId, user.role);
  return { token, user: rowToUser(user) };
}

router.post("/signup", signupLimiter, validateBody(signupSchema), async (req, res) => {
  const { email: bodyEmail, password, firstName, lastName, role: bodyRole, facilityId: bodyFacilityId, inviteToken } =
    req.body as z.infer<typeof signupSchema>;

  if (password.length < 8) {
    sendError(res, 400, "WEAK_PASSWORD", "Password must be at least 8 characters");
    return;
  }

  let email: string;
  let role: UserRole;
  let resolvedFacilityId: string;

  if (inviteToken) {
    const invite = await consumeStaffInvite(inviteToken);
    if (!invite) {
      sendError(res, 401, "INVALID_INVITE", "Invite link is invalid or expired");
      return;
    }
    email = invite.email;
    role = "staff";
    resolvedFacilityId = invite.facilityId;
  } else {
    if (!bodyEmail || !bodyRole) {
      sendError(res, 400, "VALIDATION_ERROR", "Missing required fields");
      return;
    }
    email = bodyEmail;
    role = bodyRole;

    if (role === "staff" && !bodyFacilityId?.trim()) {
      sendError(res, 400, "INVALID_FACILITY", "Facility ID is required for staff accounts");
      return;
    }

    resolvedFacilityId = role === "staff" ? bodyFacilityId!.trim() : "";

    if (role === "staff") {
      const facility = await findFacilityById(resolvedFacilityId);
      if (!facility) {
        sendError(res, 404, "FACILITY_NOT_FOUND", "No facility found with that ID");
        return;
      }
    }
  }

  if (await findUserByEmail(email)) {
    sendError(res, 409, "EMAIL_TAKEN", "An account with this email already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = `usr_${uuidv4().slice(0, 8)}`;

  const user = await createUser({
    userId,
    firstName,
    lastName,
    email,
    passwordHash,
    role,
    facilityId: resolvedFacilityId,
  });

  if (role === "staff") {
    const allDaysAllShifts = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].reduce<Record<string, ("day" | "evening" | "night")[]>>(
      (acc, day) => ({ ...acc, [day]: ["day", "evening", "night"] }),
      {},
    );
    const existing = await findStaffByEmailAndFacility(email, resolvedFacilityId);
    if (existing) {
      await updateStaffProfile(existing.userId, { firstName, lastName });
    } else {
      await createStaffProfile({
        userId: user.userId,
        facilityId: resolvedFacilityId,
        firstName,
        lastName,
        email,
        availability: allDaysAllShifts,
      });
    }
  }

  const token = signJwt(user.userId, user.role);
  sendSuccess(res, { userId: user.userId, email: user.email, role: user.role, token }, 201);
});

router.get("/invite/:token", async (req, res) => {
  const { token } = req.params as { token: string };
  const invite = await lookupStaffInvite(token);
  if (!invite) {
    sendError(res, 401, "INVALID_INVITE", "Invite link is invalid or expired");
    return;
  }
  const facility = await findFacilityById(invite.facilityId);
  sendSuccess(res, {
    email: invite.email,
    facilityId: invite.facilityId,
    facilityName: facility?.name ?? "your facility",
  });
});

router.post("/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await findUserByEmail(email);
  if (!user) {
    sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    return;
  }

  if (user.status !== "active") {
    sendError(res, 403, "ACCOUNT_INACTIVE", "Your account has been deactivated");
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    return;
  }

  const result = await loginPayload(user.userId);
  if (!result) {
    sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    return;
  }

  sendSuccess(res, result);
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.auth!.userId);
  if (!user) {
    sendError(res, 401, "UNAUTHORIZED", "User not found");
    return;
  }
  sendSuccess(res, rowToUser(user));
});

router.post("/magic-link", magicLinkLimiter, validateBody(emailOnlySchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof emailOnlySchema>;

  const user = await findUserByEmail(email);
  if (user && user.status === "active") {
    const token = `mlnk_${uuidv4().replace(/-/g, "")}`;
    const expiresAt = new Date(
      Date.now() + config.magicLinkExpiresMinutes * 60 * 1000,
    ).toISOString();

    await createMagicLinkToken(user.userId, token, expiresAt);

    const loginUrl = `${config.frontendUrl}/auth/magic-link?token=${token}`;
    await sendMagicLinkEmail(user.email, loginUrl);
  }

  sendSuccess(res, { message: "Magic link sent to email" });
});

router.post("/magic-link/verify", verifyLimiter, validateBody(tokenOnlySchema), async (req, res) => {
  const { token } = req.body as z.infer<typeof tokenOnlySchema>;

  const userId = await consumeMagicLinkToken(token);
  if (!userId) {
    sendError(res, 401, "INVALID_TOKEN", "Magic link is invalid or expired");
    return;
  }

  const result = await loginPayload(userId);
  if (!result) {
    sendError(res, 401, "INVALID_TOKEN", "Magic link is invalid or expired");
    return;
  }

  sendSuccess(res, result);
});

router.post("/forgot-password", magicLinkLimiter, validateBody(emailOnlySchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof emailOnlySchema>;

  const user = await findUserByEmail(email);
  if (user && user.status === "active") {
    const token = `rst_${uuidv4().replace(/-/g, "")}`;
    const expiresAt = new Date(
      Date.now() + config.magicLinkExpiresMinutes * 60 * 1000,
    ).toISOString();

    await createPasswordResetToken(user.userId, token, expiresAt);

    const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  // Always return success to prevent email enumeration
  sendSuccess(res, { message: "If that email exists, a reset link has been sent" });
});

router.post("/reset-password", verifyLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;

  if (password.length < 8) {
    sendError(res, 400, "WEAK_PASSWORD", "Password must be at least 8 characters");
    return;
  }

  const userId = await consumePasswordResetToken(token);
  if (!userId) {
    sendError(res, 401, "INVALID_TOKEN", "Reset link is invalid or expired");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await updateUserPassword(userId, passwordHash);

  sendSuccess(res, { message: "Password updated successfully" });
});

// Change password for the logged-in user (any role) — verifies current password first.
router.post("/change-password", requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

  if (newPassword.length < 8) {
    sendError(res, 400, "WEAK_PASSWORD", "New password must be at least 8 characters");
    return;
  }

  const user = await findUserById(req.auth!.userId);
  if (!user) {
    sendError(res, 401, "UNAUTHORIZED", "User not found");
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    sendError(res, 401, "INVALID_CREDENTIALS", "Current password is incorrect");
    return;
  }

  if (currentPassword === newPassword) {
    sendError(res, 400, "SAME_PASSWORD", "New password must be different from the current one");
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(user.userId, passwordHash);

  sendSuccess(res, { message: "Password updated successfully" });
});

router.get("/qr-token", requireAuth, requireRole("staff"), async (req, res) => {
  const qrToken = `qr_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
  const expiresAt = new Date(
    Date.now() + config.qrTokenExpiresMinutes * 60 * 1000,
  ).toISOString();

  await createQrLoginToken(req.auth!.userId, qrToken, expiresAt);

  const loginUrl = `${config.frontendUrl}/qr-login?token=${qrToken}`;
  sendSuccess(res, { qrToken, expiresAt, loginUrl });
});

router.post("/qr-login/verify", verifyLimiter, validateBody(tokenOnlySchema), async (req, res) => {
  const { token } = req.body as z.infer<typeof tokenOnlySchema>;

  const userId = await consumeQrLoginToken(token);
  if (!userId) {
    sendError(res, 401, "INVALID_QR_TOKEN", "QR login token is invalid or expired");
    return;
  }

  const user = await findUserById(userId);
  if (!user || user.role !== "staff" || user.status !== "active") {
    sendError(res, 401, "INVALID_QR_TOKEN", "QR login token is invalid or expired");
    return;
  }

  const result = await loginPayload(userId);
  if (!result) {
    sendError(res, 401, "INVALID_QR_TOKEN", "QR login token is invalid or expired");
    return;
  }

  sendSuccess(res, result);
});

export default router;
