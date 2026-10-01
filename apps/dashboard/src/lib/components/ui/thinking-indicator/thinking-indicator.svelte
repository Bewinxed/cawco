<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements";
  import type { WithElementRef } from "$lib/utils.js";
  import { restOffscreen } from "$lib/whiffle/motion/rest";
  import type { SizeVariant } from "./size-context";

  export type ThinkingIndicatorProps = WithElementRef<
    HTMLAttributes<HTMLSpanElement>
  > & {
    showIcon?: boolean;
    size?: SizeVariant;
  };

  const circle =
    "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
  const infinity =
    "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
  /** The two marks that hand over to each other; with reduced motion, the infinity alone, still. */
  const MORPHING = [
    { name: "circle", d: circle },
    { name: "lemniscate", d: infinity },
  ];
  const STILL = [{ name: "still", d: infinity }];
  const words = ["Thinking", "Moonwalking", "Planning", "Refining"];
</script>

<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { cn } from "$lib/utils.js";
  import { getSizeContext } from "./size-context";

  let {
    class: className,
    showIcon = true,
    size,
    ref = $bindable(null),
    ...restProps
  }: ThinkingIndicatorProps = $props();
  const contextSize = getSizeContext();
  const compact = $derived(
    (size ?? contextSize?.() ?? "default") === "compact"
  );
  const motion = new MediaQuery(
    "(prefers-reduced-motion: no-preference)",
    false
  );
</script>

<span
  class={cn("indicator", className)}
  bind:this={ref}
  {...restProps}
  data-size={compact ? "compact" : "default"}
  data-slot="thinking-indicator"
  role="status"
  {@attach restOffscreen}
>
  <span class="sr-only">Thinking&#8230;</span>
  {#if showIcon}
    <!-- Two marks in one cell, the circle and the infinity, handing over to
         each other on a 6s breath. Each is its own <svg> so its transform
         and opacity run on the compositor; morphing the path itself
         repainted the page every frame. -->
    <span aria-hidden="true" class="mark">
      {#each motion.current ? MORPHING : STILL as mark (mark.name)}
        <svg
          aria-hidden="true"
          class={mark.name}
          fill="none"
          height={compact ? 18 : 20}
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          viewBox="0 0 24 24"
          width={compact ? 18 : 20}
        >
          <path d={mark.d} />
        </svg>
      {/each}
    </span>
  {/if}
  <span aria-hidden="true" class="labels" class:compact>
    {#each words as word, index}
      <span
        class="word"
        style:--delay={`calc(var(--breath) * ${index * 2} - 0.24s)`}
        class:first={index === 0}
      >
        <!-- The light passing over the word: the word again in the strong
             ink, masked to a band. The band slides and the word inside it
             slides back the same distance on the same curve, so the letters
             stand still and only the light moves, all of it on the
             compositor. -->
        <span class="shimmer"
          >{word}
          {#if motion.current}
            <span class="sheen"><span class="sheen-word">{word}</span></span>
          {/if}</span
        >
      </span>
    {/each}
  </span>
</span>

<style>
  .indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    color: var(--ink-muted);
    font-family: inherit;
    font-weight: var(--weight-body);
  }
  .mark {
    display: grid;
    flex: 0 0 auto;

    & > svg {
      grid-area: 1 / 1;
    }
  }
  .indicator svg {
    width: var(--thinking-icon-size, 20px);
    height: var(--thinking-icon-size, 20px);
  }
  .indicator[data-size="compact"] svg {
    width: var(--thinking-icon-size, 16px);
    height: var(--thinking-icon-size, 16px);
  }
  .labels {
    display: inline-grid;
    overflow: hidden;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    line-height: var(--leading-body);

    &.compact {
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
    }
  }

  /* Every word contributes its actual width to the shared grid cell. */
  .word {
    grid-area: 1 / 1;
    white-space: nowrap;
    opacity: 0;

    &.first {
      opacity: 1;
    }
  }

  /* Every beat here is the breath (--breath): each word stands for two of
     them in an eight-breath cycle, the marks trade places on a three-breath
     loop, and the light crosses a word once a breath. */
  @media (prefers-reduced-motion: no-preference) {
    .word {
      animation: cycle calc(var(--breath) * 8) var(--ease-out) infinite both;
      animation-delay: var(--delay);
    }

    /* The circle and the infinity trade places twice a loop, each easing in
       and out: the circle widens and flattens as it fades, the infinity
       settles out of a narrower, taller shape as it comes up. */
    .circle,
    .lemniscate {
      transform-origin: 50% 50%;
    }
    .circle {
      animation: circle calc(var(--breath) * 3) var(--ease-in-out) infinite both;
    }
    .lemniscate {
      animation: lemniscate calc(var(--breath) * 3) var(--ease-in-out) infinite
        both;
    }

    /* The band is the old gradient's geometry: three words wide, ink-strong
       at its middle, fading to nothing 15% of its width either side. It
       enters from the right and leaves on the left once a breath. */
    .shimmer {
      position: relative;
      display: inline-block;
    }
    .sheen {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      inline-size: 300%;
      color: var(--ink-strong);
      mask-image: linear-gradient(
        90deg,
        transparent 35%,
        #000 50%,
        transparent 65%
      );
      pointer-events: none;
      animation: sheen var(--breath) var(--ease-in-out) infinite;
    }
    .sheen-word {
      display: inline-block;
      animation: sheen-hold var(--breath) var(--ease-in-out) infinite;
    }
  }

  @keyframes circle {
    0%,
    50%,
    100% {
      opacity: 1;
      transform: none;
    }
    25%,
    75% {
      opacity: 0;
      transform: scale(1.15, 0.8);
    }
  }
  @keyframes lemniscate {
    0%,
    50%,
    100% {
      opacity: 0;
      transform: scale(0.7, 1.1);
    }
    25%,
    75% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes cycle {
    0% {
      opacity: 0;
      transform: translateY(80%);
    }
    1.5%,
    25% {
      opacity: 1;
      transform: translateY(0);
    }
    26%,
    100% {
      opacity: 0;
      transform: translateY(-80%);
    }
  }

  /* The band two words to the left; the word inside it two words back. */
  @keyframes sheen {
    to {
      transform: translateX(-66.6667%);
    }
  }
  @keyframes sheen-hold {
    to {
      transform: translateX(200%);
    }
  }
</style>
