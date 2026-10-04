# New Session Composer

## 1. Layout

Above 600px the modal is 640px wide and centered on both viewport axes. It uses the app Dialog parts and bits-ui focus management, `--surface-raised`, `--radius-modal`, and `--shadow-modal`. The recessed prompt uses `--surface-well`. These two semantic aliases resolve to the existing field surface and overlay shadow in app.css. The authoritative design file is `/DESIGN.md` at the repository root.

There are two regions: a borderless prompt well with at least eight rows, and a composer region with a reserved error-reading slot and one 40px flex row. The placeholder is "What should the agent do?". Focus changes the well's inset edge and ink. Start remains anchored right through all selections. Chips and the prompt well have no hairline; buttons, inputs and popovers carry the 1px `--border-control` edge.

At 600px and below, the modal is a full-width bottom sheet with rounded top corners, flush bottom corners, and safe-area bottom padding. The prompt starts at six rows and can shrink within the available viewport. The app's `interactive-widget=resizes-content` declaration is supplemented by a modal-scoped visual-viewport listener; both the sheet and mobile panels stay inside its height and offset.

The mobile composer has two 44px rows separated by 8px. The first contains model, last directory segment, and mode, including all labels. Labels can reach 22ch before ellipsis. The row has 16px edge padding and scrolls horizontally without a scrollbar when needed. The second contains a flexible effort slider (minimum 160px, 20px icons), a 44px options target, and Start (minimum 96px wide). All touch targets are at least 44px. Mobile pickers occupy the available viewport, with a Back control, three equal agent tiles, and 48px model rows.

## 2. Composer Bar

In order: agent/model pill, location pill, mode pill, effort slider, options, Start.

- Agent/model shows the harness's actual 16px logo and the canonical model name. Its single popover contains three ToggleGroup agent tiles, then the model search/list. Uninstalled harnesses are disabled with a machine-specific accessible reason.
- Location shows machine status and a shortened path. It opens LocationPicker.
- Mode shows a Solar icon and short name. Its popover contains four RadioGroup rows. Bypass all uses `--status-attn-bg` / `--status-attn-ink` on the trigger.
- Effort uses a 150px bits-ui Slider with five 16px Solar detents. Inactive icons use full-opacity `--ink-muted`; the active filled icon rides an 18px spring thumb in `--brand-solid`. The visible 4px track uses `--border-control`. Hover/drag shows the level name. Null shows the harness-measured model default in muted ink and remains omitted from the payload; when unmeasured, it shows high where supported or the first supported level. Unsupported effort collapses inside a reserved slot.
- Options contains two app Switch controls: Scratch and Bootstrap. Scratch maps to the existing scratch payload. Bootstrap opens the repository location picker.
- Start is the primary button (`--action-surface` fill, `--on-brand` text, hover `--action-surface-hover`), with the keyboard hint.

Pills are transparent, with `--surface-hover` on hover and `--surface-fill` while open. Selected agent tiles and rows use a 12% `--brand-solid` tint with `--ink-strong` text; the travelling hover/keyboard highlight uses `--surface-hover`. Brand is reserved for selection, effort, enabled switches, and Start. Identity logos retain their own colours.

## 3. Interaction

Prompt receives initial focus. Cmd/Ctrl+Enter submits. Escape closes the topmost popover before the dialog; focus returns to the trigger. The Dialog and Popover primitives own focus trapping and dismissal.

Start is gated while a popover is open, location is unreadable or unverified, a submission is busy, or the hub is unreachable. A stale saved location cannot overwrite a newer user choice. Changing machines selects an installed harness if the previous harness is unavailable.

## 4. Motion

DialKit controls the scrim, card scale .96 to 1 and fade, prompt arrival, pills staggered left to right, then Start. The live demo retains its parameter subscription and scrubbable timeline; changing either replays the sequence. DialRoot and DialTimeline mount only at widths of at least 481px.

Mobile uses the same card clip for an upward slide and fade after the scrim begins. Reduced motion places the sheet directly at its resting position.

Popover scale, list highlight, effort thumb, switch thumbs, and model row springs derive from `springFromVisual`. On each harness change old rows leave left with a stagger, then new rows enter from the right with a stagger. Highlights snap to the selected row on mount and fade in. Reduced motion jumps springs to their end states and removes delays.

## 5. Model Naming And Ordering

`deriveModelEntries` is pure over `models.forHarness(harness)`:

1. Canonical ID is `resolvedModel ?? value`. Dedupe by ID, merging supported effort levels and release dates. Aliases collapse into canonical entries. The entry resolved by `default` carries the default tag.
2. Names derive from canonical IDs. Route prefixes become provider metadata; strip `claude-`, title-case the family, join numeric version tokens with dots, and render `[1m]` as ` · 1M`. Examples: `claude-opus-5[1m]` becomes "Opus 5 · 1M"; `claude-fable-5-1` becomes "Fable 5.1"; `deepseek-v4-pro` becomes "DeepSeek V4 Pro". Unknown families use merged displayName or a monospaced ID.
3. Group order: New since the last spawn; Recent by last-used descending; All by released descending with undated last; Typed remembered custom IDs. Record model use only when a session starts.
4. A row contains provider logo, model name, an optional default tag, and a known release date at the right in muted ink. Release timing is relative to the last model use, falling back to the last harness use; without usage history it is relative to today. Unknown dates have no placeholder. Provider text, max support, and separate last-used trailers are omitted.
5. One search matches name, canonical ID, aliases, and provider. An unmatched ID-shaped query is a selectable Typed/custom row; Enter selects it and remembers the ID.
6. Submit the canonical ID after selection. Untouched model is `""` internally and omitted from the wire payload.

## 6. Location

Location is `{ machineId, cwd, repo? }`. Search spans machine names, project names and paths across every machine. Results include Projects, Recent and Browse. Selecting a cross-machine result moves the machine selection. Project prefill remains locked until Edit.

A query starting `/` or `~` browses children of its longest existing prefix, filtered by the tail. Tab completes; Enter accepts the typed path after verification. `inspectMachine` and `machineFs(list)` verify readability. Inspection runs after 600ms and again before spawning. Unreadable locations display a path error and block submission. Repository mode supports reported repositories and typed URLs.

## 7. Submission

Snapshot every submission input before asynchronous work. Closing invalidates the submission generation. Recheck the generation after directory verification, project creation, and exit animation.

Preserve createProject-before-spawnSession ordering when saveAsProject is selected internally. Spawn receives machineId, workdir, prompt, harness, permissionMode, optional model/effort, scratch `{ worktree, baseCwd }`, bootstrap `{ repo, baseDir }`, and projectId. `spawnSession` sends the spawn frame and then a separate prompt send frame. Store preferences and model usage after spawning.

The composer exposes only Scratch and Bootstrap switches. Worktree and Save as project remain in the submission logic but have no composer controls.

## 8. Verification

`apps/dashboard/scripts/new-session-checks.mjs` intercepts the dashboard WebSocket and API writes. It never connects a spawn socket to the hub. Checks cover centering, fixed bar/card bounds, popover containment, all harness logos, canonical/custom/untouched payloads, keyboard submission, cancellation, invalid paths, options, and reduced motion. Stagger is sampled at `3 * stagger + 60ms` from entry of the new list. Any page error makes the script exit non-zero.

Mobile gates cover row heights, label readability (full text or at least eight characters before ellipsis), 44px touch targets, Start width, sheet overflow, full-viewport panels, and a 390x500 keyboard simulation. `NS_DESKTOP_BASELINE=1` captures the desktop reference; `NS_DESKTOP_COMPARE=1` verifies an identical desktop PNG.
