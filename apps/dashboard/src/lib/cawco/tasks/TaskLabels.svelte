<script lang="ts">
  /**
   * A task's labels, edited where they stand: each badge shows its × under
   * the pointer (always on a finger), and "+ label" opens a one-line field
   * offering the project's other labels. Enter adds, Escape puts it away.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { labelOf } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconClose, IconPlus } from "#lib/icons.js";

  let {
    labels,
    known,
    onchange,
  }: {
    labels: string[];
    /** Every label the project's tasks carry, offered as you type. */
    known: string[];
    /** Writes the whole set; throws the hub's refusal. */
    onchange: (next: string[]) => Promise<void>;
  } = $props();

  let adding = $state(false);
  let draft = $state("");
  let problem = $state<string | null>(null);
  const listId = `labels-${Math.random().toString(36).slice(2, 8)}`;
  const offered = $derived(known.filter((each) => !labels.includes(each)));

  async function save(next: string[]) {
    problem = null;
    try {
      await onchange(next);
    } catch (error) {
      problem = failureWords(error);
    }
  }
  async function add() {
    const label = labelOf(draft);
    draft = "";
    adding = false;
    if (label && !labels.includes(label)) {
      await save([...labels, label]);
    }
  }
</script>

<div class="flex flex-wrap items-center gap-space-1">
  {#each labels as label (label)}
    <Badge
      data-task-labels-label
      class="group/label"
      data-label
      gap="tight"
      variant="secondary"
    >
      <span>{label}</span>
      <button
        aria-label="Remove the label {label}"
        class="-me-space-row inline-grid w-0 cursor-pointer place-items-center overflow-hidden border-none border-current bg-transparent p-0 text-inherit opacity-0 transition-[inline-size,opacity] dur-control ease-out group-hover/label:w-icon-sm group-hover/label:opacity-100 focus-visible:w-icon-sm focus-visible:opacity-100 coarse:w-icon-sm coarse:opacity-100"
        data-box
        onclick={() => save(labels.filter((each) => each !== label))}
        type="button"><IconClose class="size-icon-sm" /></button
      >
    </Badge>
  {/each}
  {#if adding}
    <!-- literal: 8rem -->
    <input
      data-slot="task-labels-field"
      aria-label="New label"
      autocomplete="off"
      class="h-c-badge-h w-(--w) rounded-xs border border-border-control bg-surface-raised px-space-1 type-label text-ink-strong"
      list={listId}
      onblur={add}
      onkeydown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          add();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          draft = "";
          adding = false;
        }
      }}
      placeholder="label"
      style:--w="8rem"
      bind:value={draft}
      {@attach (node) => node.focus()}
    />
    <datalist id={listId}>
      {#each offered as label (label)}
        <option value={label}></option>
      {/each}
    </datalist>
  {:else}
    <button
      data-slot="add"
      class="kit-chip touch-hit mark-line inline-flex h-c-badge-h items-center gap-space-row px-space-1 type-label text-ink-muted"
      onclick={() => {
        adding = true;
      }}
      type="button"><IconPlus class="size-icon-sm" /><span>label</span></button
    >
  {/if}
</div>
<RowFault reason={problem} />
