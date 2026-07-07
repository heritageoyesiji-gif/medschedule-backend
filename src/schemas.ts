import { z } from "zod";

// ─── Shared enum + format schemas (single source of truth for request bodies) ──

export const shiftTypeSchema = z.enum(["day", "evening", "night", "D12", "N12", "D8", "N8"]);

export const staffRoleTypeSchema = z.enum(["RN", "PSW", "LPN", "LTCA", "doctor", "technician"]);

export const employmentTypeSchema = z.enum([
  "fulltime-permanent",
  "fulltime-temporary",
  "parttime-permanent",
  "parttime-temporary",
  "casual",
  "travel",
]);

export const userRoleSchema = z.enum(["admin", "staff", "superadmin"]);

export const emailSchema = z.string().trim().email();

// "YYYY-MM"
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "must be in YYYY-MM format");

// "YYYY-MM-DD"
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be in YYYY-MM-DD format");

// "HH:MM" 24-hour
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be in HH:MM format");

// availability map: { monday: ["day","evening"], ... }
// Availability is expressed in the three base shift windows.
export const availabilityShiftSchema = z.enum(["day", "evening", "night"]);
export const availabilitySchema = z.record(z.string(), z.array(availabilityShiftSchema));

export const nonEmptyString = z.string().trim().min(1);
