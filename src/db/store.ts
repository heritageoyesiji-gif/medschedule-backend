// Type-only exports — data is now stored in PostgreSQL via Prisma.
// These types mirror the Prisma model shapes for use across the codebase.

import type {
  EmploymentType,
  NotificationType,
  RequestStatus,
  ShiftStatus,
  ShiftType,
  StaffRoleType,
  UserRole,
} from "../types";

export type UserRecord = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  facilityId: string;
  status: "active" | "inactive";
  createdAt: string;
};

export type OneTimeToken = {
  token: string;
  userId: string;
  expiresAt: string;
  used: boolean;
};

export type FacilityRecord = {
  facilityId: string;
  name: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  adminUserId: string;
  createdAt: string;
};

export type StaffProfileRecord = {
  userId: string;
  facilityId: string;
  firstName: string;
  lastName: string;
  email: string;
  roleType: StaffRoleType;
  unit: string;
  qualifications: string[];
  employmentType: EmploymentType;
  availability: Record<string, ShiftType[]>;
  maxHoursPerWeek: number;
  status: "active" | "inactive";
  phone: string;
  notes: string;
};

export type ShiftRecord = {
  shiftId: string;
  facilityId: string;
  staffId: string;
  date: string;
  type: ShiftType;
  unit: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  status: ShiftStatus;
  publishedAt: string | null;
  createdAt: string;
};

export type AIPreviewShift = {
  staffId: string;
  date: string;
  type: ShiftType;
  unit: string;
  startTime: string;
  endTime: string;
  durationHours: number;
};

export type AIPreviewRecord = {
  facilityId: string;
  month: string;
  generatedAt: string;
  shifts: AIPreviewShift[];
};

export type SwapRequestRecord = {
  swapRequestId: string;
  facilityId: string;
  requesterId: string;
  targetStaffId: string;
  requesterShiftId: string;
  targetShiftId: string;
  note: string;
  status: RequestStatus;
  adminNote: string | null;
  submittedAt: string;
};

export type TimeOffRequestRecord = {
  requestId: string;
  facilityId: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: RequestStatus;
  adminNote: string | null;
  submittedAt: string;
};

export type NotificationRecord = {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export type AnnouncementRecord = {
  announcementId: string;
  facilityId: string;
  title: string;
  body: string;
  priority: "normal" | "urgent";
  createdAt: string;
};

export type PublishedScheduleRecord = {
  facilityId: string;
  month: string;
  publishedAt: string;
};
