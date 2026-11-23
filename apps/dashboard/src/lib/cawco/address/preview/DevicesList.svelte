<script lang="ts">
  /**
   * Configure › Devices' rows as they stand today: the paired devices, then
   * the Word address row its caller draws (`children`), then Require
   * paired devices.
   */
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

{#snippet setting(label: string, line: string)}
  <div
    class="flex flex-wrap items-center justify-between gap-space-3 py-space-3"
  >
    <span class="grid gap-space-1">
      <span class="type-label text-tx">{label}</span>
      <span class="type-meta text-tx-2">{line}</span>
    </span>
  </div>
{/snippet}

<div class="grid [&>div]:border-ui [&>div:not(:last-child)]:border-b">
  {@render setting("Paired devices", "3 devices can open this dashboard")}
  {@render children()}
  {@render setting(
    "Require paired devices",
    "Off: anyone on your network can open this dashboard"
  )}
</div>
