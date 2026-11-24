# Browser support — measured, not assumed

The app detects capability at runtime with `typeof LanguageModel === "function"` and reports what it
finds. It never assumes a browser can run Gemini Nano, and it never hides the result: the header chip
and the per-answer badge both state the truth.

| Browser | On-device (`LanguageModel`) | Behaviour in Sahayogi | How this was established |
|---|---|---|---|
| **Google Chrome 138+ with the Nano weights installed** | Defined; `availability() === "available"` | Light prompts run on-device; heavy ones prefer the cloud | Verified on Chrome 158.0.8127.88 (API present, `downloadable`, hardware check passed) |
| **Google Chrome, weights not downloaded** | Defined; `availability() === "downloadable"` | "Enable offline mode" offers the download; until then everything routes to the cloud and says why | Verified on Chrome 158.0.8127.88 |
| **Brave 158.1.100.58** | **Not defined** | Cloud only. Header chip reads `no Prompt API`; the router records `device-unavailable` | Verified: `typeof LanguageModel` is `"undefined"` in Brave's renderer |
| **Arch Chromium 155** | Not defined in headless; branded builds cannot fetch the weights | Cloud only | Verified: API absent, and the weights never download even with the optimization-guide feature forced |
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
