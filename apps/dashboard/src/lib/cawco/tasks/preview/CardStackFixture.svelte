<script lang="ts">
  /**
   * Every card state in one column at a phone's width, today's card or the
   * proposed one, as a phone's board column stands them: the real cards,
   * fed the tidewater tasks.
   */
  import TaskCard from "../TaskCard.svelte";
  import TaskCardStateLine from "../TaskCardStateLine.svelte";
  import { CARD_STATES, DATES, kindOf, sessionNameOf, taskOf } from "./tidewater";

  let { proposed = false }: { proposed?: boolean } = $props();
</script>

<ol class="stack" data-card-stack={proposed ? "proposed" : "today"}>
  {#each CARD_STATES as state (state.id)}
    {@const task = taskOf(state.task)}
    <li>
      {#if proposed}
        <TaskCardStateLine
          date={DATES[task.id] ?? null}
          href="?task={task.id}"
          nameOf={sessionNameOf}
          {task}
        />
      {:else}
        <TaskCard
          date={DATES[task.id] ?? null}
          href="?task={task.id}"
          {kindOf}
          {task}
        />
      {/if}
    </li>
  {/each}
</ol>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-1);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    list-style: none;
  }
</style>
