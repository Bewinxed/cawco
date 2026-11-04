---
target: the built onboarding routes
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/bewinxed/.worktrees/cockpit-76e43507/apps/dashboard/src/routes/(app)/project/new/+page.svelte"
target_fingerprint: "sha256:b500469a36b3b63bbf92465616125700fee58e691588824e7831e041e39fd26c"
target_path: /home/bewinxed/.worktrees/cockpit-76e43507/apps/dashboard/src/routes/(app)/project/new/+page.svelte
timestamp: 2026-11-04T11-05-12Z
slug: src-routes-app-project-new-page-svelte
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed to this leaf session; Assessment A was finished and recorded before the detector ran)

Target: `/project/new` and a project's first minutes on its board (`SetupBoard`, `SetupDraft`, `DraftColumn`, the house ask card on the board, `NewProject`), walked on the onboarding bench and `/project/new` at 1440×900 and 390×844 (touch), after round 5's fixes.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The draft bar names every state (drafting, waiting on an answer, drafted, set) and the setup steps tick; without a hub the hub band slides New project down 57px as it arrives |
| 2 | Match System / Real World | 3 | Plain words throughout; "Blocks work · … is paused until you answer" reads as system prose |
| 3 | User Control and Freedom | 3 | Every stage changes in place, a question can be dismissed; Set up has no way back from the board |
| 4 | Consistency and Standards | 3 | One question control at every width now; Project details' action labels stand 9px off their column |
| 5 | Error Prevention | 2 | Set up waits on open questions, but nothing says what Set up will write before it does |
| 6 | Recognition Rather Than Recall | 3 | Each stage says what its hooks do; the worker and look are a level away in ⋯ |
| 7 | Flexibility and Efficiency | 3 | Digits and Enter answer on a desk, the keys move to the next question |
| 8 | Aesthetic and Minimalist Design | 2 | Three stacked cards each titled "Question from Caw" over the draft; a coral Answer in each |
| 9 | Error Recovery | 3 | Faults stand under their row with Try again; New project's refusal keeps the words |
| 10 | Help and Documentation | 2 | Nothing on the board explains what a stage's kind does until its menu is opened |
| **Total** | | **27/40** | **Good, with gaps** |

## Design Specificity Verdict

**LLM assessment:** grounded in this product: the draft is the board it becomes, its columns travel into the real board on Set up, Caw's own setup steps tick in his panel, and the PR team's own stages carry their looks. The categorical parts are the ask cards stacked over the draft (any agent product's question card) and the tray width of Project details.

**Deterministic scan:** `impeccable detect --json` over SetupBoard, SetupDraft, DraftColumn, NewProject, TemplateCards, SetUpBar and the route: `[]` (exit 0). In-page detector (live server, injected into 6 views): `cream-palette` on every view (false positive: DESIGN.md's own page surface); `gradient-text` on the questions beat (the SetupWell live step's shimmer, the house's working-text motion, not decoration); `nested-cards` on the questions beat (the raised question cards inside the draft scroller; they float over the board as the composer's card floats over the transcript) and on the set beat (the board's column inside its scroller); `edge-flush-cards` on the set beat (the board's first column on the page's column edge, by design); `skipped-heading` on the set beat (h1 "Your PR team" then h3 "Inbox": the house TaskColumn's heading level).

**Visual overlays:** injected through headless Chromium; no human tab exists in this session.

## Overall Impression

The flow holds: words in, a named project, a draft that is the board, questions answered where they stand, Set up landing the real columns. The biggest remaining opportunity is the questions beat at 1440, where three full question cards push the draft itself below the fold.

## What's Working

- The draft as the board: every stage in view, changed where it stands, the same column shapes the board takes on Set up.
- One question control: the same card, the same Answer, the same stance line on a desk and a phone.
- The draft bar as the one place that says what is next, its action changing with the state.

## Priority Issues

- **[P1] The questions bury the draft at 1440.** Three cards (169px each) stand over the aim and the stages; the stages start below the fold. **Fix:** let the board's questions collapse to their question line once one is answered past, or stand them beside the stages on a wide column. **Command:** /impeccable layout
- **[P2] "Question from Caw" three times.** Each card repeats the title the region already says. **Fix:** on the board, the region names them once; each card leads with its question. **Command:** /impeccable distill
- **[P2] Project details' actions stand 9px off their column** (a ghost xs button's padding, "Declare where they live" at 392 against 383), now only on projects that hold code. **Command:** /impeccable polish
- **[P2] Set up doesn't say what it writes.** **Fix:** the drafted bar's hint names what the board, the notes and the delegates become. **Command:** /impeccable clarify
- **[P3] Heading order on the set board** (h1 then the columns' h3). **Command:** /impeccable audit

## Persona Red Flags

**Jordan (first-timer):** reads three question cards before seeing anything of the project; does not know the stage cards are editable until hovering one.

**Casey (distracted mobile):** arrives on the draft with the sheet away; the bar's Answer Caw is the one way to the questions, which is clear, but the three questions come one at a time in the sheet while the board says nothing of them.

**Alex (power user):** 1, Enter, 2, Enter answers down the board; the keys move on to the next question and, after the last, to Review the draft.

## Minor Observations

- With questions in view, the bar's Answer Caw is now the outline; the cards' disabled Answers still read as washed coral until a pick.
- Project details' tray is 512px wide beside a 1018px column, leaving a band; it is the house tray's measure.
- Without a hub, New project's band arrives 2s in and moves the page 57px; with a hub there is no band.

## Questions to Consider

- Does a question that holds nothing need a whole card on the board, or a line under the bar?
- Should Set up show what it will write before it writes it?
