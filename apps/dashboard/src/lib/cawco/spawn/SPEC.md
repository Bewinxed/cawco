# New Session

The modal that starts sessions, opened from the Shell (`new-session.svelte.ts`). PRESERVE.md records its contracts with file and line; this is the shape of it. The authoritative design file is `/DESIGN.md` at the repository root.

## 1. Layout

Above 640px the modal is a centred card, `min(980px, 100vw - 48px)` wide and at most `100dvh - 48px` tall, on `--surface-recess` with `--radius-lg` and `--shadow-modal`. It has a head (the "Sessions · New" or "Sessions · Continue" title and Close), a scrolling body on `--surface-raised`, and a footer with Cancel and Start. Head and footer stay in view; the body scrolls when the card is capped.

The body holds the "New Session" heading, then the First prompt section: the prompt editor and the composer chips in one field, with a one-line reading slot under them for location and start messages. Below it is the Model section, or on a continuation the "Summarise with" and "Continue on" model sections side by side.

At 640px and below the modal is the kit Drawer: a bottom sheet with rounded top corners and safe-area bottom padding that follows the finger from its header. It stays inside the visible viewport above a keyboard, with the header and Start on screen and the body scrolling. Continuation's model sections stack.

## 2. Composer

- The prompt is a contenteditable editor, 44px at rest and 120px while focused, filled or showing a menu (120px on phones), with the placeholder "What should the agent do first?". `@` offers machines and projects and `/` offers skills and plugins as inline chips, which are sent as `@name` and `/name`. On a continuation the source session is the editor's leading chip; deleting it turns the form back into a plain New Session.
- The chips, 30px and wrapping:
  - **Machines**: multi-select, plus Connect a machine.
  - **Project**: pick, clear or create.
  - **Location**: Existing files or Clone from GitHub, with a directory browser over the machine's filesystem.
  - **Lifetime**: keep the session, or let it end with its task.
- On a coarse pointer the chip rows open to 14px apart so each touch area reaches 44px.
- Several machines make Start read "Start N sessions" and start one session on each.

## 3. Model

- The Model section has a harness rail (Claude Code, OpenCode, Pi; Codex shown as coming soon; harnesses missing on the machine marked "not installed"), one search field that also takes a custom model id, and a fixed 300px model list.
- Rows show the provider tile, the canonical name, the id and the context size.
- The chosen model carries its tool chips:
  - **Effort**: a pip track with the level on its fill. Untouched it shows the model's measured default or "Default", and is omitted from the payload.
  - **Permission mode**: one row per mode the harness offers. Full Send is confirmed in the app's confirm dialog every time it is picked, and a warning stands beside Start while it is chosen.
  - **Account**: when the provider has two or more accounts. Auto with placement's reason, or a pick for this session only.

## 4. Interaction

The card takes focus on open. Cmd/Ctrl+Enter starts from anywhere in the form. Escape closes the topmost popover before the dialog, and focus returns to its chip, or to the prompt after a location is committed with Enter. Every chip's popover is one shared portaled surface that glides between chips. Scrolling the body closes an open popover.

Start is gated while:
- the location is unverified or unreadable;
- a chosen machine is offline;
- no machine is chosen;
- the hub is unreachable;
- the repository is malformed;
- no Claude account can take the session;
- a continuation will not fit.

A missing folder is announced in the reading slot as one Start creates. Changing machines selects an installed harness if the current one is unavailable.

## 5. Motion

The scrim fades in over `--dur-panel`. The card rises 6px and fades in over `--dur-panel` on `--ease-out`, and leaves over `--dur-exit`, settling to `--press-scale`. The prompt section arrives first, then the sections below it at 60ms and 80ms, each rising 8px over `--dur-pop`.

Popovers rise from `--pop-scale` and their rows stagger in. On a harness change the old model rows leave sideways with a stagger, then the new ones enter from the other side. Highlights glide between rows. Starting hands the Start button's place to the new session's tab as the dialog closes.

Every value is a root token or a line named in PRESERVE.md §4, "Opening choreography and tuned values". With reduced motion, every one of these animations is off.

## 6. Model Naming And Ordering

`deriveModelEntries` is pure over `models.forHarness(harness, machineIds, accountId)`:

1. Canonical ID is `resolvedModel ?? value`. Dedupe by ID, merging supported effort levels and release dates. Aliases collapse into canonical entries. The entry resolved by `default` carries the default tag.
2. Names derive from canonical IDs. Route prefixes become provider metadata; strip `claude-`, title-case the family, join numeric version tokens with dots, and render `[1m]` as ` · 1M`. Examples: `claude-opus-5[1m]` becomes "Opus 5 · 1M"; `claude-fable-5-1` becomes "Fable 5.1"; `deepseek-v4-pro` becomes "DeepSeek V4 Pro".
3. Group order: New since the last spawn; Recent by last-used descending; All by released descending with undated last; Typed remembered custom IDs. Record model use only when a session starts.
4. One search matches name, canonical ID, aliases, and provider. An unmatched ID-shaped query is a selectable custom row; Enter selects it and remembers the ID.
5. Submit the canonical ID after selection. Untouched model is `""` internally and omitted from the wire payload.

## 7. Submission

- Snapshot every submission input before asynchronous work. Closing invalidates the submission generation. Recheck the generation after each location verification, each spawn, and before leaving.
- Each chosen machine is verified, then spawned, in order; the first failure stops the batch and its reason shows in the reading slot.
- `spawnSession` sends the spawn frame, then a separate prompt frame when the prompt is not empty. Store preferences and model use after spawning.
- A continuation is one hub job: the dialog follows its stages and leaves for the new session once it starts. Closing hands it to the tab; Cancel stops it.

## 8. Verification

Type-check and lint, then open New Session in the running dashboard at desktop and phone widths and check it against PRESERVE.md.
