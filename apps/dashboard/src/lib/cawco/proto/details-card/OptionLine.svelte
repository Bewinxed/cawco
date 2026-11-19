<script lang="ts">
  /**
   * An option's face in the card's lists: its glyph or mark in the lead
   * column, its name, the one line saying what picking it does, and the
   * kit's spinner at its end while the hub has not yet taken the press on
   * it. A note for trouble (Signed out) stands after the name, in the
   * status ink.
   */
  import type { Component, Snippet } from "svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cardWords } from "./words";

  let {
    name,
    line,
    glyph: Glyph,
    mark,
    note,
    waiting = false,
  }: {
    name: string;
    line?: string;
    glyph?: Component;
    /** A brand mark in the lead column, in place of a glyph. */
    mark?: Snippet;
    /** A trouble said beside the name. */
    note?: string;
    /** The hub has not taken this press yet. */
    waiting?: boolean;
  } = $props();
</script>

<span class="flex min-w-0 items-start gap-space-2">
  {#if mark}
    <span class="mt-px flex flex-none">{@render mark()}</span>
  {:else if Glyph}
    <Glyph
      aria-hidden="true"
      class="mt-px size-icon-md flex-none text-ink-muted"
    />
  {/if}
  <span class="flex min-w-0 flex-1 flex-col gap-px">
    <span class="flex flex-wrap items-baseline gap-x-space-2">
      <span class="type-label text-ink-strong">{name}</span>
      {#if note}
        <span class="type-meta text-status-attn-ink">{note}</span>
      {/if}
    </span>
    {#if line}
      <span class="type-meta text-pretty text-ink-muted">{line}</span>
    {/if}
  </span>
  {#if waiting}
    <Spinner aria-label={cardWords.sent} class="mt-px flex-none" tone="muted" />
  {/if}
</span>
