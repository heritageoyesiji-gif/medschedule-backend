import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../utils/response";
import {
  EMPLOYMENT_TYPES,
  getFacilityOvertimeConfig,
  resetOvertimeConfig,
  upsertOvertimeConfig,
} from "../db/overtimeConfig";
import type { EmploymentType } from "../types";

const router = Router();

const VALID_EMPLOYMENT_TYPES = new Set<string>(EMPLOYMENT_TYPES);

// GET /api/facilities/:facilityId/overtime-config
router.get("/facilities/:facilityId/overtime-config", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const configs = await getFacilityOvertimeConfig(facilityId);
  sendSuccess(res, { configs });
});

// PUT /api/facilities/:facilityId/overtime-config/:employmentType
router.put(
  "/facilities/:facilityId/overtime-config/:employmentType",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { facilityId, employmentType } = req.params as { facilityId: string; employmentType: string };

    if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) {
      sendError(res, 400, "INVALID_EMPLOYMENT_TYPE", `Unknown employment type: ${employmentType}`);
      return;
    }

    const { biweeklyHours } = req.body as { biweeklyHours?: number | null };

    // null is a valid, explicit value meaning "no OT threshold"
    if (biweeklyHours !== null && biweeklyHours !== undefined) {
      if (typeof biweeklyHours !== "number" || !Number.isFinite(biweeklyHours) || biweeklyHours <= 0 || biweeklyHours > 336) {
        sendError(res, 400, "VALIDATION_ERROR", "biweeklyHours must be a positive number up to 336, or null for no limit");
        return;
      }
    }

    const config = await upsertOvertimeConfig(
      facilityId,
      employmentType as EmploymentType,
      biweeklyHours ?? null,
    );
    sendSuccess(res, config);
  },
);

// DELETE /api/facilities/:facilityId/overtime-config/:employmentType — reset to system default
router.delete(
  "/facilities/:facilityId/overtime-config/:employmentType",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { facilityId, employmentType } = req.params as { facilityId: string; employmentType: string };

    if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) {
      sendError(res, 400, "INVALID_EMPLOYMENT_TYPE", `Unknown employment type: ${employmentType}`);
      return;
    }

    await resetOvertimeConfig(facilityId, employmentType as EmploymentType);
    sendSuccess(res, { employmentType, reset: true });
  },
);

export default router;
