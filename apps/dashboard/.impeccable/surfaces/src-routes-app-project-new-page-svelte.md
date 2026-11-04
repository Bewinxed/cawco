---
version: 1
slug: "src-routes-app-project-new-page-svelte"
primary_target: "src/routes/(app)/project/new/+page.svelte"
related_targets: []
---

# New project and a project's first minutes

**Mode:** Operate. **Job:** someone arrives with work in their head (often work no template holds, like a personal PR team for job hunts, social media, visa applications and travel), says it in their own words, and within about two minutes confirms how Caw will run it. **Who arrives:** the one operator, on a desk most often, sometimes a phone.

**States:** fleet being read (nothing claimed); no machine joined (Add machine, words kept, Send held with its reason); none online (Check machines); a template picked (the field asks what that work needs); sending (the words stay in the field, the template row and examples hold still); refused (words back, the reason over them, Send again when the hub was not reached); then on /project/<id>: sent (the rail and head say New project, naming), named, Caw's first words, drafting (stages arriving on the board, skeletons for those to come), a question holding him (the draft bar says so, Answer Caw), questions open that hold nothing (Answer Caw beside the line), drafted (Set up <name> once no question is open), set (the board with its stages); a setup left unfinished; a reload at any point lands at the same place.

**Widths:** 390, 680, 1440, 2529.

**Untouched:** the agent side (the person's words are the whole message, the project-setup skill and project_setup data tool, Caw names the project, nothing written before Set up, only a tap picks a template), the design graph, the iOS app.

**Verdict (2026-11-04):** scrap the first minutes (where the draft is reviewed, where his questions stand, the not-set-up scene), streamline New project, keep the first-run row. Decision page `onboarding-first-minutes`: `draft-where` (recommended: the draft drawn as the board it becomes), `asks-where` (recommended: his composer on every width), `new-under` (recommended: one quiet template row), `template-alone` (recommended: a template shapes the words, it starts nothing alone). Answers: pending.

**Prior picks kept:** typed examples once; tap-only pick; Caw names it; Caw at work in his panel with the setup's steps under him; stages shaped directly with a glyph and colour Caw suggests; first-run row "Looks right".

## Decided on this branch, kept here (DESIGN.md was cut on main to its law)

**Caw's panel on a project's page: Assistant and Preview.** The project's conversation docks beside the page (`project/CawFloat`, `ProjectConversation`). While it has something to show (a preview, a canvas, a component, a page), an Assistant | Preview switch (`fluid-tabs`) stands at the top right of the panel's bar (decision page `onboarding-design`, card `artifact-open`): at the end of his head on Assistant, and before Close in the preview's own bar on Preview (`PreviewPane`), so the panel keeps one bar. Caw showing something brings Preview to the front; a press on its card in his transcript does too. On Preview the panel widens, morphing: docked beside the board its column takes `2 × c-panel-w` while one board column stands beside it; docked under the page on a narrow desk or a tablet its row takes three quarters of the height; the page's grid tweens over `--dur-panel` on the drawer curve, at once under reduced motion. On a phone his sheet stands at the screen's height under its top inset. In the board way of the first minutes the setup page is the board, so it never opens here.

**One live Caw (was the Flock Rule).** A page has one live Caw: his status mark where his seat stands, or his setup element in his panel while he drafts (`project/SetupWell`), when the seat shows the folder glyph instead. His panel's hero, with no conversation yet, is headed by its own glyph. A project's board before it is set up holds no more of him: every way of the first minutes dropped the stills its floor held (on the roost-dark ground they read as wings alone).

**Stage marks.** A stage may carry a look in stages.md (`icon:`, a word from core's `STAGE_ICONS`; `color:`, one of core's `STAGE_COLORS`: cyan, amber, orange, green, never a status hue): its column's head leads its name with that 16px duotone glyph in its hue (`tasks/stage-look.ts`). A stage with no look keeps its mark's slot: its kind's glyph in the muted ink, so every name stands on one edge. A `you` stage keeps the Needs-you glyph whatever its look. A stage's kind reads in one wording everywhere, draft and board alike (`setupPageWords.kinds`).

**The draft as the board (way `board`).** `project/SetupDraft` in the board's place: the house draft bar (held on a question: Needs-you glyph, "Caw is waiting on your answer", Answer Caw; writing: live dot and what he does, Answer Caw while questions are open; drafted with questions open: Answer Caw, Set up held back; drafted and answered: Set up <name>), the aim as the prose Textarea, the stages as `DraftColumn`s wrapping into rows at the board's column width (`c-draft-col-h` tall), skeletons for stages coming, Add a stage last (its stage takes a glyph and the caret, in view). On a touch screen a stage's Glyph and Colour open in place in its menu, never as a side flyout. Each column carries `data-share="stage:<name>"`; on Set up the board's TaskColumn lands from it.

**Caw's questions.** The house ask card over his composer on every width; after an answer the next card takes the focus, so a digit answers it; the question's own line is never faded by the body's edge mask while the body does not scroll.

**P0/P1 backlog:** the critique snapshot of 2026-11-04 (21/40; 2 P0, 4 P1) and the two cold reviews 231ba45d and 3c75c466 (all fixed on the branch, `design-run.md`).

## Direction contract
direction: inherits DESIGN.md
