<script lang="ts" module>
  export type StepStatus = "complete" | "active" | "pending";
</script>

<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { untrack } from "svelte";
  import { Markdown } from "$lib/components/ui/markdown";
  import { IconCheck, IconGlobe, IconSearch } from "$lib/icons";
  import { getSizeContext } from "../thinking-indicator/size-context";

  let {
    icon = "dot",
    showIcon = true,
    label = "",
    description,
    status = "complete",
    enters = false,
    fades = false,
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
    /**
     * This step is new — it appeared under a block already on screen — and
     * fades in (--dur-menu). Read once, at mount: a step drawn with its block
     * (history, a block opened, a remount) never replays.
     */
    enters?: boolean;
    /** Chunks streaming into this step's text fade in as they land. */
    fades?: boolean;
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
  const entering = untrack(() => enters);
</script>

{#if status !== "pending"}
  <div
    class="step {className}"
    data-size={size?.() ?? "default"}
    data-slot="thinking-step"
    data-status={status}
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
    <div class="copy" class:enters={entering}>
      {#if label}
        <span class="label" class:shimmer={status === "active"}>{label}</span>
      {/if}
      {#if description && markdown}
        <div class="description md">
          <Markdown
            {fades}
            source={description}
            streaming={status === "active"}
          />
        </div>
      {:else if description}
        <span class="description" class:shimmer={!label && status === "active"}
          >{description}</span
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
    min-inline-size: 0;
    font-size: var(--text-label);
    line-height: var(--leading-body);

    &[data-size="compact"] {
      font-size: var(--text-meta);
    }
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
    inline-size: 16px;
    block-size: 1lh;
    min-block-size: 16px;

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
    }
  }
  .dot {
    inline-size: var(--space-1);
    block-size: var(--space-1);
    border-radius: 50%;
    background: currentColor;
  }
  .connector {
    inline-size: 1px;
    flex: 1;
    background: var(--border-hairline);
  }
  .copy {
    min-inline-size: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block-end: var(--space-2);
  }
  .label {
    color: var(--ink-strong);
    font-weight: var(--weight-body);
  }
  .description {
    white-space: pre-wrap;
    overflow-wrap: anywhere;

    /* Markdown keeps the plain description's type: prose-sm restates its own
       size and colour on streamdown's root, so they are handed back here, and
       block margins collapse so a step is exactly as tall as its text. */
    &.md {
      white-space: normal;

      & :global(.prose) {
        font-size: inherit;
        line-height: inherit;
        color: inherit;
      }
      & :global(.prose > *),
      & :global(p),
      & :global(ul),
      & :global(ol) {
        margin-block: 0;
      }
      & :global(.prose > * + *) {
        margin-block-start: var(--space-1);
      }
      & :global(ul),
      & :global(ol) {
        padding-inline-start: var(--space-5);
      }
      & :global(strong) {
        color: var(--ink-strong);
      }
      /* prose wraps inline code in literal backticks; the code face already
         marks it. */
      & :global(code::before),
      & :global(code::after) {
        content: none;
      }
      & :global(code) {
        font-family: var(--font-mono);
      }
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .copy.enters {
      animation: step-in var(--dur-menu) var(--ease-out) backwards;
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
      animation: shimmer var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes step-in {
    from {
      opacity: 0;
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
