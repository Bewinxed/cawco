---
version: 1
slug: "src-lib-cawco-decides-whodecidespage-svelte"
primary_target: "src/lib/cawco/decides/WhoDecidesPage.svelte"
related_targets: []
---

# Who decides

Configure › Who decides (`/config/decides`) and a project's Who decides (`/project/<id>/decides`), drawn by `WhoDecidesPage.svelte` over the `WhoDecides` state. Mode: Operate. The operator arrives to see who answers each kind of choice an agent can't make alone and to move one, now and then to tune an agent member, and rarely to add an agent or a kind.

Regions: on a project's page the crumbs (Your fleet / the project, Decisions trailing); the team row (`TeamRow`: a chip per member, its face and name, Add an agent last); the kinds' grid (`KindCard` per kind, `NewKindCard` closing it). Widths: 390 (one column), 680 (two), 1440 (three, capped at `c-config-max-w`), 2529 (three, capped).

## Decisions

- The pitch (shape-first, picked: The kinds, with his note "too much emphasis on statistics"): no figure on the first view. A member's figures and the questions it was asked live in its card, opened from its chip.
- A kind's card: its glyph and name leading, the face chip of who answers trailing; under them its latest two questions (hub `GET /api/decides/recent`), each with its pick after the face of who made it (him where he picked again), "Waiting on you" linking to the project's Decisions, or "{member} is deciding". A kind no agent has asked of yet shows two sample questions in muted ink (words `kindSamples`; an added kind its examples), each with "Comes to you" or "Goes to {member}": the page explains itself through what it routes, never through a lede or a definition under a name.
- A member that can't run: the attention dot on its face chips, the reason on each kind it answers with "Change {name}" (opens its card), and in its card the reason with "Join a machine".
- The face chip opens who can answer (WhoPicker): on a desk the kit's menu (radio items, the arrows moving without picking), under 640px the kit's bottom sheet; in a states file's frame it draws in place. Under the members: "{n} waiting stay with {member}" where questions wait, then Rename (in the card), Follow the fleet (a project's own kind, marked by the folder), Remove (a kind he added, asked in the card with where its waiting cards go).
- A member's card (`MemberSheet`, a bottom sheet on a phone): face (picture picker), name, what it runs on as three setting chips (harness, model, effort, each the kit's menu; `RunsOn`), its instructions as its own text pressed to edit ("Add instructions" when none; skills folded under them), Tell me each time and May start delegates of its own as switches, the kinds that come to it as chips ("No kind yet"), its record (MemberRecord's figures, then its calls, a mark where he picked again). One text edge; its body scrolls and its foot (Save and Cancel once something changed, Remove for agents he added) stands outside the scroller. Caw on a project's page: the lead switch, AGENTS.md and skills.
- Add an agent: the same card with a labelled Name field, the setting chips and Add instructions; Add agent. Fields carry visible labels and no placeholders (add a kind and rename too: Name, Examples).
- No labelled rows anywhere (DESIGN.md, The Screen Is Not The Record Rule).

## States

His fleet as it stands; a kind's list open; a member's card (agent, built-in agent, Caw on a project); adding an agent, and with nothing filled in; nobody has asked anything yet; a project with its own kinds; an agent that can't run (the attention dot on its face, why in its tooltip); adding a kind; removing a kind; the page failed; the questions still loading or failed; decides.md that doesn't read.
