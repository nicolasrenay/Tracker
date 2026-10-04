import { CHALLENGE_END_DATE, CHALLENGE_START_DATE } from "../domain/constants";
import { formatLocalDate } from "../domain/date-key";
import {
  archiveHabit,
  createHabit,
  listExpectedHabits,
  moveHabit,
  renameHabit,
  toggleCheck,
  toggleDayOff,
  type DayEntry,
  type Habit,
} from "../domain/habit";
import { buildSummary } from "../domain/score";
import { sanitizeDisplayName } from "../domain/sanitize-display-name";
import type { ChallengeRecord, PersonalSnapshot, StoredSummary, TrackerRepository } from "../data/tracker-types";
import { renderTracker, type TrackerView } from "../ui/render-tracker";

/** Signed-in or on-device session used by the page. */
export interface TrackerSession {
  readonly mode: "local" | "cloud";
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly onSignOut?: () => Promise<void>;
}

interface MutableView {
  monthIndex: number;
  habits: readonly Habit[];
  entries: Readonly<Record<string, DayEntry>>;
  challenge: ChallengeRecord | null;
  memberIds: readonly string[];
  summaries: readonly StoredSummary[];
  status: string;
}

/**
 * Connects the tracker page to a repository and returns a dispose function.
 */
export async function mountTracker(input: {
  readonly root: HTMLElement;
  readonly repository: TrackerRepository;
  readonly session: TrackerSession;
}): Promise<() => void> {
  const today = formatLocalDate(new Date());
  const state: MutableView = {
    monthIndex: initialMonth(today),
    habits: [],
    entries: {},
    challenge: null,
    memberIds: [],
    summaries: [],
    status: "",
  };
  let lastSummary = "";
  let summaryTimer = 0;
  let unsubscribeChallenge = (): void => undefined;
  const paint = (): void => {
    renderTracker(input.root, toView(input.session, state, today));
  };
  const scheduleSummary = (): void => {
    if (input.session.mode !== "cloud" || state.challenge === null) {
      return;
    }
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(() => {
      void writeSummary(input, state, today, lastSummary).then((serialized) => {
        lastSummary = serialized;
      });
    }, 400);
  };
  const openChallenge = (challengeId: string): void => {
    unsubscribeChallenge();
    unsubscribeChallenge = input.repository.subscribeChallenge({
      challengeId,
      onChange: (snapshot) => {
        state.challenge = snapshot.challenge;
        state.memberIds = snapshot.memberIds;
        state.summaries = snapshot.summaries;
        paint();
      },
    });
  };
  const memberships = await acceptInvite(input, state);
  if (memberships.length > 0) {
    openChallenge(memberships[0]);
  }
  paint();
  const unsubscribePersonal = input.repository.subscribePersonal({
    userId: input.session.userId,
    onChange: (snapshot: PersonalSnapshot) => {
      state.habits = snapshot.habits;
      state.entries = snapshot.entries;
      paint();
      scheduleSummary();
    },
  });
  const onClick = (event: Event): void => {
    void handleClick(event, input, state, today, paint, openChallenge);
  };
  const onChange = (event: Event): void => {
    void handleRename(event, input, state, paint);
  };
  const onSubmit = (event: Event): void => {
    void handleAdd(event, input, state, today, paint);
  };
  input.root.addEventListener("click", onClick);
  input.root.addEventListener("change", onChange);
  input.root.addEventListener("submit", onSubmit);
  return () => {
    window.clearTimeout(summaryTimer);
    unsubscribePersonal();
    unsubscribeChallenge();
    input.root.removeEventListener("click", onClick);
    input.root.removeEventListener("change", onChange);
    input.root.removeEventListener("submit", onSubmit);
  };
}

