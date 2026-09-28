<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements";
  import type { WithElementRef } from "$lib/utils.js";
  import type { SizeVariant } from "./size-context";

  export type ThinkingIndicatorProps = WithElementRef<
    HTMLAttributes<HTMLSpanElement>
  > & {
    showIcon?: boolean;
    size?: SizeVariant;
  };

  const circleA =
    "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
  const infinity =
    "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
  const circleB =
    "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";
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
>
  <span class="sr-only">Thinking&#8230;</span>
  {#if showIcon}
    <svg
      aria-hidden="true"
      class="shrink-0"
      fill="none"
      height={compact ? 18 : 20}
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      viewBox="0 0 24 24"
      width={compact ? 18 : 20}
    >
      <path d={motion.current ? circleA : infinity}>
        {#if motion.current}
          <animate
            attributeName="d"
            calcMode="spline"
            dur="6s"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
            keyTimes="0;0.25;0.5;0.75;1"
            repeatCount="indefinite"
            values={`${circleA};${infinity};${circleB};${infinity};${circleA}`}
          />
        {/if}
      </path>
    </svg>
  {/if}
  <span aria-hidden="true" class="labels" class:compact>
    {#each words as word, index}
      <span
        class="word"
        style:--delay={`${index * 4 - 0.24}s`}
        class:first={index === 0}
      >
        <span class="shimmer">{word}</span>
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
  .indicator svg {
    flex: 0 0 auto;
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

  @media (prefers-reduced-motion: no-preference) {
    .word {
      animation: cycle 16s cubic-bezier(0.4, 0, 0.2, 1) infinite both;
      animation-delay: var(--delay);
    }

    .shimmer {
      color: transparent;
      background: linear-gradient(
        90deg,
        var(--ink-muted) 0% 35%,
        var(--ink-strong) 50%,
        var(--ink-muted) 65% 100%
      );
      background-size: 300% 100%;
      background-clip: text;
      animation: shimmer 1.5s ease-in-out infinite;
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

  @keyframes shimmer {
    from {
      background-position: 0% 0;
    }
    to {
      background-position: 100% 0;
    }
  }
</style>
