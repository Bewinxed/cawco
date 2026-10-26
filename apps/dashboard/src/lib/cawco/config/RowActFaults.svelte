<script generics="R extends ActedRow" lang="ts">
  /**
   * What a row's switch or Delete the hub refused, said under the row with
   * Try again (row-acts.svelte.ts).
   */
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import type { ActedRow, RowActs } from "./row-acts.svelte";

  let { acts, row }: { acts: RowActs<R>; row: R } = $props();
</script>

<RowFault
  again={() => acts.toggle(row, !row.enabled)}
  reason={acts.toggleFailed[row.id]}
/>
<RowFault
  again={() => acts.remove(row)}
  data-delete-refusal={row.id}
  reason={refusals.reason(acts.deleteKey(row.id))}
/>
