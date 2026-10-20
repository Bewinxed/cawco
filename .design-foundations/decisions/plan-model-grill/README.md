# How your changes reach an agent's plan

`page.oui` is the decision program (the decision library, `packages/hub/skills/decision-page/LIBRARY.md`). It has no
media, so it publishes as it stands: `artifact_create({ kind: "page", name: "plan-model-grill",
program, ask, does })`, `ask` and `does` read from `ask.txt` and `does.txt` beside it.

One question is open: which of the owner's changes start an idle agent working again (`wake`). His first answer on
this page's first round left it open: "if the agent is already working on it, it hsould be notified of any changes,
but if the session is idel, which session do you send to? or do you send to a new session?" (PRD §11, 2026-10-20).

Two settled points stand as one line each above the card (Text, no pick), because the wake question rests on them:

- `settledhome`: every session keeps CawCo's plan, always: the owner's pick on 2026-10-20 (PRD §5.2, "Every session
  keeps CawCo's list, always"). The page's first round asked it as `list-home`; it is no longer asked.
- `settledended`: round 4's `receiverOf` sends a finished delegate's step to the plan's own session, which answers his
  "which session do you send to?".

The plan view's round 4 (branch `cawco/plan-view-round4`) also settled that a step can draw its "after" and that a
delegate is one row with its steps behind its fold; neither bears on this question, so the page leaves them out. The
plan view's own pick (One list, Lanes, Crew first) is the owner's on its own page and is not asked here.

The page says "plan" and "step" throughout: PRD §3 and WORDS.md name a session's own step list its **plan**; a
"to-do" is a task's checklist line, a different thing.

Its proof is `bun scripts/probe-kit/run.ts web decision-pages-ready` (with the project screens' page); captures and
their manifest are in `.design-foundations/decisions/captures/`.
