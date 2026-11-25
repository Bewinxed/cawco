---
name: decision-page
description: Ask the person to choose in CawCo — decision cards, one question each, every option with what it gets and what it costs, one recommended — written as an OpenUI Lang program and read back with artifact_read. The one way a choice that is no design reaches the person, Caw's included. Use when the person must pick a name, a policy, a scope, an approach or a behaviour before work goes on, or when asked for options that are not designs.
---

# Decision page

A decision page is an **interview**: one question per card, asked in the order the answers depend on each other, each answer with what it gets the person and what it costs them, and your recommendation with its reason. The page holds only what is still open. A press on an option is the pick, kept at once; a press on it again clears it. Every card stays open. A card is answered by a pick, a note, or a pin on it you replied to and resolved; once every card is answered, their picks and notes go to you by themselves a few seconds after their last change, and the Send at the page's foot only sends early. They come back through `artifact_read`.

The page is a **page** artifact whose source is a program in OpenUI Lang over CawCo's decision library: [LIBRARY.md](LIBRARY.md) holds every component, its arguments, the syntax and the revision rules. You write the program, never markup. The `show` skill's step 1 comes first: the page opens with `does: "pick"` and an `ask` that heads the panel, so the page's title is the one line the hero needs. Each pick is kept by its decision's id with the program's hash. A revision keeps every pick whose id it still has. In a project the program is also committed to `decisions/<name>/page.oui`; a decision's `after` naming another page's decision (`page#id`) links the two pages, which the Decisions tab says on each ("After: …", "Unlocks: …"). A Send decides a project's page (theirs, or the hub's once every card is answered): the hub writes `decisions/<name>/record.json` and `log.md` from their picks (what they chose, who settled it and why, their note) and writes them again when they pick again, so read `log.md` for why a page was decided. Make tasks is a next step they may take on a decided page, never what decides it.

## One way to ask

A choice that is no design reaches the person only as a decision card on a page, so every pick is in the Decisions tab, in the record, and something work can wait on. A choice is between two or more real options, on a page with one card (or a few, for one topic): a project's Caw asks in a thread with a one-card page whose card their reply names by its link, drawn there as the card's chip. What is no such choice goes another way: a fact only the person knows, or a go-ahead, through `ask`; a design, one or several directions of it, on the design graph (the `show` skill), where their pins are the answer and they pick between directions with the graph's Pick, read as `artifact_read`'s `picked`. A page holds no design of the product's UI.

## The card

- **Question**: the choice in the person's plain words ("Who may approve a release?"), never a component, story or id.
- **Options**: 2–5 real answers. Each Option's `line` is what it gets them, its `cost` what it costs them, and its `builds` what picking it means building or changing, one sentence each. The card shows each as written, with no label before it, so each is a sentence that stands on its own: a line "The board moves while you are away.", a cost "Your Approve no longer continues the same call while you watch.", a builds "A new tray component and an onboarding step." (or "Nothing new: today's behaviour stays."). Never start one with "Gets:", "Costs:" or "Builds:". `builds` is the work, never the time it takes.
- **One Recommended**: exactly one option `recommended`, and the Decision's `why` is the one sentence that says why it. The card shows the why after that option's label ("Recommended: Per machine. …"), so the why never names the option again.
- **Pick plus note**: the card gives both; it asks nothing else. Leave the Decision's `note` out and its button reads "Add a note". When the pick needs a particular note, give `note` a noun phrase the button finishes ("a reason for the rollback" reads "Add a reason for the rollback").
- **The same facts for every option**: each line and each cost answers the same question in the same units, the Recommended option's cost included.
- **One change per pair**: two options differ in one thing, said in each side's `line`.
- **A reason that can be checked**: the `why` names the fact that makes the Recommended option right (a number, a limit, what breaks), never only that it is better.
- **A stable order**: options stand in their own order (today first, small to large); never move the Recommended one to the top.
- **Say what it changes**: the question or the `why` says what the pick changes. Where something stands today, mark that option `current`.
- **Restate what it rests on**: a card that depends on an earlier pick names that pick in its question or `why` ("With Astro picked, …").
- **Words first**: the question, lines and costs carry the meaning; media shows it and never replaces it. Name an icon in words ("Attach"), never as a stand-in symbol or emoji. Figtree draws arrows (← → ↑ ↓), dashes, × ≠ ≤ ≥ and the like, but not ✓ ✗ ✕, the key symbols ⌘ ⌥ ⇧ ⌃ ⎋ ↵, ↔, ≈ or any emoji: write "Done" or "Command-K", for the hub refuses a program holding a character Figtree lacks.
- **Few options**: around five at most; split a bigger choice into two cards.

**Media is words, a diagram or a picture that is no UI.** A design never stands on a page: the hub refuses a `Preview` in a program and names the design graph. A `Diagram` (a Mermaid `stateDiagram-v2`, each edge labelled by what the person does) goes in each option only when the options differ in a sequence of states that their words leave hard to follow. A picture that is no UI (a generated image, a logo, a photograph) is an `Image`: a file beside page.oui or a `generate_image` result by its absolute path. A drawing of what is not a screen is a `Canvas`. A choice that needs no picture needs no media.

**Fixes from the person's pins** are shown where they pinned: a design graph's fix is the code change itself, which their open graph shows as you save; a page is revised with `artifact_update`. Answer each pin in its own thread with what changed (`comment_reply`). A page's revision, or a graph's new `ask`, waits for them in Needs you until they open it.

## Who decides

A choice that is not yours to make is a decision card with its kind, which the hub settles by the project's Who decides: the work that depends on it waits on the card, and the rest goes on.

Every Decision names its `kind`, the 9th argument, and the hub refuses one without it: `Decision("cache", "Where do builds cache?", [disk, s3], "Disk is free.", [], [], false, null, "approach")`.

The fleet's kinds of choice are listed in your instructions (`Kinds:`), each with the example that files a choice under it.

`artifact_create` and `artifact_update` answer where each card went: to the person (the card waits on them), to a member of Who decides that settles it (Caw, the advisor, common practice, an agent they added), or to you. A member that can't be reached sends the card to them, and the line says why. On a card that is yours, call `settle({ card: "<page>#<card>", option, why, sources })`: the pick is kept as yours, with your why, and the person can pick again. Wait on the card (`waitsOn: "<page>#<card>"` on a plan step or task) and build once it settles.

A card's pick enters three ways only: the person's own press, `settle` by Who decides, and `record_pick` from his own words. `artifact_update`'s `patch` never writes a decision page's state.

## His words elsewhere answer a card

When a pin of his on the page, or a message he typed to you or another session of the project, plainly answers an open card, record it: `record_pick({ card: "<page>#<card>", options, pin | message, quote })`. `pin` is the pin's id or handle (`comment_read`); `message` is a `find` hit's ref with `by: "person"`. `quote` is the words that answer the card, copied as he wrote them. The hub checks the words are his and the quote stands in them, then keeps the pick as his: it counts everywhere his press does, and the card shows "Picked from your comment: “…”" until he picks otherwise.

Record it only when his words name one option, or plainly approve it ("the second is fine", "go with the cache on disk"). A question, a doubt, a condition or a new idea picks nothing: answer it, and revise the card if it reopens it (step 7). A card holding his own pick stays his: `record_pick` refuses it.

## Steps

1. **List the open choices.** Read the project's prior decisions first: each decided page's `decisions/<name>/log.md` (`folder_read` in a project). A choice one of them made is settled: build on it, and name it in the `why` of any card that rests on it. One Decision per choice the person must make and you can't settle from those decisions, the brief, the code or the design system. Give each decision and option a lowercase id that will not change (`row-density`, `quiet`). Done when every open question has a card and each card has its question, its options with a get, a cost and a builds line each, and one recommended with its reason.
2. **Order them.** The choice others hang on comes first, and each later card names it in `after`. A card whose options change with an earlier answer stays off the page until that answer is in. Done when every card's `after` names only cards above it.
3. **Make the media** a card needs. A `Diagram`, written in the program. A picture that is no UI, a file beside page.oui or a `generate_image` result by its absolute path. A drawing, a canvas (`artifact_create` with `kind: "canvas"`, `does: "draw"`) shown with `Canvas`. Done when every Image names its file and every Canvas the id `artifact_create` answered.
4. **Write the program.** Read LIBRARY.md whole, then write `root = Decisions(…)` first, each Decision after it, its Options and its media. Put decisions that belong together in a Section. Done when every id is set, every statement is reachable from root, and the table below passes.
   - **With pictures beside it**: write the program as `page.oui` in a work folder of your own (not the project folder), the pictures beside it.
   - **Without a shell or file tools** (a project's Caw): write `decisions/<name>/page.oui` into the project's folder with `folder_write`; name pictures by their absolute paths.
5. **Publish.** Call `artifact_create({ kind: "page", name, title, does: "pick", ask, pick, program })` (or `dir` with your work folder in place of `program`; Caw: `kind`, `name`, `title`, `does`, `ask` and `pick` only), its `pick` quick or enlarged for what its cards ask. A program the hub can't keep is refused with every reason; a component outside the library is dropped and named in `dropped`. Then read the page as the person will see it: `artifact_read` with `png` at 600 and at 390. Done when the answer carries the page's `id`, its `decisions` and `opened: true`, `dropped` is empty, and in the picture each card's options compare within one screen's height, and at 1440×790 and 390×844 every card's options are in view without scrolling once the card's question is.
6. **Read the answers.** End your turn. When every card is answered (or they send early), you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. Woken by anything else (a pin, after a compaction), read `open_items` first: it lists every question you and your delegates put to them, open or answered, with what they said. It lists every card under its Choices: picked (the option, any note, and whether it was picked on an earlier revision), answered in his own words with no pick, dismissed, picked then cleared, or no pick yet, each with its note; dials come back as the `dials` value, by panel name. Pass the `seq` it names as `since` next time. Then sort each card by what came back:
   - **A pick, no note**: the pick stands. Build on it.
   - **A pick and a note**: the pick stands, and the note shapes how you build it. Answer anything it asks.
   - **A pin or a message of his that plainly answers a card**: record it with `record_pick` (Who decides, above), then treat it as a pick.
   - **A note, no pick** (answered in his own words with no pick, or no pick yet with a note): the person is talking to you. Answer the note first, in your reply, with what it asks for (the fact, the source, the measurement). Then judge its intent. A note that plainly approves one option ("go with the recommended", "the second is fine") is that option's pick: treat it as picked and say so. Any other note (a question, a doubt, a new idea, a "why not X") reopens the card: revise it in step 7.
   - **Nothing**: the card is still open; leave it as it stands.
   Then close each answered card you acted on: `question_close({ question: <its link>, as: "taken", why: <what they decided, in plain words> })`, or `as: "withdrawn"` with what superseded it. A closed card asks them nothing more; a new answer of their reopens it in `open_items`.
   Done when every card is sorted, every note has its answer in your reply, and `open_items` lists none of this page's answered cards.
7. **Ask again in place.** Call `artifact_update` with the `id` and `statements`: only the statements that change, merged by name (LIBRARY.md, Edit Mode); a new round's question is a new `ask` in the same call. Revise each card a note reopened, under its own id, so it answers the note: a better question, the option the note asked about, the fact in its `why`, a cost the note found. Add the cards the answers unlocked, and remove from the root the cards whose choice is made and built, with the canvases of the options that lost (`artifact_delete`) where they had any. Keep the ids of decisions that stay; a removed one's pick is kept. Done when the answer names your change, every reopened card answers its note, and the page holds only open cards and cards decided this round.

8. **Make the build wait on its card.** Work that builds what the page decides starts only once the person has answered: file it as a task that waits on the card, `task_create({ …, waits_on: ["<page>#<card>"] })` (or `task_link` on a task already filed), one wait per card it rests on. Dispatch starts no attempt until each card is answered, so nothing is spent on a direction the person may reject. Never start the build first and hope the picks agree. Done when every build of this page's choices waits on the cards it rests on.

## Before you show it

Each row refuses the page until it is fixed.

| Refuse | Fix |
| --- | --- |
| A design of the product's UI: a `Preview`, a wireframe, a mockup, a screenshot of a design | The design graph (the `show` skill): directions as one states file each, the pick made on the graph (`picked`) |
| One design under a yes or no | Judge it on its design graph (the `show` skill); a go-ahead is `ask` |
| A `look` card with an option lacking a picture | Give every option an `Image` or `Canvas` in its media; media every option shares goes once in the Decision's media, drawn below them |
| A card with no question | Ask the choice in the person's plain words, ending in "?" |
| An option with no cost line | Give its `cost`: what picking it takes away or makes harder |
| Two Recommended on one card, or none | Mark exactly one, and say why in the card's `why` |
| "Today" frames that aren't a real option | Today stands only as an option the person can keep, with its own cost |
| Legends | Every mark explains itself in its option's line |
| Size or id captions ("99% of 272×101", "tsk-142") | Caption what the person judges, or nothing |
| Media outside a card | Each picture is an option's media or its card's media |
| More than one card for a choice already made | One card per choice; a made one leaves the root once built |

## When to write HTML instead

Write the page as HTML only when a pick is not an option: something the person places or operates to decide (a point on a map, a sample they drag into shape, a machine and folder from `cawco.pickPlace`). A choice between options stays a program; a value the person tunes on a design is a dial on its design graph.

The HTML page is the kit's, beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, the dials) and `scripts/` (preview, record). The interview and the table above hold for it too.

1. In a work folder of your own, copy `kit/page.html` to `page.html` and write its cards and widgets to [RECIPES.md](RECIPES.md); a figure that explains an idea that is no screen (how a sync moves, what a limit does over a day) goes in `mockups/<id>.html`, placed with `{{MK:<id>}}` and written to [CONTRACT.md](CONTRACT.md). A design of the product's UI is never part of a page: it is on the design graph. Without a shell, write `decisions/<name>/page.html` (and its mockups) into the project's folder with `folder_write`.
2. With a shell, check each mockup: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders it light on a desk and dark at 360px and prints overflow and script errors; `--reduced` shows its still. `record.mjs` records one as a webm clip.
3. Publish with `artifact_create({ kind: "page", name, title, does: "pick", ask, dir })` (Caw: without `dir`). A page over 512 KiB, a placeholder the kit does not have, a missing mockup, or a page with no `data-cawco-choice` and no named field is refused with the reason. Each distinct image counts once however many times it is shown, and Caw's stills come at 56, 160 and 320px (CONTRACT.md, The fragment). Revise by editing `page.html` and calling `artifact_create` again, or `artifact_update` with `html`; picks stay by choice id.
