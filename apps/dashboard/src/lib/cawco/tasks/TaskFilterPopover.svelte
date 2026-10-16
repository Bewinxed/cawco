<script lang="ts">
  /**
   * Filter ▾: words the hub finds in a task's id, title or description
   * (task-find.svelte.ts), a label, a delegate type, and any number of
   * field = value pairs, from what the project's tasks carry. Every change
   * lands in the URL (task-filter.ts) and the button says how many stand.
   * The words narrow once the hub answers: while it is asked, Find says so;
   * a refusal is said under it, in the hub's words, with Try again, and the
   * trigger carries the warning glyph until the words read.
   *
   * The strip draws the trigger: whole on a desk, its glyph and count alone
   * on a phone (`compact`). With `anchor` there is no trigger: the popover
   * opens from where it was asked (the head's ⋯ on a phone).
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconChevronDown,
    IconClose,
    IconFilter,
    IconPlus,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { activeCount, NO_FILTER, type TaskFilter } from "./task-filter.js";
  import type { TaskFind } from "./task-find.svelte.js";

  let {
    filter,
    find,
    tasks,
    onchange,
    open = $bindable(false),
    anchor = null,
    compact = false,
  }: {
    filter: TaskFilter;
    /** What the hub found for the words: whether it is asked, and why it refused. */
    find: TaskFind;
    /** Every task, live and archived, for the labels, types and fields there are to pick. */
    tasks: TaskSummary[];
    onchange: (next: TaskFilter) => void;
    open?: boolean;
    /** Opens from here, with no trigger of its own. */
    anchor?: HTMLElement | null;
    /** The trigger as its glyph and count alone. */
    compact?: boolean;
  } = $props();

  const labels = $derived(
    [...new Set(tasks.flatMap((task) => task.labels))].sort()
  );
  const types = $derived(
    [
      ...new Set(
        tasks.flatMap((task) => (task.type === null ? [] : [task.type]))
      ),
    ].sort()
  );
  const fieldKeys = $derived(
    [...new Set(tasks.flatMap((task) => Object.keys(task.fields)))].sort()
  );
  const valuesOf = (key: string) =>
    [
      ...new Set(
        tasks.flatMap((task) =>
          task.fields[key] === undefined ? [] : [task.fields[key]]
        )
      ),
    ].sort();
  const active = $derived(activeCount(filter));
  /** The glyph-only trigger's name, with how many stand. */
  const compactName = $derived(active > 0 ? `Filter, ${active} set` : "Filter");
  /** The field rows: what is set, and one empty row to set another. */
  const rows = $derived<[string, string][]>(
    filter.fields.length > 0 ? filter.fields : [["", ""]]
  );

  function setField(index: number, key: string, value: string) {
    const next = [...rows];
    next[index] = [key, value];
    onchange({ ...filter, fields: next });
  }
</script>

<Popover.Root bind:open>
  {#if !anchor}
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          data-filter-trigger
          {...props}
          aria-label={compact ? compactName : undefined}
          class="filter-trigger pressable"
          size={compact ? "icon-sm" : "sm"}
          title={find.problem ?? undefined}
          variant={active > 0 ? "secondary" : "ghost"}
        >
          {#if find.problem}
            <IconWarningTriangle data-find-problem="" />
          {:else}
            <IconFilter />
          {/if}
          {#if !compact}
            <span>Filter</span>
          {/if}
          {#if active > 0}
            <span data-num data-slot="count" class="count num">{active}</span>
          {/if}
          {#if !compact}
            <IconChevronDown />
          {/if}
        </Button>
      {/snippet}
    </Popover.Trigger>
  {/if}
  <Popover.Content align="end" class="w-80" customAnchor={anchor}>
    <div class="filters">
      <Input
        aria-label="Find a task"
        autocomplete="off"
        oninput={(event) =>
          onchange({ ...filter, q: event.currentTarget.value })}
        placeholder="Find in ids, titles and descriptions…"
        value={filter.q}
      />
      {#if find.finding}
        <span class="finding mark-line" role="status"
          ><Spinner aria-hidden="true" /><span>Finding…</span></span
        >
      {/if}
      <RowFault again={() => find.again()} reason={find.problem} />
      <div data-slot="row" class="row">
        <span data-slot="name" class="name">Label</span>
        <Select.Root
          onValueChange={(value) =>
            onchange({ ...filter, label: value === "any" ? null : value })}
          type="single"
          value={filter.label ?? "any"}
        >
          <Select.Trigger
            data-task-filter-popover-pick
            aria-label="Label"
            class="pick"
            size="sm">{filter.label ?? "Any label"}</Select.Trigger
          >
          <Select.Content>
            <Select.Item label="Any label" value="any" />
            {#each labels as label (label)}
              <Select.Item {label} value={label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div data-slot="row" class="row">
        <span data-slot="name" class="name">Type</span>
        <Select.Root
          onValueChange={(value) =>
            onchange({ ...filter, type: value === "any" ? null : value })}
          type="single"
          value={filter.type ?? "any"}
        >
          <Select.Trigger
            data-task-filter-popover-pick
            aria-label="Type"
            class="pick"
            size="sm">{filter.type ?? "Any type"}</Select.Trigger
          >
          <Select.Content>
            <Select.Item label="Any type" value="any" />
            {#each types as type (type)}
              <Select.Item label={type} value={type} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if fieldKeys.length > 0}
        {#each rows as [key, value], index (index)}
          <div data-slot="row" class="row">
            <Select.Root
              onValueChange={(next) => setField(index, next, "")}
              type="single"
              value={key}
            >
              <Select.Trigger
                data-task-filter-popover-pick
                aria-label="Field"
                class="pick"
                size="sm">{key || "Field"}</Select.Trigger
              >
              <Select.Content>
                {#each fieldKeys as each (each)}
                  <Select.Item label={each} value={each} />
                {/each}
              </Select.Content>
            </Select.Root>
            <span class="eq">=</span>
            <Select.Root
              disabled={!key}
              onValueChange={(next) => setField(index, key, next)}
              type="single"
              {value}
            >
              <Select.Trigger
                data-task-filter-popover-pick
                aria-label="Value"
                class="pick"
                size="sm">{value || "value"}</Select.Trigger
              >
              <Select.Content>
                {#each valuesOf(key) as each (each)}
                  <Select.Item label={each} value={each} />
                {/each}
              </Select.Content>
            </Select.Root>
            {#if key}
              <Button
                aria-label="Remove {key}"
                onclick={() =>
                  onchange({
                    ...filter,
                    fields: filter.fields.filter((_, at) => at !== index),
                  })}
                size="icon-xs"
                variant="ghost"><IconClose /></Button
              >
            {/if}
          </div>
        {/each}
        {#if filter.fields.some(([key, value]) => key && value)}
          <Button
            class="self-start"
            onclick={() =>
              onchange({ ...filter, fields: [...filter.fields, ["", ""]] })}
            size="xs"
            variant="ghost"><IconPlus /><span>Another field</span></Button
          >
        {/if}
      {/if}
      {#if active > 0}
        <Button
          class="self-start"
          onclick={() => onchange({ ...NO_FILTER })}
          size="xs"
          variant="ghost">Clear filters</Button
        >
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .row :global(.pick) {
    flex: 1 1 0;
    min-inline-size: 0;
  }
  .name {
    flex: none;
    inline-size: 3.5rem;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .finding {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .eq {
    flex: none;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 18px;
    block-size: 18px;
    padding-inline: var(--space-1);
    border-radius: var(--radius-xs);
    background: var(--brand-wash);
    font: var(--type-meta);
    color: var(--brand-ink);
  }
</style>
