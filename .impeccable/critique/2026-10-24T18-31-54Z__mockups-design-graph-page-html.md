---
target: design graph mockup, round 29 after the review fixes
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/bewinxed/.worktrees/cockpit-4ec8be00/.mockups/design-graph/page.html"
target_fingerprint: "sha256:5f3aa47650007e833c8e5c7ae06ac272909f7315a7f77647cc50bd8ed6ae8fea"
target_path: /home/bewinxed/.worktrees/cockpit-4ec8be00/.mockups/design-graph/page.html
timestamp: 2026-10-24T18-31-54Z
slug: mockups-design-graph-page-html
---
⚠️ DEGRADED: single-context (leaf delegate: no sub-agent tool exposed; Assessment A finished from rendered DOM and measurements before the detector ran)

Target: .mockups/design-graph/page.html (round 29, after the eight review fixes), 1440×900 and 390×844, light and dark.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Playback shows on three clocks at once (playhead, edge dash, stage); a held drag reads in coral; the empty foot band says nothing. |
| 2 | Match System / Real World | 3 | Motion vocabulary (ease-out, spring, response, bounce) is the motion field's common vocabulary; "Clip kinds" is a review word, not product copy. |
| 3 | User Control and Freedom | 3 | ⌘Z, Reset per clip and all, Esc folds the popover back; Starts/anchor editing left the popover (drag only). |
| 4 | Consistency and Standards | 3 | One handle grammar, one edge grammar, bare glyphs everywhere now; the 6-segment curve control is the one control unlike the kit's 2-4 segment ones. |
| 5 | Error Prevention | 3 | Detents snap a near miss onto a token; free values still allowed; no destructive acts. |
| 6 | Recognition Rather Than Recall | 3 | Facts drawn (curve glyph, figure, badge only on a token); icon-only zoom/Outline rely on tooltips. |
| 7 | Flexibility and Efficiency | 4 | H, ⇧1, ⌘Z, arrows on bars, separators and handles; double-press restore; flick settle. |
| 8 | Aesthetic and Minimalist Design | 3 | Hue mode puts four kind hues plus coral in the dock; the 28px foot band stands empty most of the time. |
| 9 | Error Recovery | 3 | Reset and undo; an invalid typed value reverts to the committed one silently. |
| 10 | Help and Documentation | 2 | Tooltips carry keys; nothing explains detents or the doors' meaning on first sight. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict
**LLM assessment**: authored for this product. The slab/doorway model, the corner arc that becomes the drag highlight, and a popover that grows from the fact pressed are specific to a state-machine graph beside a live stage; none is a stock dashboard part. Category-interchangeable risk is only in the dock's ruler and lanes, which read like any NLE timeline, rightly.
**Deterministic scan**: `impeccable detect --json page.html` exit 2, 2 findings, both false positives: `design-system-color` #000 at page.html:1973 is the alpha stop in a mask-image (edge fade), not a colour; `cream-palette` rgb(247,244,238) is the house `surface-recess` token by day (DESIGN.md). Round 29's earlier 1px-radius advisory is gone with the doors' new container.
**Visual overlays**: not injected; the leaf has no visible browser for the owner, and the page is a file:// static build.

## Overall Impression
The round now holds the house rules it broke (boxed icons, a coral row, doors over text) and every motion proves on one clock. The single biggest opportunity is the well's two door bands: right in principle, but they cost 56px of a 233px phone well whether a door stands there or not.

## What's Working
- The arc is one object at three lengths: 1.5px quiet at rest, 3px strong ink on reach (9.96:1 by day and 9.3:1 at night against the panel's edge ink), coral on drag; the hand reads where it is.
- The popover's box is measured to start on the fact's own rect and fold back into it; the source hides meanwhile, so the screen never shows two.
- Doors now live in the well's own bands: nothing of the graph is painted there (sampled every 4px), no slab text under a door at start, middle and end of the scroll.

## Priority Issues
- **[P2] Empty door bands**: the foot band is empty at rest on desk and phone (two bands are 56px of a 233px phone well, 24%). Why: dead space in the one view a phone has. Fix: give a band its height only while it holds a door, with hysteresis (show at "wholly out", hide at 28px back in) so it can't flicker. Suggested: /impeccable layout.
- **[P2] Phone slab wider than the view at zoom 1**: with the touch floor the graph never zooms itself below 1, so "Saving it" (407px, its back-edge lane included) is cut 34px at the left of a 370px view. Why: the kept machine never stands whole. Fix: on phones lay a machine out a rank per row (no side-by-side states) and route a way back inside the column. Suggested: /impeccable adapt.
- **[P2] Hue mode's four signals**: the dock shows teal, cyan, violet and coral at once; the teal (176) and cyan (205) bars measure 1.23 and 1.24:1 on the raised surface, so they are told apart by their edge alone. This is the owner's open switch; the ink-only option already answers it. Suggested: none (owner's pick).
- **[P3] The curve control has six segments**: past four short segments the kit moves to a list. Fix: keep the four glyphs and fold Spring and Custom into one "More" segment, or follow the kit to a list. Suggested: /impeccable distill.

## Persona Red Flags
**Alex (power user)**: no key to open the focused row's popover from the row itself (Enter on a bar works; a fact needs Tab to it).
**Jordan (first-timer)**: the doors' meaning (a room that way) is clear from name plus chevron; the duration detents' names are cut to those that fit (4 of 16 at 195px), so a detent can't be named until it is landed on.
**The operator, on the phone (project persona)**: hiding the graph is now a visible chevron that turns over; but the cut slab (above) makes the kept machine a pan away.

## Minor Observations
- `.fact.changed` keeps the apricot selection pair on an edited figure (chip-sized, under 40×24): the one coral-family fill left in the dock.
- The review bar's "Clip kinds" uses meta muted ink at 12px; fine for a review control, not product copy.

## Questions to Consider
- Should a band exist at all when its edge has no door?
- Is Spring a curve or a kind of length? The popover relabels Duration as Response for a spring, which suggests the latter.
