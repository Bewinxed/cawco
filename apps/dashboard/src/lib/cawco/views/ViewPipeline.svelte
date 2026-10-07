<script lang="ts">
  /**
   * The pipeline view (design §2): one recessed row per stage, in the
   * stages file's order, with its name, its kind, a bar sized by its share
   * of the largest stage, and its count. The `you` row takes the brand wash
   * and a brand bar; done bars take the done pair; dropped stages sit apart
   * under a dashed hairline, quiet, their bars outlined. Widths ease over
   * 260ms. No chart library: a bar is a box.
   */
  import {
    KIND_LABEL,
    type Stage,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconNeedsYou } from "#lib/icons.js";

  let {
    stages,
    tasks,
  }: {
    stages: Stage[];
    tasks: TaskSummary[];
  } = $props();

  const counts = $derived.by(() => {
    const byStage = new Map<string, number>();
    for (const task of tasks) {
      byStage.set(task.stage, (byStage.get(task.stage) ?? 0) + 1);
    }
    return byStage;
  });
  const most = $derived(Math.max(1, ...counts.values()));
  const open = $derived(stages.filter((stage) => stage.kind !== "dropped"));
  const dropped = $derived(stages.filter((stage) => stage.kind === "dropped"));
</script>

{#snippet row(
  stage: Stage
)}
  {@const count = counts.get(stage.name) ?? 0}
  <li>
    <div class="row" data-kind={stage.kind}>
      <span class="name">
        {#if stage.kind === "you"}
          <IconNeedsYou aria-hidden="true" />
        {/if}
        <span class="label">{stageLabel(stage.name)}</span>
      </span>
      <span class="kind">{KIND_LABEL[stage.kind]}</span>
      <span aria-hidden="true" class="track">
        <span class="bar" style:inline-size="{(count / most) * 100}%"></span>
      </span>
      <span class="count num"><MorphText text={String(count)} /></span>
    </div>
  </li>
{/snippet}

<div class="pipeline">
  <ol class="rows">
    {#each open as stage (stage.name)}
      {@render row(stage)}
    {/each}
  </ol>
  {#if dropped.length > 0}
    <ol class="rows apart">
      {#each dropped as stage (stage.name)}
        {@render row(stage)}
      {/each}
    </ol>
  {/if}
</div>

<style>
  .pipeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .apart {
    padding-block-start: var(--space-3);
    border-block-start: 1px dashed var(--border-hairline);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(6rem, 10rem) minmax(4rem, 6rem) 1fr 3rem;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-lg);
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    color: var(--ink-strong);
    text-align: start;
  }
  .name {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    font: var(--type-label);
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Waiting on you: the needs-you glyph, as the Table and the board say it. */
  .name :global(svg) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--status-attn-glyph);
  }
  /* A stage's kind is a word of stages.md, set as code. */
  .kind {
    font: var(--type-code);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .track {
    display: block;
    block-size: 8px;
    border-radius: var(--radius-pill);
  }
  .bar {
    display: block;
    block-size: 100%;
    min-inline-size: 2px;
    border-radius: inherit;
    background: var(--border-control);
  }
  @media (prefers-reduced-motion: no-preference) {
    .bar {
      transition: inline-size 260ms var(--ease-out);
    }
  }
  .count {
    font: var(--type-label);
    color: var(--ink-muted);
    text-align: end;
  }
  .row[data-kind="you"] {
    background: var(--brand-wash);
  }
  .row[data-kind="you"] .name {
    color: var(--brand-ink);
  }
  .row[data-kind="you"] .bar {
    background: var(--brand-solid);
  }
  .row[data-kind="done"] .bar {
    background: var(--status-done-bg);
  }
  .row[data-kind="dropped"] {
    color: var(--ink-muted);
  }
  .row[data-kind="dropped"] .name {
    color: var(--ink-muted);
  }
  .row[data-kind="dropped"] .bar {
    background: transparent;
    outline: 1px dashed var(--border-control);
    outline-offset: -1px;
  }
  @media (max-width: 639px) {
    .row {
      grid-template-columns: 1fr auto;
      grid-template-areas: "name count" "track track";
      row-gap: var(--space-1);
      padding-block: var(--space-2);
    }
    .name {
      grid-area: name;
    }
    .kind {
      display: none;
    }
    .track {
      grid-area: track;
    }
    .count {
      grid-area: count;
    }
  }
</style>
