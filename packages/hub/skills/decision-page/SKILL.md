---
name: decision-page
description: Interview the person for a choice in CawCo — decision cards, one question each, every option drawn live with what it gets and what it costs, one recommended — written as an OpenUI Lang program and read back with artifact_read. The one way any choice reaches the person: a design direction, a component's look, a name, a policy, a scope. Use when the person must pick before work goes on, when asked for options or a page of picks, or when a picked design needs tuning with dials.
---

# Decision page

A decision page is an **interview**: one question per card, asked in the order the answers depend on each other, each answer drawn live with what it gets the person and what it costs them, and your recommendation with its reason. The page holds only what is still open. When the person picks, CawCo folds that card to one line ("Decided: Astro", with Change to reopen it) and hides the options they turned down; you republish nothing for it, and their picks still come back through `artifact_read`.

The page is a **page** artifact whose source is a program in OpenUI Lang over CawCo's decision library: [LIBRARY.md](LIBRARY.md) holds every component, its arguments, the syntax and the revision rules. You write the program, never markup. Each pick is kept by its decision's id with the program's hash. A revision keeps every pick whose id it still has. In a project the program is also committed to `decisions/<name>/page.oui`, and a decision's `after` and its Section draw the project's decision graph.

## The card

- **Question**: the choice in the person's plain words ("How dense is the task row?"), never a component, story or id.
- **Options**: 2–5 real answers. Each Option's `line` is what it gets them and its `cost` what it costs them, one line each.
- **One Recommended**: exactly one option `recommended`, and the Decision's `why` is the one sentence that says why it.
- **Pick plus note**: the card gives both; it asks nothing else.
- **Dials** only for values on a picked option (its radius, its duration): add them to that card's media once it is decided.

**Design options are drawn live.** The component canvas (`design-explore`, `component-canvas`) is your working drawing, never a page for the person. For a design choice, give each option a component canvas of its own: a states file holding that option's story (`Row.quiet.stories.ts`), opened with `artifact_create({ kind: "component", file, about })`, and the Option's media a `Preview` of it. A choice that isn't visual needs no media.

**Settled fixes from the person's pins** are one compact card, a Decision with id `pins`: the question "Fixed from your pins: does it look right now?", their words quoted in its `why`, the fixed state live in its media, and two options, "Looks right" (recommended) and "Not yet". Answer each pin in its own thread too (`comment_reply`).

## Steps

1. **List the open choices.** One Decision per choice the person must make and you can't settle from the brief, the code or the design system. Give each decision and option a lowercase id that will not change (`row-density`, `quiet`). Done when every open question has a card and each card has its question, its options with a get and a cost line each, and one recommended with its reason.
2. **Order them.** The choice others hang on comes first, and each later card names it in `after`. A card whose options change with an earlier answer stays off the page until that answer is in. Done when every card's `after` names only cards above it.
3. **Make the media.** A design option's canvas as above, each frame `drawn` (component-canvas steps 4–5). A drawing is a canvas (`artifact_create`, `kind: "canvas"`, `mermaid` or `elements`); an animated mockup is a page artifact (`kind: "page"`, `html`); a running app is a preview; Preview shows any of them live. A picture is a file beside page.oui or a `generate_image` result by its absolute path. A Mermaid diagram goes in the program as text. Done when every Canvas and Preview has the id `artifact_create` answered.
4. **Write the program.** Read LIBRARY.md whole, then write `root = Decisions(…)` first, each Decision after it, its Options and its media. Put decisions that belong together in a Section. Done when every id is set, every statement is reachable from root, and the table below passes.
   - **With pictures beside it**: write the program as `page.oui` in a work folder of your own (not the project folder), the pictures beside it.
   - **Without a shell or file tools** (a project's Caw): write `decisions/<name>/page.oui` into the project's folder with `folder_write`; name pictures by their absolute paths.
5. **Publish.** Call `artifact_create` with `kind: "page"`, `name: "<name>"` and `program` (or `dir` with your work folder; Caw: `kind` and `name` only). A program the hub can't keep is refused with every reason; a component outside the library is dropped and named in `dropped`. Done when the answer carries the page's `id`, its `decisions` and `opened: true`.
6. **Wait for the picks.** End your turn. When the person sends, you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. Without `since` it returns every pick in full, each with the hash of the program it was made on (`earlierRevision` marks one picked on an older version); dials come back as the `dials` entry's value, by panel name. Pass the `seq` it answered as `since` next time.
7. **Ask the next question in place.** Call `artifact_update` with the `id` and `statements`: only the statements that change, merged by name (LIBRARY.md, Edit Mode). Add the cards the answers unlocked, and remove from the root the cards whose choice is made and built, with the canvases of the options that lost (`artifact_delete`). Keep the ids of decisions that stay; a removed one's pick is kept. Done when the answer names your change and the page holds only open cards and cards decided this round.

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
3. Publish with `artifact_create`, `kind: "page"`, `name` and `dir` (Caw: `kind` and `name` only). A page over 512 KiB, a placeholder the kit does not have or a missing mockup is refused with the reason. Revise by editing `page.html` and calling `artifact_create` again, or `artifact_update` with `html`; picks stay by choice id.
