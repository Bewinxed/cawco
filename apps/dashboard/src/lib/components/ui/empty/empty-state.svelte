<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The block (DESIGN.md, Empty): mark, title, why and one action on one
   * start edge, 7px apart, with 21px of block padding; never centred line
   * by line. `inline`: the same claim in a strip's room, the mark, then
   * what is missing and why as one sentence on one line, the action beside
   * it while there is room and under it when there is not, so the sentence
   * keeps its line. `pad`, its callers' looks: standing in a pane, a pane's
   * own side pads; standing where a transcript's first row would, the
   * transcript's start edge (--space-7, --space-5 under the desk line).
   */
  const emptyStateVariants = tv({
    base: "flex flex-col items-start gap-space-2 py-space-6 text-start",
    variants: {
      inline: {
        true: "mark-line flex-row flex-wrap items-center gap-x-space-2 gap-y-space-1 py-0",
      },
      /* Caw stands on the composition's axis (DESIGN.md, The Caw Stands On
         The Axis Rule): the mark, title and why centre on the block's own
         vertical axis; the action keeps its own layout. */
      axis: {
        true: "[&>:not([data-box])]:self-center [&>:not([data-box])]:text-center",
      },
      pad: {
        pane: "px-space-6",
        transcript: "px-space-7 max-desk:px-space-5",
      },
    },
  });

  /** Its action's looks: `fill`, an action as wide as the block (a column of starters). */
  const emptyActionVariants = tv({
    base: "mt-space-2",
    variants: {
      inline: { true: "mt-0 flex-none" },
      actionWidth: { fill: "self-stretch" },
    },
  });

  type EmptyStateLooks = VariantProps<typeof emptyStateVariants> &
    VariantProps<typeof emptyActionVariants>;
</script>

<script lang="ts">
  /**
   * The one empty state: a Solar duotone mark, a title in the title role,
   * one plain line saying why, and its one next action. It is a claim
   * that there is nothing to show, so it renders only once the data is known
   * to be empty — never while it is still being read. `mark` stands in
   * for the glyph where something drawn is the mark (Caw on an empty board).
   * Mark, title, line and action share one start edge
   * (`emptyStateVariants`); a surface places the block, never centres its
   * lines.
   * `inline`: the same claim in a strip's room (the usage strip), on one line
   * with its action beside it.
   */
  import type { Component, Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    icon: Mark,
    mark,
    title,
    line,
    action,
    inline = false,
    axis = false,
    pad,
    actionWidth,
    class: className,
    ...restProps
  }: Omit<HTMLAttributes<HTMLDivElement>, "title"> &
    EmptyStateLooks &
    /* The mark is the recipe's (DESIGN.md, Empty: "a 20px Solar duotone
       mark"), so no empty state stands without one: the glyph, or what is
       drawn in its place. */
    ({ icon: Component; mark?: never } | { icon?: never; mark: Snippet }) & {
      title: string;
      /** Why there is nothing; absent where the title and the action say it all. */
      line?: string | Snippet;
      /**
       * Its one action, never absent (DESIGN.md, The Empty Starts Work
       * Rule): the work that would fill it, or where that can't start, why
       * and the way by hand (cawco/EmptyAsk).
       */
      action: Snippet;
      inline?: boolean;
    } = $props();
</script>

<!-- mark-line: the block stacks its mark above the title; `inline` is a mark line through emptyStateVariants -->
<div
  class={cn(emptyStateVariants({ inline, axis, pad }), className)}
  data-slot="empty"
  {...restProps}
>
  {#if mark}
    {@render mark()}
  {:else if Mark}
    <!-- The 20px mark in muted ink, a step over the title; 16px and
         flush in a strip's room. -->
    <Mark
      aria-hidden="true"
      class={inline
        ? "size-icon-md flex-none text-ink-muted"
        : "mb-space-1 size-icon-lg text-ink-muted"}
      data-slot="empty-mark"
    />
  {/if}
  {#snippet why()}
    {#if typeof line === "string"}
      {line}
    {:else if line}
      {@render line()}
    {/if}
  {/snippet}
  {#if inline}
    <!-- One sentence: what is missing, then why, in meta. -->
    <p
      class="mark-text min-w-0 flex-[1_1_auto] type-meta text-ink-muted text-pretty wrap-anywhere [&_code]:text-label"
    >
      <span
        class="max-w-c-measure-short type-meta font-medium tracking-title text-ink-strong text-balance"
        data-slot="empty-title">{title}</span
      >
      <span aria-hidden="true">·</span>
      <span data-slot="empty-line">{@render why()}</span>
    </p>
  {:else}
    <!-- The title in the title role, the why in muted body, each at the
         short reading measure (DESIGN.md, Empty: "up to 60ch"); a name with
         no break in it (a view's, a filter's) breaks rather than pushing
         the block past its column. -->
    <p
      class="max-w-c-measure-short type-title tracking-title text-ink-strong text-balance wrap-anywhere"
      data-slot="empty-title"
    >
      {title}
    </p>
    {#if line}
      <p
        class="mark-text max-w-c-measure-short type-body text-ink-muted text-pretty wrap-anywhere [&_code]:text-label"
        data-slot="empty-line"
      >
        {@render why()}
      </p>
    {/if}
  {/if}
  <div class={emptyActionVariants({ inline, actionWidth })} data-box>
    {@render action()}
  </div>
</div>
