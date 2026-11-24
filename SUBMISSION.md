# Devpost submission pack — #BuildHybridAI 2026

Everything below is written to be pasted straight into the Devpost form. Fill the three `<<...>>`
placeholders once the URL/video/repo exist. Everything else is final.

---

## At a glance

| Field | Value |
|---|---|
| **Project name** | Sahayogi |
| **Tagline** | A study assistant that tells you where every answer ran — Gemini Nano on-device, cloud when it must. |
| **Platform selected** | Web (Chrome) |
| **Hosted URL** | `<<HOSTING_URL>>` |
| **Repo** | `<<GITHUB_URL>>` (public, Apache-2.0 visible in About) |
| **Video** | `<<YOUTUBE_URL>>` (public, ≤ 3 min, English) |

---

## Inspiration

Every study tool assumes good internet. The students who need help most often have the opposite:
metered data, a shared laptop, and a connection that drops. On-device AI solves exactly that part of
the problem — free, instant, private, works in airplane mode — but the local model is small, is not on
every device, and does not read every language.

The interesting design question is not "can we call a model". It is: **which model, decided how, and
how would the user know?**

So the app is built around a routing decision that is visible, recorded and testable.

## What it does

- **Ask** — a question gets an answer, and every answer carries a badge: `⚡ on-device` or `☁️ cloud`.
  Short English questions stay on the machine. Long notes and heavy tasks go to the cloud. A live
  **route preview** shows the decision while you type, before anything is sent.
- **Quiz** — paste lecture notes, get flashcards (light: on-device) or a ten-question practice exam
  (heavy: cloud).
- **History** — conversations are stored in Firestore's persistent local cache, so they read with no
  network, and answers written while offline are queued and sync later.
- **Settings → Transparency** — the ledger of every routing decision: the mode the policy requested,
  the source the Firebase AI Logic SDK reported afterwards, the latency, and whether the two agreed.
  Exportable as JSON.

The educational point is deliberate: a student in Nepal asking in Devanagari gets a cloud answer *with
the reason shown* ("this language is cloud-only"), rather than a mystery failure or a silent downgrade.

## How we built it

React 19 + TypeScript + Vite + Tailwind, deployed on Firebase Hosting. The routing policy is a pure
function (`src/ai/policy.ts`) with no Firebase, DOM or React imports, so the routing table is executed
by tests rather than described in prose — 102 unit tests run with no project credentials, including the orchestration layer with only the model factory mocked.

The hybrid layer uses the Firebase AI Logic **hybrid inference SDK** directly. One model object carries
both paths:

```ts
const ai = getAI(app, { backend: new GoogleAIBackend() });

const model = getGenerativeModel(ai, {
  mode: decision.inferenceMode,          // prefer_on_device | only_on_device | only_in_cloud | prefer_in_cloud
  onDeviceParams: { createOptions: {
    expectedInputs:  [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_INSTRUCTION }] }],
  }},
  inCloudParams: {
    model: policy.cloudModel,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  },
});

const { stream, response } = await model.generateContentStream(prompt);
const final = await response;
final.inferenceSource;   // "on_device" | "in_cloud" — reported by the SDK, not inferred by us
```

## How Firebase AI Logic hybrid inference is used

1. **Mode is chosen per request, by policy.** A pure function decides between
   `prefer_on_device`, `only_on_device`, `only_in_cloud` and `prefer_in_cloud` from: the user's explicit
   mode, remote config, device availability, detected script, task kind, prompt length and connectivity.
2. **Both paths are the same model object.** On-device options and cloud parameters are configured
   side by side, so the two paths cannot drift apart.
3. **The SDK owns fallback.** `prefer_on_device` falls back to cloud when the device cannot serve a
   request; `only_on_device` throws instead. So "auto" is a mode choice per request, not a `try/catch`
   we invented.
4. **The SDK reports the truth.** `response.inferenceSource` drives the badge and the ledger. The
   prediction is stored separately, so a fallback is visible as `cloud (fallback)` and flagged as
   "prediction missed" instead of being quietly re-labelled.
5. **The model download is user-initiated.** `initializeDeviceModel(onDownloadProgress)` is called only
   from an explicit "Enable offline mode" button, because Chrome requires transient user activation to
   start a download-triggering session.

## Firebase products used

| Product | Role |
|---|---|
| **AI Logic (hybrid inference)** | On-device Gemini Nano and cloud inference through one SDK |
| **App Check** (reCAPTCHA Enterprise) | Attests every cloud request; required by AI Logic |
| **Cloud Firestore** | Chats + messages, persistent local cache, offline write queue, owner-only rules |
| **Authentication** (anonymous) | Real uid for rules without sign-up friction |
| **Remote Config** | `routing_policy`: length threshold, cloud model, on-device language list, kill switch |
| **Hosting** | Deployment, SPA rewrites, cache headers for the service worker |

## Challenges we ran into

- **Linux Chrome will not fetch the Nano weights.** On Chrome 158.0.8127.88 the API was present and
  `availability()` returned `"downloadable"`, the hardware check passed — and the download still never
  started, with no `downloadprogress` events, even with the optimization-guide feature forced and a
  genuinely trusted user gesture. We documented the negative result and recorded the on-device demo on
  Windows/macOS Chrome.
