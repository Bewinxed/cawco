<script lang="ts">
  /** A recessed well for text read back to the operator: a rule or hook's sentence. */
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- literal: 72ch, 12px -->
<p
  data-slot="well"
  aria-live="polite"
  class="max-w-(--measure) py-(--well-py) px-space-4 rounded-md bg-surface-recess type-body text-ink-strong transition-[background-color,color] dur-pop ease-out"
  style:--measure="72ch"
  style:--well-py="12px"
>
  {@render children()}
</p>
