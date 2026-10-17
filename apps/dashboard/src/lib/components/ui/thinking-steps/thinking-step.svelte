<script lang="ts" module>
  /**
   * `pending` is not drawn; `ahead` is drawn muted, a step still to come in
   * a column that shows how long it is (a project's move).
   */
  export type StepStatus = "complete" | "active" | "pending" | "ahead";
</script>

<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { untrack } from "svelte";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { restOffscreen } from "#lib/cawco/motion/rest.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { IconCheck, IconGlobe, IconSearch } from "#lib/icons.js";
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
   * The light over an active step's words: its muted ink, strong at the
   * middle of a band three times the words' width, which the shimmer
   * keyframes slide across them once a breath.
   */
  const SHIMMER =
    "linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%)";

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
  <!-- literal: 15px (the icon column), 16px (the icon box) -->
  <div
    class="flex min-w-0 gap-space-2 text-size-body font-normal leading-body size-compact:text-size-meta {className}"
    data-size={size?.() ?? "default"}
    data-slot="thinking-step"
    data-status={status}
    {@attach restOffscreen}
  >
    <div
      aria-hidden="true"
      class="flex shrink-0 grow-0 basis-(--icon-col) flex-col items-center"
      style:--icon-col="15px"
    >
      <span
        data-slot="thinking-step-icon"
        class="grid h-lh min-h-(--icon-box) w-icon-md place-items-center status-ahead:text-ink-subtle"
        data-status={status}
        style:--icon-box="16px"
        >{#key glyph}
          <span
            data-slot="glyph"
            class="col-start-1 row-start-1 grid place-items-center"
            in:glyphFade
            out:glyphFade
            >{#if glyph}
              {@const Glyph = glyph}
              <Glyph class="size-icon-md" />
            {:else}
              <!-- literal: 50% -->
              <span
                data-slot="dot"
                class="size-space-1 rounded-(--dot-round) bg-current"
                style:--dot-round="50%"
              ></span>
            {/if}</span
          >
        {/key}</span
      >
      {#if !isLast}
        <span class="w-px flex-1 bg-border-hairline" in:draw></span>
      {/if}
    </div>
    <div
      class="flex min-w-0 flex-1 flex-col gap-space-1 pb-space-2"
      data-enters={entering || undefined}
    >
      <!-- literal: 300% 100% (the sweep three times the words' width) -->
      {#if label}
        <span
          data-slot="thinking-step-label"
          class="font-normal text-ink-strong transition-[color] dur-control ease-out status-ahead:text-ink-muted motion-safe:not-status-ahead:data-shimmer:text-transparent motion-safe:data-shimmer:bg-(image:--step-shimmer) motion-safe:data-shimmer:bg-size-(--step-shimmer-size) motion-safe:data-shimmer:bg-clip-text"
          data-shimmer={status === "active" || undefined}
          data-status={status}
          style:--step-shimmer={SHIMMER}
          style:--step-shimmer-size="300% 100%">{label}</span
        >
      {/if}
      {#if description && markdown}
        <div data-slot="md" class="wrap-anywhere whitespace-normal">
          <Markdown
            {fades}
            source={description}
            streaming={status === "active"}
          />
        </div>
      {:else if description}
        <span
          class="wrap-anywhere whitespace-pre-wrap motion-safe:data-shimmer:text-transparent motion-safe:data-shimmer:bg-(image:--step-shimmer) motion-safe:data-shimmer:bg-size-(--step-shimmer-size) motion-safe:data-shimmer:bg-clip-text"
          data-shimmer={(!label && status === "active") || undefined}
          style:--step-shimmer={SHIMMER}
          style:--step-shimmer-size="300% 100%">{description}</span
        >
      {/if}
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  /* residual: foreign-dom */
  /* Markdown keeps the plain description's type: prose-sm restates its own
     size and colour on streamdown's root, so they are handed back here, and
     block margins collapse so a step is exactly as tall as its text. */
  [data-slot="md"] {
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
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-enters] {
      animation: step-in var(--dur-menu) var(--ease-out) backwards;
    }
    [data-shimmer] {
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
