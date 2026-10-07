<script lang="ts">
  /** One task: the board's own card, and the values `fields` names under it. */
  import type { A2uiComponentProps } from "svelte-a2ui";
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import { fieldText, taskOf, viewContext } from "./context";

  let { task, fields }: A2uiComponentProps = $props();
  const view = viewContext();
  const shown = $derived(taskOf(view, task));
  const data = $derived(
    view.data.tasks.find((each) => each.id === shown?.id) ?? null
  );
  const extra = $derived(
    data && Array.isArray(fields)
      ? (fields as string[])
          .map((path) => fieldText(data, path))
          .filter(Boolean)
      : []
  );
</script>

{#if shown}
  <div class="view-card">
    <TaskCard
      href={view.hrefOf(shown.id)}
      kindOf={view.kindOf}
      onopen={view.onopen}
      task={shown}
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