async function acceptInvite(input: {
  readonly repository: TrackerRepository;
  readonly session: TrackerSession;
}, state: MutableView): Promise<readonly string[]> {
  const existing = await input.repository.listMembershipIds(input.session.userId);
  if (input.session.mode !== "cloud") {
    return existing;
  }
  const params = new URLSearchParams(window.location.search);
  const challengeId = params.get("join");
  const inviteId = params.get("code");
  if (challengeId === null || inviteId === null) {
    return existing;
  }
  if (!existing.includes(challengeId)) {
    try {
      await input.repository.joinChallenge({ userId: input.session.userId, challengeId, inviteId });
      state.status = "Vous avez rejoint le défi.";
    } catch {
      state.status = "Invitation refusée. Le lien est peut-être révoqué.";
    }
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  url.searchParams.delete("code");
  window.history.replaceState({}, "", url.toString());
  return input.repository.listMembershipIds(input.session.userId);
}

async function handleClick(
  event: Event,
  input: { readonly root: HTMLElement; readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  today: string,
  paint: () => void,
  openChallenge: (challengeId: string) => void,
): Promise<void> {
  if (!(event.target instanceof Element)) {
    return;
  }
  const action = event.target.closest<HTMLElement>("[data-action]");
  if (action === null || action.dataset.action === "submit-habit") {
    return;
  }
  const name = action.dataset.action ?? "";
  try {
    if (name === "switch-month" || name === "jump-month") {
      state.monthIndex = Number(action.dataset.month ?? "0");
      paint();
      return;
    }
    if (name === "toggle-habit") {
      await toggleHabit(input, state, action);
      return;
    }
    if (name === "toggle-off") {
      await toggleOff(input, state, action);
      return;
    }
    if (name === "archive-habit") {
      await archive(input, state, action, today);
      return;
    }
    if (name === "move-habit") {
      await move(input, state, action);
      return;
    }
    if (name === "create-challenge") {
      const challenge = await input.repository.createChallenge({ userId: input.session.userId });
      state.challenge = challenge;
      openChallenge(challenge.id);
      state.status = "Défi créé. Envoyez le lien.";
      paint();
      return;
    }
    if (name === "copy-invite") {
      const link = input.root.querySelector<HTMLInputElement>(".invite-link")?.value ?? "";
      await navigator.clipboard.writeText(link);
      state.status = "Lien copié.";
      paint();
      return;
    }
    if (name === "replace-invite" && state.challenge !== null) {
      await input.repository.replaceInvite({ userId: input.session.userId, challengeId: state.challenge.id });
      state.status = "Ancien lien révoqué.";
      return;
    }
    if (name === "sign-out" && input.session.onSignOut !== undefined) {
      await input.session.onSignOut();
    }
  } catch (error) {
    state.status = error instanceof Error ? translateError(error.message) : "Enregistrement impossible.";
    paint();
  }
}

async function toggleHabit(
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  action: HTMLElement,
): Promise<void> {
  const habitId = action.dataset.habitId ?? "";
  const date = action.dataset.date ?? "";
  const entry = state.entries[date] ?? null;
  if (entry?.dayOff === true || listExpectedHabits(state.habits, date).every((habit) => habit.id !== habitId)) {
    return;
  }
  await input.repository.saveEntry({
    userId: input.session.userId,
    date,
    entry: toggleCheck(entry, habitId),
  });
}

async function toggleOff(
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  action: HTMLElement,
): Promise<void> {
  const date = action.dataset.date ?? "";
  await input.repository.saveEntry({
    userId: input.session.userId,
    date,
    entry: toggleDayOff(state.entries[date] ?? null),
  });
}

async function archive(
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  action: HTMLElement,
  today: string,
): Promise<void> {
  const habit = state.habits.find((item) => item.id === action.dataset.habitId);
  if (habit === undefined) {
    return;
  }
  const confirmed = window.confirm("Retirer cette habitude à partir d'aujourd'hui ? Les jours précédents restent.");
  if (!confirmed) {
    return;
  }
  await input.repository.archiveHabit({
    userId: input.session.userId,
    habit: archiveHabit(habit, today),
  });
}

async function move(
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  action: HTMLElement,
): Promise<void> {
  const habitId = action.dataset.habitId ?? "";
  const direction = action.dataset.direction === "1" ? 1 : -1;
  const next = moveHabit(state.habits, habitId, direction);
  for (const habit of next) {
    const previous = state.habits.find((item) => item.id === habit.id);
    if (previous !== undefined && previous.position !== habit.position) {
      await input.repository.updateHabit({ userId: input.session.userId, habit });
    }
  }
}

async function handleRename(
  event: Event,
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  paint: () => void,
): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.rename !== "true") {
    return;
  }
  const habitId = target.dataset.habitId ?? "";
  const habit = state.habits.find((item) => item.id === habitId);
  if (habit === undefined) {
    return;
  }
  try {
    const renamed = renameHabit(habit, target.value);
    if (renamed.name === habit.name) {
      return;
    }
    await input.repository.updateHabit({ userId: input.session.userId, habit: renamed });
  } catch (error) {
    state.status = error instanceof Error ? translateError(error.message) : "Nom invalide.";
    paint();
  }
}

