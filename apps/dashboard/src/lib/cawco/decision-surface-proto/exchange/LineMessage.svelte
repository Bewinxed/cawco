<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";
  import { ARRIVE } from "./motion.js";

  /**
   * A message's frame in the thread: the speaker's glyph in the lead column,
   * then the speaker and the time on one line, then what was said. Every
   * message shares these two edges, so the thread reads down one column.
   */
  let {
    icon: Icon,
    speaker,
    at,
    tone = "agent",
    children,
  }: {
    icon: Component<SVGAttributes<SVGSVGElement>>;
    speaker: string;
    at?: string;
    /** His own words sit in the reader's well; everyone else's on the field. */
    tone?: "agent" | "you";
    children: Snippet;
  } = $props();
</script>

<div class={cn("grid min-w-0 grid-cols-mark-fluid gap-x-space-3", ARRIVE)}>
  <Icon
    aria-hidden="true"
    class={cn(
      "mt-px size-icon-md",
      tone === "you" ? "text-ink-strong" : "text-ink-muted"
    )}
  />
  <div class="flex min-w-0 flex-col gap-space-2">
    <p class="mark-line flex flex-wrap items-baseline gap-x-space-2">
      <span class="type-label text-ink-row">{speaker}</span>
      {#if at}<span class="type-meta text-ink-muted tabular-nums">{at}</span
        >{/if}
    </p>
    <div
      class={cn(
        "flex min-w-0 flex-col gap-space-3",
        tone === "you" &&
          "rounded-md border border-well-edge bg-surface-well p-space-3"
      )}
    >
      {@render children()}
    </div>
  </div>
</div>
