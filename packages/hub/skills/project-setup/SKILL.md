---
name: project-setup
description: Set up a project with the person — its name, what it is for, its stages with their look, its delegates, its place and routines — drafted on one setup page (a Setup in a decision program) that their board draws as you write it, asking what their words leave open with `ask` as you go; write its files once they send it. Use when a project was just made with Caw (its first message is the person's words, or CawCo's notice of a project made from an offer), when the person asks to set the project up again, to change how it runs or one part of it, or says it should become something else.
---

# Setting a project up

A setup is one decision page, `setup`, that you open early and draft on, your questions asked as they come up, and that the person sends once. The project's board draws the page as you write it: what it is for, then each stage as a column the person changes where it stands, and Set up in the board's draft bar. Your open questions stand on the board on a desk and in your conversation on a phone. Nothing is written into the project before they send it: no stages.md, no delegate types, no AGENTS.md, no template. Their Send approves the whole page, so what you write from it goes in directly.

## When it applies

- **A project just made.** Your first message is the person's words about the project, or CawCo's notice that they made it from a session's offer. The words are theirs: read them for what the project is, never quote them back.
- **Set up again, or one part.** The person asks to change how it runs, or a part of it ("move it to my laptop", "rename the stages"): pass the parts they named in `project_setup`'s `change`.
- **A pivot.** The person says the project should become something else: the same page, with the **What moves** card.

## 1. Read the facts

Your first words come before any work on the page: the person watches an unnamed, silent project until you speak. Load `project_setup`, `project_name` and `ask` alone now (where tools load by search, all three in one search); the decision-page skill's LIBRARY.md and the page's tools wait for step 3.

Call `project_setup` (with `change` when the person named parts). It answers: the project's name and whether it is still the placeholder, the template tapped on New project (or none), every template a project is offered with its stages and delegate types, the current stages.md and tasks by stage, its places and the machines online, the fleet's accounts and the one its sessions start on, the hub's areas and the one it sits in, and the page's card ids with what Send applies for each. Done when you hold the facts.

Their panel shows your progress as four steps ticked from your own calls: `project_setup` (read), `project_name` (named), drafting, and the draft handed over (the page written and your turn ended). Make them in that order.

## 2. Name it and say what you read

While the name is the placeholder, call `project_name` with a short name of your own from their words ("Your PR team", "Docs site"), so the rail and the head show it as you speak. Then write one or two sentences in your own voice: what you understood the project to be, and that the board shows how it runs as you draft it. Done when the project is named and the person has read that the draft is coming on the board.

## 3. Open the page

