<script lang="ts">
  /**
   * What every surface of the app stands in, the full app (Shell) and an
   * artifact alone in its tab (routes/artifact/[id]): the one tooltip provider,
   * so every tooltip shares its delay and its skip, and the one lightbox a
   * thumbnail opens into (a transcript's picture, a pin's picture).
   */
  import type { Snippet } from "svelte";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Lightbox from "./lightbox/Lightbox.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<Tooltip.Provider>
  {@render children()}
  <Lightbox />
</Tooltip.Provider>
