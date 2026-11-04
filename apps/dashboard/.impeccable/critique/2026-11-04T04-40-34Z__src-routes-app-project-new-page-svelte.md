---
target: New project and a project's first minutes
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 4
target_identity: "file:/home/bewinxed/.worktrees/cockpit-76e43507/apps/dashboard/src/routes/(app)/project/new/+page.svelte"
target_fingerprint: "sha256:b500469a36b3b63bbf92465616125700fee58e691588824e7831e041e39fd26c"
target_path: /home/bewinxed/.worktrees/cockpit-76e43507/apps/dashboard/src/routes/(app)/project/new/+page.svelte
timestamp: 2026-11-04T04-40-34Z
slug: src-routes-app-project-new-page-svelte
---
### Critique

⚠️ DEGRADED: single-context (the design-pipeline runs critique single-context; a leaf may delegate
only to `browser`).

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Drafting said five ways; nothing shows what the board will be until the page opens |
| 2 | Match system / real world | 2 | "Fits your prompt" on Social for a PR team; kind words and minus rows read as settings |
| 3 | User control and freedom | 3 | Words kept on refusal and reload; questions dismissable; Add back for removed stages |
| 4 | Consistency and standards | 1 | Questions on the board on a desk, in the composer on a phone; setup page in a design-tool toolbar |
| 5 | Error prevention | 3 | Nothing written before Set up; Send held with no machine |
| 6 | Recognition rather than recall | 2 | The setup is confirmed as a list, then seen as a board |
| 7 | Flexibility and efficiency | 2 | Chips, cards and typed examples are three ways to the same start |
| 8 | Aesthetic and minimalist design | 1 | Seven Caws on New project; crow floor; five status signals; void board at 2529 |
| 9 | Error recovery | 3 | Refusals carry their reason and Send again |
| 10 | Help and documentation | 2 | Caw's first sentence is the only "here is what I understood" |
| | **Total** | **21/40** | Acceptable, below the bar |

Design specificity: authored for CawCo (Caw, the board, the ledger); the incoherence is
structural, not generic styling.

Detector: `impeccable detect --json` over NewProject, TemplateCards, SetupScene, SetupWell,
SetupAskCard, CawFlock, FirstRun, StepRow, Setup.svelte, host/setup/, the bench: exit 0, `[]`.
Browser overlay (detect.js injected through the live server, stopped after): New project 1
(cream-palette: false positive, DESIGN.md's warm paper); questions beat 5 (cream-palette;
gradient-text: the transcript's shimmer label, a house recipe; low-contrast 3.4:1 #8d8a86 and
2.4:1 #aba7a1 on #fefdfa: SetupWell's pending steps and the transcript's head fade; nested-cards:
the ask cards inside the board's scene card); setup page 1 and first run 1 (cream-palette).

Priority issues:
- **[P0] Two places for Caw's questions by width.** Desk: floating cards over the board; phone:
  the composer's ask card. One act, one place: the composer dock on every width (Cofounder and
  Relevance AI ask there).
- **[P0] The setup is confirmed as a list that looks nothing like the board it makes.** The
  person reviews a settings list in a design-tool panel, then meets a board. Draw the draft as
  the thing it becomes.
- **[P1] The template hint misreads the work.** The PR team's words fit "Social" (rule
  `/\b(?:posts?|social)\b/`), Caw leaves the hero for that card, and coral marks it: advice in the
  action's colour (The Coral Is Where You Act Rule).
- **[P1] New project's page is mostly templates.** Six 290px illustrated cards and four chips under
  a field whose job is "say it"; chips duplicate cards and examples; chip rows misalign.
- **[P1] The wait says one thing five times and the board says nothing.** Tool rows with "cawco",
  Moonwalking, the doing line, the step list, the board's line; the board is a void with stills.
- **[P1] The setup page's resting rows carry destructive and form chrome.** Eight red minuses,
  sort glyphs and drag dots at rest; kind as a form value; a keycap on a phone.
