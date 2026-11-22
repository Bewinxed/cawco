<script lang="ts">
  /**
   * An outcome opened, in the pane where the bento stood (two levels: the
   * bento, then this). Its head: Back to outcomes, and the one act on the
   * outcome itself, Change this outcome with Caw. Its sentence, then its
   * lines, each a row that opens to what checks it, the whole finding and
   * the work on it; the line a question concerns, else the first that is
   * not done, stands open on arrival, so the latest result shows without a
   * press. One line is open at a time, so what he opened fits the screen.
   * The work under the outcome that serves no single line closes the page.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconSparkles } from "#lib/icons.js";
  import BackButton from "./BackButton.svelte";
  import LineRow from "./LineRow.svelte";
  import { type AnswerState, type Outcome, stateOf } from "./outcomes";
  import StateGlyph from "./StateGlyph.svelte";
  import WorkRow from "./WorkRow.svelte";
  import { outcomeStateWord, words } from "./words";

  let {
    outcome,
    startAt,
    answer,
    offline,
    onback,
    onreword,
    onanswer,
    onact,
  }: {
    outcome: Outcome;
    /** The line open on arrival; null for none. */
    startAt: string | null;
    answer: AnswerState;
    offline: string | null;
    onback: () => void;
    onreword: () => void;
    onanswer: (choice: string) => void;
    /** A press under a line, as "line-id:what". */
    onact: (what: string) => void;
  } = $props();

  let openLine = $derived(startAt);
  const state = $derived(stateOf(outcome));
</script>

<section
  aria-label={outcome.sentence}
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg bg-surface-raised p-space-5 shadow-tile @max-phone:p-space-4"
  data-slot="outcome-open"
>
  <div
    class="mx-auto flex w-full max-w-task-frame min-w-0 flex-col gap-space-5 @max-phone:gap-space-4"
  >
    <div
      class="flex min-w-0 flex-wrap items-center justify-between gap-space-2"
    >
      <BackButton {onback} />
      <Button
        disabled={offline !== null}
        icon={IconSparkles}
        label={words.reword}
        onclick={onreword}
        press="pressable"
        size="sm"
        title={offline ?? undefined}
        variant="outline"
      />
    </div>

    <!-- mark-line: the glyph stands at the first of the title's lines, in a box a line tall -->
    <header class="flex min-w-0 gap-space-2">
      <span class="type-title"><StateGlyph {state} /></span>
      <div class="min-w-0 flex-1">
        <h2 class="type-title text-ink-strong">{outcome.sentence}</h2>
        <p class="sr-only">{outcomeStateWord(state)}</p>
      </div>
    </header>

    <ul class="flex min-w-0 flex-col gap-space-4 @max-phone:gap-space-3">
      {#each outcome.lines as line (line.id)}
        <LineRow
          {answer}
          bind:open={
            () => openLine === line.id,
            (next) => {
              openLine = next ? line.id : null;
            }
          }
          {line}
          {offline}
          onact={(what) => onact(`${line.id}:${what}`)}
          {onanswer}
        />
      {/each}
    </ul>

    {#if outcome.work.length > 0}
      <section class="flex min-w-0 flex-col gap-space-2 pt-space-2">
        <h3 class="type-meta text-ink-muted">{words.otherWork}</h3>
        <ul class="flex min-w-0 flex-col gap-space-2">
          {#each outcome.work as work (work.ref)}
            <WorkRow onopen={() => onact(`outcome:task:${work.ref}`)} {work} />
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</section>
