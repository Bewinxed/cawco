# Design Review: Phase 9b — Fleet assistant design on preserved shell

## Rendered Evidence (Step 0)
- Screenshots: `/tmp/rv9b.png` (1440×960 light), `/tmp/rv9b-dark.png` (1440×960 dark), `/tmp/rv9b-mobile.png` (390×960). All three read directly.
- Surface: the Outpost Assistant floating panel (empty/first-ask state) over a scrimmed, blurred session transcript (sidebar Fleet/Tools/Rules/Usage + "wire delegate row outcomes" transcript with a "You" and a "Claude Code" turn).
- Source: `mocks/v5-assistant.html` + `tokens.css` (DESIGN.md, LOCKED).

## Assessment B — Deterministic Detector
- Command: `node scripts/detect.mjs mocks/v5-assistant.html > /tmp/p9b-detect.json`
- Exit: **0 (ran)** · 16 rules
- Findings: **5, all `nested-cards`** (severity high as shipped) — lines 220 `a-logo`, 228 `a-orb`, 252 `a-composer`, 255 `a-plus`, 256 `a-send`.
- Opened only after Assessment A findings were frozen: **YES**
- Every one of the 5 is a control or mark inside a panel (logo mark, decorative orb, input composer, plus/send buttons), which is the documented false-positive class the dispatch and DESIGN.md §Never #1 pre-authorise: only a **uniform-padding card-in-card** is the banned form; a control inside a panel (the inset well idiom) is permitted. **Zero genuine uniform-padding card-in-card.** Each resolves to a **Note** with register justification (not a FAIL).

### Complementary deterministic evidence
- `mocks/verify.sh` → **`ALL DESIGN CHECKS PASS (P3+P4+P5+P6+P7+P8+P9b)`**; fresh build reproduces checked-in mocks byte-for-byte; checked-in PNGs are a fresh render of the HTML; v5-assistant carries 0 hand-typed colours.
- `mocks/v5assistantcheck.mjs` → **28 checks, 0 failures**: `shell 380x899/24/40/r16/h47/pitch44/scrim.06, action->undo/checkpoint (0 silent), non-positional cue, canon-gap labels`.
- Phase-5 approval gate (`v5-agent.html`) → **82 checks, 0 failures**: `approve/deny symmetric, no preselect/autofocus, fixed anchors, >=44px, scope-widen separated`.

