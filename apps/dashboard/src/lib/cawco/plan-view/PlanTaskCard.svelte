<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import { todoIndentClass } from "./style-maps.js";
  import type { DerivedPlanTask } from "./types.js";

  let {
    task,
    isFirst,
    isLast,
    selected,
    onSelectTask,
  }: {
    isFirst: boolean;
    isLast: boolean;
    onSelectTask: (taskId: string) => void;
    selected: boolean;
    task: DerivedPlanTask;
  } = $props();

  const isProminent = $derived(task.phase === "moving" || task.needsYou);
  const openTodos = $derived(task.todos.filter((t) => !t.done));
  const previewTodos = $derived(openTodos.slice(0, 3));
  const extraTodoCount = $derived(
    Math.max(0, openTodos.length - previewTodos.length)
  );
  const showOverviewWell = $derived(isProminent && previewTodos.length > 0);

  function prominentSurfaceClass(isPicked: boolean, needsYou: boolean): string {
    if (isPicked) {
      return "border-brand-solid bg-option-picked shadow-xs";
    }
    if (needsYou) {
      return "border-warning-9 bg-surface-raised shadow-xs can-hover:hover:bg-surface-hover";
    }
    return "border-border bg-surface-raised shadow-xs can-hover:hover:bg-surface-hover";
  }

  function peripherySurfaceClass(isPicked: boolean): string {
    if (isPicked) {
      return "border-brand-solid bg-option-picked";
    }
    return "border-transparent can-hover:hover:border-border-hairline can-hover:hover:bg-surface-raised";
  }

  function peripheryTitleClass(phase: DerivedPlanTask["phase"]): string {
    if (phase === "done" || phase === "gone") {
      return "text-ink-muted";
    }
    return "font-medium text-ink-row";
  }
</script>

<div
  class="flex gap-x-space-3"
  data-needs-you={task.needsYou ? "true" : undefined}
  data-phase={task.phase}
  data-slot="plan-task"
>
  <!-- Level 1 -> Level 2 Spine Rail: only the task needing the person carries a loud mark -->
  <div class="relative flex w-c-row-lead shrink-0 flex-col items-center">
    {#if isFirst}
      <span aria-hidden="true" class="h-space-2 w-px shrink-0"></span>
    {:else}
      <span aria-hidden="true" class="h-space-2 w-px shrink-0 bg-nest-ink"
      ></span>
    {/if}

    {#if task.needsYou}
      <span
        aria-hidden="true"
        class="grid size-icon-lg shrink-0 place-items-center rounded-pill bg-status-attn-bg text-status-attn-glyph"
      >
        <IconDecisions aria-hidden="true" class="size-icon-sm" />
      </span>
    {:else if task.phase === "moving"}
      <span
        aria-hidden="true"
        class="my-1 size-2.5 shrink-0 rounded-pill border-2 border-ink-strong bg-surface-raised"
      ></span>
    {:else if task.phase === "done"}
      <span
        aria-hidden="true"
        class="my-1 size-2 shrink-0 rounded-pill bg-nest-ink"
      ></span>
    {:else}
      <span
        aria-hidden="true"
        class="my-1 size-2 shrink-0 rounded-pill border border-border-control bg-surface-page"
      ></span>
    {/if}

    {#if !isLast}
      <span aria-hidden="true" class="min-h-space-2 w-px flex-1 bg-nest-ink"
      ></span>
    {/if}
  </div>

  <!-- Level 2: Task Item (name + one plain sentence + single loud mark only when needed) -->
  <div class="min-w-0 flex-1 pb-space-2">
    {#if isProminent}
      <button
        aria-expanded={selected}
        class={[
          "press-tint flex w-full min-w-0 flex-col gap-space-2 rounded-lg border p-space-3 text-start transition-control focus-inset",
          prominentSurfaceClass(selected, task.needsYou),
        ]}
        onclick={() => onSelectTask(task.taskId)}
        type="button"
      >
        <span class="flex w-full min-w-0 flex-col gap-space-1">
          <span
            class="flex w-full min-w-0 items-start justify-between gap-space-2"
          >
            <span class="min-w-0 flex-1 break-word type-row text-ink-strong">
              {task.title}
            </span>
            {#if task.needsYou}
              <Badge class="shrink-0" variant="attn">
                <span>Needs you</span>
              </Badge>
            {/if}
          </span>

          <span
            class={[
              "min-w-0 break-word type-meta",
              task.needsYou ? "text-status-attn-ink" : "text-ink-muted",
            ]}
          >
            {task.overviewSentence}
          </span>
        </span>

        <!-- Level 3: Recessed To-do Well nested inside active or needs-you tasks -->
        {#if showOverviewWell}
          <span
            class="flex w-full min-w-0 flex-col gap-space-row rounded-well border border-border-well bg-surface-well px-space-2 py-space-1"
          >
            {#each previewTodos as todo (todo.handle)}
              <span
                class={[
                  "mark-line relative flex min-w-0 items-center gap-space-2 py-0.5",
                  todoIndentClass(todo.depth),
                ]}
              >
                {#if todo.depth > 0}
                  <span
                    aria-hidden="true"
                    class="pointer-events-none absolute start-space-2 top-0 h-3.5 w-space-2 rounded-es-xs border-b border-s border-nest-ink"
                    data-box
                  ></span>
                {/if}

                {#if todo.inProgress}
                  <span
                    aria-hidden="true"
                    class="size-1.5 shrink-0 rounded-pill bg-ink-strong"
                    data-box
                  ></span>
                {:else}
                  <span
                    aria-hidden="true"
                    class="size-2.5 shrink-0 rounded-hair border border-border-control"
                    data-box
                  ></span>
                {/if}

                <span
                  class={[
                    "min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta",
                    todo.inProgress
                      ? "font-medium text-ink-strong"
                      : "text-ink-row",
                  ]}
                >
                  {todo.text}
                </span>
              </span>
            {/each}

            {#if extraTodoCount > 0}
              <span class="ps-space-4 pt-0.5 type-meta text-ink-subtle">
                +{extraTodoCount} more open {extraTodoCount === 1
                  ? "to-do"
                  : "to-dos"}
              </span>
            {/if}
          </span>
        {/if}
      </button>
    {:else}
      <button
        aria-expanded={selected}
        class={[
          "press-tint touch-hit flex w-full min-w-0 flex-col gap-space-row rounded-md border px-space-3 py-space-1 text-start transition-control focus-inset",
          peripherySurfaceClass(selected),
        ]}
        onclick={() => onSelectTask(task.taskId)}
        type="button"
      >
        <span
          class={[
            "min-w-0 break-word type-body",
            peripheryTitleClass(task.phase),
          ]}
        >
          {task.title}
        </span>
        <span class="min-w-0 break-word type-meta text-ink-subtle">
          {task.overviewSentence}
        </span>
      </button>
    {/if}
  </div>
</div>
