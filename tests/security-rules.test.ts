import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

type RulesFirestore = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-tracker",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("security rules", () => {
  it("lets an owner write a habit and hides it from another account", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(alice.doc("users/alice").set(userPayload("Alice")));
    await assertSucceeds(createHabit(alice, "alice", "run", ["run"]));
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(bob.doc("users/alice/habits/run").get());
    await assertFails(bob.doc("users/alice/entries/2026-10-05").get());
  });

  it("rejects a 13th active habit", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const existing = Array.from({ length: 12 }, (_, index) => `h${index}`);
    await assertSucceeds(alice.doc("users/alice").set(userPayload("Alice")));
    await assertSucceeds(alice.doc("users/alice").update({ activeHabitIds: existing }));
    await assertFails(createHabit(alice, "alice", "extra", [...existing, "extra"]));
  });

  it("shares a summary with a joined member and keeps the checklist private", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(alice.doc("users/alice").set(userPayload("Alice")));
    await assertSucceeds(bob.doc("users/bob").set(userPayload("Bob")));
    await assertSucceeds(createChallenge(alice, "alice", "challenge", "inviteinviteinvite"));
    await assertSucceeds(joinChallenge(bob, "bob", "challenge", "inviteinviteinvite"));
    await assertSucceeds(alice.doc("users/alice/entries/2026-10-05").set({ habits: { run: true }, dayOff: false }));
    await assertSucceeds(alice.doc("challenges/challenge/summaries/alice").set(summaryPayload("Alice")));
    await assertSucceeds(bob.doc("challenges/challenge/summaries/alice").get());
    await assertFails(bob.doc("users/alice/entries/2026-10-05").get());
    await assertFails(bob.collection("challenges/challenge/invites").get());
    await assertFails(bob.doc("challenges/challenge/summaries/alice").set(summaryPayload("Bob")));
  });

  it("rejects a revoked invite and a self-assigned owner role", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(alice.doc("users/alice").set(userPayload("Alice")));
    await assertSucceeds(bob.doc("users/bob").set(userPayload("Bob")));
    await assertSucceeds(createChallenge(alice, "alice", "challenge", "inviteinviteinvite"));
    await assertSucceeds(alice.doc("challenges/challenge/invites/inviteinviteinvite").update({ revoked: true }));
    await assertFails(joinChallenge(bob, "bob", "challenge", "inviteinviteinvite"));
    await assertFails(bob.doc("challenges/challenge/members/bob").set({
      role: "owner",
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
  });
});

function userPayload(displayName: string): Record<string, unknown> {
  return {
    displayName,
    visibility: "private",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    activeHabitIds: [],
  };
}

function habitPayload(): Record<string, unknown> {
  return {
    name: "Run",
    position: 0,
    activeFrom: "2026-01-01",
    archivedOn: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

function summaryPayload(displayName: string): Record<string, unknown> {
  return {
    displayName,
    completionRate: 1,
    currentStreak: 1,
    perfectDays: 1,
    eligibleDays: 1,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    days: { "2026-10-05": { done: 1, expected: 1 } },
  };
}

async function createHabit(
  database: RulesFirestore,
  userId: string,
  habitId: string,
  activeHabitIds: readonly string[],
): Promise<void> {
  const batch = database.batch();
  batch.update(database.doc(`users/${userId}`), { activeHabitIds });
  batch.set(database.doc(`users/${userId}/habits/${habitId}`), habitPayload());
  await batch.commit();
}

async function createChallenge(
  database: RulesFirestore,
  userId: string,
  challengeId: string,
  inviteId: string,
): Promise<void> {
  const batch = database.batch();
  batch.set(database.doc(`challenges/${challengeId}`), {
    name: "Ark",
    ownerId: userId,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    weekdaysOnly: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    currentInviteId: inviteId,
  });
  batch.set(database.doc(`challenges/${challengeId}/members/${userId}`), {
    role: "owner",
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(database.doc(`users/${userId}/memberships/${challengeId}`), {
    role: "owner",
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(database.doc(`challenges/${challengeId}/invites/${inviteId}`), {
    createdBy: userId,
    expiresAt: null,
    revoked: false,
  });
  await batch.commit();
}

async function joinChallenge(
  database: RulesFirestore,
  userId: string,
  challengeId: string,
  inviteId: string,
): Promise<void> {
  const batch = database.batch();
  batch.set(database.doc(`challenges/${challengeId}/members/${userId}`), {
    role: "member",
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    inviteId,
  });
  batch.set(database.doc(`users/${userId}/memberships/${challengeId}`), {
    role: "member",
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
