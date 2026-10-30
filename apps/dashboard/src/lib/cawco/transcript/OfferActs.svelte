<script lang="ts">
  /**
   * An offer's answers under its note (DesignOfferActions, LfsOfferActions):
   * what was answered, in the note's quiet meta words, then its buttons (the
   * offer's while it stands, or where its answer leads), and the hub's
   * refusal under them on a line of its own.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    children,
    class: className,
    problem,
    said,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    children?: Snippet;
    problem: string | null;
    /** What was answered; null while the offer stands. */
    said: string | null;
  } = $props();
</script>

<div
  data-slot="offer-acts"
  class={cn("flex flex-wrap items-center gap-space-2 mt-space-2", className)}
  {...rest}
>
  {#if said}
    <span class="text-size-meta font-normal text-ink-muted">{said}</span>
  {/if}
  {@render children?.()}
  {#if problem}
    <p class="basis-full text-size-meta font-normal text-status-fail-ink">
      {problem}
    </p>
  {/if}
</div>
