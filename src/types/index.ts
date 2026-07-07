export type UserRole = "admin" | "staff" | "superadmin";
export type ShiftType = "day" | "evening" | "night" | "D12" | "N12" | "D8" | "N8";
export type StaffRoleType = "RN" | "PSW" | "LPN" | "LTCA" | "doctor" | "technician";
export type EmploymentType =
  | "fulltime-permanent"
  | "fulltime-temporary"
  | "parttime-permanent"
  | "parttime-temporary"
  | "casual"
  | "travel";
export type RequestStatus = "pending" | "approved" | "rejected";
export type ShiftStatus = "confirmed" | "pending" | "cancelled";
export type NotificationType =
  | "schedule_published"
  | "shift_updated"
  | "swap_approved"
  | "swap_rejected"
  | "time_off_approved"
  | "time_off_rejected"
  | "announcement";

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
};

export type User = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  facilityId: string;
};

export type StaffSnippet = {
  userId: string;
  firstName: string;
  lastName: string;
  roleType: StaffRoleType;
};

export type StaffProfile = {
  userId: string;
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

export type Shift = {
  shiftId: string;
  date: string;
  type: ShiftType;
  unit: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  status: ShiftStatus;
  publishedAt?: string;
  staff?: StaffSnippet;
};

export type SwapRequest = {
  swapRequestId: string;
  status: RequestStatus;
  submittedAt: string;
  note: string;
  requester: {
    userId: string;
    firstName: string;
    lastName: string;
    shift: { shiftId: string; date: string; type: ShiftType; unit: string };
  };
  targetStaff: {
    userId: string;
    firstName: string;
    lastName: string;
    shift: { shiftId: string; date: string; type: ShiftType; unit: string };
  };
};

export type TimeOffRequest = {
  requestId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: RequestStatus;
  adminNote: string | null;
  submittedAt: string;
  staff?: {
    userId: string;
    firstName: string;
    lastName: string;
    roleType: StaffRoleType;
    unit: string;
  };
};

export type Notification = {
  notificationId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export type Announcement = {
  announcementId: string;
  title: string;
  body: string;
  priority: "normal" | "urgent";
  createdAt: string;
};

export type ScheduleGap = {
  date: string;
  type: ShiftType;
  unit: string;
  requiredRole: StaffRoleType;
  message: string;
};

export type OvertimeRisk = {
  userId: string;
  projectedHours: number;
  threshold: number;
  message: string;
};
