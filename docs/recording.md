# Recording runbook

The video is the highest-risk deliverable: it needs a second machine, a 4 GB download, a registration the
cloud path cannot skip, and one unbroken take of something that can fail live. This is the order that
wastes the least time.

---

## 0. Gate — do not press record until this is green

```bash
cd ~/life/sahayogi
npm run preflight
```

Everything must read `PASS` (`MANUAL` for the on-device model is resolved by step 1). Note what the
`AI Logic` line actually means now: *reachable, App Check enforced* — a raw probe cannot mint a reCAPTCHA
token, so a `PASS` there proves the service is up and protecting itself. The real proof of inference is
**Settings → Test one answer** in the app, which is the check to run before recording.

If preflight reports a failure you cannot explain, do not record around it — the honest move is §9
(explain the state) rather than filming a claim the screen contradicts. Pre-flight and a failure playbook
for the day itself are in [demo-day.md](demo-day.md).

---

## 1. The second machine (Windows or macOS)

1. Install **Google Chrome** (not Chromium, not Brave — Brave does not expose the Prompt API at all;
   see [browser-support.md](browser-support.md)).
2. `chrome://flags`:
   - **Prompt API for Gemini Nano** → Enabled
   - **Optimization Guide On Device Model** → *Enabled BypassPerfRequirement* (the hardware check is strict)
3. Restart Chrome. `chrome://components` → **Optimization Guide On Device Model** → *Check for update*.
4. Watch progress at `chrome://on-device-internals` until the model is downloaded (~4 GB).
5. Verify in DevTools on any page:

```js
typeof LanguageModel              // "function"
await LanguageModel.availability()// "available"
```

**Do this the day before recording, not that morning.** The download is the single most common way a
recording session dies. Then rehearse the airplane-mode shot **three times** before you record once.

---

## 2. App Check (required by AI Logic)

The app currently runs App Check in debug mode. Chrome will print a token on first load:

```
App Check debug token: 1a2b3c4d-....
```

1. Run the app once, copy that token.
2. Console → **App Check** → Apps → your web app → **Manage debug tokens** → Add → paste → Save.
3. Put the same value in `.env.local` as `VITE_APP_CHECK_DEBUG_TOKEN=…`, restart the dev server.
4. Re-run `npm run preflight`; the App Check line should read `PASS`, not `WARN`.

For the hosted URL, register the production domain under App Check (reCAPTCHA Enterprise) — a debug token
is a dev tool and must not be the only path on the deployed site.

---

## 3. Machine hygiene before the take

| Item | Why |
|---|---|
| Fresh Chrome profile | no stale service worker, no cached build |
| Window 1280×800, zoom 100% | readable at 1080p, no downscaling blur |
| Hide bookmarks bar (Ctrl+Shift+B) | less visual noise |
| Turn off system notifications / Slack | a popup mid-take ruins it |
| Close other tabs | the recording is judged on the product |
| Have the notes text ready in a file | pasting must be one keystroke, not typing |

---

## 4. Shot list (≤ 3:00 total)

| # | Time | You do | What must be on screen |
|---|---|---|---|
| 1 | 0:00–0:12 | Say the problem: notes, a phone, metered data | Ask page |
| 2 | 0:12–0:35 | Click **Light question** | answer appears, badge **⚡ on-device** |
| 3 | 0:35–0:50 | Turn **Wi-Fi off** at the OS level | header chip flips to `offline` |
| 4 | 0:50–1:10 | Reload the page, then ask again | page still loads (service worker), answer appears, ⚡ |
| 5 | 1:10–1:20 | Settings → **Transparency** | rows: `prefer device → on-device`, latency |
| 6 | 1:20–1:40 | Turn Wi-Fi back on. Click **नेपाली प्रश्न** | preview: `☁️ cloud · this language is cloud-only`, then a cloud answer |
| 7 | 1:40–2:00 | Quiz → paste notes → **10-question exam** | ☁️ cloud, exam with answer key |
| 8 | 2:00–2:20 | Console: change `routing_policy.heavyThresholdChars` to 60 → reload | the same light prompt now routes to the cloud — no deploy |
| 9 | 2:20–2:35 | Type an answer with Wi-Fi off, reconnect | History syncs, "written offline" chip |
| 10 | 2:35–2:55 | Say the value proposition over the architecture diagram | — |

Shot 5 is the one most submissions skip: it is the *proof* that shot 2 was really on-device. Do not cut it.

---

## 5. The airplane-mode shot, choreographed

