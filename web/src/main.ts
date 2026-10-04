import { mountTracker } from "./app/mount-tracker";
import { startCloudSession } from "./app/start-cloud-session";
import { LocalTrackerRepository } from "./data/local-tracker-repository";
import { readLegacyStorage } from "./data/read-legacy-storage";
import { readFirebaseWebConfig } from "./firebase/read-firebase-config";
import "./style.css";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

const config = readFirebaseWebConfig();
if (config === null) {
  const repository = new LocalTrackerRepository(window.localStorage, readLegacyStorage(window.localStorage));
  void repository.ensureAccount({ userId: "local", displayName: "Moi" }).then(() =>
    mountTracker({
      root,
      repository,
      session: { mode: "local", userId: "local", displayName: "Moi", email: "" },
    }),
  );
} else {
  startCloudSession(root, config);
}
