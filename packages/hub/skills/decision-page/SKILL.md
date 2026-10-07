---
name: decision-page
description: "Write a decision page: a visual page of choices the operator picks from in CawCo's preview (cards with options, mockups of how each would look, notes), published into the project's folder at decisions/<name>/. Use when a project needs the operator to choose between several paths, designs, tones or setups, rather than asking in chat; and to revise such a page while keeping the picks already made."
---
<!-- cawco-workflow:cawco-decision-page -->

# Decision page

A decision page lays out what needs deciding as cards: one line of why, how each option would look (a small animated mockup), and the options as buttons. The operator picks in CawCo's preview, adds notes, and presses Send picks; you get one message with every pick, and `read_choices` reads them any time. Picks are kept by CawCo per page, so they outlive your session and survive a new revision of the page as long as each choice keeps its id.

This folder (the skill) holds:

- `page.tpl.html`: the starting page, with a card of each kind, the progress bar and Send picks.
- `RECIPES.md`: the card recipes and the `window.cawco` script API. Read it before writing cards.
- `CONTRACT.md`: the rules every mockup follows. Read it before writing a mockup.
- `base.css`: CawCo's tokens and shared classes; build.py inlines it.
- `build.py`: builds the page folder into one self-contained `index.html`.
- `preview.mjs`: renders the page or one mockup to PNGs at 1000px light and 360px dark.
- `mockups/example.html`, `caw/`: an example mockup and Caw's stills.

## Steps

1. **Need a project.** A decision page lives in the project's folder; `decision_publish` refuses a session in no project.
2. **Start the page** in a scratch folder outside any repository, named for the decision (lowercase, dashes):
   `python3 <this folder>/build.py --init /tmp/decisions/onboarding`
3. **Write the cards** in `page.tpl.html`, from RECIPES.md. One question per card, two to four options, one marked Recommended when you have a view, and say why in the option's one-line span. Give each choice a short id (`voice`, `d3`, `hero`) and never change it in a later revision: the id is what keeps the operator's pick. Rename the words freely.
4. **Mockups**, where a picture beats words: `mockups/<id>.html` per CONTRACT.md, placed with `{{MK:<id>}}`. Check each with `node <this folder>/preview.mjs /tmp/decisions/onboarding <id>` and look at the PNGs.
5. **Build**: `python3 <this folder>/build.py /tmp/decisions/onboarding --title "Onboarding"`. It prints the choice ids; check them against the last revision's.
6. **Publish**: call the `decision_publish` tool with `name: "onboarding"` and `path: "/tmp/decisions/onboarding/index.html"`. It commits `decisions/onboarding/index.html` to the project's folder and opens it beside your transcript. Its answer says how many earlier picks the page kept, and names any picked id no longer on the page.
7. **Wait for the send.** Do not poll. When the operator presses Send picks you get one message listing the picks; `read_choices({ page: "onboarding" })` gives them in full, with the revision (content hash) each was picked on and any dials.
8. **Revise** by editing the same folder, building, and publishing under the same name. Keep every id whose question still stands; a new question gets a new id.

## Rules

- One self-contained file, at most 1 MiB: no external scripts, fonts or images (build.py inlines Caw's stills and base.css).
- Choices are marked in HTML (`data-cawco-choice`, `data-option`), never by your own click handlers; the overlay picks, marks and stores them.
- Use base.css's tokens and classes only; no literal colours. Coral means the operator's pick, status colours mean status.
- CawCo's voice (calm, precise, sentence case, no exclamation marks, no emoji). Card titles are questions; buttons are verb + object.
- After the send, act on the picks: file tasks, write the files they decide, or say what you will do. Quote the choice ids so the trail is clear.
