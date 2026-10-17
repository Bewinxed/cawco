<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements";
  import { restOffscreen } from "#lib/cawco/motion/rest.js";
  import type { WithElementRef } from "#lib/utils.js";
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
  import { cn } from "#lib/utils.js";
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
  class={cn(
    "flex items-center gap-space-2 px-space-3 py-space-2 font-normal text-ink-muted",
    className
  )}
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
    <!-- literal: 16px, 20px (the mark's box, unless the caller sets --thinking-icon-size) -->
    <span data-slot="mark" aria-hidden="true" class="grid flex-none">
      {#each motion.current ? MORPHING : STILL as mark (mark.name)}
        <svg
          aria-hidden="true"
          class="col-start-1 row-start-1 size-(--box) motion-safe:origin-center"
          data-mark={mark.name}
          fill="none"
          height={compact ? 18 : 20}
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          style:--box={`var(--thinking-icon-size, ${compact ? "16px" : "20px"})`}
          viewBox="0 0 24 24"
          width={compact ? 18 : 20}
        >
          <path d={mark.d} />
        </svg>
      {/each}
    </span>
  {/if}
  <span
    aria-hidden="true"
    class="inline-grid overflow-hidden text-size-label leading-body font-medium data-compact:text-size-meta data-compact:font-normal"
    data-compact={compact || undefined}
  >
    {#each words as word, index}
      <span
        class="col-start-1 row-start-1 whitespace-nowrap opacity-0 data-first:opacity-100"
        data-first={index === 0 || undefined}
        data-slot="word"
        style:--delay={`calc(var(--breath) * ${index * 2} - 0.24s)`}
      >
        <!-- The light passing over the word: the word again in the strong
             ink, masked to a band. The band slides and the word inside it
             slides back the same distance on the same curve, so the letters
             stand still and only the light moves, all of it on the
             compositor. -->
        <span class="motion-safe:relative motion-safe:inline-block"
          >{word}
          {#if motion.current}
            <!-- literal: 300% (three words wide) -->
            <span
              class="motion-safe:pointer-events-none motion-safe:absolute motion-safe:inset-y-0 motion-safe:start-0 motion-safe:w-(--sheen-width) motion-safe:text-ink-strong"
              data-slot="sheen"
              style:--sheen-width="300%"
              ><span class="motion-safe:inline-block" data-slot="sheen-word"
                >{word}</span
              ></span
            >
          {/if}</span
        >
      </span>
    {/each}
  </span>
</span>

<style>
  /* residual: unmapped */
  [data-slot="thinking-indicator"] {
    font-family: inherit;
  }
  /* The band is the old gradient's geometry: three words wide, ink-strong
     at its middle, fading to nothing 15% of its width either side. It
     enters from the right and leaves on the left once a breath. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="sheen"] {
      mask-image: linear-gradient(
        90deg,
        transparent 35%,
        var(--mask-opaque) 50%,
        transparent 65%
      );
    }
  }

  /* Every beat here is the breath (--breath): each word stands for two of
     them in an eight-breath cycle, the marks trade places on a three-breath
     loop, and the light crosses a word once a breath. */
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="word"] {
      animation: cycle calc(var(--breath) * 8) var(--ease-out) infinite both;
      animation-delay: var(--delay);
    }

    /* The circle and the infinity trade places twice a loop, each easing in
       and out: the circle widens and flattens as it fades, the infinity
       settles out of a narrower, taller shape as it comes up. */
    [data-mark="circle"] {
      animation: circle calc(var(--breath) * 3) var(--ease-in-out) infinite both;
    }
    [data-mark="lemniscate"] {
      animation: lemniscate calc(var(--breath) * 3) var(--ease-in-out) infinite
        both;
    }
    [data-slot="sheen"] {
      animation: sheen var(--breath) var(--ease-in-out) infinite;
    }
    [data-slot="sheen-word"] {
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
