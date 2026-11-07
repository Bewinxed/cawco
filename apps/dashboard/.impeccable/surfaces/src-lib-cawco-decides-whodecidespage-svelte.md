---
version: 1
slug: "src-lib-cawco-decides-whodecidespage-svelte"
primary_target: "src/lib/cawco/decides/WhoDecidesPage.svelte"
related_targets: []
---

# Who decides

Configure › Who decides (`/config/decides`) and a project's Who decides (`/project/<id>/decides`), drawn by `WhoDecidesPage.svelte` over the `WhoDecides` state. Mode: Operate. It is a setup screen: the operator comes rarely, to set or change who settles each kind of choice an agent can't make alone. Widths: 390 (one column), 680 (two), 1440 (four), 2529 (as many as fit; the grid uses the window).

## Decisions

- The page holds only the job: the team in a row (face and name, Add an agent last) and the kinds of choice as cards, each its glyph, its name and the face of who answers it. Nothing else: no questions, examples, picks, statuses, tags, notices or record lines (the owner, 2026-11-07: a setup screen, "solely for setting up who does what"; the questions "look like a log of work… clashing with projects"; the grid "says nothing, just cognitive overload").
- Who answers changes in place: the face is the press (WhoPicker), the kit's popover on a desk and the kit's bottom sheet under 640px, one list in both: rows at the touch floor with face, name, what it runs on and a tick on who answers now, bits-ui's radio group where the arrows move without picking and a press, Enter or Space picks. Under the members: Rename (in the card), Follow the fleet (a project's own kind), Remove (a kind he added, asked in the card with where its waiting choices go).
- A card's head holds when its name wraps: the glyph sits in a cell one line tall on the name's first line and the face is centred on that line; under 18rem (`kind-card` container) the face drops to its own row on the name's text column. The face keeps its whole name. Every card on the page is one height (`auto-rows-fr`).
- Add a kind is a tile the size of a kind card; its two fields (Name, Examples) hang from it, so it keeps its size open. Added, a kind is answered by You and handed over from its face.
- A member's settings and figures are one press away on its face (MemberSheet, a bottom sheet on a phone): three setting chips (harness, model, effort), its instructions pressed to edit, switch rows, MemberRecord's figures. Never on the page.
- A failure shows only while true, in the smallest house form: decides.md that can't be read is one line over the cards with Open decides.md (every face then You); a member that can't run wears the attention dot on its face, why in its card; a page that can't be read is the house's page fault.

## States

His fleet as it stands; a kind's list open; a member's card (agent, Caw on a project); adding an agent, and with nothing filled in; a project with its own kinds; an agent that can't run; adding a kind; removing a kind; the page failed; decides.md that can't be read.
