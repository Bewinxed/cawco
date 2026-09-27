<script lang="ts">
  /**
   * A picker as a chip: what is chosen, and a popover listing the rest. Used
   * for the narrowings — machine, project, harness, model — where "every" is
   * the usual answer and the list can be long.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import { IconCheck, IconChevronDown } from "$lib/icons";

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
  <Popover.Trigger aria-label="{label}: {chosen}" class="picker focus-ring">
    <span class="k">{label}</span>
    <span class="v">{chosen}</span>
    <IconChevronDown />
  </Popover.Trigger>
  <Popover.Content align="start" class="max-h-80 w-64 gap-0 overflow-y-auto">
    {#each options as option, index (option.value)}
      {#if option.group && option.group !== options[index - 1]?.group}
        <span class="group">{option.group}</span>
      {/if}
      <button
        class="kit-item item focus-ring"
        onclick={() => {
          onpick(option.value);
          expanded = false;
        }}
        type="button"
      >
        <span class="label">{option.label}</span>
        {#if option.value === value}
          <IconCheck />
        {/if}
      </button>
    {/each}
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
    transition:
      var(--transition-control),
      transform 160ms var(--ease-out);
  }
  :global(.picker:active) {
    transform: scale(var(--press-scale));
  }
  :global(.picker:hover) {
    background: var(--surface-hover);
  }
  :global(.picker svg) {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--ink-muted);
  }
  :global(.picker) .k {
    color: var(--ink-muted);
    font-weight: 400;
  }
  :global(.picker) .v {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 10px;
    text-align: left;
    font: var(--type-label);
    font-weight: 400;
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
    width: 14px;
    height: 14px;
    flex: none;
  }
</style>
