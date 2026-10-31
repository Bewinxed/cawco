<script lang="ts">
  /**
   * His words on one question: a note kept as he types it, headed by who
   * reads it, the three remarks that are not picks beside it, and the
   * agent's reply under a note he sent. Folded, it is one press away, so a
   * phone never opens its keyboard by itself.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import { type DecisionState, REMARKS } from "./decision.svelte";
  import type { Question } from "./request";

  let {
    dec,
    question,
    folded = false,
  }: {
    dec: DecisionState;
    question: Question;
    /** One press away until pressed (a phone). */
    folded?: boolean;
  } = $props();

  const asker = $derived(dec.request.asker.name);
  let open = $state(untrack(() => !folded || !!dec.notes[question.id]));
  const reply = $derived(dec.replyTo(question));
  const id = $derived(`note-${question.id}`);
</script>

<div class="flex flex-col gap-space-2">
  {#if open}
    <label class="type-label text-ink-muted" for={id}
      >Say something to {asker}</label
    >
    <Textarea
      {id}
      rows={2}
      value={dec.notes[question.id] ?? ""}
      oninput={(event) => dec.note(question.id, event.currentTarget.value)}
    />
  {:else}
    <Button
      size="sm"
      variant="ghost"
      class="self-start"
      onclick={() => {
        open = true;
      }}
    >
      <span>Say something to {asker}</span>
    </Button>
  {/if}
  {#if reply}
    <p
      class="flex flex-col gap-space-1 rounded-sm bg-surface-recess p-space-3 type-body text-ink-strong"
    >
      <span class="type-label text-ink-muted">{asker}</span>
      <span>{reply}</span>
    </p>
  {/if}
  <fieldset class="m-0 flex flex-wrap items-center gap-space-2 border-0 p-0">
    <legend class="sr-only">Not a choice</legend>
    <span class="type-meta text-ink-muted">Not a choice:</span>
    {#each REMARKS as remark (remark.id)}
      <Toggle
        size="xs"
        variant="outline"
        pressed={dec.remarks[question.id] === remark.id}
        onPressedChange={() => dec.remark(question.id, remark.id)}
      >
        <span>{remark.word}</span>
      </Toggle>
    {/each}
  </fieldset>
</div>
