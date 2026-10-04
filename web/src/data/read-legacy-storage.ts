import { LEGACY_DAYS_OFF_KEY, LEGACY_HABITS_KEY } from "../domain/constants";
import type { LegacyTrackerData } from "../domain/import-legacy";

/**
 * Reads the original page's browser storage, if it is still present on this device.
 */
export function readLegacyStorage(storage: Storage): LegacyTrackerData | null {
  const checksRaw = storage.getItem(LEGACY_HABITS_KEY);
  const daysOffRaw = storage.getItem(LEGACY_DAYS_OFF_KEY);
  if (checksRaw === null && daysOffRaw === null) {
    return null;
  }
  return {
    checks: readCheckMap(checksRaw),
    daysOff: readDayOffMap(daysOffRaw),
  };
}

function readCheckMap(raw: string | null): LegacyTrackerData["checks"] {
  const parsed = readJson(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const checks: Record<string, Record<string, boolean>> = {};
  for (const [habitId, dates] of Object.entries(parsed)) {
    if (typeof dates !== "object" || dates === null) {
      continue;
    }
    const dayMap: Record<string, boolean> = {};
    for (const [date, checked] of Object.entries(dates)) {
      if (checked === true) {
        dayMap[date] = true;
      }
    }
    checks[habitId] = dayMap;
  }
  return checks;
}

function readDayOffMap(raw: string | null): LegacyTrackerData["daysOff"] {
  const parsed = readJson(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const daysOff: Record<string, boolean> = {};
  for (const [date, isOff] of Object.entries(parsed)) {
    if (isOff === true) {
      daysOff[date] = true;
    }
  }
  return daysOff;
}

function readJson(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
