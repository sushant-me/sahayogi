# Verification log

Every claim in this repository that can be checked was checked, and the commands are recorded here so
anyone can repeat them. Claims that could **not** be verified yet are listed at the bottom, unedited.

Run the whole automated gate in one command:

```bash
npm run verify      # lint → types → 130 tests → production build
```

---

## Automated evidence

| Claim | How | Result |
|---|---|---|
| The routing table behaves as documented | `npm test` (20 cases over `decideRoute`) | pass |
| A malformed remote policy cannot break the app | `npm test` (13 cases over `parsePolicy`) | pass |
| Devanagari is routed to the cloud by design | `npm test` (12 cases over `detectScript`) | pass |
| The orchestration layer passes the right mode to the SDK | `npm test` (`engine.test.ts`, only `models.ts` mocked, 13 cases) | pass |
| Refusals happen **before** an SDK call | `engine.test.ts` asserts `buildModel` was not called | pass |
| Failure taxonomy maps real error shapes | `npm test` (17 cases over `classifyError`) | pass |
| The ledger export is self-describing and keeps disagreements | `npm test` (8 cases) | pass |
| No unused code or type holes | `tsc -b`, `oxlint src` | 0 errors, 0 warnings |
| The Quiz screen renders cards, prose fallback and exam sections | `npm test` (`QuizPage.test.tsx`, jsdom, 5 cases) | pass |
| Quiz generates a **10-question exam** with an answer key, from prose output | clicked "10-question exam" on the deployed site with sample notes | 10 numbered questions (6 short answer, 4 multiple choice) plus a correct answer key, badged `☁️ cloud 81133 ms`, reason `device-not-ready` — captured at `docs/screenshots/quiz-exam.png` |
| Quiz generates real flashcards through the model | clicked "Flashcards" on the deployed site with sample notes | 8 cards returned, last generation badged `☁️ cloud 6826 ms`, reason `device-not-ready` |
| Remote Config drives routing with no deploy | published `routing_policy` with `heavyThresholdChars: 60`, reloaded the deployed app | header chip `policy: remote`, Settings `source: remote`, parsed threshold **60** — captured at `docs/screenshots/policy-remote.png`; restored to 800 afterwards |
| The ledger export is a real file | asked one question on the deployed app, opened Settings → Export routing log | `docs/evidence/sahayogi-routing-log-2026-11-24-18-18-31.json` — one row: `only_in_cloud` / `device-not-ready` → `in_cloud`, agreed, `gemini-3.6-flash`, 4655 ms |
| Load performance on the deployed build | CDP against the live URL, 1440x940: navigation timing + layout-shift observer | TTFB **444 ms**, DOMContentLoaded **1.44 s**, load **1.45 s**, cumulative layout shift **0**, JS heap **16 MB** at rest. Largest Contentful Paint was not captured reliably, so it is not claimed. |
| Reported latency matches what the user waits | same run: sampled the DOM every 100 ms while a real answer streamed | first model text at **26.3 s**, answer complete at **26.5 s**, badge `cloud 26310 ms`, ledger row `26310 ms` — the badge is within ~200 ms of the wall clock, so it is not a flattering number |
| A slow answer does not look hung | sampled the placeholder at 3 s / 7 s / 11 s | `Thinking… 3s`, `Thinking… 7s`, `Thinking… 11s` — the counter ticks while the model works |
| The layout holds on a phone | loaded the deployed app at 390×844 (DPR 2) | no horizontal overflow (`scrollWidth === clientWidth`), cards stack, nav wraps — `docs/screenshots/mobile.png` |
| The deployed build boots with no network | cut the network at protocol level after the service worker activated, then reloaded | **PASS** — full UI rendered, header `offline`, offline banner shown |
| A chat and its messages persist to Firestore and come back from it | asked a question on the deployed site, then opened History | chat listed as `synced` with `2 messages`, user + model turns, model turn badged `☁️ cloud 5247 ms`, route mix `☁️ 1`, and **zero** "Database not found" warnings |
| History works with no authenticated identity | rendered in the browser with auth failing | shows **local only · not synced**, no dead-end screen |
| Readiness can be checked without guessing | `npm run preflight` | reports config PASS, AI Logic 403 with the exact console step, auth state, App Check mode |
| The app builds and precaches | `vite build` | 14 precache entries, 1.19 MB |

Two real defects were found by these tests rather than by review, and fixed:

- `classifyError` ignored `error.name`, so DOMException-shaped failures (`NotSupportedError`,
  `AbortError`) fell through to `UNKNOWN`.
- `classifyError` rejected hyphenated gRPC codes (`resource-exhausted`), so quota errors were misclassified.

---

## Runtime evidence

### Offline cold start — **verified**

Method: build, serve `dist`, load once so the service worker activates, then cut the network at the
protocol level and reload.

```
service worker: active
online  text: "Sahayogi … hybrid study assistant · setup required …"
offline text: "Sahayogi … hybrid study assistant · setup required …"
PASS: app rendered a full screen with no network
```

