<script lang="ts">
  /** An on/off setting: the switch, its label, and what the current state means. */
  import type { Snippet } from "svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";

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

<div data-slot="row" class="flex items-start gap-space-3">
  <Switch
    align="first-line"
    {disabled}
    {id}
    onCheckedChange={onchange}
    bind:checked
  />
  <span class="flex min-w-0 flex-col gap-space-row">
    <label
      data-slot="switch-field-label"
      class="type-label text-ink-strong"
      for={id}>{label}</label
    >
    {#if typeof hint === "string"}
      <span class="type-meta max-w-c-measure text-ink-muted">{hint}</span>
    {:else if hint}
      <span class="type-meta max-w-c-measure text-ink-muted"
        >{@render hint()}</span
      >
    {/if}
  </span>
</div>
