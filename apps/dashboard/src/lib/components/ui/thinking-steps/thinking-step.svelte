<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { cn, tv } from "#lib/utils.js";

  /**
   * `pending` is not drawn; `ahead` is drawn muted, a step still to come in
   * a column that shows how long it is (a project's move).
   */
  export type StepStatus = "complete" | "active" | "pending" | "ahead";

  /**
   * The step's glyph cell, a line tall and the transcript's 16px glyph cell
   * wide. Its ink: the body's by default, or the outcome the step stands for
   * (a move's steps: done, running, failed, waiting on the person, stopped).
   */
  const thinkingStepIcon = tv({
    base: "grid h-lh min-h-icon-md w-icon-md place-items-center status-ahead:text-ink-subtle",
    variants: {
      ink: {
        done: "text-status-done",
        active: "text-ink-strong",
        fail: "text-status-fail",
        attn: "text-status-attn",
        muted: "text-ink-muted",
      },
    },
  });

  export type StepInk = NonNullable<
    VariantProps<typeof thinkingStepIcon>["ink"]
  >;
</script>

<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { untrack } from "svelte";
  import { IconCheck, IconGlobe, IconSearch } from "#lib/icons.js";
  import {
    dur,
    easeOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { restOffscreen } from "#lib/platform/motion/rest.js";
  import { getSizeContext } from "../thinking-indicator/size-context";

  let {
    icon = "dot",
    showIcon = true,
    label = "",
    description,
    status = "complete",
    ink,
    enters = false,
    fades = false,
    isLast = false,
    markdown: Markdown,
    children,
    class: className = "",
  }: {
    icon?: "dot" | "search" | "globe" | "check" | Component;
    showIcon?: boolean;
    label?: string;
    description?: string;
    status?: StepStatus;
    /** The glyph's ink: the outcome the step stands for; none, the body's. */
    ink?: StepInk;
    /**
     * This step is new — it appeared under a block already on screen — and
     * fades in (--duration-fast). Read once, at mount: a step drawn with its block
     * (history, a block opened, a remount) never replays.
     */
    enters?: boolean;
    /** Chunks streaming into this step's text fade in as they land. */
    fades?: boolean;
    isLast?: boolean;
    /** Render the description as markdown, drawn by this, rather than plain streamed text. */
    markdown?: Component<{
      fades: boolean;
      source: string;
      streaming: boolean;
    }>;
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
   * A step's glyph changing cross-fades in its cell (--duration-fast), and the
   * connector a step gains when the next one starts draws down from it
   * (--duration-base). Neither plays on a step's first render.
   */
  function glyphFade(_node: Element) {
    return {
      duration: dur("--duration-fast"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  function draw(_node: Element) {
    return {
      duration: dur("--duration-base"),
      easing: easeOut,
      css: (t: number) => `transform-origin: top; scale: 1 ${t}`,
    };
  }
</script>

<!-- The light passing over an active step's words, as the thinking
     indicator draws it: the words again in the strong ink, masked to a band
     three times their width (`sheen-band`) that slides across them once a
     breath, the copy inside it sliding back the same distance on the same
     curve, so the letters stand still and only the light moves, all of it on
     the compositor. The copy is a third of the band, the words' own width,
     so it wraps on their lines; the overlay is the words' box, and clips the
     band to it. -->
{#snippet light(text: string)}
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    ><span
      class="loops absolute inset-y-0 start-0 text-ink-strong sheen-band animate-thinking-sheen"
      data-slot="sheen"
      ><span
        class="loops block w-1/3 animate-thinking-sheen-hold"
        data-slot="sheen-word">{text}</span
      ></span
    ></span
  >
{/snippet}

{#if status !== "pending"}
  <!-- The icon column is the icon's own width (the transcript's 16px glyph
       cell); the icon's box is at least that square and a line tall. -->
  <div
    class={cn(
      "flex min-w-0 gap-space-2 type-body size-compact:text-sm",
      className
    )}
    data-size={size?.() ?? "default"}
    data-slot="thinking-step"
    data-status={status}
    {@attach restOffscreen}
  >
    <div
      aria-hidden="true"
      class="flex shrink-0 grow-0 basis-icon-md flex-col items-center"
    >
      <span
        data-slot="thinking-step-icon"
        class={thinkingStepIcon({ ink })}
        data-status={status}
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
              <span data-slot="dot" class="size-space-1 rounded-pill bg-current"
              ></span>
            {/if}</span
          >
        {/key}</span
      >
      {#if !isLast}
        <span class="w-px flex-1 bg-border-hairline" in:draw></span>
      {/if}
    </div>
    <!-- A new step fades in; an active step's words carry the light: its
         muted ink, strong at the middle of a band three times the words'
         width, sliding across them once a breath (`light`). -->
    <div
      class="flex min-w-0 flex-1 flex-col gap-space-1 pb-space-2 motion-safe:data-enters:animate-fade-in motion-safe:data-enters:anim-dur-fast"
      data-enters={entering || undefined}
    >
      {#if label}
        <!-- The label wraps, never truncates: a long word (a branch, a path)
             breaks where it must, as the description does. -->
        <span
          data-slot="thinking-step-label"
          class="relative font-normal wrap-anywhere text-ink-strong transition-control status-ahead:text-ink-muted motion-safe:not-status-ahead:data-shimmer:text-ink-muted"
          data-shimmer={status === "active" || undefined}
          data-status={status}
          >{label}{#if status === "active" && motionOk.current}{@render light(
              label
            )}{/if}</span
        >
      {/if}
      {#if description && Markdown}
        <!-- Markdown keeps the plain description's type, and a step is
             exactly as tall as its text. -->
        <div
          data-slot="md"
          class="markdown-plain wrap-anywhere whitespace-normal"
        >
          <Markdown
            {fades}
            source={description}
            streaming={status === "active"}
          />
        </div>
      {:else if description}
        <span
          class="relative wrap-anywhere whitespace-pre-wrap motion-safe:data-shimmer:text-ink-muted"
          data-shimmer={(!label && status === "active") || undefined}
          >{description}{#if !label && status === "active" && motionOk.current}{@render light(
              description
            )}{/if}</span
        >
      {/if}
      {@render children?.()}
    </div>
  </div>
{/if}
