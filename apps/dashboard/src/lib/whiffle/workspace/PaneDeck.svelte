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
<div class="deck" class:lifted={deck.lifted} use:deck.action>
  {#each workspace.leaves as leaf, index (leaf.id)}
    {@const delta = index - focusedIndex}
    {@const focused = delta === 0}
    <div
      class="card"
      data-delta={delta}
      data-leaf={leaf.id}
      inert={!focused}
      class:card-hidden={Math.abs(delta) > 1}
    >
      <div class="lift">
        <div class="clip">
          <PaneLeaf docked {leaf} swipeable={focused} />
        </div>
      </div>
    </div>
  {/each}

  <!-- Graphite, never the accent: a page control is position, and the one
       loud colour in this product means a session is asking for something. -->
  <!-- The fades are on wrappers: the dots' own opacity is the lift's and
       the focus's, and a fade written over it would flash them in. -->
  {#if workspace.leaves.length > 1}
    <div aria-hidden="true" class="dots">
      <div class="dots-in" transition:fadeDots>
        {#each workspace.leaves as leaf (leaf.id)}
          <span class="dot-slot" transition:fadeDots>
            <span
              class="dot"
              class:dot-on={leaf.id === workspace.focusedLeafId}
            ></span>
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* The ground the lifted cards float over. */
  .deck {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-recess);
    /* Pinch belongs to nobody here; two fingers are the deck's. */
    touch-action: pan-x pan-y;
  }

  /* The compositor carries every per-frame property: the translate the deck
     writes on the card, the scale on the lift, the opacity on the shadow.
     The radius is the one main-thread property, and it tweens — the corners
     rounding as the card comes up is the lift — but it is confined to the
     clip, so nothing heavy repaints for it: the shadow keeps a constant
     radius on its own layer and only fades, and at rest it is invisible, so
     its corners never show against the square card. Tweening `box-shadow`
     or the shadow's radius would repaint a whole transcript every frame.
     The clip is a child because `overflow: hidden` on the lift would cut
     the shadow off.

     Two elements carry the two transforms. The outer card takes the
     translate — the stylesheet's parking place at rest, the deck's inline
     value in motion; the inner lift owns the scale and its transition. On
     one element the inline transform would replace the scale outright
     every frame, and the lift would snap.

     Two timings, one each way. The pick-up rides the entry curve, quick
     and masked by the fingers already moving; the set-down is the eye's,
     so it takes the toggle curve at the base duration — symmetric, and
     long enough that the card is seen arriving. The set-down is declared on
     the base rule and the pick-up on the lifted one, which is how a single
     `transition` property gets a different value in each direction. */
  .card {
    position: absolute;
    inset: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
    will-change: transform;
  }
  /* Parked by delta. The 12px is `GAP` in deck.svelte.ts; keep them equal. */
  .card[data-delta="-1"] {
    transform: translate3d(0, calc(-100% - 12px), 0);
  }
  .card[data-delta="0"] {
    transform: translate3d(0, 0, 0);
  }
  .card[data-delta="1"] {
    transform: translate3d(0, calc(100% + 12px), 0);
  }
  .lift {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    transform: scale(1);
    border-radius: 0;
    will-change: transform;
    transition:
      transform var(--dur-panel) var(--ease-in-out),
      border-radius var(--dur-panel) var(--ease-in-out);
  }
  .lift::before {
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
  .clip {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    border-radius: inherit;
    overflow: hidden;
  }

  /* The pick-up: 180ms, derived from the base beat the way `--breath` is. */
  .deck.lifted .lift {
    transform: scale(0.96);
    border-radius: var(--radius-lg);
    transition:
      transform calc(var(--dur-panel) * 0.6) var(--ease-out),
      border-radius calc(var(--dur-panel) * 0.6) var(--ease-out);
  }
  .deck.lifted .lift::before {
    opacity: 1;
    transition: opacity calc(var(--dur-panel) * 0.6) var(--ease-out);
  }

  /* `visibility`, never `display`, and only the hidden state is declared —
     see the note on `.pane-hidden` in PaneLeaf: a re-declared `visible`
     paints through a hidden ancestor. */
  .card-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .dots {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    translate: 0 -50%;
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
    pointer-events: none;
    z-index: 5;
  }
  .dots-in {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dot-slot {
    display: flex;
  }
  .deck.lifted .dots {
    opacity: 1;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--ink-muted);
    opacity: 0.5;
    transition:
      height 160ms var(--ease-out),
      opacity 160ms var(--ease-out);
  }
  .dot-on {
    height: 18px;
    opacity: 1;
    background: var(--ink-strong);
  }

  /* Fewer and gentler, not none: the fades stay, the movement goes. */
  @media (prefers-reduced-motion: reduce) {
    .lift,
    .lift::before,
    .deck.lifted .lift,
    .deck.lifted .lift::before {
      transition: none;
    }
    .dot {
      transition: opacity 160ms var(--ease-out);
    }
    .deck.lifted .lift {
      transform: scale(1);
      border-radius: 0;
    }
  }
</style>
