---
name: project-setup
description: Set up a project with the person — its name, what it is for, its stages with their look, who does the work, its place and routines — asking what their words leave open with `ask` as you draft, then one short setup page they send; write its files once they do. Use when a project was just made with Caw (its first message is the person's words, or CawCo's notice of a project made from an offer), when the person asks to set the project up again, to change how it runs or one part of it, or says it should become something else.
---

# Setting a project up

A setup is your questions as they come up, then one decision page, `setup`, that the person sends once. Nothing is written into the project before they send it: no stages.md, no delegate types, no AGENTS.md, no template. Until then the project's board is its setup scene, and it draws your open questions in its middle. Their Send approves the whole page, so what you write from it goes in directly.

## When it applies

- **A project just made.** Your first message is the person's words about the project, or CawCo's notice that they made it from a session's offer. The words are theirs: read them for what the project is, never quote them back.
- **Set up again, or one part.** The person asks to change how it runs, or a part of it ("move it to my laptop", "rename the stages"): pass the parts they named in `project_setup`'s `change`.
- **A pivot.** The person says the project should become something else: the same page, with the **What moves** card.

## 1. Read the facts

Your first words come before any work on the page: the person watches an unnamed, silent project until you speak. Load `project_setup`, `project_name` and `ask` alone now (where tools load by search, all three in one search); the decision-page skill and the page's tools wait for step 4.

Call `project_setup` (with `change` when the person named parts). It answers: the project's name and whether it is still the placeholder, the template tapped on New project (or none), every template a project is offered with its stages and delegate types, the current stages.md and tasks by stage, its places and the machines online, and the page's card ids with what Send applies for each. Done when you hold the facts.

Their panel shows your progress as four steps ticked from your own calls: `project_setup` (read), `project_name` (named), then drafting, then the page's `artifact_create` (open). Make them in that order.

## 2. Name it and say what you read

While the name is the placeholder, call `project_name` with a short name of your own from their words ("Your PR team", "Docs site"), so the rail and the head show it as you speak. Then write one or two sentences in your own voice: what you understood the project to be, and that a page opens to confirm how it runs. Done when the project is named and the person has read that a page is coming.

## 3. Ask what the words leave open, as you draft

Draft from their words: the stages, who does the work, the place, any routine. Where the words leave something open that changes the draft, ask it with `ask` the moment you meet it, rather than guessing or holding it for the page:

