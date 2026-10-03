<script lang="ts">
  /**
   * A picker as a chip: what is chosen, and a popover listing the rest. Used
   * for the narrowings — machine, project, harness, model — where "every" is
   * the usual answer and the list can be long.
   */
  import { TextMorph } from "torph/svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconCheck, IconChevronDown } from "#lib/icons.js";

  let {
    label,
    value,
    options,
    onpick,
  }: {
    label: string;
    /** The chosen option's value; the empty string is the "every" option. */
    value: string;
    /** Options sharing a `group` are listed under that heading. */
    options: { value: string; label: string; group?: string }[];
    onpick: (next: string) => void;
  } = $props();

  let expanded = $state(false);
  const chosen = $derived(
    options.find((option) => option.value === value)?.label ?? value
  );
</script>

<Popover.Root bind:open={expanded}>
  <Popover.Trigger aria-label="{label}: {chosen}" class="picker">
    <span class="k">{label}</span>
    <span class="v num"><TextMorph text={chosen} /></span>
    <IconChevronDown />
  </Popover.Trigger>
  <Popover.Content align="start" class="max-h-80 w-64 gap-0 overflow-y-auto">
    <!-- The kit's ghost and pill: the pill is the choice, and a pick takes
         the ghost's place under the pointer while the popover closes. -->
    <div
      aria-label={label}
      class="options"
      role="listbox"
      {@attach highlight({ rows: '.item', selected: '[aria-selected="true"]' })}
    >
      {#each options as option, index (option.value)}
        {#if option.group && option.group !== options[index - 1]?.group}
          <span class="group">{option.group}</span>
        {/if}
        <button
          aria-selected={option.value === value}
          class="kit-item item focus-inset"
          onclick={() => {
          onpick(option.value);
          expanded = false;
        }}
          role="option"
          type="button"
        >
          <span class="label">{option.label}</span>
          {#if option.value === value}
            <IconCheck />
          {/if}
        </button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  :global(.picker) {
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
    :global(.picker:active) {
      transform: scale(var(--press-scale));
    }
  }
  :global(.picker:hover) {
    background: var(--surface-hover);
  }
  :global(.picker svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-muted);
  }
  :global(.picker) .k {
    color: var(--ink-muted);
  }
  :global(.picker) .v {
    min-width: 0;
    overflow: hidden;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
</style>
