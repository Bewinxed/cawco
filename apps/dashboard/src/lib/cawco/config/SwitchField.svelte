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

<!-- literal: 10px -->
<div
  data-slot="row"
  class="flex items-start gap-(--row-gap)"
  style:--row-gap="10px"
>
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
      class="type-label cursor-pointer text-ink-strong"
      for={id}>{label}</label
    >
    {#if typeof hint === "string"}
      <!-- literal: 72ch -->
      <span
        class="type-meta max-w-(--measure) text-ink-muted"
        style:--measure="72ch">{hint}</span
      >
    {:else if hint}
      <!-- literal: 72ch -->
      <span
        class="type-meta max-w-(--measure) text-ink-muted"
        style:--measure="72ch">{@render hint()}</span
      >
    {/if}
  </span>
</div>
