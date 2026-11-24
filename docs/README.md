# Documentation index

9 documents besides this index, and you probably need one of them. This page says which.

If you are **judging this submission**, read in this order and stop when you are convinced:

| # | Read | It answers |
|---|---|---|
| 1 | [../README.md](../README.md) | what this is, and the sixty-second path to checking it |
| 2 | [proof.md](proof.md) | every claim → the cheapest way to check it → what was actually observed. **One page** |
| 3 | [verification.md](verification.md) | the long record: what was measured, how, and what was *not* |

If you are **running or recording it**:

| Read | It answers |
|---|---|
| [recording.md](recording.md) | how to record the demo on a machine with Gemini Nano, including what to do if the cloud path cannot answer |
| [demo-day.md](demo-day.md) | the day-of runbook: pre-flight, shot order, failure playbook, and the wording to avoid |
| [browser-support.md](browser-support.md) | what happens in Chrome with and without the weights, in Chromium, in Firefox, and under refused storage |

If you are **submitting it**:

| Read | It answers |
|---|---|
| [../SUBMISSION.md](../SUBMISSION.md) | the submission prose, field by field |
| [devpost-fields.md](devpost-fields.md) | the literal text to paste, with a pre-submit checklist |

If you want to **understand the design**:

| Read | It answers |
|---|---|
| [architecture.md](architecture.md) | how the routing decision, the SDK call, and the evidence trail fit together |
| [proof.md](proof.md) → "What is not claimed" | the limits, stated plainly, so you don't have to discover them |

Evidence lives in [screenshots/](screenshots/) and [evidence/](evidence/) (a real exported routing
ledger). Nothing in this repository is a mock: if a screenshot shows a badge, that badge came from
the Firebase AI Logic SDK's own report of where the answer ran.

---

## The one-line version

Two paths, one SDK, and **every answer states which path actually ran** — including the answers that
failed. That claim is the reason the documentation is this long: a claim like that is worth nothing
unless it is checked, and the checking is what these files record.
