---
version: 1
slug: "src-lib-cawco-decides-whodecidespage-svelte"
primary_target: "src/lib/cawco/decides/WhoDecidesPage.svelte"
related_targets: []
---

# Who decides

Configure › Who decides (`/config/decides`) and a project's Who decides (`/project/<id>/decides`), drawn by `WhoDecidesPage.svelte` over the `WhoDecides` state. Mode: Operate. The operator arrives to see who answers each kind of choice an agent can't make alone and to move one, now and then to tune an agent member, and rarely to add an agent or a kind.

Regions: on a project's page the crumbs (Your fleet / the project, Decisions trailing); the team row (`TeamRow`: a chip per member, its face and name, Add an agent last); the kinds' grid (`KindCard` per kind, `NewKindCard` closing it). Widths: 390 (one column), 680 (two), 1440 (three, four on a wide window), 2529 (as many as fit; the grid uses the window).

## Decisions

- The pitch (shape-first, picked: The kinds, with his note "too much emphasis on statistics"): no figure on the first view. A member's figures and the questions it was asked live in its card, opened from its chip.
- A kind's card: its glyph and name leading, the face chip of who answers trailing; under them its latest two questions (hub `GET /api/decides/recent`), each with its pick after the face of who made it (him where he picked again), "Waiting on you" linking to the project's Decisions, or "{member} is deciding". A kind no agent has asked of yet shows two sample questions in muted ink (words `kindSamples`; an added kind its examples), each with "Comes to you" or "Goes to {member}": the page explains itself through what it routes, never through a lede or a definition under a name.
- A member that can't run: the attention dot on its face chips, the reason on each kind it answers with "Change {name}" (opens its card), and in its card the reason with "Join a machine".
- The face chip keeps its whole name; the kind's name wraps beside it. It opens who can answer (WhoPicker): the kit's popover on a desk and the kit's bottom sheet under 640px, one list in both: rows at the touch floor with the face, the name, what it runs on and a tick on who answers now, bits-ui's radio group where the arrows move without picking and a press, Enter or Space picks; in a states file's frame it draws in place. Under the members: "{n} waiting stay with {member}" where questions wait, then Rename (in the card), Follow the fleet (a project's own kind, which wears a "Set here" tag under its head), Remove (a kind he added, asked in the card with where its waiting cards go).
- A member's card (`MemberSheet`, a bottom sheet on a phone): face (picture picker), name, what it runs on as three setting chips (harness, model, effort, each the kit's menu; `RunsOn`), its instructions as its own text pressed to edit ("Add instructions" when none; skills folded under them), "Tell me when it decides" and "May start delegates of its own" as switch rows (Caw's "Events wake Caw" the same recipe: words leading, switch ending the row), the kinds that come to it as plain glyph-and-name tags ("Nothing comes to it yet"), its record (MemberRecord's figures, then its calls, a mark where he picked again). One text edge; its body scrolls and its foot (Save and Cancel once something changed, Remove for agents he added) stands outside the scroller. Caw on a project's page: the lead switch, AGENTS.md and skills.
- Add an agent: the same card with a labelled Name field, the setting chips and Add instructions; Add agent. Fields carry visible labels and no placeholders (add a kind and rename too: Name, Examples).
- No labelled rows anywhere (DESIGN.md, The Screen Is Not The Record Rule).

## States

His fleet as it stands; a kind's list open; a member's card (agent, built-in agent, Caw on a project); adding an agent, and with nothing filled in; nobody has asked anything yet; a project with its own kinds; an agent that can't run (the attention dot on its face, why in its tooltip); adding a kind; removing a kind; the page failed; the questions still loading or failed; decides.md that doesn't read.

- While a project's decides.md can't be read, every kind's face is You, as the hub routes it, under the line "decides.md can't be read: … Every kind comes to you until it's fixed." with Open decides.md.
- A page that couldn't be read is the house's page-level fault (RegionFault, room page): Caw, "Couldn't show Who decides", Try again, Show details.
