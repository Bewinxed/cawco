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
   * transcript's start edge (--spacing-space-7, --spacing-space-5 under the desk line).
   */
  const emptyStateVariants = tv({
    base: "flex flex-col items-start gap-space-2 py-space-6 text-start",
    variants: {
      inline: {
        true: "mark-line flex-row flex-wrap items-center gap-x-space-2 gap-y-space-1 py-0",
      },
      /* DESIGN.md, The Alignment Rule. `block`: a short block alone in open
         room (a mark, a title, a line, one button), centred as one block:
         the mark, title and why centre on the block's own vertical axis,
         and so does the action (emptyActionVariants' centre): its box
         centres what it holds, so a lone button stands under the line as
         one block, while a child as wide as the box stays full width.
         `mark`: the mark alone centres over what is drawn under it; the
         title, the why and the action start on one left edge. The action
         spans the block (emptyActionVariants), so the mark stands over its
         middle; where it draws nothing (its box empty), the block shrinks
         to its words and is centred in the room it had, so the mark stands
         over their middle, never over an empty column, and the block keeps
         its surface's centre. */
      centre: {
        block:
          "[&>:not([data-box])]:self-center [&>:not([data-box])]:text-center",
        mark: "[&>:first-child]:self-center has-[>[data-box]:empty]:mx-auto has-[>[data-box]:empty]:w-fit has-[>[data-box]:empty]:max-w-full",
      },
      pad: {
        pane: "px-space-6",
        transcript: "px-space-7 max-desk:px-space-5",
      },
    },
  });

  /**
   * Its action's looks: `fill`, an action as wide as the block (a column of
   * starters). `centre` `block`: the box stands on the block's axis and
   * centres what it holds, `fill` or not; a full-width child still fills
   * it. `centre` `mark`: the box keeps the block's start edge and spans
   * it, so the mark centred over the block stands over what it draws.
   */
  const emptyActionVariants = tv({
    base: "mt-space-2",
    variants: {
      inline: { true: "mt-0 flex-none" },
      centre: {
        block: "flex flex-col items-center self-center",
        mark: "self-stretch",
      },
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
   * lines. `centre` (DESIGN.md, The Alignment Rule): `block` centring a
   * short block alone in open room as one block, `mark` centring the mark
   * alone over what is drawn under it, the rest on one left edge.
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
    centre,
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
  class={cn(emptyStateVariants({ inline, centre, pad }), className)}
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
      {#if line}
        <span aria-hidden="true">·</span>
        <span data-slot="empty-line">{@render why()}</span>
      {/if}
    </p>
  {:else}
    <!-- The title in the title role, the why in muted body, each at the
         short reading measure (DESIGN.md, Empty: "up to 60ch"); a name with
         no break in it (a view's, a filter's) breaks rather than pushing
         the block past its column. -->
    <p
      class="max-w-c-measure-short type-title text-ink-strong text-balance wrap-anywhere"
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
  <div class={emptyActionVariants({ inline, centre, actionWidth })} data-box>
    {@render action()}
  </div>
</div>
