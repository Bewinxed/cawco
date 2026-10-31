<script lang="ts">
  /**
   * A fault's Show details: the quiet ghost that opens the error word for
   * word (FaultDetails) under it, and Hide details that folds it away.
   */
  import { shellWords } from "@cawco/core/words/shell";
  import { Button, type ButtonSize } from "#lib/components/ui/button/index.js";

  let {
    shown = $bindable(false),
    controls,
    size = "sm",
    quiet = true,
  }: {
    /** The details are open. */
    shown?: boolean;
    /** The details' id. */
    controls: string;
    size?: ButtonSize;
    /** In the quiet ink; off on a ground where it would not hold its contrast (a tab strip's shelf). */
    quiet?: boolean;
  } = $props();
</script>

<Button
  aria-controls={controls}
  aria-expanded={shown}
  data-details
  label={shown ? shellWords.hideDetails : shellWords.showDetails}
  onclick={() => {
    shown = !shown;
  }}
  {size}
  tone={quiet ? "quiet" : undefined}
  variant="ghost"
/>
