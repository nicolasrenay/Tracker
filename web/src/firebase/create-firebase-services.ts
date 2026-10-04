import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseWebConfig } from "./read-firebase-config";

/** Auth plus Firestore, with an on-device cache so checks survive a dropped network. */
export interface FirebaseServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly database: Firestore;
}

/**
 * Starts Firebase. Listeners stay on the standard SDK because the phone must update live and offline.
 */
export function createFirebaseServices(config: FirebaseWebConfig): FirebaseServices {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const database = createDatabase(app);
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(database, "127.0.0.1", 8080);
  }
  return { app, auth, database };
}

function createDatabase(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}
