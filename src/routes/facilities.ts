import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { createFacility, findAllFacilitiesByAdmin, findFacilityById } from "../db/facilities";
import { setUserFacilityId } from "../db/users";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { emailSchema, nonEmptyString } from "../schemas";
import { z } from "zod";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

const createFacilitySchema = z.object({
  name: nonEmptyString,
  address: nonEmptyString,
  contactEmail: emailSchema,
  contactPhone: nonEmptyString,
});

// 2.1 Create Facility (admin only)
router.post("/", requireAuth, requireRole("admin"), validateBody(createFacilitySchema), async (req, res) => {
  const { name, address, contactEmail, contactPhone } = req.body as z.infer<typeof createFacilitySchema>;

  const facilityId = `fac_${uuidv4().slice(0, 8)}`;
  const facility = await createFacility({
    facilityId,
    name,
    address,
    contactEmail,
    contactPhone,
    adminUserId: req.auth!.userId,
  });

  await setUserFacilityId(req.auth!.userId, facilityId);

  sendSuccess(
    res,
    { facilityId: facility.facilityId, name: facility.name, createdAt: facility.createdAt },
    201,
  );
});

// 2.2 List all facilities managed by the current admin
router.get("/mine", requireAuth, requireRole("admin"), async (req, res) => {
  const facilities = await findAllFacilitiesByAdmin(req.auth!.userId);
  sendSuccess(res, { facilities });
});

// 2.3 Get Facility Details (admin, own facility only)
router.get("/:facilityId", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };

  if (req.auth!.facilityId !== facilityId) {
    const facility = await findFacilityById(facilityId);
    if (!facility || facility.adminUserId !== req.auth!.userId) {
      sendError(res, 403, "FORBIDDEN", "You can only access your own facility");
      return;
    }
    sendSuccess(res, facility);
    return;
  }

  const facility = await findFacilityById(facilityId);
  if (!facility) {
    sendError(res, 404, "NOT_FOUND", "Facility not found");
    return;
  }

  sendSuccess(res, facility);
});

export default router;
