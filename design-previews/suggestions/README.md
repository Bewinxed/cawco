# Suggestions: a state machine preview

The owner: "just take the approach of the state machine and do it in a
preview page", and "i need to judge BOTH" (how suggestions are arranged and
how they look), "this is criticism of the design language of it, and
crticicism fo the design system".

One static page, one state on screen at a time at its production width,
beside a grouped switcher drawn in a look of its own (monospace on near
black, a yellow mark on the chosen entry), so it is never taken for the
product. Every state is a link, `?__state=…`; the switcher moves between
them without a reload, and the browser's back goes back. A loading state
holds still until the switcher moves.

```sh
bun design-previews/suggestions/app/build.ts                  # build index.html and assets/
python3 -m http.server -d design-previews/suggestions 8080    # any static server on this folder
bun scripts/probe-kit/run.ts suggestions-preview               # the proof (Chromium + WebKit)
```

## The surroundings

Every direction stands in Today's surroundings exactly (`app/Surround.svelte`):
Caw at 80 and the heading on the left edge ("What’s next for Cawco?" in his
thread and on the phone, "Nothing on the board yet" on the empty board), the
direction's set under them, and the composer at the foot, where it stays.
What a set holds past its room scrolls above the composer under the house's
40px edge fade. A direction differs only where the designer's report says
so, and the switcher's note says it in one line:

- drafts: the stack stands right-aligned on the composer, in a centred 560px
  column on the board, and hides while the keyboard is up ("stack hides when
  the keyboard is up").
- ledger: on the board the rows stand at the 560px reading width.
- tray: the suggestions live in the composer's own frame, centred at 560px
  on the board, and grow upward from it.

## The switcher: groups and keys

`?__state=direction:<d>,where:<w>,data:<s>,theme:<t>`; a group left out, or
naming an entry its direction hasn't, takes the direction's first. A state a
direction hasn't is hidden from the switcher.

1. **Direction** (`direction`): `today` (the real `Suggestions.svelte`, as
   main has it), `drafts` (Unsent drafts), `ledger` (The ledger), `tray`
   (The tray). The three new directions are the designer's report
   (report-92c112b7), drawn as specced, their costs included.
2. **Where** (`where`): `thread` (Caw's thread, 380), `board` (the empty
   board, 725), `phone` (390), and `keyboard` (390 with the keyboard up)
   for the drafts and the tray, the two whose specs have it.
3. **Data** (`data`): each direction's own "States needed" list from the
   report; Today's is the stopped state builder's (three, one, seven,
   longest, no reasons, loading).
   - drafts: `loading`, `none`, `one`, `three`, `seven-collapsed`,
     `seven-expanded`, `with-reasons`, `without-reasons`, `rest`, `hover`,
     `focus`, `pressed`, `filled`, `typing`, `cleared`, `touch`, `longest`.
   - ledger: the same, `filled` as the pencil→check, `typing` faded, and
     `refresh` (rewriting, rows shimmer in place).
   - tray: the same, plus `scrolled` (chip row scrolled), `reopened` (via
     the chevron), `sent` (after the first send, tray closed).
4. **Theme** (`theme`): `light`, `dark`.

## The words

Only the owner's own starters, as the hub wrote them for his live projects,
reasons and all (`app/starters.tsv`, read by `app/starters.js`): three is
Cawco's board's first three; one, its failed routine; seven, Cawco's
board's first four and three of Cawco-Dev's; longest, his three at the
hub's 90-character cap. Nothing is made up. The directions' own copy is the
designer's, word for word: "Caw suggests · 3", "Caw is writing
suggestions", "You might say · 3", "Things you might say · 3", "written from
this project · 1h", "3 more", and the live region's "In the message box,
ready to edit".

## The press moments

On the house helpers and tokens, each moment's runs on one clock (one
start, one duration, one easing; `app/clock.js`), a fade alone with less
motion:

