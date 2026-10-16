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

<div class="labels">
  {#each labels as label (label)}
    <Badge data-task-labels-label class="label" data-label variant="secondary">
      <span>{label}</span>
      <button
        aria-label="Remove the label {label}"
        class="remove"
        data-box
        onclick={() => save(labels.filter((each) => each !== label))}
        type="button"><IconClose /></button
      >
    </Badge>
  {/each}
  {#if adding}
    <input
      data-slot="task-labels-field"
      aria-label="New label"
      autocomplete="off"
      class="field"
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
      class="add kit-chip touch-hit mark-line"
      onclick={() => {
        adding = true;
      }}
      type="button"><IconPlus /><span>label</span></button
    >
  {/if}
</div>
<RowFault reason={problem} />

<style>
  .labels {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .labels :global(.label) {
    gap: 2px;
  }
  .remove {
    display: inline-grid;
    place-items: center;
    inline-size: 0;
    margin-inline-end: -2px;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: none;
    color: inherit;
    opacity: 0;
    cursor: pointer;
    transition:
      inline-size var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-out);
  }
  .remove :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  :global(.label:hover) .remove,
  .remove:focus-visible {
    inline-size: var(--icon-sm);
    opacity: 1;
  }
  @media (pointer: coarse) {
    .remove {
      inline-size: var(--icon-sm);
      opacity: 1;
    }
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    block-size: var(--c-badge-h);
    padding-inline: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .add :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .field {
    inline-size: 8rem;
    block-size: var(--c-badge-h);
    padding-inline: var(--space-1);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
