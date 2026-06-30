import { prisma } from "./prisma";

export type ShiftTypeConfig = {
  shiftType: string;
  label: string;
  startTime: string;
  endTime: string;
  durationHours: number;
};

export const ALL_SHIFT_TYPE_DEFAULTS: ShiftTypeConfig[] = [
  { shiftType: "day",     label: "Day",     startTime: "07:00", endTime: "19:00", durationHours: 12 },
  { shiftType: "evening", label: "Evening", startTime: "15:00", endTime: "23:00", durationHours: 8  },
  { shiftType: "night",   label: "Night",   startTime: "19:00", endTime: "07:00", durationHours: 12 },
  { shiftType: "D12",     label: "D12",     startTime: "07:00", endTime: "19:00", durationHours: 12 },
  { shiftType: "N12",     label: "N12",     startTime: "19:00", endTime: "07:00", durationHours: 12 },
  { shiftType: "D8",      label: "D8",      startTime: "07:00", endTime: "15:00", durationHours: 8  },
  { shiftType: "N8",      label: "N8",      startTime: "23:00", endTime: "07:00", durationHours: 8  },
];

const defaultsMap = new Map(ALL_SHIFT_TYPE_DEFAULTS.map((d) => [d.shiftType, d]));

export async function getFacilityShiftConfig(facilityId: string): Promise<ShiftTypeConfig[]> {
  const overrides = await prisma.facilityShiftConfig.findMany({ where: { facilityId } });
  const overrideMap = new Map(overrides.map((o) => [o.shiftType, o]));

  return ALL_SHIFT_TYPE_DEFAULTS.map((def) => {
    const o = overrideMap.get(def.shiftType);
    if (o) {
      return { shiftType: o.shiftType, label: o.label, startTime: o.startTime, endTime: o.endTime, durationHours: o.durationHours };
    }
    return def;
  });
}

export async function upsertShiftTypeConfig(
  facilityId: string,
  shiftType: string,
  patch: Partial<Omit<ShiftTypeConfig, "shiftType">>,
): Promise<ShiftTypeConfig> {
  const defaults = defaultsMap.get(shiftType);
  if (!defaults) throw new Error(`Unknown shift type: ${shiftType}`);

  const row = await prisma.facilityShiftConfig.upsert({
    where: { facilityId_shiftType: { facilityId, shiftType } },
    create: {
      facilityId,
      shiftType,
      label: patch.label ?? defaults.label,
      startTime: patch.startTime ?? defaults.startTime,
      endTime: patch.endTime ?? defaults.endTime,
      durationHours: patch.durationHours ?? defaults.durationHours,
    },
    update: {
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.startTime !== undefined && { startTime: patch.startTime }),
      ...(patch.endTime !== undefined && { endTime: patch.endTime }),
      ...(patch.durationHours !== undefined && { durationHours: patch.durationHours }),
    },
  });

  return { shiftType: row.shiftType, label: row.label, startTime: row.startTime, endTime: row.endTime, durationHours: row.durationHours };
}

export async function resetShiftTypeConfig(facilityId: string, shiftType: string): Promise<void> {
  await prisma.facilityShiftConfig
    .delete({ where: { facilityId_shiftType: { facilityId, shiftType } } })
    .catch(() => null);
}
