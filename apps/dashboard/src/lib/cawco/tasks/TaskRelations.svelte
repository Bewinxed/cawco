<script lang="ts">
  /**
   * A task's relations to others. After and Parent always stand (they are
   * what a session reads first); Related, Found in, Children and Waited on
   * by stand only when the task has one, and so does Duplicate of. One "Link ▾" sets any edge: pick
   * which, then the task. Children and Waited on by are the other tasks'
   * edges, read off the list, so they are opened, not unlinked, here.
   */
  import Choice from "#lib/cawco/config/Choice.svelte";
  import type {
    TaskEdge,
    TaskSummary,
    TaskView,
  } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconChevronDown, IconClose, IconLink } from "#lib/icons.js";

  let {
    task,
    tasks,
    onlink,
    onopen,
  }: {
    task: TaskView;
    tasks: TaskSummary[];
    /** Sets or takes out one edge; throws the hub's refusal. */
    onlink: (edge: TaskEdge, to: string, remove?: boolean) => Promise<void>;
    onopen: (id: string) => void;
  } = $props();

  const byId = $derived(new Map(tasks.map((each) => [each.id, each])));
  const children = $derived(
    tasks.filter((each) => each.parent === task.id).map((each) => each.id)
  );
  const waitedOnBy = $derived(
    tasks.filter((each) => each.after.includes(task.id)).map((each) => each.id)
  );

  let open = $state(false);
  let edge = $state<TaskEdge>("after");
  let query = $state("");
  const candidates = $derived(
    tasks.filter(
      (each) =>
        each.id !== task.id &&
        !task.after.includes(each.id) &&
        !task.related.includes(each.id) &&
        each.id !== task.parent &&
        `${each.id} ${each.title}`.toLowerCase().includes(query.toLowerCase())
    )
  );

  const EDGES: { value: TaskEdge; label: string }[] = [
    { value: "after", label: "After" },
    { value: "parent", label: "Parent" },
    { value: "related", label: "Related" },
    { value: "found_in", label: "Found in" },
    { value: "duplicate_of", label: "Duplicate of" },
  ];
</script>

{#snippet ref(id: string, remove?: () => void)}
  <span class="ref">
    <button
      class="ref-open press-tint focus-inset"
      onclick={() => onopen(id)}
      title={byId.get(id)?.title}
      type="button"
    >
      <span class="ref-id">{id}</span>
      {#if byId.get(id)}
        <span class="ref-title">{byId.get(id)?.title}</span>
      {/if}
    </button>
    {#if remove}
      <Button
        aria-label="Unlink {id}"
        onclick={remove}
        size="icon-xs"
        variant="ghost"><IconClose /></Button
      >
    {/if}
  </span>
{/snippet}

{#snippet row(name: string, ids: string[], edgeName: TaskEdge | null)}
  <div class="edge">
    <span class="edge-name">{name}</span>
    <div class="edge-list">
      {#each ids as id (id)}
        {@render ref(
          id,
          edgeName ? () => onlink(edgeName, id, true) : undefined
        )}
      {:else}
        <span class="none">None</span>
      {/each}
    </div>
  </div>
{/snippet}

<section class="part">
  <div class="part-head">
    <h3 class="kit-section-head">Relations</h3>
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} size="xs" variant="ghost"
            ><IconLink /><span>Link</span><IconChevronDown /></Button
          >
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="end" class="w-80">
        <div class="pick">
          <Choice
            label="Edge"
            onchange={(next) => {
              edge = next as TaskEdge;
            }}
            options={EDGES}
            value={edge}
          />
          <Input
            aria-label="Find a task"
            autocomplete="off"
            placeholder="Find a task…"
            bind:value={query}
          />
          <ul class="candidates">
            {#each candidates as each (each.id)}
              <li>
                <button
                  class="kit-item candidate"
                  onclick={async () => {
                    open = false;
                    query = "";
                    await onlink(edge, each.id);
                  }}
                  type="button"
                >
                  <span class="ref-id">{each.id}</span>
                  <span class="ref-title">{each.title}</span>
                </button>
              </li>
            {:else}
              <li class="none">No task matches.</li>
            {/each}
          </ul>
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
  {@render row("After", task.after, "after")}
  {@render row("Parent", task.parent ? [task.parent] : [], "parent")}
  {#if task.related.length > 0}
    {@render row("Related", task.related, "related")}
  {/if}
  {#if task.foundIn}
    {@render row("Found in", [task.foundIn], "found_in")}
  {/if}
  {#if task.duplicateOf}
    {@render row("Duplicate of", [task.duplicateOf], "duplicate_of")}
  {/if}
  {#if children.length > 0}
    {@render row("Children", children, null)}
  {/if}
  {#if waitedOnBy.length > 0}
    {@render row("Waited on by", waitedOnBy, null)}
  {/if}
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part-head {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    flex: 1 1 auto;
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .edge {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
  }
  .edge-name {
    padding-block-start: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .edge-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .none {
    padding-block-start: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .ref {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: var(--c-btn-h-sm);
    min-inline-size: 0;
    padding-inline-end: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .ref-open {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: start;
    cursor: pointer;
  }
  .ref-id {
    flex: none;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-muted);
  }
  .ref-title {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .candidates {
    display: flex;
    flex-direction: column;
    max-block-size: 14rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .candidate {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    text-align: start;
  }
</style>
