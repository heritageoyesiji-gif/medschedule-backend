import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import {
  clearAIPreview,
  createShiftsBulk,
  findShiftsByFacilityAndMonth,
  getAIPreview,
  saveAIPreview,
  shiftTimes,
} from "../db/shifts";
import { findStaffByFacility } from "../db/staff";
import { findRequirementsByFacility } from "../db/requirements";
import { config } from "../config";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../utils/response";
import type { ShiftRecord, AIPreviewShift } from "../db/store";
import type { ShiftType } from "../types";

const router = Router();

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type ScheduleToolInput = {
  assignments: Array<{ staffId: string; date: string; shiftType: string }>;
  warnings: string[];
};

const SUBMIT_SCHEDULE_TOOL: Anthropic.Tool = {
  name: "submit_schedule",
  description: "Submit the generated shift assignments for the month.",
  input_schema: {
    type: "object" as const,
    required: ["assignments", "warnings"],
    properties: {
      assignments: {
        type: "array",
        description: "Array of shift assignments. Each entry assigns one staff member to one shift.",
        items: {
          type: "object",
          required: ["staffId", "date", "shiftType"],
          properties: {
            staffId: { type: "string", description: "The staff member's userId" },
            date: { type: "string", description: "Date in YYYY-MM-DD format" },
            shiftType: {
              type: "string",
              enum: ["day", "evening", "night", "D12", "N12", "D8", "N8"],
              description: "Type of shift",
            },
          },
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Warnings about constraints that could not be fully satisfied",
      },
    },
  },
};

function buildPrompt(
  command: string,
  month: string,
  daysInMonth: number,
  staffJson: string,
  requirementsText: string,
  existingShiftsText: string,
): string {
  const daysList = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const dow = DAYS_OF_WEEK[new Date(dateStr).getDay()];
    return `${dateStr} (${dow})`;
  }).join(", ");

  return `You are an expert healthcare workforce scheduling assistant. Generate shift assignments for a medical facility based on the admin's command and the constraints below.

ADMIN COMMAND: "${command}"

MONTH: ${month}
DATES: ${daysList}

STAFF:
${staffJson}

STAFFING REQUIREMENTS (minimum staff count per shift per unit — 0 means no requirement):
${requirementsText}

${existingShiftsText}

RULES — follow all of these strictly:
1. Only assign a staff member to a shift if their availability list for that weekday includes that shift type.
2. Day and night shifts are 12 hours. Evening shifts are 8 hours. Respect each staff member's maxHoursPerWeek — do not exceed it across a 7-day window.
3. Never assign the same staff member to more than one shift on the same date.
4. Match the unit from the staff member's profile when assigning.
5. For "Generate" commands: produce a complete schedule satisfying all requirements across the full month.
6. For "Reduce overtime" commands: remove or redistribute shifts from staff who exceed their maxHoursPerWeek without dropping below requirement minimums.
7. For "Fill" or "gaps" commands: only add missing shifts where requirements are not currently met; do not touch existing assignments.
8. Report as warnings any requirements you cannot satisfy (e.g., no qualified staff available on a given day).

Call the submit_schedule tool with your result.`;
}

