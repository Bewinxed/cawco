<script lang="ts" module>
  /** A bulk change in flight: what it does, how far it is, where it stopped. */
  export interface BulkRun {
    done: number;
    /** The task the hub refused, and its words; the rest stay picked. */
    failed: { id: string; text: string } | null;
    total: number;
    /** "Moving", "Labelling", "Archiving", "Dropping". */
    verb: string;
  }
</script>

<script lang="ts">
  /**
   * What acts on the picked tasks, floating at the page's foot while any
   * are picked. "N selected · Move to ▾ · Label ▾ · Archive · Drop
   * · ×".
   *
   * Each change answers The Stay In Context Rule at its own weight:
   * - Move, Label and Archive are light and undone as easily: they just run.
   *   The bar says how far ("Moving 1 of 3", its ring filling a share per
   *   task the hub confirms), the card being changed shows it, and each card
   *   lands where the hub put it.
   * - Drop can stop work: before you commit, it names each picked task with
   *   an attempt working and the session it runs on, and its button says so
   *   ("Drop 3, 1 still running").
   * - A refusal stops the run where it is: the bar names the task and the
   *   hub's words, the tasks not yet changed stay picked, and Try again goes
   *   on from there.
   *
   * Move offers only the stages every picked task may enter; Label takes a
   * label typed (written as the sheet writes one, `labelOf`) or one the
   * project's tasks carry; Archive stands enabled only when every picked
   * task is done or dropped.
   */
  import {
    labelOf,
    type Stage,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconArchive,
    IconChevronDown,
    IconClose,
    IconTrash,
  } from "#lib/icons.js";

  let {
    picked,
    stages,
    labels,
    allowedFrom,
    dropTo,
    run,
    onmove,
    onlabel,
    onarchive,
    ondrop,
    onretry,
    onclear,
  }: {
    picked: TaskSummary[];
    stages: Stage[];
    /** Every label in the project. */
    labels: string[];
    allowedFrom: (stage: string) => Set<string>;
    /** The change in flight, or where it stopped; null while none is. */
    run: BulkRun | null;
    onmove: (stage: string) => void;
    onlabel: (label: string) => void;
    onarchive: () => void;
    /** The project's dropped stage, which Drop moves to; null when its stages have none. */
    dropTo: string | null;
    ondrop: (reason: string) => void;
    onretry: () => void;
    onclear: () => void;
  } = $props();

  const busy = $derived(run !== null && run.failed === null);
  /** The stages every picked task may enter. */
  const movable = $derived(
    stages.filter(
      (stage) =>
        stage.kind !== "dropped" &&
        picked.length > 0 &&
        picked.every(
          (task) =>
            task.stage !== stage.name && allowedFrom(task.stage).has(stage.name)
        )
    )
  );
  const closedAll = $derived(
    picked.length > 0 &&
      picked.every((task) => task.kind === "done" || task.kind === "dropped")
  );
  /** What Drop would stop: the picked tasks with an attempt working. */
  const running = $derived(picked.filter((task) => task.liveAttempt));
  let reason = $state("");
  let dropOpen = $state(false);

  let labelOpen = $state(false);
  /** The label typed in Label's field. */
  let typed = $state("");
  const labelList = `bulk-labels-${Math.random().toString(36).slice(2, 8)}`;
  /** Puts `text` on every picked task, as the sheet writes a label (`labelOf`). */
  function label(text: string) {
    const next = labelOf(text);
    if (next) {
      labelOpen = false;
      typed = "";
      onlabel(next);
    }
  }
</script>

<div
  data-floating
  data-slot="bulk"
  aria-label="Selected tasks"
  class="fixed inset-x-space-3 bottom-(--off-bottom) z-40 flex min-h-(--min-h) w-fit flex-wrap items-center justify-center gap-space-1 mx-auto border border-border-control rounded-lg bg-surface-raised shadow-overlay py-space-1 pr-space-1 pl-space-3 max-phone:bottom-(--off-bottom-phone)"
  role="toolbar"
  style:--off-bottom="calc(var(--space-5) + var(--safe-bottom, 0px))"
  style:--off-bottom-phone={"calc(var(--c-composer-panel) + var(--space-4) + var(--safe-bottom) + var(--space-2))"}
  style:--min-h="calc(var(--c-btn-h-sm) + var(--space-2))"
