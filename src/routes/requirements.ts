import { Router } from "express";
import {
  findRequirementsByFacility,
  replaceRequirements,
} from "../db/requirements";
import { requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { nonEmptyString, staffRoleTypeSchema } from "../schemas";
import { z } from "zod";
import { sendSuccess } from "../utils/response";

const router = Router();

const requirementsSchema = z.object({
  requirements: z.array(
    z.object({
      unit: nonEmptyString,
      shiftType: z.enum(["day", "evening", "night"]),
      requiredRole: staffRoleTypeSchema,
      minCount: z.number().int().min(0),
    }),
  ),
});

// GET /facilities/:facilityId/requirements
router.get(
  "/facilities/:facilityId/requirements",
  requireAuth,
  requireRole("admin"),
  requireFacilityAccess,
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
  requireFacilityAccess,
  validateBody(requirementsSchema),
  async (req, res) => {
    const { facilityId } = req.params as { facilityId: string };
    const { requirements } = req.body as z.infer<typeof requirementsSchema>;

    const saved = await replaceRequirements(facilityId, requirements);

    sendSuccess(res, { requirements: saved, total: saved.length });
  },
);

export default router;
