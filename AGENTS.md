# AI AGENT EXECUTION GUARDRAIL

## Execution Speed & Scope Constraints
- **PRIORITIZE SPEED OVER PERFECT PLANNING:** Aim to apply file changes within 2–3 turns max.
- **DO NOT INVOKE HEAVY SUBAGENTS:** Unless explicitly requested by the user, DO NOT spawn `planner`, `file-picker`, `code-reviewer`, `browser-use`, or `web-research` subagents.
- **NO DEEP REPO SEARCHES:** Do not scan the entire codebase or read unrelated files. Use the Repository Map in Section 2 to locate target files immediately.
- **SINGLE-FILE DIRECT EDITS:** Write fixes directly to disk using `apply_patch`. Do not write multi-step dry-run summaries or `/plan` documents before editing.


# Blink Chat Agent Guide

This file is the repository-level operating guide for AI agents and other automated contributors working on Blink Chat. Read it before making changes. It describes the current architecture, important data invariants, Firebase rules, known platform limitations, validation commands, and project-specific ways to avoid regressions.

## 1. Project purpose

Blink Chat is a real-time community chat application with:

- Firebase Authentication for account identity.
- Cloud Firestore for relatively durable metadata such as users, communities, channels, roles, and per-channel read markers.
- Firebase Realtime Database (RTDB) for live chat messages, private messages, presence, voice participants, and private-conversation indexes.
- React and React Router for the client application.
- Vite for development and production builds.
- CSS Modules plus global CSS for styling.
- WebRTC/MiroTalk integration for voice/video calls.
- A PWA service worker for shell/offline caching.
- Optional Tauri packaging under `src-tauri/`.

The application is deployed to Firebase Hosting for the Firebase project configured in `.firebaserc`. The package name is still `temp-app`; do not rename it casually because deployment and tooling may depend on the existing project setup.

## 2. Repository map

Important locations:

```text
src/
  App.jsx                         Application root
  main.jsx                        Bootstrapping, import timeout, startup error handling
  router.jsx                      Lazy routes and protected-route loading UI
  index.css                       Global layout, typography, tokens, responsive foundations
  components/
    chat/ChatArea.jsx             Community channel UI, message loading, composer, read state
    chat/ChatArea.module.css      Channel UI and composer styles
    common/                       Error screens, modals, avatars, profiles, onboarding
    layout/                       App shell, navigation, community/channel sidebars
  contexts/
    AuthContext.jsx               Firebase Auth and user profile lifecycle
    NotificationContext.jsx       In-app/local notifications and notification preferences
    CallContext.jsx               Call state and signaling integration
    ThemeContext.jsx              Theme state
  firebase/
    firebase.js                   Firebase app/config initialization from Vite env variables
    data.js                       Firestore and RTDB service handles
  pages/                          Route-level screens
  services/
    db.js                         Firestore/RTDB data access and session caches
    permissions.js                Role and permission calculations
    utils.js                      Shared utilities, including mention matching
    upload.js                     Ephemeral file upload integration

public/
  sw.js                           PWA shell cache only; no closed-app push backend
  manifest.webmanifest            PWA metadata
  notification.mp3                Local notification sound

database.rules.json               Firebase Realtime Database security rules
firestore.rules                   Cloud Firestore security rules
firestore.indexes.json            Firestore indexes
firebase.json                     Hosting, Firestore, RTDB, and Auth configuration
.firebaserc                       Active Firebase project mapping
vite.config.js                    Vite configuration
package.json                      Scripts and dependencies
src-tauri/                        Optional desktop packaging
dist/                             Generated build output; do not hand-edit
functions/                        Existing directory that is not currently wired into firebase.json
```

There may be unrelated existing modifications in the worktree. Preserve them. Do not reset, checkout, clean, or overwrite broad areas of the repository merely to make a task easier.

## 3. Development and validation commands

Install dependencies:

```powershell
npm install
```

Run the development server:

```powershell
npm run dev
```

Run the standard checks after code changes:

```powershell
npm run lint
npm run build
node --check public/sw.js
git diff --check
```

`npm run build` currently emits a non-failing warning about a large generated chunk. Treat that as a performance follow-up, not as a build failure, unless the task specifically concerns bundle size or startup performance.

