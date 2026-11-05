<script lang="ts">
  /**
   * One place in the project's rail: its glyph in the row's 28px lead
   * column, its name with the needs-you dot beside the word, its count in
   * tabular figures on the row's trailing edge, and under the name its one
   * live fact (the option's "name, count and one live fact, in that order").
   * The same row stands in the desk's rail and in the phone's places sheet,
   * so the sheet is still the glance.
   */
  import type { Component } from "svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import type { PlaceFact } from "./facts";

  let {
    name,
    glyph: Glyph,
    fact,
    chosen = false,
    reading = false,
    onchoose,
  }: {
    name: string;
    glyph: Component;
    fact: PlaceFact;
    /** It is the place on screen. */
    chosen?: boolean;
    /** The first read is out: the fact stands as a skeleton at its size. */
    reading?: boolean;
    onchoose: () => void;
  } = $props();
</script>

<button
  type="button"
  class="group/place press-tint focus-inset touch-hit flex w-full min-w-0 items-start gap-space-3 rounded-sm px-space-2 py-space-2 text-start text-ink-row hover:bg-surface-hover aria-current-page:bg-selected-bg aria-current-page:text-selected-ink aria-current-page:hover:bg-selected-bg"
  aria-current={chosen ? "page" : undefined}
  data-state={fact.state}
  onclick={onchoose}
>
  <span
    class="mark-cell grid h-c-row-mark w-c-row-lead flex-none place-items-center text-ink-muted group-aria-current-page/place:text-selected-icon"
  >
    <Glyph class="size-icon-md" aria-hidden="true" />
  </span>
  <span class="flex min-w-0 flex-1 flex-col gap-space-1">
    <span class="mark-line flex min-w-0 items-center gap-space-2">
      <span
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label"
        >{name}</span
      >
      {#if fact.needs}
        <span
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
          aria-hidden="true"
        ></span>
      {/if}
      {#if fact.count !== null}
        <span
          class="ms-auto min-w-c-rail-count-min flex-none text-end type-meta num text-ink-muted group-aria-current-page/place:text-selected-ink"
          >{fact.count}</span
        >
      {/if}
    </span>
    {#if reading}
      <Skeleton line="meta" width="title" radius="text" />
    {:else}
      <span
        class="type-meta text-ink-muted group-data-[state=stale]/place:text-ink-subtle"
      >
        {#each fact.parts as part, index (index)}
          {#if index > 0}<span aria-hidden="true">{" · "}</span>{/if}<span
            class="data-[tone=attn]:text-status-attn-ink data-[tone=fail]:text-status-fail-ink"
            data-tone={part.tone}>{part.text}</span
          >
        {/each}
      </span>
    {/if}
  </span>
</button>
