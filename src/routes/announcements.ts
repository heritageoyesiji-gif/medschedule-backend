import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { createAnnouncement, findAnnouncementsByFacility } from "../db/announcements";
import { findStaffByFacility } from "../db/staff";
import { createNotificationsForUsers } from "../db/notifications";
import { requireAuth, requireRole } from "../middleware/auth";
import { emitToFacility } from "../socket";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

// 9.1 Create Announcement (admin)
router.post("/announcements", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId, title, body, priority } = req.body as {
    facilityId?: string;
    title?: string;
    body?: string;
    priority?: "normal" | "urgent";
  };

  if (!facilityId || !title || !body) {
    sendError(res, 400, "VALIDATION_ERROR", "facilityId, title, and body are required");
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
router.get("/facilities/:facilityId/announcements", requireAuth, async (req, res) => {
  const { facilityId } = req.params as { facilityId: string };
  const announcements = (await findAnnouncementsByFacility(facilityId)).map(
    ({ facilityId: _fid, ...rest }) => rest,
  );
  sendSuccess(res, { announcements, total: announcements.length });
});

export default router;
