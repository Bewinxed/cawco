<script lang="ts">
  /**
   * A project's setup draft, the part the person shapes: what the project is
   * for, Caw's paragraph, edited where it stands (the house Textarea's
   * `prose` look), then the stages in the board's order, each as the column
   * it becomes (DraftColumn): its name, kind, look, worker and place changed
   * where it stands. They wrap into rows at the board's column width, each
   * as tall as what it says; the stages still coming stand as skeletons at
   * a column's size (The Claim Of Nothing Rule); Add a stage closes the
   * flow, and the stage it adds takes the caret where it lands, in view.
   *
   * The one editor of a setup draft (decision page `onboarding-first-minutes`,
   * card `draft-where`): the board draws it under its draft bar
   * (SetupDraft), and the setup page draws it as its Setup (the decision
   * host's Setup), so both read and write the same picks. It holds no
   * state of its own and reaches no store: each change goes to `onaim` and
   * `onstages`, which keep it on the setup page (`aim`, `stages`, hub
   * setup.ts).
   *
   * Each column carries `data-share="stage:<name>"`, so on Set up the
   * board's column of the same stage lands from it (motion/share): one
   * object, never two.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { setupPageWords } from "@cawco/core/words/onboarding";
  import { tick } from "svelte";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import DraftColumn from "#lib/cawco/project/DraftColumn.svelte";
  import {
    moved,
    patched,
    type SetupDelegate,
    type Stage,
  } from "#lib/cawco/project/setup-stage.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    aim,
    stages,
    delegates = [],
    coming = 0,
    adds = true,
    onaim,
    onstages,
  }: {
    /** What it is for, as drafted or as the person changed it. */
    aim: string;
    stages: Stage[];
    /** The delegate types the setup proposes: who may do a stage's work. */
    delegates?: SetupDelegate[];
    /** Stages he has still to write: each stands as a skeleton; 0, the draft is whole. */
    coming?: number;
    /** Add a stage closes the flow: not while he is still writing it. */
    adds?: boolean;
    onaim: (next: string) => void;
    onstages: (next: Stage[]) => void;
  } = $props();

  const uid = $props.id();
  /** The board's column width, wrapping into rows; one column where the room is narrower. */
  const COLS =
    "repeat(auto-fill, minmax(min(100%, var(--spacing-c-board-col-min)), 1fr))";
  /** Every row past a phone: one height, at least a whole stage's. */
  const ROWS = "minmax(var(--spacing-c-draft-col-h), 1fr)";
  let grid = $state<HTMLElement>();

  /** A new stage stands before the first closed one (done, dropped): in view, its name taking the caret. */
  async function add() {
    const closed = stages.findIndex(
      (one) => one.kind === "done" || one.kind === "dropped"
    );
    const at = closed === -1 ? stages.length : closed;
    const next = [...stages];
    next.splice(at, 0, { name: setupPageWords.newStage, kind: "active" });
    onstages(next);
    await tick();
    const column = grid?.querySelectorAll<HTMLElement>(
      "[data-slot=draft-column]"
    )[at];
    if (column) {
      bringIntoView(column, {
        behavior: motionOk.current ? "smooth" : "auto",
      });
    }
    const field = column?.querySelector<HTMLInputElement>("input");
    field?.focus({ preventScroll: true });
    field?.select();
  }
</script>

{#if aim}
  <!-- What it is for, named over it in the meta role: the label says it is
       a field of its own to change, and its box stands on the column's
       edges with the stages. -->
  <div class="flex flex-col gap-space-1" data-slot="setup-aim">
    <label
      class="ps-c-field-inline-inset type-meta text-ink-muted"
      for="{uid}-aim">{setupPageWords.aim}</label
    >
    <Textarea
      id="{uid}-aim"
      look="prose"
      measure="column"
      oninput={(event: Event) =>
        onaim((event.currentTarget as HTMLTextAreaElement).value)}
      value={aim}
    />
  </div>
{/if}

<!-- The stages in the board's order, wrapping at the board's column width:
     every stage in view on a desk, down the page on a phone. Past a phone
     every row shares one height, at least a whole stage's
     (`c-draft-col-h`, the skeleton's), so a stage takes a skeleton's place
     and a short stage stands beside a tall one without the grid moving; on
     a phone each card is as tall as its words. -->
<div
  bind:this={grid}
  class="grid grid-cols-(--cols) auto-rows-(--rows) gap-space-3 pb-space-3 max-phone:auto-rows-auto max-phone:items-start"
  data-slot="board"
  style:--cols={COLS}
  style:--rows={ROWS}
>
  {#each stages as stage, at (at)}
    <DraftColumn
      {at}
      of={stages.length}
      onchange={(patch) => onstages(patched(stages, at, patch))}
      onmove={(by) => onstages(moved(stages, at, at + by))}
      onremove={() => onstages(stages.filter((_, index) => index !== at))}
      {delegates}
      {stage}
    />
  {/each}
  {#each Array.from({ length: coming }, (_, index) => index) as index (index)}
    <Skeleton height="draft-column" radius="card" />
  {/each}
  {#if adds}
    <button
      class="select-none press-tint mark-line flex min-h-c-draft-col-h max-phone:min-h-c-btn-h items-center justify-center gap-space-2 rounded-lg border-none bg-transparent text-ink-muted inset-ring inset-ring-border-control hover:bg-surface-hover"
      data-slot="add-stage"
      onclick={add}
      type="button"
    >
      <IconPlus aria-hidden="true" class="size-icon-md" />
      <span class="type-label">{setupPageWords.addStage}</span>
    </button>
  {/if}
</div>
