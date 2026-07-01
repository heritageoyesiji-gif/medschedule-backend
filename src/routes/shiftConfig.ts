import { Router } from "express";
import { requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { nonEmptyString, timeSchema } from "../schemas";
import { z } from "zod";
import { sendError, sendSuccess } from "../utils/response";
import {
  ALL_SHIFT_TYPE_DEFAULTS,
  getFacilityShiftConfig,
  resetShiftTypeConfig,
  upsertShiftTypeConfig,
} from "../db/shiftConfig";

const router = Router();

const VALID_SHIFT_TYPES = new Set(ALL_SHIFT_TYPE_DEFAULTS.map((d) => d.shiftType));

const shiftConfigBodySchema = z.object({
  label: nonEmptyString.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  durationHours: z.number().positive().max(24).optional(),
});

// GET /api/facilities/:facilityId/shift-config
router.get("/facilities/:facilityId/shift-config", requireAuth, requireRole("admin"), requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const configs = await getFacilityShiftConfig(facilityId);
  sendSuccess(res, { configs });
});

// PUT /api/facilities/:facilityId/shift-config/:shiftType
router.put(
  "/facilities/:facilityId/shift-config/:shiftType",
  requireAuth,
  requireRole("admin"),
  requireFacilityAccess,
  validateBody(shiftConfigBodySchema),
  async (req, res) => {
    const { facilityId, shiftType } = req.params as { facilityId: string; shiftType: string };

    if (!VALID_SHIFT_TYPES.has(shiftType)) {
      sendError(res, 400, "INVALID_SHIFT_TYPE", `Unknown shift type: ${shiftType}`);
      return;
    }

    const { label, startTime, endTime, durationHours } = req.body as z.infer<typeof shiftConfigBodySchema>;

    const config = await upsertShiftTypeConfig(facilityId, shiftType, { label, startTime, endTime, durationHours });
    sendSuccess(res, config);
  },
);

// DELETE /api/facilities/:facilityId/shift-config/:shiftType — reset to system default
router.delete(
  "/facilities/:facilityId/shift-config/:shiftType",
  requireAuth,
  requireRole("admin"),
  requireFacilityAccess,
  async (req, res) => {
    const { facilityId, shiftType } = req.params as { facilityId: string; shiftType: string };

    if (!VALID_SHIFT_TYPES.has(shiftType)) {
      sendError(res, 400, "INVALID_SHIFT_TYPE", `Unknown shift type: ${shiftType}`);
      return;
    }

    await resetShiftTypeConfig(facilityId, shiftType);
    sendSuccess(res, { shiftType, reset: true });
  },
);

export default router;
