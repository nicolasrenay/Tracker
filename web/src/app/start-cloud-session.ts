import {
  getRedirectResult,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import { EMAIL_FOR_SIGN_IN_KEY } from "../domain/constants";
import { importLegacyData } from "../domain/import-legacy";
import { sanitizeDisplayName } from "../domain/sanitize-display-name";
import { createStarterHabits } from "../domain/starter-habits";
import { FirestoreTrackerRepository } from "../data/firestore-tracker-repository";
import { readLegacyStorage } from "../data/read-legacy-storage";
import { createFirebaseServices } from "../firebase/create-firebase-services";
import type { FirebaseWebConfig } from "../firebase/read-firebase-config";
import { renderAuth } from "../ui/render-auth";
import { mountTracker } from "./mount-tracker";

/**
 * Signs the visitor in and opens the shared tracker.
 */
export function startCloudSession(root: HTMLElement, config: FirebaseWebConfig): void {
  const services = createFirebaseServices(config);
  let generation = 0;
  let dispose = (): void => undefined;
  void prepareAuth(services.auth).catch(() => undefined).finally(() => {
    onAuthStateChanged(services.auth, (user) => {
      const current = generation + 1;
      generation = current;
      dispose();
      dispose = () => undefined;
      root.onclick = null;
      root.onsubmit = null;
      if (user === null) {
        bindAuth(root, services.auth);
        return;
      }
      void openAccount(root, services.database, user, () => signOut(services.auth)).then((nextDispose) => {
        if (current !== generation) {
          nextDispose();
          return;
        }
        dispose = nextDispose;
      });
    });
  });
}

async function prepareAuth(auth: Auth): Promise<void> {
  try {
    await getRedirectResult(auth);
  } catch {
    return;
  }
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return;
  }
  const stored = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
  const email = stored ?? window.prompt("Confirmez l'e-mail utilisé pour le lien") ?? "";
  if (email.length === 0) {
    return;
  }
  await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
}

function bindAuth(root: HTMLElement, auth: Auth): void {
  let status = "";
  const paint = (): void => {
    renderAuth(root, status);
  };
  paint();
  root.onclick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.action !== "google") {
      return;
    }
    void signInWithGoogle(auth).catch(() => {
      status = "Connexion Google impossible.";
      paint();
    });
  };
  root.onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')?.value ?? "";
    void sendSignInLinkToEmail(auth, email, { url: window.location.href, handleCodeInApp: true })
      .then(() => {
        window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
        status = "Lien envoyé. Ouvrez-le sur cet appareil.";
        paint();
      })
      .catch(() => {
        status = "Envoi du lien impossible.";
        paint();
      });
  };
}

async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) {
    await signInWithRedirect(auth, provider);
    return;
  }
  await signInWithPopup(auth, provider);
}

async function openAccount(
  root: HTMLElement,
  database: ReturnType<typeof createFirebaseServices>["database"],
  user: User,
  onSignOut: () => Promise<void>,
): Promise<() => void> {
  const repository = new FirestoreTrackerRepository(database);
  const displayName = sanitizeDisplayName(user.displayName ?? "Participant");
  await repository.ensureAccount({ userId: user.uid, displayName });
  const legacy = readLegacyStorage(window.localStorage);
  if (legacy !== null) {
    await repository.importEntriesIfEmpty({
      userId: user.uid,
      entries: importLegacyData({ legacy, habits: createStarterHabits() }),
    });
  }
  return mountTracker({
    root,
    repository,
    session: {
      mode: "cloud",
      userId: user.uid,
      displayName,
      email: user.email ?? "",
      onSignOut,
    },
  });
}
