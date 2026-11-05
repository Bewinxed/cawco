<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * Outputs (a working name): the shelf of everything the project made, from
   * every task's outputs, the artifacts its sessions showed, the files
   * reports left in its folder and what was promoted. One line holds the
   * search, the kind chips and the grouping (by task, or newest first);
   * each item is drawn as what it is, and its task's name opens the task.
   * A file the hub cannot serve is named with why.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import {
    Tabs as FluidTabs,
    TabsList as FluidTabsList,
    TabItem,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import Input from "#lib/components/ui/input/input.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconBox,
    IconDecisions,
    IconDocument,
    IconFileMarkdown,
    IconImage,
    IconVideo,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { Read } from "./derive";
  import type { Output, OutputKind, ProjectRecords } from "./records";

  let {
    records,
    read,
    kind: kindArg = "all",
    grouping: groupingArg = "task",
    onopentask,
    onopenitem,
    onaskcaw,
  }: {
    records: ProjectRecords;
    read: Read;
    kind?: OutputKind | "all";
    grouping?: "task" | "newest";
    onopentask: (id: string) => void;
    onopenitem: (id: string) => void;
    onaskcaw: (words: string) => void;
  } = $props();

  let kind = $derived(kindArg);
  let grouping = $derived(groupingArg);
  let query = $state("");

  const KINDS: (OutputKind | "all")[] = [
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
  const GLYPHS = {
    post: IconArtifactPage,
    markdown: IconFileMarkdown,
    picture: IconImage,
    media: IconVideo,
    file: IconDocument,
    preview: IconArtifactPage,
    canvas: IconArtifactCanvas,
    choices: IconDecisions,
  } as const;

  const shown = $derived(
    records.outputs.filter(
      (output) =>
        (kind === "all" || output.kind === kind) &&
        (query === "" ||
          `${output.title} ${output.taskTitle}`
            .toLowerCase()
            .includes(query.toLowerCase()))
    )
  );
  const groups = $derived.by(() => {
    const byTask = new Map<
      string,
      { task: string; taskTitle: string; stage: string; items: Output[] }
    >();
    for (const output of shown) {
      const group = byTask.get(output.task) ?? {
        task: output.task,
        taskTitle: output.taskTitle,
        stage: output.stage,
        items: [],
      };
      group.items.push(output);
      byTask.set(output.task, group);
    }
    return [...byTask.values()];
  });
  const kindsHeld = $derived(
    KINDS.filter(
      (one) =>
        one === "all" || records.outputs.some((output) => output.kind === one)
    )
  );
</script>

{#snippet item(output: Output)}
  {@const Glyph = GLYPHS[output.kind]}
  <li class="flex min-w-0 flex-col">
    <!-- mark-line: the kind's glyph heads the card on its own line; the card's words stand in rows below it -->
    <button
      class="press-tint flex h-full w-full flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 text-start shadow-tile can-hover:hover:bg-surface-hover"
      onclick={() => onopenitem(output.id)}
      type="button"
    >
      <span
        class="mark-line flex flex-wrap items-center gap-x-space-2 type-meta text-ink-muted"
      >
        <Glyph aria-hidden="true" class="size-icon-sm flex-none" />
        <span>{words.outputsKinds[output.kind]}</span>
        <span aria-hidden="true">·</span>
        <span class="num">{output.when}</span>
        {#if output.isNew}
          <span class="ms-auto text-ink-strong">{words.isNew}</span>
        {/if}
      </span>
      {#if output.kind === "post"}
        <span class="line-clamp-5 type-body text-ink-strong text-pretty"
          >{output.body}</span
        >
        {#if output.alternates}
          <span class="mt-auto type-meta text-ink-muted num"
            >{words.alternates(output.alternates)}</span
          >
        {/if}
      {:else if output.kind === "preview" || output.kind === "canvas"}
        <span
          class="flex aspect-16/10 w-full items-center justify-center rounded-md bg-surface-recess text-ink-subtle"
        >
          <Glyph aria-hidden="true" class="size-icon-lg" />
        </span>
        <span
          class="overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
          >{output.title}</span
        >
        <span class="line-clamp-2 type-meta text-ink-muted">{output.body}</span>
      {:else if output.unservable}
        <span class="type-label font-mono text-ink-row break-all"
          >{output.title}</span
        >
        <span
          class="mark-line mt-auto flex gap-space-2 type-meta text-status-fail-ink"
        >
          <IconWarningTriangle
            aria-hidden="true"
            class="size-icon-sm flex-none"
          />
          <span>{words.cannotServe}: {output.unservable}</span>
        </span>
      {:else}
        <span class="type-label text-ink-row break-all">{output.title}</span>
        <span
          class="line-clamp-4 rounded-md bg-surface-recess p-space-3 type-meta text-ink-strong text-pretty"
          >{output.body}</span
        >
      {/if}
    </button>
    {#if grouping === "newest"}
      <Button
        align="row"
        class="mt-space-1 max-w-full"
        onclick={() => onopentask(output.task)}
        size="xs"
        variant="link"
      >
        <span class="overflow-clip text-ellipsis whitespace-nowrap"
          >{output.taskTitle}</span
        >
      </Button>
    {/if}
  </li>
{/snippet}

<section
  aria-label={words.places.outputs}
  class="flex min-h-0 flex-1 flex-col gap-space-4"
>
  <div class="flex flex-wrap items-center gap-x-space-4 gap-y-space-3">
    <div
      class="min-w-0 flex-1 @phone/five:w-c-machines-w @phone/five:flex-none"
    >
      <Input
        aria-label={words.searchOutputs}
        bind:value={query}
        placeholder={words.searchOutputs}
        type="search"
      />
    </div>
    <div class="flex min-w-0 @max-phone/five:order-3 @max-phone/five:w-full">
      <FluidTabs
        onValueChange={(next) => {
          kind = next as OutputKind | "all";
        }}
        value={kind}
      >
        <FluidTabsList aria-label={words.outputsKindsLabel} scrollable>
          {#each kindsHeld as one (one)}
            <TabItem label={words.outputsKinds[one]} value={one} />
          {/each}
        </FluidTabsList>
      </FluidTabs>
    </div>
    <Tabs.Root bind:value={grouping}>
      <Tabs.List aria-label={words.groupBy}>
        <Tabs.Trigger value="task">{words.byTask}</Tabs.Trigger>
        <Tabs.Trigger value="newest">{words.newest}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  {#if read === "loading"}
    <div class="grid grid-cols-fit-c-pin-card-w gap-space-3">
      {#each [0, 1, 2, 3] as one (one)}
        <Skeleton height="view" radius="card" />
      {/each}
    </div>
  {:else if records.outputs.length === 0 && read === "live"}
    <EmptyState
      icon={IconBox}
      line={words.noOutputsLine}
      title={words.noOutputsTitle}
    >
      {#snippet action()}
        <Button
          label={words.askCawOutputs}
          onclick={() => onaskcaw(words.askCawOutputs)}
          variant="outline"
        />
      {/snippet}
    </EmptyState>
  {:else}
    <div class="min-h-0 flex-1 overflow-x-clip overflow-y-auto pb-space-4">
      {#if grouping === "newest"}
        <ul
          class="grid grid-cols-fit-c-pin-card-w gap-space-3 @max-phone/five:grid-cols-2"
        >
          {#each shown as output (output.id)}
            {@render item(output)}
          {/each}
        </ul>
      {:else}
        <!-- Each task's outputs stand together under its name, the tasks
             side by side as the shelf's columns. -->
        <div
          class="grid grid-cols-fit-c-pin-card-w items-start gap-x-space-3 gap-y-space-5"
        >
          {#each groups as group (group.task)}
            <section class="flex min-w-0 flex-col gap-space-2">
              <h3
                class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-row"
              >
                <button
                  class="min-w-0 text-start type-label text-link-ink text-pretty can-hover:hover:underline"
                  onclick={() => onopentask(group.task)}
                  type="button"
                >
                  {group.taskTitle}
                </button>
                <span class="flex-none type-meta text-ink-muted"
                  >{group.stage}</span
                >
              </h3>
              <ul
                class="flex flex-col gap-space-2 @max-phone/five:grid @max-phone/five:grid-cols-2"
              >
                {#each group.items as output (output.id)}
                  {@render item(output)}
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
