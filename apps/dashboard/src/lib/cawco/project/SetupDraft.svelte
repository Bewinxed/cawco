<script lang="ts">
  /**
   * A project's setup drawn as the board it becomes, in the board's place,
   * while Caw drafts it and until the person sets it up (decision page
   * `onboarding-first-minutes`, way `board`).
   *
   * The house draft bar stands over it, as over a view Caw drafted
   * (words/views `drafted`), saying where the draft stands and holding the
   * one act that state is for:
   * - a question of his holds his work (`waiting`): the Needs-you glyph,
   *   that he waits on the person's answer, and Answer Caw, which opens his
   *   questions where they are asked (his composer, on every width);
   * - he writes: the live dot and what he is doing, with Answer Caw beside
   *   it while questions that hold nothing are open;
   * - drafted: what it is and where a change is made, and Set up <name>.
   *
   * Under it what the project is for, Caw's paragraph, edited where it
   * stands (the house Textarea's `prose` look). Then the stages in the
   * board's order, each as the column it becomes (DraftColumn): its name,
   * kind, look and place changed where it stands. They wrap into rows at the
   * board's column width, each as tall as what it says, so every stage is in
   * view at once on a desk with his panel open (eight at 1440: three rows)
   * and down the page on a phone; the stages still coming stand as skeletons
   * at a column's size (The Claim Of Nothing Rule); Add a stage closes the
   * flow, and the stage it adds takes the caret where it lands, in view.
   *
   * It writes nothing to the project: each change goes to `onstages` and
   * `onaim` (the setup page's bridge keeps them, hub setup.ts), and Set up
   * sends the page, the hub writing stages.md from it. Each column carries
   * `data-share="stage:<name>"`, so on Set up the board's column of the same
   * stage lands from it (motion/share): one object, never two.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { setupPageWords, setupWords } from "@cawco/core/words/onboarding";
  import { type Snippet, tick } from "svelte";
  import {
    moved,
    patched,
    type SetupDelegate,
    type Stage,
  } from "#lib/cawco/decisions/host/setup/stage.js";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import DraftColumn from "#lib/cawco/project/DraftColumn.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconNeedsYou, IconPlus, IconSend } from "#lib/icons.js";

  let {
    name,
    aim,
    stages,
    coming = 0,
    waiting = 0,
    asking = 0,
    sending = false,
    onaim,
    onstages,
    onanswer,
    onsetup,
    delegates = [],
    questions,
    asksInView = false,
  }: {
    /**
     * His questions stand in view on the board, each with its own Answer:
     * the view's coral is theirs, and the bar's Answer Caw, which only
     * takes the keys to the first, stands in the outline.
     */
    asksInView?: boolean;
    /** The delegate types the setup proposes: who may do a stage's work. */
    delegates?: SetupDelegate[];
    /** His open questions where the board draws them (a desk): above the stages. */
    questions?: Snippet;
    /** The project's name, as Caw named it. */
    name: string;
    /** What it is for, as drafted or as the person changed it. */
    aim: string;
    stages: Stage[];
    /** Stages he has still to write: each stands as a skeleton; 0, the draft is whole. */
    coming?: number;
    /** His open questions that hold his work up. */
    waiting?: number;
    /** His open questions, those that hold nothing included. */
    asking?: number;
    /** Set up is on its way to the hub. */
    sending?: boolean;
    onaim: (next: string) => void;
    onstages: (next: Stage[]) => void;
    /** Opens his questions where they are asked (his panel's composer). */
    onanswer: () => void;
    onsetup: () => void;
  } = $props();

  const drafting = $derived(coming > 0 || waiting > 0);
  /**
   * What the draft bar says: held on an answer, being written, written with
   * his questions still open, or whole. Set up stands only in the last: an
   * open question is an answer the draft may still change by.
   */
  const barState = $derived.by(() => {
    if (waiting > 0) {
      return "waiting";
    }
    if (drafting) {
      return "drafting";
    }
    return asking > 0 ? "asking" : "drafted";
  });

  const uid = $props.id();
  /** The board's column width, wrapping into rows; one column where the room is narrower. */
  const COLS =
    "repeat(auto-fill, minmax(min(100%, var(--c-board-col-min)), 1fr))";
  /** Every row past a phone: one height, at least a whole stage's. */
  const ROWS = "minmax(var(--c-draft-col-h), 1fr)";
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

