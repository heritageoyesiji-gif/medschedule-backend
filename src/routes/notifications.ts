import { Router } from "express";
import { findNotificationsByUser, markNotificationRead } from "../db/notifications";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../utils/response";

const router = Router();

// 8.1 Get User Notifications
router.get("/notifications", requireAuth, async (req, res) => {
  const { userId, unreadOnly } = req.query as { userId?: string; unreadOnly?: string };

  if (!userId) {
    sendError(res, 400, "VALIDATION_ERROR", "userId query param is required");
    return;
  }

  if (req.auth!.userId !== userId) {
    sendError(res, 403, "FORBIDDEN", "You can only view your own notifications");
    return;
  }

  const onlyUnread = unreadOnly === "true";
  const [notifications, allForUser] = await Promise.all([
    findNotificationsByUser(userId, onlyUnread),
    findNotificationsByUser(userId, false),
  ]);
  const unreadCount = allForUser.filter((n) => !n.read).length;

  sendSuccess(res, { notifications, unreadCount });
});

// 8.2 Mark Notification as Read
router.patch("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  const { notificationId } = req.params as { notificationId: string };
  const updated = await markNotificationRead(notificationId);

  if (!updated) {
    sendError(res, 404, "NOT_FOUND", "Notification not found");
    return;
  }

  sendSuccess(res, { notificationId, read: true });
});

export default router;
