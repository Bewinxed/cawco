---
name: launch-plan
description: Plan a launch campaign as tasks, every piece (announcement, landing page, posts, emails, assets) with its launch time, its channel, its edges and its checks, scheduled through approved actions. Use when planning, scheduling or running a launch, a release announcement or a campaign.
---

# Launch plan

A launch is a set of **pieces**, each its own task that moves plan → make (the writer or designer) → review (the person) → scheduled → live → measured. Every piece carries `launch_at`, the time it goes out, which the calendar view shows. A piece that needs another one live first (posts that link to the landing page) is `after` it.

## Steps

1. **Pin the launch**: what launches, the date and time with its zone, the audience, the one action you want from them, the channels and accounts, and what counts as success a week later. Ask the person for anything the project's `knowledge/` and AGENTS.md do not say, one question at a time (the `grill` skill). Done when each of these has an answer.
2. **List the pieces**: for each channel, what goes out and when, relative to launch (teasers before, the announcement at launch, follow-ups after). Each piece names its delegate type (`writer` for words, `designer` for images and pages), its output files and its checks (length, links, banned words, image sizes). Done when every channel has its pieces and every piece has a time.
3. **File them** with `task_create`, blockers first: `title`, `description` (the piece, the channel, the account, what the reader should do), `acceptance`, `checks`, `outputs`, `type`, `after`, and `fields: { launch_at: "<ISO time with zone>" }`. A piece made by hand is labelled `ready-for-human`. Done when every piece is filed and the calendar shows them on their days.
4. **Schedule each approved piece**: once the person approves it and moves it to scheduled, `action_propose({ connection, tool, args, run_at: launch_at, reason, task, then_stage: "live" })` with the exact content approved. Nothing goes out without that approval. Done when every approved piece has its action filed.
5. **After launch**, the live → measured move is a routine's. Collect each piece's numbers into the task with `task_comment` and write one recap of the launch against step 1's success line.
