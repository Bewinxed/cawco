---
name: project-setup
description: Set up a project with the person on one setup page — its name and aim, its shape (a shipped template or stages drafted from their words), its stages, delegate types, place and routines — then write its files once they send it. Use when a project was just made with Caw (its first message is the person's words, or CawCo's notice of a project made from an offer), when the person asks to set the project up again or change one part of it, or when they say it should become something else.
---

# Setting a project up

A setup is one decision page, `setup`, that the person sends once. Nothing is written into the project before they send it: no stages.md, no delegate types, no AGENTS.md, no template. Their Send approves the whole page, so what you write from it goes in directly.

## When it applies

- **A project just made.** Your first message is the person's words about the project, or CawCo's notice that they made it from a session's offer. The words are theirs: read them for what the project is, never quote them back.
- **Set up again, or one part.** The person asks to change the setup, or a part of it ("move it to my laptop", "rename the stages"): pass the parts they named in `project_setup`'s `change`.
- **A pivot.** The person says the project should become something else: the same page, with the **What moves** card.

## 1. Read the facts

Call `project_setup` (with `change` when the person named parts). It answers: the project's name and whether it is still the placeholder, the template tapped on New project (or none), every shipped template with its stages and delegate types, the current stages.md and tasks by stage, its places and the machines online, and the page's card ids with what Send applies for each. Done when you hold the facts and know which cards apply.

## 2. Name it and say what you read

While the name is the placeholder, call `project_name` with a short name of your own from their words ("Your PR team", "Docs site"), so the rail and the head show it as you speak. Then write one or two sentences in your own voice: what you understood the project to be, and that a page opens to confirm how it is set up. Done when the project is named and the person has read that a page is coming.

## 3. Build the page

Load the `decision-page` skill and build the page as HTML (its kit, `kit/page.html`, read with your Read tool): the name field, the stage names and the place are picks that are not options. Write `decisions/setup/page.html` with `folder_write`, then call `artifact_create({ kind: "page", name: "setup", does: "pick", ask: "Pick how this project is set up" })`. Write in CawCo's voice: sentence case, no "I", options named for what they do, no folder paths inside sentences.

The cards, in this order, each only when it applies, with exactly these ids:

1. **`name`: Name and aim.** A text field holding the name you gave, stored with `cawco.set("name", text)` on every edit. Under it, your restatement of the project in a paragraph of your own words, never quoting the person: what it is for and how its work is done. This paragraph is the seed of AGENTS.md. A note field: "What I got wrong". Always present.
2. **`shape`: Shape.** Options, each with its stages in one line of words ("idea, draft, review by you, scheduled, posted, measured"):
   - The tapped template, marked as the one they picked, when one was tapped.
   - With none tapped, the one or two shipped templates whose stages fit their words, and no others.
   - `own`, labelled "Caw drafts the stages from what you wrote", with the stages you draft under it. Recommend it when no template fits the work as they described it.
   Option ids are the template names from `project_setup`, and `own`.
3. **`stages`: Stages.** The picked shape's stages as a strip: each name in an editable field, each kind in words (to do, active, waiting, you, done, dropped), what each hooks ("runs the writer", "waits until post_at", "after 7 days"). Store the list with `cawco.set("stages", [{ "name": …, "kind": … }, …])` on every edit. Keep one stage of kind `you`. The person reshapes it by a note ("add a stage for waiting on the embassy"): revise the page in place with `artifact_update`, picks kept.
4. **`delegates`: Delegate types.** Only when a stage runs a type or the words call for one. Each type: its name, one line of its brief from their words, harness and model, several picks (`data-cawco-multiple`). For a shipped template, its own types with briefs fitted to the words; for `own`, the types you propose (a researcher for web-facing work, a writer).
5. **`place`: Place.** Only when the words hold a URL or a path, or the shape is code, and the project has no checkout yet (or the person asked to move it). One button calling `cawco.pickPlace()`; once picked the card reads "<label> — <path>" from `cawco.on("picks", …)` (`picks.place.value`). Otherwise the project's folder on the hub is its place and no card appears.
6. **`routines`: Routines.** Only when the words name a rhythm ("Mondays", "every morning", "weekly"): each routine proposed with its schedule.
7. **`what-moves`: What moves.** Only on a pivot or a stages change with tasks standing: each task in a stage that goes, with the stage it will move to; each type no stage runs any more, offered to drop; each routine whose stage goes.
8. **One question**, at most, as a plain decision card, when the words leave the shape open, with your recommended answer. None when the words are enough.

Done when the page is open and every card that applies is on it, and no other.

## 4. End your turn

The person picks and sends the page when they are ready. Say nothing more until they do.

## 5. After they send it

You hear that the page has new responses; `artifact_read()` has them in full. CawCo has already applied the `name`, the shipped template picked on `shape` (its stages.md, its delegate types and its starter skills) and the `place`: leave those. Then, with `folder_write`:

- **stages.md** from the stages they kept: the template's block with their names, or for `own` the block you drafted. It must read cleanly; `folder_write` refuses it with the reason, which you fix.
- **delegates/<type>.md** for each type they kept: front matter (harness, model, effort, role, lands) and the type's brief from their words. A shipped template's types are written already under their names; rewrite a brief only where their words change the work.
- **AGENTS.md** from the aim paragraph, corrected by their note: what the project is and how its work is done, in CawCo's voice, no paths inside its sentences.
- On a pivot, move each task to the stage the person picked for it.
- Each routine they kept, made with `routine_create`.

Their Send is the approval of AGENTS.md and the delegate types: they commit as you write them, within this turn. Done when every file the page decided is written and reads.

Then answer in two sentences: what you set up, naming no paths. The board fills with the stages as you write them.
