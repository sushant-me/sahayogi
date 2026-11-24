# Verification log

Every claim in this repository that can be checked was checked, and the commands are recorded here so
anyone can repeat them. Claims that could **not** be verified yet are listed at the bottom, unedited.

Run the whole automated gate in one command:

```bash
npm run verify      # lint → types → 107 tests → production build
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

### The cloud request genuinely reaches Google — **verified**

Running the app against the real project (web app registered in `hackthon-dcdf7`, config in
`.env.local`) produced an actual server response rather than a client-side failure:

```
POST https://firebasevertexai.googleapis.com/v1beta/projects/hackthon-dcdf7/models/gemini-2.5-flash:streamGenerateContent?alt=sse
→ 403 ACCESS_DENIED  "Permission denied on the service."
```

What that proves: the web config is valid, the hybrid model object initialised, the SDK selected its
cloud path, requests are not blocked by App Check or CORS, and the failing layer is **Google-side API
enablement** — i.e. AI Logic has not been enabled for the project yet. The error is surfaced to the user
as `PERMISSION_DENIED` with that exact remedy, not as "check your connection".

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
| A cloud request **succeeds**, returning `inferenceSource === "in_cloud"` | **unverified** — request verified as sent and rejected at the service layer | AI Logic must be enabled for the project, which requires accepting the Gemini API Additional Terms of Service (a human consent step) |
| Anonymous sign-in works against this project | **unverified** | Authentication is not initialised (`auth/configuration-not-found`); the console offers an Identity Platform upgrade path for it |
| Firestore writes/reads and the offline queue sync | **unverified** | Firestore database not created yet |
| Deployed Hosting URL serves the build with correct headers | **unverified** | `firebase deploy` needs an authenticated CLI |
| On-device inference returns real Gemini Nano output | **unverified** | Chrome on Windows/macOS with the weights installed |

These are the only remaining unknowns. Everything else in this file was executed on this machine.
