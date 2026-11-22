<script lang="ts" module>
  /** What stands open in the pane: an outcome at a line, Caw's suggestion, or nothing (the bento). */
  export type Opened =
    | { kind: "outcome"; id: string; line: string | null }
    | { kind: "suggestion" }
    | null;
</script>

<script lang="ts">
  /**
   * Option 3, "one sentence each": the project's Outcomes view. The first
   * view is a bento of outcomes, each tile his sentence and one sentence of
   * where it stands (designing-first-views, step 3); the outcome a run's
   * question waits on comes first, twice the size, with the question and
   * its answers in it, the one thing on the view in colour (step 4). The
   * rest keep the order he said them in, and nothing moves while he is
   * here: an answered tile keeps its place and size until he next comes
   * (step 5). Caw's suggestion closes the bento as a dashed proposal. An
   * outcome, or the suggestion, opens from its open control into the pane
   * where the bento stood (step 6), and Back returns to it.
   *
   * The bento's columns follow the room the pane has, not the window: three
   * from 900, two from 640 (the 600 column beside Caw's conversation, a
   * tablet), one on a phone.
   */
  import OutcomeOpen from "./OutcomeOpen.svelte";
  import OutcomeTile from "./OutcomeTile.svelte";
  import {
    type AnswerState,
    firstOpen,
    type Outcome,
    type SuggestedOutcome,
    waitingLine,
  } from "./outcomes";
  import SuggestionOpen from "./SuggestionOpen.svelte";
  import SuggestionTile from "./SuggestionTile.svelte";
  import { words } from "./words";

  let {
    outcomes,
    suggestion,
    answers,
    offline,
    opened,
    onopen,
    onanswer,
    onact,
    ontake,
    ondismiss,
    onreword,
  }: {
    /** In the order he said them. */
    outcomes: Outcome[];
    suggestion: SuggestedOutcome | null;
    /** Where each run's question stands, by its id. */
    answers: Record<string, AnswerState>;
    /** The time of the last reading while the hub is unreachable; null while it answers. */
    offline: string | null;
    opened: Opened;
    onopen: (next: Opened) => void;
    onanswer: (ask: string, choice: string) => void;
    /** A press inside an opened outcome, as "outcome-id:line-id:what". */
    onact: (what: string) => void;
    ontake: () => void;
    ondismiss: () => void;
    /** Opens Caw's conversation to change an outcome or the suggestion. */
    onreword: () => void;
  } = $props();

  const OPEN: AnswerState = { kind: "open" };
  const answerOf = (outcome: Outcome): AnswerState => {
    const ask = waitingLine(outcome)?.ask;
    return ask ? (answers[ask.id] ?? OPEN) : OPEN;
  };
  /** The outcomes a question stands on (answered this visit or not) first, then the rest as he said them. */
  const ordered = $derived([
    ...outcomes.filter((outcome) => waitingLine(outcome) !== null),
    ...outcomes.filter((outcome) => waitingLine(outcome) === null),
  ]);
  const offlineAct = $derived(offline === null ? null : words.offlineAct);
  const openOutcome = $derived(
    opened?.kind === "outcome"
      ? (outcomes.find((one) => one.id === opened.id) ?? null)
      : null
  );
</script>

<div
  class="@container flex h-full min-h-0 min-w-0 flex-col gap-space-3"
  data-slot="outcomes"
>
  {#if offline !== null}
    <p aria-live="polite" class="type-meta text-ink-muted">
      {words.offline(offline)}
    </p>
  {/if}

  {#if openOutcome && opened?.kind === "outcome"}
    <OutcomeOpen
      answer={answerOf(openOutcome)}
      offline={offlineAct}
      onact={(what) => onact(`${openOutcome.id}:${what}`)}
      onanswer={(choice) => {
        const ask = waitingLine(openOutcome)?.ask;
        if (ask) {
          onanswer(ask.id, choice);
        }
      }}
      onback={() => onopen(null)}
      {onreword}
      outcome={openOutcome}
      startAt={opened.line}
    />
  {:else if opened?.kind === "suggestion" && suggestion}
    <SuggestionOpen
      offline={offlineAct}
      onback={() => onopen(null)}
      {ondismiss}
      {onreword}
      {ontake}
      {suggestion}
    />
  {:else}
    <ul
      aria-label={words.view}
      class="flex min-h-0 min-w-0 grid-cols-2 flex-col gap-space-3 overflow-y-auto @max-phone:gap-space-2 @phone:grid @desk:grid-cols-3"
    >
      {#each ordered as outcome (outcome.id)}
        {@const line = waitingLine(outcome)}
        <li class={["min-w-0", line && "@phone:col-span-2 @desk:row-span-2"]}>
          <OutcomeTile
            answer={answerOf(outcome)}
            ask={line?.ask ?? null}
            offline={offlineAct}
            onanswer={(choice) => {
              if (line?.ask) {
                onanswer(line.ask.id, choice);
              }
            }}
            onopen={() =>
              onopen({
                kind: "outcome",
                id: outcome.id,
                line: firstOpen(outcome),
              })}
            {outcome}
          />
        </li>
      {/each}
      {#if suggestion}
        <li class="min-w-0 @phone:@max-desk:col-span-2">
          <SuggestionTile
            offline={offlineAct}
            {ondismiss}
            onopen={() => onopen({ kind: "suggestion" })}
            {ontake}
            {suggestion}
          />
        </li>
      {/if}
    </ul>
  {/if}
</div>
