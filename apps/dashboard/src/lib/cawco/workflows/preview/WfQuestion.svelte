<script lang="ts">
  /**
   * The question a step parks on the owner, opened in place under its row:
   * the question's lede and its options as the kit's option chips with
   * their keycaps (QuestionCard's live anatomy), a pick answering it. The
   * same ask stands in Needs you and reaches the phone as its push.
   */
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { QUESTION } from "./release";

  let {
    picked = null,
    indent = "calc(var(--space-3) + var(--c-row-mark) + var(--space-2))",
  }: {
    /** The option the owner has pressed, while the answer goes. */
    picked?: string | null;
    /** Where the row's words start: the question stands on that column. */
    indent?: string;
  } = $props();
</script>

<div
  data-slot="wf-question"
  class="flex flex-col gap-space-2 pe-space-3 pt-space-1 pb-space-3 ps-(--q-indent)"
  style:--q-indent={indent}
>
  <p class="m-0 max-w-c-measure type-body text-ink-strong">
    {QUESTION.text}
    <span class="text-ink-muted">{QUESTION.detail}</span>
  </p>
  <div class={chipsVariants()} role="group" aria-label={QUESTION.text}>
    {#each QUESTION.options as option, i (option)}
      <button
        aria-pressed={picked === option}
        class={chipVariants()}
        type="button"
      >
        <Kbd data-box look="keycap">{i + 1}</Kbd><span>{option}</span>
      </button>
    {/each}
  </div>
</div>
