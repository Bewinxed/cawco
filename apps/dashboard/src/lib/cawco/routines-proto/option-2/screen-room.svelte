<script lang="ts">
  /**
   * A states file's room for the Routines screen: the window's height on
   * the page's ground, as the project page gives the view and what stands
   * beside it. A story's decorator mounts it; the app never does.
   */
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-recess">
  {@render children()}
</div>