- **Unsent drafts:** the bubble scales to 0.985 under the hand, then travels
  down into the box and fades while the rest of the stack dims to 50%
  (`--dur-morph`, `--ease-out`). The stack leaves by `popOut` once the box
  holds other words; "3 more" opens by `morph()`.
- **The ledger:** the row tints deeper (`--dur-control`), and its pencil
  swaps for a check, growing from 0.25 out of a 4px blur (`--dur-control`,
  `--ease-out`), then back after about a second.
- **The tray:** the row's words lift 40px into the field as they fade, the
  field's words fading in on the same clock (`--dur-exit`, `--ease-out`);
  the tray then folds to its chip row under the house edge fade.

## Values with no token

The directions' values the house has no token for stand as preview-only
variables in `app/preview.css`:

| Variable | Value | From |
| --- | --- | --- |
| `--board-column` | 560px | every direction's reading column on the board |
| `--keyboard-h` | 291px | the phone's keyboard (own call: an iPhone's) |
| `--drafts-edge` | ink at 40% | drafts' outline |
| `--drafts-gap` | 6px | between bubbles |
| `--drafts-pad-inline` / `--drafts-pad-block` | 14px / 10px | bubble padding |
| `--drafts-max` | 85% | a bubble's widest |
| `--drafts-hover-fill` | ink at 4% | hover |
| `--drafts-press-scale` | 0.985 | press |
| `--drafts-dim` | 0.5 | the stack once words are in the box |
| `--drafts-ghost-1/2/3` | 60% / 78% / 52% | loading outlines |
| `--drafts-ghost-edge-low/high` | ink at 20% / 40% | loading pulse |
| `--ledger-text-size` | 15px | the suggestion |
| `--ledger-kicker-size` / `--ledger-kicker-track` | 11px / 0.08em | the kicker |
| `--ledger-hairline` | ink at 9% | rows' hairlines (spec: 8–10%) |
| `--ledger-hover-fill` | ink at 3% | hover |
| `--ledger-press-fill` | ink at 6% | press ("deeper tint"; own call) |
| `--ledger-pencil-rest` / `--ledger-pencil-touch` | 0.4 / 0.6 | the pencil |
| `--ledger-check-ink` | 1 | the check |
| `--ledger-check-hold` | 1000 (ms) | the check's hold ("~1s") |
| `--ledger-bone-1/2/3`, `--ledger-bone-reason` | 72% / 88% / 58%, 40% | loading |
| `--tray-tint` | ink at 3% (6% dark) | the tray |
| `--tray-hover-fill` | ink at 7% (10% dark) | hover ("+4%") |
| `--tray-pad-inline` | 12px | rows' side padding |
| `--tray-lift` | -40px | the lift |
| `--tray-line` | 2px | loading's line on the divider |
| `--tray-bone-1/2/3` | 72% / 88% / 58% | loading rows (own call: the ledger's) |
| `--tray-chip-max` | 16rem | a chip's widest before its words clip (own call) |
| `--tray-bone-ink` | ink at 14% (22% dark) | loading rows on the tint (own call: the house skeleton's fill vanished on the tint at night) |

The switcher's own look (`--sm-*`) is the preview's, not the product's.

## Files

- `app/`: the page's source. `Preview.svelte` (the switcher and the stage),
  `states.js` (groups and keys), `starters.js` and `starters.tsv` (his
  words), `directions/` (Today, Drafts, Ledger, Tray), `Composer.svelte`,
  `Surround.svelte`, `CawStill.svelte`, `clock.js`, `preview.css`, `build.ts` (the dashboard's
  Vite and plugins). Every direction is the dashboard's own primitives and
  tokens (Suggestions, the kit's chips, Skeleton, Solar glyphs, the motion
  helpers); nothing goes into the product until the owner picks.
- `index.html`, `assets/`: what `app/build.ts` writes. Generated.
- `caw/`: Caw's stills by day and by night on the paper rim, the same still
  at 80 in the hero and at 28 in the head.
