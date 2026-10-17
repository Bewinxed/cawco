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
  <span
    class="flex items-center gap-space-1 min-h-c-btn-h-sm min-w-0 pe-space-1 rounded-sm bg-surface-recess"
  >
    <button
      class="flex flex-auto items-center gap-space-2 min-w-0 min-h-c-btn-h-sm px-space-2 border-0 rounded-sm bg-transparent text-start cursor-pointer press-tint focus-inset"
      onclick={() => onopen(id)}
      title={byId.get(id)?.title}
      type="button"
    >
      <span class="flex-none text-meta font-mono liga-none text-ink-muted"
        >{id}</span
      >
      {#if byId.get(id)}
        <span
          class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
          >{byId.get(id)?.title}</span
        >
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
  <!-- literal: 6rem minmax(0, 1fr) -->
  <div
    class="grid grid-cols-(--edge-cols) items-start gap-space-2"
    style:--edge-cols="6rem minmax(0, 1fr)"
  >
    <span class="pt-space-1 type-label text-ink-muted">{name}</span>
    <div data-slot="edge-list" class="flex flex-col gap-space-1 min-w-0">
      {#each ids as id (id)}
        {@render ref(
          id,
          edgeName ? () => onlink(edgeName, id, true) : undefined
        )}
      {:else}
        <span class="pt-space-1 type-meta text-ink-subtle">None</span>
      {/each}
    </div>
  </div>
{/snippet}

<section class="flex flex-col gap-space-2">
  <div class="flex items-end gap-space-2">
    <h3 class="kit-section-head flex-auto min-h-c-btn-h-xs m-0 px-0">
      Relations
    </h3>
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} size="xs" variant="ghost"
            ><IconLink /><span>Link</span><IconChevronDown /></Button
          >
        {/snippet}
      </Popover.Trigger>
      <!-- literal: 20rem -->
      <Popover.Content
        align="end"
        class="w-(--popover-w)"
        style="--popover-w: 20rem"
      >
        <div data-slot="pick" class="flex flex-col gap-space-2">
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
          <!-- literal: 14rem -->
          <ul
            class="flex flex-col max-h-(--candidates-max) m-0 p-0 overflow-y-auto list-none"
            style:--candidates-max="14rem"
          >
            {#each candidates as each (each.id)}
              <li>
                <button
                  class="kit-item flex items-center gap-space-2 w-full text-start"
                  onclick={async () => {
                    open = false;
                    query = "";
                    await onlink(edge, each.id);
                  }}
                  type="button"
                >
                  <span
                    class="flex-none text-meta font-mono liga-none text-ink-muted"
                    >{each.id}</span
                  >
                  <span
                    class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
                    >{each.title}</span
                  >
                </button>
              </li>
            {:else}
              <li class="pt-space-1 type-meta text-ink-subtle">
                No task matches.
              </li>
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
