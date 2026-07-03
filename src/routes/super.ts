import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

// Scope the superadmin guard to /super paths only. Without the path, this router
// (mounted at /api) would run requireAuth/requireRole on every unmatched /api
// request, turning would-be 404s into misleading 401/403 responses.
router.use("/super", requireAuth, requireRole("superadmin"));

// Platform-wide stats
router.get("/super/stats", async (_req, res) => {
  const [facilityCount, userCount, staffCount, shiftCount] = await Promise.all([
    prisma.facility.count(),
    prisma.user.count({ where: { role: { not: "superadmin" } } }),
    prisma.staffProfile.count(),
    prisma.shift.count(),
  ]);

  sendSuccess(res, { facilityCount, userCount, staffCount, shiftCount });
});

// All facilities with staff count
router.get("/super/facilities", async (_req, res) => {
  const facilities = await prisma.facility.findMany({
    orderBy: { createdAt: "desc" },
  });

  const withCounts = await Promise.all(
    facilities.map(async (f) => {
      const [staffCount, adminUser] = await Promise.all([
        prisma.staffProfile.count({ where: { facilityId: f.facilityId } }),
        prisma.user.findUnique({ where: { userId: f.adminUserId }, select: { email: true, firstName: true, lastName: true } }),
      ]);
      return { ...f, staffCount, adminEmail: adminUser?.email ?? "", adminName: adminUser ? `${adminUser.firstName} ${adminUser.lastName}` : "" };
    }),
  );

  sendSuccess(res, { facilities: withCounts, total: withCounts.length });
});

// Single facility detail
router.get("/super/facilities/:facilityId", async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };

  const facility = await prisma.facility.findUnique({ where: { facilityId } });
  if (!facility) {
    sendError(res, 404, "NOT_FOUND", "Facility not found");
    return;
  }

  const [staff, shiftCount] = await Promise.all([
    prisma.staffProfile.findMany({ where: { facilityId } }),
    prisma.shift.count({ where: { facilityId } }),
  ]);

  sendSuccess(res, { ...facility, staff, staffCount: staff.length, shiftCount });
});

// Deactivate a facility (soft-delete: deactivate all its users)
router.patch("/super/facilities/:facilityId/deactivate", async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };

  const facility = await prisma.facility.findUnique({ where: { facilityId } });
  if (!facility) {
    sendError(res, 404, "NOT_FOUND", "Facility not found");
    return;
  }

  await prisma.user.updateMany({
    where: { facilityId },
    data: { status: "inactive" },
  });

  sendSuccess(res, { facilityId, deactivated: true });
});

// Reactivate a facility
router.patch("/super/facilities/:facilityId/reactivate", async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };

  const facility = await prisma.facility.findUnique({ where: { facilityId } });
  if (!facility) {
    sendError(res, 404, "NOT_FOUND", "Facility not found");
    return;
  }

  await prisma.user.updateMany({
    where: { facilityId },
    data: { status: "active" },
  });

  sendSuccess(res, { facilityId, reactivated: true });
});

export default router;
