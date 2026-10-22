---
name: decision-page
description: Interview the person for a choice in CawCo — decision cards, one question each, every option drawn live with what it gets and what it costs, one recommended — written as an OpenUI Lang program and read back with artifact_read. The one way any choice reaches the person: a design direction, a component's look, a name, a policy, a scope. Use when the person must pick before work goes on, when asked for options or a page of picks, or when a picked design needs tuning with dials.
---

# Decision page

A decision page is an **interview**: one question per card, asked in the order the answers depend on each other, each answer drawn live with what it gets the person and what it costs them, and your recommendation with its reason. The page holds only what is still open. When the person picks and presses Continue, CawCo folds that card to one line ("Decided: Astro", with Change to reopen it) and hides the options they turned down; you republish nothing for it, and their picks still come back through `artifact_read`.

The page is a **page** artifact whose source is a program in OpenUI Lang over CawCo's decision library: [LIBRARY.md](LIBRARY.md) holds every component, its arguments, the syntax and the revision rules. You write the program, never markup. The `show` skill's step 1 comes first: the page opens with `does: "pick"` and an `ask` that heads the panel, so the page's title is the one line the hero needs. Each pick is kept by its decision's id with the program's hash. A revision keeps every pick whose id it still has. In a project the program is also committed to `decisions/<name>/page.oui`, and a decision's `after` and its Section draw the project's decision graph.

## The card

- **Question**: the choice in the person's plain words ("How dense is the task row?"), never a component, story or id.
- **Options**: 2–5 real answers. Each Option's `line` is what it gets them and its `cost` what it costs them, one line each.
- **One Recommended**: exactly one option `recommended`, and the Decision's `why` is the one sentence that says why it.
- **Pick plus note**: the card gives both; it asks nothing else. Leave the Decision's `note` out and its button reads "Add a note". When the pick needs a particular note, give `note` a noun phrase the button finishes ("a reason for the rollback" reads "Add a reason for the rollback").
- **The same facts for every option**: each line and each cost answers the same question in the same units, the Recommended option's cost included.
- **A reason that can be checked**: the `why` names the fact that makes the Recommended option right (a number, a limit, what breaks), never only that it is better.
- **A stable order**: options stand in their own order (today first, small to large); never move the Recommended one to the top.
- **Say what it changes**: the question or the `why` says what the pick changes. Where something stands today, mark that option `current`.
- **Restate what it rests on**: a card that depends on an earlier pick names that pick in its question or `why` ("With Astro picked, …").
- **Words first**: the question, lines and costs carry the meaning; media shows it and never replaces it. Name an icon in words ("Attach"), never as a stand-in symbol or emoji. Figtree draws arrows (← → ↑ ↓), dashes, × ≠ ≤ ≥ and the like, but not ✓ ✗ ✕, the key symbols ⌘ ⌥ ⇧ ⌃ ⎋ ↵, ↔, ≈ or any emoji: write "Done" or "Command-K", for the hub refuses a program holding a character Figtree lacks.
- **Few options**: around five at most; split a bigger choice into two cards.
- **Diagrams that fit the card**: a diagram reads without scrolling either way. Draw fewer steps, or split it into two; a long chain of steps reads left to right (`flowchart LR`).
- **Dials** only for values on a picked option (its radius, its duration): add them to that card's media once it is decided.

**Design options are drawn live.** The component canvas (`design-explore`, `component-canvas`) is your working drawing, never a page for the person. For a design choice, give each option a component canvas of its own: a states file holding that option's story (`Row.quiet.stories.ts`), opened with `artifact_create({ kind: "component", does: "judge", ask, file })`, and the Option's media a `Preview` of it naming the stories the card shows and the widest one's own width (`Preview(id, null, ["Review", "PhoneReview"], 640)`, its `parameters.viewport`): the page widens to draw each story at 1:1, as many options abreast as the panel holds, so the person judges the real pixels; each stands alone from its start, none of the canvas's working chrome, and only where the panel is narrower than the story is it scaled down to fit. A choice that isn't visual needs no media.

**Settled fixes from the person's pins** are one compact card, a Decision with id `pins`: the question "Fixed from your pins: does it look right now?", their words quoted in its `why`, the fixed state live in its media, and two options, "Looks right" (recommended) and "Not yet". Answer each pin in its own thread too (`comment_reply`).

## Steps

