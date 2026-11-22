<script lang="ts" module>
  /**
   * How much of a tile's lines the Room rule (shared part S11) leaves
   * spelled out: all of them; in a met outcome, "All 3 hold"; or the
   * unsettled lines with those that hold folded under them, "and 2 that
   * hold".
   */
  export type Fold = "none" | "met" | "holding";
</script>

<script lang="ts">
  /**
   * An outcome's tile (Option 1, structure decision 3), top to bottom: the
   * Needs you line while something under it waits on the person; the
   * outcome's sentence, said once as the tile's only heading, with the
   * tile's open control at its end; "Met, still watched" when every line
   * holds; then "Done when:" and its lines, each with its word in one
   * answer column down the tile. Its place and size follow its own words,
   * never its state.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconEye, IconMaximize, IconSuccess } from "#lib/icons.js";
  import NeedsYouLine from "./NeedsYouLine.svelte";
  import OutcomeLine from "./OutcomeLine.svelte";
  import { met, type Outcome, unsettled } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    outcome,
    fold = "none",
    openLine = null,
    live = true,
    onopenline,
    onopenoutcome,
    onanswer,
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
    onanswer: (line: string | null, from: HTMLElement) => void;
  } = $props();

  const isMet = $derived(met(outcome));
  const waiting = $derived(outcome.asks[0]);
  /** What the fold leaves spelled out, and how many it folds. */
  const shown = $derived.by(() => {
    if (fold === "met" && isMet) {
      return { lines: [], folded: outcome.lines.length };
    }
    if (fold === "holding") {
      const open = outcome.lines.filter((line) => unsettled(line.answer));
      return { lines: open, folded: outcome.lines.length - open.length };
    }
    return { lines: outcome.lines, folded: 0 };
  });
  const headId = $derived(`outcome-${outcome.id}`);
  let tile = $state<HTMLElement | null>(null);
</script>

<section
  bind:this={tile}
  aria-labelledby={headId}
  data-outcome={outcome.id}
  class="flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile @max-phone/view:gap-space-2 @max-phone/view:rounded-none @max-phone/view:border-b @max-phone/view:border-border-hairline @max-phone/view:bg-transparent @max-phone/view:px-0 @max-phone/view:py-space-2 @max-phone/view:shadow-none"
>
  {#if waiting}
    <NeedsYouLine
      ask={waiting.ask}
      disabled={!live}
      more={outcome.asks.length - 1}
      onact={() => {
        if (tile) {
          onanswer(waiting.line, tile);
        }
      }}
      reason={outcomesWords.notLiveReason}
    />
  {/if}
  <header class="flex items-start gap-space-2">
    <h3
      id={headId}
      class="m-0 min-w-0 flex-1 type-row font-medium text-pretty text-ink-strong @max-phone/view:type-body @max-phone/view:font-medium"
    >
      {outcome.sentence}
    </h3>
    <Button
      aria-label={outcomesWords.open(outcome.sentence)}
      icon={IconMaximize}
      onclick={onopenoutcome}
      size="icon-xs"
      title={outcomesWords.open(outcome.sentence)}
      tone="quiet"
      variant="ghost"
    />
  </header>
  {#if isMet}
    <p
      class="m-0 -mt-space-2 mark-line flex items-center gap-space-2 type-label text-status-done-ink"
    >
      <IconEye aria-hidden="true" class="size-icon-md text-status-done-glyph" />
      <span>{outcomesWords.met}</span>
    </p>
  {/if}
  <div class="flex flex-col gap-space-1">
    <!-- On a phone's column the lines stand under their sentence with no
         room to spare: "Done when:" is read out, not drawn. -->
    <p class="m-0 type-meta text-ink-muted @max-phone/view:sr-only">
      {outcomesWords.doneWhen}
    </p>
    <ul
      class="m-0 grid list-none grid-cols-(--line-cols) gap-x-space-3 p-0 @max-phone/view:grid-cols-(--line-cols-narrow) @max-phone/view:gap-x-space-2"
      style:--line-cols={"minmax(0, 1fr) var(--spacing-c-answer-w) auto"}
      style:--line-cols-narrow={"minmax(0, 1fr) var(--spacing-c-answer-w-narrow) auto"}
    >
      {#each shown.lines as line (line.id)}
        <OutcomeLine
          {line}
          onopen={(row) => onopenline(line.id, row)}
          open={openLine === line.id}
        />
      {/each}
      {#if shown.folded > 0}
        <li
          data-slot="folded"
          class="col-span-3 mark-line flex items-center gap-space-2 py-space-1 type-label text-ink-muted @max-phone/view:py-0"
        >
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md text-status-done-glyph"
          />
          <span
            >{shown.lines.length === 0
              ? outcomesWords.allHold(shown.folded)
              : outcomesWords.andHold(shown.folded)}</span
          >
        </li>
      {/if}
    </ul>
  </div>
</section>
