# Proof index

Every claim this project makes, the cheapest way to check it, and what was actually observed. The
long chronological record — including what was measured and what was *not* — is
[verification.md](verification.md). This page is the short version for someone deciding whether to
believe the demo.

Nothing here is aspirational. If a row says "verified", it was run against the deployed build at
https://hackthon-dcdf7.web.app.

---

## The central claim: answers report where they ran

| Claim | How to check it | Observed |
|---|---|---|
| The badge shows the source the **SDK** reported, not what the app intended | ask anything, read the badge | `☁️ cloud 4992 ms` — and `response.inferenceSource` is what fills it (`src/ai/engine.ts`) |
| Prediction and reality are stored separately, and disagreement is surfaced | ask, then open Settings → Transparency | one row per decision with `predicted → actual`, latency, model, and a "prediction missed" chip when they differ |
| Failures are recorded, not hidden | ask while the free tier is rate-limited | ledger reads `1 decision, 1 failed attempt`; row shows `no answer · QUOTA_EXCEEDED · the attempt failed; nothing was produced` |
| The ledger is a real file, not a mock | Settings → Export routing log (JSON) | a real export is committed at [evidence/](evidence/); a live one was 883 bytes containing `"failed": 1` |

## The routing decision

| Claim | How to check it | Observed |
|---|---|---|
| The router is a pure function, executed by tests | `npm test` | 194 tests, no credentials, no network, no browser |
| It reads its policy from Remote Config, with a built-in fallback | Settings → Routing policy card | `source: remote` after a publish; `source: default` when the fetch fails, with the reason listed |
| Changing policy needs no deploy | edit `routing_policy` in the console, reload | threshold 800 → 60 took effect on reload: `source: remote`, parsed value 60 ([screenshot](screenshots/policy-remote.png)) |
| The reason a prompt routes the way it does is shown *before* sending | type in the composer and watch the route preview | "The on-device model is not downloaded yet, so this runs in the cloud…" — no request made |
| Devanagari goes to the cloud deliberately, and says so | type Nepali, read the preview | with weights installed: *this language is cloud-only*. The first screen also explains this **in Nepali**, before you ask |

## Firebase wiring

| Claim | How to check it | Observed |
|---|---|---|
| App Check attests every cloud request | Settings → Run self-check | `pass · App Check · attestation token acquired` |
| Firestore rules are owner-only | `FIREBASE_API_KEY=… npm run rules:check` | own document read/write/delete **200**; another user's read/write **403**; unauthenticated **403** |
| Messages cannot be rewritten after the fact | same script | append **200**, edit **403**, delete **403** |
| Chats and messages persist and come back | ask, then History | chat listed with **2 messages** and the routing badge intact |
| Deleting really deletes | delete a chat, reload | gone, and still gone after a reload |
| Anonymous auth gives a real uid without sign-up | self-check | `pass · Anonymous auth · uid …` |
| It runs in a different engine, not just Chromium | open it in Firefox | verified on Firefox 159: identical layout, `no Prompt API` chip, and the self-check passes everything including App Check attestation and Firestore |
| The app degrades when Firebase is unconfigured | provide no `.env.local` | the Setup screen names which variables are missing and shows a ready-to-paste `.env.local` block with console steps, instead of a broken or blank app |

## Offline and the shell

| Claim | How to check it | Observed |
|---|---|---|
| It starts with no network | load once, then cut the network and reload | full UI with the `offline` banner ([measured](verification.md)) |
| The offline payload is small | `npm run build` | 10 precache entries, **1054 KiB**, each file listed once; nothing unnecessary is precached — the 403 kB link-preview image is excluded deliberately |
| First load on a bad connection is honest about waiting | throttle to Slow 3G | 262 kB transferred, skeleton at **0.74 s**, interactive at **6.4 s**, repeat visit **0.34 s** from the service worker |
| A shell that never loads says so | block the bundle | "The app did not start. Check your connection and reload this page." |
| A render crash is not a white screen | covered by 4 tests | actionable fallback with recovery, error logged not swallowed |

## Accessibility

| Claim | How to check it | Observed |
|---|---|---|
| Contrast passes WCAG AA | measured on the deployed page | answer body **15.33:1**, muted text **6.49:1** at 11 px |
| Keyboard focus is visible everywhere | tab through | six stops, a visible ring on each; `:focus-visible` styles |
| Section changes are announced | click through sections | title becomes `Quiz — Sahayogi…`, focus moves to that section's `h1` |
| Every page is structurally sound at two widths | `npm run a11y` | all 8 page × width combinations clean; reduced motion verified too |

## Security and delivery

| Claim | How to check it | Observed |
|---|---|---|
| A Content-Security-Policy is enforced without breaking the app | `curl -D -` the deployed page | header present; **0 violations**, and inference, the service worker and offline start all still work |
| No secrets are in the repository or its history | scan before publishing | zero hits for API keys, tokens, debug tokens, site keys; `dist/`, `.env.local`, `node_modules` untracked |
| Assets are served compressed and immutable | `curl -D -` a hashed asset | `content-encoding: br`, 262 kB, `max-age=31536000, immutable`; the app shell is `no-cache` |

## What is *not* claimed

- **The on-device demo on Linux.** It was not recorded here and cannot be: Linux Chrome reports
  `availability() === "downloading"` while no bytes arrive. The device card detects that stall in
  about a minute instead of waiting forever.
- **On-device Nepali.** The model does not read Devanagari; the router says so and uses the cloud.
- **That the cloud path is faster.** It is more capable, and the app never implies otherwise.
- **That a cloud answer is currently guaranteed.** The free tier can be exhausted — during this
  build it was, repeatedly. `npm run smoke -- --inference` reports that state plainly, and the
  ledger records the failed attempt rather than showing nothing.

---

Generated from measurements, not intentions. If a row here is wrong, it is a bug in the
documentation and worth as much attention as a bug in the code.
