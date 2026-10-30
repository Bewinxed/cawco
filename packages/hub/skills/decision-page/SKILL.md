---
name: decision-page
description: Interview the person for a choice in CawCo — decision cards, one question each, every option drawn live with what it gets and what it costs, one recommended — written as an OpenUI Lang program and read back with artifact_read. The one way any choice reaches the person, Caw's questions in a thread included: a design direction, a component's look, a name, a policy, a scope. Use when the person must pick before work goes on, when asked for options or a page of picks, or when a picked design needs tuning with dials.
---

# Decision page

A decision page is an **interview**: one question per card, asked in the order the answers depend on each other, each answer drawn live with what it gets the person and what it costs them, and your recommendation with its reason. The page holds only what is still open. A press on an option is the pick, kept at once; a press on it again clears it. Every card stays open, and the person sends the page from its foot when they are ready; their picks and notes come back through `artifact_read`.

The page is a **page** artifact whose source is a program in OpenUI Lang over CawCo's decision library: [LIBRARY.md](LIBRARY.md) holds every component, its arguments, the syntax and the revision rules. You write the program, never markup. The `show` skill's step 1 comes first: the page opens with `does: "pick"` and an `ask` that heads the panel, so the page's title is the one line the hero needs. Each pick is kept by its decision's id with the program's hash. A revision keeps every pick whose id it still has. In a project the program is also committed to `decisions/<name>/page.oui`; a decision's `after` naming another page's decision (`page#id`) links the two pages, which the Decisions tab says on each ("After: …", "Unlocks: …"). His Send decides a project's page: the hub writes `decisions/<name>/record.json` and `log.md` from his picks (what he chose, who settled it and why, his note) and writes them again when he picks again, so read `log.md` for why a page was decided. Make tasks is a next step he may take on a decided page, never what decides it.

## One way to ask

A choice reaches the person only as a decision card on a page, so every pick is in the Decisions tab, in the record, and something work can wait on. A single choice is a page with one card (or a few, for one topic): a project's Caw asks in a thread with a one-card page whose card his reply names by its link, drawn there as the card's chip. A question that is no choice between options (a fact only the person knows, a go-ahead) goes through `ask` instead.

## The card

- **Question**: the choice in the person's plain words ("How dense is the task row?"), never a component, story or id.
- **Options**: 2–5 real answers. Each Option's `line` is what it gets them, its `cost` what it costs them, and its `builds` what picking it means building or changing, one sentence each. The card shows each as written, with no label before it, so each is a sentence that stands on its own: a line "The board moves while you are away.", a cost "Your Approve no longer continues the same call while you watch.", a builds "A new tray component and an onboarding step." (or "Nothing new: today's behaviour stays."). Never start one with "Gets:", "Costs:" or "Builds:". `builds` is the work, never the time it takes.
- **One Recommended**: exactly one option `recommended`, and the Decision's `why` is the one sentence that says why it. The card shows the why after that option's label ("Recommended: Per machine. …"), so the why never names the option again.
- **Pick plus note**: the card gives both; it asks nothing else. Leave the Decision's `note` out and its button reads "Add a note". When the pick needs a particular note, give `note` a noun phrase the button finishes ("a reason for the rollback" reads "Add a reason for the rollback").
- **The same facts for every option**: each line and each cost answers the same question in the same units, the Recommended option's cost included.
- **A reason that can be checked**: the `why` names the fact that makes the Recommended option right (a number, a limit, what breaks), never only that it is better.
- **A stable order**: options stand in their own order (today first, small to large); never move the Recommended one to the top.
- **Say what it changes**: the question or the `why` says what the pick changes. Where something stands today, mark that option `current`.
- **Restate what it rests on**: a card that depends on an earlier pick names that pick in its question or `why` ("With Astro picked, …").
- **Words first**: the question, lines and costs carry the meaning; media shows it and never replaces it. Name an icon in words ("Attach"), never as a stand-in symbol or emoji. Figtree draws arrows (← → ↑ ↓), dashes, × ≠ ≤ ≥ and the like, but not ✓ ✗ ✕, the key symbols ⌘ ⌥ ⇧ ⌃ ⎋ ↵, ↔, ≈ or any emoji: write "Done" or "Command-K", for the hub refuses a program holding a character Figtree lacks.
- **Few options**: around five at most; split a bigger choice into two cards.
- **Dials** only for values on a picked option (its radius, its duration): add them to that card's media once it is decided.

