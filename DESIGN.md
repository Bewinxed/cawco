# Design: Whiffle

The new-session dialog set the visual language; the whole dashboard now uses it.
Every value below lives in `apps/dashboard/src/app.css`. Components read these
tokens and nothing else: no one-off colours, sizes, radii, curves or durations.

## The rule of depth

The frame recesses; content never does. The app field, the top bar, the dialog
tray, table headers and the groove of a segmented control sit on a recess
surface. Content — cards, rows, menus, the dialog body, a segmented thumb — sits
raised on it. A value is never put in a sunken well.

## Tokens

### Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-raised` | n-1 | n-3 | cards, menus, popovers, dialog body |
| `--surface-recess` | n-3 | n-2 | the frame: field, top bar, dialog tray, badges, table heads |
| `--surface-recess-deep` | n-4 | n-1 | groove of tabs, toggle groups, progress |
| `--surface-lift` | n-1 | n-6 | the thumb in a groove |
| `--surface-fill` | n-3 | n-5 | a pressed or selected item |
| `--surface-hover` | n-2 | n-4 | hover on any control or row |

`n-*` is the `--neutral-*` ramp. Dark flips the polarity: a groove goes below the
card, a lift goes above it.

### Ink

| Token | Value | Use |
|---|---|---|
| `--ink-strong` | n-12 | primary text |
| `--ink-muted` | n-11 | secondary text, labels |
| `--ink-subtle` | n-8 15.2% into n-11 (dark 33.3%) | placeholders, tertiary text |
| `--ink-hover` | ink-strong ∓0.05 L | hover on the primary button |

`--ink-subtle` is the weakest mix that holds 4.5:1 on fill and hover surfaces;
15.3% / 33.4% fail.

### Shape, type, elevation

| Token | Value |
|---|---|
| `--radius-xs / sm / md / lg / modal` | 5 / 8 / 10 / 12 / 18px — marks and tiles / items in a surface / controls and buttons / cards and menus / the dialog tray |
| `--type-meta` | 400 0.75rem/1.35 |
| `--type-label` | 500 0.8125rem/1.3 |
| `--type-body` | 400 0.875rem/1.45 (body default) |
| `--type-title` | 500 1.25rem/1.25, −0.01em |
| `--type-kpi` | 500 1.5rem/1, tabular numerals |
| `--shadow-tile` | a 1px drop and a 1px ring, both from n-12 at low alpha |
| `--shadow-raised` | `0 1px 3px tint, 0 1px 1px tint`; dark: `inset 0 0 0 1px n-7/.7` |
| `--shadow-overlay` | menus, popovers, the dialog tray |
| `--scrim` / `--scrim-blur` | n-2/.72 (dark n-1/.72), 2px blur |
| `--focus-ring` | the one focus colour; always a solid 2px outline, 1px offset |

The radius and type roles are Tailwind theme values, so `rounded-md`,
`text-meta`, `text-label`, `text-body`, `text-title` and `text-kpi` are the
utilities. `text-*` sets size and leading; `text-title` and `text-kpi` also set
weight 500. Weight never goes above 500. TX-02 is the mono for code, paths and
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

Only `transform` and `opacity` animate. No ease-in curve exists. Exits are
shorter than entrances. Route changes and tab switches cross-fade in place for
120ms. Under reduced motion every animation and transition runs for 1ms, the
new-session dialog included; `data-motion-loop` keeps an indeterminate spinner
turning.

## Components

The kit is `apps/dashboard/src/lib/components/ui`; shared recipes are the
`kit-*` classes in app.css.

- **Button**: 36px (sm 30px at 13px, 11px padding), `500 0.875rem/1`, −0.01em,
  `--radius-md`, 1px `--border-control`, `--surface-raised`, hover
  `--surface-hover`, press `scale(--press-scale)`.
- **Primary button**: flat. `--brand-solid` fill, `--on-brand` text, no border,
  no gradient, no shadow; hover `--ink-hover`. The new-session dialog's `.ns-btn`
  is the same recipe.
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
  whose area focuses it. A link that clips for its ellipsis grows its padding
  into an equal negative margin instead.
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
- **Badge**: 20px, `--radius-xs`, meta at 500, `--surface-recess`, no border;
  status variants use the `--status-*-bg/ink` pairs.
- **Toggle**: `--radius-sm`, hover `--surface-hover`, pressed `--surface-fill`.
- **Alert**: a compact status-tinted row — `--status-*-bg/ink`, `--radius-md`,
  10px 12px padding, `--type-body`. No full-width slabs, no border.
- **StatTile**: a flat card; the value is `--type-kpi`.
- **Icons**: Solar through `$lib/icons.ts`, duotone where the barrel has it.
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
