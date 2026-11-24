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

All three lines must read `PASS` (or `MANUAL` resolved by step 2). If `AI Logic` still says `403`, the
cloud half of the video cannot be recorded honestly — see §9 instead of faking it.

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

## 9. If the cloud path cannot be enabled in time

Do **not** record a cloud answer that did not happen. Two honest options:

**Option A — on-device only (still a strong single-platform entry).** Record shots 1–5 and 10. Say plainly:
"the cloud path is implemented through the same SDK; this build has AI Logic enablement pending, so I am
showing the on-device half, which is the half that matters for the privacy and offline claim." Then show
the Transparency panel with `cloud (fallback)` rows if any exist, and the code.

**Option B — record the cloud half against a project that is enabled** (a teammate's, or a fresh project
where you complete the AI Logic enablement first). Then both halves are real, on two projects.

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
