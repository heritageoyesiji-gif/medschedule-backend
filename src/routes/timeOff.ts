import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  createTimeOffRequest,
  findTimeOffByFacility,
  findTimeOffById,
  findTimeOffByStaff,
  respondToTimeOff,
} from "../db/requests";
import { findStaffById } from "../db/staff";
import { createNotification } from "../db/notifications";
import { requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { emitToUser } from "../socket";
import { sendError, sendSuccess } from "../utils/response";
import type { RequestStatus } from "../types";

const router = Router();

// 7.1 Submit Time Off Request (staff)
router.post("/time-off", requireAuth, requireRole("staff"), async (req, res) => {
  const { staffId, startDate, endDate, reason } = req.body as {
    staffId?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  };

  if (!staffId || !startDate || !endDate || !reason) {
    sendError(res, 400, "VALIDATION_ERROR", "staffId, startDate, endDate, and reason are required");
    return;
  }

  if (req.auth!.userId !== staffId) {
    sendError(res, 403, "FORBIDDEN", "You can only submit time-off requests for yourself");
    return;
  }

  const staffProfile = await findStaffById(staffId);
  const facilityId = staffProfile?.facilityId ?? req.auth!.facilityId ?? "";

  if (!facilityId) {
    sendError(res, 400, "NO_FACILITY", "Staff member is not linked to a facility");
    return;
  }

  const request = await createTimeOffRequest({
    requestId: `tof_${uuidv4().slice(0, 8)}`,
    facilityId,
    staffId,
    startDate,
    endDate,
    reason,
  });

  sendSuccess(
    res,
    {
      requestId: request.requestId,
      status: request.status,
      submittedAt: request.submittedAt,
    },
    201,
  );
});

// 7.2 Get Staff's Own Time Off Requests
router.get("/time-off", requireAuth, requireRole("staff"), async (req, res) => {
  const { staffId } = req.query as { staffId?: string };

  if (!staffId) {
    sendError(res, 400, "VALIDATION_ERROR", "staffId query param is required");
    return;
  }

  if (req.auth!.userId !== staffId) {
    sendError(res, 403, "FORBIDDEN", "You can only view your own time-off requests");
    return;
  }

  const requests = (await findTimeOffByStaff(staffId)).map(({ facilityId: _fid, staffId: _sid, ...rest }) => rest);
  sendSuccess(res, { requests, total: requests.length });
});

// 7.3 Get All Time Off Requests (admin)
router.get("/facilities/:facilityId/time-off", requireAuth, requireRole("admin"), requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { status } = req.query as { status?: string };

  const validStatuses = ["pending", "approved", "rejected"];
  const statusFilter = validStatuses.includes(status ?? "") ? (status as RequestStatus) : undefined;

  const requests = await findTimeOffByFacility(facilityId, statusFilter);

  const enriched = await Promise.all(
    requests.map(async (r) => {
      const staffProfile = await findStaffById(r.staffId);
      return {
        requestId: r.requestId,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        status: r.status,
        adminNote: r.adminNote,
        submittedAt: r.submittedAt,
        ...(staffProfile && {
          staff: {
            userId: staffProfile.userId,
            firstName: staffProfile.firstName,
            lastName: staffProfile.lastName,
            roleType: staffProfile.roleType,
            unit: staffProfile.unit,
          },
        }),
      };
    }),
  );

  sendSuccess(res, { requests: enriched, total: enriched.length });
});

// 7.4 Respond to Time Off Request (admin)
router.patch("/time-off/:requestId", requireAuth, requireRole("admin"), async (req, res) => {
  const { requestId } = req.params as { requestId: string };
  const { status, adminNote } = req.body as {
    status?: "approved" | "rejected";
    adminNote?: string;
  };

  if (!status || !["approved", "rejected"].includes(status)) {
    sendError(res, 400, "VALIDATION_ERROR", "status must be 'approved' or 'rejected'");
    return;
  }

  const existing = await findTimeOffById(requestId);
  if (!existing) {
    sendError(res, 404, "NOT_FOUND", "Time off request not found");
    return;
  }

  const updated = await respondToTimeOff(requestId, status, adminNote);
  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Time off request not found");
    return;
  }

  const ts = Date.now();
  const notificationType = status === "approved" ? "time_off_approved" : "time_off_rejected";

  await createNotification({
    notificationId: `ntf_tof_${ts}`,
    userId: existing.staffId,
    type: notificationType,
    title: status === "approved" ? "Time Off Approved" : "Time Off Request Declined",
    message:
      status === "approved"
        ? `Your time off request (${existing.startDate} – ${existing.endDate}) was approved.`
        : `Your time off request (${existing.startDate} – ${existing.endDate}) was not approved.`,
  });

  emitToUser(existing.staffId, notificationType, { requestId, staffId: existing.staffId });

  const staffProfile = await findStaffById(existing.staffId);
  sendSuccess(res, {
    requestId: updated.requestId,
    startDate: updated.startDate,
    endDate: updated.endDate,
    reason: updated.reason,
    status: updated.status,
    adminNote: updated.adminNote,
    submittedAt: updated.submittedAt,
    ...(staffProfile && {
      staff: {
        userId: staffProfile.userId,
        firstName: staffProfile.firstName,
        lastName: staffProfile.lastName,
        roleType: staffProfile.roleType,
        unit: staffProfile.unit,
      },
    }),
  });
});

export default router;