**Design options are drawn live.** The component canvas (`design-explore`, `component-canvas`) is your working drawing, never a page for the person. For a design choice, give each option a component canvas of its own: a states file holding that option's story (`Row.quiet.stories.ts`), opened with `artifact_create({ kind: "component", does: "judge", ask, file })`, and the Option's media a `Preview` of it naming the stories the card shows and the widest one's own width (`Preview(id, null, ["Review", "PhoneReview"], 640)`, its `parameters.viewport`): every story is drawn at its real size, 1 CSS px per px, never scaled, so the person judges the real pixels: the page widens to the story, a card's options stand side by side only where every one fits at its width (two 390px phone designs sit side by side, two 1440px desk designs stand one under another), a design wider than the panel scrolls sideways in its well, and a page taller than the window scrolls inside its frame; each stands alone from its start, none of the canvas's working chrome. A Preview of a whole screen (a page, a dev server's or a folder's preview: a timeline, a dashboard) takes the card's full width: name its own layout width as `width` and it stands at it where the card holds it, scaled down to fit where it doesn't (never under 10px words); name none and it lays itself out to the card's width. Under it, Open full size brings it to the front of your panel. A choice that isn't visual needs no media.

**Settled fixes from the person's pins** are one compact card, a `look` Decision with id `pins`: the question "Fixed from your pins: does it look right now?", their words quoted in its `why`, the fixed state live in its media, and two options, "Looks right" (recommended) and "Not yet". Answer each pin in its own thread too (`comment_reply`).

## Who decides

A choice that is not yours to make is a decision card with its kind; wait on the card — the hub settles it by the project's Who decides.

Every Decision names its `kind`, the 9th argument, and the hub refuses one without it: `Decision("cache", "Where do builds cache?", [disk, s3], "Disk is free.", [], [], false, null, "approach")`.

The fleet's kinds of choice are listed in your instructions (`Kinds:`), each with the example that files a choice under it.

`artifact_create` and `artifact_update` answer where each card went: to the person (the card waits on him), to a member of Who decides that settles it (Caw, the advisor, common practice, an agent he added), or to you. A member that can't be reached sends the card to him, and the line says why. On a card that is yours, call `settle({ card: "<page>#<card>", option, why, sources })`: the pick is kept as yours, with your why, and the person can pick again. Wait on the card (`waitsOn: "<page>#<card>"` on a plan step or task) and build once it settles.

## Steps

