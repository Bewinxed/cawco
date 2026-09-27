<script lang="ts" module>
  export type StepStatus = "complete" | "active" | "pending";
</script>

<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { Markdown } from "$lib/components/ui/markdown";
  import { IconCheck, IconGlobe, IconSearch } from "$lib/icons";
  import Stream from "$lib/whiffle/motion/Stream.svelte";
  import { getSizeContext } from "../thinking-indicator/size-context";

  let {
    icon = "dot",
    showIcon = true,
    label = "",
    description,
    status = "complete",
    delay = 0.08,
    isLast = false,
    markdown = false,
    children,
    class: className = "",
  }: {
    icon?: "dot" | "search" | "globe" | "check" | Component;
    showIcon?: boolean;
    label?: string;
    description?: string;
    status?: StepStatus;
    delay?: number;
    isLast?: boolean;
    /** Render the description as markdown rather than plain streamed text. */
    markdown?: boolean;
    children?: Snippet;
    class?: string;
  } = $props();
  const size = getSizeContext();
  const icons = {
    dot: undefined,
    search: IconSearch,
    globe: IconGlobe,
    check: IconCheck,
  };
  const Icon = $derived(typeof icon === "string" ? icons[icon] : icon);
</script>

{#if status !== "pending"}
  <div
    class="step {className}"
    data-size={size?.() ?? "default"}
    data-slot="thinking-step"
    data-status={status}
    style:--step-delay={`${delay}s`}
  >
    <div aria-hidden="true" class="icon-column">
      <span class="icon"
        >{#if showIcon && Icon}
          <Icon />
        {:else}
          <span class="dot"></span>
        {/if}</span
      >
      {#if !isLast}
        <span class="connector"></span>
      {/if}
    </div>
    <div class="copy">
      {#if label}
        <span class="label" class:shimmer={status === "active"}
          ><Stream text={label} /></span
        >
      {/if}
      {#if description && markdown}
        <div class="description md">
          <Markdown source={description} streaming={status === "active"} />
        </div>
      {:else if description}
        <span class="description" class:shimmer={!label && status === "active"}
          ><Stream text={description} /></span
        >
      {/if}
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .step {
    display: flex;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--text-label);
    line-height: var(--leading-body);
  }
  .step[data-size="compact"] {
    font-size: var(--text-meta);
  }
  .icon-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 15px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 15px;
    height: 1lh;
    min-height: 15px;
  }
  .icon :global(svg) {
    width: 15px;
    height: 15px;
  }
  .dot {
    width: var(--space-1);
    height: var(--space-1);
    border-radius: 50%;
    background: currentColor;
  }
  .connector {
    width: 1px;
    flex: 1;
    background: var(--border-hairline);
  }
  .copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-2);
  }
  .label {
    color: var(--ink-strong);
    font-weight: var(--weight-body);
  }
  .description {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* Markdown keeps the plain description's type: prose-sm restates its own
     size and colour on streamdown's root, so they are handed back here, and
     block margins collapse so a step is exactly as tall as its text. */
  .description.md {
    white-space: normal;
  }
  .description.md :global(.prose) {
    font-size: inherit;
    line-height: inherit;
    color: inherit;
  }
  .description.md :global(.prose > *),
  .description.md :global(p),
  .description.md :global(ul),
  .description.md :global(ol) {
    margin-block: 0;
  }
  .description.md :global(.prose > * + *) {
    margin-top: var(--space-1);
  }
  .description.md :global(ul),
  .description.md :global(ol) {
    padding-left: var(--space-5);
  }
  .description.md :global(strong) {
    color: var(--ink-strong);
  }
  /* prose wraps inline code in literal backticks; the code face already
     marks it. */
  .description.md :global(code::before),
  .description.md :global(code::after) {
    content: none;
  }
  .description.md :global(code) {
    font-family: var(--font-mono);
  }
  @media (prefers-reduced-motion: no-preference) {
    .copy {
      animation: step-in 200ms var(--ease-out) var(--step-delay) backwards;
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
  @keyframes step-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
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
