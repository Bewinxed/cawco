<script lang="ts" module>
  export type StepStatus = "complete" | "active" | "pending";
</script>

<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { untrack } from "svelte";
  import { dur, easeOut } from "$lib/cawco/motion/curves.svelte";
  import { restOffscreen } from "$lib/cawco/motion/rest";
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
  /** What the icon slot draws: the step's icon, or its dot. */
  const glyph = $derived(showIcon && Icon ? Icon : null);
  const entering = untrack(() => enters);

  /**
   * A step's glyph changing cross-fades in its cell (--dur-control), and the
   * connector a step gains when the next one starts draws down from it
   * (--dur-toggle). Neither plays on a step's first render.
   */
  function glyphFade(_node: Element) {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  function draw(_node: Element) {
    return {
      duration: dur("--dur-toggle"),
      easing: easeOut,
      css: (t: number) => `transform-origin: top; scale: 1 ${t}`,
    };
  }
</script>

{#if status !== "pending"}
  <div
    class="step {className}"
    data-size={size?.() ?? "default"}
    data-slot="thinking-step"
    data-status={status}
    {@attach restOffscreen}
  >
    <div aria-hidden="true" class="icon-column">
      <span class="icon"
        >{#key glyph}
          <span class="glyph" in:glyphFade out:glyphFade
            >{#if glyph}
              {@const Glyph = glyph}
              <Glyph />
            {:else}
              <span class="dot"></span>
            {/if}</span
          >
        {/key}</span
      >
      {#if !isLast}
        <span class="connector" in:draw></span>
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
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);

    &[data-size="compact"] {
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
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
  /* One cell, so an outgoing glyph and its replacement overlap. */
  .glyph {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
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
      & :global(p),
      & :global(ul),
      & :global(ol) {
        margin-block: 0;
      }
      /* Every block takes the gap above it and the first gives it back:
         `* + *` restyled the whole step per block streamed in. */
      & :global(.prose > *) {
        margin-block: var(--space-1) 0;
      }
      & :global(.prose > :first-child) {
        margin-block-start: 0;
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