The project does not currently define a test script. For data-layer or UI behavior changes, add focused tests only if the existing test infrastructure is introduced; otherwise validate with lint, build, careful source inspection, and manual browser testing.

Before using Firebase CLI commands, verify the CLI version with:

```powershell
npx -y firebase-tools@latest --version
```

Use the configured project from `.firebaserc`; do not invent a project ID. Deployment commands can change remote state and should be run only when the user has asked for deployment or the task explicitly includes it.

## 4. Environment and secrets

Firebase configuration is read from Vite variables in `.env`:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Do not commit `.env`, credentials, service-account JSON, private keys, or user data. Firebase web configuration values are not treated as secrets, but authentication and authorization are enforced by Firebase rules, not by hiding client configuration.

If Firebase is unavailable or incompletely configured, the application is expected to fail gracefully where possible. Keep the existing startup and application error boundaries useful rather than allowing an obscure null-reference failure to replace them.

### `.env` handling rules (important)

- `.env` holds the user’s real Firebase configuration and is owned by the user. **Do NOT edit `.env`.** The user inputs the values themselves.
- **Do NOT read the contents of `.env`.** If you absolutely must read it, STOP and ask the user for explicit permission first; never read it without that consent.
- When a task needs dummy credentials for local dev/preview, use the `.env-agent` swap workflow instead:
  1. `.env-agent` mirrors `.env` (same `VITE_FIREBASE_*` keys) but with placeholder/dummy values.
  2. To switch to dummy values: rename `.env` → `.env-backup`, then rename `.env-agent` → `.env`.
  3. When finished with dummy values, restore: rename `.env` → `.env-agent`, then rename `.env-backup` → `.env`.
  - Never leave the files swapped at the end of a turn; always restore the real `.env` before handing off.
- `.env`, `.env-agent`, and `.env-backup` are all gitignored and must never be committed.

## 5. Firebase architecture and boundaries

### Authentication and profiles

`AuthContext.jsx` lazily imports Firebase Auth and profile-related Firestore tools. It exposes `currentUser`, `loading`, login/register/logout, Google login, password reset, and account updates.

User profile documents live at:

```text
users/{uid}
```

Profile state is initially available from Auth and later enriched by the Firestore profile listener. Code must tolerate `profileLoaded === false` and partially populated `profile` objects during startup.

Rules/tutorial acceptance is intentionally cached locally to reduce startup flicker. Local storage is an optimization, not an authority. The Firestore value must still be written and read for account correctness, especially when a user changes device or clears browser storage.

### Firestore

Use Firestore for:

- `users/{uid}` profiles and preferences.
- `communities/{communityId}` metadata.
- `channels/{channelId}` metadata and ordering.
- `users/{uid}/lastRead/{channelId}` channel read markers.
- Other durable metadata already represented by the existing service functions.

Use the existing service functions in `src/services/db.js` rather than scattering raw Firestore calls through components. If a new query is needed, add a small service-layer function and update `firestore.rules` and indexes as necessary.

### Realtime Database

Use RTDB for:

- `messages/{channelId}/{messageId}` community messages.
- `privateConversations/{conversationId}` PM metadata and messages.
- `privateConversationsByUser/{uid}/{conversationId}` the user-facing PM index and scalar `lastReadAt`.
- `presence/{uid}` online state.
- `voiceParticipants/{channelId}/{uid}` voice roster state.

RTDB subscriptions can invoke their initial callback immediately. Never reference a `const` unsubscribe variable from inside an `onValue` callback before the assignment has completed. Create a subscription entry first, assign its unsubscribe handle afterward, and make cleanup null-safe.

When using multi-location writes, verify every target path against `database.rules.json`. A write can partially appear to succeed from the UI while another path produces `permission_denied`. Prefer separate, rule-compliant writes when different user ownership rules apply.

Any RTDB rules change must be audited for:

- Unauthorized reads or writes through parent/child rule inheritance.
- Whether a user can modify another user’s data.
- Create versus update bypasses.
- Numeric/string/boolean validation.
- Length and resource-exhaustion limits.
- Whether the rule still supports the intended app behavior.

## 6. Message ordering and caching invariants

RTDB push IDs are the authoritative cross-device ordering key for messages. Message timestamps can collide or be affected by client clock differences. The existing merge path sorts messages by push ID in `mergeMessagesById`; do not reintroduce sorting solely by `timestamp`.

