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
   * Under it the draft itself, what the project is for and its stages as
   * the columns they become (DraftStages, which the setup page draws too):
   * every stage in view at once on a desk with his panel open (eight at
   * 1440: three rows) and down the page on a phone.
   *
   * It writes nothing to the project: each change goes to `onstages` and
   * `onaim` (the setup page's bridge keeps them, hub setup.ts), and Set up
   * sends the page, the hub writing stages.md from it.
   */
  import { setupPageWords, setupWords } from "@cawco/core/words/onboarding";
  import type { Snippet } from "svelte";
  import DraftStages from "#lib/cawco/project/DraftStages.svelte";
  import type { SetupDelegate, Stage } from "#lib/cawco/project/setup-stage.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconNeedsYou, IconSend } from "#lib/icons.js";

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
     * the bar says what waits and offers nothing of its own, since Answer
     * Caw would only point at what is already in view.
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
</script>

<div class="flex h-full min-h-0 flex-col gap-space-4" data-slot="setup-draft">
  <div
    class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2 rounded-lg bg-surface-recess px-space-3 py-space-2 inset-ring inset-ring-border-hairline"
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
    {#if asking > 0 && !asksInView}
      <Button
        label={setupWords.answer}
        onclick={onanswer}
        size="sm"
        variant={barState === "drafting" ? "outline" : "default"}
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
    <DraftStages
      adds={!drafting}
      {aim}
      {coming}
      {delegates}
      {onaim}
      {onstages}
      {stages}
    />
  </div>
</div>
