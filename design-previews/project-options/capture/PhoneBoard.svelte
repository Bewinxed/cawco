<!--
  The phone's first view of the board (report 2c, pin 17).

  - P1: the stage strip over one stage's cards; the strip wraps (a chip
    cloud), a chip shows its stage's cards.
  - P2: one grouped list, one group open, closed heads pinned (GroupedList).

  The stage shown first: Ready on his board today; where something waits
  (drawn for the state), the stage that holds the ask.
-->
<script>
  import { board, cardKey, STAGES } from "./data.js";
  import GroupedList from "./GroupedList.svelte";
  import Strip from "./Strip.svelte";

  let { option, state = "rest", ask = "C1" } = $props();
  const columns = $derived(board(state));
  const counts = $derived(
    Object.fromEntries(STAGES.map((stage) => [stage.key, columns[stage.key].length]))
  );
  const shown = $derived(state === "waits" ? "working" : "ready");
</script>

{#if option === "P1"}
  <div data-board="P1" class="flex flex-col gap-space-3 px-space-3">
    <Strip chosen={shown} {counts} />
    <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each columns[shown] as item (item.task.id)}
        <li data-card={cardKey(item, ask)}></li>
      {/each}
    </ol>
  </div>
{:else}
  <div data-board="P2" class="h-full">
    <GroupedList {ask} items="cards" {state} />
  </div>
{/if}
