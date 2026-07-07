import { prisma } from "./prisma";
import type { StaffProfileRecord } from "./store";
import type { EmploymentType, ShiftType, StaffRoleType } from "../types";

function toRecord(row: unknown): StaffProfileRecord {
  const r = row as Record<string, unknown>;
  return {
    ...(r as object),
    qualifications: r.qualifications as string[],
    availability: r.availability as Record<string, ShiftType[]>,
  } as StaffProfileRecord;
}

export async function createStaffProfile(input: {
  userId: string;
  facilityId: string;
  firstName: string;
  lastName: string;
  email: string;
  roleType?: StaffRoleType;
  unit?: string;
  qualifications?: string[];
  employmentType?: EmploymentType;
  availability?: Record<string, ShiftType[]>;
  maxHoursPerWeek?: number;
  phone?: string;
  notes?: string;
}): Promise<StaffProfileRecord> {
  const row = await prisma.staffProfile.create({
    data: {
      userId: input.userId,
      facilityId: input.facilityId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      roleType: input.roleType ?? "RN",
      unit: input.unit ?? "",
      qualifications: input.qualifications ?? [],
      employmentType: input.employmentType ?? "fulltime-permanent",
      availability: input.availability ?? {},
      maxHoursPerWeek: input.maxHoursPerWeek ?? 40,
      status: "active",
      phone: input.phone ?? "",
      notes: input.notes ?? "",
    },
  });
  return toRecord(row);
}

export async function findStaffByFacility(facilityId: string): Promise<StaffProfileRecord[]> {
  const rows = await prisma.staffProfile.findMany({ where: { facilityId } });
  return rows.map(toRecord);
}

export async function findStaffById(userId: string): Promise<StaffProfileRecord | null> {
  const row = await prisma.staffProfile.findUnique({ where: { userId } });
  return row ? toRecord(row) : null;
}

export async function findStaffByEmail(email: string): Promise<StaffProfileRecord | null> {
  const row = await prisma.staffProfile.findFirst({ where: { email: email.toLowerCase() } });
  return row ? toRecord(row) : null;
}

export async function findStaffByEmailAndFacility(
  email: string,
  facilityId: string,
): Promise<StaffProfileRecord | null> {
  const row = await prisma.staffProfile.findFirst({
    where: { email: email.toLowerCase(), facilityId },
  });
  return row ? toRecord(row) : null;
}

export async function updateStaffProfile(
  userId: string,
  patch: Partial<Omit<StaffProfileRecord, "userId" | "facilityId" | "email">>,
): Promise<StaffProfileRecord | null> {
  const data: Record<string, unknown> = { ...patch };
  const row = await prisma.staffProfile.update({ where: { userId }, data }).catch(() => null);
  return row ? toRecord(row) : null;
}

export async function deactivateStaff(userId: string): Promise<StaffProfileRecord | null> {
  const row = await prisma.staffProfile.update({
    where: { userId },
    data: { status: "inactive" },
  }).catch(() => null);
  return row ? toRecord(row) : null;
}
