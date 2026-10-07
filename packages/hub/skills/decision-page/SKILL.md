---
name: decision-page
description: Build a decision page in CawCo — a page of decision cards the person picks on, with notes and dials, kept by the hub and read back with read_choices. Use when several choices need the person's pick before work goes on, when the user asks for a decision page, options to choose between, or a page of picks, or when a design needs tuning with dials.
---

# Decision page

A decision page is one self-contained `index.html` in the project's folder at `decisions/<name>/`. CawCo shows it beside your transcript; each click on an option is stored in the hub with the page's hash; you read the picks with `read_choices` and get one message when the person sends them. Picks are kept by choice id, so a revised page keeps every pick whose id it still has.

The kit lives beside this file: `kit/` (page shell, CSS on CawCo's tokens, Caw stills, DialKit), `scripts/` (preview, record). The hub builds the page: it inlines the kit, your mockups and your images into one `index.html` when you publish.

## Steps

1. **List the decisions.** One card per decision the person must make, each with 2–5 options, the recommended one marked. Give each card a lowercase id that will not change (`hero`, `lead-mode`). Done when every open question has a card and an id.
2. **Write the page.** In a work folder of your own (not the project folder), copy `kit/page.html` to `page.html` and replace the example card with yours, following [RECIPES.md](RECIPES.md). Animated mockups go in `mockups/<id>.html` and are placed with `{{MK:<id>}}`; write them to [CONTRACT.md](CONTRACT.md). Done when the page holds every card and no example text is left.
   - **Without a shell or file tools** (a project's Caw): write the same `page.html` into the project's folder at `decisions/<name>/page.html` with `folder_write`, and mockups at `decisions/<name>/mockups/<id>.html`. Its images are the kit's Caw stills only.
3. **Check the mockups**, if you wrote any and have a shell: `node <this skill>/scripts/preview.mjs <work folder> <mockup-id>` renders light at 1000px and dark at 360px, prints overflow and script errors. Done when both report no overflow and no errors, and `--reduced` shows a complete still.
4. **Publish and show.** Call `show_preview` with `page: "<name>"` and `dir: "<work folder>"` (Caw: `page_show` with `page`). The hub builds `page.html`, commits it to `decisions/<name>/index.html` and opens it; a page over 512 KiB, a placeholder the kit does not have or a missing mockup is refused with the reason. Done when the tool answers that the decision page opened.
5. **Wait for the picks.** End your turn. When the person sends, you get one message listing every pick and note; `read_choices` (or `read_choices` with `page: "<name>"` once the preview is closed; Caw: `page_choices`) returns them in full, each with the hash of the page it was made on. An entry marked `earlierRevision` was picked on an older version of the page.
6. **Revise in place.** To change the page, edit `page.html` and publish to the same `page` name. Keep the ids of cards that stay; a new id starts unpicked, and an id you drop is still kept in the hub. Done when the revised page shows the person's earlier picks.

`record.mjs <work folder> <mockup-id>` records a mockup as a webm clip, for videos and docs.
