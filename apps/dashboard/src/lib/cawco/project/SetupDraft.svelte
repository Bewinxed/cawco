<script lang="ts">
  /**
   * A project's setup drawn as the board it becomes, in the board's place,
   * while Caw drafts it and until the person sets it up (decision page
   * `onboarding-first-minutes`, way `board`). The house draft bar stands
   * over it, as over a view Caw drafted (words/views `drafted`): while he
   * writes, the live dot and what he is doing; once drafted, what it is and
   * where a change is made, and the one act the view is for, Set up
   * <name>. Under it what the project is for, Caw's paragraph, edited where
   * it stands (the house Textarea's `prose` look). Then the stages as the
   * board's columns (DraftColumn), each one's name, kind, look and place
   * changed where it stands; the stages still coming stand as skeleton
   * columns at the column's size (The Claim Of Nothing Rule); after them
   * the rail that adds a stage, on the board's Archived rail recipe.
   *
   * It writes nothing to the project: each change goes to `onstages` and
   * `onaim` (the setup page's bridge keeps them, hub setup.ts), and Set up
   * sends the page, the hub writing stages.md from it. The columns are the
   * board's own sizes, so once it is set up the board stands where the
   * draft stood.
   */
  import { setupPageWords, setupWords } from "@cawco/core/words/onboarding";
  import { moved, patched, type Stage } from "#lib/cawco/decisions/host/setup/stage.js";
  import DraftColumn from "#lib/cawco/project/DraftColumn.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    name,
    aim,
    stages,
    coming = 0,
    sending = false,
    onaim,
    onstages,
    onsetup,
  }: {
    /** The project's name, as Caw named it. */
    name: string;
    /** What it is for, as drafted or as the person changed it. */
    aim: string;
    stages: Stage[];
    /** Stages he has still to write: each stands as a skeleton column; 0, the draft is whole. */
    coming?: number;
    /** Set up is on its way to the hub. */
    sending?: boolean;
    onaim: (next: string) => void;
    onstages: (next: Stage[]) => void;
    onsetup: () => void;
  } = $props();

  const drafting = $derived(coming > 0);

  /** A new stage stands before the first closed one (done, dropped), its name taking the caret. */
  function add() {
    const closed = stages.findIndex(
      (one) => one.kind === "done" || one.kind === "dropped"
    );
    const at = closed === -1 ? stages.length : closed;
    const next = [...stages];
    next.splice(at, 0, { name: setupPageWords.newStage, kind: "active" });
    onstages(next);
  }
</script>

<div class="flex h-full min-h-0 flex-col gap-space-4" data-slot="setup-draft">
  <div
    class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2 rounded-lg bg-surface-band px-space-3 py-space-2 inset-ring inset-ring-border-hairline"
    data-slot="draft-bar"
  >
    <p
      aria-live="polite"
      class="mark-line m-0 flex min-w-0 shrink grow basis-c-draft-line items-center gap-space-2"
    >
      {#if drafting}
        <LiveDot />
        <span class="type-label text-ink-strong"
          >{setupWords.draftingHow(name)}</span
        >
      {:else}
        <span class="flex min-w-0 flex-col">
          <span class="type-label text-ink-strong"
            >{setupWords.draftedHow(name)}</span
          >
          <span class="type-meta text-ink-muted">{setupWords.draftHint}</span>
        </span>
      {/if}
    </p>
    <Button
      disabled={drafting}
      label={setupPageWords.send(name)}
      onclick={onsetup}
      pending={sending}
      size="sm"
      variant="default"
    />
  </div>

  {#if aim || !drafting}
    <Textarea
      aria-label={setupPageWords.aim}
      look="prose"
      measure="reading"
      oninput={(event: Event) =>
        onaim((event.currentTarget as HTMLTextAreaElement).value)}
      value={aim}
    />
  {/if}

  <div class="flex min-h-0 flex-auto gap-space-3 max-phone:h-auto">
    <div
      class="kit-edge-fade grid h-full min-h-0 min-w-0 flex-auto auto-cols-(--cols) grid-flow-col gap-space-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-space-3 max-phone:auto-cols-(--cols-phone) max-phone:snap-x max-phone:snap-mandatory"
      data-slot="board"
      style:--cols="minmax(var(--c-board-col-min), var(--c-board-col-max))"
      style:--cols-phone="calc(100% - var(--space-8))"
    >
      {#each stages as stage, at (at)}
        <DraftColumn
          {at}
          of={stages.length}
          onchange={(patch) => onstages(patched(stages, at, patch))}
          onmove={(by) => onstages(moved(stages, at, at + by))}
          onremove={() => onstages(stages.filter((_, index) => index !== at))}
          {stage}
        />
      {/each}
      {#each { length: coming }, index (index)}
        <Skeleton class="h-full" radius="card" />
      {/each}
    </div>
    {#if !drafting}
      <!-- mark-line: the rail stacks its glyph above its word, set vertically; they share no line -->
      <button
        class="select-none press-tint mb-space-3 flex w-c-btn-h-lg flex-none flex-col items-center gap-space-2 rounded-lg border-none bg-surface-band px-0 py-space-3 text-ink-muted inset-ring inset-ring-border-hairline hover:bg-surface-hover"
        data-slot="add-stage"
        onclick={add}
        type="button"
      >
        <IconPlus aria-hidden="true" class="size-icon-md" />
        <span class="type-label writing-vertical-rl"
          >{setupPageWords.addStage}</span
        >
      </button>
    {/if}
  </div>
</div>
