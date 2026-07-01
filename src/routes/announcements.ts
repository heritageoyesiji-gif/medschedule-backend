import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { createAnnouncement, findAnnouncementsByFacility } from "../db/announcements";
import { findStaffByFacility } from "../db/staff";
import { createNotificationsForUsers } from "../db/notifications";
import { callerCanAccessFacility, requireAuth, requireFacilityAccess, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { nonEmptyString } from "../schemas";
import { z } from "zod";
import { emitToFacility } from "../socket";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

const createAnnouncementSchema = z.object({
  facilityId: nonEmptyString,
  title: nonEmptyString,
  body: nonEmptyString,
  priority: z.enum(["normal", "urgent"]).optional(),
});

// 9.1 Create Announcement (admin)
router.post("/announcements", requireAuth, requireRole("admin"), validateBody(createAnnouncementSchema), async (req, res) => {
  const { facilityId, title, body, priority } = req.body as z.infer<typeof createAnnouncementSchema>;

  if (!(await callerCanAccessFacility(req.auth!, facilityId))) {
    sendError(res, 403, "FORBIDDEN", "You do not have access to this facility");
    return;
  }

  const announcement = await createAnnouncement({
    announcementId: `ann_${uuidv4().slice(0, 8)}`,
    facilityId,
    title,
    body,
    priority: priority ?? "normal",
  });

  const allStaff = await findStaffByFacility(facilityId);
  const staffIds = allStaff.filter((s) => s.status === "active").map((s) => s.userId);
  const ts = Date.now();

  await createNotificationsForUsers(
    staffIds,
    {
      type: "announcement",
      title: priority === "urgent" ? `Urgent: ${title}` : `New Announcement: ${title}`,
      message: body.length > 100 ? body.slice(0, 97) + "…" : body,
    },
    `ntf_ann_${ts}`,
  );

  emitToFacility(facilityId, "announcement_posted", {
    announcementId: announcement.announcementId,
    facilityId,
    priority: announcement.priority,
  });

  sendSuccess(
    res,
    {
      announcementId: announcement.announcementId,
      title: announcement.title,
      priority: announcement.priority,
      createdAt: announcement.createdAt,
    },
    201,
  );
});

// 9.2 Get Announcements
router.get("/facilities/:facilityId/announcements", requireAuth, requireFacilityAccess, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const announcements = (await findAnnouncementsByFacility(facilityId)).map(
    ({ facilityId: _fid, ...rest }) => rest,
  );
  sendSuccess(res, { announcements, total: announcements.length });
});

export default router;
