<script lang="ts" generics="T">
  /**
   * Words that change in place (transitions-dev Text states swap): the old
   * leave up by swap-rise, soft by fold-blur, over dur-morph on
   * ease-in-out; then the new arrive from below the same way. The new wait
   * out the old, so the two never stand together.
   *
   * Every value it can show (`all`) stands in the same cell, unseen, so the
   * cell is the tallest of them from the first frame and never changes
   * size: what is under it never moves. Both steps run on the page's clock
   * (an outro and a delayed CSS animation, started together), so the
   * Animation domain can pause and seek them as one.
   *
   * Without motion, the old and the new only fade, still one after the
   * other.
   */
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeInOut, motionOk, numberOf } from "../motion/curves.svelte";

  let {
    value,
    all,
    children,
  }: {
    value: T;
    /** Every value it shows, for its cell's size. */
    all: T[];
    children: Snippet<[T]>;
  } = $props();

  /** Mounted: the first value stands; only a value that comes later arrives. */
  let settled = false;
  $effect(() => {
    settled = true;
  });
  const arriving = (node: HTMLElement) => {
    if (settled) {
      node.classList.add("arriving");
    }
  };

  function leave(_node: Element): TransitionConfig {
    const rise = motionOk.current ? numberOf("--swap-rise") : 0;
    const blur = motionOk.current ? numberOf("--fold-blur") : 0;
    return {
      duration: dur("--dur-morph"),
      easing: easeInOut,
      css: (t, u) =>
        `opacity: ${t}; transform: translateY(${-u * rise}px); filter: blur(${u * blur}px)`,
    };
  }
</script>

<span class="swap">
  {#each all as one, at (at)}
    <span aria-hidden="true" class="sizer">{@render children(one)}</span>
  {/each}
  {#key value}
    <span class="live" out:leave {@attach arriving}
      >{@render children(value)}</span
    >
  {/key}
</span>

<style>
  .swap {
    display: grid;
    min-inline-size: 0;
  }
  .swap > span {
    grid-area: 1 / 1;
    min-inline-size: 0;
  }
  .sizer {
    visibility: hidden;
  }
  .live:global(.arriving) {
    animation: swap-arrive var(--dur-morph) var(--ease-in-out) var(--dur-morph)
      both;
  }
  @keyframes swap-arrive {
    from {
      opacity: 0;
      transform: translateY(var(--swap-rise));
      filter: blur(var(--fold-blur));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live:global(.arriving) {
      animation-name: swap-arrive-fade;
    }
  }
  @keyframes swap-arrive-fade {
    from {
      opacity: 0;
    }
  }
</style>
