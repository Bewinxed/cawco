<script lang="ts">
  /**
   * An option's face in the card's option groups: its glyph or brand mark,
   * its name, the one line saying what picking it does, and the kit's
   * spinner at its end while the hub has not yet taken the press on it. A
   * note for trouble (Signed out) stands after the name, in the status ink;
   * a tag (Connected) in the quiet ink. One that opens a step of its own
   * rather than picking (Connect Linear) ends its first line on a chevron,
   * as a row that opens more does.
   *
   * In a row (`list`), the glyph stands in a lead column and the name and
   * line share its text edge. In a tile (`tile`), the glyph and the name
   * share the first line, and the line runs under both from the tile's
   * edge, so a narrow tile keeps its width for words.
   */
  import { cardWords } from "@cawco/core/words/project-details";
  import type { Component, Snippet } from "svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronRight } from "#lib/icons.js";

  let {
    name,
    line,
    glyph: Glyph,
    mark,
    note,
    tag,
    waiting = false,
    tile = false,
    opens = false,
  }: {
    name: string;
    line?: string;
    glyph?: Component;
    /** A brand mark, in place of a glyph. */
    mark?: Snippet;
    /** A trouble said beside the name. */
    note?: string;
    /** A plain fact said beside the name. */
    tag?: string;
    /** The hub has not taken this press yet. */
    waiting?: boolean;
    /** It stands in a tile: the line under the glyph and the name. */
    tile?: boolean;
    /** Pressed, it opens a step of its own rather than picking. */
    opens?: boolean;
  } = $props();
</script>

{#snippet lead()}
  {#if mark}
    <span class="mt-px flex flex-none">{@render mark()}</span>
  {:else if Glyph}
    <Glyph
      aria-hidden="true"
      class="mt-px size-icon-md flex-none text-ink-muted"
    />
  {/if}
{/snippet}

{#snippet title()}
  <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-space-2">
    <span class="type-label text-pretty text-ink-strong">{name}</span>
    {#if note}
      <span class="type-meta text-status-attn-ink">{note}</span>
    {:else if tag}
      <span class="type-meta text-ink-muted">{tag}</span>
    {/if}
  </span>
{/snippet}

{#snippet wait()}
  {#if waiting}
    <Spinner aria-label={cardWords.sent} class="mt-px flex-none" tone="muted" />
  {:else if opens}
    <IconChevronRight
      aria-hidden="true"
      class="mt-px size-icon-sm flex-none text-ink-muted"
    />
  {/if}
{/snippet}

{#if tile}
  <span class="flex w-full min-w-0 flex-col gap-space-1 text-start">
    <span class="flex min-w-0 items-start gap-space-2">
      {@render lead()}
      <span class="min-w-0 flex-1 type-label text-pretty text-ink-strong"
        >{name}</span
      >
      {@render wait()}
    </span>
    {#if note}
      <span class="type-meta text-status-attn-ink">{note}</span>
    {:else if tag}
      <span class="type-meta font-medium text-ink-strong">{tag}</span>
    {/if}
    {#if line}
      <span class="type-meta text-pretty text-ink-muted">{line}</span>
    {/if}
  </span>
{:else}
  <span class="flex min-w-0 items-start gap-space-2">
    {@render lead()}
    <span class="flex min-w-0 flex-1 flex-col gap-px">
      {@render title()}
      {#if line}
        <span class="type-meta text-pretty text-ink-muted">{line}</span>
      {/if}
    </span>
    {@render wait()}
  </span>
{/if}
