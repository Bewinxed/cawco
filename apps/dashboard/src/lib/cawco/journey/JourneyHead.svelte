<script lang="ts">
  /**
   * A journey card's title line: the card's mark in the lead column (Caw's
   * panel's 28px one), its tick once the journey is done; in a narrow card,
   * where the steps take the card's own edge, the mark stands in the steps'
   * mark column and the title on their labels' edge. `end` stands after the
   * title on its line (a status badge).
   */
  import type { Component, Snippet } from "svelte";
  import { IconSuccess } from "#lib/icons.js";

  let {
    title,
    icon: Mark,
    done = false,
    end,
  }: {
    title: string | Snippet;
    /** The card's own glyph while the journey stands. */
    icon: Component<{ "aria-hidden"?: "true"; class?: string }>;
    done?: boolean;
    end?: Snippet;
  } = $props();
</script>

<div
  class="mark-line flex min-w-0 items-center gap-space-3 @max-field-group:gap-space-2"
>
  <span
    class="grid w-c-row-lead flex-none place-items-center text-ink-muted @max-field-group:w-icon-md"
    data-box
  >
    {#if done}
      <IconSuccess
        aria-hidden="true"
        class="size-icon-md text-status-done-ink"
      />
    {:else}
      <Mark aria-hidden="true" class="size-icon-md" />
    {/if}
  </span>
  <h3 class="min-w-0 text-label text-ink-strong text-balance">
    {#if typeof title === "string"}{title}{:else}{@render title()}{/if}
  </h3>
  {@render end?.()}
</div>