- **`LanguageModel.params()` no longer exists** in that build, and the SDK's on-device surface accepts
  only `expectedInputs`, `expectedOutputs`, `initialPrompts`, `monitor` and `signal` — Chrome's
  `temperature`/`topK` are not forwarded, so on-device sampling is whatever Nano defaults to.
- **Nepali cannot run on-device.** The local model accepts `en, ja, es, de, fr`. Rather than let the
  device path throw mid-conversation, we detect the script up front and route Devanagari to the cloud —
  and show that as a reason, which turned a limitation into the clearest demo moment.
- **On-device structured output is not reliable.** Flashcards ask for JSON and are parsed leniently; if
  parsing fails the raw answer is shown instead of discarded.

## Accomplishments that we're proud of

- The routing decision is **evidence, not a claim**: prediction and actual source are stored side by
  side, and disagreement is surfaced.
- **Offline is real**, not decorative: a service worker precaches the shell (verified by reloading with
  the network cut at the protocol level) and Firestore queues writes made offline.
- The routing table is **tested** — 102 unit tests, no credentials required: every branch of the decision
  table, the download/offline refusals, error mapping, and the edge that a prompt exactly at the threshold
  stays on-device.
- A failure taxonomy where **every error code has a UI affordance**; there is no silent `catch`.
- The app **degrades honestly** in browsers without the Prompt API (verified: Brave 158.1.100.58 returns
  `typeof LanguageModel === "undefined"`) — it says cloud-only instead of pretending.

## What we learned

- Hybrid inference is mostly a **policy problem**, not an API problem. The SDK makes both paths easy;
  deciding *which* one, and proving afterwards which one actually ran, is the product.
- `inferenceSource` is the difference between a demo and a claim you can defend.
- Honest failure modes score better than hidden ones: a `☁️ cloud (why: no device model)` badge reads as
  engineering; a spinner that never resolves reads as a bug.

## What's next

- Route-level code splitting (Firebase is currently one ~300 kB gzipped chunk).
- Constrained on-device output via `responseConstraint` once it is reliable across Nano versions.
- Nepali on-device support: the policy already reads its language list from Remote Config, so enabling
  it is one array entry when Chrome adds the language.
- A sync-aware "data saved" estimate — count cloud calls avoided, in megabytes, per chat.

---

## Judging criteria → evidence map

| Criterion | Where to look |
|---|---|
| **Technological Implementation** | `src/ai/policy.ts` (pure, tested routing table) · `src/ai/models.ts` (one model, both paths) · `src/ai/engine.ts` (`inferenceSource` capture) · `tests/` (64 tests) · Settings → Transparency panel |
| **Design** | Four coherent screens, per-answer badges, live route preview, prediction styled differently from evidence (dashed vs solid), device preflight with download progress, skeletons/empty states, typed error toasts, dark-first consistent spacing |
| **Potential Impact** | On-device answers cost nothing and leave the device; heavy work still available; Devanagari handled explicitly; offline cold start; history readable with no network |
| **Quality of the Idea** | The router is the product. Prediction-vs-reality is recorded and shown, including when the prediction was wrong. Language capability is surfaced as a routing reason rather than hidden. |

---

## Video script (≤ 3:00, English)

| Time | Shot | On-screen proof |
|---|---|---|
| 0:00–0:15 | Hook: student, metered data, unreliable connection | — |
| 0:15–0:45 | Short English question → answer | `⚡ on-device` badge |
| 0:45–1:15 | Turn Wi-Fi **off**, ask again, still answers | badge stays `⚡ on-device` |
| 1:15–1:25 | Open **Transparency** | rows: predicted `prefer device` → actual `on_device` |
| 1:25–1:45 | Ask the same thing in **Nepali** | preview: `☁️ cloud · this language is cloud-only` |
| 1:45–2:05 | Paste notes, generate 10-question exam | `☁️ cloud` |
| 2:05–2:25 | Change `routing_policy` in Remote Config, reload | routing changes with no deploy |
| 2:25–2:40 | Write an answer offline, reconnect | History syncs, "written offline" chip |
| 2:40–3:00 | Architecture + value proposition | — |

Rule for the recording: **nothing mocked, nothing staged**. If a shot needs a retake, re-run it for real.

---

## Pre-submit checklist (from the official requirements)

- [ ] Repo **public**, **open-source license visible in the About panel** (Apache-2.0)
- [ ] `firebase/ai` **imported and called at runtime** — `src/firebase/ai.ts`, `src/ai/models.ts`
- [ ] **App Check** enabled; production domain registered (debug token acceptable, used only in dev)
- [ ] **Hosted URL** live and free to access
- [ ] **Video** ≤ 3 min, public on YouTube, English (or English subtitles), shows the app running
- [ ] Description covers **value proposition + how AI Logic is used + features**
- [ ] **Platform selected: Web (Chrome)** on the submission
- [ ] README explains setup, the routing table, and the exact Chrome build/flags used
- [ ] No secrets committed; `.env.example` only
- [ ] Tested in a fresh browser profile (no cached service worker, no stale localStorage)

## What this submission deliberately does **not** claim

- That the on-device demo ran on Linux. It did not; it ran on Windows/macOS Chrome, and the negative
  Linux result is documented in `docs/browser-support.md`.
- That on-device handles Nepali. It does not; the router says so and routes to the cloud.
- That the cloud path is faster. It is not; it is more capable, and the UI never implies otherwise.
