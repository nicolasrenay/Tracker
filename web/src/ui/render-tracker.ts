import { TRACKER_YEAR } from "../domain/constants";
import { listMonthWeekdays } from "../domain/date-key";
import { listActiveHabits, listExpectedHabits, type DayEntry, type Habit } from "../domain/habit";
import { heatmapLevel, heatmapLevelFromSummary, type TrackerSummary } from "../domain/score";
import type { ChallengeRecord, StoredSummary } from "../data/tracker-types";
import { formatDayName, formatDisplayDate, formatPercent, MONTH_NAMES } from "./labels";

/** Everything the page needs to draw one frame. */
export interface TrackerView {
  readonly mode: "local" | "cloud";
  readonly email: string;
  readonly displayName: string;
  readonly userId: string;
  readonly today: string;
  readonly monthIndex: number;
  readonly habits: readonly Habit[];
  readonly entries: Readonly<Record<string, DayEntry>>;
  readonly summary: TrackerSummary;
  readonly challenge: ChallengeRecord | null;
  readonly memberIds: readonly string[];
  readonly summaries: readonly StoredSummary[];
  readonly status: string;
}

/**
 * Draws the tracker into the root element and restores any checklist text being edited.
 */
export function renderTracker(root: HTMLElement, view: TrackerView): void {
  const draft = readInputValue(root, "[data-add-habit]");
  const focusedHabitId = document.activeElement instanceof HTMLInputElement
    ? document.activeElement.dataset.habitId ?? ""
    : "";
  root.replaceChildren(buildPage(view));
  const addInput = root.querySelector<HTMLInputElement>("[data-add-habit]");
  if (addInput !== null && draft.length > 0) {
    addInput.value = draft;
  }
  if (focusedHabitId.length > 0) {
    root.querySelector<HTMLInputElement>(`[data-habit-id="${cssEscape(focusedHabitId)}"]`)?.focus();
  }
}

function buildPage(view: TrackerView): HTMLElement {
  const container = createElement("div", "container");
  container.append(
    buildTopbar(view),
    buildStats(view.summary),
    createElement("p", "muted", "Taux, série et jours parfaits : jours ouvrés de 2026, jusqu'à aujourd'hui, hors jours OFF."),
    buildChecklist(view),
    buildHeatmap(view),
    buildMonthTabs(view.monthIndex),
    createElement("div", "month-label", `${MONTH_NAMES[view.monthIndex]} ${TRACKER_YEAR}`),
    buildGrid(view),
    buildPartners(view),
    buildLegend(),
    createElement("p", "status", view.status),
  );
  return container;
}

function buildTopbar(view: TrackerView): HTMLElement {
  const header = createElement("header", "topbar");
  const title = createElement("div", "");
  title.append(
    createElement("h1", "", "Habit Tracker"),
    createElement(
      "p",
      "muted",
      view.mode === "cloud"
        ? "Synchronisé avec votre compte."
        : "Enregistré dans ce navigateur. Le même compte sur le téléphone et l'ordinateur s'active quand Firebase est relié.",
    ),
  );
  const actions = createElement("div", "account-actions");
  if (view.email.length > 0) {
    actions.append(createElement("span", "account-email", view.email));
  }
  if (view.mode === "cloud") {
    actions.append(createButton("Se déconnecter", "sign-out"));
  }
  header.append(title, actions);
  return header;
}

function buildStats(summary: TrackerSummary): HTMLElement {
  const section = createElement("section", "stats");
  section.append(
    buildStat("Taux", formatPercent(summary.completionRate)),
    buildStat("Série", String(summary.currentStreak)),
    buildStat("Jours parfaits", String(summary.perfectDays)),
  );
  return section;
}

function buildStat(label: string, value: string): HTMLElement {
  const item = createElement("div", "stat-item");
  item.append(createElement("div", "stat-label", label), createElement("div", "stat-value", value));
  return item;
}

function buildChecklist(view: TrackerView): HTMLElement {
  const section = createElement("section", "checklist");
  section.dataset.checklist = "true";
  section.append(createElement("h2", "", "Ma checklist"));
  const active = listActiveHabits(view.habits);
  if (active.length === 0) {
    section.append(createElement("p", "muted", "Ajoutez une habitude pour commencer le suivi."));
  }
  for (const habit of active) {
    section.append(buildChecklistRow(habit));
  }
  const form = createElement("form", "checklist-add");
  form.dataset.action = "add-habit";
  const input = document.createElement("input");
  input.name = "habitName";
  input.maxLength = 80;
  input.placeholder = "Nouvelle habitude";
  input.setAttribute("data-add-habit", "true");
  input.autocomplete = "off";
  form.append(input, createButton("Ajouter", "submit-habit", "primary"));
  section.append(form);
  return section;
}

