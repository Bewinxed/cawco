---
target: "CawCo onboarding: New project and the project start"
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 7
target_identity: "file:/home/bewinxed/.worktrees/cockpit-b1ffe16d/apps/dashboard/src/routes/(app)/project/new/+page.svelte"
target_fingerprint: "sha256:b500469a36b3b63bbf92465616125700fee58e691588824e7831e041e39fd26c"
target_path: /home/bewinxed/.worktrees/cockpit-b1ffe16d/apps/dashboard/src/routes/(app)/project/new/+page.svelte
timestamp: 2026-11-03T05-26-10Z
slug: src-routes-app-project-new-page-svelte
---
⚠️ DEGRADED: single-context (this session is a leaf delegate with no sub-agent tool; Assessment A was finished and recorded before the detector ran)

# Critique: CawCo onboarding (New project, the wait after Send, the board before setup, the setup page, first run)

Target: apps/dashboard/src/routes/(app)/project/new/+page.svelte and the project page's first minutes (routes/(app)/project/[id]/+page.svelte, project/ProjectConversation.svelte, packages/hub/skills/project-setup/SKILL.md), read on the live dashboard at 1280, 390 and 2529 and in code. Mode: Operate.

## Design specificity
Grounded in the product: Caw's poses per template, the house composer, the board's own columns. What is generic is the wait (a stream of tool rows) and the setup page (a quiz of decision cards over what is really one draft).

## Heuristics (0-4)
| # | Heuristic | Score | Why |
|---|---|---|---|
| 1 | Visibility of system status | 1 | About 108 s between Caw's first words and the page show only tool rows; the Code card says "Needs a machine online" while the fleet is still being read (first paint at 2529). |
| 2 | Match with the real world | 2 | Tool names (project_setup, folder_write) and "Shape" for a PR team's stages. |
| 3 | User control and freedom | 3 | A second tap clears a card; nothing is written before the page is sent; a refusal restores the words. |
| 4 | Consistency and standards | 2 | Pick stages offers seven templates, New project six; two cyans and two greens on the cards; Caw's docked panel drew two composers on better-mobbin-mcp. |
| 5 | Error prevention | 2 | The board shows the code template's stages for a project not set up, inviting tasks into stages that then go. |
| 6 | Recognition over recall | 3 | Starters and cards are in view. |
| 7 | Flexibility and efficiency | 2 | Stages change only by a note to Caw (a model turn each). |
| 8 | Aesthetic and minimalist design | 3 | Calm, on the house tokens; the 2529 page sits in the upper half of a very tall field. |
| 9 | Help users recover from errors | 3 | Refusals in the error formula with Send again. |
| 10 | Help and documentation | 2 | Nothing says the work can simply be described. |
| | **Total** | **23/40** | |

## Priority issues
- **P0** The board draws the code template's stages (Ready, Working, Review, Done) for a project that is not set up (hub tasks.ts `stagesOf`, `source: "template"`): untrue on the board the person trusts.
- **P0** New project's Code card claims "Needs a machine online" with Check machines while the hub is still listing machines (`cawco.onlineMachines.length === 0` before the fleet is read): The Claim Of Nothing Rule.
- **P0** A preview, canvas or component in Caw's docked panel does nothing when pressed: the panel shows pages only.
- **P1** Nothing tells someone with work that fits no template that describing it is enough.
- **P1** The two-minute wait is shown as tool rows, with no sense of how far along it is.
- **P1** The setup page reads as a quiz (0 of 2 picked, Not picked) over parts Caw has already answered.
- **P1** Stages can be renamed in place but added, removed or reordered only by a note.
- **P1** The template cards' glyph hues repeat (cyan twice, green twice) and mean nothing.
- **P1** First run on the fleet board gives no steps to a first project.
- **P1** Pick stages lists seven templates, New project six.

## Persona red flags
- The person with the PR team: types a paragraph, sees Caw peek over Social with "Fits your prompt" (kept by their decision), and finds no word saying their own shape is fine.
- First-time operator: lands on a sleeping Caw and "Your sessions will land here." with no path to a project.

## Minor observations
- The composer's folded draft shows a sliver of its second line under "+2 lines" (New project with long words).
- At 2529 the New project column sits in the upper half of the screen.

## Detector
`impeccable detect --json` over the seven changed and surveyed files: `[]` (exit 0).

## Questions
On the decision page onboarding-design: describe-hint, card-hues, the-wait, board-before, setup-form, stage-edit, artifact-open, first-run.