Channel message caching is session-only:

- First visit loads the latest message window.
- Returning to a visited channel displays the in-memory cache and listens for newer messages.
- Loading older messages increases the requested window.
- A full cache clear or account switch clears message bodies.
- Do not move message bodies to localStorage without an explicit privacy/storage decision.

When changing `subscribeToMessages`, preserve deduplication by message ID and avoid emitting the same message repeatedly. Subscription cleanup must always happen when the channel, user, or component unmounts.

## 7. Read/unread behavior

Unread behavior is a cross-cutting feature. Changes must be checked in the chat view, sidebar, Communities page, PM page, notification context, and data service.

### Community channels

Channel read state is stored at:

```text
users/{uid}/lastRead/{channelId}.timestamp
```

The current implementation intentionally writes a monotonic marker through the latest message actually loaded. Do not replace it with an unguarded `Date.now()` write: device clock skew and out-of-order writes can leave messages visibly unread.

`updateLastRead` uses a transaction and clears relevant session caches. Keep these properties:

- Older delayed writes cannot overwrite newer read state.
- In-flight unread loads cannot repopulate stale cache entries after invalidation.
- A focused channel responds to pointer, touch, click, and key interactions.
- Focus and visibility restoration mark the active channel read.
- New messages received while the active channel is visible/focused are handled consistently.

The global interaction listener is intentionally capture-phase because clicks and key events may occur inside nested controls. Do not make it clear a channel that is not the active route.

### Private messages

PM index entries use a scalar:

```text
privateConversationsByUser/{uid}/{conversationId}/lastReadAt
```

Do not treat `lastReadAt` as `{ [uid]: timestamp }`. PM unread checks compare the conversation’s `updatedAt` and `lastSenderUid` against this scalar.

PMs should become read on any key press, click, tap, or pointer interaction while the selected conversation is focused, not only after sending a message. Use the latest loaded PM timestamp when marking the conversation read.

### Badges

- Mention unread counts use numbers.
- Ordinary channel unread activity uses a dot without a number.
- Communities and community cards should identify which communities/channels have unread activity.
- Avoid displaying stale badge state after a read write; invalidate the appropriate cache and notify the UI through the existing unread event.

## 8. Notifications and iOS/PWA limitations

`NotificationContext.jsx` owns local notification preferences, sound, permission requests, private-message notification subscriptions, and global channel-message notification subscriptions.

Notifications must not depend on the user currently viewing the channel. Global subscriptions should evaluate mentions and PMs independently of the current route, subject to mute/preferences settings.

The service worker in `public/sw.js` is currently a PWA shell cache. Firebase Cloud Messaging and a server-side push function were intentionally removed because the project was not using the required paid Firebase setup. Therefore:

- Notifications can work while Blink is open or while the browser/PWA remains alive in the background.
- A fully closed iOS Home Screen PWA cannot receive real-time notifications without a push backend and APNs/Web Push support.
- Do not claim that service-worker caching alone enables closed-app iOS notifications.
- Do not reintroduce FCM, functions, token storage, or a push backend without an explicit product/hosting decision.

When editing `sw.js`, keep cache versioning and old-cache cleanup correct. Do not cache Firebase data or user-specific message content in the app shell cache.

## 9. Mention composer behavior

The channel composer supports `@user`, `@everyone`, `@role`, and `#channel` suggestions.

Current UX requirements:

- Mention text should highlight directly in the composer, not in a separate preview panel.
- Selecting an option must preserve the input’s focus, caret position, and mobile keyboard where the platform allows it.
- Use pointer/mouse down prevention plus explicit refocus and selection restoration when changing the input value.
- Do not navigate away merely to render a draft mention.
- Sent-message mention rendering must remain clickable and must not be broken by composer changes.

When modifying mention parsing, keep display-name escaping and boundary matching in `mentionsUser` correct. Avoid substring matching that treats `@alex` as a match inside `@alexander`.

## 10. Responsive/mobile UI requirements

Blink supports desktop, tablet, and mobile layouts. Existing mobile requirements include:

