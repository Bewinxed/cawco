# Lane L27-cawco-spawn-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

better-ui rules followed: outer radius = inner + padding (tiles keep `ns-tile`'s 8px, no 5px override); transitions name their properties (`transition-[translate]`, never `all`); motion gated behind `motion-safe:`; hover only through the `hover:` variant; no `!important`.
better-layout rules followed: logical properties (`text-start`, `start-space-1`, `inset-x`); space from the ladder, not hand-kept numbers; heights from `c-*` component tokens (row 44, control 36/30/24); `min-w-0` + `truncate` kept on text beside marks; the 16px field rule left to app.css base layer.

## Per file

| file | change |
|---|---|
| spawn/PermissionSection.svelte | row height `c-row-h`, tile `c-mark`, gap/padding on the ladder, fill moves by `translate` from `--fill-y`, shown state is `data-shown` |
| spawn/ProjectChip.svelte | `<style>` gone (pseudo → `before:` utilities, `.swap` → `ns-in`); fields `c-input-h` / `c-btn-h-lg` on a phone; inputs on `type-body`; divider is a `border-t` |
| spawn/PromptEditor.svelte | `<style>` gone (chip rules → theme addition); padding on the ladder; touch size and grown height are tokens |
| spawn/Segmented.svelte | `<style>` gone (theme addition); groove padding `space-1`; tab heights `c-btn-h-xs/-sm/-h`; thumb moves by `translate` |
| spawn/SessionFooter.svelte | gap/padding on the ladder; min width is a token |
| spawn/ToolChips.svelte | picker padding `space-2` |
| spawn/TriggerMenu.svelte | `<style>` gone (theme addition); row `c-btn-h`, tile `c-mark`, label `type-label` |

7 of 7 files done. No `<style>` kept. No `kit-swap:`, no `contract:`, no `deferred-file:`, no `shadcn/no-restyle` hit, no `shadcn variant:` line, no `important kept:`.

## Theme additions

theme: component segmented-tab-svg
```css
@layer components {
  [data-slot="tab"][role="radio"] svg {
    flex: none;
  }
}
```

theme: component trigger-menu-popover
(`ns-pop` is an `@utility`, so this must sit in `@layer utilities`, as ns-theme.css's K1-K3 carve-outs do, or it loses to `ns-pop`'s padding.)
```css
@layer utilities {
  #trigger-menu-popover.ns-pop {
    padding: var(--space-1);
  }
}
```

theme: component prompt-editor-chip
(Chips are made by PromptEditor's script as `.ns-chip` / `.ns-chip-icon`; the editor renders `data-slot="editor"`. Chip gap and start padding take the ladder's 4px, from the old 5px.)
```css
@layer components {
  [data-slot="editor"] .ns-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    vertical-align: top;
    block-size: calc(var(--prompt-lh) - 2px);
    margin: 1px;
    padding-inline: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-fill);
    border: 1px solid var(--border-control);
    font: var(--weight-strong) var(--text-label) / 1 var(--font-body);
    color: var(--ink-strong);
    white-space: nowrap;
    user-select: all;
  }
  [data-slot="editor"] .ns-chip-icon {
    display: inline-flex;
  }
  [data-slot="editor"] .ns-chip-icon > svg {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
}
```

## Tokens

token: --c-session-footer-action-w 96px — min width that keeps the footer's primary button one size across "Start" and "Starting…"; no ladder step is that wide (SessionFooter.svelte)
token: --c-prompt-grown-h 120px — the first-prompt editor's grown height, also its fixed height on a phone (PromptEditor.svelte)
token: --text-field-floor 16px — the 16px Field Rule's floor for the contenteditable prompt, which app.css's input/textarea/select rule does not reach (PromptEditor.svelte)

## Removed

removed: ProjectChip.svelte `.clear::before` / `.swap` rules — the pseudo became `before:` utilities and the entrance is the shared `ns-in` utility
removed: PromptEditor.svelte `max-phone:transition-off` — the editor had no transition on a phone to turn off
removed: ProjectChip.svelte `max-phone:text-(length:--fs-phone)` on both inputs — app.css's base rule already holds every input at 16px on a phone
removed: TriggerMenu.svelte `rounded-xs` on the tile — DESIGN.md gives an icon tile 8px, which `ns-tile` already sets

## Fixed

fixed: ProjectChip.svelte "New project…" row delay — now continues the 35ms cascade (`projects.length * 35`) rather than a fixed 110ms — Motion grammar stagger
fixed: TriggerMenu.svelte tile glyph 12px → `icon-md` in the 26px tile — Identity marks and tiles: a 16px glyph in the tile
fixed: Segmented.svelte thumb now `motion-safe:` — Segmented controls: motion respects reduced motion
fixed: ProjectChip.svelte / PermissionSection.svelte / TriggerMenu.svelte `text-left` → `text-start` — logical properties

fixed: PromptEditor.svelte `promptH` (44/120 literals in the script) → `grown` boolean on the editor as `data-grown`; height is `h-c-row-h` at rest, `data-grown:h-(--c-prompt-grown-h)` and the phone rule — a state is an attribute

Own calls (no source): 9px gap → `space-3` (equidistant, matches its sibling rows); 16px editor padding → `space-4` (equidistant to 18); 40px add row → `c-row-h` (44, with its siblings); tab heights 26 → `c-btn-h-xs` (24), 38 → `c-btn-h` (36) on a phone.

## Gaps

gap: ProjectChip.svelte:~100 the two `<label class="field-shell">` fields are a hand-rolled input — the kit's `input-group` is the target (Inputs and fields: field shell), not a straight swap here
gap: Segmented.svelte is a hand-rolled segmented control (radiogroup with a thumb) — the kit's `toggle-group`/`tabs` (Segmented controls) is the target; ARIA differs, so not straight
gap: ProjectChip.svelte `-mr-space-row` on the clear mark offsets `ns-chip-btn`'s trailing padding, which lives in ns-theme.css — a cross-file nudge, left
gap: PermissionSection.svelte / TriggerMenu.svelte hand-rolled option rows beside the kit's menu item (Menu item: 32px, 44px coarse) — rows here are 44/36px designed tiles

## Contracts

(none)

R2 fixed: n/a (no `border: 0` sites changed)
R3 fixed: ProjectChip.svelte path input keeps `font-(family-name:--font-mono)`
