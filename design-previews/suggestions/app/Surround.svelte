<!--
  What every direction stands in, Today's surroundings exactly, so the owner
  compares the suggestions alone: Caw at 80 and the heading on the left
  edge ("What’s next for Cawco?" in his thread and on the phone, "Nothing
  on the board yet" on the empty board), the direction's set under them,
  and the composer at the foot, where it stays. What the set holds past the
  room scrolls above the composer, both edges under the house edge fade
  (`kit-edge-fade-block`, edge-fade.css), as the dashboard draws it.
  A direction changes this only where the designer's report says so (the
  switcher's note names it): where its set stands (`anchor`: the drafts'
  stack on the composer) and what its foot holds (the tray's composer).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import CawStill from "./CawStill.svelte";

  let {
    where,
    set,
    foot,
    anchor = "start",
  }: {
    where: string;
    set: Snippet;
    foot: Snippet;
    /** The set at the top of its room, or standing on the composer. */
    anchor?: "start" | "end";
  } = $props();
</script>

<div class="surround" data-slot="surround" data-where={where}>
  <div class="scroll kit-edge-fade-block" data-slot="scroll">
    <div class="hero" data-slot="hero">
      <CawStill class="caw" size={80} />
      <h2 class="title" data-slot="heading">
        {where === "board" ? "Nothing on the board yet" : "What’s next for Cawco?"}
      </h2>
    </div>
    <div class="set" data-anchor={anchor} data-slot="set">{@render set()}</div>
  </div>
  <div class="foot" data-slot="foot">{@render foot()}</div>
</div>

<style>
  .surround {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    block-size: 100%;
    min-block-size: 0;
  }

  .scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .hero {
    display: grid;
    flex: none;
    justify-items: start;
    gap: var(--space-2);
    min-inline-size: 0;
  }

  .hero :global(.caw) {
    inline-size: var(--c-caw-hero);
    block-size: var(--c-caw-hero);
    margin-block-end: var(--space-3);
    object-fit: contain;
  }

  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    text-wrap: balance;
  }

  .set {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    inline-size: 100%;
    min-inline-size: 0;
    padding-block-start: var(--space-4);

    &[data-anchor="end"] {
      justify-content: end;
    }
  }

  .foot {
    flex: none;
  }
</style>
