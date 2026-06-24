import { Router } from "express";
import {
  findRequirementsByFacility,
  replaceRequirements,
} from "../db/requirements";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

const VALID_SHIFT_TYPES = new Set(["day", "evening", "night"]);
const VALID_ROLES = new Set(["RN", "PSW", "LPN", "doctor", "technician"]);

// GET /facilities/:facilityId/requirements
router.get(
  "/facilities/:facilityId/requirements",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { facilityId } = req.params as { facilityId: string };
    const requirements = await findRequirementsByFacility(facilityId);
    sendSuccess(res, { requirements, total: requirements.length });
  },
);

// PUT /facilities/:facilityId/requirements (replace all)
router.put(
  "/facilities/:facilityId/requirements",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { facilityId } = req.params as { facilityId: string };
    const { requirements } = req.body as {
      requirements?: Array<{
        unit?: string;
        shiftType?: string;
        requiredRole?: string;
        minCount?: number;
      }>;
    };

    if (!Array.isArray(requirements)) {
      sendError(res, 400, "VALIDATION_ERROR", "requirements must be an array");
      return;
    }

    for (const r of requirements) {
      if (!r.unit || typeof r.unit !== "string") {
        sendError(res, 400, "VALIDATION_ERROR", "Each requirement must have a unit");
        return;
      }
      if (!r.shiftType || !VALID_SHIFT_TYPES.has(r.shiftType)) {
        sendError(res, 400, "VALIDATION_ERROR", `Invalid shiftType: ${String(r.shiftType)}`);
        return;
      }
      if (!r.requiredRole || !VALID_ROLES.has(r.requiredRole)) {
        sendError(res, 400, "VALIDATION_ERROR", `Invalid requiredRole: ${String(r.requiredRole)}`);
        return;
      }
      if (
        typeof r.minCount !== "number" ||
        r.minCount < 0 ||
        !Number.isInteger(r.minCount)
      ) {
        sendError(res, 400, "VALIDATION_ERROR", "minCount must be a non-negative integer");
        return;
      }
    }

    const saved = await replaceRequirements(
      facilityId,
      requirements as Array<{
        unit: string;
        shiftType: string;
        requiredRole: string;
        minCount: number;
      }>,
    );

    sendSuccess(res, { requirements: saved, total: saved.length });
  },
);

export default router;
