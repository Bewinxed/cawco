<script lang="ts">
  /**
   * Outputs ("Outputs" until the person names it), the shelf of what the
   * project made: one line holding search, the kind chips and the grouping
   * switch, then the items drawn as what they are, grouped by the task that
   * made them (its name and stage heading the group, a way to the task) or
   * newest first. Under the phone line two items stand across.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconAgent, IconBox, IconSearch } from "#lib/icons.js";
  import type { Output, OutputKind, Project, Read } from "./model";
  import OutputItem from "./OutputItem.svelte";
  import StaleNote from "./StaleNote.svelte";

  let {
    project,
    read,
    kind = "all",
    group = "task",
    onopen,
    onaskcaw,
  }: {
    project: Project;
    read: Read;
    kind?: string;
    group?: "task" | "newest";
    onopen: (id: string) => void;
    onaskcaw: () => void;
  } = $props();

  const KINDS: ("all" | OutputKind)[] = [
    "all",
    "post",
    "markdown",
    "picture",
    "media",
    "file",
    "preview",
    "canvas",
    "choices",
  ];

  let kindNow = $derived(kind);
  let groupNow = $derived<string>(group);
  const reading = $derived(read.status === "loading");
  const stale = $derived(read.stale !== null);
  const shown = $derived(
    project.outputs.filter((one) => kindNow === "all" || one.kind === kindNow)
  );
  const groups = $derived(
    Object.entries(Object.groupBy(shown, (one) => one.taskTitle)) as [
      string,
      Output[],
    ][]
  );
  const stageOf = (output: Output) =>
    project.stages.find((one) => one.key === output.stage)?.name ?? null;
</script>

<div class="flex flex-col gap-space-group">
  {#if stale && read.stale}
    <StaleNote since={read.stale} />
  {/if}
  <div class="flex flex-wrap items-center gap-space-3">
    <div class="min-w-0 flex-1 basis-64 desk:max-w-c-page-column-w">
      <InputGroup.Root>
        <InputGroup.Addon>
          <IconSearch class="size-icon-md text-ink-muted" aria-hidden="true" />
        </InputGroup.Addon>
        <InputGroup.Input
          type="search"
          placeholder={w.searchOutputs}
          aria-label={w.searchOutputs}
        />
      </InputGroup.Root>
    </div>
    <Tabs.Root bind:value={groupNow}>
      <Tabs.List>
        <Tabs.Trigger value="task">{w.groupBy.task}</Tabs.Trigger>
        <Tabs.Trigger value="newest">{w.groupBy.newest}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>
  <div class="-mx-space-1 -mt-space-2 overflow-x-auto px-space-1 no-scrollbar">
    <div class="flex w-max gap-space-2">
      {#each KINDS as one (one)}
        <Button
          variant="outline"
          size="xs"
          current="selected"
          aria-current={kindNow === one ? "page" : undefined}
          aria-pressed={kindNow === one}
          onclick={() => {
            kindNow = one;
          }}>{w.kinds[one]}</Button
        >
      {/each}
    </div>
  </div>

  {#if reading}
    <div
      class="grid grid-cols-fit-c-made-tile-min gap-space-4 max-phone:grid-cols-2"
    >
      {#each [0, 1, 2, 3] as tile (tile)}
        <Skeleton height="view" radius="card" />
      {/each}
    </div>
  {:else if project.outputs.length === 0}
    <div class="rounded-lg bg-surface-raised shadow-tile">
      <EmptyState
        icon={IconBox}
        title={w.outputsEmptyTitle}
        line={w.outputsEmptyWhy}
        pad="pane"
      >
        {#snippet action()}
          <Button
            size="sm"
            icon={IconAgent}
            label={w.askCaw}
            onclick={onaskcaw}
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if groupNow === "newest"}
    <div
      class="grid grid-cols-fit-c-made-tile-min items-start gap-space-4 max-phone:grid-cols-2 max-phone:gap-space-2"
    >
      {#each shown as output (output.id)}
        <OutputItem {output} stage={stageOf(output)} ontask={onopen} />
      {/each}
    </div>
  {:else}
    {#each groups as [title, items] (title)}
      {@const head = items[0]}
      <section class="flex flex-col gap-space-2" aria-label={title}>
        <h2 class="mark-line flex min-w-0 items-center gap-space-2 px-space-1">
          {#if head?.task.startsWith("tsk-")}
            <button
              type="button"
              class="focus-inset min-w-0 truncate text-start type-label text-ink-strong hover:underline"
              onclick={() => onopen(head.task)}>{title}</button
            >
          {:else}
            <span class="min-w-0 truncate type-label text-ink-strong"
              >{title}</span
            >
          {/if}
          {#if head && stageOf(head)}
            <span class="flex-none type-meta text-ink-muted"
              >· {stageOf(head)}</span
            >
          {/if}
          <span class="flex-none type-meta num text-ink-muted"
            >{items.length}</span
          >
        </h2>
        <div
          class="grid grid-cols-fit-c-made-tile-min items-start gap-space-4 max-phone:grid-cols-2 max-phone:gap-space-2"
        >
          {#each items as output (output.id)}
            <OutputItem
              {output}
              stage={stageOf(output)}
              showTask={false}
              ontask={onopen}
            />
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>
