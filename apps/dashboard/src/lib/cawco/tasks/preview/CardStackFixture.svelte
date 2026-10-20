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

<ol
  class="m-0 flex list-none flex-col gap-space-1 rounded-lg bg-surface-band p-space-1 inset-ring inset-ring-border-hairline"
  data-card-stack
>
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
