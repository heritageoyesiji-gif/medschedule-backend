import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { createSwapRequest, findSwapById, findSwapsByFacility, respondToSwap } from "../db/requests";
import { findShiftById } from "../db/shifts";
import { findStaffById } from "../db/staff";
import { createNotification } from "../db/notifications";
import { requireAuth, requireRole } from "../middleware/auth";
import { emitToUser } from "../socket";
import { sendError, sendSuccess } from "../utils/response";
import type { RequestStatus } from "../types";

const router = Router();

// 6.1 Submit Swap Request (staff)
router.post("/swap-requests", requireAuth, requireRole("staff"), async (req, res) => {
  const { requesterId, targetStaffId, requesterShiftId, targetShiftId, note } = req.body as {
    requesterId?: string;
    targetStaffId?: string;
    requesterShiftId?: string;
    targetShiftId?: string;
    note?: string;
  };

  if (!requesterId || !targetStaffId || !requesterShiftId || !targetShiftId) {
    sendError(res, 400, "VALIDATION_ERROR", "requesterId, targetStaffId, requesterShiftId, targetShiftId are required");
    return;
  }

  if (req.auth!.userId !== requesterId) {
    sendError(res, 403, "FORBIDDEN", "You can only submit swap requests for yourself");
    return;
  }

  const requesterShift = await findShiftById(requesterShiftId);
  if (!requesterShift) {
    sendError(res, 404, "NOT_FOUND", "Requester shift not found");
    return;
  }

  const swapRequest = await createSwapRequest({
    swapRequestId: `swp_${uuidv4().slice(0, 8)}`,
    facilityId: requesterShift.facilityId,
    requesterId,
    targetStaffId,
    requesterShiftId,
    targetShiftId,
    note: note ?? "",
  });

  sendSuccess(
    res,
    {
      swapRequestId: swapRequest.swapRequestId,
      status: swapRequest.status,
      submittedAt: swapRequest.submittedAt,
    },
    201,
  );
});

// 6.2 Get Facility Swap Requests (admin)
router.get("/facilities/:facilityId/swap-requests", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const { status } = req.query as { status?: string };

  const validStatuses = ["pending", "approved", "rejected"];
  const statusFilter = validStatuses.includes(status ?? "") ? (status as RequestStatus) : undefined;

  const requests = await findSwapsByFacility(facilityId, statusFilter);

  const enriched = await Promise.all(
    requests.map(async (r) => {
      const [requesterProfile, targetProfile, requesterShift, targetShift] = await Promise.all([
        findStaffById(r.requesterId),
        findStaffById(r.targetStaffId),
        findShiftById(r.requesterShiftId),
        findShiftById(r.targetShiftId),
      ]);

      return {
        swapRequestId: r.swapRequestId,
        status: r.status,
        submittedAt: r.submittedAt,
        note: r.note,
        requester: {
          userId: r.requesterId,
          firstName: requesterProfile?.firstName ?? "Unknown",
          lastName: requesterProfile?.lastName ?? "Staff",
          shift: requesterShift
            ? { shiftId: requesterShift.shiftId, date: requesterShift.date, type: requesterShift.type, unit: requesterShift.unit }
            : { shiftId: r.requesterShiftId, date: "", type: "day" as const, unit: "" },
        },
        targetStaff: {
          userId: r.targetStaffId,
          firstName: targetProfile?.firstName ?? "Unknown",
          lastName: targetProfile?.lastName ?? "Staff",
          shift: targetShift
            ? { shiftId: targetShift.shiftId, date: targetShift.date, type: targetShift.type, unit: targetShift.unit }
            : { shiftId: r.targetShiftId, date: "", type: "day" as const, unit: "" },
        },
      };
    }),
  );

  sendSuccess(res, { swapRequests: enriched, total: enriched.length });
});

// 6.3 Respond to Swap Request (admin)
router.patch("/swap-requests/:swapRequestId", requireAuth, requireRole("admin"), async (req, res) => {
  const { swapRequestId } = req.params as { swapRequestId: string };
  const { status, adminNote } = req.body as {
    status?: "approved" | "rejected";
    adminNote?: string;
  };

  if (!status || !["approved", "rejected"].includes(status)) {
    sendError(res, 400, "VALIDATION_ERROR", "status must be 'approved' or 'rejected'");
    return;
  }

  const existing = await findSwapById(swapRequestId);
  if (!existing) {
    sendError(res, 404, "NOT_FOUND", "Swap request not found");
    return;
  }

  const updated = await respondToSwap(swapRequestId, status, adminNote);
  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Swap request not found");
    return;
  }

  const ts = Date.now();
  const eventName = status === "approved" ? "swap_approved" : "swap_rejected";

  await createNotification({
    notificationId: `ntf_swp_${ts}_req`,
    userId: existing.requesterId,
    type: status === "approved" ? "swap_approved" : "swap_rejected",
    title: status === "approved" ? "Swap Request Approved" : "Swap Request Declined",
    message:
      status === "approved"
        ? "Your shift swap request has been approved."
        : "Your shift swap request was not approved.",
  });
  emitToUser(existing.requesterId, eventName, {
    swapRequestId,
    requesterId: existing.requesterId,
    targetStaffId: existing.targetStaffId,
  });

  if (status === "approved") {
    await createNotification({
      notificationId: `ntf_swp_${ts}_tgt`,
      userId: existing.targetStaffId,
      type: "swap_approved",
      title: "Shift Swap Approved",
      message: "A shift swap involving you has been approved.",
    });
    emitToUser(existing.targetStaffId, "swap_approved", {
      swapRequestId,
      requesterId: existing.requesterId,
      targetStaffId: existing.targetStaffId,
    });
  }

  sendSuccess(res, { swapRequestId, status });
});

export default router;