<div class="flex h-full min-h-0 flex-col gap-space-4" data-slot="setup-draft">
  <div
    class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2 rounded-lg bg-surface-band px-space-3 py-space-2 inset-ring inset-ring-border-hairline"
    data-slot="draft-bar"
    data-state={barState}
  >
    <div aria-live="polite" class="min-w-0 shrink grow basis-c-draft-line">
      {#if waiting > 0}
        <p class="mark-line m-0 flex items-center gap-space-2">
          <IconNeedsYou
            aria-hidden="true"
            class="size-icon-md flex-none text-status-attn-glyph"
          />
          <span class="type-label text-ink-strong"
            >{setupWords.waitingOn(waiting)}</span
          >
        </p>
        <p class="m-0 type-meta text-ink-muted">{setupWords.waitingWhy}</p>
      {:else if drafting}
        <p class="mark-line m-0 flex items-center gap-space-2">
          <LiveDot />
          <span class="type-label text-ink-strong"
            >{setupWords.draftingHow(name)}</span
          >
        </p>
        {#if asking > 0}
          <p class="m-0 type-meta text-ink-muted">
            {setupWords.asksOpen(asking)}
          </p>
        {/if}
      {:else}
        <p class="m-0 type-label text-ink-strong">
          {setupWords.draftedHow(name)}
        </p>
        <p class="m-0 type-meta text-ink-muted">
          {asking > 0 ? setupWords.asksBefore(asking) : setupWords.draftHint}
        </p>
      {/if}
    </div>
    {#if asking > 0}
      <Button
        label={setupWords.answer}
        onclick={onanswer}
        size="sm"
        variant={barState === "drafting" || asksInView ? "outline" : "default"}
      />
    {:else if !drafting}
      <!-- Its own glyph, so the pending spinner takes the glyph's slot and
           the label morphs to its pending words in place (the kit's
           Pending recipe); with none, the spinner stood over an empty
           slab (cold review a89636bb). -->
      <Button
        icon={IconSend}
        label={setupPageWords.send(name)}
        onclick={onsetup}
        pending={sending}
        pendingLabel={setupPageWords.sending}
        size="sm"
        variant="default"
      />
    {/if}
  </div>

  <!-- The bar holds still over the draft; what it is for and the stages
       scroll under it, in a scroller that reaches the page's edges (its
       pads the page's, `--draft-bleed-start` and `-end`), so its
       scrollbar stands clear of the cards, a field's hover never meets its
       edge, and what passes under the bar fades under the house edge. -->
  <div
    class="kit-edge-fade-block -ms-(--draft-bleed-start) -me-(--draft-bleed-end) flex min-h-0 flex-auto flex-col gap-space-4 overflow-y-auto ps-(--draft-bleed-start) pe-(--draft-bleed-end) pb-space-6"
    data-slot="draft-scroll"
  >
    {@render questions?.()}
    {#if aim}
      <!-- What it is for, named over it in the meta role: the label says
           it is a field of its own to change, and its box stands on the
           column's edges with the bar and the stages. -->
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

    <!-- The stages in the board's order, wrapping at the board's column
       width: every stage in view on a desk, down the page on a phone. Past
       a phone every row shares one height, at least a whole stage's
       (`c-draft-col-h`, the skeleton's), so a stage takes a skeleton's place
       and a short stage stands beside a tall one without the grid moving;
       on a phone each card is as tall as its words. -->
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
      {#if !drafting}
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
  </div>
</div>