The network was disabled with CDP `Network.emulateNetworkConditions({ offline: true })` before
`Page.reload()` — not by unplugging a cable, so a proxy or cache in the middle could not have hidden a
failure.

### Browser capability probes — **verified**

| Browser | Probe | Output |
|---|---|---|
| Google Chrome 158.0.8127.88 | `typeof LanguageModel` | `"function"` |
| Google Chrome 158.0.8127.88 | `await LanguageModel.availability()` | `"downloadable"` (hardware check passed: 12 cores, 16 GB reported) |
| Brave 158.1.100.58 | `typeof LanguageModel` | `"undefined"` → cloud-only, and the UI says so |
| Arch Chromium 155 | `typeof LanguageModel` (headless) | `"undefined"` |

### Route preview — **verified**

Typing Devanagari in the Ask page renders, before sending:

```
Route preview  ☁️ cloud PREDICTED   this language is cloud-only · 61 chars
```

The preview badge is dashed and labelled `PREDICTED`; it only becomes solid evidence once
`inferenceSource` comes back from the SDK.

### Transparency panel — **verified (rendering)**

With a seeded ledger the panel renders prediction → actual pairs, flags `prediction missed`, shows
per-decision latency and the device string, and enables `Export routing log (JSON)`.

### Deployment and project wiring — **verified**

| Item | State |
|---|---|
| Hosting | **live at https://hackthon-dcdf7.web.app** — 200, correct `<title>`, `/sw.js` served |
| Public repository | **https://github.com/sushant-me/sahayogi** — public, GitHub reports `licenseInfo: Apache-2.0`, homepage and topics set |
| Composition CI | both runs `success` on the first push (32 s); badge served 200 |
| No secrets published | zero history hits for API keys, OAuth tokens, the App Check debug token, the reCAPTCHA site key, or private keys; `dist/`, `.env.local` and `node_modules/` untracked |
| Web app registration | `1:508887070917:web:0f5b513056d407471c98ac` (created during this build) |
| Cloud APIs enabled via the authorized CLI | `firestore`, `identitytoolkit`, `securetoken`, `firebasevertexai`, `firebaseappcheck`, `generativelanguage`, `recaptchaenterprise` |
| App Check debug token | registered as `sahayogi-dev`, stored in `.env.local` (gitignored) |
| Firestore | database `default` created, `asia-south1`, `freeTier: true`; the SDK is pinned to that id via `VITE_FIRESTORE_DATABASE_ID` because the project has no `(default)` database |

The CLI reports Firestore as "API has not been used" while the REST API returns the database list
successfully with the same credentials; the CLI was attempting to create the *second* database id
`(default)`, which does require billing. Recorded because it misled me for several minutes.

### The cloud request genuinely reaches Google — **verified**

Running the app against the real project (web app registered in `hackthon-dcdf7`, config in
`.env.local`) produced an actual server response rather than a client-side failure:

```
POST https://firebasevertexai.googleapis.com/v1beta/projects/hackthon-dcdf7/models/gemini-3.8-flash:streamGenerateContent?alt=sse
→ 403 ACCESS_DENIED  "Permission denied on the service."
```

What that proves: the web config is valid, the hybrid model object initialised, the SDK selected its
cloud path, requests are not blocked by App Check or CORS, and the failing layer is **Google-side API
enablement** — i.e. AI Logic has not been enabled for the project yet. The error is surfaced to the user
as `PERMISSION_DENIED` with that exact remedy, not as "check your connection".

### The AI Logic onboarding chain, as it actually behaved — **verified**

Getting a cloud answer required four distinct things, each of which failed differently:

1. **Service enabled** — `firebasevertexai.googleapis.com` was `SERVICE_DISABLED`. Enabled through the
   user's own OAuth grant via the Service Usage API.
2. **AI Logic genai config** — `400 FAILED_PRECONDITION: Firebase AI Logic genai config not found`. This is
   *not* created by enabling the API. It required the console wizard, which refuses to finish until
   step 3: **"You must register your app with App Check using one of the supported attestation providers."**
3. **App Check with a real provider** — a registered *debug token* was not enough for the wizard. A
   reCAPTCHA Enterprise key was created for `hackthon-dcdf7.web.app` / `localhost` and registered as the
   app's `recaptchaEnterpriseConfig`; only then did the wizard complete.
4. **Model id** — `gemini-2.5-flash` returns `404 … no longer available to new users. Please update your
   code to use models/gemini-3.8-flash`. In this project only **`gemini-3.6-flash`** answered; `3.8-flash`
   returned `500 high demand` and the rolling alias returned `429 quota`. The default is now
   `gemini-3.6-flash` with a fallback chain over the others, which took a real answer from 68 s to 5 s.

Fixtures 2 and 3 explain every "permission denied" seen in earlier rounds: enabling a service does not
create the AI Logic config, and App Check needs an attestation provider, not a debug token.

### Firestore: writes that only ever reached the local cache — **found and fixed**

History showed chats as "synced" and listed them, while every conversation claimed **0 messages**. The
browser console explained it:

