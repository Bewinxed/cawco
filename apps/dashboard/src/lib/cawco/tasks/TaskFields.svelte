<script lang="ts">
  /**
   * A task's own fields: the front matter keys its project uses (priority,
   * due, whatever an agent or you wrote there), each a key and its value, as
   * the hub reads them (`extra`: a scalar or a list). A value is edited where
   * it stands, on a click; a list is edited as its items with commas between.
   * "Add field" takes a key and a value. The keys are the project's, so
   * nothing here knows them. The hub takes a key out when it is set to "".
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconPlus } from "#lib/icons.js";

  let {
    fields,
    onsave,
  }: {
    fields: Record<string, string | string[]>;
    /** Sets keys; "" takes its key out. Throws the hub's refusal. */
    onsave: (change: Record<string, string | string[]>) => Promise<void>;
  } = $props();

  let editing = $state<string | null>(null);
  let draft = $state("");
  let adding = $state(false);
  let newKey = $state("");
  let newValue = $state("");
  let problem = $state<string | null>(null);

  const said = (value: string | string[]) =>
    Array.isArray(value) ? value.join(", ") : value;

  async function save(change: Record<string, string | string[]>) {
    problem = null;
    try {
      await onsave(change);
    } catch (error) {
      problem = failureWords(error);
    }
  }
  async function commit(key: string) {
    const was = fields[key];
    const text = draft.trim();
    editing = null;
    if (text === said(was)) {
      return;
    }
    const next = Array.isArray(was)
      ? text
          .split(",")
          .map((each) => each.trim())
          .filter(Boolean)
      : text;
    await save({ [key]: next.length > 0 ? next : "" });
  }
  async function add() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (key && newValue.trim()) {
      await save({ [key]: newValue.trim() });
    }
    adding = false;
    newKey = "";
    newValue = "";
  }
</script>

<section class="part">
  <h3 class="kit-section-head">Fields</h3>
  {#if Object.keys(fields).length > 0}
    <dl data-slot="grid" class="grid">
      {#each Object.entries(fields) as [key, value] (key)}
        <dt class="key">{key}</dt>
        <dd data-slot="value" class="value">
          {#if editing === key}
            <input
              data-slot="task-fields-field"
              aria-label={key}
              class="field"
              onblur={() => commit(key)}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(key);
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  editing = null;
                }
              }}
              bind:value={draft}
              {@attach (node) => node.focus()}
            />
          {:else}
            <button
              data-slot="shown"
              class="shown press-tint focus-inset"
              onclick={() => {
                editing = key;
                draft = said(value);
              }}
              title="Edit {key}"
              type="button">{said(value)}</button
            >
            <Button
              data-drop
              aria-label="Remove {key}"
              class="drop"
              onclick={() => save({ [key]: "" })}
              size="icon-xs"
              variant="ghost"><IconClose /></Button
            >
          {/if}
        </dd>
      {/each}
    </dl>
  {:else if !adding}
    <p class="hint">
      No fields yet. A field is any key the project uses, like priority or due.
    </p>
  {/if}
  {#if adding}
    <form
      class="new"
      onsubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <input
        data-slot="task-fields-field"
        aria-label="Field name"
        class="field key-in"
        placeholder="name"
        bind:value={newKey}
        {@attach (node) => node.focus()}
      />
      <input
        data-slot="task-fields-field"
        aria-label="Field value"
        class="field"
        placeholder="value"
        bind:value={newValue}
      />
      <Button size="xs" type="submit" variant="outline">Add</Button>
      <Button
        onclick={() => {
          adding = false;
        }}
        size="xs"
        variant="ghost">Cancel</Button
      >
    </form>
  {:else}
    <Button
      class="self-start text-muted-foreground"
      onclick={() => {
        adding = true;
      }}
      size="xs"
      variant="ghost"><IconPlus /><span>Add field</span></Button
    >
  {/if}
  <RowFault reason={problem} />
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .grid {
    display: grid;
    /* The Relations' column, so the two parts' values stand on one line. */
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: var(--space-1) var(--space-2);
    margin: 0;
  }
  .key {
    padding-block-start: var(--space-1);
    font: var(--type-code);
    font-variant-ligatures: none;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .value {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    margin: 0;
  }
  .shown {
    flex: 1 1 auto;
    min-inline-size: 0;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: var(--type-body);
    color: var(--ink-strong);
    text-align: start;
    overflow-wrap: anywhere;
    cursor: text;
  }
  @media (hover: hover) and (pointer: fine) {
    .shown:hover {
      background: var(--surface-hover);
    }
  }
  .value :global(.drop) {
    opacity: 0;
  }
  .value:hover :global(.drop),
  .value :global(.drop:focus-visible) {
    opacity: 1;
  }
  @media (pointer: coarse) {
    .value :global(.drop) {
      opacity: 1;
    }
  }
  .field {
    flex: 1 1 auto;
    min-inline-size: 0;
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .key-in {
    flex: 0 1 6rem;
    font: var(--type-code);
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
