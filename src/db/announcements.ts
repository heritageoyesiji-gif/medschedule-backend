import { prisma } from "./prisma";
import type { AnnouncementRecord } from "./store";

export async function createAnnouncement(input: {
  announcementId: string;
  facilityId: string;
  title: string;
  body: string;
  priority: "normal" | "urgent";
}): Promise<AnnouncementRecord> {
  const row = await prisma.announcement.create({
    data: { ...input, createdAt: new Date().toISOString() },
  });
  return row as AnnouncementRecord;
}

export async function findAnnouncementsByFacility(facilityId: string): Promise<AnnouncementRecord[]> {
  const rows = await prisma.announcement.findMany({
    where: { facilityId },
    orderBy: { createdAt: "desc" },
  });
  return rows as AnnouncementRecord[];
}
