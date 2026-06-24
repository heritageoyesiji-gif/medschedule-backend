import { prisma } from "./prisma";
import { v4 as uuidv4 } from "uuid";
import type { NotificationRecord } from "./store";
import type { NotificationType } from "../types";

export async function createNotification(input: {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}): Promise<NotificationRecord> {
  const row = await prisma.notification.create({
    data: {
      ...input,
      read: false,
      createdAt: new Date().toISOString(),
    },
  });
  return row as NotificationRecord;
}

export async function createNotificationsForUsers(
  userIds: string[],
  input: { type: NotificationType; title: string; message: string },
  idPrefix: string,
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId, i) => ({
      notificationId: `${idPrefix}_${i}`,
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      read: false,
      createdAt: new Date().toISOString(),
    })),
  });
}

export async function findNotificationsByUser(
  userId: string,
  unreadOnly = false,
): Promise<NotificationRecord[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly && { read: false }) },
    orderBy: { createdAt: "desc" },
  });
  return rows as NotificationRecord[];
}

export async function markNotificationRead(notificationId: string): Promise<NotificationRecord | null> {
  const row = await prisma.notification.update({
    where: { notificationId },
    data: { read: true },
  }).catch(() => null);
  return row as NotificationRecord | null;
}
