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
   * object, never two. A column is dragged to another place among them
   * (stage-dnd), the order kept at the drop. A stage removed waits on a
   * line under them with Add back, which puts it back where it stood, as
   * it stood; the keys go to that Add back as it is removed, and to the
   * stage's More as it comes back.
   *
   * Under the stages, Who does the work: each delegate type Caw proposed as
   * a tile on the same grid (DraftDelegate), with the stages it works in;
   * one removed waits on a line under them with Add back, and the stages it
   * worked in are left with no one (`ondelegates`, kept as the page's
   * `delegates`, hub setup.ts). Add back puts it back on the stages it
   * worked in when it was removed, the person's own choices among them.
   * Both undo lines are this draft's while it stands: a page read again
   * offers the types again, and the stages Caw drafted.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { setupPageWords } from "@cawco/core/words/onboarding";
  import { tick, untrack } from "svelte";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import DraftColumn from "#lib/cawco/project/DraftColumn.svelte";
  import DraftDelegate from "#lib/cawco/project/DraftDelegate.svelte";
  import {
    moved,
    patched,
    type SetupDelegate,
    type Stage,
  } from "#lib/cawco/project/setup-stage.js";
  import {
    StageDragState,
    watchStageDrops,
  } from "#lib/cawco/project/stage-dnd.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    aim,
    stages,
    delegates = [],
    proposed = delegates,
    coming = 0,
    adds = true,
    onaim,
    onstages,
    ondelegates,
  }: {
    /** What it is for, as drafted or as the person changed it. */
    aim: string;
    stages: Stage[];
    /** The delegate types the setup keeps: who may do a stage's work. */
    delegates?: SetupDelegate[];
    /** Every type Caw proposed, those removed included: a removed one is added back from here. */
    proposed?: SetupDelegate[];
    /** Keeps the types by id; left out, the types are not drawn. */
    ondelegates?: (ids: string[]) => void;
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
    "repeat(auto-fill, minmax(min(100%, var(--c-board-col-min)), 1fr))";
  /** Every row past a phone: one height, at least a whole stage's. */
  const ROWS = "minmax(var(--c-draft-col-h), 1fr)";
  let grid = $state<HTMLElement>();

  /**
   * Each stage's own key, so its column, and the keys on it, go with it
   * when it moves: a stage's name changes as it is typed, so the keys are
   * the draft's own, moved, added and removed with the stages here, and
   * grown for the stages Caw writes meanwhile.
   */
  let made = 0;
  const fresh = () => {
    made += 1;
    return `stage-${made}`;
  };
  let keys = $state<string[]>(untrack(() => stages.map(fresh)));
  $effect.pre(() => {
    const count = stages.length;
    untrack(() => {
      if (keys.length < count) {
        keys = [...keys, ...Array.from({ length: count - keys.length }, fresh)];
      } else if (keys.length > count) {
        keys = keys.slice(0, count);
      }
    });
  });
  /** The stages in a new order, their keys with them. */
  function reorder(from: number, to: number) {
    keys = moved(keys, from, to);
    onstages(moved(stages, from, to));
  }
  /** The stages removed, newest last, each with its key and where it stood: Add back's. */
  let gone = $state<{ stage: Stage; key: string; at: number }[]>([]);
  /** A stage removed waits under the grid; the keys go to its Add back. */
  async function removeStage(at: number) {
    const key = keys[at];
    const stage = stages[at];
    if (!(key && stage)) {
      return;
    }
    gone = [...gone, { stage, key, at }];
    keys = keys.filter((_, index) => index !== at);
    onstages(stages.filter((_, index) => index !== at));
    await focusOn(`${uid}-stage-back-${key}`);
  }
  /** A removed stage back where it stood, as it stood, less a worker since removed; its More takes the keys. */
  async function addStageBack(key: string) {
    const one = gone.find((each) => each.key === key);
    if (!one) {
      return;
    }
    gone = gone.filter((each) => each !== one);
    const at = Math.min(one.at, stages.length);
    const runs = one.stage.hooks?.runs;
    const stage =
      runs && !delegates.some((kept) => kept.id === runs)
        ? withoutRuns(one.stage)
        : one.stage;
    keys = keys.toSpliced(at, 0, key);
    onstages(stages.toSpliced(at, 0, stage));
    await focusOn(`${uid}-stage-more-${key}`);
  }
  /** After the draft has drawn the change: the keys on the element of `id`. */
  async function focusOn(id: string) {
    await tick();
    document.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus();
  }
  /** A stage with no one doing its work. */
  const withoutRuns = (one: Stage): Stage => {
    const { runs: _gone, ...hooks } = one.hooks ?? {};
    const { hooks: _old, ...rest } = one;
    return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
  };

  /** The stage in the air and where it would land (stage-dnd). */
  const drag = new StageDragState();
  const watching = watchStageDrops(
    () => ({ count: stages.length, draft: uid }),
    reorder
  );
  $effect(() => watching());

  /** The types the setup proposes that the person removed, in Caw's order. */
  const removed = $derived(
    proposed.filter((one) => !delegates.some((kept) => kept.id === one.id))
  );
  /** The stages a type works in, by name. */
  const worksIn = (id: string): string[] =>
    stages.filter((one) => one.hooks?.runs === id).map((one) => one.name);
  /** Each removed type's stages, by their keys, as they stood when it was removed: Add back's. */
  let worked = $state<Record<string, string[]>>({});
  /**
   * A type left out: the stages it worked in are left with no one, kept by
   * their keys for its Add back, which takes the keys.
   */
  async function removeDelegate(id: string) {
    worked = {
      ...worked,
      [id]: stages.flatMap((one, at) =>
        one.hooks?.runs === id && keys[at] ? [keys[at]] : []
      ),
    };
    ondelegates?.(
      delegates.filter((one) => one.id !== id).map((one) => one.id)
    );
    if (stages.some((one) => one.hooks?.runs === id)) {
      onstages(
        stages.map((one) => (one.hooks?.runs === id ? withoutRuns(one) : one))
      );
    }
    await focusOn(`${uid}-back-${id}`);
  }

  /**
   * A type added back: it works again in the stages it worked in when it
   * was removed that still stand with no one, whoever had set it there;
   * its tile's More takes the keys.
   */
  async function addBack(id: string) {
    ondelegates?.(
      proposed
        .filter(
          (each) =>
            each.id === id || delegates.some((kept) => kept.id === each.id)
        )
        .map((each) => each.id)
    );
    const ran = new Set(worked[id] ?? []);
    const { [id]: _was, ...rest } = worked;
    worked = rest;
    if (stages.some((one, at) => ran.has(keys[at] ?? "") && !one.hooks?.runs)) {
      onstages(
        stages.map((one, at) =>
          ran.has(keys[at] ?? "") && !one.hooks?.runs
            ? { ...one, hooks: { ...one.hooks, runs: id } }
            : one
        )
      );
    }
    await focusOn(`${uid}-more-${id}`);
  }

  /** A new stage stands before the first closed one (done, dropped): in view, its name taking the caret. */
  async function add() {
    const closed = stages.findIndex(
      (one) => one.kind === "done" || one.kind === "dropped"
    );
    const at = closed === -1 ? stages.length : closed;
    const next = [...stages];
    next.splice(at, 0, { name: setupPageWords.newStage, kind: "active" });
    keys = keys.toSpliced(at, 0, fresh());
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
    <label class="ps-space-3 type-meta text-ink-muted" for="{uid}-aim"
      >{setupPageWords.aim}</label
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
  {#each stages as stage, at (keys[at] ?? `coming-${at}`)}
    <DraftColumn
      {at}
      {drag}
      draft={uid}
      moreId="{uid}-stage-more-{keys[at]}"
      of={stages.length}
      onchange={(patch) => onstages(patched(stages, at, patch))}
      onmove={(by) => reorder(at, at + by)}
      onremove={() => removeStage(at)}
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

{#if gone.length > 0}
  <!-- The stages removed, each to be put back where it stood. -->
  <p
    class="mark-line m-0 flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
    data-slot="stages-removed"
  >
    {#each gone as one (one.key)}
      <Button
        data-box
        id="{uid}-stage-back-{one.key}"
        label={setupPageWords.addBack(one.stage.name)}
        onclick={() => addStageBack(one.key)}
        size="xs"
        variant="ghost"
      />
    {/each}
  </p>
{/if}

{#if ondelegates && proposed.length > 0}
  <!-- Who does the work: the types on the stages' grid, a tile each, their
       height their words'; a removed one waits on the line under them. -->
  <section
    aria-labelledby="{uid}-delegates"
    class="flex flex-col gap-space-2"
    data-slot="setup-delegates"
  >
    <h2 class={sectionHeadVariants()} id="{uid}-delegates">
      {setupPageWords.delegates}
    </h2>
    {#if delegates.length > 0}
      <div
        class="grid grid-cols-(--cols) items-start gap-space-3"
        style:--cols={COLS}
      >
        {#each delegates as one (one.id)}
          <DraftDelegate
            delegate={one}
            moreId="{uid}-more-{one.id}"
            onremove={() => removeDelegate(one.id)}
            stages={worksIn(one.id)}
          />
        {/each}
      </div>
    {/if}
    {#if removed.length > 0}
      <p
        class="mark-line m-0 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
        data-slot="delegates-removed"
      >
        {#each removed as one (one.id)}
          <Button
            data-box
            id="{uid}-back-{one.id}"
            label={setupPageWords.addBack(one.name)}
            onclick={() => addBack(one.id)}
            size="xs"
            variant="ghost"
          />
        {/each}
      </p>
    {/if}
  </section>
{/if}
