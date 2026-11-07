<script lang="ts" module>
  /** Whose words a filter keeps: everyone's, or one kind of speaker's. */
  export type Whose = "all" | "me" | "agent" | "tools" | "delegates";
  /** What find has to say: places, none, a machine that did not answer, a live turn adding one. */
  export type Finding = "places" | "nothing" | "unreached" | "live";
</script>

<script lang="ts">
  /**
   * The places find found, as a surface of the conversation's own (frame,
   * shaping only): every place the words are in, a row each, oldest first,
   * the one stepped to chosen; above them, whose words to keep, each with
   * its count. On a desk it stands in the side panel beside the
   * transcript (SideSplit's side); narrow (a phone, Caw's panel) it rises
   * out of the grown composer as the composer's layer, as the plan does.
   *
   * Made of Jump's parts: its chips, its row (FindRow), its coverage line.
   */
  import FindRow from "#lib/cawco/find/FindRow.svelte";
  import type { Row } from "#lib/cawco/find/find-rows.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { IconSearch } from "#lib/icons.js";

  let {
    words,
    rows,
    activeKey,
    filters,
    filter,
    finding,
    narrow = false,
    max = 380,
    machine,
    onfilter,
    onpick,
  }: {
    words: string;
    /** The places the filter keeps, oldest first. */
    rows: readonly Row[];
    activeKey: string | null;
    filters: readonly { value: Whose; label: string; count: number }[];
    filter: Whose;
    finding: Finding;
    /** A layer of the composer, not the side panel. */
    narrow?: boolean;
    /** Narrow, its tallest, in px: the place found stays readable above it. */
    max?: number;
    /** The machine whose transcript this is, by name. */
    machine: string;
    onfilter: (value: Whose) => void;
    onpick: (key: string) => void;
  } = $props();
</script>

<section
  data-find-frame
  data-narrow={narrow || undefined}
  class="group/places flex min-h-0 flex-auto flex-col bg-surface-raised data-narrow:max-h-(--places-max) data-narrow:rounded-lg data-narrow:border data-narrow:border-border-control data-narrow:shadow-overlay"
  aria-label="Places"
  style:--places-max="{max}px"
>
  {#if finding !== "nothing"}
    <header
      class="flex flex-none flex-col gap-space-2 px-space-4 pt-space-4 pb-space-3 group-data-narrow/places:px-space-3 group-data-narrow/places:pt-space-3"
    >
      <h2
        class="m-0 flex items-baseline gap-space-2 type-label text-ink-strong"
      >
        <span class="min-w-0 truncate">“{words}”</span>
        <span class="num type-meta text-ink-muted"
          >{filters[0].count} places</span
        >
      </h2>
      <div
        class="flex flex-wrap items-center gap-space-1"
        role="toolbar"
        aria-label="Whose words"
      >
        {#each filters as one (one.value)}
          <button
            class="select-none inline-flex items-center gap-space-1 h-c-pill-h px-space-3 border border-border-control rounded-pill bg-surface-raised type-label text-ink-muted aria-pressed:border-transparent aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover disabled:opacity-50"
            aria-pressed={filter === one.value}
            disabled={one.count === 0}
            onclick={() => onfilter(one.value)}
            type="button"
            >{one.label}<span class="num text-ink-subtle">{one.count}</span
            ></button
          >
        {/each}
      </div>
      {#if finding === "unreached"}
        <p class="m-0 type-meta text-ink-muted">
          {machine} didn't answer, so these are the places in the turns on screen<span
            class="px-space-1">·</span
          ><button
            class="select-none border-none p-0 bg-transparent text-link-ink"
            type="button">Retry</button
          >
        </p>
      {/if}
    </header>
  {/if}
  {#if finding === "nothing"}
    <div class="px-space-4 py-space-4 group-data-narrow/places:px-space-3">
      <EmptyState
        icon={IconSearch}
        inline={!narrow}
        line="It may have been said in another session."
        title="Nothing in this conversation says “{words}”"
      >
        {#snippet action()}
          <Button size="sm" variant="outline">Find in every session</Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div
      class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain p-space-1 pt-0 [&_[data-find-row][data-active]]:bg-surface-hover"
      {@attach highlight({ rows: "[data-find-row]", hovered: "[data-active]" })}
      role="listbox"
      aria-label="Places"
    >
      {#each rows as row (row.key)}
        <FindRow
          active={row.key === activeKey}
          id={`place-${row.key}`}
          now={Date.now()}
          onpick={() => onpick(row.key)}
          {row}
        />
      {/each}
    </div>
  {/if}
</section>
