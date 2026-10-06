<script lang="ts">
  /**
   * The project page's way into its tasks: how many there are, and the ones
   * waiting on you by name (Needs you is the one thing here that asks for a
   * person), each opening in the task drawer. Read with the page, so it is
   * its size from the first frame.
   */
  import type { HubRead } from "#lib/cawco/hub-read.js";
  import type { TaskList } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Card } from "#lib/components/ui/card/index.js";
  import { IconNeedsYou } from "#lib/icons.js";

  let { projectId, tasks }: { projectId: string; tasks: HubRead<TaskList> } =
    $props();

  /** How many waiting tasks the card names before it counts the rest. */
  const NAMED = 3;
  const href = $derived(`/project/${projectId}/tasks`);
  const all = $derived(tasks.ok ? tasks.value.tasks : []);
  const waiting = $derived(all.filter((task) => task.kind === "you"));
</script>

<Card class="gap-0 rounded-[var(--radius-lg)] py-0 shadow-md">
  <header class="head">
    <h2 class="text-title">Tasks</h2>
    <Button class="ml-auto" {href} size="sm" variant="outline"
      >Open tasks</Button
    >
  </header>
  <div class="body">
    {#if !tasks.ok}
      <p class="line">
        The tasks could not be read: {tasks.detail} ({tasks.status}). Open tasks
        to try again.
      </p>
    {:else if all.length === 0}
      <p class="line">
        Plan this project's work as tasks; each moves through its stages, and
        the ones waiting on you show here.
      </p>
    {:else}
      <p class="line num">
        {all.length}
        {all.length === 1 ? "task" : "tasks"}
        {#if waiting.length > 0}
          &middot; {waiting.length}
          {waiting.length === 1 ? "needs" : "need"}
          you
        {/if}
      </p>
      {#if waiting.length > 0}
        <ul class="waiting">
          {#each waiting.slice(0, NAMED) as task (task.id)}
            <li>
              <a
                class="row press-tint focus-inset"
                href="{href}?task={task.id}"
              >
                <IconNeedsYou aria-hidden="true" />
                <span class="title">{task.title}</span>
                <span class="id">{task.id}</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if waiting.length > NAMED}
          <a class="more" {href}>
            {waiting.length - NAMED}
            more waiting on you
          </a>
        {/if}
      {/if}
    {/if}
  </div>
</Card>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-4);
  }
  .line {
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .waiting {
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0 calc(var(--space-2) * -1);
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--surface-hover);
    }
  }
  .row :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    flex: none;
    color: var(--status-attn-glyph);
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id {
    flex: none;
    margin-inline-start: auto;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .more {
    font: var(--type-label);
    color: var(--link-ink);
    text-decoration: none;
  }
</style>
