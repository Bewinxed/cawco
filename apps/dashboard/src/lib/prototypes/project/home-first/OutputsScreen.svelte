<script lang="ts" module>
  import type { OutputKind } from "./model";

  export type OutputsGrouping = "task" | "newest";
  export type OutputsKind = OutputKind | "all";
</script>

<script lang="ts">
  /**
   * Outputs, the place that gathers what the project produced (TOM task 9;
   * "Outputs" is its working name), reached from Home's Outputs since you
   * looked. One line holds the search, the kind chips and the grouping
   * (by the task that made it, the default, or newest first). Each item is
   * drawn as what it is and leads to its task; an item opens whole in the
   * artifact panel, a file the hub cannot serve says why.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import type { Output } from "./model";
  import OutputTile from "./OutputTile.svelte";
  import ProjectFrame from "./ProjectFrame.svelte";

  let {
    project,
    outputs,
    grouping = "task",
    kind = "all",
    read = "live",
    staleAt,
    openOutput,
  }: {
    project: string;
    outputs: Output[];
    grouping?: OutputsGrouping;
    kind?: OutputsKind;
    read?: "live" | "loading" | "stale";
    staleAt?: string;
    /** The item open whole, by id. */
    openOutput?: string;
  } = $props();

  const KINDS = [
    "post",
    "markdown",
    "picture",
    "media",
    "file",
    "preview",
    "canvas",
    "choices",
  ] as const satisfies readonly OutputKind[];
  const stale = $derived(read === "stale");
  const shown = $derived(
    outputs.filter((o) => kind === "all" || o.kind === kind)
  );
  const byTask = $derived(
    [...new Set(shown.map((o) => o.task))].map((task) => ({
      task,
      stage: shown.find((o) => o.task === task)?.stage ?? "",
      items: shown.filter((o) => o.task === task),
    }))
  );
  const opened = $derived(outputs.find((o) => o.id === openOutput));
</script>

{#snippet grid(items: Output[])}
  <ul
    class="m-0 grid list-none grid-cols-2 gap-space-3 p-0 @min-desk/shell:@max-wide/shell:grid-cols-3 @min-wide/shell:grid-cols-4"
    {@attach reflow()}
  >
    {#each items as output (output.id)}
      <OutputTile {output} size="card" {stale} />
    {/each}
  </ul>
{/snippet}

<ProjectFrame
  more={[words.more.configure]}
  pane={opened ? itemPane : undefined}
  paneClose={words.taskPane.close}
  paneForm="over"
  paneTitle={opened?.title}
  {project}
  title={words.places.outputs}
>
  <div class="flex min-w-0 flex-col gap-space-5">
    <div
      class="flex flex-col gap-space-3 @min-wide/shell:flex-row @min-wide/shell:items-center"
    >
      <div class="w-full flex-none @min-desk/shell:w-c-pop-w">
        <Input
          aria-label={words.outputs.search}
          placeholder={words.outputs.search}
          type="search"
        />
      </div>
      <ul class="m-0 flex min-w-0 list-none gap-space-2 overflow-x-auto p-0">
        {#each KINDS as each (each)}
          <li class="flex-none">
            <button
              aria-pressed={kind === each}
              class={chipVariants({ variant: "option" })}
              type="button"
            >
              <span>{words.outputs.kinds[each]}</span>
            </button>
          </li>
        {/each}
      </ul>
      <div class="flex-none @min-wide/shell:ms-auto">
        <ToggleGroup.Root
          aria-label={words.outputs.groupBy}
          type="single"
          value={grouping}
        >
          <ToggleGroup.Item value="task"
            ><span>{words.outputs.byTask}</span></ToggleGroup.Item
          >
          <ToggleGroup.Item value="newest"
            ><span>{words.outputs.newest}</span></ToggleGroup.Item
          >
        </ToggleGroup.Root>
      </div>
    </div>

    {#if stale}
      <p class="m-0 type-meta text-ink-muted">
        {words.staleSince(staleAt ?? "")}
      </p>
    {/if}

    {#if read === "loading"}
      <div
        class="grid grid-cols-2 gap-space-3 @min-desk/shell:@max-wide/shell:grid-cols-3 @min-wide/shell:grid-cols-4"
      >
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}
          <Skeleton height="picture" radius="tile" />
        {/each}
      </div>
    {:else if shown.length === 0}
      <p
        class="m-0 rounded-lg bg-surface-raised px-space-4 py-space-3 type-body text-ink-muted shadow-tile"
      >
        {words.outputs.none}
      </p>
    {:else if grouping === "newest"}
      {@render grid(shown)}
    {:else}
      {#each byTask as group (group.task)}
        <section class="flex flex-col gap-space-2">
          <h2
            class="m-0 flex min-h-c-section-head-h flex-wrap items-baseline gap-x-space-2 ps-space-1"
          >
            <button
              class="type-label text-ink-strong underline-offset-2 hover:underline"
              aria-label={`${words.outputs.openTask}: ${group.task}`}
              type="button">{group.task}</button
            >
            <span class="type-meta text-ink-muted">{group.stage}</span>
          </h2>
          {@render grid(group.items)}
        </section>
      {/each}
    {/if}
  </div>
</ProjectFrame>

{#snippet itemPane()}
  {#if opened}
    <div class="flex flex-col gap-space-4">
      <p class="m-0 type-meta text-ink-muted">
        {words.outputs.kinds[opened.kind]} · {opened.when}
      </p>
      {#if opened.body}
        <p
          class="m-0 rounded-lg bg-surface-recess p-space-4 type-body text-ink-strong text-pretty"
        >
          {opened.body}
        </p>
      {/if}
      {#if opened.alternates}
        <p class="m-0 type-meta text-ink-muted">
          {words.outputs.alternates(opened.alternates)}{#if opened.mediaPlan}
            · {words.outputs.mediaPlan}{/if}
        </p>
      {/if}
      <div class="flex flex-wrap gap-space-2">
        <Button label={words.outputs.openFile} size="sm" variant="outline" />
        <Button label={words.outputs.openTask} size="sm" variant="outline" />
      </div>
      <p class="m-0 type-meta text-ink-muted">{opened.task} · {opened.stage}</p>
    </div>
  {/if}
{/snippet}