```
@firebase/firestore: Database '(default)' not found. Please check your project configuration.
```

The project's database is named `default`; the SDK defaults to `(default)`. Offline persistence made the
writes *look* successful — they were sitting in the local cache, never on the server. Fixed by passing the
database id to `initializeFirestore(app, opts, "default")` (configurable via
`VITE_FIRESTORE_DATABASE_ID`) and by targeting the same id in `firebase.json` so rules deploy to it.

### The root cause of five rounds of 401s — **found by reading the network tab**

Every cloud request had been failing with `401 Firebase App Check token is invalid`. The final
diagnostic was that **no reCAPTCHA network traffic occurred at all** during an attempt — meaning App Check
was never initialising. It was:

```ts
export function initAppCheck(): AppCheck | null { … }   // defined
// …and never called anywhere in the app
```

The function existed, was correct, and was dead code. That is why enabling services, registering a
reCAPTCHA key, and lowering `minValidScore` all changed nothing: no token was ever being minted.

Fixed by initialising App Check inside `getAiLogic()` — immediately before the AI client, so no request
can be sent unattested — and again during bootstrap so the first question is not the token exchange's
first use. The deployed app then answered normally on the first try.

Two follow-on defects were found the same way, by looking at the result rather than trusting it:

- **Duplicate answer bubble**: the streaming placeholder stayed visible while the Firestore write was
  awaited, so the same answer rendered twice. Now the placeholder is cleared before persisting.
- **LaTeX leaking into a study answer**: `$V = I \times R$` was shown literally. A conservative
  `tidyModelText()` converts common tokens (×, ÷, √, fractions) and strips math delimiters only when the
  span actually looks like maths — so `"It costs $5 and $7"` survives.

### A hang found by running it, not by reading it — **found and fixed**

The first run of that same build **hung indefinitely** at `Thinking…`. Chrome reported
`availability() === "downloadable"`, so the policy asked the SDK for `prefer_on_device`; on a machine
where the weights never arrive, the SDK waits on the download and never falls back.

Fixed in three places: the policy only asks for the device when `availability() === "available"`
(new `device-not-ready` reason); the engine races the initial device call against a 12 s timeout and
retries once in the cloud, reporting `predicted=prefer_on_device / actual=in_cloud` so the badge reads
`cloud (fallback)`; and an explicit On-device pin raises `DEVICE_NOT_READY` instead of being silently
substituted. A 403 that the SDK words as "Error fetching … Permission denied" was also misclassified as
a network error and is now `PERMISSION_DENIED`.

### SDK contract — **verified against the installed package, not the docs**

From `@firebase/ai@3.1.0` type declarations and bundled code:

- `getGenerativeModel(ai, params)` accepts `ModelParams | HybridParams`; `HybridParams.mode` is required.
- `InferenceMode` = `prefer_on_device | only_on_device | only_in_cloud | prefer_in_cloud`.
- `EnhancedGenerateContentResponse.inferenceSource` = `"on_device" | "in_cloud"`.
- `GenerativeModel.initializeDeviceModel(onDownloadProgress?)` exists and is documented as requiring a
  user gesture.
- `LanguageModelCreateOptions` accepts **only** `expectedInputs`, `expectedOutputs`, `initialPrompts`,
  `monitor`, `signal` — Chrome's `temperature`/`topK` are not forwarded.
- The SDK detects the browser through `languageModelProvider.availability()`, i.e. Chrome's
  `LanguageModel.availability()` — not the removed `window.ai` shape.

---

## The negative result, recorded rather than hidden

On this Linux machine, Chrome 158 exposed the API and reported `"downloadable"`, the hardware check
passed, and the weights still **never downloaded**:

- `LanguageModel.create()` hung with no resolution;
- no `downloadprogress` events fired;
- no `OptGuideOnDeviceModel` directory appeared in the profile;
- even with `--enable-features=OptimizationGuideOnDeviceModel` and a **trusted** mouse gesture dispatched
  over CDP (`navigator.userActivation.isActive === true` at click time).

Therefore the on-device demo is recorded on Windows/macOS Chrome. See
[browser-support.md](browser-support.md).

---

## Not verified yet — and why

| Claim | Status | Blocked on |
|---|---|---|
| A cloud request **succeeds**, returning `inferenceSource === "in_cloud"` | **VERIFIED** on the deployed site — badge `☁️ cloud 4992 ms`, one cloud decision in the ledger, and a real Gemini answer (`V = IR`) | — |
| Anonymous sign-in works against this project | **unverified** | Authentication is not initialised (`auth/configuration-not-found`); the console offers an Identity Platform upgrade path for it |
| Firestore writes/reads and the offline queue sync | **unverified** | Firestore database not created yet |
| Deployed Hosting URL serves the build with correct headers | **unverified** | `firebase deploy` needs an authenticated CLI |
| On-device inference returns real Gemini Nano output | **unverified** | Chrome on Windows/macOS with the weights installed |

These are the only remaining unknowns. Everything else in this file was executed on this machine.