- The mobile navigation bar is opaque and reserves space for the composer.
- The mobile channel/PM sidebar opens through the upper-left hamburger menu.
- The hamburger is a menu affordance, not a generic extra button.
- Sidebar content can scroll without exposing an unwanted visible scrollbar.
- The bottom of tablet sidebars remains reachable.
- Private messages have their own mobile sidebar.
- The mobile tab label is “Communities”, not “Comms”.
- Cards and headings must fit the viewport; never rely on desktop fixed widths that crop horizontally.
- The collapsed desktop/tablet Blink logo must remain fully visible.

Use safe-area insets for iOS bottom/top regions. When changing fixed or sticky elements, test the effective content height with the mobile bottom bar present.

## 11. Loading, startup, and error handling

Startup has multiple asynchronous boundaries:

- Dynamic application import in `main.jsx`.
- Auth initialization.
- Firestore profile loading.
- Lazy route imports.
- Community/channel/message subscriptions.

Keep timeout fallbacks finite and actionable. Error screens should show:

- A human-readable summary.
- A useful error name/message when available.
- A retry action.
- Enough diagnostic context for debugging without exposing credentials or private message content.

Do not hide Firebase listener errors with empty catches unless the UI has an intentional fallback. Log concise, contextual warnings and pass errors to the appropriate error boundary or callback.

When investigating “Loading Blink” or preload bundle failures, check both the dynamic import recovery logic and service-worker cache versioning. A stale cached `index.html` pointing at deleted hashed assets can look like a random preload error.

## 12. Coding conventions

- Use React function components and hooks.
- Keep data access in `src/services/`.
- Use CSS Modules for component/page styles; use `src/index.css` only for genuinely global styles and tokens.
- Preserve existing lazy loading and error recovery patterns.
- Prefer small, named helpers for complex read/notification/message logic.
- Use optional chaining and null-safe cleanup for Firebase listeners.
- Make async effects cancellation-safe so late responses do not update unmounted or changed views.
- Do not add dependencies for a small utility that can be implemented safely with existing APIs.
- Keep user-visible wording clear and concise.
- Avoid logging message text, tokens, profile data, or other sensitive content unnecessarily.

## 13. Safe change workflow for agents

1. Inspect the relevant component, service, rules file, and route before editing.
2. Check `git status` and preserve unrelated worktree changes.
3. Trace both the write path and the subscription/read path for real-time features.
4. If Firebase rules are involved, inspect the exact authenticated paths and audit parent/child inheritance.
5. Make the smallest coherent patch with `apply_patch`.
6. Run lint, build, service-worker syntax validation when relevant, and `git diff --check`.
7. If deployment is requested, deploy the matching hosting/rules artifacts together and report exactly what was deployed.
8. Report known limitations honestly, especially closed-app iOS notification limitations.

Never use destructive commands such as `git reset --hard`, broad recursive deletion, or overwriting the entire workspace to resolve a local problem without explicit user authorization.

## 14. Deployment notes

Firebase Hosting is configured in `firebase.json` with `dist` as the public directory and an SPA rewrite to `/index.html`. A normal production deployment requires a fresh build first:

```powershell
npm run lint
npm run build
npx -y firebase-tools@latest deploy --only hosting
```

If `database.rules.json` or `firestore.rules` changed, deploy the corresponding rules in the same release after reviewing the diff:

```powershell
npx -y firebase-tools@latest deploy --only hosting,database,firestore
```

The project may require an authenticated Firebase CLI session. Do not attempt to upgrade billing, enable paid APIs, or create a push backend without explicit user authorization.

## 15. Final verification checklist

Before handing off a change, verify the applicable items:

- `npm run lint` passes.
- `npm run build` passes.
- `node --check public/sw.js` passes when the service worker changed.
- `git diff --check` has no actual whitespace errors.
- New Firebase paths are represented in rules.
- Multi-user RTDB writes do not violate ownership rules.
- Listener cleanup works on route change and unmount.
- Message ordering still uses stable push-ID ordering.
- Read markers are monotonic and cache invalidation is correct.
- PM unread comparisons use scalar `lastReadAt`.
- Notifications do not depend on the active channel.
- Mobile layout does not crop horizontally or hide content behind fixed navigation.
- No secrets or private user data were added to source, logs, caches, or generated artifacts.
- Any remaining platform limitation is stated in the final response.

