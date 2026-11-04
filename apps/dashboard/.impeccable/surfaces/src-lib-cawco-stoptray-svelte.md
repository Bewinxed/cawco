---
version: 1
slug: "src-lib-cawco-stoptray-svelte"
primary_target: "src/lib/cawco/StopTray.svelte"
related_targets: ["src/lib/cawco/ForgetProjectTray.svelte","src/lib/cawco/stop-work.svelte.ts"]
---

# Stopping running work: forgetting a project, turning Caw off

The owner's picks for the flows that stop running work (`StopTray.svelte`, `stop-work.svelte.ts`, `ForgetProjectTray.svelte`), each sized to the decision (The Stay In Context Rule).

- Forgetting a project with sessions running unfolds a tray under what asked, names each running session, arms when stopping them would cut a turn short, shows each stop as its machine confirms it, and forgets the project only after that.
- Turning Caw off weighs what he started: with nothing running the switch just flips; with only his own turn in flight, one line under the switch asks whether it finishes or stops; with sessions he started still running, it is the same tray under the switch, with one more way out, "Let them finish".
- Moving a session to another account says so on that session's own row, and moves it when its turn ends.
