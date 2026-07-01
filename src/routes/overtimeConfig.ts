import { Router } from "express";
import { requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { z } from "zod";
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

const overtimeConfigBodySchema = z.object({
  biweeklyHours: z.number().positive().max(336).nullable().optional(),
});

// GET /api/facilities/:facilityId/overtime-config
router.get("/facilities/:facilityId/overtime-config", requireAuth, requireRole("admin"), requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const configs = await getFacilityOvertimeConfig(facilityId);
  sendSuccess(res, { configs });
});

// PUT /api/facilities/:facilityId/overtime-config/:employmentType
router.put(
  "/facilities/:facilityId/overtime-config/:employmentType",
  requireAuth,
  requireRole("admin"),
  requireFacilityAccess,
  validateBody(overtimeConfigBodySchema),
  async (req, res) => {
    const { facilityId, employmentType } = req.params as { facilityId: string; employmentType: string };

    if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) {
      sendError(res, 400, "INVALID_EMPLOYMENT_TYPE", `Unknown employment type: ${employmentType}`);
      return;
    }

    const { biweeklyHours } = req.body as z.infer<typeof overtimeConfigBodySchema>;

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
  requireFacilityAccess,
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
