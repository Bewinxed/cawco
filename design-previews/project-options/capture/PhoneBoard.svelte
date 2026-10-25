<!--
  The phone's first view of the board (report 2c, pin 17).

  - P1: the stage strip over one stage's cards; the strip wraps (a chip
    cloud), a chip shows its stage's cards.
  - P2: one grouped list, one group open, closed heads pinned (GroupedList).

  The stage shown first (ruling 10): the first stage holding something that
  waits; with nothing waiting, the first stage. P1's cost (ruling 8): one
  stage at a time, so a stage holding one card is one card and a field.
-->
<script>
  import { board, cardKey, firstShown, STAGES } from "./data.js";
  import GroupedList from "./GroupedList.svelte";
  import Strip from "./Strip.svelte";

  let { option, state = "rest", ask = "C1" } = $props();
  const columns = $derived(board(state));
  const counts = $derived(
    Object.fromEntries(STAGES.map((stage) => [stage.key, columns[stage.key].length]))
  );
  const shown = $derived(firstShown(state));
</script>

{#if option === "P1"}
  <div data-board="P1" class="flex flex-col gap-space-3 px-space-3">
    <Strip chosen={shown} {counts} />
    <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each columns[shown] as item (item.task.id)}
        <li class={state === "stale" && !item.fault ? "opacity-(--account-stale-opacity)" : ""} data-card={cardKey(item, ask)}></li>
      {/each}
    </ol>
  </div>
{:else}
  <div data-board="P2" class="h-full">
    <GroupedList {ask} items="cards" {state} />
  </div>
{/if}
