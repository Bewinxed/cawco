# The task, plan and to-do grill

`page.oui` is the decision program (the decision library, `packages/hub/skills/decision-page/LIBRARY.md`). It carries
no `Preview` placeholders: its media are Mermaid diagrams, so it publishes as it stands:
`artifact_create({ kind: "page", name: "plan-model-grill", program })`, or with `dir` set to this folder.

Two questions are open: where every session keeps its plan (`list-home`), then which of your changes wake an idle
session (`wake`, after `list-home`). The cohesion model's other three questions are settled and listed in the `settled`
card with their sources:

- `step-edges`: every way of the plan view's round 4 (branch `cawco/plan-view-round4`) draws a step's "after";
- `delegate-depth`: round 4 draws a delegate as one row with its steps, report and session behind its fold;
- `ended`: round 4's `receiverOf` sends a finished delegate's step to the plan's own session; a task's to-do follows
  attach or spawn (PRD §5.3, D3).

The plan view's own pick (One list, Lanes, Crew first) is the owner's on its own page and is not asked here.

Its proof is `bun scripts/probe-kit/run.ts web decision-pages-ready` (with the project screens' page); captures and
their manifest are in `.probe/decision-pages/`.