1. Ask once **while online** so the model session is warm.
2. Turn Wi-Fi off in the OS (not DevTools — the UI's "offline" chip must come from the real event).
3. **Reload the page.** This is the part that proves offline cold start; without the reload it is just an
   open tab.
4. Ask the same question. It must answer with ⚡ and no network requests.

If it does not answer after a reload, the service worker did not install: load the page once more online,
wait for the SW to activate (`navigator.serviceWorker.ready`), then repeat.

---

## 6. Capture the evidence

After the take, before you clean up:

1. Settings → **Export routing log (JSON)** → save it to `docs/evidence/routing-log-<date>.json`.
2. Screenshot the Transparency panel → `docs/screenshots/transparency.png`.
3. Screenshot an on-device answer and a cloud answer → `docs/screenshots/`.
4. Reference both in the README. Judges can then check the video against recorded data.

---

## 7. Edit

- Hard cap **3:00**. Only the first three minutes are evaluated.
- English audio; if you narrate in Nepali, burn in English subtitles.
- 1080p, browser at 100% zoom, no letterboxing from a scaled window.
- Cut dead time, never cut the badge or the Transparency shot.
- No music louder than the voice.

---

## 8. Publish and submit

- YouTube: **public** (unlisted does not count), English title, description linking repo + hosted URL.
- Devpost: paste the fields from [SUBMISSION.md](../SUBMISSION.md); select platform **Web (Chrome)**.
- Repo must show the license in the About panel; `.env.local` must not be committed.
- Final check with a fresh browser profile: load the hosted URL, confirm App Check passes and one cloud
  answer completes.

---

## 9. If the cloud path cannot answer

Three distinct situations, and they need different words. Do **not** record a cloud answer that did not
happen.

**A. AI Logic is not enabled at all.** Record shots 1–5 and 10 and say plainly: "the cloud path is
implemented through the same SDK; this build has AI Logic enablement pending, so I am showing the
on-device half, which is the half that matters for the privacy and offline claim."

**B. Enabled, but the free tier is rate-limited** — the most likely case, and the *better* story. Nothing
is broken; the router works, the request reaches Google, and the quota refuses it. The app records that
refusal rather than hiding it. Record with this narration:

1. **Hook** — "Every study tool assumes good internet. This one assumes the opposite: a metered
   connection, a shared laptop, and a network that drops."

2. **Type, don't send** — "Watch the route preview. It has already decided this short English question
   belongs on the device — before anything is sent. The decision is made locally, and it can be
   inspected."

3. **Send it** — "The answer comes back badged on-device, with its latency. That text never left the
   machine — no request, no data, no cost. Read the number off the screen rather than predicting it."

4. **Airplane mode, ask again** — "Network off. Still answers. The header says offline, because a study
   tool that quietly needs a connection is useless on a bus."

5. **Type Nepali, don't send** — "Devanagari. The on-device model doesn't read it, and the app says so
   instead of failing: routed to the cloud, reason 'language is cloud-only'. That is a limitation being
   reported, not hidden."

6. **Settings → Transparency** — "Every prompt is a decision, and the ledger keeps the last forty. This row
   routed to the cloud and the free tier refused it — so it says 'no answer, quota exceeded'. That row
   is the whole point: when the system fails, you can see exactly what it tried, instead of wondering
   whether it did anything at all. Export it and you have the file."

7. **Settings → Run self-check** — "This proves the wiring without spending a single token: config,
   anonymous auth, App Check attestation, and a real Firestore write-read-delete round trip."

8. **Code** — "One `getGenerativeModel` call carries both paths. After the call we read back
   `inferenceSource` — that string is what fills the badge. The app never guesses where the answer came
   from."

9. **Close** — "Gemini Nano on the device, cloud when it must be, one SDK — and every answer, including
   the ones that failed, states where it ran."

That demonstrates the design *under the condition the design exists for*, and it is entirely true.

**C. Record the cloud half against an enabled project** (a teammate's, or a fresh project where you
complete the AI Logic enablement first). Then both halves are real, on two projects.

What is never acceptable: a mock, a paused screen, or a badge added in editing. A judge who checks the
repo will find the truth, and the honesty is itself part of the score.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Thinking…` forever | device model reported `downloadable` but never arrives (Linux) | already mitigated: 12 s race → cloud retry; on a real device, finish the model download |
| `PERMISSION_DENIED` toast | AI Logic not enabled for the project | console → AI Logic → Enable API |
| `APP_CHECK_FAILED` | token not registered, or domain not added | register the debug token / add the Hosting domain |
| Badge says `no Prompt API` | Chromium, Brave, Firefox, or Safari | use Google Chrome |
| `Nano not downloaded` chip | weights absent | `chrome://components` → Check for update |
| History says **local only** | sign-in unavailable | enable Anonymous (may require Identity Platform) or accept local-only |
| Nothing answers after reload offline | service worker never installed | load online once, wait for `navigator.serviceWorker.ready` |

## Narration (read these lines while recording)

Spoken text for the shots above. Roughly 95 seconds if you keep moving.

1. **Intro** — "Sahayogi is a study assistant that runs on your laptop. Gemini Nano, on-device.
   Cloud only when it has to be. Same SDK both ways — and every answer tells you which one ran."

2. **Light question** — "This is a short English question. Watch the badge: on-device, with the
   latency. That answer never left the machine."

3. **Airplane mode** — "Now the network is off. Same question. Still answers — and the app says
   offline, because a study tool that quietly needs a connection is useless on a bus."

4. **Nepali** — "Devanagari. The on-device model doesn't read it, and the app says so instead of
   pretending: cloud, with the reason 'unsupported language'. That decision is in the open."

5. **Long notes** — "Paste real notes and it summarises them. Over the threshold, so it goes to the
   cloud deliberately — and still reports the source and the model that answered."

6. **Transparency** — "Every prompt is a decision. Predicted mode, actual source, latency, and whether
   they agreed. Export it as JSON — that file is a real one, not a mock-up."

7. **Remote Config** — "Change the routing policy in the console. No deploy. Reload, and the new
   threshold is what the router uses."

8. **Quiz** — "Flashcards stay on the device. The exam goes to the cloud. Same router, same engine."

9. **Code** — "One function: getGenerativeModel, with on-device and in-cloud parameters. The SDK
   decides; we read back inferenceSource and show it. That's the whole hybrid story in one file."

10. **Close** — "Offline-capable, honest about where every answer ran, and running today at
    hackthon-dcdf7.web.app."
