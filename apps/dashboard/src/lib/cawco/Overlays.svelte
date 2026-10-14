<script lang="ts">
  /**
   * What every surface of the app stands in, the full app (Shell) and an
   * artifact alone in its tab (routes/+layout): the one tooltip provider,
   * so every tooltip shares its delay and its skip, and the one lightbox a
   * thumbnail opens into (a transcript's picture, a pin's picture).
   */
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Lightbox from "./transcript/Lightbox.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<Tooltip.Provider>
  {@render children()}
  <Lightbox />
</Tooltip.Provider>
