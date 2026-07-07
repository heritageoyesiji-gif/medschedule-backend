import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  createStaffProfile,
  deactivateStaff,
  findStaffByFacility,
  findStaffById,
  findStaffByEmailAndFacility,
  updateStaffProfile,
} from "../db/staff";
import { findFacilityById } from "../db/facilities";
import { createStaffInvite } from "../db/tokens";
import { sendStaffInviteEmail } from "../utils/email";
import { config } from "../config";
import { requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { inviteLimiter } from "../middleware/rateLimit";
import {
  availabilitySchema,
  emailSchema,
  employmentTypeSchema,
  nonEmptyString,
  staffRoleTypeSchema,
} from "../schemas";
import { z } from "zod";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

const maxHoursSchema = z.number().int().positive().max(168);

const createStaffSchema = z.object({
  firstName: nonEmptyString,
  lastName: nonEmptyString,
  email: emailSchema,
  phone: z.string().optional(),
  roleType: staffRoleTypeSchema.optional(),
  unit: z.string().optional(),
  qualifications: z.array(z.string()).optional(),
  employmentType: employmentTypeSchema.optional(),
  availability: availabilitySchema.optional(),
  maxHoursPerWeek: maxHoursSchema.optional(),
  notes: z.string().optional(),
});

const updateStaffSchema = z.object({
  firstName: nonEmptyString.optional(),
  lastName: nonEmptyString.optional(),
  phone: z.string().optional(),
  roleType: staffRoleTypeSchema.optional(),
  unit: z.string().optional(),
  qualifications: z.array(z.string()).optional(),
  employmentType: employmentTypeSchema.optional(),
  availability: availabilitySchema.optional(),
  maxHoursPerWeek: maxHoursSchema.optional(),
  notes: z.string().optional(),
});

const availabilityBodySchema = z.object({ availability: availabilitySchema });
const inviteSchema = z.object({ email: emailSchema });

// 3.1 Get All Staff (admin, own facility)
router.get("/facilities/:facilityId/staff", requireAuth, requireRole("admin"), requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const staff = await findStaffByFacility(facilityId);
  sendSuccess(res, { staff, total: staff.length });
});

// 3.2 Get Single Staff Profile (admin or own profile)
router.get("/staff/:staffId", requireAuth, async (req, res) => {
  const { staffId } = req.params as { staffId: string };

  if (req.auth!.role === "staff" && req.auth!.userId !== staffId) {
    sendError(res, 403, "FORBIDDEN", "You can only view your own profile");
    return;
  }

  const profile = await findStaffById(staffId);
  if (!profile) {
    sendError(res, 404, "NOT_FOUND", "Staff member not found");
    return;
  }

  sendSuccess(res, profile);
});

// 3.2a Update own availability (staff) or any staff availability (admin)
router.patch("/staff/:staffId/availability", requireAuth, validateBody(availabilityBodySchema), async (req, res) => {
  const { staffId } = req.params as { staffId: string };

  if (req.auth!.role === "staff" && req.auth!.userId !== staffId) {
    sendError(res, 403, "FORBIDDEN", "You can only update your own availability");
    return;
  }

  const { availability } = req.body as z.infer<typeof availabilityBodySchema>;

  const updated = await updateStaffProfile(staffId, { availability });
  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Staff member not found");
    return;
  }

  sendSuccess(res, updated);
});

// 3.3 Add Staff Member (admin)
router.post("/facilities/:facilityId/staff", requireAuth, requireRole("admin"), requireFacilityAccess, validateBody(createStaffSchema), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const {
    firstName,
    lastName,
    email,
    phone,
    roleType,
    unit,
    qualifications,
    employmentType,
    availability,
    maxHoursPerWeek,
    notes,
  } = req.body as z.infer<typeof createStaffSchema>;

  const userId = `usr_${uuidv4().slice(0, 8)}`;
  const profile = await createStaffProfile({
    userId,
    facilityId,
    firstName,
    lastName,
    email,
    phone,
    roleType,
    unit,
    qualifications,
    employmentType,
    availability,
    maxHoursPerWeek,
    notes,
  });

  sendSuccess(res, profile, 201);
});

// 3.4 Update Staff Profile (admin)
router.patch("/staff/:staffId", requireAuth, requireRole("admin"), validateBody(updateStaffSchema), async (req, res) => {
  const { staffId } = req.params as { staffId: string };
  const {
    firstName,
    lastName,
    phone,
    roleType,
    unit,
    qualifications,
    employmentType,
    availability,
    maxHoursPerWeek,
    notes,
  } = req.body as z.infer<typeof updateStaffSchema>;

  const updated = await updateStaffProfile(staffId, {
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(phone !== undefined && { phone }),
    ...(roleType !== undefined && { roleType }),
    ...(unit !== undefined && { unit }),
    ...(qualifications !== undefined && { qualifications }),
    ...(employmentType !== undefined && { employmentType }),
    ...(availability !== undefined && { availability }),
    ...(maxHoursPerWeek !== undefined && { maxHoursPerWeek }),
    ...(notes !== undefined && { notes }),
  });

  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Staff member not found");
    return;
  }

  sendSuccess(res, updated);
});

// 3.5 Deactivate Staff Member (admin)
router.patch("/staff/:staffId/deactivate", requireAuth, requireRole("admin"), async (req, res) => {
  const { staffId } = req.params as { staffId: string };
  const deactivated = await deactivateStaff(staffId);

  if (!deactivated) {
    sendError(res, 404, "NOT_FOUND", "Staff member not found");
    return;
  }

  sendSuccess(res, { userId: staffId, status: "inactive" });
});

// 3.6 Invite Staff Member by email (admin)
router.post("/facilities/:facilityId/staff/invite", requireAuth, requireRole("admin"), requireFacilityAccess, inviteLimiter, validateBody(inviteSchema), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { email } = req.body as z.infer<typeof inviteSchema>;

  const facility = await findFacilityById(facilityId);
  if (!facility) {
    sendError(res, 404, "FACILITY_NOT_FOUND", "Facility not found");
    return;
  }

  const existing = await findStaffByEmailAndFacility(email, facilityId);
  if (existing) {
    sendError(res, 409, "ALREADY_MEMBER", "This person already has a staff profile at this facility");
    return;
  }

  const token = `inv_${uuidv4().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await createStaffInvite(token, facilityId, email, expiresAt);

  const inviteUrl = `${config.frontendUrl}/auth/signup?invite=${token}`;
  await sendStaffInviteEmail(email, inviteUrl, facility.name);

  sendSuccess(res, { message: "Invitation sent" });
});

export default router;