- **[P2] Dark scheme: Caw's stills vanish on the roost-dark floor.**
- **[P2] SetupWell's pending steps at 2.4:1 and 3.4:1.**

Persona red flags: Jordan (first-timer) reads "Fits your prompt" as an instruction and taps
Social. Casey (phone) sees questions in the dock, then on a tablet sees them on the board. Sam
(screen reader): the four stills are hidden (good), but the board's "Open the setup page" is
disabled with its reason in a separate line above.

Questions: what if the draft were the board, drawn as he writes it? What if New project were
the field and nothing that competes with it?

### The walk (the PR team)

**1. Say the work.** They land on New project: Caw at 80px, "What are we working on?", the field
typing its examples, four starter chips (a repo, a Q4 launch, page audits, a brand kit) and six
template cards, each 290px tall with a Caw illustration, which is most of the page's area. They
type "set up a new project to be my personal PR team… job hunts, social media and others, visa
applications and travel". 300ms later the hero Caw leaves and reappears peeking over **Social**,
which now reads "Fits your prompt" in coral. Their work is not a social-media project; the page
has just told them it is, in the colour that means "act here". What stands in the way: the
chips and cards say "pick a shape" on a page whose one job is "say it in your words"; the chips
repeat the cards and the typed examples; the second chip row starts at the field's left edge
while the first row is centred under it. Not earning its place: the chips, the 290px art, the
peek, seven Caws on one page.

**2. Wait while Caw drafts (about two minutes).** Send lands on the project page. The rail says
"New project" twice (Working, Projects). The board, the largest area, says "Not set up yet / Its
stages show here once you set it up / Caw is drafting it." over a disabled "Open the setup page",
with four Caw stills on its floor (on dark, the stills' black bodies vanish into the ground; only
their red wings show). Caw's panel shows their words as a bubble, then "Project setup cawco" and
"Project name cawco" tool rows, a "Moonwalking" line, then his setup element: a 64px Caw, "Reading
what you wrote", and four steps. The same state is said five times (panel head "Working",
Moonwalking, the doing line, the step list, the board's "Caw is drafting it"). What they want to
know (did he understand me, what will it look like, when do I act) is answered only by his first
sentence, between two tool rows. At 2529 the board is a 1500px void.

**3. Answer his questions.** On a desk three cards float over the board's middle, all at once,
each with outline-button answers and a line about what is paused; the panel says "Waiting on your
answer". On a phone the same questions are the house ask card docked over his composer, one at a
time, "1 of 3", with Answer and Dismiss. Same act, two places, two looks, by width. The board's
cards hold no "type your own" except "Other"; the composer under the panel is where words go.

**4. Review and confirm the setup.** The board's button opens the setup page in his panel's
Preview tab, which widens over the board and brings the artifact toolbar: page menu, add, open
out, pointer / comment / pen, Comments, reload, Assistant | Preview, Close. The board behind it
still says "Not set up yet" with "Open the setup page" (already open). The page itself is the PR
team's name, its aim as a paragraph, then eight rows each with a red minus, an icon tile, the
name, the kind word, a sort-arrows glyph and drag dots, and a delegate list beside it; "Set up
Your PR team Ctrl ↵" floats at the foot (the keycap shows on a phone too). Eight red minuses at
rest is a delete affordance on every row; the kind word plus its glyph reads as a settings form.
Nothing on the page looks like the board they will get, so they confirm a list, then meet the
board.

**5. Set.** The board appears with its columns (three visible of eight at 1440), each empty and
full height; Caw says what to do first. This beat works; the jump from list to board is the cost
paid in step 4.

**6. First run on the fleet board.** "obelisk joined. Caw runs here now." over a card "Your first
project / Onboarding · 1 of 4 done" whose steps are sign in to a harness (coral Sign in), the
stream relay (Set up / Later), make your first project. The title promises a project; three of
four steps are fleet setup. It holds as a checklist and the person passed it ("Looks right").
