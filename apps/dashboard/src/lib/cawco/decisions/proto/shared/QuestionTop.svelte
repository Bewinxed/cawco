<script lang="ts">
  /**
   * A question's top row: its words (QuestionHead) and the size switch
   * that sets every one of its answers' demonstrations at once.
   */
  import type { DecisionState } from "./decision.svelte";
  import QuestionHead from "./QuestionHead.svelte";
  import type { Question } from "./request";
  import SizeSwitch from "./SizeSwitch.svelte";

  let {
    dec,
    question,
    level = 2,
  }: {
    dec: DecisionState;
    question: Question;
    level?: 2 | 3;
  } = $props();
</script>

<div
  class="flex flex-wrap items-end justify-between gap-x-space-5 gap-y-space-3"
>
  <div class="min-w-0 flex-1 basis-field-group">
    <QuestionHead {dec} {question} {level} />
  </div>
  <SizeSwitch
    bind:value={
      () => dec.sizeOf(question), (next) => dec.setSize(question, next)
    }
    label="Size for every answer"
  />
</div>
