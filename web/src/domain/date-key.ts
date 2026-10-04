const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a date as a local calendar key.
 * Uses local year, month, and day so a phone and a laptop do not shift the day through UTC.
 */
export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a `YYYY-MM-DD` key into a local midnight date.
 */
export function parseLocalDate(value: string): Date {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid date key: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

/**
 * Returns whether the value is a real calendar date in `YYYY-MM-DD` form.
 */
export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const parsed = parseLocalDate(value);
  return formatLocalDate(parsed) === value;
}

/**
 * Returns whether the date is Monday through Friday.
 */
export function isWeekday(value: string): boolean {
  const day = parseLocalDate(value).getDay();
  return day >= 1 && day <= 5;
}

/**
 * Lists every calendar date from start through end, inclusive.
 */
export function listDates(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  const cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  while (cursor <= end) {
    dates.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Lists weekday keys that fall inside a calendar month.
 */
export function listMonthWeekdays(year: number, monthIndex: number): readonly string[] {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const key = formatLocalDate(new Date(year, monthIndex, day));
    if (isWeekday(key)) {
      dates.push(key);
    }
  }
  return dates;
}

/**
 * Adds a signed number of days to a date key and returns the new key.
 */
export function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
}
