<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * Tasks, the project's front door. Its first line is the view switch
   * (Board, Table, Calendar, Dependencies) and the saved filters (All, Needs
   * you, Working, Stuck, Save this narrowing) with the search and the
   * narrowing chips; it opens narrowed to Needs you while that count is not
   * zero. The board's columns are the project's stages, each named with
   * its count even when empty, Archive last; the inline composer stands at
   * the top of the first stage. On a phone the board is a pager, one stage
   * per screen, under the stage strip that is its index.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import {
    Tabs as FluidTabs,
    TabsList as FluidTabsList,
    TabItem,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import Input from "#lib/components/ui/input/input.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import Spinner from "#lib/components/ui/spinner/spinner.svelte";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAlert,
    IconArchive,
    IconChat,
    IconChevronDown,
    IconPlus,
  } from "#lib/icons.js";
  import {
    type Filter,
    filterCounts,
    keeps,
    needsYou,
    type Read,
    type View,
  } from "./derive";
  import type { ProjectRecords, Stage, Task } from "./records";
  import StatusGlyph from "./StatusGlyph.svelte";
  import TaskCard from "./TaskCard.svelte";

  let {
    records,
    read,
    filter,
    view: viewArg = "board",
    stage: stageArg,
    unreadStages = [],
    refusal,
    opened,
    onopen,
    onfilter,
    onaskcaw,
  }: {
    records: ProjectRecords;
    read: Read;
    /** The saved filter in the link. */
    filter: Filter;
    view?: View;
    /** On a phone, the stage the pager shows. */
    stage?: string;
    /** Stages whose read failed (the partial state). */
    unreadStages?: string[];
    /** The hub's refusal of the last task typed, in its words. */
    refusal?: string;
    /** The task whose pane is open. */
    opened?: string | null;
    onopen: (id: string) => void;
    onfilter: (filter: Filter) => void;
    onaskcaw: (words: string) => void;
  } = $props();

  const counts = $derived(filterCounts(records));
  let view = $derived<View>(viewArg);
  let shownStage = $derived(stageArg ?? records.stages[0]?.id ?? "");
  let query = $state("");
  let labels = $state<string[]>([]);
  let stages = $state<string[]>([]);
  let types = $state<string[]>([]);

  /** What was typed and is being filed: never drawn as filed until the hub answers. */
  let filing = $state<string[]>([]);
  let filed = $state<Task[]>([]);
  let draft = $state("");

  const allTasks = $derived([...filed, ...records.tasks]);
  const kept = $derived(
    allTasks.filter(
      (task) =>
        keeps(records, filter, task) &&
        (query === "" ||
          `${task.id} ${task.title}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (labels.length === 0 ||
          task.labels.some((label) => labels.includes(label))) &&
        (stages.length === 0 || stages.includes(task.stage)) &&
        (types.length === 0 || (task.type && types.includes(task.type)))
    )
  );
  const narrowed = $derived(
    filter !== "all" ||
      query !== "" ||
      labels.length + stages.length + types.length > 0
  );
  const allLabels = $derived(
    [...new Set(records.tasks.flatMap((task) => task.labels))].slice(0, 12)
  );
  const allTypes = $derived([
    ...new Set(records.tasks.flatMap((task) => (task.type ? [task.type] : []))),
  ]);
  const hasDates = false;
  const isEmpty = $derived(
    read === "live" && records.stages.every((stage) => stage.total === 0)
  );
  const live = $derived(read === "live");

  /** The cards a column draws, and how many of its tasks it does not. */
  const columnOf = (stage: Stage) => {
    const cards = kept.filter((task) => task.stage === stage.id);
    const drawnOfStage = allTasks.filter(
      (task) => task.stage === stage.id
    ).length;
    const total =
      stage.total + filed.filter((t) => t.stage === stage.id).length;
    return {
      cards,
      total,
      hidden: narrowed ? 0 : Math.max(0, total - drawnOfStage),
    };
  };

  const file = () => {
    const title = draft.trim();
    if (title === "" || !live) {
      return;
    }
    draft = "";
    filing = [...filing, title];
    // The hub answers: the task stands in Ready, filed by hand.
    setTimeout(() => {
      filing = filing.filter((one) => one !== title);
      filed = [
        {
          id: `tsk-${241 + filed.length}`,
          title,
          stage: records.stages[0]?.id ?? "",
          labels: [],
          changed: "just now",
        },
        ...filed,
      ];
    }, 900);
  };

  let pager = $state<HTMLElement>();
  const goTo = (id: string) => {
    shownStage = id;
    const column = pager?.querySelector<HTMLElement>(`[data-stage="${id}"]`);
    if (pager && column) {
      pager.scrollTo({
        left: column.offsetLeft - pager.offsetLeft,
        behavior: "smooth",
      });
    }
  };
  // The link's stage on a phone: the pager stands on it from the first paint.
  $effect(() => {
    const column = pager?.querySelector<HTMLElement>(
      `[data-stage="${stageArg}"]`
    );
    if (pager && column && stageArg) {
      pager.scrollLeft = column.offsetLeft - pager.offsetLeft;
    }
  });
  const onPage = () => {
    if (!pager) {
      return;
    }
    const index = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
    const id = [...records.stages.map((stage) => stage.id), "archive"][index];
    if (id) {
      shownStage = id;
    }
  };

  const FILTERS: Filter[] = ["all", "needs", "working", "stuck"];
  const VIEWS: View[] = ["board", "table", "calendar", "dependencies"];
  const titleOf = (id: string) =>
    allTasks.find((task) => task.id === id)?.title ??
    records.decisions.find((decision) => decision.id === id)?.title ??
    id;
</script>

{#snippet narrowingChip(
  name: string,
  options: string[],
  chosen: string[],
  set: (next: string[]) => void,
  label: (value: string) => string
)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class={chipVariants({ variant: "setting", tone: "muted" })}
          data-narrowed={chosen.length > 0 || undefined}
          type="button"
        >
          <span data-slot="chip-label"
            >{chosen.length > 0 ? `${name} · ${chosen.length}` : name}</span
          >
          <IconChevronDown aria-hidden="true" data-slot="chevron" />
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content portalProps={{ disabled: true }} width="regular">
      {#each options as option (option)}
        <DropdownMenu.CheckboxItem
          checked={chosen.includes(option)}
          closeOnSelect={false}
          onCheckedChange={(on) =>
            set(
              on ? [...chosen, option] : chosen.filter((one) => one !== option)
            )}
        >
          {label(option)}
        </DropdownMenu.CheckboxItem>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<section
  aria-label={words.places.tasks}
  class="flex min-h-0 flex-1 flex-col gap-space-4"
>
  <!-- The first line: the view switch, the saved filters, the search and
       the narrowing chips. One row while it fits; the filters wrap under the
       switch when it does not (900, or the board beside Caw's pane). -->
  <div class="flex flex-wrap items-center gap-x-space-4 gap-y-space-3">
    <Tabs.Root bind:value={view}>
      <Tabs.List aria-label={words.viewLabel} class="@max-phone/five:w-full">
        {#each VIEWS as one (one)}
          {#if one === "calendar" && !hasDates}
            <Tip label={words.noDates}>
              {#snippet children(tip)}
                <span {...tip} class="flex flex-1" tabindex="-1">
                  <Tabs.Trigger disabled value={one}
                    >{words.views[one]}</Tabs.Trigger
                  >
                </span>
              {/snippet}
            </Tip>
          {:else}
            <Tabs.Trigger value={one}>{words.views[one]}</Tabs.Trigger>
          {/if}
        {/each}
      </Tabs.List>
    </Tabs.Root>

    <div
      class="flex min-w-0 max-w-full items-center gap-space-1 @max-phone/five:order-3 @max-phone/five:w-full"
    >
      <FluidTabs
        onValueChange={(next) => onfilter(next as Filter)}
        value={filter}
      >
        <FluidTabsList aria-label={words.filterLabel} scrollable>
          {#each FILTERS as one (one)}
            {@const count = counts[one]}
            <TabItem label={words.filters[one]} value={one}>
              {#snippet lead()}
                {#if one === "needs" && count > 0 && live}
                  <span
                    aria-hidden="true"
                    class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
                    data-box
                  ></span>
                {/if}
              {/snippet}
              {#snippet trail()}
                {#if live && count > 0}
                  <span class="type-meta text-ink-muted num">{count}</span>
                {/if}
              {/snippet}
            </TabItem>
          {/each}
        </FluidTabsList>
      </FluidTabs>
      <Tip label={words.saveNarrowing}>
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-label={words.saveNarrowing}
            disabled={!narrowed || filter !== "all"}
            icon={IconPlus}
            size="icon-sm"
            tone="quiet"
            variant="ghost"
          />
        {/snippet}
      </Tip>
    </div>

    <div
      class="flex min-w-0 flex-1 items-center justify-end gap-space-2 @max-phone/five:order-4 @max-phone/five:w-full @max-phone/five:flex-none @max-phone/five:justify-start @max-phone/five:overflow-x-auto"
    >
      <div
        class="min-w-c-starter-w max-w-c-machines-w flex-1 @max-phone/five:max-w-none"
      >
        <Input
          aria-label={words.search}
          bind:value={query}
          data-task-search
          placeholder={words.searchPlaceholder}
          type="search"
        />
      </div>
      {@render narrowingChip(
        words.chipLabel,
        allLabels,
        labels,
        (next) => {
          labels = next;
        },
        (value) => value
      )}
      {@render narrowingChip(
        words.chipStage,
        records.stages.map((one) => one.id),
        stages,
        (next) => {
          stages = next;
        },
        (value) => records.stages.find((one) => one.id === value)?.name ?? value
      )}
      {#if allTypes.length > 0}
        {@render narrowingChip(
          words.chipType,
          allTypes,
          types,
          (next) => {
            types = next;
          },
          (value) => value
        )}
      {/if}
    </div>
  </div>

  {#if read === "stale"}
    <p class="mark-line flex items-center gap-space-2 type-meta text-ink-muted">
      <IconAlert aria-hidden="true" class="size-icon-sm flex-none" /><span
        >{words.movesOff}</span
      >
    </p>
  {/if}

  {#if read === "loading"}
    <div
      aria-busy="true"
      class="flex min-h-0 flex-1 gap-space-3 overflow-hidden"
    >
      {#each records.stages as one (one.id)}
        <div
          class="flex w-full flex-none flex-col gap-space-2 @phone/five:w-auto @phone/five:min-w-c-starter-w @phone/five:flex-1"
        >
          <Skeleton line="label" radius="line" width="name" />
          {#each [0, 1, 2] as row (row)}
            <Skeleton height="card" radius="card" />
          {/each}
        </div>
      {/each}
    </div>
  {:else if view === "board"}
    <!-- The phone's stage strip: the pager's index, every stage named with its count. -->
    <div class="flex min-w-0 @phone/five:hidden">
      <FluidTabs onValueChange={goTo} value={shownStage}>
        <FluidTabsList aria-label={words.stageStrip} scrollable>
          {#each [...records.stages, { id: "archive", name: words.archive, kind: "done" as const, total: records.archived }] as one (one.id)}
            {@const total =
              one.id === "archive" ? records.archived : columnOf(one).total}
            <TabItem label={one.name} value={one.id}>
              {#snippet trail()}
                {#if total > 0}<span class="type-meta text-ink-muted num"
                    >{total}</span
                  >{/if}
              {/snippet}
            </TabItem>
          {/each}
        </FluidTabsList>
      </FluidTabs>
    </div>

    <div
      bind:this={pager}
      class="-mx-space-1 flex min-h-0 flex-1 snap-x snap-mandatory gap-space-3 overflow-x-auto overscroll-x-contain px-space-1 pb-space-2 @phone/five:snap-none"
      onscroll={onPage}
    >
      {#each records.stages as one, index (one.id)}
        {@const column = columnOf(one)}
        <section
          aria-label={one.name}
          class="flex min-h-0 w-full flex-none snap-start flex-col gap-space-2 @phone/five:w-auto @phone/five:min-w-c-starter-w @phone/five:flex-1"
          data-stage={one.id}
        >
          <h3
            class="mark-line flex h-c-btn-h-sm flex-none items-center gap-space-2 px-space-1 type-label text-ink-strong"
          >
            <span>{one.name}</span>
            {#if column.cards.length > 0}
              <span class="type-meta text-ink-muted num"
                >{column.cards.length}</span
              >
            {/if}
            {#if narrowed && column.total > 0}
              <span class="type-meta text-ink-subtle num"
                >{words.ofTotal(column.total)}</span
              >
            {/if}
          </h3>
          <div
            class="flex min-h-0 flex-1 flex-col gap-space-2 overflow-y-auto rounded-lg bg-surface-recess p-space-2"
          >
            {#if index === 0}
              <form
                class="flex flex-col gap-space-1"
                onsubmit={(event) => {
                  event.preventDefault();
                  file();
                }}
              >
                <Input
                  aria-label={words.composerLabel}
                  bind:value={draft}
                  disabled={!live}
                  placeholder={words.composerPlaceholder}
                />
                {#each filing as title (title)}
                  <div
                    class="mark-line flex items-center gap-space-2 rounded-lg bg-surface-raised p-space-3 type-label text-ink-muted"
                    aria-busy="true"
                  >
                    <Spinner aria-hidden="true" />
                    <span
                      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
                      >{title}</span
                    >
                    <span class="type-meta">{words.composerFiling}</span>
                  </div>
                {/each}
                {#if refusal}
                  <p
                    class="mark-line flex gap-space-2 px-space-1 type-meta text-status-fail-ink"
                    role="alert"
                  >
                    <IconAlert
                      aria-hidden="true"
                      class="mt-px size-icon-sm flex-none"
                    />
                    <span>{refusal}</span>
                  </p>
                {/if}
              </form>
            {/if}
            {#if unreadStages.includes(one.id)}
              <p class="px-space-1 type-meta text-ink-muted">
                {words.stageUnread}
              </p>
            {/if}
            {#if isEmpty && index === 0}
              <EmptyState
                icon={IconChat}
                line={words.emptyLine}
                title={words.emptyTitle}
              >
                {#snippet action()}
                  <Button
                    icon={IconChat}
                    label={words.askCawPlan}
                    onclick={() => onaskcaw(words.askCawPlan)}
                    variant="outline"
                  />
                {/snippet}
              </EmptyState>
            {/if}
            {#each column.cards as task (task.id)}
              <TaskCard
                disabled={!live}
                needs={needsYou(records, task)}
                {onopen}
                open={opened === task.id}
                {task}
              />
            {/each}
            {#if column.hidden > 0}
              <Button
                align="row"
                class="w-full flex-none"
                size="sm"
                tone="muted"
                variant="ghost"
              >
                {words.showMore(column.hidden)}
              </Button>
            {/if}
          </div>
        </section>
      {/each}
      <section
        aria-label={words.archive}
        class="flex min-h-0 w-full flex-none snap-start flex-col gap-space-2 @phone/five:w-c-starter-w"
        data-stage="archive"
      >
        <h3
          class="mark-line flex h-c-btn-h-sm flex-none items-center gap-space-2 px-space-1 type-label text-ink-muted"
        >
          <IconArchive aria-hidden="true" class="size-icon-sm" />
          <span>{words.archive}</span>
          {#if records.archived > 0}<span class="type-meta num"
              >{records.archived}</span
            >{/if}
        </h3>
        <div
          class="flex min-h-0 flex-1 flex-col rounded-lg border border-dashed border-border-hairline p-space-2"
        >
          {#if records.archived > 0}
            <Button
              align="row"
              class="w-full"
              size="sm"
              tone="muted"
              variant="ghost"
            >
              {words.showMore(records.archived)}
            </Button>
          {/if}
        </div>
      </section>
    </div>
  {:else if view === "table"}
    <div
      class="min-h-0 flex-1 overflow-auto rounded-lg bg-surface-raised shadow-tile"
    >
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{words.tableTitle}</Table.Head>
            <Table.Head>{words.tableStage}</Table.Head>
            <Table.Head>{words.tableType}</Table.Head>
            <Table.Head>{words.tableLabels}</Table.Head>
            <Table.Head>{words.tableChanged}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each kept as task (task.id)}
            <Table.Row aria-current={opened === task.id ? "true" : undefined}>
              <Table.Cell>
                <span class="mark-line flex min-w-0 items-center gap-space-2">
                  {#if needsYou(records, task)}
                    <span
                      aria-label={words.needsYou}
                      class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
                      data-box
                      role="img"
                    ></span>
                  {/if}
                  <span class="font-mono type-meta text-ink-muted num"
                    >{task.id}</span
                  >
                  <button
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-start type-label text-ink-row can-hover:hover:underline"
                    onclick={() => onopen(task.id)}
                    type="button">{task.title}</button
                  >
                </span>
              </Table.Cell>
              <Table.Cell>
                <span class="mark-line flex items-center gap-space-2">
                  <span class="type-label"
                    >{records.stages.find((one) => one.id === task.stage)
                      ?.name}</span
                  >
                  {#if task.attempt && task.attempt.state !== "landed"}
                    <StatusGlyph small status={task.attempt.state} wordless />
                  {/if}
                </span>
              </Table.Cell>
              <Table.Cell
                ><span class="type-meta text-ink-muted">{task.type ?? ""}</span
                ></Table.Cell
              >
              <Table.Cell
                ><span class="type-meta text-ink-muted"
                  >{task.labels.join(", ")}</span
                ></Table.Cell
              >
              <Table.Cell
                ><span class="type-meta text-ink-muted num">{task.changed}</span
                ></Table.Cell
              >
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else}
    {@const chains = kept.filter((task) => (task.waitsOn ?? []).length > 0)}
    <ul class="flex min-h-0 flex-1 flex-col gap-space-2 overflow-y-auto">
      {#each chains as task (task.id)}
        <li
          class="flex flex-col gap-space-1 rounded-lg bg-surface-raised p-space-3 shadow-tile"
        >
          <button
            class="text-start type-label text-ink-row"
            onclick={() => onopen(task.id)}
            type="button">{task.title}</button
          >
          {#each task.waitsOn ?? [] as on (on)}
            <span
              class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
            >
              <span>{words.waitsOn}</span>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
                >{titleOf(on)}</span
              >
            </span>
          {/each}
        </li>
      {:else}
        <li class="type-body text-ink-muted">{words.noWaits}</li>
      {/each}
    </ul>
  {/if}
</section>
