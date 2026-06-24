import { prisma } from "./prisma";
import type { FacilityRecord } from "./store";

export async function createFacility(input: {
  facilityId: string;
  name: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  adminUserId: string;
}): Promise<FacilityRecord> {
  const row = await prisma.facility.create({
    data: { ...input, createdAt: new Date().toISOString() },
  });
  return row as FacilityRecord;
}

export async function findFacilityById(facilityId: string): Promise<FacilityRecord | null> {
  const row = await prisma.facility.findUnique({ where: { facilityId } });
  return row as FacilityRecord | null;
}

export async function findFacilityByAdmin(adminUserId: string): Promise<FacilityRecord | null> {
  const row = await prisma.facility.findFirst({ where: { adminUserId } });
  return row as FacilityRecord | null;
}
