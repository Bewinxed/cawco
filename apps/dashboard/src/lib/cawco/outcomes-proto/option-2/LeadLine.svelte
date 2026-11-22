<script lang="ts">
  /**
   * A line in the lead tile's "Done when:" (S1, option 2 decision 4): its
   * sentence and its answer in the list's fixed trailing column, and under
   * an unsettled line the sentence its newest answer came with, then when
   * and what gave it. The Needs you mark stands in the lead column of the
   * line an ask concerns. The selected line wears the pick's look, the
   * option chip's coral edge over the recessed fill (DESIGN.md: coral also
   * marks what is selected), so the one loud mark stays Needs you. Its open
   * control opens the line: beside it in the lead, or as its page under
   * 640. Every answer starts on one
   * x down the tile: its answer column is one fixed width.
   *
   * `brief` (under 640): the reason on one line, and none under the line
   * whose ask the lead already shows above it, which says it.
   */
  import { IconNeedsYou } from "#lib/icons.js";
  import OpenControl from "../OpenControl.svelte";
  import AnswerWord from "./AnswerWord.svelte";
  import { type OutcomeLine, unsettled } from "./outcomes";

  let {
    line,
    selected,
    waiting,
    brief = false,
    onopen,
  }: {
    line: OutcomeLine;
    selected: boolean;
    /** Something about it waits on him, unanswered. */
    waiting: boolean;
    brief?: boolean;
    onopen: () => void;
  } = $props();

  const reason = $derived(
    unsettled(line.answer) && !(brief && waiting) ? line.reason : null
  );
</script>

<!-- mark-line: the Needs you mark has the row's lead column to itself, a
     line box tall, so it centres on the sentence's first line. -->
<li
  aria-current={selected || undefined}
  class="grid grid-cols-(--line-cols) items-start gap-x-space-2 gap-y-space-1 rounded-md border border-transparent px-space-2 py-space-2 transition-[background-color,border-color] duration-(--duration-control) ease-out aria-current:border-brand-solid aria-current:bg-surface-recess"
  data-line={line.id}
  style:--line-cols={"var(--spacing-icon-sm) minmax(0, 1fr) var(--spacing-c-answer-w) auto"}
>
  <span class="grid h-lh place-items-center type-label">
    {#if waiting}
      <IconNeedsYou
        aria-label="Needs you"
        class="size-icon-sm text-status-attn-glyph"
      />
    {/if}
  </span>
  <span class="min-w-0 type-label text-ink-strong">{line.sentence}</span>
  <AnswerWord answer={line.answer} />
  <span class="-my-space-1" data-box>
    <OpenControl label="Open {line.sentence}" {onopen} />
  </span>
  {#if reason}
    <span class="col-start-2 col-end-4 flex min-w-0 flex-col">
      <span
        class={[
          "type-meta text-ink-row",
          brief ? "line-clamp-1" : "line-clamp-2",
        ]}>{reason.said}</span
      >
      <span class="type-meta text-ink-muted"
        >{reason.when}, from {reason.from}</span
      >
    </span>
  {:else if unsettled(line.answer) && line.checker.kind !== "routine"}
    <span class="col-start-2 col-end-4 type-meta text-ink-muted"
      >Nothing checks this.</span
    >
  {/if}
</li>
