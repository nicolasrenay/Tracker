import type { DayEntry, Habit } from "../domain/habit";
import type { DaySummaryValue } from "../domain/score";

/** Shared challenge window stored for every member. */
export interface ChallengeRecord {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly currentInviteId: string;
}

/** Partner-visible score. Item names are intentionally absent. */
export interface StoredSummary {
  readonly userId: string;
  readonly displayName: string;
  readonly completionRate: number;
  readonly currentStreak: number;
  readonly perfectDays: number;
  readonly eligibleDays: number;
  readonly days: Readonly<Record<string, DaySummaryValue>>;
}

/** Private checklist plus checks for one account. */
export interface PersonalSnapshot {
  readonly habits: readonly Habit[];
  readonly entries: Readonly<Record<string, DayEntry>>;
}

/** Shared challenge view for members. */
export interface ChallengeSnapshot {
  readonly challenge: ChallengeRecord;
  readonly memberIds: readonly string[];
  readonly summaries: readonly StoredSummary[];
}

/** Persistence port used by both the browser cache and Firestore. */
export interface TrackerRepository {
  ensureAccount(input: { readonly userId: string; readonly displayName: string }): Promise<void>;
  subscribePersonal(input: {
    readonly userId: string;
    readonly onChange: (snapshot: PersonalSnapshot) => void;
  }): () => void;
  saveEntry(input: { readonly userId: string; readonly date: string; readonly entry: DayEntry }): Promise<void>;
  createHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void>;
  updateHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void>;
  archiveHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void>;
  listMembershipIds(userId: string): Promise<readonly string[]>;
  createChallenge(input: { readonly userId: string }): Promise<ChallengeRecord>;
  joinChallenge(input: { readonly userId: string; readonly challengeId: string; readonly inviteId: string }): Promise<void>;
  replaceInvite(input: { readonly userId: string; readonly challengeId: string }): Promise<string>;
  saveSummary(input: { readonly challengeId: string; readonly summary: StoredSummary }): Promise<void>;
  importEntriesIfEmpty(input: {
    readonly userId: string;
    readonly entries: Readonly<Record<string, DayEntry>>;
  }): Promise<void>;
  subscribeChallenge(input: {
    readonly challengeId: string;
    readonly onChange: (snapshot: ChallengeSnapshot) => void;
  }): () => void;
}