The page is a decision program (the `decision-page` skill's LIBRARY.md), drawn by CawCo's own components: you give the data, never markup or styles. Its root is `Decisions("<name>", [setup])`, titled with the name alone (the page's Send carries "Set up <name>"), and its one `Setup`:

```
root = Decisions("Your PR team", [setup])
setup = Setup("Your PR team", "<what it is for and how its work is done, in your words>", [inbox, call, done], [writer], "own")
inbox = Stage("Inbox", "todo", "inbox", "cyan")
call = Stage("Your call", "you")
done = Stage("Done", "done", "done", "green")
writer = Delegate("writer", "Writer", "Drafts applications, posts and replies in your voice.", "Claude Code · Opus")
```

Pass it to `artifact_create({ kind: "page", name: "setup", does: "pick", ask: "Set up <name>", program })` as soon as you hold the aim and the first stages: the board draws it from then on, so the person watches the draft arrive. The Setup alone is a whole page, and the person sees it on the board. The person edits the aim in place, renames, re-kinds, restyles, reorders, adds and removes stages and sets who does a stage's work; the page keeps each change.

- **`Setup(name, aim, stages, delegates, shape)`.** `name`: the name you gave. `aim`: your restatement of what the project is for and how its work is done, never quoting the person: the seed of AGENTS.md. `shape`: the shipped template the stages start from, or `own`.
- **`Stage(name, kind, icon, color, hooks, line)`**, one per stage in order. Its name as the board reads it ("Your call", plain lowercase words after the first letter, no punctuation). Its kind (todo, active, waiting, you, done, dropped). Its look: a glyph you pick for what the stage is and a colour that groups stages of one kind of work, from the library's lists; no colour for a stage that needs none (dropped). A stage of kind `you` shows the Needs-you mark whatever its look. `hooks`: its stages.md hooks as written (`{runs: "writer"}`, `{after: "7d"}`), and `line` what they do in words ("Runs the writer"). Keep one stage of kind `you`.
- **`Delegate(id, name, brief, runs)`**, only when a stage runs a type or the words call for one: its type name, its label, one line of its brief from their words, and its harness and model. For a shipped template, its own types with briefs fitted to the words; for `own`, the types you propose (a researcher for web-facing work, a writer).
- **Place, area, account, routines and what moves** come as their own cards beside the Setup, only when they apply (a URL or path in the words or a code shape with no checkout; work for a client or product an area already groups; work that needs one account's connectors, like their Gmail or Drive; a rhythm in the words; a pivot with tasks standing): Decision cards from the library, with the ids `place`, `area`, `account`, `routines` and `what-moves`; the `area` card's options are area ids from `project_setup`'s Areas and `none`; the place's pick goes through `cawco.pickPlace()` as before. The `account` card's options are account ids from `project_setup`'s Accounts, the one whose connectors the work needs first, and `routing`.

Write it as a product's interface would: no line that restates what a control shows, none that reassures. Done when the page is open with the aim and the stages you hold so far.

## 4. Draft on the page, asking as you go

Draft the rest from their words: the stages, who does the work, the place, any routine. Add each part to the page as you draft it with `artifact_update`'s `statements`, a stage or a few at a time, so the board grows with your draft; what the person changed is kept. The page holds the Setup and the `place`, `routines` and `what-moves` cards; every question goes through `ask`, which stands it on the board and says whether it holds you up. Where the words leave something open that changes the draft, ask it with `ask` the moment you meet it, rather than guessing or holding it for the page:

- **`blocks: true`** only when the draft cannot go on without the answer; `waiting` names what is paused ("drafting the visa stages"). End your turn after it.
- **`blocks: false`** for everything else, with `meanwhile` saying the assumption you go on with ("drafting for LinkedIn and X"), then keep drafting.
- One question per call, two to four options each, the one you would pick first. At most three questions in a setup, none when the words are enough. Never ask what the page itself settles (the name, a stage's name or look, which types to keep).
- When a shipped template fits the work as they described it, ask whether to start from it (options: that template, and "Caw drafts the stages from what you wrote"), `blocks: false`, going on with your own draft meanwhile.

Each answer reaches you as a message. Fold it into the draft; when it changes something already drafted, say what you redo in one line ("Redrafting the posting stages for X alone"), then go on. An unanswered question stays open, your assumption kept. Done when the page holds every part that applies, and no other, and nothing that blocks is open.

## 5. End your turn

Hand the draft over in two sentences: where it is and what is next ("The draft is on the board: eight stages from Inbox to Done, the researcher on Researching and the writer on Drafted. Change any stage there, or tell me what to change. Set it up once it reads right."). Then end your turn: the person changes what they want and sends the page with Set up when they are ready. Say nothing more until they do. A question answered after the hand-over that changes the draft: revise the page in place with `artifact_update`'s `statements`, saying what changed in one line.

## 6. After they send it

You hear that the page has new responses; `artifact_read()` has them in full. CawCo has already applied the `name`, the template kept under `shape` (its stages.md, its delegate types and its starter skills), the `area`, the `account` and the `place`: leave those. A place to clone is cloning as you write; its result comes as its own notice. Cloned, say so in a sentence. Not cloned, tell the person git's reason in one sentence: the page keeps the pick, so their next Send tries again. Then, with `folder_write`:

- **stages.md** from the list kept under `stages` (or, when they changed nothing, the stages you drafted), in its order, each stage on its line: its name lowercased with each space as `-` ("Your call" is `your-call`), its kind, its hooks, then `icon: <glyph>` and `color: <colour>` when it has them. It must read cleanly; `folder_write` refuses it with the reason, which you fix.
- **delegates/<type>.md** for each type id kept under `delegates` (or every one you drafted, when they removed none): front matter (harness, model, effort, role, lands) and the type's brief from their words. A shipped template's types are written already under their names; rewrite a brief only where their words change the work.
- **AGENTS.md** from the text kept under `aim` (or your own, when they left it): what the project is and how its work is done, in CawCo's voice, no paths inside its sentences.
- On a pivot, move each task to the stage the person picked for it.
- Each routine they kept, made with `routine_create`.

Their Send is the approval of AGENTS.md and the delegate types: they commit as you write them, within this turn. Done when every file the page decided is written and reads.

Then answer in two sentences: what you set up, naming no paths. The board fills with the stages as you write them.
