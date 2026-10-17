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
    /** The board's stages, or a view's (the `stages` tool's rows): a row reads only its name and kind. */
    stages: Pick<Stage, "kind" | "name">[];
    tasks: Pick<TaskSummary, "stage">[];
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

{#snippet row(stage: Pick<Stage, "kind" | "name">)}
  {@const count = counts.get(stage.name) ?? 0}
  <li>
    <!-- literal: minmax(6rem, 10rem) minmax(4rem, 6rem) 1fr 3rem; 1fr auto -->
    <div
      data-slot="row"
      class="group grid min-h-c-btn-h-lg w-full grid-cols-(--row-cols) items-center gap-space-3 rounded-md bg-surface-recess px-space-3 text-start text-ink-strong kind-dropped:text-ink-muted kind-you:bg-brand-wash max-phone:grid-cols-(--row-cols-narrow) max-phone:gap-y-space-1 max-phone:py-space-2"
      data-kind={stage.kind}
      style:--row-cols="minmax(6rem, 10rem) minmax(4rem, 6rem) 1fr 3rem"
      style:--row-cols-narrow="1fr auto"
    >
      <span
        data-slot="name"
        class="mark-line flex min-w-0 items-center gap-space-1 type-label group-kind-dropped:text-ink-muted group-kind-you:text-brand-ink max-phone:row-(--area) max-phone:col-(--area)"
        style:--area="name"
      >
        {#if stage.kind === "you"}
          <IconNeedsYou
            aria-hidden="true"
            class="size-icon-sm flex-none text-status-attn-glyph"
          />
        {/if}
        <span
          data-slot="view-pipeline-label"
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{stageLabel(stage.name)}</span
        >
      </span>
      <!-- A stage's kind is a word of stages.md, set as code. -->
      <span data-slot="kind" class="type-code text-ink-subtle max-phone:hidden"
        >{KIND_LABEL[stage.kind]}</span
      >
      <!-- literal: 8px -->
      <span
        data-slot="track"
        aria-hidden="true"
        class="block h-(--track-h) rounded-pill max-phone:row-(--area) max-phone:col-(--area)"
        style:--area="track"
        style:--track-h="8px"
      >
        <!-- literal: 2px -->
        <span
          class="block h-full w-(--bar-w) min-w-(--bar-min) rounded-pill bg-border-control motion-safe:transition-[inline-size] motion-safe:dur-pop motion-safe:ease-out group-kind-done:bg-status-done-bg group-kind-dropped:bg-transparent group-kind-dropped:outline-1 group-kind-dropped:outline-dashed group-kind-dropped:outline-border-control group-kind-dropped:-outline-offset-1 group-kind-you:bg-brand-solid"
          style:--bar-w="{(count / most) * 100}%"
          style:--bar-min="2px"
        ></span>
      </span>
      <span
        data-num
        data-slot="count"
        class="num type-label text-end text-ink-muted max-phone:row-(--area) max-phone:col-(--area)"
        style:--area="count"
        ><MorphText text={String(count)} /></span
      >
    </div>
  </li>
{/snippet}

<div class="flex flex-col gap-space-3">
  <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
    {#each open as stage (stage.name)}
      {@render row(stage)}
    {/each}
  </ol>
  {#if dropped.length > 0}
    <ol
      class="m-0 flex list-none flex-col gap-space-1 border-t border-t-dashed border-t-border-hairline p-0 pt-space-3"
    >
      {#each dropped as stage (stage.name)}
        {@render row(stage)}
      {/each}
    </ol>
  {/if}
</div>

<style>
  /* residual: unmapped */
  /* A narrow row: its name and count over the bar's own line. */
  @media (max-width: 639px) {
    [data-slot="row"] {
      grid-template-areas: "name count" "track track";
    }
  }
</style>
