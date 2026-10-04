import { CHALLENGE_START_DATE } from "./constants";
import type { Habit } from "./habit";

/**
 * Builds the three items from the original page.
 * They start at the challenge window so imported history still counts.
 */
export function createStarterHabits(): readonly Habit[] {
  return [
    {
      id: "early_wake",
      name: "Early wake up",
      position: 0,
      activeFrom: CHALLENGE_START_DATE,
      archivedOn: null,
    },
    {
      id: "run",
      name: "Run",
      position: 1,
      activeFrom: CHALLENGE_START_DATE,
      archivedOn: null,
    },
    {
      id: "business",
      name: "Business work",
      position: 2,
      activeFrom: CHALLENGE_START_DATE,
      archivedOn: null,
    },
  ];
}
