<script lang="ts">
  import type { Snippet } from "svelte";

  /** Children exist in the DOM only while the panel is open (or closing):
   *  a transcript can hold hundreds of collapsed panels, and mounting their
   *  pre blocks and diffs eagerly is what made route renders take seconds. */
  let { open, children }: { open: boolean; children?: Snippet } = $props();

  // Seeded from the initial `open` so a panel that starts open is server-rendered:
  // effects do not run during SSR, so waiting for one would ship it empty.
  // svelte-ignore state_referenced_locally
  let rendered = $state(open);

  $effect.pre(() => {
    if (open) {
      rendered = true;
    }
  });

  // Keep content through the 240ms collapse (app.css `[data-reveal]`) plus slack, then drop it.
  $effect(() => {
    if (!open && rendered) {
      const timer = setTimeout(() => {
        rendered = false;
      }, 260);
      return () => clearTimeout(timer);
    }
  });
</script>

{#if rendered}
  {@render children?.()}
{/if}
