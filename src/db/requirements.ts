import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma";
import type { ShiftType, StaffRoleType } from "../types";

export type StaffingRequirementRecord = {
  requirementId: string;
  facilityId: string;
  unit: string;
  shiftType: ShiftType;
  requiredRole: StaffRoleType;
  minCount: number;
};

function toRecord(row: unknown): StaffingRequirementRecord {
  const r = row as Record<string, unknown>;
  return {
    requirementId: r.requirementId as string,
    facilityId: r.facilityId as string,
    unit: r.unit as string,
    shiftType: r.shiftType as ShiftType,
    requiredRole: r.requiredRole as StaffRoleType,
    minCount: r.minCount as number,
  };
}

export async function findRequirementsByFacility(
  facilityId: string,
): Promise<StaffingRequirementRecord[]> {
  const rows = await prisma.staffingRequirement.findMany({ where: { facilityId } });
  return rows.map(toRecord);
}

export async function replaceRequirements(
  facilityId: string,
  requirements: Array<{
    unit: string;
    shiftType: string;
    requiredRole: string;
    minCount: number;
  }>,
): Promise<StaffingRequirementRecord[]> {
  await prisma.staffingRequirement.deleteMany({ where: { facilityId } });

  if (requirements.length === 0) return [];

  const records = requirements.map((r) => ({
    requirementId: `req_${uuidv4().slice(0, 8)}`,
    facilityId,
    unit: r.unit,
    shiftType: r.shiftType,
    requiredRole: r.requiredRole,
    minCount: r.minCount,
  }));

  await prisma.staffingRequirement.createMany({ data: records });
  return records.map(toRecord);
}
