import { listDates, isWeekday } from "./date-key";
import { listExpectedHabits, type DayEntry, type Habit } from "./habit";

/** How a single day contributes to the heatmap and the score. */
export interface VisibleDayScore {
  readonly isOff: boolean;
  readonly done: number;
  readonly expected: number;
}

/** Value stored on a partner-visible summary. Counts only, never item names. */
export type DaySummaryValue = "off" | { readonly done: number; readonly expected: number };

/** Heatmap color for a day. */
export type HeatmapLevel = "off" | "empty" | "none" | "partial" | "complete";

/** Global score for one account over a date window. */
export interface TrackerSummary {
  readonly completionRate: number;
  readonly currentStreak: number;
  readonly perfectDays: number;
  readonly eligibleDays: number;
  readonly days: Readonly<Record<string, DaySummaryValue>>;
}

/**
 * Scores one date from the items that were active that day.
 */
export function scoreVisibleDay(input: {
  readonly date: string;
  readonly habits: readonly Habit[];
  readonly entry: DayEntry | null;
  readonly weekdaysOnly: boolean;
}): VisibleDayScore {
  if (input.weekdaysOnly && !isWeekday(input.date)) {
    return { isOff: false, done: 0, expected: 0 };
  }
  if (input.entry?.dayOff === true) {
    return { isOff: true, done: 0, expected: 0 };
  }
  const expectedHabits = listExpectedHabits(input.habits, input.date);
  const done = expectedHabits.filter((habit) => input.entry?.habits[habit.id] === true).length;
  return { isOff: false, done, expected: expectedHabits.length };
}

/**
 * Maps a visible day onto the shared heatmap scale.
 */
export function heatmapLevel(score: VisibleDayScore): HeatmapLevel {
  if (score.isOff) {
    return "off";
  }
  if (score.expected === 0) {
    return "empty";
  }
  if (score.done <= 0) {
    return "none";
  }
  if (score.done >= score.expected) {
    return "complete";
  }
  return "partial";
}

/**
 * Maps a partner summary value onto the same heatmap scale.
 */
export function heatmapLevelFromSummary(value: DaySummaryValue | undefined): HeatmapLevel {
  if (value === undefined) {
    return "empty";
  }
  if (value === "off") {
    return "off";
  }
  return heatmapLevel({ isOff: false, done: value.done, expected: value.expected });
}

/**
 * Builds the global score for one person.
 * Eligible days are weekdays in range, on or before today, not OFF, with at least one expected item.
 * Weekends and OFF days do not break the streak.
 */
export function buildSummary(input: {
  readonly habits: readonly Habit[];
  readonly entries: Readonly<Record<string, DayEntry>>;
  readonly startDate: string;
  readonly endDate: string;
  readonly today: string;
  readonly weekdaysOnly: boolean;
}): TrackerSummary {
  const days: Record<string, DaySummaryValue> = {};
  let doneTotal = 0;
  let expectedTotal = 0;
  let perfectDays = 0;
  let eligibleDays = 0;
  for (const date of listDates(input.startDate, input.endDate)) {
    const score = scoreVisibleDay({
      date,
      habits: input.habits,
      entry: input.entries[date] ?? null,
      weekdaysOnly: input.weekdaysOnly,
    });
    days[date] = score.isOff ? "off" : { done: score.done, expected: score.expected };
    const isInPastOrToday = date <= input.today;
    const isEligible = isInPastOrToday && !score.isOff && score.expected > 0;
    if (!isEligible) {
      continue;
    }
    eligibleDays += 1;
    doneTotal += score.done;
    expectedTotal += score.expected;
    if (score.done === score.expected) {
      perfectDays += 1;
    }
  }
  return {
    completionRate: expectedTotal === 0 ? 0 : doneTotal / expectedTotal,
    currentStreak: calculateStreak(input),
    perfectDays,
    eligibleDays,
    days,
  };
}

function calculateStreak(input: {
  readonly habits: readonly Habit[];
  readonly entries: Readonly<Record<string, DayEntry>>;
  readonly startDate: string;
  readonly endDate: string;
  readonly today: string;
  readonly weekdaysOnly: boolean;
}): number {
  const dates = listDates(input.startDate, input.endDate).filter((date) => date <= input.today).reverse();
  let streak = 0;
  for (const date of dates) {
    const score = scoreVisibleDay({
      date,
      habits: input.habits,
      entry: input.entries[date] ?? null,
      weekdaysOnly: input.weekdaysOnly,
    });
    if (score.isOff || score.expected === 0) {
      continue;
    }
    if (score.done !== score.expected) {
      break;
    }
    streak += 1;
  }
  return streak;
}
