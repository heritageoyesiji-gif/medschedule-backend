import { prisma } from "./prisma";
import type { SwapRequestRecord, TimeOffRequestRecord } from "./store";
import type { RequestStatus } from "../types";

// ─── Swap requests ────────────────────────────────────────────────────────────

export async function createSwapRequest(input: {
  swapRequestId: string;
  facilityId: string;
  requesterId: string;
  targetStaffId: string;
  requesterShiftId: string;
  targetShiftId: string;
  note: string;
}): Promise<SwapRequestRecord> {
  const row = await prisma.swapRequest.create({
    data: {
      ...input,
      status: "pending",
      adminNote: null,
      submittedAt: new Date().toISOString(),
    },
  });
  return row as SwapRequestRecord;
}

export async function findSwapsByFacility(
  facilityId: string,
  status?: RequestStatus,
): Promise<SwapRequestRecord[]> {
  const rows = await prisma.swapRequest.findMany({
    where: { facilityId, ...(status && { status }) },
    orderBy: { submittedAt: "desc" },
  });
  return rows as SwapRequestRecord[];
}

export async function findSwapById(swapRequestId: string): Promise<SwapRequestRecord | null> {
  const row = await prisma.swapRequest.findUnique({ where: { swapRequestId } });
  return row as SwapRequestRecord | null;
}

export async function respondToSwap(
  swapRequestId: string,
  status: "approved" | "rejected",
  adminNote?: string,
): Promise<SwapRequestRecord | null> {
  const row = await prisma.swapRequest.update({
    where: { swapRequestId },
    data: { status, adminNote: adminNote ?? null },
  }).catch(() => null);
  return row as SwapRequestRecord | null;
}

// ─── Time off requests ────────────────────────────────────────────────────────

export async function createTimeOffRequest(input: {
  requestId: string;
  facilityId: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<TimeOffRequestRecord> {
  const row = await prisma.timeOffRequest.create({
    data: {
      ...input,
      status: "pending",
      adminNote: null,
      submittedAt: new Date().toISOString(),
    },
  });
  return row as TimeOffRequestRecord;
}

export async function findTimeOffByStaff(staffId: string): Promise<TimeOffRequestRecord[]> {
  const rows = await prisma.timeOffRequest.findMany({
    where: { staffId },
    orderBy: { submittedAt: "desc" },
  });
  return rows as TimeOffRequestRecord[];
}

export async function findTimeOffByFacility(
  facilityId: string,
  status?: RequestStatus,
): Promise<TimeOffRequestRecord[]> {
  const rows = await prisma.timeOffRequest.findMany({
    where: { facilityId, ...(status && { status }) },
    orderBy: { submittedAt: "desc" },
  });
  return rows as TimeOffRequestRecord[];
}

export async function findTimeOffById(requestId: string): Promise<TimeOffRequestRecord | null> {
  const row = await prisma.timeOffRequest.findUnique({ where: { requestId } });
  return row as TimeOffRequestRecord | null;
}

export async function respondToTimeOff(
  requestId: string,
  status: "approved" | "rejected",
  adminNote?: string,
): Promise<TimeOffRequestRecord | null> {
  const row = await prisma.timeOffRequest.update({
    where: { requestId },
    data: { status, adminNote: adminNote ?? null },
  }).catch(() => null);
  return row as TimeOffRequestRecord | null;
}
