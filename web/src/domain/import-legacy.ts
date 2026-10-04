import { isDateKey } from "./date-key";
import type { DayEntry, Habit } from "./habit";

/** Shape of the original `localStorage` payload. */
export interface LegacyTrackerData {
  readonly checks: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  readonly daysOff: Readonly<Record<string, boolean>>;
}

/**
 * Copies legacy checks onto the account checklist.
 * Unknown habit ids and impossible dates are ignored.
 */
export function importLegacyData(input: {
  readonly legacy: LegacyTrackerData;
  readonly habits: readonly Habit[];
}): Readonly<Record<string, DayEntry>> {
  const knownIds = new Set(input.habits.map((habit) => habit.id));
  const entries: Record<string, DayEntry> = {};
  for (const [habitId, dates] of Object.entries(input.legacy.checks)) {
    if (!knownIds.has(habitId)) {
      continue;
    }
    for (const [date, checked] of Object.entries(dates)) {
      if (!isDateKey(date) || checked !== true) {
        continue;
      }
      const current = entries[date] ?? { habits: {}, dayOff: false };
      entries[date] = {
        dayOff: current.dayOff,
        habits: { ...current.habits, [habitId]: true },
      };
    }
  }
  for (const [date, isOff] of Object.entries(input.legacy.daysOff)) {
    if (!isDateKey(date) || isOff !== true) {
      continue;
    }
    const current = entries[date] ?? { habits: {}, dayOff: false };
    entries[date] = { habits: current.habits, dayOff: true };
  }
  return entries;
}
