<script lang="ts">
  /**
   * "Not under an outcome" (Option 1, structure decision 9), one quiet line
   * at the foot beside the met outcomes: its name, what it holds in a
   * quieter line, and its open control.
   */
  import OpenControl from "../OpenControl.svelte";
  import { outcomesWords } from "./words";

  let {
    note,
    onopen,
  }: {
    /** What it holds, in words ("2 tasks and 1 routine"). */
    note: string;
    onopen: () => void;
  } = $props();
</script>

<section
  aria-label={outcomesWords.unplaced}
  class="flex min-w-0 items-start gap-space-2"
>
  <p
    class="m-0 mark-line flex min-w-0 flex-1 flex-wrap items-start gap-x-space-2"
  >
    <!-- No glyph of its own: its words start on the met sentences' edge. -->
    <span aria-hidden="true" class="mark-cell w-icon-md"></span>
    <span class="type-body text-ink-strong @max-phone/view:type-label"
      >{outcomesWords.unplaced}</span
    >
    <span class="type-label text-ink-muted">{note}</span>
  </p>
  <OpenControl label={outcomesWords.open(outcomesWords.unplaced)} {onopen} />
</section>
