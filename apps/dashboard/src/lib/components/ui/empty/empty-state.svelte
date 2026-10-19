<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Its callers' looks: standing in a pane, a pane's own side pads; standing
   * where a transcript's first row would, the transcript's start edge
   * (--space-7, --space-5 under the desk line).
   */
  export const emptyStateVariants = tv({
    variants: {
      pad: {
        pane: "px-space-6",
        transcript: "px-space-7 max-desk:px-space-5",
      },
    },
  });

  /** Its action's looks: `fill`, an action as wide as the block (a column of starters). */
  export const emptyActionVariants = tv({
    variants: { actionWidth: { fill: "self-stretch" } },
  });

  export type EmptyStateLooks = VariantProps<typeof emptyStateVariants> &
    VariantProps<typeof emptyActionVariants>;
</script>

<script lang="ts">
  /**
   * The one empty state: a Solar duotone mark, a title in the title role,
   * one plain line saying why, and at most one next action. It is a claim
   * that there is nothing to show, so it renders only once the data is known
   * to be empty — never while it is still being read. `mark` stands in
   * for the glyph where something drawn is the mark (Caw on an empty board).
   * Mark, title, line and action share one start edge (app.css
   * `.kit-empty`); a surface places the block, never centres its lines.
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
    pad,
    actionWidth,
    class: className,
    ...restProps
  }: Omit<HTMLAttributes<HTMLDivElement>, "title"> &
    EmptyStateLooks & {
      icon?: Component;
      mark?: Snippet;
      title: string;
      /** Why there is nothing; absent where the title and the action say it all. */
      line?: string | Snippet;
      action?: Snippet;
      inline?: boolean;
    } = $props();
</script>

<div
  class={cn(
    "kit-empty",
    inline && "kit-empty-inline mark-line",
    emptyStateVariants({ pad }),
    className
  )}
  data-slot="empty"
  {...restProps}
>
  {#if mark}
    {@render mark()}
  {:else if Mark}
    <Mark aria-hidden="true" data-slot="empty-mark" />
  {/if}
  {#snippet why()}
    {#if typeof line === "string"}
      {line}
    {:else if line}
      {@render line()}
    {/if}
  {/snippet}
  {#if inline}
    <!-- One sentence: what is missing, then why. -->
    <p class="kit-empty-line mark-text">
      <span class="kit-empty-title">{title}</span>
      <span aria-hidden="true">·</span>
      {@render why()}
    </p>
  {:else}
    <p class="kit-empty-title">{title}</p>
    {#if line}
      <p class="kit-empty-line mark-text">{@render why()}</p>
    {/if}
  {/if}
  {#if action}
    <div
      class={["kit-empty-action", emptyActionVariants({ actionWidth })]}
      data-box
    >
      {@render action()}
    </div>
  {/if}
</div>