function buildChecklistRow(habit: Habit): HTMLElement {
  const row = createElement("div", "checklist-row");
  const input = document.createElement("input");
  input.value = habit.name;
  input.maxLength = 80;
  input.dataset.habitId = habit.id;
  input.dataset.rename = "true";
  input.setAttribute("aria-label", `Nom de ${habit.name}`);
  const actions = createElement("div", "checklist-actions");
  actions.append(
    createIconButton("↑", "move-habit", habit.id, "Monter"),
    createIconButton("↓", "move-habit", habit.id, "Descendre"),
    createIconButton("Retirer", "archive-habit", habit.id, "Retirer"),
  );
  const down = actions.querySelector<HTMLButtonElement>('[data-action="move-habit"]:nth-child(2)');
  if (down !== null) {
    down.dataset.direction = "1";
  }
  const up = actions.querySelector<HTMLButtonElement>('[data-action="move-habit"]');
  if (up !== null) {
    up.dataset.direction = "-1";
  }
  row.append(input, actions);
  return row;
}

function buildHeatmap(view: TrackerView): HTMLElement {
  const section = createElement("section", "year-heatmap");
  const header = createElement("div", "heatmap-header");
  header.append(createElement("h2", "", `Aperçu ${TRACKER_YEAR}`), buildHeatLegend());
  section.append(header, buildHeatmapGrid(TRACKER_YEAR, (date) => {
    const entry = view.entries[date] ?? null;
    return heatmapLevel({
      isOff: entry?.dayOff === true,
      done: countDone(view.habits, date, entry),
      expected: listExpectedHabits(view.habits, date).length,
    });
  }));
  return section;
}

function countDone(habits: readonly Habit[], date: string, entry: DayEntry | null): number {
  return listExpectedHabits(habits, date).filter((habit) => entry?.habits[habit.id] === true).length;
}

function buildHeatLegend(): HTMLElement {
  const legend = createElement("div", "heatmap-legend");
  legend.append(
    createElement("span", "", "Moins"),
    createElement("span", "legend-square level-none"),
    createElement("span", "legend-square level-partial"),
    createElement("span", "legend-square level-complete"),
    createElement("span", "", "Plus"),
  );
  return legend;
}

