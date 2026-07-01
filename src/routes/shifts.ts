import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  calcGaps,
  calcOvertimeRisks,
  computeShiftTimes,
  copyShiftsToMonth,
  createShift,
  deleteShift,
  findShiftById,
  findShiftsByFacilityAndMonth,
  findShiftsByStaffAndMonth,
  isSchedulePublished,
  publishSchedule,
  shiftTimes,
  unpublishSchedule,
  updateShift,
} from "../db/shifts";
import { findStaffById } from "../db/staff";
import { createNotificationsForUsers } from "../db/notifications";
import { callerCanAccessFacility, requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { dateSchema, monthSchema, nonEmptyString, shiftTypeSchema, timeSchema } from "../schemas";
import { z } from "zod";
import { emitToFacility, emitToUser } from "../socket";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

const createShiftSchema = z.object({
  facilityId: nonEmptyString,
  staffId: nonEmptyString,
  date: dateSchema,
  type: shiftTypeSchema,
  unit: nonEmptyString,
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

const updateShiftSchema = z.object({
  date: dateSchema.optional(),
  type: shiftTypeSchema.optional(),
  staffId: nonEmptyString.optional(),
  unit: nonEmptyString.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

const publishSchema = z.object({ month: monthSchema });
const copyForwardSchema = z.object({ sourceMonth: monthSchema, targetMonth: monthSchema });

// Longest a single shift may run. A longer span is almost always a backwards
// same-day entry (e.g. 19:00 → 18:00 wraps to 23h). Overnight shifts are fine.
const MAX_SHIFT_HOURS = 16;

// 4.1 Get Staff Personal Schedule
router.get("/shifts", requireAuth, requireRole("staff"), async (req, res) => {
  const { staffId, month } = req.query as { staffId?: string; month?: string };

  if (!staffId || !month) {
    sendError(res, 400, "VALIDATION_ERROR", "staffId and month query params are required");
    return;
  }

  if (req.auth!.userId !== staffId) {
    sendError(res, 403, "FORBIDDEN", "You can only view your own schedule");
    return;
  }

  const shifts = await findShiftsByStaffAndMonth(staffId, month);
  const totalHours = shifts.reduce((sum, s) => sum + s.durationHours, 0);

  sendSuccess(res, {
    staffId,
    month,
    shifts: shifts.map(({ facilityId: _fid, staffId: _sid, createdAt: _c, publishedAt, ...rest }) => ({
      ...rest,
      ...(publishedAt && { publishedAt }),
    })),
    totalShifts: shifts.length,
    totalHours,
  });
});

// 4.2 Get Full Facility Schedule (admin)
router.get("/facilities/:facilityId/schedule", requireAuth, requireRole("admin"), requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { month } = req.query as { month?: string };

  if (!month) {
    sendError(res, 400, "VALIDATION_ERROR", "month query param is required");
    return;
  }

  const [shifts, published, gaps, overtimeRisks] = await Promise.all([
    findShiftsByFacilityAndMonth(facilityId, month),
    isSchedulePublished(facilityId, month),
    calcGaps(facilityId, month),
    calcOvertimeRisks(facilityId, month),
  ]);

  const shiftsWithStaff = await Promise.all(
    shifts.map(async ({ facilityId: _fid, createdAt: _c, publishedAt, ...rest }) => {
      const staffProfile = await findStaffById(rest.staffId);
      return {
        shiftId: rest.shiftId,
        date: rest.date,
        type: rest.type,
        unit: rest.unit,
        startTime: rest.startTime,
        endTime: rest.endTime,
        durationHours: rest.durationHours,
        status: rest.status,
        ...(publishedAt && { publishedAt }),
        staff: staffProfile
          ? {
              userId: staffProfile.userId,
              firstName: staffProfile.firstName,
              lastName: staffProfile.lastName,
              roleType: staffProfile.roleType,
            }
          : undefined,
      };
    }),
  );

  sendSuccess(res, { facilityId, month, published, shifts: shiftsWithStaff, gaps, overtimeRisks });
});

// 4.3 Create Single Shift (admin)
router.post("/shifts", requireAuth, requireRole("admin"), validateBody(createShiftSchema), async (req, res) => {
  const { facilityId, staffId, date, type, unit, startTime, endTime } =
    req.body as z.infer<typeof createShiftSchema>;

  if (!(await callerCanAccessFacility(req.auth!, facilityId))) {
    sendError(res, 403, "FORBIDDEN", "You do not have access to this facility");
    return;
  }

  const times = startTime && endTime ? computeShiftTimes(startTime, endTime) : shiftTimes(type);

  if (times.durationHours <= 0 || times.durationHours > MAX_SHIFT_HOURS) {
    sendError(
      res,
      400,
      "INVALID_SHIFT_TIME",
      `A shift must be between 0 and ${MAX_SHIFT_HOURS} hours. Overnight shifts are allowed — the end time counts as the next day — so check the start and end times.`,
    );
    return;
  }

  const shift = await createShift({
    shiftId: `shf_${uuidv4().slice(0, 8)}`,
    facilityId,
    staffId,
    date,
    type,
    unit,
    ...times,
  });

  const staff = await findStaffById(staffId);
  sendSuccess(
    res,
    {
      shiftId: shift.shiftId,
      date: shift.date,
      type: shift.type,
      unit: shift.unit,
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationHours: shift.durationHours,
      status: shift.status,
      staff: staff
        ? { userId: staff.userId, firstName: staff.firstName, lastName: staff.lastName, roleType: staff.roleType }
        : undefined,
    },
    201,
  );
});

// 4.4 Update Shift (admin)
router.patch("/shifts/:shiftId", requireAuth, requireRole("admin"), validateBody(updateShiftSchema), async (req, res) => {
  const { shiftId } = req.params as { shiftId: string };
  const { date, type, staffId, unit, startTime, endTime } = req.body as z.infer<typeof updateShiftSchema>;

  const existing = await findShiftById(shiftId);
  if (!existing) {
    sendError(res, 404, "NOT_FOUND", "Shift not found");
    return;
  }

  if (startTime && endTime) {
    const { durationHours } = computeShiftTimes(startTime, endTime);
    if (durationHours <= 0 || durationHours > MAX_SHIFT_HOURS) {
      sendError(
        res,
        400,
        "INVALID_SHIFT_TIME",
        `A shift must be between 0 and ${MAX_SHIFT_HOURS} hours. Overnight shifts are allowed — the end time counts as the next day — so check the start and end times.`,
      );
      return;
    }
  }

  const updated = await updateShift(shiftId, { date, type, staffId, unit, startTime, endTime });
  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Shift not found");
    return;
  }

  if (updated.publishedAt) {
    emitToUser(updated.staffId, "shift_updated", {
      shiftId: updated.shiftId,
      staffId: updated.staffId,
      changes: { date, type, unit },
    });
  }

  const staff = await findStaffById(updated.staffId);
  sendSuccess(res, {
    shiftId: updated.shiftId,
    date: updated.date,
    type: updated.type,
    unit: updated.unit,
    startTime: updated.startTime,
    endTime: updated.endTime,
    durationHours: updated.durationHours,
    status: updated.status,
    ...(updated.publishedAt && { publishedAt: updated.publishedAt }),
    staff: staff
      ? { userId: staff.userId, firstName: staff.firstName, lastName: staff.lastName, roleType: staff.roleType }
      : undefined,
  });
});

// 4.5 Delete Shift (admin)
router.delete("/shifts/:shiftId", requireAuth, requireRole("admin"), async (req, res) => {
  const { shiftId } = req.params as { shiftId: string };

  const found = await findShiftById(shiftId);
  if (!found) {
    sendError(res, 404, "NOT_FOUND", "Shift not found");
    return;
  }

  await deleteShift(shiftId);
  sendSuccess(res, { shiftId, deleted: true });
});

// 4.6 Publish Schedule (admin)
router.post("/facilities/:facilityId/schedule/publish", requireAuth, requireRole("admin"), requireFacilityAccess, validateBody(publishSchema), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { month } = req.body as z.infer<typeof publishSchema>;

  const result = await publishSchedule(facilityId, month);

  const shifts = await findShiftsByFacilityAndMonth(facilityId, month);
  const staffIds = [...new Set(shifts.map((s) => s.staffId))];

  const ts = Date.now();
  await createNotificationsForUsers(
    staffIds,
    {
      type: "schedule_published",
      title: `${month} Schedule Published`,
      message: `Your schedule for ${month} is now available.`,
    },
    `ntf_pub_${ts}`,
  );

  emitToFacility(facilityId, "schedule_published", {
    facilityId,
    month,
    publishedAt: result.publishedAt,
  });

  sendSuccess(res, {
    month,
    published: true,
    publishedAt: result.publishedAt,
    notifiedStaffCount: result.notifiedCount,
  });
});

// 4.6b Unpublish Schedule (admin) — reverts a published month back to draft
router.post("/facilities/:facilityId/schedule/unpublish", requireAuth, requireRole("admin"), requireFacilityAccess, validateBody(publishSchema), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { month } = req.body as z.infer<typeof publishSchema>;

  const result = await unpublishSchedule(facilityId, month);

  emitToFacility(facilityId, "schedule_unpublished", { facilityId, month });

  sendSuccess(res, {
    month,
    published: false,
    affectedCount: result.affectedCount,
  });
});

// 4.7 Copy schedule from a previous month (admin)
router.post("/facilities/:facilityId/schedule/copy-forward", requireAuth, requireRole("admin"), requireFacilityAccess, validateBody(copyForwardSchema), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { sourceMonth, targetMonth } = req.body as z.infer<typeof copyForwardSchema>;

  if (sourceMonth === targetMonth) {
    sendError(res, 400, "VALIDATION_ERROR", "Source and target months must be different");
    return;
  }

  const result = await copyShiftsToMonth(facilityId, sourceMonth, targetMonth);
  sendSuccess(res, result);
});

export default router;
