# Habit Tracker improvement plan

Status: proposal for review. No product code changes until this plan is approved.

The current app is a single static page (`index.html`) hosted so it can be opened from a laptop and embedded in Notion on a phone. Checks and days off live in `localStorage` under `habitTrackerData` and `habitTrackerDaysOff`. That storage belongs to one browser on one device, so the phone and the laptop never see the same data.

This plan turns that page into a small shared tracker that can later become an iOS app, without building the iOS app now.

## Goals

1. One account, same checks on the phone and on the laptop, including after the browser is closed.
2. A second person can join a challenge and see the other person's global score.
3. Data stays private by default. Sharing is an explicit choice.
4. The data shape and the login model stay usable from a future native iOS client.

## What stays the same

The daily habit of the app stays the same:

- Three habits: Early wake up, Run, Business work.
- Weekdays only (Monday to Friday).
- A day can be marked OFF.
- A month grid plus a year heatmap for 2026.
- Click a cell to toggle a habit. Click a date header to toggle OFF.

Those rules move from hardcoded page logic into challenge settings, with the Ark challenge created using today's values. Later challenges can change habits or dates without a rewrite.

## Product shape

Two people do not need a social network. They need an account, a challenge, and a score the other person is allowed to see.

### Account

Sign-in is required before any cloud data is read or written. The recommended providers for this MVP are Google and email magic link (passwordless). Both work in the mobile browser. Apple Sign In is added when the native iOS app is built, because Apple requires it once another social login exists in an App Store app. Accounts are not anonymous: an anonymous session is easy to lose when the phone clears site data.

Each person owns their checks. Nobody else can edit them.

### Challenge

A challenge is the shared container. The first one is the Ark challenge:

- Name, start date, and end date.
- The habit list (seeded with the three current habits).
- Weekdays only, with per-day OFF still available.
- Members: the owner, plus people who join with an invite.

Creating a generic "team" product, and a public profile, can wait. A challenge already answers the Ark use case: both people track, and each can see the other's global score. A public profile is a later switch on the account, defaulting to private.

### What the other person sees

The first shared view is a score, not the full grid.

For each member, challenge partners can see:

- Completion rate: checked habits divided by habits expected on eligible days.
- Eligible days: weekdays inside the challenge dates, on or before today, that are not marked OFF.
- Current streak: consecutive eligible weekdays where every habit is checked.
- Perfect-day count.
- The year heatmap, colored by how many habits were done that day (0, 1, 2, or 3) or OFF.

Partners do not see which habit was missed. A day level of `1` does not say whether the miss was the run or the business block. The owner's own screen still shows the full grid.

A later setting on the challenge can turn on "share my full grid" if you both want that. It stays off at the start.

### Invite

The owner creates an invite link with a long random code. The other person signs in, opens the link, and joins. The code can be revoked. Joining does not grant edit rights on the other person's checks.

## Architecture

```text
Phone browser (installed page)     Laptop browser
        |                                  |
        +---------------- Firebase Auth ---+
                           |
                     Cloud Firestore
                           |
              same schema, later iOS app
```

Firebase Auth plus Cloud Firestore is the backend. The same user id and the same documents are what a future Swift app would open with the Firebase iOS SDK. The web page is the proof of concept; the database is the part worth keeping.

The page keeps working offline after the first successful load. Firestore caches data on the device and syncs when the network returns. That replaces `localStorage` as the source of truth. On the first sign-in, the page offers to copy the existing `localStorage` checks into the account, then leaves the browser copy in place until that import succeeds.

Hosting moves to Firebase Hosting. Login redirects and the installable phone page are simpler there than on GitHub Pages. The current GitHub Pages URL can redirect once the new URL exists.

### Notion

The page can stay visually close to what you embed today, but Notion should stop being the place where you log in and check boxes. Notion loads the page inside a frame. Google and magic-link sign-in, and durable storage, are unreliable inside that frame: the popup is blocked, or the phone isolates the frame's storage from Safari.

The phone path for the MVP is the hosted URL, added to the iPhone home screen from Safari (Add to Home Screen). It opens full screen, stays signed in, and syncs. A native app can replace that icon later. A read-only score block for Notion is possible after sync works; it is not part of the first build.

## Data model

This schema is the contract. Field names stay stable so the iOS app does not need a migration on day one.

```text
users/{uid}
  displayName: string
  visibility: "private" | "public"     // private at creation
  createdAt: timestamp

challenges/{challengeId}
  name: string
  ownerId: uid
  startDate: "YYYY-MM-DD"
  endDate: "YYYY-MM-DD"
  weekdaysOnly: true
  habits: [{ id, name }]               // stable habit ids
  shareDetail: false                   // full grid hidden from partners
  createdAt: timestamp

challenges/{challengeId}/members/{uid}
  role: "owner" | "member"
  joinedAt: timestamp

challenges/{challengeId}/invites/{inviteId}
  createdBy: uid
  expiresAt: timestamp | null
  revoked: boolean

users/{uid}/entries/{YYYY-MM-DD}
  challengeId: string
  habits: { [habitId]: boolean }       // owner only
  dayOff: boolean

challenges/{challengeId}/summaries/{uid}
  completionRate: number               // 0..1
  currentStreak: number
  perfectDays: number
  eligibleDays: number
  updatedAt: timestamp
  days: { [YYYY-MM-DD]: 0 | 1 | 2 | 3 | "off" }
```

