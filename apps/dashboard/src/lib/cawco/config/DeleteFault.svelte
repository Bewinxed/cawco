<script generics="R extends ActedRow" lang="ts">
  /** A row's Delete the hub refused, said under the row with Try again (row-acts.svelte.ts). */
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import type { ActedRow, RowActs } from "./row-acts.svelte";

  let { acts, row }: { acts: RowActs<R>; row: R } = $props();
</script>

<RowFault
  again={() => acts.remove(row)}
  data-delete-refusal={acts.key(row)}
  reason={refusals.reason(acts.deleteKey(row))}
/>
