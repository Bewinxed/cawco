<script lang="ts">
  import type { PlanEdit } from "@cawco/core/plan";
  import type { StageKind } from "@cawco/core/views";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconAdd, IconSearch } from "#lib/icons.js";
  import PlanTaskCard from "./PlanTaskCard.svelte";
  import PlanTaskDetail from "./PlanTaskDetail.svelte";
  import {
    addTodoToTask,
    applyPlanEdit,
    clearStepHold,
    createAndAddTask,
    derivePlanModel,
    moveTaskStage,
    resolveOfferedTodo,
  } from "./plan-model.js";
  import type {
    DerivedPlanTask,
    PhaseFilter,
    PlanViewDataset,
  } from "./types.js";

  let {
    dataset,
    openTaskId = null,
    initialPhase = "all",
  }: {
    dataset: PlanViewDataset;
    initialPhase?: PhaseFilter;
    openTaskId?: string | null;
  } = $props();

  // Writable $derived runes so the live view tracks Storybook prop updates while staying interactive
  let liveDataset = $derived(dataset);
  let selectedTaskId = $derived(openTaskId);
  let phaseFilter = $derived<PhaseFilter>(initialPhase);
  let earlierFolded = $derived(true);
  let addBarOpen = $derived(false);
  let searchOpen = $derived(false);
  let query = $derived("");

  let newTaskTitle = $state("");

  const model = $derived(derivePlanModel(liveDataset));

  const selectedTask = $derived(
    selectedTaskId
      ? (model.tasks.find((t) => t.taskId === selectedTaskId) ?? null)
      : null
  );

  function matchesFilter(task: DerivedPlanTask, lens: PhaseFilter): boolean {
    switch (lens) {
      case "all":
        return true;
      case "needs_you":
        return task.needsYou;
      case "moving":
        return task.phase === "moving";
      case "ahead":
        return (
          task.phase === "ahead" || (task.phase === "held" && !task.needsYou)
        );
      case "done":
        return task.phase === "done";
      default:
        return true;
    }
  }

  const filteredTasks = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return model.tasks.filter((task) => {
      if (!matchesFilter(task, phaseFilter)) {
        return false;
      }
      if (q) {
        const hay = [
          task.title,
          task.overviewSentence,
          ...task.todos.map((td) => td.text),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  });

  const isUnfilteredAll = $derived(phaseFilter === "all" && !query.trim());

  const leadingDoneCount = $derived.by(() => {
    let count = 0;
    for (const task of model.tasks) {
      if (task.phase === "done") {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  });

  // Only long plans (> 4 consecutive finished tasks at the start) fold that finished prefix so active and needs-you work stays above the fold
  const showFoldedPrefix = $derived(
    isUnfilteredAll && leadingDoneCount > 4 && earlierFolded
  );

  const renderedSpineTasks = $derived<DerivedPlanTask[]>(
    showFoldedPrefix ? filteredTasks.slice(leadingDoneCount) : filteredTasks
  );

  const upNextCount = $derived(
    model.tasks.filter(
      (t) => t.phase === "ahead" || (t.phase === "held" && !t.needsYou)
    ).length
  );

  const FILTER_OPTIONS = $derived<
    { id: PhaseFilter; label: string; shown: boolean }[]
  >([
    { id: "all", label: "All tasks", shown: true },
    { id: "needs_you", label: "Needs you", shown: model.needsYouCount > 0 },
    { id: "moving", label: "In progress", shown: model.movingCount > 0 },
    { id: "ahead", label: "Up next", shown: upNextCount > 0 },
    { id: "done", label: "Finished", shown: model.doneCount > 0 },
  ]);

  function handleSelectTask(taskId: string) {
    selectedTaskId = selectedTaskId === taskId ? null : taskId;
  }

  function handleEdit(edit: PlanEdit) {
    liveDataset = applyPlanEdit(liveDataset, edit);
  }

  function handleAddTodo(taskId: string, text: string) {
    liveDataset = addTodoToTask(liveDataset, taskId, text);
  }

  function handleResolveOffer(taskId: string, todoId: string, accept: boolean) {
    liveDataset = resolveOfferedTodo(liveDataset, taskId, todoId, accept);
  }

  function handleMoveStage(taskId: string, stage: string, kind: StageKind) {
    liveDataset = moveTaskStage(liveDataset, taskId, stage, kind);
  }

  function handleClearHold(taskId: string) {
    liveDataset = clearStepHold(liveDataset, taskId);
  }

  function submitNewTask() {
    const created = createAndAddTask(liveDataset, newTaskTitle);
    if (created) {
      liveDataset = created.dataset;
      selectedTaskId = created.newTaskId;
      newTaskTitle = "";
      addBarOpen = false;
    }
  }

  function addExistingBacklogTask(taskId: string) {
    liveDataset = applyPlanEdit(liveDataset, { kind: "add", step: taskId });
    selectedTaskId = taskId;
    addBarOpen = false;
  }
</script>

{#snippet taskInspector(task: DerivedPlanTask)}
  <PlanTaskDetail
    allTasks={liveDataset.tasks}
    changes={model.changes}
    onAddTodo={handleAddTodo}
    onClearHold={handleClearHold}
    onClose={() => {
      selectedTaskId = null;
    }}
    onEdit={handleEdit}
    onMoveStage={handleMoveStage}
    onResolveOffer={handleResolveOffer}
    onSelectTask={(id) => {
      selectedTaskId = id;
    }}
    sessionState={liveDataset.session.liveState}
    sessionTitle={liveDataset.session.title}
    {task}
    totalTasks={model.tasks.length}
  />
{/snippet}

<!-- Level 1: Calm Transient Plan Overview (details wait until a task is opened) -->
<div
  class="@container/plan relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
  data-slot="plan-view"
>
  <header
    class="flex shrink-0 flex-col border-b border-border-hairline bg-surface-raised"
  >
    <div
      class="mx-auto flex w-full max-w-180 flex-col gap-space-2 px-space-4 py-space-3 @max-phone/plan:px-space-3 @max-phone/plan:py-space-2"
    >
      <div class="flex items-start justify-between gap-space-3">
        <div class="flex min-w-0 flex-1 flex-col gap-space-row">
          <h1
            class="overflow-clip text-ellipsis whitespace-nowrap type-title text-ink-strong"
          >
            {liveDataset.session.title}
          </h1>
          <p class="type-meta text-ink-muted">{model.overviewLine}</p>
        </div>

        <Button
          class="shrink-0"
          icon={IconAdd}
          label="Add task to plan"
          onclick={() => {
            addBarOpen = !addBarOpen;
          }}
          size="sm"
          variant="default"
        />
      </div>

      <!-- Optional person-chosen filters (Step 5: filtering is the person's act) -->
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <div class="flex flex-wrap items-center gap-space-1">
          {#each FILTER_OPTIONS as opt (opt.id)}
            {#if opt.shown}
              {@const active = phaseFilter === opt.id}
              <button
                aria-pressed={active}
                class={[
                  "pressable touch-hit inline-flex h-7 items-center rounded-sm border px-space-2 type-label transition-control",
                  active
                    ? "border-brand-solid bg-option-picked text-ink-strong"
                    : "border-border-control bg-surface-raised text-ink-muted can-hover:hover:bg-surface-hover",
                ]}
                onclick={() => {
                  phaseFilter = opt.id;
                }}
                type="button"
              >
                {opt.label}
              </button>
            {/if}
          {/each}
        </div>

        <Button
          icon={IconSearch}
          label={searchOpen ? "Hide search" : "Find task"}
          onclick={() => {
            searchOpen = !searchOpen;
            if (!searchOpen) {
              query = "";
            }
          }}
          size="xs"
          tone="quiet"
          variant="ghost"
        />
      </div>

      {#if searchOpen}
        <div class="flex items-center gap-space-2 pt-space-1">
          <div class="min-w-0 flex-1">
            <Input
              aria-label="Find task or to-do in plan"
              look="cell"
              placeholder="Find a task or to-do…"
              bind:value={query}
            />
          </div>
          {#if query}
            <Button
              label="Clear search"
              onclick={() => {
                query = "";
              }}
              size="xs"
              tone="muted"
              variant="ghost"
            />
          {/if}
        </div>
      {/if}
    </div>

    {#if addBarOpen}
      <div
        class="border-t border-border-hairline bg-surface-recess px-space-4 py-space-3 @max-phone/plan:px-space-3"
      >
        <div class="mx-auto flex w-full max-w-180 flex-col gap-space-2">
          <form
            class="flex flex-wrap items-center gap-space-2"
            onsubmit={(e) => {
              e.preventDefault();
              submitNewTask();
            }}
          >
            <div class="min-w-52 flex-1">
              <Input
                aria-label="New task title to add to plan"
                placeholder="Write a task title to add to this plan…"
                bind:value={newTaskTitle}
              />
            </div>
            <Button
              label="Create and add task"
              size="sm"
              type="submit"
              variant="secondary"
            />
            <Button
              label="Cancel add"
              onclick={() => {
                addBarOpen = false;
              }}
              size="sm"
              tone="muted"
              variant="ghost"
            />
          </form>

          {#if liveDataset.boardBacklog.length > 0}
            <div class="flex flex-wrap items-center gap-space-2">
              <span class="type-meta text-ink-muted">Or pick from board:</span>
              {#each liveDataset.boardBacklog as item (item.id)}
                <Button
                  label={`Add: ${item.title.slice(0, 42)}${item.title.length > 42 ? "…" : ""}`}
                  onclick={() => addExistingBacklogTask(item.id)}
                  size="xs"
                  variant="outline"
                />
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </header>

  <!-- Two-level disclosure: Overview Spine -> Opened Task Sheet (only mounted when a task is opened) -->
  <div class="relative flex min-h-0 flex-1">
    <main
      aria-label="Session plan overview"
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-space-4 py-space-3 @max-phone/plan:px-space-3"
    >
      <div class="mx-auto flex w-full max-w-180 flex-col">
        {#if showFoldedPrefix}
          <div class="flex gap-x-space-3">
            <div
              class="relative flex w-c-row-lead shrink-0 flex-col items-center"
            >
              <span aria-hidden="true" class="h-space-2 w-px shrink-0"></span>
              <span
                aria-hidden="true"
                class="my-1 size-2 shrink-0 rounded-pill bg-nest-ink"
              ></span>
              <span
                aria-hidden="true"
                class="min-h-space-2 w-px flex-1 bg-nest-ink"
              ></span>
            </div>
            <div class="min-w-0 flex-1 pb-space-2">
              <button
                class="press-tint touch-hit flex w-full items-center justify-between gap-space-2 rounded-md border border-border-hairline bg-surface-recess px-space-3 py-space-1 text-start transition-control focus-inset can-hover:hover:bg-surface-hover"
                onclick={() => {
                  earlierFolded = false;
                }}
                type="button"
              >
                <span class="type-meta text-ink-muted">
                  <span class="mono-figure">{leadingDoneCount}</span> earlier tasks
                  finished
                </span>
                <span class="type-label text-ink-strong">
                  Show earlier tasks
                </span>
              </button>
            </div>
          </div>
        {:else if isUnfilteredAll && leadingDoneCount > 4 && !earlierFolded}
          <div class="mb-space-2 flex justify-end">
            <Button
              label="Hide earlier finished tasks"
              onclick={() => {
                earlierFolded = true;
              }}
              size="xs"
              tone="quiet"
              variant="ghost"
            />
          </div>
        {/if}

        {#if renderedSpineTasks.length === 0}
          <div
            class="flex flex-col items-start gap-space-2 rounded-lg border border-border-hairline bg-surface-raised p-space-4"
          >
            <p class="type-label text-ink-strong">
              No tasks match this filter.
            </p>
            <Button
              label="Show all tasks"
              onclick={() => {
                phaseFilter = "all";
                query = "";
              }}
              size="xs"
              variant="secondary"
            />
          </div>
        {:else}
          {#each renderedSpineTasks as task, idx (task.handle)}
            <PlanTaskCard
              isFirst={idx === 0 && !showFoldedPrefix}
              isLast={idx === renderedSpineTasks.length - 1}
              onSelectTask={handleSelectTask}
              selected={selectedTaskId === task.taskId}
              {task}
            />
          {/each}
        {/if}
      </div>
    </main>

    <!-- Desk Opened Task Sheet (≥ 900px): disclosed ONLY when a task is opened -->
    {#if selectedTask}
      <aside
        aria-label="Opened task details"
        class="hidden min-h-0 w-c-connect-w shrink-0 flex-col border-s border-border @min-desk/plan:flex"
      >
        {@render taskInspector(selectedTask)}
      </aside>
    {/if}

    <!-- Phone Opened Task Sheet (< 900px): bottom drawer with 100×6 grabber -->
    {#if selectedTask}
      <div
        class="absolute inset-0 z-(--layer-sheet) flex flex-col justify-end bg-scrim @min-desk/plan:hidden"
      >
        <button
          aria-label="Dismiss task sheet"
          class="min-h-12 flex-1 bg-transparent"
          onclick={() => {
            selectedTaskId = null;
          }}
          type="button"
        ></button>
        <div
          aria-label={selectedTask.title}
          aria-modal="true"
          class="flex max-h-c-sheet-max-h min-h-0 flex-col overflow-hidden rounded-t-modal border-t border-border bg-surface-raised shadow-drawer"
          role="dialog"
        >
          <div class="flex shrink-0 justify-center pt-space-2">
            <span
              aria-hidden="true"
              class="h-c-grabber-h w-c-grabber-w rounded-pill bg-border-control"
            ></span>
          </div>
          {@render taskInspector(selectedTask)}
        </div>
      </div>
    {/if}
  </div>
</div>
