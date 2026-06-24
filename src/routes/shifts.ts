import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  calcGaps,
  calcOvertimeRisks,
  copyShiftsToMonth,
  createShift,
  deleteShift,
  findShiftById,
  findShiftsByFacilityAndMonth,
  findShiftsByStaffAndMonth,
  isSchedulePublished,
  publishSchedule,
  shiftTimes,
  updateShift,
} from "../db/shifts";
import { findStaffById } from "../db/staff";
import { createNotificationsForUsers } from "../db/notifications";
import { requireAuth, requireRole } from "../middleware/auth";
import { emitToFacility, emitToUser } from "../socket";
import { sendError, sendSuccess } from "../utils/response";
import type { ShiftType } from "../types";

const router = Router();

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
router.get("/facilities/:facilityId/schedule", requireAuth, requireRole("admin"), async (req, res) => {
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
router.post("/shifts", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId, staffId, date, type, unit, startTime, endTime } = req.body as {
    facilityId?: string;
    staffId?: string;
    date?: string;
    type?: ShiftType;
    unit?: string;
    startTime?: string;
    endTime?: string;
  };

  if (!facilityId || !staffId || !date || !type || !unit) {
    sendError(res, 400, "VALIDATION_ERROR", "facilityId, staffId, date, type, and unit are required");
    return;
  }

  const times = startTime && endTime
    ? (() => {
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        let endMins = eh * 60 + em;
        if (endMins <= sh * 60 + sm) endMins += 24 * 60;
        return { startTime, endTime, durationHours: (endMins - (sh * 60 + sm)) / 60 };
      })()
    : shiftTimes(type);

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
router.patch("/shifts/:shiftId", requireAuth, requireRole("admin"), async (req, res) => {
  const { shiftId } = req.params as { shiftId: string };
  const { date, type, staffId, unit } = req.body as {
    date?: string;
    type?: ShiftType;
    staffId?: string;
    unit?: string;
  };

  const existing = await findShiftById(shiftId);
  if (!existing) {
    sendError(res, 404, "NOT_FOUND", "Shift not found");
    return;
  }

  const updated = await updateShift(shiftId, { date, type, staffId, unit });
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
router.post("/facilities/:facilityId/schedule/publish", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { month } = req.body as { month?: string };

  if (!month) {
    sendError(res, 400, "VALIDATION_ERROR", "month is required");
    return;
  }

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

// 4.7 Copy schedule from a previous month (admin)
router.post("/facilities/:facilityId/schedule/copy-forward", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { sourceMonth, targetMonth } = req.body as { sourceMonth?: string; targetMonth?: string };

  if (!sourceMonth || !targetMonth) {
    sendError(res, 400, "VALIDATION_ERROR", "sourceMonth and targetMonth are required");
    return;
  }

  if (sourceMonth === targetMonth) {
    sendError(res, 400, "VALIDATION_ERROR", "Source and target months must be different");
    return;
  }

  const result = await copyShiftsToMonth(facilityId, sourceMonth, targetMonth);
  sendSuccess(res, result);
});

export default router;
