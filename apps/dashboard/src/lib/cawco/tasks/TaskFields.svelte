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

<section class="flex flex-col gap-space-2">
  <h3 class="kit-section-head m-0 min-h-c-btn-h-xs px-0">Fields</h3>
  {#if Object.keys(fields).length > 0}
    <!-- literal: 6rem minmax(0, 1fr). The Relations' column, so the two parts' values stand on one line. -->
    <dl
      data-slot="grid"
      class="m-0 grid grid-cols-(--cols) gap-x-space-2 gap-y-space-1"
      style:--cols="6rem minmax(0, 1fr)"
    >
      {#each Object.entries(fields) as [key, value] (key)}
        <dt class="type-code liga-none wrap-anywhere pt-space-1 text-ink-muted">
          {key}
        </dt>
        <dd
          data-slot="value"
          class="group/value m-0 flex min-w-0 items-center gap-space-1"
        >
          {#if editing === key}
            <input
              data-slot="task-fields-field"
              aria-label={key}
              class="h-c-btn-h-sm min-w-0 flex-auto rounded-sm border border-border-control bg-surface-raised px-space-2 type-body text-ink-strong"
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
              class="press-tint focus-inset min-w-0 flex-auto cursor-text rounded-sm border-none border-current bg-transparent px-space-2 py-space-1 type-body wrap-anywhere text-start text-ink-strong hover:bg-surface-hover"
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
              onclick={() => save({ [key]: "" })}
              reveal="value-hover"
              size="icon-xs"
              variant="ghost"><IconClose /></Button
            >
          {/if}
        </dd>
      {/each}
    </dl>
  {:else if !adding}
    <p class="type-meta text-ink-muted">
      No fields yet. A field is any key the project uses, like priority or due.
    </p>
  {/if}
  {#if adding}
    <form
      class="flex flex-wrap items-center gap-space-1"
      onsubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <!-- literal: 6rem -->
      <input
        data-slot="task-fields-field"
        aria-label="Field name"
        class="h-c-btn-h-sm min-w-0 shrink grow-0 basis-(--basis) rounded-sm border border-border-control bg-surface-raised px-space-2 type-code text-ink-strong"
        placeholder="name"
        style:--basis="6rem"
        bind:value={newKey}
        {@attach (node) => node.focus()}
      />
      <input
        data-slot="task-fields-field"
        aria-label="Field value"
        class="h-c-btn-h-sm min-w-0 flex-auto rounded-sm border border-border-control bg-surface-raised px-space-2 type-body text-ink-strong"
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
    <!-- Add field's glyph on the heading's edge: the button gives back its
         padding (`xs`: px-2) and its border (--hit-edge, its width). -->
    <Button
      class="self-start ms-(--add-edge)"
      onclick={() => {
        adding = true;
      }}
      size="xs"
      style="--add-edge: calc((var(--spacing) * 2 + var(--hit-edge)) * -1)"
      tone="muted"
      variant="ghost"><IconPlus /><span>Add field</span></Button
    >
  {/if}
  <RowFault reason={problem} />
</section>