1. **List the open choices.** One Decision per choice the person must make and you can't settle from the brief, the code or the design system. Give each decision and option a lowercase id that will not change (`row-density`, `quiet`). Done when every open question has a card and each card has its question, its options with a get and a cost line each, and one recommended with its reason.
2. **Order them.** The choice others hang on comes first, and each later card names it in `after`. A card whose options change with an earlier answer stays off the page until that answer is in. Done when every card's `after` names only cards above it.
3. **Make the media.** A design option's canvas as above, each frame `drawn` (component-canvas steps 4–5). A drawing is a canvas (`artifact_create`, `kind: "canvas"`, `mermaid` or `elements`); an animated mockup is a page artifact (`kind: "page"`, `html`); a running app is a preview; Preview shows any of them live. A picture is a file beside page.oui or a `generate_image` result by its absolute path. A Mermaid diagram goes in the program as text. Done when every Canvas and Preview has the id `artifact_create` answered.
4. **Write the program.** Read LIBRARY.md whole, then write `root = Decisions(…)` first, each Decision after it, its Options and its media. Put decisions that belong together in a Section. Done when every id is set, every statement is reachable from root, and the table below passes.
   - **With pictures beside it**: write the program as `page.oui` in a work folder of your own (not the project folder), the pictures beside it.
   - **Without a shell or file tools** (a project's Caw): write `decisions/<name>/page.oui` into the project's folder with `folder_write`; name pictures by their absolute paths.
5. **Publish.** Call `artifact_create({ kind: "page", name, does: "pick", ask, program })` (or `dir` with your work folder in place of `program`; Caw: `kind`, `name`, `does` and `ask` only). A program the hub can't keep is refused with every reason; a component outside the library is dropped and named in `dropped`. Then open the page with `artifact_browse` in your browser tool and click through every card and its media as the person will. Done when the answer carries the page's `id`, its `decisions` and `opened: true`, and every control you clicked answered.
6. **Wait for the picks.** End your turn. When the person sends, you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. Without `since` it returns every pick in full, each with the hash of the program it was made on (`earlierRevision` marks one picked on an older version); dials come back as the `dials` entry's value, by panel name. Pass the `seq` it answered as `since` next time.
7. **Ask the next question in place.** Call `artifact_update` with the `id` and `statements`: only the statements that change, merged by name (LIBRARY.md, Edit Mode); a new round's question is a new `ask` in the same call. Add the cards the answers unlocked, and remove from the root the cards whose choice is made and built, with the canvases of the options that lost (`artifact_delete`). Keep the ids of decisions that stay; a removed one's pick is kept. Done when the answer names your change and the page holds only open cards and cards decided this round.

## Before you show it

Each row refuses the page until it is fixed.

| Refuse | Fix |
| --- | --- |
| A card with no question | Ask the choice in the person's words, ending in "?" |
| An option with no cost line | Give its `cost`: what picking it takes away or makes harder |
| Two Recommended on one card, or none | Mark exactly one, and say why in the card's `why` |
| "Today" frames that aren't a real option | Today stands only as an option the person can keep, with its own cost |
| Legends | Every mark explains itself in its option's line |
| Size or id captions ("99% of 272×101", "tsk-142") | Caption what the person judges, or nothing |
| Frames outside a card | Each frame is an option's media or its card's media |
| More than one card for a choice already made | One card per choice; a made one leaves the root once built |
| A page that shows a state catalogue | States are the canvas's; the page asks one question per card |

## When to write HTML instead

Write the page as HTML only when a pick is not an option: something the person places or operates to decide (a point on a map, a sample they drag into shape, a machine and folder from `cawco.pickPlace`). A choice between options stays a program; a value the person tunes is a Dials component; an animated mockup is a page artifact shown with Preview.

The HTML page is the kit's, beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, DialKit) and `scripts/` (preview, record). The interview and the table above hold for it too.

1. In a work folder of your own, copy `kit/page.html` to `page.html` and write its cards and widgets to [RECIPES.md](RECIPES.md); animated mockups go in `mockups/<id>.html`, placed with `{{MK:<id>}}` and written to [CONTRACT.md](CONTRACT.md). Without a shell, write `decisions/<name>/page.html` (and its mockups) into the project's folder with `folder_write`.
2. With a shell, check each mockup: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders light at 1000px and dark at 360px and prints overflow and script errors; `--reduced` shows its still. `record.mjs` records one as a webm clip.
3. Publish with `artifact_create({ kind: "page", name, does: "pick", ask, dir })` (Caw: without `dir`). A page over 512 KiB, a placeholder the kit does not have, a missing mockup, or a page with no `data-cawco-choice` and no named field is refused with the reason. Revise by editing `page.html` and calling `artifact_create` again, or `artifact_update` with `html`; picks stay by choice id.
