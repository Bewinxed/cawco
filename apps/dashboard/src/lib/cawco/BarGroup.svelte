<script lang="ts">
  /**
   * The top bar's trailing edge, one glass group (Apple HIG, Toolbars):
   * Jump, the machines, then Caw's head last, at the edge. A phone keeps
   * Jump and the machines in its sidebar, so its group holds Caw alone.
   * Shell stands it at the bar's end; the cards that hang from it are
   * bar-glass's.
   */
  import type { Snippet } from "svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconSearch } from "#lib/icons.js";
  import { barGlass } from "./bar-glass.svelte";
  import MachinesButton from "./MachinesButton.svelte";
  import NeedsCaw from "./NeedsCaw.svelte";

  let {
    railed,
    lead,
  }: {
    /** The wide bar, with the rail: Jump and the machines are in the group. */
    railed: boolean;
    /**
     * Items the group leads with, each a `.bar-item` with its `.bar-symbol`
     * (the Files panel's design preview, files-preview, puts Files here).
     */
    lead?: Snippet;
  } = $props();
</script>

<div
  data-slot="tools"
  class="tools"
  data-bar-group
  data-instant={barGlass.instant ? "" : undefined}
  data-joined={barGlass.joined ? "" : undefined}
>
  <!-- The glass as one shape with the card hanging from it while
       one does (bar-glass: Caw's panel, the machines, Jump). -->
  <span data-slot="join" aria-hidden="true" class="join"></span>
  {@render lead?.()}
  {#if railed}
    <Tip keys="⌘K" label="Jump to session">
      {#snippet children(tip)}
        <button
          data-bar-item
          {...tip}
          aria-expanded={barGlass.open === "jump"}
          aria-haspopup="dialog"
          aria-label="Jump to session"
          class="bar-item jump touch-hit press-tint"
          data-share="jump"
          onclick={() => {
            barGlass.toggle("jump");
          }}
          type="button"
        >
          <IconSearch aria-hidden="true" />
        </button>
      {/snippet}
    </Tip>
    <MachinesButton />
  {/if}
  <!-- Caw's head: what needs you, and its drawer. -->
  <NeedsCaw />
</div>

<style>
  /* The one group: one container of the panel's glass, a capsule on the
     bar's control height whose items sit concentric inside it, as Liquid
     Glass draws grouped toolbar items. The glass is drawn by a layer under
     the items, never by the group itself: a backdrop filter on the group
     would make it the box Caw's fixed drawer is laid out in. */
  .tools {
    --hit-gap-x: var(--c-bar-group-pad);
    /* How far the glass's leading foot flares out into the card hanging
       from it (`.join`, HangCard reads it): the card's own corner radius. */
    --flare: var(--radius-lg);
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--c-bar-group-pad);
    block-size: var(--c-btn-h);
    padding: var(--c-bar-group-pad);
    border-radius: var(--radius-pill);

    @media (pointer: coarse) {
      --hit-gap-x: 16px;
      gap: 16px;
    }
  }
  .tools::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--border-hairline);
    border-radius: inherit;
    background: var(--material-panel);
    box-shadow: var(--shadow-tile);
    backdrop-filter: blur(calc(var(--material-blur) * 1.4))
      saturate(var(--material-saturate));
    pointer-events: none;

    /* Either setting: the solid raised surface and an edge that holds 3:1
       against the bar and the surface (`border-contrast`), as the Apple
       apps' GlassCapsule draws it. */
    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      backdrop-filter: none;
      border-color: var(--border-contrast);
    }
  }
  /* ── The glass and the card hanging from it, one shape ──────────────
     While a card hangs from the glass (Caw's panel, the machines, the Jump
     palette: HangCard `glass`, bar-glass), the glass is one shape with it,
     as a session tab is with its card: its
     top corners keep the glass's round, its trailing flank runs straight
     down into the panel's side, its leading one flares out at its foot
     into the panel's top edge (`--flare`), and its foot is no edge at all.
     It takes the panel's material: `surface-raised`, which the glass
     already is at 72% (`material-panel`), and the panel's `border-control`
     edge. Drawn as a layer over the glass and under the items, one flare
     wider than the glass on its leading side and reaching 1px under its
     foot into the panel's top edge, as the tab's `.neck` does: the layer is
     the edge's ink in the outline, and `::before` is the surface 1px inside
     it, so the edge runs up the flare and both flanks and over the top.
     It fades in as the card grows and out as it folds, on the card's
     clock (`data-joined`: from the growth's first frame to the fold's). */
  .join {
    --f: var(--flare);
    /* The glass's top corners: its pill's end. */
    --r: calc(var(--c-btn-h) / 2);
    --h: calc(100% - 1px);
    position: absolute;
    inset-block: 0 -1px;
    inset-inline: calc(-1 * var(--f)) 0;
    pointer-events: none;
    opacity: 0;
    background: var(--border-control);
    clip-path: shape(
      from 0 var(--h),
      arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw,
      line to var(--f) var(--r),
      arc to calc(var(--f) + var(--r)) 0 of var(--r) cw,
      line to calc(100% - var(--r)) 0,
      arc to 100% var(--r) of var(--r) cw,
      line to 100% 100%,
      line to 0 100%,
      close
    );
    transition: opacity var(--dur-exit) var(--ease-out);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--surface-raised);
      clip-path: shape(
        from 0 100%,
        arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
          calc(var(--f) + 1px) ccw,
        line to calc(var(--f) + 1px) var(--r),
        arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
        line to calc(100% - var(--r)) 1px,
        arc to calc(100% - 1px) var(--r) of calc(var(--r) - 1px) cw,
        line to calc(100% - 1px) 100%,
        close
      );
    }
  }
  .tools[data-joined] .join {
    opacity: 1;
    transition-duration: var(--dur-pop);
  }
  /* A card the keyboard opened stands open and leaves at once (bar-glass
     `instant`), and its join with it. */
  .tools[data-instant] .join {
    transition: none;
  }
  /* An item of the group: borderless (Apple HIG, Toolbars: "Borders… aren't
     necessary because the section provides a visible container"), on the
     glass itself, every one the same height with the same symbol size, in
     the bar's one ink. Hover lifts it by the hover step; a press tints it. */
  .tools :global(.bar-item) {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--c-bar-item);
    block-size: var(--c-bar-item);
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--ink-strong);
    cursor: pointer;
    transition: var(--transition-control);
  }
  /* An item's symbol, named so: an item may draw more than its symbol
     (Caw's rim is an SVG too). */
  .tools :global(.bar-symbol) {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  /* An item with its number (the machines' count): the number reads beside
     its glyph, --space-2 apart; the group's next item (Caw's circle, his
     ring on its edge) stands the same --space-2 past the number, the
     group's gap and this trailing pad together, so the group reads at one
     spacing. */
  .tools :global(.bar-item:has(> [data-slot="num"])) {
    gap: var(--space-2);
    padding-inline: var(--space-2) calc(var(--space-2) - var(--c-bar-group-pad));
  }
  .tools :global([data-slot="num"]) {
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
  }
  /* A press is each item's `press-tint` (DESIGN.md, The Press Rule: grouped
     controls tint): by day the step past this hover. */
  @media (hover: hover) and (pointer: fine) {
    .tools :global(.bar-item:hover) {
      background: var(--surface-hover);
    }
  }
  /* Jump is the group's search glyph alone, an item of the glass like the
     machines and Caw; its tip names it and ⌘K (owner: the search integrated
     into the group, not "the whole expanded thing with 'jump'"). */

  /* ── The phone's one row (Shell) ─────────────────────────────────────
     Caw's glass (`c-bar-caw-glass-phone`) is a tab tucked into the
     screen's trailing edge: square on that side, which meets the edge,
     and round on the other (owner: "it's top right doesn't need to be
     rounded"). It tops with the tabs and stands clear of the floor: its
     top where the tabs' tops stand, the bar's height less a tab row's
     (owner: "the spacing above the tabs isn't equal to the spacing from
     caw to the top"), and its foot the neck (`--caw-neck`, what the row
     is taller than his glass) over the row's floor, the transcript's top
     edge (owner: "caw is still touching the transcript"). Open, his panel
     hangs from the floor through that neck (`.join`). His rim's arcs
     follow its outline (NeedsCaw). */
  @media (max-width: 899px) {
    .tools {
      --caw-neck: calc(var(--c-tab-row-h) - var(--c-bar-caw-glass-phone));
      align-self: flex-start;
      block-size: var(--c-bar-caw-glass-phone);
      margin-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
      padding: 0;
      border-radius: calc(var(--c-bar-caw-glass-phone) / 2) 0 0
        calc(var(--c-bar-caw-glass-phone) / 2);
    }
    /* The side that meets the screen's edge draws no edge of its own. */
    .tools::before {
      border-inline-end-width: 0;
    }
    /* Jump and the machines live in the phone's sidebar (`railed`): the
       server draws the wide bar, so its first paint here goes without them,
       as the rail's does, and nothing leaves the bar as it hydrates. */
    .tools :global(:is(.jump, .machines)) {
      display: none;
    }
    /* Joined to a card (Caw's panel, or the Jump palette the sidebar
       opens), the same: its trailing side is the screen's edge, square and
       with no edge drawn, as the card's is below it. And it reaches on down
       through the neck to the row's floor, at the glass's width and in its
       surface, where it flares out into the card's top edge: the card hangs
       from the floor (bar-glass `glassPlacement`: its side offset is the
       neck), so it covers no tab. The neck is the join's, so it is there
       only while the glass is joined, and comes and goes with it on the
       card's clock. */
    .join {
      --r: calc(var(--c-bar-caw-glass-phone) / 2);
      /* Down to the floor's line, where the card's top edge lies on it
         (bar-glass `glassPlacement`). */
      inset-block-end: calc(-1 * var(--caw-neck));
      clip-path: shape(
        from 0 var(--h),
        arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw,
        line to var(--f) var(--r),
        arc to calc(var(--f) + var(--r)) 0 of var(--r) cw,
        line to 100% 0,
        line to 100% 100%,
        line to 0 100%,
        close
      );

      &::before {
        clip-path: shape(
          from 0 100%,
          arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
            calc(var(--f) + 1px) ccw,
          line to calc(var(--f) + 1px) var(--r),
          arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
          line to 100% 1px,
          line to 100% 100%,
          close
        );
      }
    }
    /* Caw, the group's one item, is the glass's whole box; an item with
       its number is as wide as the two. */
    .tools :global(.bar-item) {
      inline-size: var(--c-bar-caw-glass-phone);
      min-inline-size: var(--c-bar-caw-glass-phone);
      block-size: var(--c-bar-caw-glass-phone);
    }
    .tools :global(.bar-item:has(> [data-slot="num"])) {
      inline-size: auto;
    }
  }
</style>
