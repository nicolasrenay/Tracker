import { LOCAL_ACCOUNT_KEY } from "../domain/constants";
import { importLegacyData, type LegacyTrackerData } from "../domain/import-legacy";
import type { DayEntry, Habit } from "../domain/habit";
import { createStarterHabits } from "../domain/starter-habits";
import type { ChallengeRecord, PersonalSnapshot, StoredSummary, TrackerRepository } from "./tracker-types";

interface LocalDatabase {
  readonly habits: Habit[];
  readonly entries: Record<string, DayEntry>;
  readonly challenge: ChallengeRecord | null;
  readonly membershipIds: string[];
  readonly summaries: StoredSummary[];
  readonly legacyImported: boolean;
}

/**
 * Browser storage used before a Firebase project is connected, and as the offline cache
 * for the original page's data on this device.
 */
export class LocalTrackerRepository implements TrackerRepository {
  private listeners = new Set<(snapshot: PersonalSnapshot) => void>();

  public constructor(
    private readonly storage: Storage,
    private readonly legacy: LegacyTrackerData | null = null,
  ) {}

  public async ensureAccount(input: { readonly userId: string; readonly displayName: string }): Promise<void> {
    const current = this.read();
    if (current.habits.length > 0) {
      return;
    }
    const habits = createStarterHabits().map((habit) => ({ ...habit }));
    const entries = !current.legacyImported && this.legacy !== null
      ? { ...importLegacyData({ legacy: this.legacy, habits }) }
      : {};
    this.write({
      ...current,
      habits,
      entries,
      legacyImported: true,
    });
    void input.displayName;
  }

  public subscribePersonal(input: {
    readonly userId: string;
    readonly onChange: (snapshot: PersonalSnapshot) => void;
  }): () => void {
    const listener = (): void => {
      const current = this.read();
      input.onChange({ habits: current.habits, entries: current.entries });
    };
    this.listeners.add(listener);
    listener();
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async saveEntry(input: { readonly userId: string; readonly date: string; readonly entry: DayEntry }): Promise<void> {
    const current = this.read();
    this.write({ ...current, entries: { ...current.entries, [input.date]: input.entry } });
  }

  public async createHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    const current = this.read();
    this.write({ ...current, habits: [...current.habits, input.habit] });
  }

  public async updateHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    const current = this.read();
    this.write({
      ...current,
      habits: current.habits.map((habit) => (habit.id === input.habit.id ? input.habit : habit)),
    });
  }

  public async archiveHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    await this.updateHabit(input);
  }

  public async listMembershipIds(userId: string): Promise<readonly string[]> {
    void userId;
    return this.read().membershipIds;
  }

  public async createChallenge(): Promise<ChallengeRecord> {
    throw new Error("Cloud account required");
  }

  public async joinChallenge(): Promise<void> {
    throw new Error("Cloud account required");
  }

  public async replaceInvite(): Promise<string> {
    throw new Error("Cloud account required");
  }

  public async importEntriesIfEmpty(input: {
    readonly userId: string;
    readonly entries: Readonly<Record<string, DayEntry>>;
  }): Promise<void> {
    const current = this.read();
    if (Object.keys(current.entries).length > 0) {
      return;
    }
    this.write({ ...current, entries: { ...input.entries } });
    void input.userId;
  }

  public async saveSummary(): Promise<void> {
    return;
  }

  public subscribeChallenge(): () => void {
    return () => undefined;
  }

  private read(): LocalDatabase {
    const raw = this.storage.getItem(LOCAL_ACCOUNT_KEY);
    if (raw === null) {
      return { habits: [], entries: {}, challenge: null, membershipIds: [], summaries: [], legacyImported: false };
    }
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    return {
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      entries: parsed.entries ?? {},
      challenge: parsed.challenge ?? null,
      membershipIds: parsed.membershipIds ?? [],
      summaries: parsed.summaries ?? [],
      legacyImported: parsed.legacyImported === true,
    };
  }

  private write(database: LocalDatabase): void {
    this.storage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify(database));
    for (const listener of this.listeners) {
      listener({ habits: database.habits, entries: database.entries });
    }
  }
}
