---
name: decision-page
description: Build a decision page in CawCo — decision cards the person picks on, with notes, media (pictures, Mermaid diagrams, canvases, live pages) and dials, written as an OpenUI Lang program and read back with artifact_read. Use when several choices need the person's pick before work goes on, when the user asks for a decision page, options to choose between, or a page of picks, or when a design needs tuning with dials.
---

# Decision page

A decision page is a **page** artifact whose source is a program in OpenUI Lang over CawCo's decision library: [LIBRARY.md](LIBRARY.md) holds every component, its arguments, the syntax and the revision rules. You write the program, never markup: CawCo draws it on the house card recipe in the panel beside your transcript, where the person picks, writes notes, pins comments and draws. Each pick is kept by its decision's id with the program's hash; you read the picks with `artifact_read`, and when the person sends you hear that the page has new responses. Picks never arrive as a message: you read them. A revision keeps every pick whose id it still has. In a project the program is also committed to `decisions/<name>/page.oui`, and a decision's `after` and its Section draw the project's decision graph.

## Steps

1. **List the decisions.** One Decision per choice the person must make, each with 2–5 Options and your recommendation marked. Give each decision and option a lowercase id that will not change (`hero`, `lead-mode`). Done when every open question has a decision and an id.
2. **Make the media it shows**, if any. A drawing is a canvas: `artifact_create` with `kind: "canvas"` and `mermaid` or `elements`. An animated mockup or anything drawn in HTML is a page artifact: `artifact_create` with `kind: "page"` and `html`; a running app is a preview, a component's states a sheet; Preview shows any of them live. A picture is a file: beside page.oui in your work folder, or a `generate_image` result named by its absolute path. A Mermaid diagram needs nothing made: its text goes in the program. Done when every Canvas and Preview has the id `artifact_create` answered.
3. **Write the program.** Read LIBRARY.md whole, then write `root = Decisions(…)` first, each Decision after it, its Options and its media. Give a decision `after` when it depends on another (`"page#id"` on another page), and put decisions that belong together in a Section. Done when every id is set and every statement is reachable from root.
   - **With pictures beside it**: write the program as `page.oui` in a work folder of your own (not the project folder), the pictures beside it.
   - **Without a shell or file tools** (a project's Caw): write `decisions/<name>/page.oui` into the project's folder with `folder_write`; name pictures by their absolute paths.
4. **Publish.** Call `artifact_create` with `kind: "page"`, `name: "<name>"` and `program` (or `dir` with your work folder; Caw: `kind` and `name` only). A program the hub can't keep is refused with every reason; a component outside the library is dropped and named in `dropped`. Done when the answer carries the page's `id`, its `decisions` and `opened: true`.
5. **Wait for the picks.** End your turn. When the person sends, you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. Without `since` it returns every pick in full, each with the hash of the program it was made on (`earlierRevision` marks one picked on an older version); dials come back as the `dials` entry's value, by panel name. Pass the `seq` it answered as `since` next time to get only what changed.
6. **Revise in place.** Call `artifact_update` with the `id` and `statements`: only the statements that change, merged by name (LIBRARY.md, Edit Mode). Every open view draws the new program in place with the person's picks, notes and pins kept, and the answer names what changed. Keep the ids of decisions that stay; a new id starts unpicked, and a removed one's pick is kept. To set or clear picks yourself, `artifact_update` with a JSON Patch over the state. Done when the answer names your change and the page still shows the earlier picks.

## When to write HTML instead

Write the page as HTML only when a pick is not an option: something the person places or operates to decide (a point on a map, a sample they drag into shape, a machine and folder from `cawco.pickPlace`). A choice between options stays a program, with media where it helps; a value the person tunes is a Dials component; an animated mockup is a page artifact shown with Preview. None of those makes the page HTML.

The HTML page is the kit's, beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, DialKit) and `scripts/` (preview, record).

1. In a work folder of your own, copy `kit/page.html` to `page.html` and write its cards and widgets to [RECIPES.md](RECIPES.md); animated mockups go in `mockups/<id>.html`, placed with `{{MK:<id>}}` and written to [CONTRACT.md](CONTRACT.md). Without a shell, write `decisions/<name>/page.html` (and its mockups) into the project's folder with `folder_write`.
2. With a shell, check each mockup: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders light at 1000px and dark at 360px and prints overflow and script errors; `--reduced` shows its still. `record.mjs` records one as a webm clip.
3. Publish with `artifact_create`, `kind: "page"`, `name` and `dir` (Caw: `kind` and `name` only). A page over 512 KiB, a placeholder the kit does not have or a missing mockup is refused with the reason. Revise by editing `page.html` and calling `artifact_create` again, or `artifact_update` with `html`; picks stay by choice id.
