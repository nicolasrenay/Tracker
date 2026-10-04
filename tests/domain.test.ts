import { describe, expect, it } from "vitest";
import { formatLocalDate, isDateKey, isWeekday, parseLocalDate } from "../web/src/domain/date-key";
import { archiveHabit, createHabit, listExpectedHabits, moveHabit, toggleCheck } from "../web/src/domain/habit";
import { importLegacyData } from "../web/src/domain/import-legacy";
import { buildSummary, heatmapLevel, scoreVisibleDay } from "../web/src/domain/score";
import { createStarterHabits } from "../web/src/domain/starter-habits";
import type { DayEntry, Habit } from "../web/src/domain/habit";

describe("local dates", () => {
  it("keeps the calendar day instead of converting through UTC", () => {
    const date = new Date(2026, 9, 4);
    expect(formatLocalDate(date)).toBe("2026-10-04");
    expect(formatLocalDate(parseLocalDate("2026-10-04"))).toBe("2026-10-04");
  });

  it("rejects impossible dates and classifies weekdays", () => {
    expect(isDateKey("2026-02-31")).toBe(false);
    expect(isDateKey("2026-10-05")).toBe(true);
    expect(isWeekday("2026-10-04")).toBe(false);
    expect(isWeekday("2026-10-05")).toBe(true);
  });
});

describe("checklist history", () => {
  const habits: readonly Habit[] = [
    { id: "run", name: "Run", position: 0, activeFrom: "2026-10-01", archivedOn: "2026-10-08" },
    { id: "read", name: "Read", position: 1, activeFrom: "2026-10-08", archivedOn: null },
  ];

  it("uses the items that were active on that date", () => {
    expect(listExpectedHabits(habits, "2026-10-07").map((habit) => habit.id)).toEqual(["run"]);
    expect(listExpectedHabits(habits, "2026-10-08").map((habit) => habit.id)).toEqual(["read"]);
  });

  it("stops at 12 active items and keeps ids stable when renaming is not required", () => {
    const existing = Array.from({ length: 12 }, (_, index) => ({
      id: `habit-${index}`,
      name: `Habit ${index}`,
      position: index,
      activeFrom: "2026-01-01",
      archivedOn: null,
    }));
    expect(() => createHabit({ name: "One more", today: "2026-10-04", existing })).toThrow(/limit/i);
  });

  it("moves only active items and archives from today forward", () => {
    const starter = createStarterHabits();
    const moved = moveHabit(starter, "run", -1);
    expect(moved.find((habit) => habit.id === "run")?.position).toBe(0);
    expect(moved.find((habit) => habit.id === "early_wake")?.position).toBe(1);
    expect(archiveHabit(starter[1], "2026-10-04").archivedOn).toBe("2026-10-04");
  });
});

describe("score", () => {
  const habits = createStarterHabits();

  it("excludes OFF days, weekends, and future days from the rate", () => {
    const entries: Record<string, DayEntry> = {
      "2026-10-05": { habits: { early_wake: true, run: true, business: true }, dayOff: false },
      "2026-10-06": { habits: { early_wake: true }, dayOff: false },
      "2026-10-07": { habits: {}, dayOff: true },
    };
    const summary = buildSummary({
      habits,
      entries,
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      today: "2026-10-06",
      weekdaysOnly: true,
    });
    expect(summary.eligibleDays).toBe(2);
    expect(summary.perfectDays).toBe(1);
    expect(summary.completionRate).toBeCloseTo(4 / 6);
    expect(summary.currentStreak).toBe(0);
    expect(summary.days["2026-10-07"]).toBe("off");
  });

  it("continues a streak across a weekend", () => {
    const entries: Record<string, DayEntry> = {
      "2026-10-02": { habits: { early_wake: true, run: true, business: true }, dayOff: false },
      "2026-10-05": { habits: { early_wake: true, run: true, business: true }, dayOff: false },
    };
    const summary = buildSummary({
      habits,
      entries,
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      today: "2026-10-05",
      weekdaysOnly: true,
    });
    expect(summary.currentStreak).toBe(2);
  });

  it("colors a partial day differently from a complete day", () => {
    const partial = scoreVisibleDay({
      date: "2026-10-05",
      habits,
      entry: { habits: { run: true }, dayOff: false },
      weekdaysOnly: true,
    });
    expect(heatmapLevel(partial)).toBe("partial");
    expect(heatmapLevel({ isOff: false, done: 3, expected: 3 })).toBe("complete");
  });
});

describe("legacy import", () => {
  it("keeps known checks and drops unknown habits", () => {
    const entries = importLegacyData({
      habits: createStarterHabits(),
      legacy: {
        checks: {
          run: { "2026-10-05": true, "2026-02-31": true },
          unknown: { "2026-10-05": true },
        },
        daysOff: { "2026-10-06": true },
      },
    });
    expect(entries["2026-10-05"]).toEqual({ habits: { run: true }, dayOff: false });
    expect(entries["2026-10-06"]?.dayOff).toBe(true);
    expect(entries["2026-02-31"]).toBeUndefined();
  });
});

describe("toggle", () => {
  it("removes a check instead of storing false", () => {
    const entry = toggleCheck({ habits: { run: true }, dayOff: false }, "run");
    expect(entry.habits.run).toBeUndefined();
    expect(toggleCheck(entry, "business").habits.business).toBe(true);
  });
});
