<script lang="ts">
  /**
   * One stage's column: its name and count, a quiet word for its kind under
   * them, and its cards in order. The board draws one per stage and takes
   * drops on it (`ondrop`); a view's StageColumn draws the same column with
   * nothing to drop. A `you` column takes the brand wash, its name the
   * brand ink, and its head the Needs-you glyph (design §2, Board).
   */
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import {
    KIND_LABEL,
    type StageKind,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import TaskCard from "./TaskCard.svelte";

  let {
    label,
    kind,
    cards,
    hrefOf,
    kindOf,
    dateOf = () => null,
    onopen,
    closed = false,
    over = false,
    drop,
    foot,
    moving,
    refused,
    archived = false,
    picked,
    onpick,
    picking = false,
  }: {
    /** The board's Archived rail: its cards are archived tasks, and its kind line says so. */
    archived?: boolean;
    /** Whether a card is picked for a bulk change; without it, no card is pickable. */
    picked?: (id: string) => boolean;
    /** Ticks or unticks a card; `range` with Shift, from the last one ticked. */
    onpick?: (id: string, on: boolean, range: boolean) => void;
    /** Any card on the board is picked: every card's tick stands. */
    picking?: boolean;
    label: string;
    kind: StageKind | null;
    cards: TaskSummary[];
    hrefOf: (id: string) => string;
    kindOf: (id: string) => StageKind | null | undefined;
    dateOf?: (id: string) => string | null;
    onopen: (id: string) => void;
    /** A card in the air may not come here: the column steps back. */
    closed?: boolean;
    /** A drop would land here. */
    over?: boolean;
    /** Makes the column a drop target. */
    drop?: Attachment<HTMLElement>;
    /** What stands under the cards: the board's new task. */
    foot?: Snippet;
    /** A card whose move the hub has not answered: it stands here, moving. */
    moving?: (id: string) => boolean;
    /** A move the hub refused: the card is back here, the reason under it. */
    refused?: (id: string) => { again: () => void; reason: string } | null;
  } = $props();

  const count = $derived(cards.length);
  /** The quiet word under the name: the stage's kind, or what the column holds. */
  const kindWord = $derived.by(() => {
    if (kind) {
      return KIND_LABEL[kind];
    }
    return archived ? "archived" : "not in stages.md";
  });
</script>

<section
  data-slot="column"
  aria-label="{label}, {count} {count === 1 ? 'task' : 'tasks'}"
  class="column"
  data-closed={closed ? "" : undefined}
  data-kind={kind ?? "none"}
  data-over={over ? "" : undefined}
  data-picking={picking ? "" : undefined}
  {@attach drop}
>
  <header data-slot="head" class="head">
    <span class="line mark-line">
      {#if kind === "you"}
        <IconNeedsYou aria-hidden="true" class="you-glyph" />
      {/if}
      <h3 data-slot="name" class="name">{label}</h3>
      <span data-num data-slot="count" class="count num"
        ><MorphText text={String(count)} /></span
      >
    </span>
    <span data-slot="kind" class="kind">{kindWord}</span>
  </header>
  <ol data-slot="cards" class="cards" {@attach reflow()}>
    {#each cards as task (task.id)}
      {@const fault = refused?.(task.id) ?? null}
      {@const on = picked?.(task.id) ?? false}
      <li
        aria-busy={moving?.(task.id) || undefined}
        data-archived={archived || undefined}
        data-flip
        data-moving={moving?.(task.id) || undefined}
        data-pickable={onpick ? "" : undefined}
        data-picked={on || undefined}
      >
        <TaskCard
          date={dateOf(task.id)}
          href={hrefOf(task.id)}
          {kindOf}
          {onopen}
          {task}
        />
        {#if onpick}
          <!-- The tick stands beside the card, not in it: the card is a link. -->
          <Checkbox
            data-task-column-pick
            aria-label="Pick {task.id} {task.title}"
            checked={on}
            class="pick"
            onclick={(event: MouseEvent) => {
              event.preventDefault();
              onpick(task.id, !on, event.shiftKey);
            }}
          />
        {/if}
        {#if moving?.(task.id)}
          <span data-slot="moving" class="moving mark-line"
            ><Spinner aria-hidden="true" /><span>Moving…</span></span
          >
        {/if}
        <RowFault again={fault?.again} reason={fault?.reason} />
      </li>
    {/each}
  </ol>
  {#if foot}
    <div data-slot="foot" class="foot">{@render foot()}</div>
  {/if}
</section>

<style>
  /* A dropped card stands where the hand put it, quieter, saying it moves,
     until the hub answers. */
  li[data-moving] > :global(:first-child) {
    opacity: 0.6;
  }
  .moving {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2) 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  /* A card that can be picked keeps its head's end clear for the tick,
     which stands over it on the head's line. The tick shows under the
     pointer, on focus, once any card is picked, and always on a finger. */
  li[data-pickable] {
    position: relative;
  }
  li[data-pickable] > :global(.task-card .head) {
    padding-inline-end: calc(var(--space-4) + var(--space-2));
  }
  li > :global(.pick) {
    position: absolute;
    inset-block-start: calc(var(--space-2) + (var(--c-badge-h) - 1rem) / 2);
    inset-inline-end: var(--space-3);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  li:focus-within > :global(.pick),
  li[data-picked] > :global(.pick),
  .column[data-picking] li > :global(.pick) {
    opacity: 1;
  }
  @media (hover: hover) and (pointer: fine) {
    li:hover > :global(.pick) {
      opacity: 1;
    }
  }
  @media (pointer: coarse) {
    li > :global(.pick) {
      opacity: 1;
    }
  }
  /* A picked card takes the selected wash. */
  li[data-picked] > :global(.task-card) {
    background: var(--selected-bg);
  }
  li > :global(.row-fault) {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-block-size: 0;
    padding: var(--space-1);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    transition:
      background-color var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-out);
  }
  /* The column a drop would land in. */
  .column[data-over] {
    background: var(--surface-hover);
  }
  /* A column the card in the air may not go to: still a target (the hub
     says why), only quieter. */
  .column[data-closed] {
    opacity: 0.5;
  }
  /* The `you` column: the brand wash, its name in the brand ink. */
  .column[data-kind="you"] {
    background: var(--brand-wash);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: var(--space-1) var(--space-2) var(--space-1);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-xs);
  }
  .head :global(.you-glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    flex: none;
    margin-inline-end: calc(var(--space-1) * -1);
    color: var(--status-attn-glyph);
  }
  .name {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .column[data-kind="you"] .name {
    color: var(--brand-ink);
  }
  /* A stage's kind is a word of stages.md, set as code. */
  .kind {
    flex: none;
    font: var(--type-code);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
    white-space: nowrap;
  }
  .column[data-kind="you"] .kind {
    color: var(--status-attn-ink);
  }
  .count {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .cards {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-1);
    min-block-size: var(--c-btn-h-lg);
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  /* On a phone the page scrolls, not the column: its cards stand whole. */
  @media (max-width: 639px) {
    .cards {
      flex: none;
      overflow: visible;
    }
  }
  .foot {
    flex: none;
  }
  .foot :global(.add-task) {
    inline-size: 100%;
  }
</style>
