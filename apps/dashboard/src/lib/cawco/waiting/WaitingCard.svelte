<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What the session waits on the person for (WaitingList), opened from its
   * chip on the composer's tray row (WaitingChip). It comes out of the
   * composer, so it is a layer of the composer, the plan's family
   * (PlanPane): the kit's floating surface rising out of the tray row it
   * stands on, across the composer's width, over the transcript's foot, at
   * every width. Nothing it does moves the transcript, the composer or the
   * row (the composer's surface brief, The Composer Layer Rule). It holds
   * nothing (DESIGN.md, The Open Page Rule): a row's press opens what asks
   * it beside the conversation and the list stays, and it goes by its
   * Close, Esc or its chip.
   *
   * One column under its title that scrolls, as tall as what it holds up
   * to the room over the row (to the top of the composer's dock): the
   * composer layer's card (ComposerLayerCard).
   */
  import RowFault from "../RowFault.svelte";
  import ComposerLayerCard from "../transcript/ComposerLayerCard.svelte";
  import type { WaitingRow } from "./rows";
  import WaitingList from "./WaitingList.svelte";

  let {
    paneId,
    rows,
    failure = null,
    again,
    faultOf,
    onopen,
    onclose,
  }: {
    /** The conversation its pane shows: whose composer layer it holds. */
    paneId: string;
    rows: WaitingRow[];
    /** Why the last read of the list failed; it keeps the rows it had. */
    failure?: string | null;
    /** Reads the list again. */
    again?: () => void;
    /** Why a row's last open did not go. */
    faultOf?: (row: WaitingRow) => string | null;
    onopen: (row: WaitingRow) => void;
    onclose: () => void;
  } = $props();
</script>

<ComposerLayerCard
  chip="waiting-chip"
  inset="list"
  name="waiting"
  {onclose}
  {paneId}
>
  {#snippet heading()}
    <span class="font-medium">{waitingWords.title}</span>
  {/snippet}
  <WaitingList {faultOf} {onopen} {rows} />
  {#if failure}
    <RowFault {again} reason={waitingWords.readFailed(failure)} />
  {/if}
</ComposerLayerCard>
