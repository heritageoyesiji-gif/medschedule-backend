-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Facility" (
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("facilityId")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "userId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleType" TEXT NOT NULL DEFAULT 'RN',
    "unit" TEXT NOT NULL DEFAULT '',
    "qualifications" JSONB NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'full-time',
    "availability" JSONB NOT NULL,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 40,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Shift" (
    "shiftId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "publishedAt" TEXT,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("shiftId")
);

-- CreateTable
CREATE TABLE "AIPreview" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "generatedAt" TEXT NOT NULL,
    "shifts" JSONB NOT NULL,

    CONSTRAINT "AIPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapRequest" (
    "swapRequestId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetStaffId" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetShiftId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "submittedAt" TEXT NOT NULL,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("swapRequestId")
);

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "requestId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "submittedAt" TEXT NOT NULL,

    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "announcementId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("announcementId")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "QrLoginToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QrLoginToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "PublishedSchedule" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "publishedAt" TEXT NOT NULL,

    CONSTRAINT "PublishedSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvite" (
    "token" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "FacilityShiftConfig" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "shiftType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FacilityShiftConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingRequirement" (
    "requirementId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "shiftType" TEXT NOT NULL,
    "requiredRole" TEXT NOT NULL,
    "minCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StaffingRequirement_pkey" PRIMARY KEY ("requirementId")
);

-- CreateTable
CREATE TABLE "FacilityOvertimeConfig" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "biweeklyHours" INTEGER,

    CONSTRAINT "FacilityOvertimeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Facility_adminUserId_idx" ON "Facility"("adminUserId");

-- CreateIndex
CREATE INDEX "StaffProfile_facilityId_idx" ON "StaffProfile"("facilityId");

-- CreateIndex
CREATE INDEX "Shift_facilityId_date_idx" ON "Shift"("facilityId", "date");

-- CreateIndex
CREATE INDEX "Shift_staffId_date_idx" ON "Shift"("staffId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AIPreview_facilityId_month_key" ON "AIPreview"("facilityId", "month");

-- CreateIndex
CREATE INDEX "SwapRequest_facilityId_idx" ON "SwapRequest"("facilityId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_facilityId_idx" ON "TimeOffRequest"("facilityId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_staffId_idx" ON "TimeOffRequest"("staffId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Announcement_facilityId_idx" ON "Announcement"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSchedule_facilityId_month_key" ON "PublishedSchedule"("facilityId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityShiftConfig_facilityId_shiftType_key" ON "FacilityShiftConfig"("facilityId", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "StaffingRequirement_facilityId_unit_shiftType_requiredRole_key" ON "StaffingRequirement"("facilityId", "unit", "shiftType", "requiredRole");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityOvertimeConfig_facilityId_employmentType_key" ON "FacilityOvertimeConfig"("facilityId", "employmentType");

