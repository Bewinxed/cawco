<script lang="ts">
  /**
   * The surface ladder's level where this tag stands, in its surface's
   * corner: the level the surface it is drawn in took (ui/elevated `rise`),
   * the page's 0 outside any.
   */
  import { surfaceLevel } from "#lib/components/ui/elevated/surface-level.svelte.js";

  const level = surfaceLevel();
</script>

<span class="absolute end-space-2 top-space-2 text-tx-2 tabular-nums type-meta"
  >level {level}</span
>
