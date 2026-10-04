import { HABIT_NAME_MAX_LENGTH, MAX_ACTIVE_HABITS } from "./constants";

/** One checklist item owned by an account. */
export interface Habit {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly activeFrom: string;
  readonly archivedOn: string | null;
}

/** A single day's checks. Absent keys are unchecked. */
export interface DayEntry {
  readonly habits: Readonly<Record<string, boolean>>;
  readonly dayOff: boolean;
}

/**
 * Accepts a checklist label that the security rules will also accept.
 */
export function normalizeHabitName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > HABIT_NAME_MAX_LENGTH || name.includes("@")) {
    throw new Error("Invalid habit name");
  }
  return name;
}

/**
 * Creates a 128-bit hex id for habits, challenges, and invites.
 */
export function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns the checklist items that count on a given date, in display order.
 * An item counts when the date is on or after `activeFrom` and before `archivedOn`.
 */
export function listExpectedHabits(habits: readonly Habit[], date: string): readonly Habit[] {
  return habits
    .filter((habit) => {
      const isStarted = habit.activeFrom <= date;
      const isStillActive = habit.archivedOn === null || habit.archivedOn > date;
      return isStarted && isStillActive;
    })
    .slice()
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
}

/**
 * Returns checklist items that are still on the editor.
 */
export function listActiveHabits(habits: readonly Habit[]): readonly Habit[] {
  return habits
    .filter((habit) => habit.archivedOn === null)
    .slice()
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
}

/**
 * Creates a new active item starting today, or throws when the name or the cap is invalid.
 */
export function createHabit(input: {
  readonly name: string;
  readonly today: string;
  readonly existing: readonly Habit[];
}): Habit {
  const name = normalizeHabitName(input.name);
  const active = listActiveHabits(input.existing);
  if (active.length >= MAX_ACTIVE_HABITS) {
    throw new Error("Habit limit reached");
  }
  const position = active.reduce((max, habit) => Math.max(max, habit.position), -1) + 1;
  return {
    id: createId(),
    name,
    position,
    activeFrom: input.today,
    archivedOn: null,
  };
}

/**
 * Returns a renamed copy of a habit. The id stays the same so past checks remain attached.
 */
export function renameHabit(habit: Habit, name: string): Habit {
  return { ...habit, name: normalizeHabitName(name) };
}

/**
 * Returns a habit that leaves the grid on `today` and stays visible before that date.
 */
export function archiveHabit(habit: Habit, today: string): Habit {
  if (habit.archivedOn !== null) {
    return habit;
  }
  return { ...habit, archivedOn: today };
}

/**
 * Moves an active habit up or down and rewrites positions for the active list.
 */
export function moveHabit(habits: readonly Habit[], habitId: string, direction: -1 | 1): readonly Habit[] {
  const active = listActiveHabits(habits);
  const index = active.findIndex((habit) => habit.id === habitId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= active.length) {
    return habits;
  }
  const reordered = active.slice();
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved);
  const positions = new Map(reordered.map((habit, position) => [habit.id, position]));
  return habits.map((habit) => {
    const position = positions.get(habit.id);
    return position === undefined ? habit : { ...habit, position };
  });
}

/**
 * Toggles one check and drops explicit false values.
 */
export function toggleCheck(entry: DayEntry | null, habitId: string): DayEntry {
  const habits = { ...(entry?.habits ?? {}) };
  if (habits[habitId] === true) {
    delete habits[habitId];
  } else {
    habits[habitId] = true;
  }
  return { habits, dayOff: entry?.dayOff ?? false };
}

/**
 * Toggles the day-off flag and keeps existing checks underneath it.
 */
export function toggleDayOff(entry: DayEntry | null): DayEntry {
  return {
    habits: { ...(entry?.habits ?? {}) },
    dayOff: !(entry?.dayOff ?? false),
  };
}
