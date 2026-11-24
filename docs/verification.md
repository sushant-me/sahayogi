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
| The route preview is accurate about *why*, and the docs say when | typed three prompts into the composer on the deployed build without sending (a preview makes no request) and read the reason | without the weights, **all three** — short English, Nepali, long notes — report *"The on-device model is not downloaded yet, so this runs in the cloud"*, because `device-not-ready` is evaluated before the language and length rules. That is correct behaviour, but it means the documented no-quota demo path only differentiates its reasons **with the weights installed**; docs/demo-day.md now states that precondition instead of implying the reasons always appear |
| "New chat" drops a retry armed for the old conversation | `tests/AskPage.test.tsx`: a question is rate-limited and arms a retry, then New chat is pressed | **confirmed as a real defect first** (test fails with the cancellation removed): the retry fired into the emptied conversation and answered a question nobody was looking at. The test also pins the promise the UI makes — *"the question is kept"* — by asserting the question text is on screen while waiting, and gone only because New chat deliberately clears it |
| A stale retry cannot replace what the user asked for instead | `tests/QuizPage.test.tsx`: flashcards is rate-limited and arms a retry, the user then asks for an exam | **confirmed as a real defect first**: with the cancellation removed the test fails — the armed retry fired later and ran flashcards again, replacing the exam the user had actually requested. With it restored the call count stays at two (the failed flashcards attempt and the exam). The Ask page already cancelled its retry on a fresh send; the quiz did not |
| Leaving a page mid-retry cancels it instead of spending a request | `tests/QuizPage.test.tsx`: arm a retry, unmount the page, advance two minutes | **confirmed as a real leak first**: with the cleanup removed the test fails (`runInference` called a second time after unmount); with it restored the call count stays at one. The Ask page already cleared its timer on cleanup — the quiz timer was added without it, so navigating away during a wait would have fired an inference with no UI attached, spending a scarce free-tier request on an answer nobody could see |
| A throttled generation is treated the same as a throttled question | typed study notes on the deployed Quiz page and pressed Flashcards while the tier was rate-limiting | the card reads **"rate-limiting requests — retrying automatically (attempt 2 of 3)"** with a Cancel button, and the notes stay in the box. Before this round the quiz had **no automatic retry at all** and no ledger entry for a failed generation, so the same free-tier problem produced a dead end on one page and a recoverable wait on the other. Both pages now share one budget (`src/ai/retry.ts`) and both record failed attempts |
| A throttled request is retried enough to actually land | sent one question from the deployed app while the tier was rate-limiting, and watched the whole sequence | the banner counted **"attempt 2 of 3"** at 12 s and **"attempt 3 of 3"** at 52 s, with Cancel available throughout; the **third attempt answered in 16,380 ms** (`actual: in_cloud`, `agreed: true`, model `gemini-3.6-flash`). The first two attempts were rate-limited. The single-retry design this replaced would have abandoned that question, which is exactly the take a recording would have thrown away. The ledger still holds **one row** for the prompt, not three |
| The cloud model chain answers again, but only intermittently | one question sent from the deployed app, then two `npm run smoke -- --inference` probes 75 s apart | the question **was answered by `gemini-3.6-flash` in 19,989 ms** (ledger row: `actual: in_cloud, agreed: true, model: gemini-3.6-flash`). Both later probes returned `QUOTA_EXCEEDED`. So the free tier is not exhausted permanently — it is slotting in occasional requests, and when it does, the answer takes around twenty seconds instead of the ~5 measured earlier. Anyone recording must budget for that rather than concluding the take failed |
| One prompt produces one ledger row, even when it is retried | `tests/AskPage.test.tsx` with fake timers: a capacity failure that retries once and fails again | **two attempts were made, one decision recorded.** The retry path returns before logging, so a prompt that is about to be retried is not yet an outcome — otherwise a single question during a rate-limit spike would appear as two decisions and inflate the counts a judge reads off the Transparency panel |
| A failed attempt appears in the ledger, not as silence | rehearsed the demo beats on the deployed build while the free tier was exhausted | before: the Transparency panel read **"0 decisions"** and the export button was disabled, so a failed demo left no evidence that anything had been tried. Now the panel shows **1 decision, 1 failed attempt**, a row `prefer device → no answer · QUOTA_EXCEEDED · the attempt failed; nothing was produced`, and the export produces a real file whose summary contains `"failed": 1`. A failed attempt is a routing decision, and hiding it was the wrong kind of tidy. Captured at `docs/screenshots/ledger-failure.png` |
| A Nepali-speaking user is told what will happen *before* asking | loaded the deployed app and inspected the first screen | a bilingual note on the empty state, with the Devanagari paragraph carrying `lang="ne"` so assistive tech switches voice: "नेपालीमा सोध्न सकिन्छ — देवनागरी प्रश्न क्लाउडमा जान्छ…" plus an English gloss. The routing already handled Devanagari, but the *reason* only appeared after asking; now it is information rather than a surprise. Captured at `docs/screenshots/nepali-first-screen.png` |
| It works in a genuinely different engine, not just Chromium | Playwright's Firefox 159 (Gecko) against the deployed build — kept outside the repo so no dependency was added | app renders with identical layout and the correct `no Prompt API` chip; the in-app self-check reports **config, network, anonymous auth, App Check attestation, Firestore round-trip and Remote Config all pass**, device row warns as designed, and there are **zero console errors**. This is the fourth browser the app has been driven in (Chrome, Chromium, Brave, Firefox) and the first from a different engine family. Captured at `docs/screenshots/firefox.png` |
| Missing browser capabilities degrade instead of breaking | overrode `navigator.serviceWorker` (absent) and then `window.indexedDB` (absent) before first paint, on fresh profiles | **service workers absent**: app renders, composer works, all four sections present, **zero errors**. **IndexedDB absent**: app renders and the in-app self-check reports config/auth/App Check/**Firestore write → read → delete round-trip ok**; only Remote Config drops to a warn, because Firebase's Remote Config caches through IndexedDB and the app is deliberately built to fall back to its built-in policy. Zero uncaught errors in both cases |
| Reduced motion is respected, including by JavaScript | CDP `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`, now part of `npm run a11y` | reported `motion=0.00002` (effectively zero) — the CSS rule was already there, but the chat's `scrollIntoView({ behavior: "smooth" })` is an explicit argument that **overrides CSS**, so it animated regardless. It now reads the preference and passes `"auto"`; a test asserts the call argument under emulated reduced motion. The audit also gained a one-retry rule for slow renders, because a single missed paint is a timing artefact, not a defect — verified stable across two consecutive runs |
| The app still runs when a browser refuses storage | overrode `window.localStorage` with a throwing getter before first paint, then loaded and used the deployed app | **before the fix the page did not render at all** — a `SecurityError` at startup. After routing every access through `src/lib/storage.ts`: the app renders, the composer accepts typing (27 chars kept in the field), and History opens. Firebase still emits its own `SecurityError` diagnostics from its internal persistence probes (no app frames) and falls back to memory; our code no longer touches the global unguarded, pinned by 5 tests including a browser that throws on property access |
| A bundle that never loads says so, instead of lying | blocked the app's hashed bundle (`*/assets/index-*.js`) on a fresh profile and read the skeleton | at 5 s it reads "Loading…"; at 17 s it reads **"The app did not start. Check your connection and reload this page."** — the boot guard fired while React never mounted (`__sahayogiMounted` undefined) |
| The boot guard is allowed by our own CSP | console `Log.entryAdded` on a normal load, and after blocking the bundle | the guard was first written inline and **our own Content-Security-Policy refused it**: `Executing inline script violates … 'script-src self …'`. Zero violations had been observed earlier only because the app had no inline scripts at the time. Moved to `/boot-guard.js` (same-origin, CSP-clean): normal load now logs **0 violations** and the guard still works in the failure case |
| The error boundary is tested, not just written | `tests/ErrorBoundary.test.tsx` (4 tests) | children render untouched; a throwing child yields the actionable fallback with the message and the "saved chats are on disk" reassurance; "Try rendering again" recovers without a reload once the cause is gone; and the error is not swallowed silently (`console.error` called). It is mounted in `main.tsx` *outside* `AppProvider`, so provider failures are caught too |
| A download that never produces data is detected, not hidden | clicked "Enable offline mode" on the deployed app in Linux Chrome and watched state, storage and the DOM | **before the fix**: stuck at "Preparing… / Waiting for Chrome to start the download…" with the button disabled, indefinitely. Chrome reported `availability() === "downloading"` while `navigator.storage.estimate()` stayed at **1 MB** and no progress event fired. **After the fix**: the card reports after ~60 s — "Chrome accepted the request but no data arrived. This browser build reports a download without producing one" — and the button is usable again. The watchdog keys on **bytes**, not on the status string, because the status string lies on this platform |
| The precache manifest holds each file exactly once | sorted `url:` entries in the generated `sw.js` and counted duplicates | `favicon.svg` and all three icons appeared **twice** — `globPatterns` matched them and vite-plugin-pwa added the manifest icons again. Output went from 13 entries / 1234 KiB to **9 entries / 1051 KiB**. After deploying: SW active, 9 cached assets, 3 icons cached, and an offline reload still rendered with the offline banner |
| The preview image is not forced on every visitor | inspected the generated `sw.js` and the precache count after adding Open Graph tags | the 403 kB `og-image.png` was being **precached** — 1628 KiB of offline payload instead of 1234. It exists for chat-app link previews, not for the app to run, so it is now excluded from the service-worker glob: 13 entries, 1234 KiB, and still served `200` to crawlers |
| The deployment is checked on a schedule, on CI hardware | `.github/workflows/live.yml` triggered with `gh workflow run`, watched to completion | **job `live` succeeded in 1m36s** on an `ubuntu-latest` runner: checkout, `npm ci`, the smoke test and the accessibility audit, using the runner's own `/usr/bin/google-chrome`. This proves the scripts work outside my machine (headless flags, sandboxing) and that the hosted app was healthy at that moment. Not wired to `push` on purpose — a deployment check that fails because a Google API had a bad minute should not block honest work |
| The live app can be smoke-tested before a recording | `npm run smoke` and `npm run smoke -- --inference` against the deployed URL | shell, all four sections, and the in-app self-check pass (6/6); the `--inference` probe correctly distinguishes an environment failure from an app failure — when the free tier was exhausted it printed `WARN one real answer · quota exhausted (environment, not the app)` and still exited 0, so the script is safe to trust in both directions |
| It behaves like a slow-connection app should | CDP throttling to Slow 3G (400 kbit/s, 400 ms RTT), fresh profile so nothing is cached | cold: **262 kB transferred**, first paint 1.56 s, static skeleton visible at **741 ms**, React mounted at **6.45 s**. Repeat visit with the service worker active: mounted at **343 ms** from precache. So the first load is a one-time few seconds, and the app looked *broken* for that whole window before the skeleton existed — now it shows the brand and the premise instead of a blank page (`docs/screenshots/slow-network-skeleton.png`) |
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
| A shared link previews correctly | fetched the deployed HTML and the preview image | exactly **one** `og:title`, an absolute `og:url`, and `og:image` pointing at `https://hackthon-dcdf7.web.app/og-image.png` (1200×800, served `200 image/png`, 403 kB). Before this there were two conflicting `og:title`s and a *relative* image path — the original block pointed at `/icons/icon-512.png`, which most scrapers reject because they need an absolute URL |
| Changing section announces itself | clicked through the sections on the deployed app and read `document.title` and `document.activeElement` | title changes to **`Quiz — Sahayogi hybrid study assistant`** (and History, Settings), and focus moves to the page's `h1` each time, so a screen-reader or keyboard user is told the view changed instead of being left on the nav button. The first load sets the title without stealing focus. `npm run a11y` now asserts the per-section title as well |
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
