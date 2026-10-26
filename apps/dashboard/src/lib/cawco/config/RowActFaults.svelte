<script generics="R extends SwitchedRow" lang="ts">
  /**
   * What a row's switch or Delete the hub refused, said under the row with
   * Try again (row-acts.svelte.ts).
   */
  import RowFault from "../RowFault.svelte";
  import DeleteFault from "./DeleteFault.svelte";
  import type { RowActs, SwitchedRow } from "./row-acts.svelte";

  let { acts, row }: { acts: RowActs<R>; row: R } = $props();
</script>

<RowFault
  again={() => acts.toggle(row, !row.enabled)}
  reason={acts.toggleFailed[acts.key(row)]}
/>
<DeleteFault {acts} {row} />
