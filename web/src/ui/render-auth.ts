/**
 * Sign-in screen. Google uses a redirect on touch devices so iPhone home-screen login can complete.
 */
export function renderAuth(root: HTMLElement, status: string): void {
  const card = document.createElement("section");
  card.className = "auth-card";
  const title = document.createElement("h1");
  title.textContent = "Habit Tracker";
  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent = "Connectez-vous pour retrouver la même checklist sur le téléphone et l'ordinateur.";
  const google = document.createElement("button");
  google.type = "button";
  google.className = "primary";
  google.dataset.action = "google";
  google.textContent = "Continuer avec Google";
  const form = document.createElement("form");
  form.dataset.action = "email-link";
  const email = document.createElement("input");
  email.type = "email";
  email.required = true;
  email.placeholder = "vous@email.com";
  email.autocomplete = "email";
  email.setAttribute("aria-label", "E-mail");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Recevoir un lien";
  form.append(email, send);
  const message = document.createElement("p");
  message.className = "status";
  message.textContent = status;
  card.append(title, intro, google, form, message);
  const container = document.createElement("div");
  container.className = "container";
  container.append(card);
  root.replaceChildren(container);
}
