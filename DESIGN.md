# Design: Whiffle

The new-session dialog set the visual language; the whole dashboard now uses it.
Every value below lives in `apps/dashboard/src/app.css`. Components read these
tokens and nothing else: no one-off colours, sizes, radii, curves or durations.

## The rule of depth

The frame recesses; content never does. The app field, the top bar, the dialog
tray, table headers and the groove of a segmented control sit on a recess
surface (a table header one step deeper, on the band). Content — cards, rows, menus, the dialog body, a segmented thumb — sits
raised on it. The one sanctioned card-in-card is the stat tile's recessed well
(plan 2026-08-18: "the stat card is a near-white card containing a recessed
well … a signature move of the design").

## Tokens

### Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-raised` | n-1 | n-3 | cards, menus, popovers, dialog body |
| `--surface-recess` | raised − 0.026 L (≈ #F4F4F4, the comp's field) | raised − 0.026 L (n-3 − 0.026) | the frame: field, top bar, dialog tray, badges, the stat well |
| `--surface-band` | raised − 0.036 L (≈ #F1F1F1, the comp's header band) | raised − 0.036 L | a table's header band (and its skeleton), one step under the field |
| `--surface-recess-deep` | n-4 | n-1 | groove of tabs, toggle groups, progress |
| `--surface-shelf` | n-5 | n-1 − 0.03 L | the bar folder tabs stand on (session tab row, hosted top bar) |
| `--surface-lift` | n-1 | n-6 | the thumb in a groove |
| `--surface-fill` | n-4 | n-5 | a pressed or selected item (on raised or recess; not on a recess-deep groove, which it equals in light) |
| `--surface-hover` | n-2 | n-4 | hover on any control or row |

Folder tabs are a three-step ladder: `--surface-shelf` bar, `--surface-recess-deep` unchosen tab, `--surface-recess` chosen sheet (the pane body's own surface), hover `--surface-hover`.

`n-*` is the `--neutral-*` ramp. Dark flips the polarity: a groove goes below the
card, a lift goes above it.

### Ink

| Token | Value | Use |
|---|---|---|
| `--ink-strong` | n-12 | primary text |
| `--ink-muted` | n-11 | secondary text, labels |
| `--ink-subtle` | n-8 15.2% into n-11 (dark 33.3%) | placeholders, tertiary text |
| `--ink-hover` | ink-strong ∓0.05 L | hover on the primary button (the base of `--action-surface-hover`) |

`--ink-subtle` is the weakest mix that holds 4.5:1 on fill and hover surfaces;
15.3% / 33.4% fail.

### Shape, type, elevation

| Token | Value |
|---|---|
| `--radius-xs / sm / md / lg / modal` | 5 / 8 / 10 / 12 / 18px — marks and tiles / items in a surface / controls and buttons / cards and menus / the dialog tray |
| `--radius-well` | 7px — the stat tile's well, inside its r10 card |
| `--action-surface` | `--brand-solid` +0.084 L → −0.004 L, top to bottom (the comp's #3C3C3C→#262626 over #272727); `-hover` is the same off `--ink-hover` |
| `--type-meta` | 400 0.75rem/1.35 |
| `--type-label` | 500 0.8125rem/1.3 |
| `--type-body` | 400 0.875rem/1.45 (body default) |
| `--type-title` | 500 1.25rem/1.25, −0.01em |
| `--type-kpi` | 500 1.5rem/1, tabular numerals (the figure carries `.num`) |
| `--shadow-tile` | a 1px drop and a 1px ring, both from n-12 at low alpha |
| `--shadow-raised` | `0 1px 3px tint, 0 1px 1px tint`; dark: `inset 0 0 0 1px n-7/.7` |
| `--shadow-overlay` | menus, popovers, the dialog tray |
| `--scrim` / `--scrim-blur` | n-2/.72 (dark n-1/.72), 2px blur |
| `--focus-ring` | the one focus colour; always a solid 2px outline, 1px offset |

The radius and type roles are Tailwind theme values, so `rounded-md`,
`text-meta`, `text-label`, `text-body`, `text-title` and `text-kpi` are the
utilities. Each `text-*` sets its role whole: size, leading and weight. Text
takes only these roles and the button's 500 0.875rem: meta 12/400, label
13/500, body 14/400, title 20/500, kpi 24/500. A role is chosen by what the
text does, not by the size wanted: names, headings of groups, column heads,
badges and small buttons are label; sentences and table data are body;
timestamps, counts, units and hints are meta. Weight never goes above 500. A
changing figure (a count, a price, an age) is `.num`, tabular digits. TX-02 is the mono for code, paths and
IDs; Geist is everything else.

### Motion

| Token | Value |
|---|---|
| `--ease-out` | cubic-bezier(0.23, 1, 0.32, 1) — entrances and exits |
| `--ease-in-out` | cubic-bezier(0.77, 0, 0.175, 1) — movement on screen |
| `--ease-drawer` | cubic-bezier(0.32, 0.72, 0, 1) — popovers, drawers, page fades |
| `--dur-control / menu / pop / panel / exit` | 120 / 140 / 260 / 280 / 160ms |
| `--transition-control` | background-color, border-color, color 120ms ease |
| `--press-scale` | .97 |
| `--pop-scale` / `--pop-rise` | .92 / 8px |

No ease-in curve exists. Exits are shorter than entrances. Motion is opt-in:
travelling transitions and animations run only under
`prefers-reduced-motion: no-preference`, and motion driven from JavaScript
asks the same query (`motionOk`). With reduced motion, opacity and colour fades
still run, pages cross-fade in place, and an indeterminate spinner keeps
turning.

## Components

The kit is `apps/dashboard/src/lib/components/ui`; shared recipes are the
`kit-*` classes in app.css.

- **Button**: 36px (sm 30px at 13px, 11px padding), `500 0.875rem/1`, −0.01em,
  `--radius-md`, 1px `--border-control`, `--surface-raised`, hover
  `--surface-hover`, press `scale(--press-scale)`.
- **Primary button**: never flat (plan 2026-08-18: "action `#272727` with a
  top-highlight gradient `#3C3C3C→#262626`, not flat"). `--action-surface`
  fill, `--on-brand` text, no border, no shadow; hover `--action-surface-hover`.
  The same fill is on the new-session dialog's `.ns-btn.primary`, the
  workflows `.wf-primary`, the composer's Send and the machine login link.
- **Card**: `--radius-lg`, `--shadow-tile`, 18px padding, no ring.
- **Dialog**: a `--surface-recess` tray (radius 18, padding 6,
  `--shadow-overlay`) holding a `--surface-raised` body (radius 12, padding 18),
  so the corners are concentric. Scrim `--scrim` with the blur. Enters in 280ms
  on `--ease-out` rising 6px; exits in 160ms.
- **Popover, dropdown, select, context menu** (`kit-pop`): `--radius-lg`, 1px
  `--border-control`, `--shadow-overlay`, padding 6. Enter 260ms on
  `--ease-drawer` from `--pop-scale` and `--pop-rise`; exit 160ms. Items
  (`kit-item`) are `--radius-sm`, 32px tall (44px on a coarse pointer), hover
  `--surface-hover`.
- **Touch targets**: on a coarse pointer a control keeps its drawn size and
  `.touch-hit` grows only its tappable area to 44×44 (a transparent `::after`),
  stopping at the midpoint where neighbours sit closer (`--hit-gap-x/-y`).
  An input draws no `::after`: it sits in a `<label class="touch-hit">`,
  whose area focuses it. Text truncates in an inner span, never on the control.
  A scroll container that would clip the areas pads into an equal negative
  margin.
- **Input, textarea, select trigger, native select**: 36px, `--radius-md`,
  `--type-body`, 1px `--border-control`, `--shadow-xs`; focus is the solid
  outline.
- **Tabs and toggle groups** (`kit-segmented`): a `--surface-recess-deep` groove,
  `--radius-md`, padding 3, holding a `--surface-lift` thumb (`--radius-sm`,
  `--shadow-raised`) that slides under the chosen segment in 240ms on
  `--ease-in-out`, by transform only. Labels are 500 13px, `--ink-muted`, and
  `--ink-strong` when chosen.
- **Tooltip**: `--brand-solid`, `--on-brand`, `--type-meta`, `--radius-sm`, 140ms
  opacity and scale from .96.
- **Badge**: 20px, `--radius-xs`, the label role, `--surface-recess`, no border;
  status variants use the `--status-*-bg/ink` pairs.
- **Toggle**: `--radius-sm`, hover `--surface-hover`, pressed `--surface-fill`.
- **Alert**: a compact status-tinted row — `--status-*-bg/ink`, `--radius-md`,
  10px 12px padding, `--type-body`. No full-width slabs, no border.
- **StatTile**: an r10 (`--radius-md`) card holding a recessed well 7px in: the
  well is `--surface-recess`, 1px `--border-hairline`, `--radius-well` (plan:
  "stat well 7px inset, #F4F4F4 + 1px #EEEEEE, r7"; the radii are the comp's,
  not concentric). The value is `--type-kpi` and `.num`, and a new value morphs
  in through torph's TextMorph (150ms, `--ease-out`). The Needs-you tile's
  hover, chosen and pressed fills paint the well.
- **Icons**: Solar through `$lib/icons.ts`, every product icon in the
  bold-duotone cut; linear only for the glyph-like chevrons and arrows
  (`alt-arrow-*`, `arrow-*`). Three sizes: 12 beside meta text, 16 in controls
  and rows (the default), 20 in nav and headers.
- **Focus**: one ring on every focusable, `outline: 2px solid --focus-ring`,
  1px offset. The ring's colour is set at rest, so focus only switches it on.
- **Pointer targets**: on a fine pointer, `.pointer-hit` grows a control drawn
  under 24×24 to a 24px area through a transparent `::after`, with the same
  `--hit-gap-x/-y` stops as `.touch-hit`, and `--hit-scale` on a zoomed canvas.
- **Press**: every button, link row, chip, trigger, segment and tab is
  `.pressable` (`scale(--press-scale)`); a text link dims on press.
- **Skeleton**: one, `ui/skeleton`: a `--surface-fill` block at the size of
  what it stands for, one band crossing it every 1.2s (motion only).
- **Empty state**: one, `ui/empty`: a duotone mark, a title in the title role,
  one plain line saying why, at most one action. It renders only once the data
  is known to be empty, never while it loads.
  Plus, Tick and Minus are local glyphs drawn to Solar's grid because Solar has
  no bare version.

## Status

| State | Fill | Ink | Glyph |
|---|---|---|---|
| live / working | `--status-live-bg` | `--status-live-ink` | filled dot |
| needs you | `--status-attn-bg` | `--status-attn-ink` | upward chevron |
| done | `--status-done-bg` | `--status-done-ink` | check |
| failed | `--status-fail-bg` | `--status-fail-ink` | cross |
| idle / paused | none | `--status-idle-ink` | pause bars |

Hue is the third cue after the glyph and the word. Idle has no fill: the absence
of a chip is the idle state. Brand is graphite (`--brand-solid` = n-12); no hue
is decorative, and no indigo is used anywhere.

## The permission gate

Approve and Deny are recessed peers (the secondary button: `--surface-recess`
and a hairline) at the same fill and border. They differ in kind — a check
glyph in `--ink-strong` against a cross glyph in `--ink-muted` — never in size,
weight or salience. Both inks clear AA on the fill: 11.95 vs 5.28:1 light,
14.32 vs 8.75:1 dark. They once shipped with the grant at 13.36:1 against its panel
and the refusal at 1.12:1; peer geometry beside a twelve-fold salience gap is
the same nudge through another channel. A destructive grant has no primary: there
is nothing to lead the operator toward.

A standing grant ("Always allow … in ~/project") must read as consequential. Its
scope is wider than the command being approved, so it carries the warning tint,
warning ink, a warning glyph and a real edge, and is the most salient control
on the surface.
