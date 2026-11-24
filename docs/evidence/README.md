# Evidence captured while recording

Drop here, straight from the recorded build:

- `routing-log-<date>.json` — Settings → *Export routing log (JSON)*. One row per decision:
  the mode the policy requested, the source the SDK reported, latency, and whether they agreed.
- `screenshots/` — the Transparency panel, one ⚡ on-device answer, one ☁️ cloud answer.

These are the artefacts that let a reviewer check the video against recorded data instead of taking the
README's word for it. See [../recording.md](../recording.md) §6.
