<script lang="ts">
  /**
   * What a routine that needs him shows under its name, so he acts without
   * opening it: a run's question with what the run found that led to it,
   * answered by one press on one of its ready answers, or Other… and a
   * field (the routine runs again once he has);
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
  /** He pressed Other…: the field stands open. */
  let writing = $state(false);
  /** The ready answer he pressed; null for one he wrote. */
  let pressed = $state<string | null>(null);
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
      pressed = null;
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
      <p
        class={[
          "type-body",
          standing === "asks" ? "text-status-attn-ink" : "text-ink-muted",
        ]}
      >
        {found}
      </p>
    {/if}
    {#if standing === "asks"}
      <!-- The screen's headline: the run's question, its ready answers the
           strongest buttons under it, one press each; Other… opens a field
           only when none of them is his answer. -->
      <p id={questionId} class="type-title text-pretty text-ink-strong">
        {item.routine.needs?.said}
      </p>
      <div class="flex flex-wrap items-center gap-space-2">
        {#each item.choices as choice (choice)}
          <Button
            aria-describedby={questionId}
            disabled={act.kind === "pending" && pressed !== choice}
            label={choice}
            onclick={() => {
              pressed = choice;
              onanswer(choice);
            }}
            pending={act.kind === "pending" && pressed === choice}
            pendingLabel={words.ask.sending}
            variant="outline"
          />
        {/each}
        <Button
          aria-expanded={writing}
          disabled={act.kind === "pending"}
          label={words.ask.other}
          onclick={() => {
            writing = !writing;
          }}
          variant="outline"
        />
      </div>
      {#if writing}
        <form class="flex min-w-0 items-center gap-space-2" onsubmit={send}>
          <label class="sr-only" for={fieldId}>{words.ask.fieldLabel}</label>
          <Input
            id={fieldId}
            aria-describedby={questionId}
            class="min-w-0 flex-1"
            disabled={act.kind === "pending"}
            bind:value={answer}
            {@attach (field) => field.focus()}
          />
          <Button
            disabled={answer.trim().length === 0}
            label={words.ask.send}
            pending={act.kind === "pending" && pressed === null}
            pendingLabel={words.ask.sending}
            type="submit"
          />
        </form>
      {/if}
      {#if act.kind === "refused"}
        <RowFault reason={act.said} />
      {:else}
        <p class="type-meta text-status-attn-ink">
          {words.ask.askedAt(askedAt)}
        </p>
      {/if}
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
