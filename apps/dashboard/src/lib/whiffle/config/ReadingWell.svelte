<script lang="ts">
  /** A recessed well for text read back to the operator: a rule or hook's sentence. */
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<p aria-live="polite" class="well">{@render children()}</p>

<style>
  .well {
    max-width: 72ch;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    font: var(--type-body);
    color: var(--ink-strong);
    transition:
      background-color 240ms cubic-bezier(0.16, 1, 0.3, 1),
      color 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }
</style>