## Triage
- Baseline (always-on): **visual (design-dna + checklists/ai-tells) + usability**.
- Dispatched: **ai-native** (agent/assistant surface, goal-taking, action contract, canon-gap labelling); **content-design** (real product copy — heading, description, suggestions, action list, refusal/scope voice).
- Not applicable: `data-viz` (no charts/tables on this surface), `behavioral`/`deceptive-patterns` (no conversion/persuasion mechanics), `journey`/`design-systems` (not this artifact's deliverable).
- Deferred (capped): none.

## Cross-Pillar Findings (ONE ranked report)
| Severity | Pillar | Problem (in the rendered pixels) | Principle | Fix |
|----------|--------|----------------------------------|-----------|-----|
| Note | detector | `a-logo`, `a-orb`, `a-composer`, `a-plus`, `a-send` flagged "card inside a card ancestor" (evidence verbatim: `<span class="a-logo"> is a card inside a card ancestor`, +4). All are controls/marks inside panels, not uniform-padding card-in-card. | ai-tells `nested-cards`; register-justified by DESIGN.md §Never #1 (only uniform-padding nesting banned; the inset well / control-in-panel is the signature move). | None required — documented permitted form; matches the 18-hit control false-positive pattern verify.sh already characterises. |
| Note | visual/composition | The orb empty-region occupies ~45% of the 899px panel; the actionable content (heading, 4 suggestions, action list) sits in the lower half. | Data-ink / composition balance (Tufte). | Register-justified: DESIGN.md §Expressive moments names the summoned orb as the single accent moment; the calm-budget register makes the empty space deliberate. Leave as-is. |
| Note | ai-native / content-design | DW-9b.2 action→undo/checkpoint rationale and DW-9b.4 canon-gap "principle-derived" labels + the four inference areas (streaming, latency, refusal, reasoning display) live in HTML source comments, not on rendered pixels; the surface shows only the four `undo`/`checkpoint` tags + "every action asks first, none is silent". | ai-native: "mark the canon gap in the deliverable" (comment satisfies it); the requirement explicitly accepts "the deliverable comment". | Acceptable as specified; noted so a pixel-only reader knows the canon-gap labelling is not on-screen. |

**Distinctiveness (ai-tells CHECKER, always-on):** PASS. The direction is nameable in 2–3 words — **DESIGN.md's direction**: a fully hueless graphite accent (no decorative hue anywhere), the never-flat gradient carried onto the logo mark and send button (top-light/bottom-shade), and a masked radial dot-grid behind the summon orb. These are choices a generic AI system would not make (the default would be a purple/blue accent and a flat tinted send button). Not competent-but-generic.

## Requirement Fulfillment

### DW-9b.1
PREMISE:  The measured shell is UNCHANGED — panel 380×899, inset 24 right / 40 top, scrim rgba(0,0,0,.06), suggestion pitch 44, radius 16, header 47.
EVIDENCE: CSS `.asst{top:40px;right:24px;width:380px;height:899px;border-radius:16px}`, `.asst header{height:47px}`, `.asst-scrim{background:var(--scrim-soft)}` (= `oklch(from --neutral-12 …/0.06)` ≈ rgba(0,0,0,.06)), suggestion buttons `height:40px` + `gap:4px` = pitch 44. `v5assistantcheck.mjs` prints `shell 380x899/24/40/r16/h47/pitch44/scrim.06` across 28 checks, 0 failures; rendered PNG confirms the right-inset floating panel over a soft scrim (top 40 / right 24 gap visible; bottom 899+40=939 < 960).
VERDICT:  PASS

### DW-9b.2
PREMISE:  Every action the assistant can take is enumerated and mapped to Phase 5's undo/checkpoint contract; zero map to silent; consequential actions carry the approval card.
EVIDENCE: The visible "What I can do — every action asks first, none is silent" list renders four actions, each with a reversibility tag: Open a session→**undo**, Spawn a session→**checkpoint**, Clear a blocked permission→**checkpoint**, Write a rule→**checkpoint**. The deliverable comment maps the three consequential actions to `[card]` (full approval card), and the Phase-5 card in `v5-agent.html` is verified symmetric/no-preselect/scope-disclosing (82 checks, 0 failures). None maps to silent (v5assistantcheck: `action->undo/checkpoint (0 silent)`).
VERDICT:  PASS

### DW-9b.3
PREMISE:  Distinguishable from a session transcript WITHOUT relying on position alone.
EVIDENCE: The assistant header carries a distinct **name** ("Outpost Assistant"), a distinct **orb mark**, and a persistent **"ASSISTANT" role pill** — all legible independent of the panel's position. The transcript surface behind it labels its actor **"Claude Code"** (and "You"), a different name and mark. Two AI surfaces separated by name/role/mark, not position. Rendered PNG confirms both labels are simultaneously visible.
VERDICT:  PASS

### DW-9b.4
PREMISE:  Every recommendation labelled principle-derived per ai-native's canon gap; the four uncovered areas (streaming, latency, refusal, reasoning display) marked as inference.
EVIDENCE: The DESIGN-DELIVERABLE comment block flags every recommendation `[principle-derived]` (Dibia; Wilson 2022; Smashing 2024) and marks STREAMING / LATENCY / REFUSAL / REASONING DISPLAY as `[designer inference]`. v5assistantcheck verifies `canon-gap labels` (28/0). Consistent with ai-native doctrine ("no settled canon — say so; mark the canon gap in the deliverable"). Comment-only (see Note above), which the requirement permits.
VERDICT:  PASS

**All requirements met:** YES

## Edge cases
- **Consequential action inherits Phase 5 in full (symmetry, no preselect, full scope disclosure):** PASS — `v5-agent.html` renders the symmetric Approve/Deny pair (equal box `flex:1 1 0`, no preselect/autofocus, Enter not bound to Approve), the machine/path/network/undo/future disclosure grid, and the separated scope-widening control; 82/0.
- **Two AI surfaces distinguishable at a glance:** PASS — distinct name + role pill + mark (DW-9b.3).
- **SCOPE — CUT suggestions absent:** PASS — the four rendered suggestions are "Why did spend jump today?", "Which sessions are stuck, and why?", "What did the delegate on mba-m3 conclude?", "Which sessions touched fleet-memory.ts?" — all cross-session KEEP items. **Neither "What needs me right now?" nor "Start a session" appears.** The body copy ("For anything inside one session, I point you to it rather than retell it") and the "Open a session the answer points to" action honor the point-don't-restate boundary.

## Notes (non-blocking)
- All 5 detector hits are the documented control-in-panel false positive (register-justified, DESIGN.md §Never #1). No genuine card-in-card.
- Orb empty-region consumes ~45% of the tall panel; deliberate per the "summoned orb" expressive moment.
- DW-9b.2/9b.4 rationale and canon-gap labels are in source comments, not rendered pixels — acceptable per the requirement wording.
- Pixel evidence was fully available (light + dark + mobile renders read); no coverage gap.

**Verdict: PASS** — All four DW items and every listed edge case met on the rendered surface; deterministic gates green (verify.sh ALL PASS, v5assistantcheck 28/0, Phase-5 gate 82/0); detector ran (exit 0) with only register-justified control-in-panel Notes; distinctiveness passes (nameable as DESIGN.md's direction). No blockers.
