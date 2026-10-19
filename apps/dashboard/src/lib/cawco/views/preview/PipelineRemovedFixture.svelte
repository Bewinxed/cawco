<script lang="ts">
  /**
   * The Pipeline removed, on a sheet: the project's view strip as the page
   * draws it (the kit's fluid tabs, Board selected) without a Pipeline tab,
   * over the real board, whose column heads already count each stage.
   */
  import { movesFrom, stageLabel } from "#lib/cawco/project-tasks.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import {
    DATES,
    kindOf,
    STAGES,
    TASKS,
  } from "#lib/cawco/tasks/preview/tidewater.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";

  const VIEWS = ["board", "table", "routines", "decisions"];
</script>

<div class="removed">
  <Tabs onValueChange={() => undefined} value="board">
    <TabsList aria-label="Views" scrollable>
      {#each VIEWS as view (view)}
        <TabItem href="?view={view}" label={stageLabel(view)} value={view} />
      {/each}
    </TabsList>
  </Tabs>
  <div class="board">
    <TaskBoard
      allowedFrom={(stage) => movesFrom(STAGES, stage)}
      dateOf={(id) => DATES[id] ?? null}
      hrefOf={(id) => `?task=${id}`}
      {kindOf}
      newIn={undefined}
      oncreate={() => Promise.resolve()}
      onmove={() => undefined}
      onopen={() => undefined}
      stages={STAGES.stages}
      tasks={TASKS}
    />
  </div>
</div>

<style>
  .removed {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-6) 0 var(--space-7);
    background: var(--surface-recess);
  }
  .board {
    block-size: 560px;
  }
</style>