function buildHeatmapGrid(year: number, levelForDate: (date: string) => string): HTMLElement {
  const grid = createElement("div", "heatmap-grid");
  for (let month = 0; month < 12; month += 1) {
    for (const date of listMonthWeekdays(year, month)) {
      const level = levelForDate(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `heatmap-day level-${level}`;
      button.dataset.action = "jump-month";
      button.dataset.month = String(month);
      button.title = `${formatDisplayDate(date)} · ${levelLabel(level)}`;
      button.setAttribute("aria-label", button.title);
      grid.append(button);
    }
  }
  return grid;
}

function levelLabel(level: string): string {
  if (level === "off") {
    return "Jour OFF";
  }
  if (level === "complete") {
    return "Complet";
  }
  if (level === "partial") {
    return "Partiel";
  }
  return "Rien";
}

function buildMonthTabs(activeMonth: number): HTMLElement {
  const nav = createElement("nav", "month-tabs");
  MONTH_NAMES.forEach((name, month) => {
    const button = createButton(name, "switch-month");
    button.dataset.month = String(month);
    button.classList.add("month-tab");
    if (month === activeMonth) {
      button.classList.add("active");
    }
    nav.append(button);
  });
  return nav;
}

function buildGrid(view: TrackerView): HTMLElement {
  const wrapper = createElement("div", "tracker-grid");
  const table = document.createElement("table");
  const dates = listMonthWeekdays(TRACKER_YEAR, view.monthIndex);
  table.append(buildHead(dates, view.entries), buildBody(dates, view));
  wrapper.append(table);
  return wrapper;
}

function buildHead(dates: readonly string[], entries: Readonly<Record<string, DayEntry>>): HTMLElement {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  row.append(createElement("th", "", "Habitude"));
  dates.forEach((date, index) => {
    if (index > 0 && isWeekendGap(dates[index - 1], date)) {
      row.append(createElement("th", "weekend-separator"));
    }
    const cell = document.createElement("th");
    cell.className = entries[date]?.dayOff === true ? "day-header off" : "day-header";
    cell.dataset.action = "toggle-off";
    cell.dataset.date = date;
    cell.title = entries[date]?.dayOff === true ? "Réactiver ce jour" : "Marquer comme jour OFF";
    cell.append(createElement("div", "", formatDayName(date)), createElement("div", "", formatDisplayDate(date)));
    row.append(cell);
  });
  head.append(row);
  return head;
}

function buildBody(dates: readonly string[], view: TrackerView): HTMLElement {
  const body = document.createElement("tbody");
  const visible = view.habits.filter((habit) => dates.some((date) => listExpectedHabits([habit], date).length === 1));
  for (const habit of visible.sort((left, right) => left.position - right.position)) {
    const row = document.createElement("tr");
    row.append(createElement("td", "habit-name", habit.name));
    dates.forEach((date, index) => {
      if (index > 0 && isWeekendGap(dates[index - 1], date)) {
        row.append(createElement("td", "weekend-separator"));
      }
      row.append(buildDayCell(habit, date, view.entries[date] ?? null));
    });
    body.append(row);
  }
  return body;
}

function buildDayCell(habit: Habit, date: string, entry: DayEntry | null): HTMLElement {
  const cell = createElement("td", "day-cell");
  const expected = listExpectedHabits([habit], date).length === 1;
  if (entry?.dayOff === true) {
    cell.append(createElement("span", "muted", "OFF"));
    return cell;
  }
  if (!expected) {
    return cell;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = entry?.habits[habit.id] === true ? "checkbox checked" : "checkbox";
  button.textContent = entry?.habits[habit.id] === true ? "✓" : "";
  button.dataset.action = "toggle-habit";
  button.dataset.habitId = habit.id;
  button.dataset.date = date;
  button.setAttribute("aria-pressed", entry?.habits[habit.id] === true ? "true" : "false");
  button.setAttribute("aria-label", `${habit.name} le ${formatDisplayDate(date)}`);
  cell.append(button);
  return cell;
}

function buildPartners(view: TrackerView): HTMLElement {
  const section = createElement("section", "partners");
  section.append(createElement("h2", "", "Défi Ark"), createElement("p", "muted", "Le score global, sans le détail des habitudes."));
  if (view.mode === "local") {
    section.append(createElement("p", "", "L'invitation et le score partagé arrivent avec la connexion au compte."));
    return section;
  }
  if (view.challenge === null) {
    section.append(createButton("Créer le défi et inviter", "create-challenge", "primary"));
    return section;
  }
  const link = document.createElement("input");
  link.className = "invite-link";
  link.readOnly = true;
  link.value = buildInviteUrl(view.challenge.id, view.challenge.currentInviteId);
  link.setAttribute("aria-label", "Lien d'invitation");
  const actions = createElement("div", "partner-actions");
  actions.append(createButton("Copier le lien", "copy-invite"), createButton("Nouveau lien", "replace-invite"));
  section.append(link, actions);
  const others = view.summaries.filter((summary) => summary.userId !== view.userId);
  const pending = view.memberIds.filter((memberId) => memberId !== view.userId && !others.some((summary) => summary.userId === memberId));
  if (others.length === 0 && pending.length === 0) {
    section.append(createElement("p", "", "Le lien est prêt. Le score de l'autre personne apparaîtra ici."));
  }
  for (const summary of others) {
    section.append(buildPartnerCard(summary));
  }
  for (const memberId of pending) {
    section.append(createElement("p", "muted", `Participant ${memberId.slice(0, 4)} n'a pas encore de score.`));
  }
  return section;
}

function buildPartnerCard(summary: StoredSummary): HTMLElement {
  const card = createElement("article", "partner-card");
  const header = document.createElement("header");
  header.append(
    createElement("h2", "", summary.displayName),
    createElement("strong", "", formatPercent(summary.completionRate)),
  );
  const stats = createElement("p", "muted", `Série ${summary.currentStreak} · ${summary.perfectDays} jours parfaits`);
  card.append(header, stats, buildHeatmapGrid(TRACKER_YEAR, (date) => heatmapLevelFromSummary(summary.days[date])));
  return card;
}

function buildLegend(): HTMLElement {
  return createElement(
    "p",
    "legend",
    "Cliquez une case pour cocher. Cliquez une date pour marquer le jour OFF. Retirer une habitude la garde dans les jours précédents.",
  );
}

function buildInviteUrl(challengeId: string, inviteId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", challengeId);
  url.searchParams.set("code", inviteId);
  return url.toString();
}

function isWeekendGap(previous: string, next: string): boolean {
  const start = new Date(previous).getTime();
  const end = new Date(next).getTime();
  return end - start > 24 * 60 * 60 * 1000;
}

function createButton(label: string, action: string, className = ""): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = action === "submit-habit" ? "submit" : "button";
  button.textContent = label;
  button.dataset.action = action;
  if (className.length > 0) {
    button.className = className;
  }
  return button;
}

function createIconButton(label: string, action: string, habitId: string, ariaLabel: string): HTMLButtonElement {
  const button = createButton(label, action);
  button.dataset.habitId = habitId;
  button.setAttribute("aria-label", ariaLabel);
  if (action === "archive-habit") {
    button.classList.add("danger");
  }
  return button;
}

function createElement(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className.length > 0) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function readInputValue(root: HTMLElement, selector: string): string {
  const input = root.querySelector<HTMLInputElement>(selector);
  return input?.value ?? "";
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
