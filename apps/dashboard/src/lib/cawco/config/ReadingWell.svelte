<script lang="ts">
  /** A recessed well for text read back to the operator: a rule or hook's sentence. */
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<p
  data-slot="well"
  aria-live="polite"
  class="max-w-c-measure py-space-3 px-space-4 rounded-md bg-surface-recess type-body text-ink-strong transition-[background-color,color] dur-pop ease-out"
>
  {@render children()}
</p>
