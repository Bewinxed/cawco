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
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
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
  }: {
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
  } = $props();
</script>

<section
  aria-label="{label}, {cards.length} {cards.length === 1 ? "task" : "tasks"}"
  class="column"
  data-closed={closed ? "" : undefined}
  data-kind={kind ?? "none"}
  data-over={over ? "" : undefined}
  {@attach drop}
>
  <header class="head">
    <span class="line">
      {#if kind === "you"}
        <IconNeedsYou aria-hidden="true" class="you-glyph" />
      {/if}
      <h3 class="name">{label}</h3>
      <span class="count num"><MorphText text={String(cards.length)} /></span>
    </span>
    <span class="kind">{kind ? KIND_LABEL[kind] : "not in stages.md"}</span>
  </header>
  <ol class="cards" {@attach reflow()}>
    {#each cards as task (task.id)}
      <li data-flip>
        <TaskCard
          date={dateOf(task.id)}
          href={hrefOf(task.id)}
          {kindOf}
          {onopen}
          {task}
        />
      </li>
    {/each}
  </ol>
  {#if foot}
    <div class="foot">{@render foot()}</div>
  {/if}
</section>

<style>
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
    overflow: hidden;
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
  .foot {
    flex: none;
  }
  .foot :global(.add-task) {
    inline-size: 100%;
  }
</style>
