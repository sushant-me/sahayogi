# Browser support — measured, not assumed

The app detects capability at runtime with `typeof LanguageModel === "function"` and reports what it
finds. It never assumes a browser can run Gemini Nano, and it never hides the result: the header chip
and the per-answer badge both state the truth.

| Browser | On-device (`LanguageModel`) | Behaviour in Sahayogi | How this was established |
|---|---|---|---|
| **Google Chrome 138+ with the Nano weights installed** | Defined; `availability() === "available"` | Light prompts run on-device; heavy ones prefer the cloud | Verified on Chrome 158.0.8127.88 (API present, `downloadable`, hardware check passed) |
| **Google Chrome, weights not downloaded** | Defined; `availability() === "downloadable"` | "Enable offline mode" offers the download; until then everything routes to the cloud and says why | Verified on Chrome 158.0.8127.88 |
| **Google Chrome on Linux, weights unreachable** | Defined, and it *lies*: after an accepted download request the state becomes `"downloading"` while `navigator.storage.estimate()` stays at ~1 MB — no bytes ever arrive | The card reports the stall after ~60 s of no progress ("reports a download without producing one") instead of hanging at "Preparing…". Cloud answers unaffected | Verified on Chrome 158.0.8127.88 on Arch Linux: `availability()` = `"downloading"`, storage 1 MB after minutes, no `downloadprogress` event |
| **Brave 158.1.100.58** | **Not defined** | Cloud only. Header chip reads `no Prompt API`; the router records `device-unavailable` | Verified: `typeof LanguageModel` is `"undefined"` in Brave's renderer |
| **Arch Chromium 155** | Not defined in headless; branded builds cannot fetch the weights | Cloud only | Verified: API absent, and the weights never download even with the optimization-guide feature forced |
| **Firefox 159 (Gecko)** | Not defined — `typeof LanguageModel === "undefined"` | Cloud only, and it says so: header chip `no Prompt API`, device card "This browser does not expose the Prompt API. Use a recent Chrome build to run inference on-device." | Verified on the deployed build: layout identical, **every self-check passes** — config, network, anonymous auth, **App Check attestation**, Firestore write → read → delete round-trip, Remote Config — with **zero console errors**. App Check's reCAPTCHA Enterprise path works in Gecko, which was worth confirming rather than assuming |
| **Firefox / Safari** | Not implemented | Cloud only, with the same explicit reason | Not tested here; the runtime probe is the authority, not this table |
| **Microsoft Edge / Opera** | Unverified | Whichever the probe reports | — |

## What this means for the product

The honest degradation path is the design, not an afterthought:

1. `typeof LanguageModel` is missing → `availability` becomes `unsupported` → the policy records
   `device-unavailable` → every answer is `☁️ cloud` with the reason attached.
2. The API exists but the weights are absent → the DevicePreflight card offers a one-click download,
   gated behind a user gesture because Chrome requires transient activation to start it.
3. The weights are ready → light prompts stay on the machine, and `inferenceSource === "on_device"` is
   the proof shown to the user.

## Why the demo is recorded in Chrome

Brave is the browser this project was explored in, but it does not implement the Prompt API, so a
"hybrid" demo there would silently be a cloud-only demo. Chrome is the only browser in the verified
list that can show the on-device half of the story.

## Reproducing the probe

Paste this into DevTools on any page:

```js
typeof LanguageModel                       // "function" or "undefined"
await LanguageModel.availability()          // "available" | "downloadable" | "downloading" | "unavailable"
```

A manifest of the on-device model can be inspected at `chrome://components`
("Optimization Guide On Device Model") and `chrome://on-device-internals`.

## Degradations that are verified, not assumed

Each of these was tested by removing the capability before first paint and then using the deployed app.

| Capability missing | What happens |
|---|---|
| `localStorage` refuses access (throwing getter) | App renders and is usable; drafts and the routing log simply do not persist. Before this was fixed the page did not render at all. |
| `navigator.serviceWorker` absent | App renders normally, all four sections work, no errors — only the offline capability is lost. |
| `indexedDB` absent | App renders; cloud Firestore writes still work (verified by the self-check's write → read → delete round-trip); Remote Config falls back to the built-in policy and says so. |
| Prompt API absent (e.g. Brave) | Cloud-only, stated in the header chip rather than guessed at. |
| Prompt API present but weights unreachable (Linux) | The device card reports the stalled download after ~60 s instead of waiting forever. |
