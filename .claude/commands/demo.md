---
description: Rehearse the client demo on staging with video, then write client-ready demo notes
---

Prepare the client demo for what is on staging now:

1. Read the "Demo script" at the end of the current phase file in `docs/phases/<phase>.md` and the last few SESSION_LOG.md entries.
2. Re-seed staging with the demo data the script needs (idempotent seed) and confirm the latest green `main` is deployed.
3. **Dry run:** record the **existing** journey specs that cover the demo script against staging on `iphone14` and `desktop1440` with video on (no new demo spec unless a step has no journey yet). Save outputs to `.artifacts/demo/<phase>/`. Review key frames: anything broken, slow, misaligned or confusing gets fixed (then redeploy and re-run) before continuing. A full scripted rehearsal of every step is only for P2, P3 and P5; P0, P1 and P4 use the recordings plus a screenshot walkthrough.
4. Write a new entry at the top of `progress/DEMO_NOTES.md` using its template: plain English for a non-technical client, a 5-minute click-through script, what's new, known limitations and what comes next. No jargon, no file paths. Mention where the rehearsal videos are for the developer (not for the client).
5. Add the real-device checklist for the human (Android, iPhone Safari, iPhone installed app, desktop) as a 🟠 HUMAN_TASKS item for this demo.
6. Commit, push, and reply with the demo entry text ready to copy into a message to the client.
