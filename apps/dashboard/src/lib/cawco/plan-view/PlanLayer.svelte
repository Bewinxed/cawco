<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * A session's plan, opened from its chip on the composer's tray row
   * (PlanChip): a card of the composer's layer (ComposerLayerCard), the
   * family of the list of what waits on the person, so opening it shuts
   * that list and the tray's shelf, and nothing it does moves the
   * conversation. Its heading says how far the plan has got; under it the
   * plan's body (`children`, a way of reading the plan) on the lead-row
   * grid.
   */
  import type { Snippet } from "svelte";
  import ComposerLayerCard from "../transcript/ComposerLayerCard.svelte";

  let {
    paneId,
    done,
    total,
    onclose,
    children,
  }: {
    /** The conversation its pane shows: whose composer layer it holds. */
    paneId: string;
    done: number;
    total: number;
    onclose: () => void;
    children: Snippet;
  } = $props();
</script>

<ComposerLayerCard chip="plan-chip" inset="lead" name="plan" {onclose} {paneId}>
  {#snippet heading()}
    <span class="font-medium">{planWords.plan}</span>
    <span class="num ms-space-2 text-ink-muted"
      >{planWords.doneOf(done, total)}</span
    >
  {/snippet}
  {@render children()}
</ComposerLayerCard>
