#!/usr/bin/env node
/**
 * Compose DESIGN.md, inlining the palette.mjs output and its contrast report
 * VERBATIM from the generator's own file rather than by transcription — so the
 * "pasted verbatim, no hand-typed hex" constraint is structurally true, not a
 * claim about care taken.
 *
 *   node mocks/build-designmd.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// CENSUS NUMBERS ARE GENERATED, NEVER TRANSCRIBED.
// Four numbers in this document went stale — weights 500:208 vs 204, sizes
// 13px:464 vs 460, leading 1.250 x40 vs x450, hue budget 2.27% vs 2.342% — each
// prefixed "exactly" and each hand-copied from a report that later changed. The
// rule-level claims were all true and gated; nothing diffed the prose against
// the reports. These are read out of the reports at build time so they cannot
// drift, and verify.sh rebuilds and diffs the document.
const report = (name) => {
  try {
    return readFileSync(join(HERE, name), "utf8");
  } catch {
    return "";
  }
};
const pick = (text, re, fallback) => {
  const m = text.match(re);
  return m ? m[1] : fallback;
};
const tc = report("typecheck-report.txt");
const cc = report("clipcheck-report.txt");
const sc = report("satcensus-report.txt");
const kb = report("keyboard-report.txt");
const CENSUS = {
  weights: pick(tc, /computed font-weights:\s*(\{[^}]*\})/, "(report missing)"),
  sizes: pick(tc, /computed font-sizes\s*:\s*(\{[^}]*\})/, "(report missing)"),
  leading: pick(
    cc,
    /computed leading ratios seen:\s*(.*?)\s*\(\* =/,
    "(report missing)"
  ),
  satLight: pick(sc, /[=]\s*([\d.]+)% of the surface/, "?"),
  satRegion: pick(sc, /largest region\s*:\s*\d+ px = ([\d.]+)%/, "?"),
  ringRange: (() => {
    const all = [...kb.matchAll(/ring ([\d.]+):1/g)].map((m) => Number(m[1]));
    return all.length
      ? `${Math.min(...all).toFixed(2)}–${Math.max(...all).toFixed(2)}:1`
      : "(report missing)";
  })(),
  stops: (() => {
    const g = (f) => {
      const all = [
        ...kb.matchAll(
          new RegExp(`${f}\\s+@\\d+ \\w+\\s+(\\d+) tab stops`, "g")
        ),
      ].map((m) => Number(m[1]));
      return all.length ? `${Math.min(...all)}–${Math.max(...all)}` : "?";
    };
    return `${g("v2-fleet")} (fleet), ${g("v3-assistant")} (assistant), ${g("v4-transcript")} (transcript)`;
  })(),
};

const palette = readFileSync(
  join(HERE, "palette-263-muted-analogous.css"),
  "utf8"
).trim();
const tokens = readFileSync(join(HERE, "tokens.css"), "utf8");

// the tier-2/tier-3 slice of tokens.css, quoted as-is
const derived = tokens
  .slice(tokens.indexOf("/* ------------------------------- TIER 2"))
  .replace(/\n\/\* Contrast report[\s\S]*$/, "")
  .trim();

const md = `# Design: Quiet Ledger
**Date:** 2026-08-18 · **Status:** confirmed
**Archetype:** Data-Dense Professional · **Register:** calm structure · expressive at: the needs-you arrival, the assistant summon, the never-yet-connected fleet
**Grounding:** FlowAI's recessed-well surface discipline + a departure board's status-in-one-word restraint
**DNA:** Data-Dense Professional + motion vocabulary borrowed from instrument panels · **Dominant axis:** composition
**Composition:** <dealt> (data-dense-professional × ledger-grid, variance 2 — seed \`cawco-cawco|2026-08-18|0\`, \`scripts/dealer.mjs\`)
**Pins:** \`family=data-dense-professional\` · \`discipline=ledger-grid\` · \`hue=263\` (chosen in this phase and justified under ## Color tokens — the comps carry no accent hue to pin) · \`chroma=muted\` · \`signature=accent-scarcity\`, **swapped at converge** to the user's own move (the inset well + the never-flat action). The deal is **degenerate by pin** — five pins leave \`"available": 1\` cell and five byte-identical hands, which is the documented consequence of pinning, not a failure of the deal. Divergence therefore ran on the one unpinned axis, motion vocabulary. Pinned values are user law: dealt around, never re-chosen.

---

## Direction

A fleet console reads like a ledger, not like a dashboard. Every machine, project
and running agent is a row; rank comes from position and weight, never from size;
hairlines do the structural work that cards would otherwise do badly. The
surfaces stay quiet on purpose — the field, the chrome and the content region
carry no hue at all — so that the one thing that matters, *this session is asking
you for something*, is the only coloured thing in view. Measured on the rendered
board: **${CENSUS.satLight}% of the surface carries any hue, and the largest single hued
region is ${CENSUS.satRegion}% of it** (generated from \`mocks/satcensus-report.txt\`). Calm is not a mood here, it is a budget.

The collision that makes it specific: FlowAI's recessed wells give the density
somewhere to breathe — a stat is a near-white card with a sunken interior, so
the number sits *in* something rather than on it — while the departure board
supplies the restraint that a status is one word, one glyph, one tint, and never
a chart.

## Signature move

**Nothing that can be pressed is flat, and nothing that reports a number is
raised.** Two halves of one rule, applied without exception:

- **The recessed well.** Every value-bearing surface is a sunken panel inside a
  raised card: 7px inset, the field colour as the interior, a hairline around it,
  7px radius. The card is \`--surface-raised\`; the well is \`--surface-field\` — the
  interior is literally the page showing through.
- **The never-flat action.** Every primary action carries a top-highlight
  gradient (\`--gradient-action\`) and an inset bottom edge (\`--shadow-action\`), so
  it reads as lit from above. The 17×17 item mark carries the same top-light /
  bottom-shade read at a twelfth of the size, which is what ties the sidebar to
  the table.

This is the one shape a template would not produce: the generic move is a flat
tinted button and a card with uniform padding. Here the card *contains* a hole.

**The rule admits no exception, and the permission gate is where that bites —
but the gradient marks a primary, and a destructive gate has none.** Approve and
Deny once shipped byte-identical, both flat, on an \`rm -rf\` grant. Making them
peers in size and weight fixed half of it: measured on the render, the grant then
painted **13.36:1** against its panel and the refusal **1.12:1**. Peer geometry
beside a twelve-fold salience gap is the same nudge through another channel, and
arguing size parity does not answer it.

So the rule is stated rather than implied: **\`--gradient-action\` marks the primary
action of a surface, and is withheld where that action is destructive or
irreversible.** A \`Start session\` button is a primary and takes the gradient. An
\`rm -rf\` grant is not a primary — there is nothing to lead the operator toward.
Both options are recessed at the same fill and the same border, and differ in
kind: a check glyph and \`--ink-strong\` for the grant, a cross glyph and
\`--ink-body\` for the refusal. Measured after: fill/panel **1.12 vs 1.12** light and
**1.17 vs 1.17** dark, border/panel **1.20 vs 1.20** and **1.44 vs 1.44**, ink/fill
**11.95 vs 7.81** and **15.17 vs 10.79** — both far above AA, separated by 1.5×
rather than 12×.

**A standing grant must read as consequential.** "Always allow \`rm -rf\` in
~/cawco" painted **1.00:1** against its panel, treatment-identical to a benign
quick-reply chip, while its scope is strictly wider than the command being
approved: the one control on the surface with unbounded blast radius had the least
visual weight on it. It now carries the warning tint, a warning ink, a warning
glyph and a real edge — border/panel **8.90:1** light, **10.17:1** dark, the most
salient control on the surface, which is what it should be.

## Expressive moments

Everything not named here holds the structure register — no motion, no hue, no
size jump.

| Moment | What turns up | How far |
|---|---|---|
| **A session starts asking** (\`needs you\`) | The chip arrives with one 200ms settle on \`--ease-entry\`; the amber tint is the loudest colour the product ever shows. | Modest — one transition, then completely still. A board that keeps moving cannot be scanned. |
| **The assistant is summoned** | The orb is the single place \`--accent-solid\` appears as a solid fill; the panel enters over a \`--scrim-soft\` at \`--motion-base\`. | Modest — one surface, one hue, on demand only. |
| **The fleet has never connected** | Type steps up two rungs (\`--text-xl\`) and the surface goes almost entirely empty. | The largest amplitude in the product, and it is made of empty space and type, not colour. |

## Type

- **Display:** Geist Variable (\`@fontsource-variable/geist@5.3.0\`, OFL-1.1 — verified present on the npm registry, HTTP 200)
- **Body:** Geist Variable — one superfamily, two roles separated by weight and tracking, not by family
- **Code:** Geist Mono Variable (\`@fontsource-variable/geist-mono\`, HTTP 200). TX-02 was the plan's intended code face and is **not published to npm at all** (404 on both \`tx-02\` and \`@fontsource-variable/tx-02\`), so it is unreachable.
- **Scale:** ratio **1.125** from a **13px base**, rounded to the nearest 0.25px,
  and expressed in **rem against a 16px root**. Measured before the change: with a
  px scale, a user asking their browser for 200% text moved *nothing* — the stat
  value stayed 23.5px. The default render is unchanged to the pixel; a text-size
  preference now scales the system (WCAG 2.2 SC 1.4.4), and the suite holds every
  layout invariant at 200% on a 390px viewport. The base is 13px because that is the size of this discipline's dominant element — the table row name — so the ladder is anchored to the densest real text rather than to body copy.

| step | px | used for |
|---|---|---|
| \`--text-xs\` | 10.25 | table micro-labels |
| \`--text-sm\` | 11.5 | section labels, chips, pagination |
| \`--text-base\` | 13 | table row name — the anchor |
| \`--text-md\` | 14.5 | body copy, nav |
| \`--text-lg\` | 16.5 | card headings |
| \`--text-xl\` | 18.5 | page title (measured ~18px on the comp) |
| \`--text-2xl\` | 20.75 | |
| \`--text-3xl\` | 23.5 | KPI values (\`--text-2xl\` below 900px) |
| \`--text-4xl\` | 26.25 | reserved — nothing currently sets it |

- **Leading:** body **1.4** (\`--leading-body\`), display **1.2**, single-line UI
  **1.25** (\`--leading-ui\`), display figures **1** (\`--leading-numeric\`).
  **Verified by rendering, not by the token's presence** — computed
  \`line-height / font-size\` across all three mocks at five widths in both schemes
  returns: \`${CENSUS.leading}\` (generated from \`mocks/clipcheck-report.txt\`).
  This sentence previously claimed the incoming 1.45 had been corrected while
  1.45 was still what rendered — a token-rewrite pass reordered the leading out
  of the body shorthand. The claim now has a gate behind it
  (\`mocks/clipcheck.mjs\`), because a locked document that misdescribes the
  render is worse than the render bug.
- **The compact surface is this ladder one rung down, not a second ladder.** The
  transcript's body was a 12.5px literal that appears nowhere in the nine steps;
  it is now \`--text-base\` (13px) with its small size on \`--text-sm\`, so the dense
  surface and the management surfaces share one scale. Computed sizes across all
  three mocks: \`${CENSUS.sizes}\` — every one a named step, generated from the
  same report.
- **Display figures take \`--leading-numeric: 1\`.** Digits carry no descender, and
  a body line box on a KPI does not fit the measured 90px stat card: at 1.45 the
  value was a 38px line box inside a 24px well, so **all four KPI numbers were
  cut in half, and unreadable entirely at 390px**. The value is \`--text-3xl\` at
  leading 1, stepping to \`--text-2xl\` under 900px where the card compacts to
  82px. Measured after the fix: the value sits **inside the well by 14px at 1440
  and 10px at 390 and 320**.
- **Weights:** **400 body · 450 medium · 500 strong. 600 and above never appear.**
  Gated, not merely asserted: computed weights across all three mocks in both
  schemes are \`${CENSUS.weights}\` (generated from \`mocks/typecheck-report.txt\`). This claim was **false when
  it was first written** — v3 shipped \`font-weight:650\` on the assistant title and
  \`550\` on its headings, plainly visible in the PNG, because nothing gated the
  sentence. \`mocks/typecheck.mjs\` now fails the build on any weight outside the
  ladder, on any size off the enumerated steps, and on any text element left at
  \`line-height: normal\`.
  Every candidate face renders ≥45% heavier in ink density than the reference PNG
  at the same nominal weight — an offset caused by the comp's rasterizer — so
  every weight is stepped down one notch. The correction is made in weight, never
  in colour.
- **Primary face justification:** measured from the shipped font file, not
  asserted — Geist carries an **x-height of 0.530 em against a 0.710 em cap
  height** (unitsPerEm 1000; \`fontTools\` on \`geist-latin-wght-normal.woff2\`) and a
  continuous \`wght\` axis of 100–900. That ratio is what the comps' character
  depends on: at the 13px base the row name gets a **6.9px x-height**, which is
  what keeps a dense 44px-pitch row legible without reaching for more weight —
  and reaching for more weight is exactly what this design cannot do, because
  every face already renders ~45% heavy against the comp. The continuous axis is
  what makes the 400/450/500 ladder possible at all; a static family would have
  to jump 400→500. Category \`sans-serif\`, variable, OFL-1.1 (Fontsource API).
  It is none of the banned five (Inter, Roboto, Open Sans, Arial, Space Grotesk).

## Color tokens

Generated, not chosen. Command:

\`\`\`
node scripts/palette.mjs --seed 263 --chroma muted --harmony analogous --scheme both
\`\`\`

**The comps contain no accent hue to inherit, and that is a measurement, not an
impression.** Every pixel in both crops with a channel spread ≥60 was extracted:
the entire saturated content of the reference is **20.6° salmon, 59.7° orange and
103.4° amber** — all warm, all inside status pills, 11 883 pixels in total across
the two images. There is no blue orb, and no non-status accent of any hue. So the
hue is **chosen and recorded as a choice**, not pinned by the reference; what the
comps do pin is the colour *strategy*, which is warm status tints on an
achromatic ground.

Seed **263°** because it yields the deepest usable \`accent-9\` in the blue band on
the ground the product actually lives on: measured \`accent-solid\` on
\`background\` is **5.51:1 at 263°**, 3.58:1 at 255°, and a failing **2.41:1 at
240°**. \`muted\` because colour here is a highlight channel, not a wash.
\`analogous\` because the only secondary hues this product needs sit beside the
accent, not opposite it.

**Accepted deviation, recorded:** the generator hard-codes its functional hues at
\`error 25 · warning 85 · success 145 · info 240\` and offers no override, so the
shipped status tints are cooler than the comps' measured 20.6 / 59.7 / 103.4. The
deviation is one generator constant wide and is not worth forking the tool for;
it is named here so a later reviewer reads it as a decision rather than a drift.

**Verbatim generator output, light and dark, with its contrast report beneath:**

\`\`\`css
${palette}
\`\`\`

### The \`.dark\` bridge

The generator emits \`[data-theme="dark"]\`. This project's Tailwind v4 setup uses a
\`.dark\` class variant, so pasting the block unchanged yields a dark theme that is
present in the file and never activates. \`mocks/build-tokens.mjs\` rewrites the
selector to \`[data-theme="dark"], .dark\` — **verified by rendering, not by the
presence of the block**: the page ground moves 244 → 25 and the ink 46 → 233 when
the class is added, and \`--neutral-1\` resolves to \`#fcfdfd\` light / \`#121313\` dark.

### The derived tier, and why it exists

The generator's lightness spec is fixed (\`L_LIGHT = [0.993, 0.981, 0.956, 0.93, …]\`)
and has **no step between 249 and 241 mean-channel luminance**. The reference
system needs a content field at 244 that is simultaneously below the build gate's
card threshold (>248) and outside its band-detection window (239.5–242.5), and no
ramp step satisfies that. So the alias tier is *derived* from the ramp with
\`color-mix(in oklab, …)\` and relative \`oklch(from …)\` — token-derived rather than
hand-typed, which satisfies "no hand-typed hex" literally instead of by exception.

\`\`\`css
${derived}
\`\`\`

### Contrast the generator does not check

\`palette.mjs\` solves and reports 8 pairs per scheme, all of which it constructed.
The pairs the product actually depends on are not among them, so they are measured
independently by \`mocks/colorcheck.py\` (exits non-zero on any miss). Every pair
below passes in **both** schemes; full output in \`mocks/colorcheck-report.txt\`.

| pair | light | dark | target |
|---|---|---|---|
| \`error-11\` on \`surface\` / \`surface-hover\` | 5.92 / 5.48 | 8.54 / 7.74 | 4.5 |
| \`warning-11\` on \`surface\` / \`surface-hover\` | 5.74 / 5.31 | 8.79 / 7.97 | 4.5 |
| \`success-11\` on \`surface\` / \`surface-hover\` | 5.53 / 5.12 | 9.00 / 8.16 | 4.5 |
| \`info-11\` on \`surface\` / \`surface-hover\` | 5.65 / 5.22 | 8.86 / 8.03 | 4.5 |
| \`text-secondary\` on \`surface-hover\` / \`surface-active\` | 5.28 / 4.90 | 7.93 / 7.15 | 4.5 |
| \`accent-solid\` on \`background\` | 5.51 | 3.32 | 3.0 non-text |
| every status pill, text on tint (token) | 6.86 – 7.43 | 7.51 – 7.89 | 4.5 |
| every chip and pill, **painted pixels**, scrim included | **4.84 – 10.19** | | 4.5 |

### Every colour resolves through a token — in every notation

"No hard-coded hex" is a strictly weaker claim than the constraint intends, and
the gap shipped a defect. \`.cin{background:rgba(255,255,255,.82)}\` is not hex, so
a hex-shaped check saw nothing; it does not theme, and in dark it painted a
\`rgb(213,213,213)\` capsule on a \`#19191a\` page with its placeholder at **1.37:1**
and typed text at **1.20:1**. Translucency that must follow the scheme is written
as relative colour — \`oklch(from var(--surface-raised) l c h / 0.82)\` — which keeps
the alpha and the backdrop blur while tracking the ramp.
\`mocks/literalcheck.py\` now rejects a hand-typed colour in **any** notation: hex,
\`rgb()\`, \`hsl()\`, \`lab/lch/oklab/oklch()\`, \`color()\`, \`color-mix()\` and the named
keywords. An expression that references a token is derived, not typed, and passes.

### Inks are deepened for the glass, not for the spec sheet

A token-level contrast check reads \`--status-attn-ink\` on \`--status-attn-bg\` as
4.96:1 and passes. Two things happen between that token and a pixel:

- **Painted small text never reaches its nominal ink.** At 11.5–13px and weight
  400–500 the antialiased glyph core lands several luminance steps lighter than
  the declared colour — the same effect that makes the table header label measure
  \`#646464\` where the token says \`#52555b\`.
- **v3 composites the assistant scrim over the whole board.** The identical pill
  paints \`rgb(240,232,214)\` in v2 and \`rgb(228,221,204)\` in v3.

Together those put **seven pairs between 3.92:1 and 4.45:1 on the glass** while
every token-level pair read 4.7–5.5. So each functional ink is pulled toward the
text extreme — \`--ink-depth: 52%\` — and the worst painted pair in the system is
now **4.84:1**. The tint carries the hue; the ink carries the legibility. The
target was never moved, and \`mocks/paintcheck.mjs\` measures painted pixels on
every chip and pill, in both schemes, with the scrim in place.

### Status: four hues, one meaning each

| state | fill | ink | glyph |
|---|---|---|---|
| live / working | \`--status-live-bg\` | \`--status-live-ink\` | filled dot |
| needs you | \`--status-attn-bg\` | \`--status-attn-ink\` | upward chevron |
| done | \`--status-done-bg\` | \`--status-done-ink\` | check |
| failed | \`--status-fail-bg\` | \`--status-fail-ink\` | cross |
| idle / paused | **no fill** | \`--status-idle-ink\` | pause bars |

Three measured decisions behind that table:

1. **The step-3 tints straight off the ramp are not separable at pill size.**
   Measured CIEDE2000: error-3 vs warning-3 **9.2**, warning-3 vs success-3 **9.7**.
   Each tint is pulled 14% toward its own solid (\`--tint-depth: 86%\`), which lifts
   the worst pair to **12.5** while keeping every text-on-tint pair at or above
   **4.72:1**. Deepened — the threshold was not lowered.
2. **Idle ships no fill.** A hueless grey pill measures only **6.7** CIEDE2000 from
   the live blue pill in light and **6.4** in dark. Absence of a chip is the idle
   state.
3. **Hue is the third cue, never the first.** Every chip leads with a distinct
   glyph and carries a word. Strip the hue and the five states are still five states.

### The non-status accent is graphite

There is no decorative hue in this system. The brand accent — the mark, the
primary action, the focus ring — is \`--brand-solid\`, which is \`--neutral-12\`.
Measured CIEDE2000 from every functional hue, so "visibly distinct" is a number:

| | error-9 | warning-9 | success-9 | info-9 |
|---|---|---|---|---|
| light \`--brand-solid\` | 39.7 | 57.9 | 61.6 | 47.5 |
| dark \`--brand-solid\` | 36.3 | 23.7 | 27.7 | 22.3 |

The blue \`--accent-*\` ramp is bound to exactly one meaning — **live agent
activity** — which is the same thing \`info\` means, so the system carries one blue
with one meaning rather than two blues with two. This resolves a real conflict
rather than papering over it: a full 5° hue sweep found that **no seed hue is
simultaneously ≥40° from all four functional hues and able to clear
\`accent-solid\` on \`background\` ≥3:1 in both schemes, except the 290–345° violet /
purple / pink band** — precisely the aesthetic the tells catalog rates High. The
honest resolution was to stop asking a decorative hue to exist.

### Distance from the banned triplet

Verified rather than assumed, since the comps' blue sits near it. CIEDE2000 from
\`--accent-9\` \`#4466ac\`: **11.2** to \`#6366F1\`, **17.4** to \`#8B5CF6\`, **22.4** to
\`#A855F7\`. None of the three literals appears anywhere in the tokens or the mocks.
The palette is neither cyan-on-dark (the accent is a mid-dark blue used as a solid
on light, and the dark scheme's ground is a near-neutral graphite, not a hue) nor a
purple-to-blue gradient (there is exactly one gradient in the system and both its
stops are graphite).

## Interaction states

These did not exist. \`--surface-hover\` and \`--surface-active\` were defined, were
measured for the contrast table above, and painted nothing — tokens with no
surface. Measured now on \`.nav-i\`: rest \`transparent\` → hover
\`rgb(239,240,243)\` (\`--surface-hover\`) → active \`rgb(230,232,236)\`
(\`--surface-active\`).

| State | Treatment |
|---|---|
| Hover | \`--surface-hover\` on the affordance. Suppressed under \`@media (hover: none)\` so a touch tap does not leave a stuck highlight. |
| Active | \`--surface-active\`; raised actions additionally take \`--shadow-inset-sel\` and a slight darkening, so a press reads as the surface going *down*. |
| Focus-visible | a 2px \`--focus-ring\` ring at 2px offset on **every** interactive affordance. |
| Disabled | not specified here — Phase 4 owns it with the rest of the eight-state component contract. |

**Every claim in this section carries the conditions it was measured under.**
Four of the six review cycles in this phase found a false statement in this
document, and all four had the same mechanism: a property measured on the axis
where it holds, written as unconditional. The most recent was this section
claiming the focus ring reached "every interactive affordance" and "55 stops with
zero unreachable" — both true, **at 1440 only**, the one width at which the
offending control does not exist. A property asserted without its conditions is a
claim that will outrun its evidence.

| Property | Verified value | **Conditions** |
|---|---|---|
| Focus ring contrast | ${CENSUS.ringRange} against its own background | 3 mocks × **5 widths (320–1440)** × 2 schemes, painted pixels, ring core vs the same pixel unfocused |
| Pointer affordances reachable | **0 unreachable** | same 30 combinations; a live tab walk, not a markup read |
| Tab stops | ${CENSUS.stops} — the count varies by width because the drawer's contents leave the tab order when it is closed | same 30 combinations |
| Tab order | 0 inversions | document coordinates, compared within a landmark; a sidebar→main jump is a correct transition, not an inversion |
| Hover / active surfaces | change on press and keep ink ≥4.5:1 | both schemes, \`.nav-i\` and a table row, hover actually applied and the painted result measured |
| Target size | ≥44×44 | \`pointer: coarse\` at **every** width, not only the narrow ones |

**The focus ring is a token because it must clear contrast in both schemes.**
\`--focus-ring\` is \`--accent-solid\` in light and \`--accent-11\` in dark:
\`--accent-solid\` measures **2.91:1** on the dark ground, below the 3:1 that WCAG
2.2 SC 1.4.11 requires of a non-text indicator.

**The navigation drawer is a real control, and the closed drawer is inert.** The
opener was a \`<label for="navt">\` with \`tabIndex = -1\` driving a hidden checkbox:
it worked with a mouse and had no tab stop at **any width where it paints**, while
the closed \`<aside>\` kept all 19 of its focusables in the tab order at
\`x = −274 … −31\`. It is a \`<button>\` with \`aria-expanded\`/\`aria-controls\` now, the
closed drawer carries \`inert\`, and Escape closes it and returns focus to the
opener. Below 900px the assistant panel is a full-screen sheet, so it is announced
\`role="dialog" aria-modal="true"\` and the board behind it goes \`inert\` — measured
before the fix: keyboard focus landed on row actions the user could not see.

**Promoting markup to real controls imports the UA defaults, and the reset is
explicit.** Each arrived as its own regression: font-size fell to 13.3333px, off
the ladder; \`line-height\` reset to \`normal\` on 40 elements; the native placeholder
painted 4.40:1; and \`text-decoration: underline\` leaked onto every \`.nav-i\` and
\`.run-i\` in all three mocks and both schemes. The first three were caught by
existing gates, the fourth was not — \`typecheck.mjs\` now asserts the whole class
rather than the instances.

**Targets are sized by pointer type, not by breakpoint.** Every interactive
affordance reaches 44×44 under \`@media (pointer: coarse)\` at *any* width. The
earlier form attached the rule to a width query, so a tablet at 1024 with a touch
pointer got 10×18 action targets.

## Space, shape, depth

- **Spacing scale — deliberately not a 4px-multiple ladder.** Measured off the
  comps: \`--space-1\` 4 · \`--space-2\` **7** (well inset) · \`--space-3\` **11** (table
  card padding) · \`--space-4\` **14** (stat gap) · \`--space-5\` 18 · \`--space-6\`
  **21** · \`--space-7\` **25** · \`--space-8\` 32. The 25/21 left–right asymmetry in
  the content padding is kept on purpose; symmetric padding is the tell.
- **Radius — six values, none of them shadcn's ladder.** \`--radius\` **10px** (the
  base) · mark 4.6 · tile 5.5 · well 7 · control 8 · card 10 · panel 14 · pill 999.
  shadcn's generated defaults are 4 / 6 / 8 / 12 off a \`--radius: 0.5rem\`; this
  set differs in five of six members and in cardinality. "Unmodified shadcn
  defaults" is a binary High tell and this is the diff.
- **Borders — graded, three grades, never flattened.** \`--border-hairline\`
  \`#ecedf1\` · \`--border-divider\` \`#e9eaee\` · \`--border-control\` \`#e6e8ec\`.
  Measured in the live DOM as three distinct computed values.
- **Shadows — hue-shifted and cool, never \`rgba(0,0,0,·)\`.** Every elevation token
  tints from \`--neutral-12\`, which carries the seed's 263° hue at low chroma, e.g.
  \`--shadow-tint: oklch(from var(--neutral-12) l c h / 0.055)\`. Five distinct
  depths (\`hairline\`, \`tile\`, \`lifted\`, \`overlay\`, \`drawer\`) so elevation is a
  hierarchy, not one repeated alpha — the "uniform 0.1-opacity shadow" tell.

## Motion

The one DNA axis the comps did not pin, so it is the one axis where this design
actually diverged. Three candidates were considered — a ledger with no motion at
all; a conventional 160ms rise-and-fade on everything; and the one chosen:

**Only the live channel moves.** Structure — rows, cards, columns, chrome —
never animates. A board that reflows while being scanned cannot be scanned. What
does move is what is genuinely alive: the running mark breathes on \`--breath\`, a
\`needs you\` chip settles once on arrival, and the assistant panel enters. Every
other state change is instantaneous.

- **Timing:** a single vocabulary — \`--c-100\` 100ms · \`--c-300\` 300ms ·
  \`--c-500\` 500ms. The earlier \`--motion-instant\` 0ms · \`--motion-fast\` / \`--motion-base\` /
  \`--motion-slow\` are now aliases of the same tier (\`--motion-fast\`→\`--c-100\`,
  \`--motion-base\`→\`--c-300\`, \`--motion-slow\`→\`--c-500\`), so the mock component
  tiers and the global tokens resolve to one set of durations. \`--breath\` is
  \`calc(var(--c-500) * 4)\` (2000ms). No component tier carries a literal ms.
- **Easing:** \`--e-in\` \`cubic-bezier(0.16, 1, 0.3, 1)\` (entry) · \`--e-out\`
  \`cubic-bezier(0.7, 0, 0.84, 0)\` (exit) · \`--e-toggle\` \`cubic-bezier(0.65, 0, 0.35, 1)\`
  — the three canonical curves, aliased as \`--ease-entry\` / \`--ease-exit\` / \`--ease-toggle\`.
- **Allowed:** \`transform\` and \`opacity\` only. The running mark's breath; one
  settle on a status arrival; panel and drawer entry/exit.
- **Never:** row reflow, table sort animation, number count-ups, hover lifts on
  table rows, staggered page-load fades, bounce or elastic easing — and never a
  transition on \`border-radius\`, \`grid-template-*\`, \`width\`/\`height\`/\`padding\`/\`margin\`/\`top\`/\`left\`/\`box-shadow\`.
- **\`prefers-reduced-motion\`:** all four duration tokens collapse to 0 and a global
  rule caps every animation and transition at 1ms. The breath becomes a static
  ring — the *information* survives, only the movement stops.

## Never (this project's tells at risk)

1. **Nested cards in the uniform-padding form.** A card inside a card where both
   carry the same padding and the same radius, producing containment noise with
   no change in meaning. This is the highest-yield tell measured for this model
   (6/6 files, 42 hits) and it is banned here.
   **Explicitly permitted, and required:** the comps' **inset-well** surface — a
   raised card containing a *recessed* panel at a different inset (7px), a
   different fill (\`--surface-field\` inside \`--surface-raised\`) and a different
   radius (7 inside 10). That is not card-in-card padding noise; it is this
   design's signature move, and a blanket \`nested-cards\` ban would forbid the stat
   cards. A raw \`detect.mjs\` count is not a finding here — the rule matches
   buttons, pills, keycaps and any \`card-*\` class substring; container-level
   verification is required before any hit is treated as real.
2. **A decorative hue.** No accent-tinted pill, no \`--accent-3\`/\`--accent-4\` as a
   fill, no per-item identity colour. Item identity is carried by the label and
   the glyph; the mark is graphite. (The incoming mocks used an eight-colour
   rainbow for item marks — it collided with all four status hues, put two marks
   inside the banned violet band, and was invisible to a colour-blind operator.)
   That claim was false when written: the same atom glyph painted all four KPI
   tiles — including **Spend today** — and all twelve row marks, carrying no
   information at all. The four KPIs now carry four distinct glyphs, and row
   marks carry one per harness, so identity rides the glyph as claimed.
   The transcript's tool dot carried the same fault, encoding read-vs-mutate in
   **hue alone** (blue vs violet). Kind is now carried by **fill versus ring**, so
   it survives greyscale. Stripping a hue is only half the fix: when the inline
   fill was removed and nothing replaced it, the row mark painted at **1.07:1**
   and a session icon put white ink on white at **1.09:1** — both invisible.
3. **Red as ambient colour.** \`--error-*\` is reserved for a failed session and for
   destructive confirmation. It is never a chart series, never a "down" arrow on
   a cost figure, never decoration on an analytical surface.
4. **Unmodified shadcn defaults.** Shipping \`--radius: 0.5rem\` with the 4/6/8/12
   ladder, the default spacing scale, or the default shadow variables. Binary
   check, High severity.
5. **Weight above 500.** Any 600 or 700 in a text style. The comp's rasterizer
   makes every candidate face read ≥45% heavier at the same nominal weight; the
   fix is weight, never colour.
6. **A pure-black shadow.** \`rgba(0,0,0,·)\` in any elevation value. Shadows tint
   from \`--neutral-12\` and stay cool.
7. **Uniform spacing.** One padding value repeated across unrelated groupings.
   The 25/21 asymmetry and the 7/11/14 inner ladder exist to make grouping
   legible without borders.
8. **A scroll container standing in for readable content.** A horizontal scroll
   container is a legitimate answer for a wide **data table** — the operator
   scans columns, the structure signals more sideways, and no single value
   carries the decision. It is **not** an answer for **consent- or
   decision-bearing** content: a permission scope, a confirmation dialog, an
   error explanation. Those must be fully visible at every supported width.
   Measured before the fix: the \`rm -rf\` gate rendered its scope 90.5px
   off-screen at 320, so \`Path\` read
   \`/home/bewinxed/cawco/apps/dashboard/.svel\` — not the path being granted —
   while \`Approve\` sat fully legible beneath it, and the document measured clean
   because a \`.tr{overflow-x:auto}\` ancestor absorbed the overflow. A dialog that
   looks complete while stating a truncated path is worse than one that looks
   broken. Values wrap in full; paths break at any character so the tail, which
   is what distinguishes \`.svelte-kit\` from \`.svelte-kit/output\`, always survives.
9. **Content trapped behind a non-scrolling ancestor.** A clipping ancestor with
   nothing scrollable above it makes a control permanently unreachable while the
   document reports clean. Measured before the fix: \`.shead\` at **427px inside a
   390px** \`main{overflow:hidden}\`, losing the \`needs you\` chip by 37px at 390 and
   107px at 320. Mobile surfaces **wrap**; they do not hide.
10. **Matching a comp defect.** Where the reference itself fails AA — its header
   label is \`#838383\` on \`#F1F1F1\`, **3.36:1** — the correct build is the one that
   passes AA, not the one that reproduces the defect. This build's header label
   measures **5.24:1**. Every future comp-vs-correct conflict goes in
   \`fidelity.py\`'s \`AA_OVERRIDE\` with its measurement.

## Open questions

- **The comps cover two surfaces; the product has seven.** The transcript, tools,
  rules and usage surfaces have no reference to be measured against, so their
  composition is derived from the ledger-grid discipline rather than matched.
  Phase 4 and Phase 6 decide whether that holds under a compact density.
- **\`--accent-solid\` clears 3:1 on the dark ground at 3.32:1** — real margin, but
  the thinnest number in the system. If the dark scheme ever grows a lighter
  ground, this pair is the first to re-measure.
- **Two densities, one alias tier.** The compact transcript rows are 24px against
  the management surfaces' 44px. Phase 4 owns whether that resolves from two
  dimension ramps feeding one alias tier, as planned, or needs its own scale.
- **Three findings are page-phase problems whose rules are stated here.** The
  fleet board's KPI read "Needs you 3" while page 1 showed 2, was a static
  \`<div>\`, and the default sort was "Last active" — so the number defining this
  product's core job was unreachable. On a 390 viewport the first session sat at
  y≈748, below Export CSV and five filter controls. And four unqualified counts of
  the same noun (6 / 6 / 4 / 24) appeared on one screen. All three are fixed in
  the mocks — the KPI is a control that filters to exactly those rows, the count
  matches what the page shows (3 chips), the sessions precede the filter rail
  below 900px (first session now y≈489), and every count names its quantity
  ("Live sessions", "Running on nixbox", "Showing 8 of 24 sessions · all states").
  **The rules belong here; the implementation belongs to Phase 6's board work**,
  which owns sorting, filtering and pagination against real data. What this phase
  can carry is the rule: *a KPI that names the surface's job must be the control
  that reaches it, must agree with what the surface shows, and must say which
  quantity it counts.*
- **DW-3.6 is met as *installable*, not as *shipping*.** \`@fontsource-variable/geist\`
  and \`-geist-mono\` are now real dependencies of \`apps/dashboard\` (5.3.0, OFL-1.1),
  and the mock's vendored \`.woff2\` is byte-identical to the package's file
  (\`a147f99cd533135887083b7ac60d63a6\`). But the app still installs and renders
  \`@fontsource-variable/public-sans\`: **the production surface does not render this
  identity today.** Wiring \`app.css\` to the token system is Phase 4's bridge, which
  the plan assigns there; until it lands, this identity exists in the mocks only.
- **RTL is measured but not enforced.** The suite runs a right-to-left pass and
  currently reports zero findings, but it does not fail the build: CawCo ships
  English only and JOURNEY.md scopes no localisation, so the logical-property
  work has no consumer today. If i18n is ever scoped, that axis flips to enforcing
  and the physical \`left\`/\`right\` properties in the mocks become the work item.
  Print and OS-scrollbar width are likewise uncovered, and named as uncovered in
  \`mocks/axischeck.mjs\` rather than implied to be handled.
- **Fixed-height rows under very large text.** The type scale is rem and the stat
  card is now intrinsic, but the 44px management row pitch and the 32px header
  band are still absolute. They hold at 200% today because the type inside them
  is small, but the general fix — intrinsic row heights — is Phase 4 component
  work, not token work.
- **The mono face is loaded but barely used.** Geist Mono currently serves the
  \`.mono\` class only. If Phase 5's transcript needs a full code surface, its
  scale and leading are not yet specified here.
`;

writeFileSync(join(ROOT, "DESIGN.md"), md);
console.log(`WROTE DESIGN.md (${md.length} bytes)`);
