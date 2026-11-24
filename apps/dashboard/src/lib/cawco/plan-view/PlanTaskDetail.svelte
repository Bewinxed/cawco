<script lang="ts">
  import { harnessName } from "@cawco/core/harness/kinds";
  import type { PlanEdit, PlanStepStatus } from "@cawco/core/plan";
  import type { StageKind } from "@cawco/core/views";
  import { commonWords } from "@cawco/core/words/common";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconAdd,
    IconArrowDown,
    IconArrowUp,
    IconClose,
    IconComment,
    IconLock,
    IconPen,
    IconSuccess,
    IconTrash,
  } from "#lib/icons.js";
  import PlanDelegateHeader from "./PlanDelegateHeader.svelte";
  import PlanNoteList from "./PlanNoteList.svelte";
  import PlanTodoSection from "./PlanTodoSection.svelte";
  import { waitKindLabel } from "./style-maps.js";
  import type { DerivedPlanTask } from "./types.js";

  let {
    task,
    sessionTitle,
    onClose,
    onEdit,
    onAddTodo,
    onResolveOffer,
    onMoveStage,
    onClearHold,
    onSelectTask,
  }: {
    onAddTodo: (taskId: string, text: string) => void;
    onClearHold: (taskId: string) => void;
    onClose: () => void;
    onEdit: (edit: PlanEdit) => void;
    onMoveStage: (taskId: string, stage: string, kind: StageKind) => void;
    onResolveOffer: (taskId: string, todoId: string, accept: boolean) => void;
    onSelectTask: (taskId: string) => void;
    sessionTitle: string;
    task: DerivedPlanTask;
  } = $props();

  let editingTitle = $state(false);
  let titleDraft = $state("");
  let newTodoDraft = $state("");
  let noteDraft = $state("");

  const STAGE_OPTIONS: { kind: StageKind; name: string }[] = [
    { name: "Ready", kind: "todo" },
    { name: "Working", kind: "active" },
    { name: "Waiting", kind: "waiting" },
    { name: "Done", kind: "done" },
  ];

  function delegateStepTone(status: PlanStepStatus): string {
    if (status === "completed") {
      return "text-ink-subtle line-through";
    }
    if (status === "in_progress") {
      return "font-medium text-ink-strong";
    }
    return "text-ink-muted";
  }

  function startReword() {
    titleDraft = task.title;
    editingTitle = true;
  }

  function saveReword() {
    const clean = titleDraft.trim();
    if (clean && clean !== task.title) {
      onEdit({ kind: "reword", step: task.handle, content: clean });
    }
    editingTitle = false;
  }

  function submitTodo() {
    const clean = newTodoDraft.trim();
    if (clean) {
      onAddTodo(task.taskId, clean);
      newTodoDraft = "";
    }
  }

  function submitNote() {
    const clean = noteDraft.trim();
    if (clean) {
      onEdit({ kind: "comment", step: task.handle, text: clean });
      noteDraft = "";
    }
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-surface-raised">
  <!-- Inspector Header -->
  <header
    class="flex shrink-0 items-center justify-between gap-space-2 border-b border-border-hairline px-space-4 py-space-3"
  >
    <div class="flex min-w-0 items-center gap-space-2">
      <span class="type-code text-ink-muted">{task.taskId}</span>
      <span class="type-meta text-ink-subtle">·</span>
      <span class="type-label text-ink-muted">Step {task.order} in plan</span>
    </div>

    <Button
      aria-label={commonWords.close}
      icon={IconClose}
      onclick={onClose}
      size="icon-sm"
      tone="quiet"
      variant="ghost"
    />
  </header>

  <!-- Scrollable Inspector Body -->
  <div
    class="flex min-h-0 flex-1 flex-col gap-space-4 overflow-y-auto p-space-4"
  >
    <!-- Title + Plan Ordering Controls -->
    <div class="flex flex-col gap-space-2">
      {#if editingTitle}
        <form
          class="flex flex-col gap-space-2"
          onsubmit={(e) => {
            e.preventDefault();
            saveReword();
          }}
        >
          <Input aria-label="Task title" text="label" bind:value={titleDraft} />
          <div class="flex items-center gap-space-2">
            <Button
              label="Save wording"
              size="xs"
              type="submit"
              variant="secondary"
            />
            <Button
              label="Cancel edit"
              onclick={() => {
                editingTitle = false;
              }}
              size="xs"
              tone="muted"
              variant="ghost"
            />
          </div>
        </form>
      {:else}
        <h2 class="type-title text-ink-strong">{task.title}</h2>
      {/if}

      <div class="flex flex-wrap items-center gap-space-1">
        {#if !(editingTitle || task.gone)}
          <Button
            icon={IconPen}
            label="Reword task"
            onclick={startReword}
            size="xs"
            tone="quiet"
            variant="outline"
          />
        {/if}
        <Button
          disabled={!task.canMoveUp}
          icon={IconArrowUp}
          label="Move task up"
          onclick={() => onEdit({ kind: "move", step: task.handle, by: -1 })}
          size="xs"
          tone="quiet"
          variant="outline"
        />
        <Button
          disabled={!task.canMoveDown}
          icon={IconArrowDown}
          label="Move task down"
          onclick={() => onEdit({ kind: "move", step: task.handle, by: 1 })}
          size="xs"
          tone="quiet"
          variant="outline"
        />
        <Button
          icon={IconTrash}
          label="Remove from plan"
          onclick={() => {
            onEdit({ kind: "remove", step: task.handle });
            onClose();
          }}
          size="xs"
          tone="destructive"
          variant="ghost"
        />
      </div>
    </div>

    <!-- Task Stage Controls (a task's step follows its stage) -->
    {#if task.record}
      <div class="flex flex-col gap-space-2">
        <span class="type-label text-ink-muted">
          Stage (task completion follows its stage)
        </span>
        <div class="flex flex-wrap items-center gap-space-1">
          {#each STAGE_OPTIONS as opt (opt.name)}
            {@const chosen = task.record.stage === opt.name}
            <button
              aria-pressed={chosen}
              class={[
                "pressable touch-hit inline-flex h-c-btn-h-sm items-center rounded-sm border px-space-3 type-label transition-control",
                chosen
                  ? "border-brand-solid bg-option-picked text-ink-strong"
                  : "border-border-control bg-surface-raised text-ink-muted can-hover:hover:bg-surface-hover",
              ]}
              onclick={() => onMoveStage(task.taskId, opt.name, opt.kind)}
              type="button"
            >
              Set {opt.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Hold / Wait Details -->
    {#if task.wait}
      <div
        class="flex flex-col gap-space-2 rounded-lg border border-warning-9 bg-needs-ground p-space-3"
      >
        <div class="flex items-center justify-between gap-space-2">
          <div
            class="mark-line flex items-center gap-space-2 text-status-attn-ink type-label"
          >
            <IconLock
              aria-hidden="true"
              class="size-icon-md shrink-0 text-status-attn-glyph"
            />
            <span>{waitKindLabel(task.wait.target?.kind)}</span>
          </div>
          <Badge variant="attn">
            <span>Held</span>
          </Badge>
        </div>
        <p class="type-label text-ink-strong">{task.wait.label}</p>
        <p class="type-meta text-ink-muted">{task.wait.detail}</p>
        <div class="flex flex-wrap items-center gap-space-2 pt-space-1">
          {#if task.wait.target?.kind === "task"}
            <Button
              label={task.wait.actionLabel}
              onclick={() => {
                if (task.wait?.target?.kind === "task") {
                  onSelectTask(task.wait.target.id);
                }
              }}
              size="xs"
              variant="secondary"
            />
          {/if}
          <Button
            label="Mark hold settled"
            onclick={() => onClearHold(task.taskId)}
            size="xs"
            variant="outline"
          />
        </div>
      </div>
    {/if}

    <!-- Delegated Session & Its Own Plan -->
    {#if task.delegate}
      <div
        class="flex flex-col gap-space-2 rounded-lg border border-border-well bg-surface-well p-space-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-space-2">
          <PlanDelegateHeader
            harness={task.delegate.harness}
            identity={task.delegate.identity}
            title={task.delegate.title}
          />
          <Badge variant={task.delegate.state === "running" ? "live" : "done"}>
            <span>
              {task.delegate.state === "running"
                ? "Delegate working"
                : "Delegate done"}
            </span>
          </Badge>
        </div>

        <p class="type-meta text-ink-muted">
          {harnessName(task.delegate.harness)} on {task.delegate.machine} · answers
          to {sessionTitle}
        </p>

        {#if task.delegate.liveLine}
          <p class="type-meta text-ink-strong">
            Now: {task.delegate.liveLine}
          </p>
        {/if}

        {#if task.delegate.plan.steps.length > 0}
          <div
            class="flex flex-col gap-space-1 border-t border-border-well pt-space-2"
          >
            <span class="type-meta text-ink-subtle">
              Delegate session's own plan ({task.delegate.plan.steps.filter(
                (s) => s.status === "completed"
              ).length}/{task.delegate.plan.steps.length}):
            </span>
            {#each task.delegate.plan.steps as dStep (dStep.id)}
              <div class="mark-line flex items-start gap-space-2 py-0.5">
                {#if dStep.status === "completed"}
                  <IconSuccess
                    aria-hidden="true"
                    class="mt-0.5 size-icon-sm shrink-0 text-status-done-glyph"
                  />
                {:else if dStep.status === "in_progress"}
                  <span
                    aria-hidden="true"
                    class="mt-1.5 size-1.5 shrink-0 rounded-pill bg-status-live-glyph loops breathe"
                    data-box
                  ></span>
                {:else}
                  <span
                    aria-hidden="true"
                    class="mt-1.5 size-1.5 shrink-0 rounded-pill bg-border-control"
                    data-box
                  ></span>
                {/if}
                <span
                  class={[
                    "min-w-0 break-word type-meta",
                    delegateStepTone(dStep.status),
                  ]}
                >
                  {dStep.content}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Task Description, Edges & Acceptance -->
    {#if task.record}
      <div class="flex flex-col gap-space-2">
        <p class="type-body text-ink-row">{task.record.summary}</p>

        {#if task.record.after.length > 0 || task.record.unblocks.length > 0}
          <div class="flex flex-wrap items-center gap-space-2 pt-space-1">
            {#each task.record.after as upId (upId)}
              <Button
                label={`After ${upId}`}
                onclick={() => onSelectTask(upId)}
                size="xs"
                tone="muted"
                variant="secondary"
              />
            {/each}
            {#each task.record.unblocks as downId (downId)}
              <Button
                label={`Unblocks ${downId}`}
                onclick={() => onSelectTask(downId)}
                size="xs"
                tone="muted"
                variant="secondary"
              />
            {/each}
          </div>
        {/if}

        {#if task.record.acceptance.length > 0}
          <div class="flex flex-col gap-space-1 pt-space-1">
            <span class="type-label text-ink-muted">Acceptance checks</span>
            {#each task.record.acceptance as check, i (`acc-${i}`)}
              <div
                class="flex items-start gap-space-2 type-meta text-ink-muted"
              >
                <span class="mono-figure text-ink-subtle">{i + 1}.</span>
                <span>{check}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Level-3 To-dos Editor inside Inspector -->
    <div class="flex flex-col gap-space-2">
      <div class="flex items-center justify-between gap-space-2">
        <span class="type-label text-ink-strong">
          To-dos ({task.agreedDone} of {task.agreedTotal} done)
        </span>
      </div>

      <div
        class="flex flex-col gap-space-row rounded-well border border-border-well bg-surface-well p-space-2"
      >
        {#if task.todos.length === 0 && task.offeredTodos.length === 0}
          <p class="px-space-2 py-space-1 type-meta text-ink-muted">
            No to-dos on this task yet. Add one below to break the task down.
          </p>
        {:else}
          <PlanTodoSection
            offerHeading="Offered by session:"
            offeredTodos={task.offeredTodos}
            {onEdit}
            onResolveOffer={(todoId, accept) =>
              onResolveOffer(task.taskId, todoId, accept)}
            {onSelectTask}
            todos={task.todos}
          />
        {/if}

        <form
          class="mt-space-1 flex items-center gap-space-2 border-t border-border-well pt-space-2"
          onsubmit={(e) => {
            e.preventDefault();
            submitTodo();
          }}
        >
          <div class="min-w-0 flex-1">
            <Input
              aria-label="Add to-do to task"
              look="cell"
              placeholder="Add a to-do to this task…"
              bind:value={newTodoDraft}
            />
          </div>
          <Button
            icon={IconAdd}
            label="Add to-do"
            size="xs"
            type="submit"
            variant="secondary"
          />
        </form>
      </div>
    </div>

    <!-- Operator Notes for the Session -->
    <div
      class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-3"
    >
      <span class="type-label text-ink-strong">Notes for session</span>
      <p class="type-meta text-ink-muted">
        Notes stay attached to {task.taskId} across plan writes and reach {sessionTitle}
        at its next step.
      </p>

      <PlanNoteList accentIcon comments={task.comments} surface="recess" />

      <form
        class="flex flex-col gap-space-2"
        onsubmit={(e) => {
          e.preventDefault();
          submitNote();
        }}
      >
        <Textarea
          aria-label="Add note on task"
          placeholder="Steer how the session handles this task…"
          bind:value={noteDraft}
        />
        <div class="flex justify-end">
          <Button
            icon={IconComment}
            label="Save note"
            size="sm"
            type="submit"
            variant="secondary"
          />
        </div>
      </form>
    </div>
  </div>
</div>
