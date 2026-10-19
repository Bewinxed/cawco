<script lang="ts">
  import { fade, scale } from "svelte/transition";

  let { status = "waiting", code = "ABC123" }: { status?: "waiting" | "approved"; code?: string } = $props();
</script>

<div class="pairing">
  {#if status === "waiting"}
    <div class="qr" out:fade={{ duration: 240 }}>{code}</div>
  {:else}
    <div class="face" in:scale={{ duration: 320, start: 0.6 }}>^_^</div>
  {/if}
  <p class="line">{status === "waiting" ? "Scan the code with your phone" : "Paired"}</p>
</div>

<style>
  .pairing { display: grid; justify-items: center; gap: 12px; padding: 16px; inline-size: 300px; }
  .qr, .face { inline-size: 120px; block-size: 120px; display: grid; place-items: center; border-radius: var(--radius); background: light-dark(#f1f1f4, #24242a); font: 600 18px/1 ui-monospace, monospace; }
  .line { margin: 0; font: 400 14px/1.4 system-ui, sans-serif; }
</style>
