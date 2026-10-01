<script lang="ts">
  /** An on/off setting: the switch, its label, and what the current state means. */
  import type { Snippet } from "svelte";
  import { Switch } from "$lib/components/ui/switch";

  let {
    id,
    label,
    checked = $bindable(false),
    disabled = false,
    onchange,
    hint,
  }: {
    id: string;
    label: string;
    checked?: boolean;
    disabled?: boolean;
    onchange?: (next: boolean) => void;
    hint?: Snippet | string;
  } = $props();
</script>

<div class="row">
  <Switch {disabled} {id} onCheckedChange={onchange} bind:checked />
  <span class="copy">
    <label class="label" for={id}>{label}</label>
    {#if typeof hint === 'string'}
      <span class="hint">{hint}</span>
    {:else if hint}
      <span class="hint">{@render hint()}</span>
    {/if}
  </span>
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .row :global([data-slot="switch"]) {
    margin-top: 1px;
  }
  .copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label {
    font: var(--type-label);
    color: var(--ink-strong);
    cursor: pointer;
  }
  .hint {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
