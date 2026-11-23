<script lang="ts">
  /**
   * What a fault's Show details opens: the error word for word in the house
   * well, with Copy beside it, as a fault's command stands (RowFault). It scrolls inside past a
   * dozen lines, so a long stack never pushes the fault's own action out of reach.
   */
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  let {
    id,
    details,
    floating = false,
  }: {
    id: string;
    details: string;
    /** It stands over what lies under it: a tab strip's, over the pane. */
    floating?: boolean;
  } = $props();
</script>

<div
  data-slot="fault-details"
  {id}
  data-floating={floating || undefined}
  class="flex w-full min-w-0 items-start gap-space-2 rounded-sm border border-ui-2 bg-bg-2 py-space-1 ps-space-3 pe-space-1 data-floating:border-ui-2 data-floating:bg-bg data-floating:shadow-lg"
  transition:unfold
>
  <pre
    class="kit-edge-fade-block fade-len-row m-0 max-h-48 min-w-0 flex-1 overflow-y-auto overscroll-contain py-space-1 text-start text-tx-2 type-code liga-none whitespace-pre-wrap wrap-anywhere">{details}</pre>
  <CopyButton
    aria-label={regionFaultWords.copyError}
    class="flex-none"
    size="xs"
    text={details}>{regionFaultWords.copy}</CopyButton
  >
</div>
