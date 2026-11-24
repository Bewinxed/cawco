<script lang="ts">
  import { harnessName } from "@cawco/core/harness/kinds";
  import type { PlanEdit } from "@cawco/core/plan";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconAdd,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconDecisions,
    IconFork,
    IconLandPullRequest,
    IconLock,
    IconPen,
    IconSuccess,
    IconTrash,
  } from "#lib/icons.js";
  import PlanDelegateHeader from "./PlanDelegateHeader.svelte";
  import PlanNoteList from "./PlanNoteList.svelte";
  import PlanTodoSection from "./PlanTodoSection.svelte";
  import { PHASE_WORD } from "./style-maps.js";
  import type { DerivedPlanTask, PlanPhase } from "./types.js";

  let {
    task,
    isFirst,
    isLast,
    selected,
    wellExpanded,
    onSelectTask,
    onToggleWell,
    onEdit,
    onAddTodo,
    onResolveOffer,
    onClearHold,
  }: {
    isFirst: boolean;
    isLast: boolean;
    onAddTodo: (taskId: string, text: string) => void;
    onClearHold: (taskId: string) => void;
    onEdit: (edit: PlanEdit) => void;
    onResolveOffer: (taskId: string, todoId: string, accept: boolean) => void;
    onSelectTask: (taskId: string) => void;
    onToggleWell: (taskId: string) => void;
    selected: boolean;
    task: DerivedPlanTask;
    wellExpanded: boolean;
  } = $props();

  let rewordingTask = $state(false);
  let taskTitleDraft = $state("");
  let addingTodo = $state(false);
  let newTodoText = $state("");

  function cardSurfaceClass(isPicked: boolean, phase: PlanPhase): string {
    if (isPicked) {
      return "border-brand-solid bg-option-picked";
    }
    if (phase === "held") {
      return "border-warning-9 bg-surface-raised";
    }
    return "border-border bg-surface-raised";
  }

  function beginTaskReword() {
    taskTitleDraft = task.title;
    rewordingTask = true;
  }

  function saveTaskReword() {
    const clean = taskTitleDraft.trim();
    if (clean && clean !== task.title) {
      onEdit({ kind: "reword", step: task.handle, content: clean });
    }
    rewordingTask = false;
  }

  function submitNewTodo() {
    const clean = newTodoText.trim();
    if (clean) {
      onAddTodo(task.taskId, clean);
      newTodoText = "";
      addingTodo = false;
    }
  }

  const hasTodos = $derived(
    task.todos.length > 0 || task.offeredTodos.length > 0
  );
  const waitKind = $derived(task.wait?.target?.kind);
</script>

