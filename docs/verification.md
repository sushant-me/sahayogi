# Verification log

Every claim in this repository that can be checked was checked, and the commands are recorded here so
anyone can repeat them. Claims that could **not** be verified yet are listed at the bottom, unedited.

Run the whole automated gate in one command:

```bash
npm run verify      # lint → types → 173 tests → production build
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
| Text contrast meets WCAG AA | computed colour vs effective background on the deployed page | answer body **15.33:1**, muted text **6.49:1** (at 11 px), link **16.15:1**, button label **14.37:1** — all pass 4.5:1 |
| Generated material survives a refresh | generated **8 flashcards** on the deployed site, then reloaded the page | all 8 cards came back, with the routing badge (`cloud 10516 ms`) and the pasted notes (`547` chars). Earlier in the same round every live generation was failing on quota, so the restore path was first verified by seeding a snapshot; once the quota recovered it was confirmed with a real generation |
| Clearing results is real | clicked `clear` on the restored cards, then reloaded | cards gone, snapshot removed, and after the reload still gone — while the pasted notes draft was kept, because clearing results should not wipe your input |
| A failed Quiz generation is recoverable too | pinned On-device (no weights) so the generation must fail, then clicked Flashcards on the deployed site | a persistent **Generation failed** card keeps the reason and the actionable hint with a **Try again** that reruns the same task — previously only a toast appeared, which vanished and left no way forward. Captured at `docs/screenshots/quiz-failure.png` |
| Quiz generation shows elapsed seconds | clicked "10-question exam" on the deployed site and sampled the hint line | `Writing the exam — 4s · the badge afterwards reports which path ran`, then the static hint returns when the run ends |
| The waiting counter does not spam a screen reader | inspected the live region and sampled the DOM during a forced ~12 s wait (On-device pinned, no weights) | the conversation log is `aria-relevant="additions"` so mutations are not announced, and the ticking suffix is inside `aria-hidden="true"` while the announced text stays a stable "Thinking…". Visible to the eye as "Thinking… 5s" — captured at `docs/screenshots/thinking-counter.png`. A unit test pins the hidden suffix |
| Keyboard focus is always visible | dispatched real Tab key events and read each focused element's computed style | six stops (Skip to content → Ask → Quiz → History → Settings → Auto), every one with a visible ring and outline |
| Every page has a heading and landmarks | DOM inspection | `h1` "Ask — Sahayogi hybrid study assistant"; `main`, labelled `nav`, `footer`, skip link and an `aria-live` conversation log all present |
| A Content-Security-Policy is set without breaking the app | shipped as `Content-Security-Policy-Report-Only`, exercised (load, App Check attestation, Firestore round-trip, Remote Config), then promoted to enforced and re-exercised | **zero violations** in both modes, and under enforcement: the inference probe reached the API, the service worker registered and precached, and an offline reload still rendered with the offline banner. The app previously had no CSP at all — HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` were already present |
| The rules are narrow, not just owner-scoped | `npm run rules:check` (12 cases) plus the app driven on the deployed site | outside: messages **append 200 / edit 403 / delete 403**, an unnamed subcollection `users/{uid}/private/…` **403**, the self-check probe path **200 for its owner, 403 for another user**. Inside the app under the same rules: a question produced `cloud 9148 ms`, History showed **2 messages**, deleting the chat emptied the list, and Settings → self-check reported **Firestore: write → read → delete round-trip ok**. Previously any path under `users/{uid}` was writable and messages could be rewritten, which would have let stored routing evidence be tampered with |
| Firestore rules really are owner-only | `npm run rules:check` — anonymous sign-ins for two separate users over the public REST API, then try each other's data (no admin credentials, no SDK) | **own document: write 200, read 200, delete 200**; **another user's document: read 403, write 403**; **unauthenticated read 403**. Six cases, all as claimed. The submission has been saying "owner-only rules" since round 1; this is the first time it was demonstrated rather than asserted |
| Delivery headers are the ones we set | `curl -D -` against the deployed site for the shell, a hashed asset, the service worker and the manifest | hashed JS is served **brotli-compressed at 262 kB** with `max-age=31536000, immutable`; `sw.js` and the manifest are `no-cache`. The shell was **not**: we set `no-cache` for `/index.html`, but visitors request `/`, which the rewrite serves and which fell back to Hosting's 1-hour default — so a first-time visitor could hold HTML pointing at asset hashes from a previous deploy. Header rules for `/` and `**/*.html` were added and verified: both now `no-cache` |
| Bundle size, and why it is not split | `npm run build` and a gzip measurement of the emitted chunk; then an experiment splitting Quiz/History/Settings behind `React.lazy` | **1019 kB minified / 303 kB gzipped** in a single chunk, 14 precache entries (1237 KiB) for offline start. The `>500 kB` warning is real, but splitting the routes returned only **~7 kB gzipped** (296 vs 303) because Firebase dominates the bundle, so the change was reverted rather than kept for the look of it. Measured, then decided — the number is what makes the decision defensible |
| Load performance on the deployed build | CDP against the live URL, 1440x940: navigation timing + layout-shift observer | TTFB **444 ms**, DOMContentLoaded **1.44 s**, load **1.45 s**, cumulative layout shift **0**, JS heap **16 MB** at rest. Largest Contentful Paint was not captured reliably, so it is not claimed. |
| Reported latency matches what the user waits | same run: sampled the DOM every 100 ms while a real answer streamed | first model text at **26.3 s**, answer complete at **26.5 s**, badge `cloud 26310 ms`, ledger row `26310 ms` — the badge is within ~200 ms of the wall clock, so it is not a flattering number |
| The self-check can also test one real answer | clicked "Test one answer (uses a little quota)" in Settings on the deployed site | **pass** — "answered via in_cloud in 10807 ms (gemini-3.6-flash)". The wiring checks deliberately spend no quota, so this optional probe is what distinguishes "configured" from "actually answering"; it is labelled so nobody triggers it by accident |
| A 404 no longer masks a capacity error | live failure this round ended with `404 gemini-3.8-pro … not supported for generateContent`, hiding that earlier models were rate-limited | the chain drops the non-existent id (in code and in the published Remote Config), and the engine now prefers a quota/overload error over a later "model not found". Re-tested live: the same situation now reports `429 You exceeded your current quota`. A unit test pins the preference |
| The in-app self-check passes on the deployed build | clicked Settings → Run self-check on the live site | **pass**: config (`project hackthon-dcdf7`), network, anonymous auth (`uid ax7mtNV0…`), App Check (`attestation token acquired`), Firestore (`write → read → delete round-trip ok`), Remote Config (`routing_policy fetched`); **warn** for the on-device model, because the weights are not installed here — the card says so instead of passing. Captured at `docs/screenshots/self-check.png` |
| The self-check's failure branches are pinned | `tests/selfCheck.test.ts` with config, App Check and Firestore mocked | ten cases: all-healthy, nothing-configured (skips + names the missing key), auth failure with its message, App Check rejection, write-but-nothing-read-back, raw Firestore permission error kept verbatim, defaults-only policy, unsupported device, and offline |
| A typed question survives a reload | typed into the composer on the deployed app, reloaded the page without sending | the composer still held the text. Quiz notes use the same draft mechanism, so pasted lecture notes are not lost either |
| A red suite cannot reach Hosting | `npm run deploy` runs `npm run verify` first | verified against the deployed build: a failing test now stops the deploy rather than publishing it (this was found the hard way — a piped `grep` had swallowed the exit code) |
| The device-availability mapping is pinned by tests | mocked Chrome's `LanguageModel` global (the same API the SDK reads) in `tests/deviceAvailability.test.ts` | `unsupported` with no global and with a global lacking `availability()`; `available`/`downloadable`/`downloading` passed through; unexpected verdict → `unavailable`; rejected probe → `unavailable`; a probe that never settles → `unavailable` via the timeout guard. This is the branch that cannot be exercised live here, so its logic is pinned instead of assumed |
| Every page is structurally sound, at two widths | `npm run a11y` (new: `scripts/a11y.mjs`, launches headless Chromium and drives the deployed app) | **all 8 page × width combinations clean**: exactly one `h1` per page, `<main>`, a labelled `nav`, every button and link named, no duplicate ids, every image with `alt`, `<html lang>` set, and **zero horizontal overflow** at 1440 px and 390 px. The only unlabelled control anywhere is `g-recaptcha-response`, injected by Google's reCAPTCHA script for App Check — not ours, and the script reports it as expected rather than as a pass |
| A cold visitor understands the badge | loaded the deployed app with no prior state and read the first screen | the empty state now explains that answers are badged with where they actually ran, with a legend (⚡ on this device · ☁️ in the cloud · + latency) and why "Long notes" is the interesting example. Captured at `docs/screenshots/first-run.png` |
| A rate-limited answer retries itself, once | unit tests with fake timers (`tests/AskPage.test.tsx`): first attempt throws `QUOTA_EXCEEDED`, second succeeds; and an always-failing case | the banner "Rate-limited by the free tier — retrying once automatically" appears, the question is preserved, and after ~20 s the request is re-sent **without user input**; a second failure is terminal for that question and offers **Try again** rather than looping. Verified by test, not live: reproducing a capacity failure on demand is not possible, and the failure branch is exactly what cannot be staged |
| A failed answer is recoverable in one click | pinned Mode to On-device with no model installed on the deployed site, then clicked the retry control | error turn shows the reason and an actionable hint with a **Try again** button; after retrying the conversation holds **one** question (it replaces the failed exchange rather than duplicating it) and a fresh attempt starts. Captured at `docs/screenshots/error-retry.png` |
| A slow answer does not look hung | sampled the placeholder at 3 s / 7 s / 11 s | `Thinking… 3s`, `Thinking… 7s`, `Thinking… 11s` — the counter ticks while the model works |
| Why the text appears in one burst | sampled the model bubble's length every 400 ms through a full answer | length went 12 → 281 chars in a single step at completion, with only three growth samples. The engine forwards every chunk as it arrives (`engine.ts:146-157`), so the batching is upstream on this path, not a render bug. The elapsed counter is what carries the wait, and the docs say so rather than implying live text |
| The layout holds on a phone | loaded the deployed app at 390×844 (DPR 2) | no horizontal overflow (`scrollWidth === clientWidth`), cards stack, nav wraps — `docs/screenshots/mobile.png` |
| The deployed build boots with no network | cut the network at protocol level after the service worker activated, then reloaded | **PASS** — full UI rendered, header `offline`, offline banner shown |
| Deleting a chat actually deletes it | asked a question, opened History (1 chat), selected it, clicked Delete, then reloaded the page | the row disappeared immediately **and stayed gone after a reload**, so the Firestore document was deleted rather than the list merely being re-rendered |
| A stale tab is told a new build exists | opened a tab on build A, deployed build B, then called `registration.update()` in the old tab | the banner "A newer version of Sahayogi is available — the current tab is still running the previous build" appeared within **2.5 s** with Reload and Later. Captured at `docs/screenshots/update-banner.png`. The service worker registers with `registerType: "prompt"` so the swap is explicit rather than silent |
| The footer reaches the evidence | inspected the deployed footer | Architecture, Verification log, Browser support and Source links, all pointing at the public repo |
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
