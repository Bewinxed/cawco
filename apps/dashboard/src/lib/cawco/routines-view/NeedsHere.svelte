<script lang="ts">
  /**
   * What a routine that needs him shows under its name, so he acts without
   * opening it: a run's question with what the run found that led to it,
   * answered in the field under it (the routine runs again once he has);
   * or why it was turned off, and the one press that turns it back on.
   * The hub's answer stands where the act was: done in a sentence, or its
   * refusal with the act still there to try again (DESIGN.md, Flow).
   */
  import { routineOutcomeWords as words } from "@cawco/core/words/routine-outcomes";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import RowFault from "../RowFault.svelte";
  import type { ActState, RoutineItem, Standing } from "./outcomes";

  let {
    item,
    standing,
    askedAt,
    act,
    onanswer,
    onturnon,
  }: {
    item: RoutineItem;
    /** What it needs: a run's question, or a failure that turned it off. */
    standing: Extract<Standing, "asks" | "failing">;
    /** When the run asked, in his clock ("03:03"). */
    askedAt: string;
    act: ActState;
    onanswer: (answer: string) => void;
    onturnon: () => void;
  } = $props();

  /** What he is typing: the field's own, until he sends it. */
  let answer = $state("");
  const fieldId = $derived(`answer-${item.id}`);
  const questionId = $derived(`question-${item.id}`);
  const found = $derived(
    standing === "asks"
      ? item.routine.lastRun?.output
      : (item.routine.needs?.said ?? item.routine.lastRun?.reason)
  );

  function send(event: SubmitEvent) {
    event.preventDefault();
    const text = answer.trim();
    if (text.length > 0) {
      onanswer(text);
    }
  }
</script>

<div
  data-slot="needs-here"
  class="flex flex-col gap-space-2 @min-[36rem]/view:gap-space-3"
>
  {#if act.kind === "done"}
    <!-- The hub took it: what comes next, where the act was. -->
    <p data-slot="done" class="type-meta text-ink-muted">{act.said}</p>
  {:else}
    {#if found}
      <p class="type-body text-ink-muted">{found}</p>
    {/if}
    {#if standing === "asks"}
      <p id={questionId} class="type-body text-ink-strong">
        {item.routine.needs?.said}
      </p>
      <form class="flex flex-col gap-space-2" onsubmit={send}>
        <label class="sr-only" for={fieldId}>{words.ask.fieldLabel}</label>
        <div class="flex min-w-0 items-center gap-space-2">
          <Input
            id={fieldId}
            aria-describedby={questionId}
            class="min-w-0 flex-1"
            disabled={act.kind === "pending"}
            bind:value={answer}
          />
          <Button
            disabled={answer.trim().length === 0}
            label={words.ask.send}
            pending={act.kind === "pending"}
            pendingLabel={words.ask.sending}
            size="sm"
            type="submit"
          />
        </div>
        {#if act.kind === "refused"}
          <RowFault reason={act.said} />
        {:else}
          <p class="type-meta text-ink-muted">{words.ask.askedAt(askedAt)}</p>
        {/if}
      </form>
    {:else}
      <div class="flex flex-col items-start gap-space-2">
        <Button
          label={words.off.turnOn}
          onclick={onturnon}
          pending={act.kind === "pending"}
          pendingLabel={words.off.turningOn}
          size="sm"
          variant="outline"
        />
        {#if act.kind === "refused"}
          <RowFault reason={act.said} />
        {/if}
      </div>
    {/if}
  {/if}
</div>
