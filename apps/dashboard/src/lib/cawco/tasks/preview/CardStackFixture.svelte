<script lang="ts">
  /**
   * Every card state in one column at a phone's width, as a phone's board
   * column stands them: the one-state-line cards, fed the tidewater tasks.
   */
  import TaskCardStateLine from "../TaskCardStateLine.svelte";
  import {
    CARD_STATES,
    DATES,
    sessionNameOf,
    sessionPlaceOf,
    taskOf,
  } from "./tidewater";
</script>

<ol class="stack" data-card-stack>
  {#each CARD_STATES as state (state.id)}
    {@const task = taskOf(state.task)}
    <li>
      <TaskCardStateLine
        date={DATES[task.id] ?? null}
        href="?task={task.id}"
        nameOf={sessionNameOf}
        placeOf={sessionPlaceOf}
        {task}
      />
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
