# Lane L14-cawco-decisions-2 (7 files)

Residual kinds are 1/2/3/4/5 (keyframes / foreign-dom / pseudo / svg-paint / unmapped).

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| graph/DecisionGraph.svelte | 1 rule + 3 style vars → utilities; 1 foreign-dom rule → theme component | 0/0/0/0/0 | none | none | none |
| graph/DecisionGroup.svelte | ring → `inset-ring`; label offset → `bottom-full mb-space-1` | 0/0/0/0/0 | none | none | none |
| graph/DecisionNode.svelte | 2 style vars + ring vars → tokens; 1 foreign-dom rule → theme component | 0/0/0/0/0 | none | none | none |
| host/Badge.svelte | deferred (T2 reason comment only) | 0/0/0/0/0 | none | none | none |
| host/Canvas.svelte | deferred (T2 reason comment only) | 0/0/0/0/0 | none | none | none |
| host/Decision.svelte | deferred (no change) | no `<style>` | none | none | none |
| host/Decisions.svelte | deferred (T2 reason comment only) | 0/0/0/0/0 | none | none | none |

Counts: theme 2 (both components), kit-swap 0, token 3, removed 0, fixed 2, gap 4.

## Why the four host files are deferred
`host/*.svelte` is not part of the dashboard's Tailwind build. `host/host.ts` is the decision host page's entry; `packages/core/src/decision-host.ts` bundles it with Bun and `bun-plugin-svelte`, and the page loads only the kit's `page.css` and `tokens.css` (text imports). No Tailwind compiler or theme runs there, so a utility class in these files would have no CSS behind it and the card, badge, canvas frame and caw art would lose their styling. Converting them needs the host build to compile Tailwind over the kit's tokens, a change in `packages/core/src/decision-host.ts` and the kit, outside this lane's list.

## Contracts
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Badge.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Canvas.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Decisions.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Decision.svelte

Deferred rules, verbatim, target: the host bundle's own stylesheet (Badge `.badge` and its four `&[data-tone]` rules, 14 + 2 + 2 + 2 + 2 declarations; Canvas `.media`, `.frame`, `.gone`, `.foot`, `.caption`, `.open` (+ `:focus-visible`, `:hover`), `.said`; Decisions `.caw-dark`, `:global(:root[data-theme="dark"]) .caw-light|.caw-dark`, and the `prefers-color-scheme: dark` pair) stay as the foundation had them, each `<style>` opening with its T2 reason line.

Decision.svelte has no `<style>`. Its two flagged sites are the kit's own state classes, defined in `packages/hub/skills/decision-page/kit/page.css`, which this lane cannot edit: `class={["dp-state", picked > 0 && "on"]}` (`.dp-state.on`, page.css:151) and `class={["dp-show", props.media.length === 1 && "solo"]}` (`.dp-show.solo`, page.css:209). Both become `data-on` / `data-solo` attributes (with `.dp-state[data-on]` and `.dp-show[data-solo]` in page.css) when the kit sheet and this file change together; a second site, `<span class="dp-state on">` at line 169, is the same class.

## Theme additions
theme: component decision-graph-node-fade
```css
@layer components {
  /* A card new to the graph fades up where it lands. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="decision-graph"] .svelte-flow__node-decision {
      transition: opacity var(--dur-fade) var(--ease-out);

      @starting-style {
        opacity: 0;
      }
    }
  }
}
```

theme: component decision-node-handle
```css
@layer components {
  [data-slot="decision-node"] .svelte-flow__handle {
    inline-size: 1px;
    block-size: 1px;
    min-inline-size: 0;
    min-block-size: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
}
```

## Tokens
token: --c-decision-graph-min-h 24rem — the decisions graph canvas's minimum height (384px); no ladder step fits a canvas height.
token: --c-decision-node-w 148px — a decision card's width; the hub's layout assumes the same box (DecisionGraph.svelte `CARD`), so the two must stay equal.
token: --c-decision-node-h 56px — a decision card's minimum height (DecisionGraph.svelte `CARD.height`); no ladder step fits.

## Removed
- none (the `<!-- literal: -->` markers and their `style:--x` literals became tokens above, `--graph-ring`, `--group-ring`, `--ring-border`, `--ring-r` and `--label-off` became utilities).

## Fixed
- fixed: DecisionGraph.svelte:153 and DecisionGroup.svelte:14 inset ring drawn by `inset-ring inset-ring-<border colour>` (Tailwind's own utility, `inset 0 0 0 1px`) rather than a custom-property shadow — DESIGN.md, Elevation & Depth: borders graded, `border-hairline` / `border-control` colours.
- fixed: DecisionNode.svelte:40 the status ring's `50%` radius is `rounded-pill` and its 1.5px border is `--c-graph-edge`, the graph's line weight — DESIGN.md, Shapes: a fully round shape for status dots.

## Gaps
- gap: DecisionGraph.svelte (theme: component decision-graph-node-fade) and DecisionNode.svelte (decision-node-handle) — `@xyflow/svelte/dist/style.css` is imported unlayered, so it outranks every `@layer components` rule regardless of specificity; integration must import it into a layer below `components` (or the handle's size and the node fade lose to the library) — Tailwind docs: components layer is for third-party component styles.
- gap: DecisionGraph.svelte:49 `CARD = { width: 148, height: 56 }` repeats `--c-decision-node-w` / `--c-decision-node-h` in script (script not changed here) — one value, one source.
- gap: host/*.svelte (Badge, Canvas, Decision, Decisions) are outside the Tailwind build (decision host bundle); the host build needs a Tailwind pass over the kit tokens before they can convert — packages/core/src/decision-host.ts.
- gap: host/Decision.svelte:172 and :187 state written as a class (`on`, `solo`) because the kit's page.css defines `.dp-state.on` and `.dp-show.solo` — a state is an attribute.

## needs colour token / needs variant / needs transition token / cross-file hook / shadow kept residual / important kept / shadcn lines
- none

## shadcn/no-restyle hits
- none

## Kit swaps
- none (no kit component's look is overridden in this lane's files)

## Delta R
- R1: every box-shadow is a utility (`shadow-tile`, `inset-ring`); no residual box-shadow.
- R2: the handle rule's `border: 0` is in a theme component rule written as the source had it, not a utility; no utility `border-0`.
- R3: no mono family in these files.

## Design critique (interface-craft, from markup and classes; ui-observer: Not verified, no bench or stories file renders these in the workspace)
- fixed: DecisionGroup label sits above its frame by `bottom-full mb-space-1` (4px, the ladder's space-1), no calc custom property.
- fixed: card, group and canvas edges are Tailwind's `inset-ring` on a border token, drawn inside the box so the 12px radius stays concentric with the card inside it.
- gap: DecisionNode's card has no focus or hover state of its own (the press opens the page, drag moves it); DESIGN.md's card recipe has none for a graph node, so it is left as it was.
