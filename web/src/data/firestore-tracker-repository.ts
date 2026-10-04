import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { ARK_CHALLENGE_NAME, CHALLENGE_END_DATE, CHALLENGE_START_DATE, MAX_ACTIVE_HABITS } from "../domain/constants";
import { createId, type DayEntry, type Habit } from "../domain/habit";
import { createStarterHabits } from "../domain/starter-habits";
import { sanitizeDisplayName } from "../domain/sanitize-display-name";
import type {
  ChallengeRecord,
  ChallengeSnapshot,
  PersonalSnapshot,
  StoredSummary,
  TrackerRepository,
} from "./tracker-types";

/**
 * Firestore-backed tracker. Cross-account access is enforced by security rules.
 * Real-time listeners are required so a phone and a laptop stay in sync, including offline.
 */
export class FirestoreTrackerRepository implements TrackerRepository {
  public constructor(private readonly database: Firestore) {}

  public async ensureAccount(input: { readonly userId: string; readonly displayName: string }): Promise<void> {
    const userRef = doc(this.database, "users", input.userId);
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      await setDoc(userRef, {
        displayName: sanitizeDisplayName(input.displayName),
        visibility: "private",
        createdAt: serverTimestamp(),
        activeHabitIds: [],
      });
    }
    const habits = await getDocs(collection(this.database, "users", input.userId, "habits"));
    if (!habits.empty) {
      return;
    }
    for (const habit of createStarterHabits()) {
      await this.createHabit({ userId: input.userId, habit });
    }
  }

  public subscribePersonal(input: {
    readonly userId: string;
    readonly onChange: (snapshot: PersonalSnapshot) => void;
  }): () => void {
    let habits: Habit[] = [];
    let entries: Record<string, DayEntry> = {};
    const emit = (): void => {
      input.onChange({ habits, entries });
    };
    const unsubscribeHabits = onSnapshot(collection(this.database, "users", input.userId, "habits"), (snapshot) => {
      habits = snapshot.docs.flatMap((item) => {
        const habit = parseHabit(item.id, item.data());
        return habit === null ? [] : [habit];
      });
      emit();
    });
    const unsubscribeEntries = onSnapshot(collection(this.database, "users", input.userId, "entries"), (snapshot) => {
      entries = {};
      snapshot.docs.forEach((item) => {
        const entry = parseEntry(item.data());
        if (entry !== null) {
          entries[item.id] = entry;
        }
      });
      emit();
    });
    return () => {
      unsubscribeHabits();
      unsubscribeEntries();
    };
  }

  public async saveEntry(input: { readonly userId: string; readonly date: string; readonly entry: DayEntry }): Promise<void> {
    await setDoc(doc(this.database, "users", input.userId, "entries", input.date), {
      habits: input.entry.habits,
      dayOff: input.entry.dayOff,
    });
  }

  public async createHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    const userRef = doc(this.database, "users", input.userId);
    const habitRef = doc(this.database, "users", input.userId, "habits", input.habit.id);
    await runTransaction(this.database, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const ids = readActiveIds(userSnap.data());
      if (ids.includes(input.habit.id)) {
        return;
      }
      if (ids.length >= MAX_ACTIVE_HABITS) {
        throw new Error("Habit limit reached");
      }
      transaction.update(userRef, { activeHabitIds: [...ids, input.habit.id] });
      transaction.set(habitRef, {
        name: input.habit.name,
        position: input.habit.position,
        activeFrom: input.habit.activeFrom,
        archivedOn: null,
        createdAt: serverTimestamp(),
      });
    });
  }

  public async updateHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    await updateDoc(doc(this.database, "users", input.userId, "habits", input.habit.id), {
      name: input.habit.name,
      position: input.habit.position,
    });
  }

  public async archiveHabit(input: { readonly userId: string; readonly habit: Habit }): Promise<void> {
    const userRef = doc(this.database, "users", input.userId);
    const habitRef = doc(this.database, "users", input.userId, "habits", input.habit.id);
    await runTransaction(this.database, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const habitSnap = await transaction.get(habitRef);
      if (!habitSnap.exists() || habitSnap.data().archivedOn !== null) {
        return;
      }
      const ids = readActiveIds(userSnap.data()).filter((id) => id !== input.habit.id);
      transaction.update(userRef, { activeHabitIds: ids });
      transaction.update(habitRef, { archivedOn: input.habit.archivedOn });
    });
  }

  public async listMembershipIds(userId: string): Promise<readonly string[]> {
    const snapshot = await getDocs(collection(this.database, "users", userId, "memberships"));
    return snapshot.docs.map((item) => item.id);
  }

  public async createChallenge(input: { readonly userId: string }): Promise<ChallengeRecord> {
    const challengeId = createId();
    const inviteId = createId();
    const challenge: ChallengeRecord = {
      id: challengeId,
      name: ARK_CHALLENGE_NAME,
      ownerId: input.userId,
      startDate: CHALLENGE_START_DATE,
      endDate: CHALLENGE_END_DATE,
      currentInviteId: inviteId,
    };
    const batch = writeBatch(this.database);
    batch.set(doc(this.database, "challenges", challengeId), {
      name: challenge.name,
      ownerId: challenge.ownerId,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      weekdaysOnly: true,
      createdAt: serverTimestamp(),
      currentInviteId: inviteId,
    });
    batch.set(doc(this.database, "challenges", challengeId, "members", input.userId), {
      role: "owner",
      joinedAt: serverTimestamp(),
    });
    batch.set(doc(this.database, "users", input.userId, "memberships", challengeId), {
      role: "owner",
      joinedAt: serverTimestamp(),
    });
    batch.set(doc(this.database, "challenges", challengeId, "invites", inviteId), {
      createdBy: input.userId,
      expiresAt: null,
      revoked: false,
    });
    await batch.commit();
    return challenge;
  }

  public async joinChallenge(input: {
    readonly userId: string;
    readonly challengeId: string;
    readonly inviteId: string;
  }): Promise<void> {
    const batch = writeBatch(this.database);
    batch.set(doc(this.database, "challenges", input.challengeId, "members", input.userId), {
      role: "member",
      joinedAt: serverTimestamp(),
      inviteId: input.inviteId,
    });
    batch.set(doc(this.database, "users", input.userId, "memberships", input.challengeId), {
      role: "member",
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  public async replaceInvite(input: { readonly userId: string; readonly challengeId: string }): Promise<string> {
    const challengeRef = doc(this.database, "challenges", input.challengeId);
    const current = await getDoc(challengeRef);
    const previousInviteId = String(current.data()?.currentInviteId ?? "");
    const nextInviteId = createId();
    const batch = writeBatch(this.database);
    if (previousInviteId.length > 0) {
      batch.update(doc(this.database, "challenges", input.challengeId, "invites", previousInviteId), {
        revoked: true,
      });
    }
    batch.set(doc(this.database, "challenges", input.challengeId, "invites", nextInviteId), {
      createdBy: input.userId,
      expiresAt: null,
      revoked: false,
    });
    batch.update(challengeRef, { currentInviteId: nextInviteId });
    await batch.commit();
    return nextInviteId;
  }

  public async importEntriesIfEmpty(input: {
    readonly userId: string;
    readonly entries: Readonly<Record<string, DayEntry>>;
  }): Promise<void> {
    const existing = await getDocs(collection(this.database, "users", input.userId, "entries"));
    if (!existing.empty) {
      return;
    }
    for (const [date, entry] of Object.entries(input.entries)) {
      await this.saveEntry({ userId: input.userId, date, entry });
    }
  }

  public async saveSummary(input: { readonly challengeId: string; readonly summary: StoredSummary }): Promise<void> {
    await setDoc(doc(this.database, "challenges", input.challengeId, "summaries", input.summary.userId), {
      displayName: input.summary.displayName,
      completionRate: input.summary.completionRate,
      currentStreak: input.summary.currentStreak,
      perfectDays: input.summary.perfectDays,
      eligibleDays: input.summary.eligibleDays,
      updatedAt: serverTimestamp(),
      days: input.summary.days,
    });
  }

  public subscribeChallenge(input: {
    readonly challengeId: string;
    readonly onChange: (snapshot: ChallengeSnapshot) => void;
  }): () => void {
    let challenge: ChallengeRecord | null = null;
    let memberIds: string[] = [];
    let summaries: StoredSummary[] = [];
    const emit = (): void => {
      if (challenge === null) {
        return;
      }
      input.onChange({ challenge, memberIds, summaries });
    };
    const unsubscribeChallenge = onSnapshot(doc(this.database, "challenges", input.challengeId), (snapshot) => {
      challenge = parseChallenge(input.challengeId, snapshot.data());
      emit();
    });
    const unsubscribeMembers = onSnapshot(collection(this.database, "challenges", input.challengeId, "members"), (snapshot) => {
      memberIds = snapshot.docs.map((item) => item.id);
      emit();
    });
    const unsubscribeSummaries = onSnapshot(collection(this.database, "challenges", input.challengeId, "summaries"), (snapshot) => {
      summaries = snapshot.docs.flatMap((item) => {
        const summary = parseSummary(item.id, item.data());
        return summary === null ? [] : [summary];
      });
      emit();
    });
    return () => {
      unsubscribeChallenge();
      unsubscribeMembers();
      unsubscribeSummaries();
    };
  }
}

function readActiveIds(data: DocumentData | undefined): string[] {
  const value = data?.activeHabitIds;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseHabit(id: string, data: DocumentData): Habit | null {
  if (typeof data.name !== "string" || typeof data.activeFrom !== "string" || typeof data.position !== "number") {
    return null;
  }
  const archivedOn = typeof data.archivedOn === "string" ? data.archivedOn : null;
  return { id, name: data.name, position: data.position, activeFrom: data.activeFrom, archivedOn };
}

function parseEntry(data: DocumentData): DayEntry | null {
  if (typeof data.dayOff !== "boolean" || typeof data.habits !== "object" || data.habits === null) {
    return null;
  }
  const habits: Record<string, boolean> = {};
  for (const [habitId, checked] of Object.entries(data.habits as Record<string, unknown>)) {
    if (checked === true) {
      habits[habitId] = true;
    }
  }
  return { habits, dayOff: data.dayOff };
}

function parseChallenge(id: string, data: DocumentData | undefined): ChallengeRecord | null {
  if (!data || typeof data.name !== "string" || typeof data.ownerId !== "string" || typeof data.currentInviteId !== "string") {
    return null;
  }
  if (typeof data.startDate !== "string" || typeof data.endDate !== "string") {
    return null;
  }
  return {
    id,
    name: data.name,
    ownerId: data.ownerId,
    startDate: data.startDate,
    endDate: data.endDate,
    currentInviteId: data.currentInviteId,
  };
}

function parseSummary(userId: string, data: DocumentData): StoredSummary | null {
  if (typeof data.displayName !== "string" || typeof data.completionRate !== "number") {
    return null;
  }
  if (typeof data.currentStreak !== "number" || typeof data.perfectDays !== "number" || typeof data.eligibleDays !== "number") {
    return null;
  }
  if (typeof data.days !== "object" || data.days === null) {
    return null;
  }
  return {
    userId,
    displayName: data.displayName,
    completionRate: data.completionRate,
    currentStreak: data.currentStreak,
    perfectDays: data.perfectDays,
    eligibleDays: data.eligibleDays,
    days: data.days as StoredSummary["days"],
  };
}
