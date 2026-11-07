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
- A kind's card: its glyph and name leading, the face chip of who answers trailing; under them its latest two questions (hub `GET /api/decides/recent`) with their picks, or "Waiting on you" linking to the project's Decisions. Never a definition of the kind on the card.
- The face chip opens the hand-over list hung from it (Hung, the kit's popover; in a states file's frame it draws in place). Its foot holds what else is done to the kind: Rename (in the card), Give back to the fleet (a project's own kind, marked by the folder), Remove (a kind he added, asked in the card with where its waiting cards go).
- A member's card (`MemberSheet`): face (picture picker), name, what it runs on as a chip that unfolds `RunsOnEditor` in place, its standing instructions as its own text pressed to edit (skills folded under them), Tell me each time, its record (MemberRecord's figures, then its calls, a mark where he picked again). Save and Cancel stand, pinned to its foot, only once something changed; Remove for agents he added. Caw on a project's page: the lead switch, AGENTS.md and skills.
- Add an agent: the same card with a name field, the runs-on chip, instructions; Add agent.
- No labelled rows anywhere (DESIGN.md, The Screen Is Not The Record Rule).

## States

His fleet as it stands; a kind's list open; a member's card (agent, built-in agent, Caw on a project); adding an agent, and with nothing filled in; nobody has asked anything yet; a project with its own kinds; an agent that can't run (the attention dot on its face, why in its tooltip); adding a kind; removing a kind; the page failed; the questions still loading or failed; decides.md that doesn't read.
