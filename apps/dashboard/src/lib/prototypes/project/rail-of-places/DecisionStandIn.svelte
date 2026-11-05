<script lang="ts">
  /**
   * Where a decision page opens from Decisions or from a wait in Needs you
   * (the option: "in the artifact panel at its first open question"): a
   * stand-in of its size that names the set and the question it opens at,
   * since the page draws itself. The pane's Close is the way back.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { IconDecisions } from "#lib/icons.js";
  import type { Decision } from "./model";

  let { decision }: { decision: Decision } = $props();

  const question = $derived(
    decision.question ?? Math.min(decision.picked[0] + 1, decision.picked[1])
  );
</script>

<div class="flex min-h-full flex-col gap-space-group">
  <p class="type-meta num text-ink-muted">
    {w.picked(decision.picked[0], decision.picked[1])} · {decision.age}
  </p>
  <div
    class="flex min-h-c-caw-panel-h flex-1 flex-col items-start justify-center gap-space-2 rounded-lg border border-dashed border-border-control bg-surface-recess p-space-6"
  >
    <IconDecisions class="size-icon-lg text-ink-muted" aria-hidden="true" />
    <p class="type-label text-ink-strong">{w.decisionStandIn(question)}</p>
    <p class="max-w-c-measure-short type-body text-ink-muted">
      {w.decisionStandInWhy}
    </p>
  </div>
</div>
