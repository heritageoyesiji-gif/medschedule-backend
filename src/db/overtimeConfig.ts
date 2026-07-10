import { prisma } from "./prisma";
import type { EmploymentType } from "../types";

export type OvertimeConfig = {
  employmentType: EmploymentType;
  biweeklyHours: number | null; // null = no biweekly OT threshold
};

// System defaults — used when a facility has not overridden a given employment type.
export const OVERTIME_DEFAULTS: OvertimeConfig[] = [
  { employmentType: "fulltime-permanent", biweeklyHours: 80 },
  { employmentType: "fulltime-temporary", biweeklyHours: 80 },
  { employmentType: "parttime-permanent", biweeklyHours: 60 },
  { employmentType: "parttime-temporary", biweeklyHours: 60 },
  { employmentType: "casual",             biweeklyHours: null },
  { employmentType: "travel",             biweeklyHours: 80 },
];

export const EMPLOYMENT_TYPES = OVERTIME_DEFAULTS.map((d) => d.employmentType);

// Returns the full config for a facility: defaults merged with any per-facility overrides.
export async function getFacilityOvertimeConfig(facilityId: string): Promise<OvertimeConfig[]> {
  const overrides = await prisma.facilityOvertimeConfig.findMany({ where: { facilityId } });
  const overrideMap = new Map(overrides.map((o) => [o.employmentType, o]));

  return OVERTIME_DEFAULTS.map((def) => {
    const o = overrideMap.get(def.employmentType);
    if (o) {
      return { employmentType: o.employmentType as EmploymentType, biweeklyHours: o.biweeklyHours };
    }
    return def;
  });
}

// Convenience lookup keyed by employment type, for OT calculations.
export async function getOvertimeThresholdMap(
  facilityId: string,
): Promise<Record<EmploymentType, number | null>> {
  const configs = await getFacilityOvertimeConfig(facilityId);
  const map = {} as Record<EmploymentType, number | null>;
  for (const c of configs) map[c.employmentType] = c.biweeklyHours;
  return map;
}

export async function upsertOvertimeConfig(
  facilityId: string,
  employmentType: EmploymentType,
  biweeklyHours: number | null,
): Promise<OvertimeConfig> {
  const row = await prisma.facilityOvertimeConfig.upsert({
    where: { facilityId_employmentType: { facilityId, employmentType } },
    create: { facilityId, employmentType, biweeklyHours },
    update: { biweeklyHours },
  });
  return { employmentType: row.employmentType as EmploymentType, biweeklyHours: row.biweeklyHours };
}

export async function resetOvertimeConfig(facilityId: string, employmentType: EmploymentType): Promise<void> {
  await prisma.facilityOvertimeConfig
    .delete({ where: { facilityId_employmentType: { facilityId, employmentType } } })
    .catch(() => null);
}