- **`blocks: true`** only when the draft cannot go on without the answer; `waiting` names what is paused ("drafting the visa stages"). End your turn after it.
- **`blocks: false`** for everything else, with `meanwhile` saying the assumption you go on with ("drafting for LinkedIn and X"), then keep drafting.
- One question per call, two to four options each, the one you would pick first. At most three questions in a setup, none when the words are enough. Never ask what the page itself settles (the name, a stage's name or look, which types to keep).
- When a shipped template fits the work as they described it, ask whether to start from it (options: that template, and "Caw drafts the stages from what you wrote"), `blocks: false`, going on with your own draft meanwhile.

Each answer reaches you as a message. Fold it into the draft; when it changes something already drafted, say what you redo in one line ("Redrafting the posting stages for X alone"), then go on. An unanswered question stands on the board, your assumption kept. Done when nothing that blocks is open.

## 4. Build the page

Load the `decision-page` skill and read the kit's setup recipe, `kit/setup.html`, with your Read tool: its comments say what each part holds. Copy it, fill it from the draft, write it to `decisions/setup/page.html` with `folder_write`, then call `artifact_create({ kind: "page", name: "setup", does: "pick", ask: "Set up <name>" })`. Write in CawCo's voice: sentence case, no "I", no folder paths inside sentences, no line that restates what a field already shows.

The page holds the draft only, every part editable where it stands, in this order, each only when it applies:

1. **`name`: Name and what it's for.** The name field (`name="name"`) with the name you gave, and a "What it's for" paragraph (`name="aim"`): your restatement of what the project is for and how its work is done, never quoting the person. It is the seed of AGENTS.md. Always present.
2. **`stages`: How work moves.** The strip: one tile per stage in order, its name as the board reads it ("Your call", plain lowercase words after the first letter, no punctuation), its kind, its hooks kept as data with what they do in words ("Runs the writer", "Moves on after 7 days"), and its **look**: a glyph (`data-icon`) and a colour (`data-color`) you pick for what the stage is, from the kit's list (`kit/stage-glyphs.js`: glyphs like inbox, search, pen, eye, hourglass, send, done, trash; colours cyan, amber, orange, green). Give every stage a glyph; give colours that group stages of a kind of work, and none to a stage that needs none (dropped). A stage of kind `you` keeps the Needs-you mark on the board whatever its look. Keep one stage of kind `you`. Set the strip's `data-shape` to the template it starts from, or `own`. The person renames, changes the kind or look, reorders, adds and removes stages on the strip itself; the kit keeps the list under `stages`.
3. **`delegates`: Who does the work.** Only when a stage runs a type or the words call for one: a row per type, ticked (`name="delegates"`, its value the type's name), with one line of its brief from their words, and its harness and model. For a shipped template, its own types with briefs fitted to the words; for `own`, the types you propose (a researcher for web-facing work, a writer).
4. **`place`: Place.** Only when the words hold a repository URL or a path, or the shape is code, and the project has no checkout yet (or the person asked to move it). One button calling `cawco.pickPlace()`; once picked the card reads "<label> — <path>" from `cawco.on("picks", …)` (`picks.place.value`). When the words hold a repository URL, the button calls `cawco.pickPlace({ clone: "<url>" })`, the card names the repository, and the folder picked is where the clone goes. Otherwise the project's folder on the hub is its place and no card appears.
5. **`routines`: Routines.** Only when the words name a rhythm ("Mondays", "every morning", "weekly"): each routine proposed with its schedule, ticked.
6. **`what-moves`: What moves.** Only on a pivot or a stages change with tasks standing: each task in a stage that goes, with the stage it will move to; each type no stage runs any more, offered to drop; each routine whose stage goes.

The page's one Send reads "Set it up". Done when the page is open and every part that applies is on it, and no other.

## 5. End your turn

The person changes what they want and sends the page when they are ready. Say nothing more until they do. A question answered after the page is open that changes the draft: revise the page in place with `artifact_update` (their edits are kept by name), saying what changed in one line.

## 6. After they send it

You hear that the page has new responses; `artifact_read()` has them in full. CawCo has already applied the `name`, the template kept under `shape` (its stages.md, its delegate types and its starter skills) and the `place`: leave those. A place to clone is cloning as you write; its result comes as its own notice. Cloned, say so in a sentence. Not cloned, tell the person git's reason in one sentence: the page keeps the pick, so their next Send tries again. Then, with `folder_write`:

- **stages.md** from the list kept under `stages`, in its order, each stage on its line: its name lowercased with each space as `-` ("Your call" is `your-call`), its kind, its hooks, then `icon: <glyph>` and `color: <colour>` when it has them. It must read cleanly; `folder_write` refuses it with the reason, which you fix.
- **delegates/<type>.md** for each type kept under `delegates`: front matter (harness, model, effort, role, lands) and the type's brief from their words. A shipped template's types are written already under their names; rewrite a brief only where their words change the work.
- **AGENTS.md** from the text kept under `aim`: what the project is and how its work is done, in CawCo's voice, no paths inside its sentences.
- On a pivot, move each task to the stage the person picked for it.
- Each routine they kept, made with `routine_create`.

Their Send is the approval of AGENTS.md and the delegate types: they commit as you write them, within this turn. Done when every file the page decided is written and reads.

Then answer in two sentences: what you set up, naming no paths. The board fills with the stages as you write them.