1. **List the open choices.** One Decision per choice the person must make and you can't settle from the brief, the code or the design system. Give each decision and option a lowercase id that will not change (`row-density`, `quiet`). Done when every open question has a card and each card has its question, its options with a get, a cost and a builds line each, and one recommended with its reason.
2. **Order them.** The choice others hang on comes first, and each later card names it in `after`. A card whose options change with an earlier answer stays off the page until that answer is in. Done when every card's `after` names only cards above it.
3. **Make the media.** A design option's canvas as above, each frame `drawn` (component-canvas steps 4–5). An animated mockup is a page artifact (`kind: "page"`, `html`); a running app is a preview; Preview shows any of them live. A picture is a file beside page.oui or a `generate_image` result by its absolute path. Done when every Canvas and Preview has the id `artifact_create` answered.
4. **Write the program.** Read LIBRARY.md whole, then write `root = Decisions(…)` first, each Decision after it, its Options and its media. Put decisions that belong together in a Section. Done when every id is set, every statement is reachable from root, and the table below passes.
   - **With pictures beside it**: write the program as `page.oui` in a work folder of your own (not the project folder), the pictures beside it.
   - **Without a shell or file tools** (a project's Caw): write `decisions/<name>/page.oui` into the project's folder with `folder_write`; name pictures by their absolute paths.
5. **Publish.** Call `artifact_create({ kind: "page", name, does: "pick", ask, program })` (or `dir` with your work folder in place of `program`; Caw: `kind`, `name`, `does` and `ask` only). A program the hub can't keep is refused with every reason; a component outside the library is dropped and named in `dropped`. Then open the page with `artifact_browse` in your browser tool and click through every card and its media as the person will. Done when the answer carries the page's `id`, its `decisions` and `opened: true`, and every control you clicked answered.
6. **Read the answers.** End your turn. When the person sends, you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. It lists every card under its Choices: picked (the option, any note, and whether it was picked on an earlier revision), picked then cleared, or no pick yet, each with its note; dials come back as the `dials` value, by panel name. Pass the `seq` it names as `since` next time. Then sort each card by what came back. The owner: "Infer from the note or lack thereof, address first then reprompt unless it's approving":
   - **A pick, no note**: the pick stands. Build on it.
   - **A pick and a note**: the pick stands, and the note shapes how you build it. Answer anything it asks.
   - **A note, no pick**: the person is talking to you. Answer the note first, in your reply, with what it asks for (the fact, the source, the measurement). Then judge its intent. A note that plainly approves one option ("go with the recommended", "the second is fine") is that option's pick: treat it as picked and say so. Any other note (a question, a doubt, a new idea, a "why not X") reopens the card: revise it in step 7.
   - **Nothing**: the card is still open; leave it as it stands.
   Done when every card is sorted, and every note has its answer in your reply.
7. **Ask again in place.** Call `artifact_update` with the `id` and `statements`: only the statements that change, merged by name (LIBRARY.md, Edit Mode); a new round's question is a new `ask` in the same call. Revise each card a note reopened, under its own id, so it answers the note: a better question, the option the note asked about, the fact in its `why`, a cost the note found. Add the cards the answers unlocked, and remove from the root the cards whose choice is made and built, with the canvases of the options that lost (`artifact_delete`). Keep the ids of decisions that stay; a removed one's pick is kept. Done when the answer names your change, every reopened card answers its note, and the page holds only open cards and cards decided this round.

8. **Make the build wait on its card.** Work that builds what the page decides starts only once the person has answered: file it as a task that waits on the card, `task_create({ …, waits_on: ["<page>#<card>"] })` (or `task_link` on a task already filed), one wait per card it rests on. Dispatch starts no attempt until each card is answered, so nothing is spent on a direction the person may reject. Never start the build first and hope the picks agree. Done when every build of this page's choices waits on the cards it rests on.

## Before you show it

Each row refuses the page until it is fixed.

| Refuse | Fix |
| --- | --- |
| A `look` card with an option lacking a picture | Give every option an `Image`, `Preview` or `Canvas` in its media, or, for a verdict on one design (the `pins` card), the Decision the picture and its options none |
| A card with no question | Ask the choice in the person's words, ending in "?" |
| An option with no cost line | Give its `cost`: what picking it takes away or makes harder |
| Two Recommended on one card, or none | Mark exactly one, and say why in the card's `why` |
| "Today" frames that aren't a real option | Today stands only as an option the person can keep, with its own cost |
| Legends | Every mark explains itself in its option's line |
| Size or id captions ("99% of 272×101", "tsk-142") | Caption what the person judges, or nothing |
| Frames outside a card | Each frame is an option's media or its card's media |
| More than one card for a choice already made | One card per choice; a made one leaves the root once built |
| One frame stacking desk and phone, or a behaviour choice told only in words | A behaviour or flow choice is a state machine: the component canvas with edges, one frame per state, each edge labelled by what the person does, phone and desk in separate rows, embedded as the option's picture through `Preview` (or `Canvas` for a drawing) |

## When to write HTML instead

Write the page as HTML only when a pick is not an option: something the person places or operates to decide (a point on a map, a sample they drag into shape, a machine and folder from `cawco.pickPlace`). A choice between options stays a program; a value the person tunes is a Dials component; an animated mockup is a page artifact shown with Preview.

The HTML page is the kit's, beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, DialKit) and `scripts/` (preview, record). The interview and the table above hold for it too.

1. In a work folder of your own, copy `kit/page.html` to `page.html` and write its cards and widgets to [RECIPES.md](RECIPES.md); mockups go in `mockups/<id>.html`, placed with `{{MK:<id>}}` and written to [CONTRACT.md](CONTRACT.md). A design the person compares is a real-size mockup, drawn at its true width in the kit's real-size frame (RECIPES.md, "At its real size"), so they judge its real pixels. Without a shell, write `decisions/<name>/page.html` (and its mockups) into the project's folder with `folder_write`.
2. With a shell, check each mockup: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders it light on a desk and dark at 360px and prints overflow and script errors; `--reduced` shows its still. `record.mjs` records one as a webm clip.
3. Publish with `artifact_create({ kind: "page", name, does: "pick", ask, dir })` (Caw: without `dir`). A page over 512 KiB, a placeholder the kit does not have, a missing mockup, or a page with no `data-cawco-choice` and no named field is refused with the reason. Each distinct image counts once however many times it is shown, and Caw's stills come at 56, 160 and 320px (CONTRACT.md, The fragment). Revise by editing `page.html` and calling `artifact_create` again, or `artifact_update` with `html`; picks stay by choice id.