{#snippet waitGlyph(iconClass: string)}
  {#if waitKind === "pr"}
    <IconLandPullRequest aria-hidden="true" class={iconClass} />
  {:else if waitKind === "card" || waitKind === "pin"}
    <IconDecisions aria-hidden="true" class={iconClass} />
  {:else if waitKind === "time"}
    <IconClock aria-hidden="true" class={iconClass} />
  {:else}
    <IconLock aria-hidden="true" class={iconClass} />
  {/if}
{/snippet}

<div class="flex gap-x-space-3" data-phase={task.phase} data-slot="plan-task">
  <!-- Level-1-to-Level-2 Spine Column: connects every task in plan order with one clear status node -->
  <div class="relative flex w-c-row-lead shrink-0 flex-col items-center">
    {#if !isFirst}
      <span aria-hidden="true" class="h-space-3 w-px shrink-0 bg-nest-ink"
      ></span>
    {:else}
      <span aria-hidden="true" class="h-space-3 w-px shrink-0"></span>
    {/if}

    {#if task.phase === "done"}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill bg-status-done-bg text-status-done-glyph"
      >
        <IconSuccess aria-hidden="true" class="size-icon-sm" />
      </span>
    {:else if task.phase === "moving"}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill bg-status-live-bg text-status-live-glyph"
      >
        <span
          aria-hidden="true"
          class="size-2 rounded-pill bg-status-live-glyph loops breathe"
        ></span>
      </span>
    {:else if task.phase === "held"}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill bg-status-attn-bg text-status-attn-glyph"
      >
        {@render waitGlyph("size-icon-sm")}
      </span>
    {:else if task.phase === "gone"}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill border border-dashed border-border-control bg-surface-page text-ink-subtle"
      >
        <span class="mono-figure type-meta">–</span>
      </span>
    {:else}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill border border-border-control bg-surface-recess text-ink-muted"
      >
        <span class="mono-figure type-meta">{task.order}</span>
      </span>
    {/if}

    {#if !isLast}
      <span aria-hidden="true" class="min-h-space-3 w-px flex-1 bg-nest-ink"
      ></span>
    {/if}
  </div>

  <!-- Level 2: Raised Task Surface -->
  <div class="min-w-0 flex-1 pb-space-3">
    {#if task.gone}
      <div
        class="flex flex-col gap-space-2 rounded-lg border border-dashed border-border-control bg-surface-recess p-space-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-space-2">
          <div class="flex min-w-0 flex-wrap items-center gap-space-2">
            <span class="type-code text-ink-subtle">{task.taskId}</span>
            <span class="type-body text-ink-muted">{task.title}</span>
          </div>
          <Button
            icon={IconTrash}
            label="Remove from plan"
            onclick={() => onEdit({ kind: "remove", step: task.handle })}
            size="xs"
            tone="destructive"
            variant="ghost"
          />
        </div>
        <PlanNoteList comments={task.comments} surface="raised" />
      </div>
    {:else}
      <div
        class={[
          "flex min-w-0 flex-col rounded-lg border shadow-xs transition-control",
          cardSurfaceClass(selected, task.phase),
        ]}
      >
        <!-- Task Header & Primary Metadata -->
        <div class="flex flex-col gap-space-2 p-space-3">
          <div class="flex flex-wrap items-center gap-space-2">
            <span class="type-code text-ink-muted">{task.taskId}</span>

            {#if task.phase === "moving"}
              <Badge variant="live">
                <span>{task.record?.stage ?? PHASE_WORD.moving}</span>
              </Badge>
            {:else if task.phase === "held"}
              <Badge variant="attn">
                <span>Held · {task.record?.stage ?? "Waiting"}</span>
              </Badge>
            {:else if task.phase === "done"}
              <Badge variant="done">
                <span>{task.record?.stage ?? PHASE_WORD.done}</span>
              </Badge>
            {:else}
              <Badge variant="secondary">
                <span>{task.record?.stage ?? PHASE_WORD.ahead}</span>
              </Badge>
            {/if}

            {#if task.record && task.record.unblocks.length > 0 && task.phase !== "done"}
              <span
                class="mark-line inline-flex items-center gap-space-1 text-ink-muted type-meta"
              >
                <IconFork
                  aria-hidden="true"
                  class="size-icon-sm text-ink-subtle"
                />
                <span>Unblocks {task.record.unblocks.length}</span>
              </span>
            {/if}

            <div class="ms-auto flex items-center gap-space-2">
              {#if task.agreedTotal > 0}
                <span class="mono-figure type-meta text-ink-muted">
                  {task.agreedDone}/{task.agreedTotal} to-dos
                </span>
              {/if}

              {#if task.offeredTodos.length > 0}
                <Badge variant="brand">
                  <span>{task.offeredTodos.length} offered</span>
                </Badge>
              {/if}

              <Button
                icon={IconPen}
                label="Reword task"
                onclick={beginTaskReword}
                size="xs"
                tone="quiet"
                variant="ghost"
              />

              <Button
                label={selected ? "Close task" : "Open task"}
                onclick={() => onSelectTask(task.taskId)}
                size="xs"
                variant={selected ? "secondary" : "outline"}
              />
            </div>
          </div>

          <!-- Task Title or Inline Reword Field -->
          {#if rewordingTask}
            <form
              class="flex flex-wrap items-center gap-space-2"
              onsubmit={(e) => {
                e.preventDefault();
                saveTaskReword();
              }}
            >
              <div class="min-w-52 flex-1">
                <Input
                  aria-label="Reword task title"
                  text="label"
                  bind:value={taskTitleDraft}
                />
              </div>
              <Button
                label="Save wording"
                size="xs"
                type="submit"
                variant="secondary"
              />
              <Button
                label="Cancel edit"
                onclick={() => {
                  rewordingTask = false;
                }}
                size="xs"
                tone="muted"
                variant="ghost"
              />
            </form>
          {:else}
            <button
              class={[
                "press-tint w-full rounded-xs text-start type-row transition-control focus-inset",
                task.phase === "done"
                  ? "text-ink-muted"
                  : "text-ink-strong can-hover:hover:text-brand-ink-strong",
              ]}
              onclick={() => onSelectTask(task.taskId)}
              type="button"
            >
              {task.title}
            </button>
          {/if}

          <!-- Delegate Handoff Strip: shows WHICH session is working this task right now -->
          {#if task.delegate}
            <div
              class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1 rounded-sm bg-surface-recess px-space-2 py-space-1"
            >
              <PlanDelegateHeader
                harness={task.delegate.harness}
                identity={task.delegate.identity}
                title={task.delegate.title}
              />

              <span class="type-meta text-ink-muted">
                {harnessName(task.delegate.harness)} · {task.delegate.machine}
              </span>

              {#if task.delegate.liveLine && task.phase === "moving"}
                <span
                  class="min-w-0 basis-full break-word ps-space-5 type-meta text-ink-muted"
                >
                  Now: {task.delegate.liveLine}
                </span>
              {/if}
            </div>
          {/if}

          <!-- Hold / Wait Strip: calm inline context when held, never a duplicate inbox -->
          {#if task.wait && task.phase !== "done"}
            <div
              class="flex flex-wrap items-center justify-between gap-space-2 rounded-sm border border-border-well bg-needs-ground px-space-3 py-space-2"
            >
              <div class="flex min-w-0 flex-1 flex-col gap-space-row">
                <div
                  class="mark-line flex items-center gap-space-2 text-status-attn-ink type-label"
                >
                  {@render waitGlyph(
                    "size-icon-md shrink-0 text-status-attn-glyph"
                  )}
                  <span class="min-w-0 break-word">{task.wait.label}</span>
                </div>
                <p class="ps-space-6 type-meta text-ink-muted">
                  {task.wait.detail}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-space-2">
                <Button
                  label={task.wait.actionLabel}
                  onclick={() => {
                    if (task.wait?.target?.kind === "task") {
                      onSelectTask(task.wait.target.id);
                    } else {
                      onSelectTask(task.taskId);
                    }
                  }}
                  size="xs"
                  variant="outline"
                />
                <Button
                  label="Mark hold settled"
                  onclick={() => onClearHold(task.taskId)}
                  size="xs"
                  tone="muted"
                  variant="ghost"
                />
              </div>
            </div>
          {/if}

          <!-- Operator Notes attached directly to the task step -->
          <PlanNoteList
            accentIcon
            comments={task.comments}
            prefix="Your note: "
            surface="recess"
          />
        </div>

        <!-- Level 3: Recessed To-do Well nested inside the Task Card -->
        {#if hasTodos || addingTodo}
          <div class="px-space-3 pb-space-3">
            <div
              class="flex flex-col rounded-well border border-border-well bg-surface-well"
            >
              <!-- Well Disclosure Bar -->
              <div
                class="flex flex-wrap items-center justify-between gap-space-2 px-space-2 py-space-1"
              >
                <button
                  aria-expanded={wellExpanded}
                  class="mark-line press-tint touch-hit inline-flex items-center gap-space-1 rounded-xs px-space-1 py-0.5 type-label text-ink-muted can-hover:hover:text-ink-strong"
                  onclick={() => onToggleWell(task.taskId)}
                  type="button"
                >
                  {#if wellExpanded}
                    <IconChevronDown aria-hidden="true" class="size-icon-sm" />
                  {:else}
                    <IconChevronRight aria-hidden="true" class="size-icon-sm" />
                  {/if}
                  <span>
                    {wellExpanded
                      ? `To-dos (${task.agreedDone} of ${task.agreedTotal} done)`
                      : `Show ${task.agreedTotal} to-dos (${task.agreedDone} done)`}
                  </span>
                </button>

                <Button
                  icon={IconAdd}
                  label="Add to-do"
                  onclick={() => {
                    if (!wellExpanded) {
                      onToggleWell(task.taskId);
                    }
                    addingTodo = true;
                  }}
                  size="xs"
                  tone="quiet"
                  variant="ghost"
                />
              </div>

              {#if wellExpanded}
                <div
                  class="flex flex-col gap-space-row border-t border-border-well p-space-1"
                >
                  <PlanTodoSection
                    offerHeading="Offered by session — agree to include in this task's to-dos:"
                    offeredTodos={task.offeredTodos}
                    {onEdit}
                    onResolveOffer={(todoId, accept) =>
                      onResolveOffer(task.taskId, todoId, accept)}
                    {onSelectTask}
                    todos={task.todos}
                  />

                  {#if addingTodo}
                    <form
                      class="flex flex-wrap items-center gap-space-2 px-space-2 py-space-1"
                      onsubmit={(e) => {
                        e.preventDefault();
                        submitNewTodo();
                      }}
                    >
                      <div class="min-w-44 flex-1">
                        <Input
                          aria-label="New to-do wording"
                          look="cell"
                          placeholder="Describe the new to-do…"
                          bind:value={newTodoText}
                        />
                      </div>
                      <Button
                        label="Add to-do"
                        size="xs"
                        type="submit"
                        variant="secondary"
                      />
                      <Button
                        label="Cancel to-do"
                        onclick={() => {
                          addingTodo = false;
                        }}
                        size="xs"
                        tone="muted"
                        variant="ghost"
                      />
                    </form>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
