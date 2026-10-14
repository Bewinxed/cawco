---
name: decision-page
description: Build a decision page in CawCo — a page of decision cards the person picks on, with notes and dials, published as a page artifact and read back with artifact_read. Use when several choices need the person's pick before work goes on, when the user asks for a decision page, options to choose between, or a page of picks, or when a design needs tuning with dials.
---

# Decision page

A decision page is a **page** artifact: one self-contained HTML page the hub builds from your `page.html`, keeps, and shows in the panel beside your transcript. Each click on an option is kept in the page's artifact with the page's hash; you read the picks with `artifact_read`, and when the person sends you hear that the page has new responses. Their picks never arrive as a message: you read them. Picks are kept by choice id, so a revised page keeps every pick whose id it still has. In a project the built page is also committed to the project's folder at `decisions/<name>/index.html`.

The kit lives beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, DialKit), `scripts/` (preview, record). The hub builds the page: it inlines the kit, your mockups and your images into one page when you publish.

## Steps

1. **List the decisions.** One card per decision the person must make, each with 2–5 options, the recommended one marked. Give each card a lowercase id that will not change (`hero`, `lead-mode`). Done when every open question has a card and an id.
2. **Write the page.** In a work folder of your own (not the project folder), copy `kit/page.html` to `page.html` and replace the example card with yours, following [RECIPES.md](RECIPES.md). Animated mockups go in `mockups/<id>.html` and are placed with `{{MK:<id>}}`; write them to [CONTRACT.md](CONTRACT.md). Done when the page holds every card and no example text is left.
   - **Without a shell or file tools** (a project's Caw): write the same `page.html` into the project's folder at `decisions/<name>/page.html` with `folder_write`, and mockups at `decisions/<name>/mockups/<id>.html`. Its images are the kit's Caw stills only.
3. **Check the mockups**, if you wrote any and have a shell: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders light at 1000px and dark at 360px, prints overflow and script errors. Done when both report no overflow and no errors, and `--reduced` shows a complete still.
4. **Publish.** Call `artifact_create` with `kind: "page"`, `name: "<name>"` and `dir: "<work folder>"` (Caw: `kind` and `name` only; the hub builds `decisions/<name>/page.html` from the folder). A page over 512 KiB, a placeholder the kit does not have or a missing mockup is refused with the reason. Done when the answer carries the page's `id` and `opened: true`.
5. **Wait for the picks.** End your turn. When the person sends, you hear "The page … has new responses since N": call `artifact_read` with the `id` and `since` it names. Without `since` it returns every pick in full, each with the hash of the page it was made on (`earlierRevision` marks one picked on an older version); pass the `seq` it answered as `since` next time to get only what changed.
6. **Revise in place.** Edit `page.html` and call `artifact_create` again with the same `kind` and `name`: the page is rebuilt and replaced in the panel, and its picks stay. Keep the ids of cards that stay; a new id starts unpicked, and an id you drop is still kept. To set or clear picks yourself, `artifact_update` with a JSON Patch over the state. Done when the revised page shows the person's earlier picks.

`record.mjs <work folder> <mockup-id>` records a mockup as a webm clip, for videos and docs.
