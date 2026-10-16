<script lang="ts">
  /**
   * A picker as a chip: what is chosen, and a popover listing the rest. Used
   * for the narrowings — machine, project, harness, model — where "every" is
   * the usual answer and the list can be long. Given `picked`, it holds
   * several: a pick toggles one in or out and the list stays open, and the
   * empty-string option (picked when nothing is) clears them.
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconCheck, IconChevronDown } from "#lib/icons.js";

  let {
    label,
    value = "",
    picked,
    options,
    onpick,
  }: {
    label: string;
    /** The chosen option's value; the empty string is the "every" option. */
    value?: string;
    /** The chosen options' values, when it holds several. */
    picked?: readonly string[];
    /** Options sharing a `group` are listed under that heading. */
    options: { value: string; label: string; group?: string }[];
    onpick: (next: string) => void;
  } = $props();

  let expanded = $state(false);
  const labelOf = (of: string) =>
    options.find((option) => option.value === of)?.label ?? of;
  const isChosen = (of: string) =>
    picked
      ? picked.includes(of) || (of === "" && picked.length === 0)
      : of === value;
  const chosen = $derived(
    picked && picked.length > 0
      ? picked.map(labelOf).join(", ")
      : labelOf(picked ? "" : value)
  );
</script>

<Popover.Root bind:open={expanded}>
  <Popover.Trigger
    data-picker-chip
    aria-label="{label}: {chosen}"
    class="picker-chip mark-line"
  >
    <span class="k">{label}</span>
    <span data-slot="num" class="v num"><MorphText text={chosen} /></span>
    <IconChevronDown />
  </Popover.Trigger>
  <Popover.Content align="start" class="max-h-80 w-64 gap-0 overflow-y-auto">
    <!-- The kit's ghost and pill: the pill is the choice, and a pick takes
         the ghost's place under the pointer while the popover closes. -->
    <div
      aria-label={label}
      aria-multiselectable={picked ? true : undefined}
      class="options"
      role="listbox"
      {@attach highlight({ rows: ".item", selected: '[aria-selected="true"]' })}
    >
      {#each options as option, index (option.value)}
        {#if option.group && option.group !== options[index - 1]?.group}
          <span data-slot="group" class="group">{option.group}</span>
        {/if}
        <button
          data-slot="item"
          aria-selected={isChosen(option.value)}
          class="kit-item item focus-inset"
          onclick={() => {
            onpick(option.value);
            // One of several stays open for the next.
            expanded = picked !== undefined && option.value !== "";
          }}
          role="option"
          type="button"
        >
          <span data-slot="picker-chip-label" class="label">{option.label}</span
          >
          {#if isChosen(option.value)}
            <IconCheck />
          {/if}
        </button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  /* The trigger is bits-ui's element, so its rules are global: under this
     chip's own name. As the bare `.picker` they also drew the New session
     dialog's model panel (ModelSection's `.picker`) once Config had loaded
     them: 32px tall, its rail centred against the list, and the whole panel
     pressed to --press-scale by any press inside it (`:active` holds on every
     ancestor of the pressed element). */
  :global(.picker-chip) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-strong);
    transition: var(--transition-control);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        var(--transition-control),
        transform var(--dur-toggle) var(--ease-out);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.picker-chip:active) {
      transform: scale(var(--press-scale));
    }
  }
  :global(.picker-chip:hover) {
    background: var(--surface-hover);
  }
  :global(.picker-chip svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-muted);
  }
  :global(.picker-chip) .k {
    color: var(--ink-muted);
  }
  :global(.picker-chip) .v {
    min-width: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .options {
    display: flex;
    flex-direction: column;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 10px;
    text-align: left;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .group {
    padding: 8px 10px 4px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
</style>
