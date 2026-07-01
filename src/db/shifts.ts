import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma";
import type { AIPreviewRecord, AIPreviewShift, ShiftRecord } from "./store";
import type { OvertimeRisk, ShiftType, StaffRoleType } from "../types";
import { findStaffByFacility } from "./staff";
import { findRequirementsByFacility } from "./requirements";
import { getOvertimeThresholdMap } from "./overtimeConfig";

// ─── Shift times by type ──────────────────────────────────────────────────────

export function shiftTimes(type: ShiftType): { startTime: string; endTime: string; durationHours: number } {
  const map: Record<ShiftType, { startTime: string; endTime: string; durationHours: number }> = {
    day:     { startTime: "07:00", endTime: "19:00", durationHours: 12 },
    evening: { startTime: "15:00", endTime: "23:00", durationHours: 8  },
    night:   { startTime: "19:00", endTime: "07:00", durationHours: 12 },
    D12:     { startTime: "07:00", endTime: "19:00", durationHours: 12 },
    N12:     { startTime: "19:00", endTime: "07:00", durationHours: 12 },
    D8:      { startTime: "07:00", endTime: "15:00", durationHours: 8  },
    N8:      { startTime: "23:00", endTime: "07:00", durationHours: 8  },
  };
  return map[type];
}

function toShiftRecord(row: unknown): ShiftRecord {
  return row as ShiftRecord;
}

// ─── Shift CRUD ───────────────────────────────────────────────────────────────

export async function createShift(input: {
  shiftId: string;
  facilityId: string;
  staffId: string;
  date: string;
  type: ShiftType;
  unit: string;
  startTime: string;
  endTime: string;
  durationHours: number;
}): Promise<ShiftRecord> {
  const row = await prisma.shift.create({
    data: {
      ...input,
      status: "confirmed",
      publishedAt: null,
      createdAt: new Date().toISOString(),
    },
  });
  return toShiftRecord(row);
}

export async function findShiftById(shiftId: string): Promise<ShiftRecord | null> {
  const row = await prisma.shift.findUnique({ where: { shiftId } });
  return row ? toShiftRecord(row) : null;
}

export async function findShiftsByStaffAndMonth(staffId: string, month: string): Promise<ShiftRecord[]> {
  const rows = await prisma.shift.findMany({
    where: { staffId, date: { startsWith: month } },
    orderBy: { date: "asc" },
  });
  return rows.map(toShiftRecord);
}

export async function findShiftsByFacilityAndMonth(facilityId: string, month: string): Promise<ShiftRecord[]> {
  const rows = await prisma.shift.findMany({
    where: { facilityId, date: { startsWith: month } },
    orderBy: { date: "asc" },
  });
  return rows.map(toShiftRecord);
}

export async function updateShift(
  shiftId: string,
  patch: { date?: string; type?: ShiftType; staffId?: string; unit?: string },
): Promise<ShiftRecord | null> {
  const existing = await prisma.shift.findUnique({ where: { shiftId } });
  if (!existing) return null;

  const newType = patch.type ?? (existing.type as ShiftType);
  const times = patch.type ? shiftTimes(newType) : {
    startTime: existing.startTime,
    endTime: existing.endTime,
    durationHours: existing.durationHours,
  };

  const row = await prisma.shift.update({
    where: { shiftId },
    data: {
      ...(patch.date && { date: patch.date }),
      ...(patch.type && { type: newType, ...times }),
      ...(patch.staffId && { staffId: patch.staffId }),
      ...(patch.unit && { unit: patch.unit }),
    },
  });
  return toShiftRecord(row);
}

export async function deleteShift(shiftId: string): Promise<boolean> {
  const result = await prisma.shift.delete({ where: { shiftId } }).catch(() => null);
  return result !== null;
}

export async function createShiftsBulk(shifts: ShiftRecord[]): Promise<ShiftRecord[]> {
  await prisma.shift.createMany({ data: shifts });
  return shifts;
}

// ─── Publish schedule ─────────────────────────────────────────────────────────

export async function publishSchedule(
  facilityId: string,
  month: string,
): Promise<{ publishedAt: string; notifiedCount: number }> {
  const publishedAt = new Date().toISOString();

  const shifts = await prisma.shift.findMany({
    where: { facilityId, date: { startsWith: month } },
  });

  const staffIds = [...new Set(shifts.map((s) => s.staffId))];

  await prisma.$transaction([
    prisma.shift.updateMany({
      where: { facilityId, date: { startsWith: month } },
      data: { publishedAt },
    }),
    prisma.publishedSchedule.upsert({
      where: { facilityId_month: { facilityId, month } },
      create: { facilityId, month, publishedAt },
      update: { publishedAt },
    }),
  ]);

  return { publishedAt, notifiedCount: staffIds.length };
}

export async function isSchedulePublished(facilityId: string, month: string): Promise<boolean> {
  const row = await prisma.publishedSchedule.findUnique({
    where: { facilityId_month: { facilityId, month } },
  });
  return row !== null;
}

// ─── AI preview ───────────────────────────────────────────────────────────────

export async function saveAIPreview(facilityId: string, month: string, shifts: AIPreviewShift[]): Promise<void> {
  await prisma.aIPreview.upsert({
    where: { facilityId_month: { facilityId, month } },
    create: { facilityId, month, generatedAt: new Date().toISOString(), shifts: shifts as object[] },
    update: { generatedAt: new Date().toISOString(), shifts: shifts as object[] },
  });
}

export async function getAIPreview(facilityId: string, month: string): Promise<AIPreviewRecord | null> {
  const row = await prisma.aIPreview.findUnique({
    where: { facilityId_month: { facilityId, month } },
  });
  if (!row) return null;
  return {
    facilityId: row.facilityId,
    month: row.month,
    generatedAt: row.generatedAt,
    shifts: row.shifts as AIPreviewShift[],
  };
}

