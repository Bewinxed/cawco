<script lang="ts">
  /**
   * The fleet items that didn't set up on one machine, under its row in the
   * machines list: one fault line per cause the machine gave (convergence.ts
   * `failureGroups`), never one per item. A line says the count, or the one
   * item by name, then the machine's words for the cause; Show details lists
   * its items, and one Retry sends them all again (DESIGN.md: a failure is
   * told and recoverable). 141 items that failed for one reason read as one
   * failure (niftybot.art, 2026-10-23).
   */
  import type { FleetItemStatus } from "@cawco/core";
  import { failureDetails, failureGroups, failureReason } from "./convergence";
  import RowFault from "./RowFault.svelte";

  let {
    items,
    retry,
  }: {
    /** The machine's items as it reported each one; only the failed are drawn. */
    items: readonly FleetItemStatus[];
    /** Sends these items again. */
    retry: (ids: string[]) => unknown;
  } = $props();

  const groups = $derived(failureGroups(items));
</script>

{#each groups as group (group.cause ?? "")}
  <RowFault
    again={() => retry(group.items.map((item) => item.id))}
    againLabel="Retry"
    data-fault-group={group.items.length}
    details={failureDetails(group)}
    reason={failureReason(group)}
  />
{/each}
