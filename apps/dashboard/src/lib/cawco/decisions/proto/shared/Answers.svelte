<script lang="ts">
  /**
   * A question's answers and his note on it: each answer its head over its
   * live frame at the question's one size, as the stage's columns or the
   * brief's row. A column is as wide as its frame, short of the room by a
   * peek of the next. In columns on a phone one answer stands in view,
   * chosen from a row above them, so looking is never picking.
   */
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import AnswerGroup from "./AnswerGroup.svelte";
  import AnswerHead from "./AnswerHead.svelte";
  import type { DecisionState } from "./decision.svelte";
  import LiveFrame from "./LiveFrame.svelte";
  import NeedsList from "./NeedsList.svelte";
  import NoteBox from "./NoteBox.svelte";
  import { type Question, SIZES } from "./request";

  let {
    dec,
    question,
    layout,
  }: {
    dec: DecisionState;
    question: Question;
    layout: "columns" | "row";
  } = $props();

  const size = $derived(dec.sizeOf(question));
  /** On a phone in columns, the answer in view. */
  let viewing = $state(0);
  const one = $derived(layout === "columns");
</script>

{#if one}
  <div class="hidden overflow-x-auto px-space-4 @max-phone:block">
    <ToggleGroup.Root
      type="single"
      value={String(viewing)}
      onValueChange={(next) => {
        if (next) {
          viewing = Number(next);
        }
      }}
      aria-label="Answer in view"
    >
      {#each question.answers as answer, i (answer.id)}
        <ToggleGroup.Item value={String(i)}>
          <span>{i + 1} {answer.name}</span>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>
{/if}
<AnswerGroup {dec} {question} {layout}>
  {#each question.answers as answer, i (answer.id)}
    <div
      class={[
        "flex w-(--col-w) flex-none snap-start flex-col gap-space-3 @max-phone:w-full",
        one && i !== viewing && "@max-phone:hidden",
      ]}
      style:--col-w="min({SIZES[size].w}px, 100% - var(--space-8) * 2)"
    >
      <div class={one ? "@max-phone:px-space-4" : ""}>
        <AnswerHead {dec} {question} {answer} index={i} />
      </div>
      <LiveFrame {size} label="{answer.name}, {SIZES[size].word}">
        <NeedsList look={dec.lookWith(question, answer)} />
      </LiveFrame>
    </div>
  {/each}
</AnswerGroup>
<div
  class={one ? "max-w-task-frame @max-phone:px-space-4" : "max-w-task-frame"}
>
  <NoteBox {dec} {question} folded={!one} />
</div>
