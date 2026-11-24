# Demo day runbook

The product is verified; this file is about not losing points to the environment. Every step
below is something that has actually bitten this project during development.

---

## The day before

1. **Use a Chrome that can run Gemini Nano.** Chrome 138+ on Windows or macOS with enough
   disk for the model. `chrome://on-device-internals` should be present.
2. **Download the weights once, with a real click.** Open the app, go to **Ask**, and press
   **Enable offline mode** in the *On-device model* tile. It is a user-gesture-gated
   download of roughly 4 GB — do not try to trigger it from a script, and do not start it
   10 minutes before recording.
3. **Confirm it took**, in the browser console on the app:

   ```js
   typeof LanguageModel                  // "function"
   await LanguageModel.availability()    // "available"
   ```

   If that says `downloadable`, the weights are not installed and the demo will show the
   cloud badge instead of ⚡. That is the one claim you cannot fake, so verify it here.
4. **Run Settings → Run self-check.** Everything should read `pass` except the on-device
   row, which reads `pass` once the weights are installed.
5. **Run Settings → Test one answer.** This spends a little quota and is the only real
   proof that inference works right now. If it reports `QUOTA_EXCEEDED`, fix that before
   demo day, not during it (see below).

---

## 30 minutes before

1. **Hard-refresh the tab** (`Ctrl+Shift+R`) or open a fresh window. The service worker
   registers in *prompt* mode: an old tab keeps the previous build until you accept the
   **Reload** banner. Filming a stale build is confusing for everyone.
2. **Check the quota**, with Settings → **Test one answer**.
   - `pass` → you are clear.
   - `QUOTA_EXCEEDED` → the free tier is metered per minute *and* per model. Wait for the
     window to reset (a minute clears short bursts; a daily cap needs longer), or enable
     billing on `hackthon-dcdf7`. No code change fixes this.
   - `MODEL_OVERLOADED` / `500 high demand` → transient. Try again in a few minutes.
3. **Turn off notifications**, close other tabs that share the profile, plug in power.
4. Have the **ledger export** already saved once, so you know where the file lands.

---

## The recording, in order

Full shot list and read-aloud narration: [docs/recording.md](recording.md). Short version:

| Step | What it proves |
|---|---|
| Ask a light English question | ⚡ on-device, with latency — the answer never left the machine |
| Turn the network off, ask again | still answers; the app *says* it is offline instead of pretending |
| Ask in Nepali (Devanagari) | ☁️ cloud, reason `unsupported language` — the router is honest about a limit rather than failing |
| Paste long notes, summarise | over the threshold → cloud, deliberately |
| Settings → Transparency | predicted vs actual per row; **Export routing log (JSON)** |
| Remote Config: change `heavyThresholdChars`, reload | routing changes with no deploy (`policy: remote`) |
| Quiz → Flashcards, then the exam | flashcards stay local when the model is installed; the exam goes to the cloud |
| `src/ai/engine.ts` on screen | one `getGenerativeModel` call, both paths, `inferenceSource` read back |

---

## If something goes wrong on camera

Say what happened and keep going — the project's whole argument is that it reports the
truth about where an answer ran. A visible, explained failure is on-message; a hidden one
would contradict it.

| Symptom | Cause | What to do / say |
|---|---|---|
| Badge says `cloud · model not downloaded` | weights absent or still downloading | "the on-device model isn't installed on this machine, so the router sends it to the cloud and says so" — then show the Quiz/Transparency beats instead |
| `QUOTA_EXCEEDED` toast | free tier exhausted | the app retries once automatically, then offers **Try again**; say so, and cut to Transparency and the code |
| A **Reload** banner appears | a deploy happened while the tab was open | click Reload, mention it is the service worker doing its job |
| Answer takes ~50 s | free-tier queuing under load | the counter shows elapsed seconds; this is why the wait is visible |
| `policy: default` instead of `remote` | Remote Config fetch failed | import from the console or just note the built-in fallback is in use |
| Nothing renders on reload, offline | service worker not yet installed on that profile | load online once, then cut the network |

---

## After recording

1. Export the routing log from Transparency and keep the JSON with the video.
2. Fill the Devpost submission from [SUBMISSION.md](../SUBMISSION.md); the hosted URL, repo
   URL, platform (Web / Chrome), and thumbnail are all prepared.
3. Upload the video and paste its URL into `SUBMISSION.md` before submitting.

---

## What not to claim

Do not say the app is "fully on-device" or "works without the cloud" without the weights
installed — the badge on screen would contradict you in the same shot. The honest claim is
stronger: **light work runs on the device, heavy work uses the cloud, and every answer says
which one happened.**
