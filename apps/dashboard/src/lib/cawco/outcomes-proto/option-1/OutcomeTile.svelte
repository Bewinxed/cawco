<script lang="ts" module>
  /**
   * How much of a tile's lines the Room rule (shared part S11) leaves
   * spelled out: all of them, or the unsettled lines with the true ones
   * folded under them ("2 others are true").
   */
  export type Fold = "none" | "holding";
</script>

<script lang="ts">
  /**
   * An outcome's tile, for an outcome that is not met (Option 1, structure
   * decision 3), top to bottom: the outcome's sentence, said once as the
   * tile's only heading, with the tile's one open control at its end; then
   * "Done when:" and its lines, each with its answer word in one column
   * down the tile, the word being the line's way in. The true lines read
   * in quieter ink, so the lines that are not true stand forward.
   *
   * While something under it waits on the person, the tile stands on the
   * house's needs ground with an attention edge (TaskNeeds' own), the one
   * tinted tile on the view, and the ask stands directly under the line it
   * concerns, or under the sentence when it names none.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import OpenControl from "../OpenControl.svelte";
  import NeedsYouLine from "./NeedsYouLine.svelte";
  import OutcomeLine from "./OutcomeLine.svelte";
  import { type Line, type Outcome, unsettled } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    outcome,
    fold = "none",
    openLine = null,
    live = true,
    onopenline,
    onopenoutcome,
    onanswer,
    onunfold,
  }: {
    outcome: Outcome;
    fold?: Fold;
    /** The line whose card hangs open, if it is one of this tile's. */
    openLine?: string | null;
    /** The hub answers: with it away, the Needs you control waits. */
    live?: boolean;
    onopenline: (line: string, row: HTMLElement) => void;
    onopenoutcome: () => void;
    /** The Needs you line's control: its card on the line the ask concerns. */
    onanswer: (line: string | null) => void;
    /** Its folded true lines, spelled out again. */
    onunfold: () => void;
  } = $props();

  const waiting = $derived(outcome.asks[0]);
  /** The lines the fold leaves spelled out, and how many true ones it folds. */
  const shown = $derived.by((): { lines: Line[]; folded: number } => {
    if (fold === "holding") {
      const open = outcome.lines.filter(
        (line) => unsettled(line.answer) || line.id === waiting?.line
      );
      return { lines: open, folded: outcome.lines.length - open.length };
    }
    return { lines: outcome.lines, folded: 0 };
  });
  const headId = $derived(`outcome-${outcome.id}`);
</script>

{#snippet needs()}
  {#if waiting}
    <NeedsYouLine
      ask={waiting.ask}
      disabled={!live}
      more={outcome.asks.length - 1}
      onact={() => onanswer(waiting.line)}
      reason={outcomesWords.notLiveReason}
    />
  {/if}
{/snippet}

<section
  aria-labelledby={headId}
  data-outcome={outcome.id}
  data-waits={waiting ? "" : undefined}
  class="flex flex-col gap-space-3 rounded-lg border border-transparent bg-surface-raised p-space-4 shadow-tile data-waits:border-status-attn-glyph/40 data-waits:bg-needs-ground @max-phone/view:gap-space-2 @max-phone/view:rounded-none @max-phone/view:border-x-0 @max-phone/view:border-t-0 @max-phone/view:border-b-border-hairline @max-phone/view:bg-transparent @max-phone/view:px-0 @max-phone/view:py-space-2 @max-phone/view:shadow-none @max-phone/view:data-waits:my-space-1 @max-phone/view:data-waits:rounded-md @max-phone/view:data-waits:border @max-phone/view:data-waits:px-space-3"
>
  <header class="flex items-start gap-space-2">
    <h3
      id={headId}
      class="m-0 min-w-0 flex-1 type-row font-medium text-pretty text-ink-strong @max-phone/view:type-body @max-phone/view:font-medium"
    >
      {outcome.sentence}
    </h3>
    <OpenControl
      label={outcomesWords.open(outcome.sentence)}
      onopen={onopenoutcome}
    />
  </header>
  {#if waiting && waiting.line === null}
    {@render needs()}
  {/if}
  <div class="flex flex-col gap-space-1">
    <!-- On a phone's column the lines stand under their sentence with no
         room to spare: "Done when:" is read out, not drawn. -->
    <p class="m-0 type-meta text-ink-muted @max-phone/view:sr-only">
      {outcomesWords.doneWhen}
    </p>
    <ul
      class="m-0 grid list-none grid-cols-(--line-cols) gap-x-space-3 p-0 @max-phone/view:grid-cols-(--line-cols-narrow) @max-phone/view:gap-x-space-2"
      style:--line-cols={"minmax(0, 1fr) var(--spacing-c-line-answer-w)"}
      style:--line-cols-narrow={"minmax(0, 1fr) var(--spacing-c-line-answer-w-narrow)"}
    >
      {#each shown.lines as line (line.id)}
        <OutcomeLine
          {line}
          onopen={(row) => onopenline(line.id, row)}
          open={openLine === line.id}
          quiet
        />
        {#if waiting && waiting.line === line.id}
          <li class="col-span-2">{@render needs()}</li>
        {/if}
      {/each}
      {#if shown.folded > 0}
        <li data-slot="folded" class="col-span-2 -mx-space-2">
          <Button
            aria-expanded={false}
            aria-label={outcomesWords.showLines(outcome.sentence)}
            fit="word"
            label={outcomesWords.andTrue(shown.folded)}
            onclick={onunfold}
            press="pressable"
            size="xs"
            tone="quiet"
            variant="ghost"
          />
        </li>
      {/if}
    </ul>
  </div>
</section>