export async function clearAIPreview(facilityId: string, month: string): Promise<void> {
  await prisma.aIPreview.delete({
    where: { facilityId_month: { facilityId, month } },
  }).catch(() => null);
}

// ─── Copy schedule forward ────────────────────────────────────────────────────

export async function copyShiftsToMonth(
  facilityId: string,
  sourceMonth: string,
  targetMonth: string,
): Promise<{ copiedCount: number; skippedCount: number }> {
  const sourceShifts = await findShiftsByFacilityAndMonth(facilityId, sourceMonth);
  if (sourceShifts.length === 0) return { copiedCount: 0, skippedCount: 0 };

  const [targetYear, targetMonStr] = targetMonth.split("-").map(Number);
  const now = new Date().toISOString();

  let skippedCount = 0;
  const newShifts: ShiftRecord[] = [];

  for (const shift of sourceShifts) {
    const day = parseInt(shift.date.split("-")[2]);
    // Verify the day exists in the target month (handles Jan 31 → Feb, etc.)
    const candidate = new Date(targetYear, targetMonStr - 1, day);
    if (candidate.getMonth() + 1 !== targetMonStr) {
      skippedCount++;
      continue;
    }
    const dayStr = String(day).padStart(2, "0");
    newShifts.push({
      shiftId: `shf_${uuidv4().slice(0, 8)}`,
      facilityId,
      staffId: shift.staffId,
      date: `${targetMonth}-${dayStr}`,
      type: shift.type,
      unit: shift.unit,
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationHours: shift.durationHours,
      status: "confirmed",
      publishedAt: null,
      createdAt: now,
    });
  }

  if (newShifts.length > 0) {
    await prisma.shift.createMany({ data: newShifts });
  }

  return { copiedCount: newShifts.length, skippedCount };
}

// ─── Overtime risk calculation ────────────────────────────────────────────────

function getMondayDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offset);
  return monday.toISOString().slice(0, 10);
}

// Returns the Monday that starts the biweekly pay period containing the given date.
// Pay periods are anchored to the first Monday of ISO week 1 each year,
// so weeks pair up as (1,2), (3,4), (5,6), … regardless of month.
function getBiweeklyPeriodStart(dateStr: string): string {
  const monday = getMondayDate(dateStr);
  const d = new Date(monday);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const weekNum = Math.floor((d.getTime() - yearStart.getTime()) / msPerWeek);
  if (weekNum % 2 === 1) d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export async function calcOvertimeRisks(facilityId: string, month: string): Promise<OvertimeRisk[]> {
  const [shifts, staffProfiles, thresholds] = await Promise.all([
    findShiftsByFacilityAndMonth(facilityId, month),
    findStaffByFacility(facilityId),
    getOvertimeThresholdMap(facilityId),
  ]);

  // Accumulate hours per staff per biweekly period
  const biweeklyHours: Record<string, Record<string, number>> = {};

  for (const shift of shifts) {
    const periodKey = getBiweeklyPeriodStart(shift.date);
    if (!biweeklyHours[shift.staffId]) biweeklyHours[shift.staffId] = {};
    biweeklyHours[shift.staffId][periodKey] =
      (biweeklyHours[shift.staffId][periodKey] ?? 0) + shift.durationHours;
  }

  const risks: OvertimeRisk[] = [];

  for (const [staffId, periods] of Object.entries(biweeklyHours)) {
    const profile = staffProfiles.find((p) => p.userId === staffId);
    if (!profile) continue;

    const threshold = thresholds[profile.employmentType];
    if (threshold === null || threshold === undefined) continue; // no biweekly OT rule

    for (const [periodStart, hours] of Object.entries(periods)) {
      if (hours > threshold) {
        risks.push({
          userId: staffId,
          projectedHours: hours,
          threshold,
          message: `${profile.firstName} ${profile.lastName} projected ${hours} hrs in the biweekly period starting ${periodStart} (limit ${threshold} hrs)`,
        });
      }
    }
  }

  return risks;
}

// ─── Gap detection against staffing requirements ─────────────────────────────

export async function calcGaps(
  facilityId: string,
  month: string,
): Promise<Array<{ date: string; type: ShiftType; unit: string; requiredRole: StaffRoleType; message: string }>> {
  const [shifts, requirements, staffProfiles] = await Promise.all([
    findShiftsByFacilityAndMonth(facilityId, month),
    findRequirementsByFacility(facilityId),
    findStaffByFacility(facilityId),
  ]);

  if (requirements.length === 0) return [];

  const [yearStr, monthStr] = month.split("-").map(Number);
  const daysInMonth = new Date(yearStr, monthStr, 0).getDate();
  const gaps: Array<{ date: string; type: ShiftType; unit: string; requiredRole: StaffRoleType; message: string }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const dayShifts = shifts.filter((s) => s.date === dateStr);

    for (const req of requirements) {
      if (req.minCount === 0) continue;

      const filled = dayShifts.filter((s) => {
        if (s.type !== req.shiftType || s.unit !== req.unit) return false;
        const staff = staffProfiles.find((p) => p.userId === s.staffId);
        return staff?.roleType === req.requiredRole;
      }).length;

      if (filled < req.minCount) {
        gaps.push({
          date: dateStr,
          type: req.shiftType,
          unit: req.unit,
          requiredRole: req.requiredRole,
          message: `${req.unit} ${req.shiftType} shift needs ${req.minCount} ${req.requiredRole}(s) — only ${filled} assigned on ${dateStr}`,
        });
      }
    }
  }

  return gaps;
}