Owner-only detail lives under `users/{uid}/entries`. Partner-visible numbers live under the challenge summary, which the owner writes for themselves after each change. A member can update only the summary whose id is their own user id.

Dates are stored as `YYYY-MM-DD` strings in the local calendar, not as UTC instants. The page today builds that key with `date.toISOString()`, which can shift a day when the phone timezone is not UTC. Sync would then show Monday's check on Sunday. The date helper is fixed as part of the first phase.

Scores are computed on the client from that person's entries and then saved to their summary document. For two people, that is enough. A member can inflate their own score; the rules stop them from writing the other person's summary. Server-side scoring can be added later if the challenge needs a score that the client cannot edit.

## Security

Default is deny. Every read and write is checked against the signed-in user.

| Data | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}/entries` | That user only | That user only |
| Challenge membership and settings | Members of that challenge | Owner, for settings. Membership changes go through the join flow |
| Invites | Someone who knows the invite id, plus the owner | Owner creates and revokes. A signed-in user may join only through that invite |
| Summaries | Members of that challenge | Only the summary for your own uid |
| Public profile fields | Nobody, until `visibility` is explicitly `public` | That user only |

Rules that go with this:

- No collection is world-readable. There is no `allow read: if true`.
- Invite documents cannot be listed. Access requires the id from the link, so guessing does not work. The id is a long random value.
- A client cannot add itself to a challenge by writing a member document directly. Accepting an invite is one controlled operation that checks the code, expiry, and revocation, then creates the member row.
- Habit payloads are validated: known habit ids, booleans, a real date key, and no extra fields.
- The Firebase web config in the page is public by design. Secrecy lives in the rules, not in hiding that config.
- Security rules are a prototype until they are executed against the emulator with allow and deny cases (owner read, partner read of a summary, partner read of raw entries, forged membership, expired invite). Those tests ship with the rules.
- Firebase App Check is a follow-up once the real domain exists. It raises the cost of calling the API from a random script. It does not replace the rules.

Profile visibility stays `private`. A public mode, when it exists, exposes the summary only, and only after the owner turns it on.

## Phases

### Phase 1 — Sign in and sync

This removes the storage pain.

- Firebase project, Auth (Google and email link), Firestore, and Hosting.
- The page loads and saves entries in Firestore, with offline cache.
- First sign-in can import the current browser data.
- Date keys use the local calendar date.
- Rules and emulator tests for owner-only access.
- The layout and the three habits stay as they are.
- Safari Add to Home Screen works against the hosted URL.

Done when the same account shows the same checks on two browsers after a refresh, and a second account cannot read the first account's entries.

### Phase 2 — Ark challenge and partner score

- Create the Ark challenge from the current habit list and 2026 weekday range.
- Invite link, revoke, and join.
- Each member has a private grid.
- A partner panel shows the other member's completion rate, streak, perfect days, and heatmap.
- Rules and tests cover invite join, summary read, and denial of the raw grid.

Done when two accounts can join one challenge and each sees the other's score update after a check, while the habit-level grid stays private.

### Phase 3 — Only if you still want it

- Optional "share my full grid" inside the challenge.
- Public versus private profile.
- A read-only score view that can be embedded in Notion.
- Editable habits and more than one challenge.
- Apple Sign In, when the iOS project starts.
- App Check on the production domain.

The iOS app is out of scope. Phase 1 and Phase 2 are the proof of concept it would reuse: Auth user ids, the collections above, and the score definition.

## What this plan deliberately leaves out

- A native iOS build, push notifications, and widgets.
- Open teams, feeds, comments, and follow graphs.
- Accounts without a sign-in, and data that is public by default.
- Treating the Notion frame as the logged-in app.

## Confirm before implementation

Reply with changes, or with an approval of the defaults below. Implementation starts after that.

1. Sign-in: Google and email magic link.
2. Partner view: score, streak, and heatmap levels. The habit grid stays private.
3. Ark challenge keeps the three current habits, weekdays, and the 2026 range already in the page.
4. Hosting: Firebase Hosting, with the phone used via Add to Home Screen.
5. Phase 3 (public profile, full-grid sharing, Notion embed) waits until Phase 2 is in use.
6. You create or designate the Firebase project (or grant access). The database location should be close to you; `eur3` (Europe) is the default I will use unless you prefer another region. Rules for a new Firestore database will target the current Firebase enterprise edition.

## Maintainability

The page is one file today, and that is a good fit for a private checkbox grid. It is a poor fit once sign-in, sync, invites, and rules exist. Phase 1 splits three responsibilities: rendering the grid, the challenge rules (what a day means, how a score is counted), and the Firestore repository. The score function is pure and unit-tested, so the iOS app can repeat the same definition instead of copying DOM code. Security rules stay in the repo next to the tests that try to break them. That split is the whole of the "architecture" this MVP needs; a heavier backend would not make two people's checkmarks safer or easier to ship on iOS later.
