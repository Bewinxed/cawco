<script lang="ts">
  import type { PlanEdit } from "@cawco/core/plan";
  import PlanTodoRow from "./PlanTodoRow.svelte";
  import type { DerivedPlanTodo } from "./types.js";

  let {
    todos,
    offeredTodos,
    offerHeading,
    onEdit,
    onSelectTask,
    onResolveOffer,
  }: {
    offerHeading: string;
    offeredTodos: DerivedPlanTodo[];
    onEdit: (edit: PlanEdit) => void;
    onResolveOffer: (todoId: string, accept: boolean) => void;
    onSelectTask: (taskId: string) => void;
    todos: DerivedPlanTodo[];
  } = $props();
</script>

{#each todos as todo (todo.handle)}
  <PlanTodoRow {onEdit} onInspectTask={onSelectTask} {todo} />
{/each}

{#if offeredTodos.length > 0}
  <div
    class="mt-space-1 flex flex-col gap-space-1 rounded-xs border border-dashed border-border-control p-space-2"
  >
    <span class="px-space-1 type-meta text-ink-muted">{offerHeading}</span>
    {#each offeredTodos as offered (offered.handle)}
      <PlanTodoRow {onEdit} {onResolveOffer} todo={offered} />
    {/each}
  </div>
{/if}
