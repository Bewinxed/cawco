<script lang="ts">
  import { harnessName } from "@cawco/core/harness/kinds";
  import type { PlanEdit } from "@cawco/core/plan";
  import type { StageKind } from "@cawco/core/views";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconAdd, IconSearch } from "#lib/icons.js";
  import PlanDelegateHeader from "./PlanDelegateHeader.svelte";
  import PlanSideSummary from "./PlanSideSummary.svelte";
  import PlanTaskCard from "./PlanTaskCard.svelte";
  import PlanTaskDetail from "./PlanTaskDetail.svelte";
  import {
    addTodoToTask,
    applyPlanEdit,
    changeDeliveryLabel,
    clearStepHold,
    createAndAddTask,
    derivePlanModel,
    moveTaskStage,
    resolveOfferedTodo,
  } from "./plan-model.js";
  import {
    HORIZON_SEGMENT_BG,
    IDENTITY_DOT_BG,
    PHASE_WORD,
  } from "./style-maps.js";
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

  // Writable $derived runes so the live view tracks Storybook prop updates while staying fully interactive
  let liveDataset = $derived(dataset);
  let selectedTaskId = $derived(openTaskId);
  let phaseFilter = $derived<PhaseFilter>(initialPhase);
  let delegateFilter = $derived<string>("all");
  let doneFolded = $derived(true);
  let aheadFolded = $derived(dataset.plan.steps.length > 14);
  let manualExpandedWells = $derived<Record<string, boolean>>({});
  let addBarOpen = $derived(false);
  let searchOpen = $derived(dataset.plan.steps.length > 14);
  let query = $derived("");

  let newTaskTitle = $state("");
  let chosenBacklogId = $state("");

  const model = $derived(derivePlanModel(liveDataset));

  const selectedTask = $derived(
    selectedTaskId
      ? (model.tasks.find((t) => t.taskId === selectedTaskId) ?? null)
      : null
  );

  const filteredTasks = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return model.tasks.filter((task) => {
      if (phaseFilter !== "all" && task.phase !== phaseFilter) {
        return false;
      }
      if (delegateFilter === "parent" && task.delegate !== null) {
        return false;
      }
      if (
        delegateFilter !== "all" &&
        delegateFilter !== "parent" &&
        task.delegate?.id !== delegateFilter
      ) {
        return false;
      }
      if (q) {
        const hay = [
          task.taskId,
          task.title,
          task.delegate?.title ?? "",
          ...task.todos.map((td) => td.text),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  });

  const isUnfilteredAll = $derived(
    phaseFilter === "all" && delegateFilter === "all" && !query.trim()
  );

  const doneGroupTasks = $derived(
    isUnfilteredAll ? filteredTasks.filter((t) => t.phase === "done") : []
  );

  const activeSpineTasks = $derived.by(() => {
    if (!isUnfilteredAll) {
      return filteredTasks;
    }
    const nonDone = filteredTasks.filter((t) => t.phase !== "done");
    if (!aheadFolded) {
      return nonDone;
    }
    let seenAhead = 0;
    return nonDone.filter((t) => {
      if (t.phase !== "ahead") {
        return true;
      }
      seenAhead += 1;
      return seenAhead <= 2;
    });
  });

  const hiddenAheadCount = $derived.by(() => {
    if (!(isUnfilteredAll && aheadFolded)) {
      return 0;
    }
    const totalAhead = filteredTasks.filter((t) => t.phase === "ahead").length;
    return Math.max(0, totalAhead - 2);
  });

  const renderedSpineTasks = $derived<DerivedPlanTask[]>(
    isUnfilteredAll && !doneFolded
      ? [...doneGroupTasks, ...activeSpineTasks]
      : activeSpineTasks
  );

  function isWellExpanded(task: DerivedPlanTask): boolean {
    const explicit = manualExpandedWells[task.taskId];
    if (explicit !== undefined) {
      return explicit;
    }
    return task.phase === "moving" || task.phase === "held";
  }

  function toggleWell(taskId: string) {
    const found = model.tasks.find((t) => t.taskId === taskId);
    const current = found ? isWellExpanded(found) : false;
    manualExpandedWells = { ...manualExpandedWells, [taskId]: !current };
  }

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
    chosenBacklogId = "";
    addBarOpen = false;
  }

  const latestUnsettledChange = $derived(
    [...model.changes].reverse().find((c) => !c.toldAt)
  );

  const PHASE_TABS = $derived<
    { count: number; id: PhaseFilter; label: string }[]
  >([
    { id: "all", label: "All", count: model.tasks.length },
    { id: "moving", label: "Moving", count: model.movingCount },
    { id: "held", label: "Held", count: model.heldCount },
    { id: "ahead", label: "Ahead", count: model.aheadCount },
    { id: "done", label: "Done", count: model.doneCount },
  ]);
</script>

{#snippet taskInspector(task: DerivedPlanTask)}
  <PlanTaskDetail
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
    sessionTitle={liveDataset.session.title}
    {task}
  />
{/snippet}

<!-- Level 1: The Session's Plan Surface (viewport-bounded so everything the view holds is seen without page-scrolling) -->
<div
  class="@container/plan relative flex h-dvh max-h-dvh min-h-140 w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
  data-slot="plan-view"
>
  <!-- Top Session Bar & Single Primary Coral Act -->
  <header
    class="flex shrink-0 flex-col border-b border-border-hairline bg-surface-raised"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-space-2 px-space-4 py-space-2 @max-phone/plan:px-space-3"
    >
      <!-- Session Identity & Context -->
      <div class="flex min-w-0 items-center gap-space-2">
        <PlanDelegateHeader
          harness={liveDataset.session.harness}
          identity={liveDataset.session.identity}
          title={liveDataset.session.title}
        />
        <span class="shrink-0 type-meta text-ink-muted @max-phone/plan:hidden">
          {liveDataset.session.project} · {harnessName(
            liveDataset.session.harness
          )} on {liveDataset.session.machine}
        </span>
      </div>

      <!-- Session Surface Switch (where the Plan sits beside Conversation) + One Coral Action -->
      <div class="flex shrink-0 items-center gap-space-2">
        <nav
          aria-label="Session view"
          class="inline-flex items-center rounded-md bg-surface-recess-deep p-0.5"
        >
          <span
            class="inline-flex h-7 items-center rounded-well px-space-3 type-label text-ink-muted"
          >
            Conversation
          </span>
          <span
            aria-current="page"
            class="inline-flex h-7 items-center gap-space-1 rounded-well bg-surface-raised px-space-3 type-label text-ink-strong shadow-xs"
          >
            <span>Plan</span>
            <span class="mono-figure text-ink-muted">
              {model.doneCount}/{model.tasks.length}
            </span>
          </span>
        </nav>

        <Button
          icon={IconAdd}
          label="Add task to plan"
          onclick={() => {
            addBarOpen = !addBarOpen;
          }}
          size="sm"
          variant="default"
        />
      </div>
    </div>

    <!-- Add Task Inline Composer (opens in place when "Add task to plan" is pressed) -->
    {#if addBarOpen}
      <div
        class="flex flex-col gap-space-2 border-t border-border-hairline bg-surface-recess px-space-4 py-space-3 @max-phone/plan:px-space-3"
      >
        <form
          class="flex flex-wrap items-center gap-space-2"
          onsubmit={(e) => {
            e.preventDefault();
            submitNewTask();
          }}
        >
          <div class="min-w-52 flex-1">
            <Input
              aria-label="New task title to file and add to plan"
              placeholder="File a new task and append to this plan…"
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
            label="Close add bar"
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
            <span class="type-meta text-ink-muted">
              Or add from {liveDataset.session.project} board:
            </span>
            {#each liveDataset.boardBacklog as item (item.id)}
              <Button
                label={`Add ${item.id}: ${item.title.slice(0, 38)}${item.title.length > 38 ? "…" : ""}`}
                onclick={() => {
                  chosenBacklogId = item.id;
                  addExistingBacklogTask(chosenBacklogId);
                }}
                size="xs"
                variant="outline"
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Plan Progress Summary & Proportional Horizon Bar (shows ALL tasks at once, even 30+) -->
    <div
      class="flex flex-col gap-space-2 border-t border-border-hairline px-space-4 py-space-2 @max-phone/plan:px-space-3"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1"
      >
        <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
          <span class="type-label text-ink-strong">
            <span class="mono-figure">{model.doneCount}</span> of
            <span class="mono-figure">{model.tasks.length}</span> tasks done
          </span>
          <span class="type-meta text-ink-muted">
            <span class="mono-figure">{model.todoDoneCount}</span>/<span
              class="mono-figure">{model.todoTotalCount}</span
            > agreed to-dos ticked
          </span>
          {#if liveDataset.session.liveActivity}
            <span class="type-meta text-ink-muted @max-desk/plan:hidden">
              · {liveDataset.session.liveActivity}
            </span>
          {/if}
        </div>

        {#if latestUnsettledChange}
          <Badge variant="secondary">
            <span>
              {changeDeliveryLabel(
                latestUnsettledChange,
                liveDataset.session.liveState
              )}
            </span>
          </Badge>
        {/if}
      </div>

      <!-- Segmented Horizon Strip: 1 tactile segment per task across the whole plan -->
      <nav
        aria-label="Plan horizon — click any segment to inspect its task"
        class="flex h-c-meter-bar-h w-full items-center gap-px overflow-hidden rounded-pill bg-surface-recess p-px"
      >
        {#each model.tasks as seg (seg.handle)}
          <button
            aria-label={`${seg.taskId}: ${seg.title} (${PHASE_WORD[seg.phase]})`}
            class={[
              "press-tint h-full min-w-1 flex-1 rounded-hair transition-control focus-inset",
              HORIZON_SEGMENT_BG[seg.phase],
              selectedTaskId === seg.taskId ? "ring-1 ring-brand-solid" : "",
            ]}
            onclick={() => {
              selectedTaskId = seg.taskId;
            }}
            title={`${seg.taskId} · ${seg.title} (${PHASE_WORD[seg.phase]})`}
            type="button"
          ></button>
        {/each}
      </nav>

      <!-- Phase Filter Lenses + Delegate Session Filters + Search Toggle -->
      <div
        class="flex flex-wrap items-center justify-between gap-space-2 pt-space-1"
      >
        <div class="flex flex-wrap items-center gap-space-1">
          {#each PHASE_TABS as tab (tab.id)}
            {#if tab.id === "all" || tab.count > 0}
              {@const active = phaseFilter === tab.id}
              <button
                aria-pressed={active}
                class={[
                  "pressable touch-hit inline-flex h-7 items-center gap-space-1 rounded-sm border px-space-2 type-label transition-control",
                  active
                    ? "border-brand-solid bg-option-picked text-ink-strong"
                    : "border-border-control bg-surface-raised text-ink-muted can-hover:hover:bg-surface-hover",
                ]}
                onclick={() => {
                  phaseFilter = tab.id;
                }}
                type="button"
              >
                <span>{tab.label}</span>
                {#if tab.count > 0}
                  <span class="mono-figure text-ink-subtle">{tab.count}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>

        <!-- Session / Delegate Scope Pills -->
        <div class="flex flex-wrap items-center gap-space-1">
          <button
            aria-pressed={delegateFilter === "all"}
            class={[
              "pressable touch-hit inline-flex h-7 items-center rounded-sm border px-space-2 type-meta transition-control",
              delegateFilter === "all"
                ? "border-brand-solid bg-option-picked font-medium text-ink-strong"
                : "border-border-hairline bg-surface-recess text-ink-muted can-hover:hover:bg-surface-hover",
            ]}
            onclick={() => {
              delegateFilter = "all";
            }}
            type="button"
          >
            All sessions
          </button>

          {#each liveDataset.delegates as del (del.id)}
            {@const chosen = delegateFilter === del.id}
            <button
              aria-pressed={chosen}
              class={[
                "mark-line pressable touch-hit inline-flex h-7 max-w-44 items-center gap-space-1 rounded-sm border px-space-2 type-meta transition-control @max-phone/plan:max-w-36",
                chosen
                  ? "border-brand-solid bg-option-picked font-medium text-ink-strong"
                  : "border-border-hairline bg-surface-recess text-ink-muted can-hover:hover:bg-surface-hover",
              ]}
              onclick={() => {
                delegateFilter = chosen ? "all" : del.id;
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                class={[
                  "size-1.5 shrink-0 rounded-pill",
                  IDENTITY_DOT_BG[del.identity],
                ]}
                data-box
              ></span>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >
                {del.title}
              </span>
            </button>
          {/each}

          <Button
            icon={IconSearch}
            label={searchOpen ? "Hide filter" : "Filter steps"}
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
      </div>

      {#if searchOpen}
        <div class="flex items-center gap-space-2 pt-space-1">
          <div class="min-w-0 flex-1">
            <Input
              aria-label="Filter tasks and to-dos in plan"
              look="cell"
              placeholder="Filter by task id, wording, to-do, or delegate…"
              bind:value={query}
            />
          </div>
          {#if query}
            <Button
              label="Clear filter"
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
  </header>

  <!-- Main Workspace Split: Nested Plan Spine + Desk Inspector / Side Overview -->
  <div class="relative flex min-h-0 flex-1">
    <!-- Left / Primary Column: Nested 3-Level Plan Spine -->
    <main
      aria-label="Session plan steps"
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-space-4 py-space-4 @max-phone/plan:px-space-3 @max-phone/plan:py-space-3"
    >
      <div class="mx-auto flex w-full max-w-210 flex-col">
        <!-- Folded Done Summary Strip (keeps Moving now, Held, and Ahead immediately visible on first paint) -->
        {#if isUnfilteredAll && doneGroupTasks.length > 0}
          <div
            class="mb-space-3 flex flex-wrap items-center justify-between gap-space-2 rounded-lg border border-border-hairline bg-surface-recess px-space-3 py-space-2"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-space-2">
              <Badge variant="done">
                <span>{doneGroupTasks.length} finished</span>
              </Badge>
              <span class="type-meta text-ink-muted">
                {doneGroupTasks[0]?.taskId}{doneGroupTasks.length > 1
                  ? ` – ${doneGroupTasks.at(-1)?.taskId}`
                  : ""}
                · completed earlier in this plan
              </span>
            </div>
            <Button
              label={doneFolded
                ? `Show ${doneGroupTasks.length} finished`
                : "Fold finished"}
              onclick={() => {
                doneFolded = !doneFolded;
              }}
              size="xs"
              tone="quiet"
              variant="ghost"
            />
          </div>
        {/if}

        {#if renderedSpineTasks.length === 0}
          <div
            class="flex flex-col items-start gap-space-2 rounded-lg border border-border-hairline bg-surface-raised p-space-5"
          >
            <p class="type-label text-ink-strong">
              No steps match the active filter.
            </p>
            <p class="type-meta text-ink-muted">
              Reset the phase or delegate filter to view all {model.tasks
                .length} steps in this session's plan.
            </p>
            <Button
              label="Show all steps"
              onclick={() => {
                phaseFilter = "all";
                delegateFilter = "all";
                query = "";
              }}
              size="xs"
              variant="secondary"
            />
          </div>
        {:else}
          {#each renderedSpineTasks as task, idx (task.handle)}
            <PlanTaskCard
              isFirst={idx === 0}
              isLast={idx === renderedSpineTasks.length - 1 &&
                hiddenAheadCount === 0}
              onAddTodo={handleAddTodo}
              onClearHold={handleClearHold}
              onEdit={handleEdit}
              onResolveOffer={handleResolveOffer}
              onSelectTask={handleSelectTask}
              onToggleWell={toggleWell}
              selected={selectedTaskId === task.taskId}
              {task}
              wellExpanded={isWellExpanded(task)}
            />
          {/each}

          <!-- Bounded Ahead Summary for 30+ Task Plans so every phase bucket is visible without scrolling -->
          {#if hiddenAheadCount > 0}
            <div
              class="mt-space-1 flex flex-wrap items-center justify-between gap-space-2 rounded-lg border border-border-hairline bg-surface-recess px-space-3 py-space-2"
            >
              <span class="type-meta text-ink-muted">
                <span class="mono-figure">{hiddenAheadCount}</span> more tasks
                queued ahead ({model.aheadCount} ahead in total)
              </span>
              <Button
                label={`Show all ${model.aheadCount} ahead`}
                onclick={() => {
                  aheadFolded = false;
                }}
                size="xs"
                variant="outline"
              />
            </div>
          {:else if isUnfilteredAll && model.tasks.length > 14 && !aheadFolded}
            <div class="mt-space-2 flex justify-end">
              <Button
                label="Fold later ahead tasks"
                onclick={() => {
                  aheadFolded = true;
                }}
                size="xs"
                tone="quiet"
                variant="ghost"
              />
            </div>
          {/if}
        {/if}
      </div>
    </main>

    <!-- Right Column on Desk (≥ 900px): Opened Task Inspector, else Delegates & Changes Overview -->
    <div
      class="hidden min-h-0 w-c-lead-card-w shrink-0 flex-col border-s border-border @min-desk/plan:flex"
    >
      {#if selectedTask}
        {@render taskInspector(selectedTask)}
      {:else}
        <PlanSideSummary
          activeDelegateFilter={delegateFilter}
          changes={model.changes}
          delegates={liveDataset.delegates}
          onFilterDelegate={(id) => {
            delegateFilter = id;
          }}
          onSelectTask={(id) => {
            selectedTaskId = id;
          }}
          sessionState={liveDataset.session.liveState}
        />
      {/if}
    </div>

    <!-- Phone / Narrow Bottom Sheet (< 900px): Opens over the live plan when a task is selected -->
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
          aria-label={`Task ${selectedTask.taskId}`}
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
