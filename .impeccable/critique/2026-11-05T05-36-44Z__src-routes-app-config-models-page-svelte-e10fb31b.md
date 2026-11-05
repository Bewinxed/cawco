---
target: Configure › Models CawCo uses
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/home/bewinxed/.worktrees/cockpit-3bdfce21/apps/dashboard/src/routes/(app)/config/models/+page.svelte"
target_fingerprint: "sha256:5cd77c26ab9a3fcb110baabe94311d3e34f14c46557ea1cf873ec907e7c1d8a2"
target_path: /home/bewinxed/.worktrees/cockpit-3bdfce21/apps/dashboard/src/routes/(app)/config/models/+page.svelte
timestamp: 2026-11-05T05-36-44Z
slug: src-routes-app-config-models-page-svelte-e10fb31b
---
⚠️ DEGRADED: single-context (design-pipeline runs critique in one context by its own rule)

Target: Configure › Models CawCo uses (apps/dashboard/src/routes/(app)/config/models/+page.svelte), judged on the /dev/models bench at 390, 1440 and 2529, with the Images group added.

Design specificity: grounded in the product: the machines are the owner's fleet by name and OS mark, each lack names its fix's place.

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 (Saving…/Saved in the head; per-machine readiness) |
| 2 | Match with the real world | 3 |
| 3 | User control | 3 (a pick is undone by the next pick; refusal restores) |
| 4 | Consistency | 3 (house OptionGroup, page's save-on-change) |
| 5 | Error prevention | 3 (only models the provider offers can be picked) |
| 6 | Recognition over recall | 3 |
| 7 | Flexibility | 2 (digits 1–3 pick while focus is in the group) |
| 8 | Aesthetic, minimal | 3 |
| 9 | Error recovery | 3 (hub's words + what calls still go to) |
| 10 | Help | 2 |
Total 28/40.

Priority issues (found on the first render, fixed in this run):
- P0 Machine rows on a phone squeezed the lack column to one character wide (four-column grid). Fixed: two-line rows, name over state, fix link trailing.
- P1 Every option's standing wore the attention hue, three warnings at rest. Fixed: attention hue only on the chosen provider.
- P1 The page's purpose line didn't name the new group. Fixed.
- P1 Headings skipped from h1 to h3 (detector). Fixed: labels are paragraphs referenced by aria-labelledby.
- P1 An unreachable hub's sentence was folded mid-sentence after a dash. Fixed: said as whole sentences.

Detector (http): line-length ~106 chars on the Jev note (existing), skipped-heading (fixed), cream-palette (the system's own ground, DESIGN.md).
