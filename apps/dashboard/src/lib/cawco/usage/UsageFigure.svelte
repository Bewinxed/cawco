<script lang="ts">
  /**
   * A share in a line of facts (the session card's head): a small ring and
   * the figure in words, the exact numbers its tooltip, which focus opens
   * too. The words carry the figure; the ring shows it (UsageRing).
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import type { MeterState } from "../usage";
  import UsageRing from "./UsageRing.svelte";

  let {
    used,
    state,
    words,
    detail,
  }: {
    /** Share used, 0–100. */
    used: number;
    state: MeterState;
    /** The figure in words: "38% of context". */
    words: string;
    /** The exact numbers, its tooltip: "76k of 200k tokens". */
    detail: string;
  } = $props();
</script>

<Tip label={detail}>
  {#snippet children(tip)}
    <!-- A button only so focus reaches its tooltip: it does nothing else. -->
    <button
      {...tip}
      data-slot="usage"
      class="mark-line inline-flex cursor-default items-center gap-space-1 rounded-hair border-none bg-transparent p-0 text-inherit tabular-nums"
      type="button"
    >
      <span class="grid place-items-center" data-box
        ><UsageRing share={used} {state} /></span
      >
      <span>{words}</span>
    </button>
  {/snippet}
</Tip>
