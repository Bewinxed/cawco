<script lang="ts">
  /**
   * The phone's groups, as a vertical stack of cards.
   *
   * Every group is mounted, so a split made at the desk is reachable here:
   * two fingers drag the stack and the neighbour comes into view under
   * them. Keeping the others mounted is cheap — a conversation is mounted
   * once by `PaneHost` and docked into its group's slot, so a card that is
   * put away holds nothing heavy of its own. Only the focused group takes
   * the one-finger tab swipe, and only it prewarms its neighbouring tabs;
   * the rest mount just their active tab.
   *
   * The two neighbours are painted at rest, parked a card away above and
   * below where the deck's overflow hides them. Painting them on the claim
   * frame instead was the stutter: a whole transcript's first paint landed
   * in the same frame as the lift, and both the transition and the first
   * few drag frames went with it.
   */
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeOut } from "../motion/curves.svelte";
  import { createDeck } from "./deck.svelte";
  import PaneLeaf from "./PaneLeaf.svelte";
  import { workspace } from "./workspace.svelte";

  const deck = createDeck(
    () => workspace.leaves,
    () => workspace.focusedLeafId
  );

  const focusedIndex = $derived(
    workspace.leaves.findIndex((leaf) => leaf.id === workspace.focusedLeafId)
  );

  /** The page dots, and each dot, come and go as a fade at the control tier. */
  function fadeDots(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
</script>

<!-- The card's place in the stack is its delta, and the stylesheet parks it
     there; the deck writes the fingers' travel inline and clears it after. -->
<!-- The ground the lifted cards float over. Pinch belongs to nobody here;
     two fingers are the deck's. -->
<!-- Parked by delta. The 12px is `GAP` in deck.svelte.ts; keep them equal. -->
<!-- literal: 12px -->
<div
  data-lifted={deck.lifted || undefined}
  class="group/deck relative min-h-0 min-w-0 flex-auto touch-pan-x touch-pan-y overflow-hidden bg-surface-recess"
  style:--park-up="translate3d(0, calc(-100% - 12px), 0)"
  style:--park-here="translate3d(0, 0, 0)"
  style:--park-down="translate3d(0, calc(100% + 12px), 0)"
  use:deck.action
>
  {#each workspace.leaves as leaf, index (leaf.id)}
    {@const delta = index - focusedIndex}
    {@const focused = delta === 0}
    <!-- The compositor carries every per-frame property: the translate the
         deck writes on the card, the scale on the lift, the opacity on the
         shadow. The radius is the one main-thread property, and it tweens —
         the corners rounding as the card comes up is the lift — but it is
         confined to the clip, so nothing heavy repaints for it: the shadow
         keeps a constant radius on its own layer and only fades, and at rest
         it is invisible, so its corners never show against the square card.
         Tweening `box-shadow` or the shadow's radius would repaint a whole
         transcript every frame. The clip is a child because
         `overflow: hidden` on the lift would cut the shadow off.

         Two elements carry the two transforms. The outer card takes the
         translate — the stylesheet's parking place at rest, the deck's
         inline value in motion; the inner lift owns the scale and its
         transition. On one element the inline transform would replace the
         scale outright every frame, and the lift would snap.

         `visibility`, never `display`, and only the hidden state is declared
         — see the note on `.pane-hidden` in PaneLeaf: a re-declared
         `visible` paints through a hidden ancestor. -->
    <div
      data-slot="pane-deck-card"
      class="absolute inset-0 flex min-h-0 min-w-0 will-change-transform delta--1:transform-(--park-up) delta-0:transform-(--park-here) delta-1:transform-(--park-down) data-card-hidden:pointer-events-none data-card-hidden:invisible"
      data-delta={delta}
      data-leaf={leaf.id}
      inert={!focused}
      data-card-hidden={Math.abs(delta) > 1 || undefined}
    >
      <!-- Two timings, one each way. The pick-up rides the entry curve,
           quick and masked by the fingers already moving; the set-down is
           the eye's, so it takes the toggle curve at the base duration —
           symmetric, and long enough that the card is seen arriving. The
           set-down is declared on the base rule and the pick-up on the
           lifted one, which is how a single `transition` property gets a
           different value in each direction. The pick-up is `--dur-pick-up`,
           derived from the base beat the way `--breath` is. Fewer and gentler under
           reduced motion, not none: the fades stay, the movement goes. -->
      <div
        data-slot="lift"
        class="relative flex min-h-0 min-w-0 flex-auto rounded-none transform-(--lift-rest) will-change-transform motion-safe:transition-[transform,border-radius] motion-safe:dur-panel motion-safe:ease-in-out motion-safe:group-data-lifted/deck:rounded-lg motion-safe:group-data-lifted/deck:transform-(--lift-up) motion-safe:group-data-lifted/deck:dur-pick-up motion-safe:group-data-lifted/deck:ease-out motion-reduce:transition-none"
        style:--lift-rest="scale(1)"
        style:--lift-up="scale(var(--press-scale))"
      >
        <div data-slot="clip" class="flex min-h-0 min-w-0 flex-auto overflow-hidden">
          <PaneLeaf {leaf} swipeable={focused} />
        </div>
      </div>
    </div>
  {/each}

  <!-- Graphite, never the accent: a page control is position, and the one
       loud colour in this product means a session is asking for something. -->
  <!-- The fades are on wrappers: the dots' own opacity is the lift's and
       the focus's, and a fade written over it would flash them in. -->
  {#if workspace.leaves.length > 1}
    <!-- literal: 50%, -50% -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute top-(--dots-top) right-space-3 z-5 translate-y-(--dots-shift) opacity-0 transition-[opacity] dur-control ease-out group-data-lifted/deck:opacity-100"
      style:--dots-top="50%"
      style:--dots-shift="-50%"
    >
      <!-- literal: 6px -->
      <div class="flex flex-col gap-(--dots-gap)" style:--dots-gap="6px" transition:fadeDots>
        {#each workspace.leaves as leaf (leaf.id)}
          <span class="flex" transition:fadeDots>
            <!-- literal: 6px, 18px -->
            <span
              data-slot="dot"
              class="size-(--dot) rounded-pill bg-ink-muted opacity-50 transition-[height,opacity] dur-toggle ease-out data-dot-on:h-(--dot-on) data-dot-on:bg-ink-strong data-dot-on:opacity-100 motion-reduce:transition-[opacity] motion-reduce:dur-toggle"
              style:--dot="6px"
              style:--dot-on="18px"
              data-dot-on={leaf.id === workspace.focusedLeafId || undefined}
            ></span>
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* residual: pseudo — the lift's shadow, on its own layer at a constant
     radius: it only fades (will-change: opacity), at the set-down's timing
     at rest and the pick-up's while lifted; no transition under reduced
     motion. */
  [data-slot="lift"]::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);
    opacity: 0;
    will-change: opacity;
    transition: opacity var(--dur-panel) var(--ease-in-out);
    pointer-events: none;
  }
  [data-lifted] [data-slot="lift"]::before {
    opacity: 1;
    transition: opacity calc(var(--dur-panel) * 0.6) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    [data-slot="lift"]::before,
    [data-lifted] [data-slot="lift"]::before {
      transition: none;
    }
  }
  /* residual: unmapped — the clip takes the lift's tweening radius:
     no utility says border-radius: inherit. */
  [data-slot="clip"] {
    border-radius: inherit;
  }
</style>
