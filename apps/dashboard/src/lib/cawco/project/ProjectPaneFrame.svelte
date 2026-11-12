<script lang="ts">
  /**
   * A states file's project pane: what it wraps stands in the project
   * page's pane inset (pane-inset `PANE_INSET`), as the board and the
   * Decisions tab do on the page. A story's decorator mounts it
   * (pane-frame `inProjectPane`); the app never does.
   */
  import type { Snippet } from "svelte";
  import { PANE_INSET } from "./pane-inset";

  let { children }: { children: Snippet } = $props();
</script>

<div data-slot="pane" class={PANE_INSET}>{@render children()}</div>
