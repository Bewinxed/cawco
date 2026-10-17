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
  class="group/col flex min-h-0 flex-col gap-space-1 rounded-lg bg-surface-band p-space-1 transition-[background-color,opacity] dur-control ease-out data-closed:opacity-50 data-over:bg-surface-hover kind-you:bg-brand-wash"
  data-closed={closed ? "" : undefined}
  data-kind={kind ?? "none"}
  data-over={over ? "" : undefined}
  data-picking={picking ? "" : undefined}
  {@attach drop}
>
  <header data-slot="head" class="flex flex-col gap-0 px-space-2 py-space-1">
    <span class="mark-line flex min-h-c-btn-h-xs items-center gap-space-2">
      {#if kind === "you"}
        <IconNeedsYou
          aria-hidden="true"
          class="-me-space-1 size-icon-md flex-none text-status-attn-glyph"
        />
      {/if}
      <h3
        data-slot="name"
        class="min-w-0 overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong group-kind-you/col:text-brand-ink"
      >
        {label}
      </h3>
      <span
        data-num
        data-slot="count"
        class="num ms-auto type-meta text-ink-subtle"
        ><MorphText text={String(count)} /></span
      >
    </span>
    <span
      data-slot="kind"
      class="flex-none type-code liga-none whitespace-nowrap text-ink-subtle group-kind-you/col:text-status-attn-ink"
      >{kindWord}</span
    >
  </header>
  <ol
    data-slot="cards"
    class="m-0 flex min-h-c-btn-h-lg flex-auto list-none flex-col gap-space-1 overflow-y-auto p-0 max-phone:flex-none max-phone:overflow-visible"
    {@attach reflow()}
  >
    {#each cards as task (task.id)}
      {@const fault = refused?.(task.id) ?? null}
      {@const on = picked?.(task.id) ?? false}
      <li
        class="group/card data-pickable:relative"
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
          <!-- literal: 1rem -->
          <Checkbox
            data-task-column-pick
            aria-label="Pick {task.id} {task.title}"
            checked={on}
            class="absolute end-space-3 top-(--pick-top) opacity-0 transition-[opacity] dur-control ease-out group-focus-within/card:opacity-100 group-data-picked/card:opacity-100 group-data-picking/col:opacity-100 group-hover/card:opacity-100 coarse:opacity-100"
            onclick={(event: MouseEvent) => {
              event.preventDefault();
              onpick(task.id, !on, event.shiftKey);
            }}
            style="--pick-top: calc(var(--space-2) + (var(--c-badge-h) - 1rem) / 2)"
          />
        {/if}
        {#if moving?.(task.id)}
          <span
            data-slot="moving"
            class="mark-line flex items-center gap-space-1 px-space-2 pt-space-1 pb-0 type-meta text-ink-muted"
            ><Spinner aria-hidden="true" class="size-icon-sm" /><span
              >Moving…</span
            ></span
          >
        {/if}
        <RowFault again={fault?.again} reason={fault?.reason} />
      </li>
    {/each}
  </ol>
  {#if foot}
    <div data-slot="foot" class="flex-none">{@render foot()}</div>
  {/if}
</section>

<style>
  /* residual: foreign-dom — TaskCard's root and head take no class. A dropped
     card stands where the hand put it, quieter, saying it moves, until the hub
     answers; a card that can be picked keeps its head's end clear for the tick;
     a picked card takes the selected wash. */
  li[data-moving] > :global(:first-child) {
    opacity: 0.6;
  }
  li[data-pickable] > :global([data-slot="task-card"] [data-slot="head"]) {
    padding-inline-end: calc(var(--space-4) + var(--space-2));
  }
  li[data-picked] > :global([data-slot="task-card"]) {
    background: var(--selected-bg);
  }
  li > :global([data-slot="row-fault"]) {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);
  }
  /* residual: foreign-dom — the board's New task button, from NewTaskForm. */
  [data-slot="foot"] > :global([data-slot="button"]) {
    inline-size: 100%;
  }
  /* residual: unmapped — the column's hairline ring (no token carries it). */
  [data-slot="column"] {
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
</style>