async function handleAdd(
  event: Event,
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  today: string,
  paint: () => void,
): Promise<void> {
  if (!(event.target instanceof HTMLFormElement)) {
    return;
  }
  event.preventDefault();
  const field = event.target.querySelector<HTMLInputElement>("[data-add-habit]");
  const name = field?.value ?? "";
  if (field !== null) {
    field.value = "";
  }
  try {
    const habit = createHabit({ name, today, existing: state.habits });
    await input.repository.createHabit({ userId: input.session.userId, habit });
  } catch (error) {
    state.status = error instanceof Error ? translateError(error.message) : "Ajout impossible.";
    paint();
  }
}

async function writeSummary(
  input: { readonly repository: TrackerRepository; readonly session: TrackerSession },
  state: MutableView,
  today: string,
  lastSummary: string,
): Promise<string> {
  if (state.challenge === null) {
    return lastSummary;
  }
  const summary = buildSummary({
    habits: state.habits,
    entries: state.entries,
    startDate: state.challenge.startDate || CHALLENGE_START_DATE,
    endDate: state.challenge.endDate || CHALLENGE_END_DATE,
    today,
    weekdaysOnly: true,
  });
  const stored: StoredSummary = {
    userId: input.session.userId,
    displayName: sanitizeDisplayName(input.session.displayName),
    completionRate: clampRate(summary.completionRate),
    currentStreak: summary.currentStreak,
    perfectDays: summary.perfectDays,
    eligibleDays: summary.eligibleDays,
    days: summary.days,
  };
  const serialized = JSON.stringify(stored);
  if (serialized === lastSummary) {
    return lastSummary;
  }
  await input.repository.saveSummary({ challengeId: state.challenge.id, summary: stored });
  return serialized;
}

function toView(session: TrackerSession, state: MutableView, today: string): TrackerView {
  return {
    mode: session.mode,
    email: session.email,
    displayName: session.displayName,
    userId: session.userId,
    today,
    monthIndex: state.monthIndex,
    habits: state.habits,
    entries: state.entries,
    summary: buildSummary({
      habits: state.habits,
      entries: state.entries,
      startDate: CHALLENGE_START_DATE,
      endDate: CHALLENGE_END_DATE,
      today,
      weekdaysOnly: true,
    }),
    challenge: state.challenge,
    memberIds: state.memberIds,
    summaries: state.summaries,
    status: state.status,
  };
}

function initialMonth(today: string): number {
  const [year, month] = today.split("-");
  if (Number(year) !== 2026) {
    return 0;
  }
  return Number(month) - 1;
}

function clampRate(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Math.min(1, Math.max(0, rounded));
}

function translateError(message: string): string {
  if (message === "Habit limit reached") {
    return "12 habitudes actives maximum.";
  }
  if (message === "Invalid habit name") {
    return "Le nom doit faire entre 1 et 80 caractères, sans @.";
  }
  if (message === "Cloud account required") {
    return "La synchronisation nécessite un compte.";
  }
  return "Enregistrement impossible.";
}