>
  {#if run}
    <!-- The change in flight, drawn where it was asked for. -->
    <span
      class="mark-line inline-flex items-center gap-space-2 pe-space-2 type-label text-ink-strong"
      role="status"
    >
      <TaskRing done={run.done} size="sm" total={run.total} />
      {#if run.failed}
        <span data-slot="failed" class="text-status-fail-ink"
          >{run.verb} stopped at {run.failed.id}: {run.failed.text}</span
        >
      {:else}
        <span
          >{run.verb}
          <span data-slot="num" class="num"
            >{Math.min(run.done + 1, run.total)}</span
          >
          of <span data-slot="num" class="num">{run.total}</span></span
        >
      {/if}
    </span>
    {#if run.failed}
      <Button onclick={onretry} press="pressable" size="sm" variant="outline"
        >Try again</Button
      >
      <Button
        aria-label="Clear the selection"
        onclick={onclear}
        size="icon-sm"
        variant="ghost"><IconClose /></Button
      >
    {/if}
  {:else}
    <span data-slot="count" class="pe-space-2 type-label text-ink-strong"
      ><span data-slot="num" class="num">{picked.length}</span> selected</span
    >
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            disabled={busy || movable.length === 0}
            size="sm"
            variant="ghost"><span>Move to</span><IconChevronDown /></Button
          >
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-auto min-w-40">
        {#each movable as stage (stage.name)}
          <DropdownMenu.Item onSelect={() => onmove(stage.name)}
            >{stageLabel(stage.name)}</DropdownMenu.Item
          >
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <Popover.Root bind:open={labelOpen}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} disabled={busy} size="sm" variant="ghost"
            ><span>Label</span><IconChevronDown /></Button
          >
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="start" class="w-64" side="top">
        <!-- A label typed, as the sheet's label editor takes one, or one the
             project's tasks already carry. -->
        <form
          class="flex gap-space-2 p-space-1"
          onsubmit={(event) => {
            event.preventDefault();
            label(typed);
          }}
        >
          <Input
            aria-label="Label to add"
            autocomplete="off"
            list={labelList}
            placeholder="label"
            bind:value={typed}
          />
          <datalist id={labelList}>
            {#each labels as each (each)}
              <option value={each}></option>
            {/each}
          </datalist>
          <Button disabled={!labelOf(typed)} size="sm" type="submit"
            >Label {picked.length}</Button
          >
        </form>
        {#if labels.length > 0}
          <!-- literal: 14rem -->
          <ul
            data-slot="known"
            class="mx-0 mt-space-1 mb-0 flex max-h-(--max-h) list-none flex-col overflow-y-auto p-0"
            aria-label="The project's labels"
            style:--max-h="14rem"
          >
            {#each labels as each (each)}
              <li>
                <button
                  class="kit-item w-full text-start"
                  onclick={() => label(each)}
                  type="button"><span>{each}</span></button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </Popover.Content>
    </Popover.Root>
    <Button
      disabled={busy || !closedAll}
      onclick={onarchive}
      size="sm"
      title={closedAll ? undefined : "Only done or dropped tasks are archived"}
      variant="ghost"><IconArchive /><span>Archive</span></Button
    >
    <Popover.Root bind:open={dropOpen}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            disabled={busy || dropTo === null}
            size="sm"
            title={dropTo === null
              ? "The project's stages have no dropped stage"
              : undefined}
            variant="ghost"><IconTrash /><span>Drop</span></Button
          >
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="end" class="w-80" side="top">
        <form
          data-slot="drop"
          class="flex flex-col gap-space-2 p-space-1"
          onsubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) {
              ondrop(reason.trim());
              reason = "";
              dropOpen = false;
            }
          }}
        >
          {#if running.length > 0}
            <!-- What decides it: the work Drop would stop, by name. -->
            <p class="type-meta text-status-attn-ink">
              {running.length === 1
                ? "This one is"
                : `These ${running.length} are`}
              still running; dropping stops {running.length === 1
                ? "its attempt"
                : "their attempts"} mid-turn:
            </p>
            <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
              {#each running as task (task.id)}
                <li class="flex min-w-0 items-baseline gap-space-2">
                  <span
                    class="flex-none type-meta font-(family-name:--font-mono) liga-none text-ink-muted"
                    >{task.id}</span
                  >
                  <span class="min-w-0 truncate type-label text-ink-strong"
                    >{task.title}</span
                  >
                  {#if task.attempts[0]}
                    <a
                      data-slot="session"
                      class="ms-auto flex-none type-meta text-link-ink"
                      href="/session/{task.attempts[0].instanceId}"
                      >its session</a
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <label class="type-label text-ink-strong" for="bulk-reason"
            >Why {picked.length === 1 ? "it's" : `these ${picked.length} are`} dropped</label
          >
          <Input
            autocomplete="off"
            id="bulk-reason"
            placeholder="One reason for all of them"
            bind:value={reason}
          />
          <Button
            disabled={!reason.trim()}
            size="sm"
            type="submit"
            variant="destructive"
            >Drop {picked.length}{running.length > 0
              ? `, ${running.length} still running`
              : ""}</Button
          >
        </form>
      </Popover.Content>
    </Popover.Root>
    <Button
      aria-label="Clear the selection"
      onclick={onclear}
      size="icon-sm"
      variant="ghost"><IconClose /></Button
    >
  {/if}
</div>
