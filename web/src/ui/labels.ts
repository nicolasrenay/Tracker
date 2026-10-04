import { parseLocalDate } from "../domain/date-key";

export const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

const MONTH_SHORT = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"] as const;

const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

/**
 * Short French date used in column headers, for example `4 oct`.
 */
export function formatDisplayDate(value: string): string {
  const date = parseLocalDate(value);
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/**
 * Weekday abbreviation for a date key.
 */
export function formatDayName(value: string): string {
  return DAY_NAMES[parseLocalDate(value).getDay()];
}

/**
 * Rounds a 0..1 rate to a percentage label.
 */
export function formatPercent(rate: number): string {
  const percent = (rate * 100).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  return `${percent} %`;
}
