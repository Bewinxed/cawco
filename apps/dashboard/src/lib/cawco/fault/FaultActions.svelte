<script lang="ts">
  /**
   * The ways on under a fault's words (RegionFault, the decision card's
   * DecisionFault): one action leads, Try again, or Reload page once the
   * rebuild threw again at once, with Show details quiet under it, and the
   * error word for word under both once it is open (design/
   * fault-references.md, BitePal and Vocabulary).
   */
  import { commonWords } from "@cawco/core/words/common";
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { Button } from "#lib/components/ui/button/index.js";
  import FaultDetails from "./FaultDetails.svelte";
  import ShowDetails from "./ShowDetails.svelte";

  let {
    again = false,
    details,
    open = false,
    outline = false,
    onretry,
    onreload,
  }: {
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    /** The lead in an outline: where the view's coral is another action's (a decision page's Send). */
    outline?: boolean;
    onretry: () => void;
    onreload: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally: `open` only says how it starts.
  let shown = $state(open);
  const detailsId = $props.id();
</script>

<div class="flex w-full min-w-0 flex-col items-center">
  <div class="flex flex-col items-center gap-space-2">
    <Button
      data-lead
      label={again ? regionFaultWords.reloadPage : commonWords.tryAgain}
      onclick={again ? onreload : onretry}
      variant={outline ? "outline" : undefined}
    />
    <ShowDetails controls={detailsId} bind:shown />
  </div>
  {#if shown}
    <div class="mt-space-3 w-full min-w-0">
      <FaultDetails {details} id={detailsId} />
    </div>
  {/if}
</div>