// 5.1 Generate AI Schedule Preview
router.post("/ai/generate-schedule", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId, month, command } = req.body as {
    facilityId?: string;
    month?: string;
    command?: string;
  };

  if (!facilityId || !month || !command) {
    sendError(res, 400, "VALIDATION_ERROR", "facilityId, month, and command are required");
    return;
  }

  if (!config.anthropicApiKey) {
    sendError(res, 503, "AI_UNAVAILABLE", "AI scheduling is not configured — set ANTHROPIC_API_KEY in .env");
    return;
  }

  const [allStaff, requirements] = await Promise.all([
    findStaffByFacility(facilityId),
    findRequirementsByFacility(facilityId),
  ]);

  const activeStaff = allStaff.filter((s) => s.status === "active");
  if (activeStaff.length === 0) {
    sendError(res, 400, "NO_STAFF", "No active staff found for this facility");
    return;
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Build compact staff JSON for the prompt
  const staffJson = JSON.stringify(
    activeStaff.map((s) => ({
      staffId: s.userId,
      name: `${s.firstName} ${s.lastName}`,
      roleType: s.roleType,
      unit: s.unit || "General Ward",
      availability: s.availability,
      maxHoursPerWeek: s.maxHoursPerWeek,
    })),
    null,
    2,
  );

  // Build requirements text
  const requirementsText =
    requirements.length === 0
      ? "No staffing requirements defined."
      : JSON.stringify(
          requirements.map((r) => ({
            unit: r.unit,
            shiftType: r.shiftType,
            requiredRole: r.requiredRole,
            minCount: r.minCount,
          })),
          null,
          2,
        );

  // For modify commands, include current shifts
  let existingShiftsText = "";
  const commandLower = command.toLowerCase();
  const isModifyCommand =
    commandLower.includes("overtime") ||
    commandLower.includes("gap") ||
    commandLower.includes("fill") ||
    commandLower.includes("missing");

  if (isModifyCommand) {
    const existing = await findShiftsByFacilityAndMonth(facilityId, month);
    if (existing.length > 0) {
      existingShiftsText = `EXISTING SHIFTS (do not duplicate these; modify around them as instructed):\n${JSON.stringify(
        existing.map((s) => ({ shiftId: s.shiftId, staffId: s.staffId, date: s.date, type: s.type, unit: s.unit })),
        null,
        2,
      )}`;
    }
  }

  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  let aiResponse;
  try {
    aiResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      tools: [SUBMIT_SCHEDULE_TOOL],
      tool_choice: { type: "tool", name: "submit_schedule" },
      messages: [
        {
          role: "user",
          content: buildPrompt(command, month, daysInMonth, staffJson, requirementsText, existingShiftsText),
        },
      ],
    });
  } catch (err) {
    console.error("[ai] Anthropic SDK error:", err);
    sendError(res, 503, "AI_UNAVAILABLE", "AI service request failed — check ANTHROPIC_API_KEY and try again");
    return;
  }

  const toolUseBlock = aiResponse.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    sendError(res, 500, "AI_ERROR", "AI did not return a schedule");
    return;
  }

  const { assignments, warnings } = toolUseBlock.input as ScheduleToolInput;

  // Convert assignments to AIPreviewShift records (validate + enrich)
  const staffMap = new Map(activeStaff.map((s) => [s.userId, s]));
  const generated: AIPreviewShift[] = [];

  for (const a of assignments) {
    const staff = staffMap.get(a.staffId);
    if (!staff) continue;
    const type = a.shiftType as ShiftType;
    if (!["day", "evening", "night", "D12", "N12", "D8", "N8"].includes(type)) continue;
    const times = shiftTimes(type);
    generated.push({
      staffId: a.staffId,
      date: a.date,
      type,
      unit: staff.unit || "General Ward",
      startTime: times.startTime,
      endTime: times.endTime,
      durationHours: times.durationHours,
    });
  }

  await saveAIPreview(facilityId, month, generated);

  sendSuccess(res, {
    month,
    generatedShifts: generated,
    totalShifts: generated.length,
    warnings,
    saved: false,
  });
});

// 5.2 Confirm AI-Generated Schedule
router.post("/ai/generate-schedule/confirm", requireAuth, requireRole("admin"), async (req, res) => {
  const { facilityId, month } = req.body as { facilityId?: string; month?: string };

  if (!facilityId || !month) {
    sendError(res, 400, "VALIDATION_ERROR", "facilityId and month are required");
    return;
  }

  const preview = await getAIPreview(facilityId, month);
  if (!preview) {
    sendError(res, 400, "NO_PREVIEW", "No AI preview found — generate a preview first");
    return;
  }

  const shiftRecords: ShiftRecord[] = preview.shifts.map((s) => ({
    shiftId: `shf_${uuidv4().slice(0, 8)}`,
    facilityId,
    staffId: s.staffId,
    date: s.date,
    type: s.type,
    unit: s.unit,
    startTime: s.startTime,
    endTime: s.endTime,
    durationHours: s.durationHours,
    status: "confirmed" as const,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  }));

  await createShiftsBulk(shiftRecords);
  await clearAIPreview(facilityId, month);

  sendSuccess(res, { savedShifts: shiftRecords.length, month }, 201);
});

export default router;
