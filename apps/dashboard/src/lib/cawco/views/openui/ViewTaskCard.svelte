<script lang="ts">
  /** One task: the board's own card, and the values `fields` names under it. */
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import { fieldText, type ViewTaskRow, viewContext } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ task: unknown; fields?: unknown }> =
    $props();
  const view = viewContext();
  const task = $derived(
    typeof props.task === "object" && props.task !== null && "id" in props.task
      ? (props.task as ViewTaskRow)
      : null
  );
  const extra = $derived(
    task && Array.isArray(props.fields)
      ? (props.fields as string[])
          .map((path) => fieldText(task, path))
          .filter(Boolean)
      : []
  );
</script>

{#if task}
  <div class="view-card">
    <TaskCard
      href={view.hrefOf(task.id)}
      kindOf={() => undefined}
      onopen={view.onopen}
      {task}
    />
    {#if extra.length > 0}
      <p class="fields">{extra.join(" · ")}</p>
    {/if}
  </div>
{/if}

<style>
  .view-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .fields {
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
