<script lang="ts">
  /**
   * What every surface of the app stands in, the full app (Shell) and an
   * artifact alone in its tab (routes/artifact/[id]): the one lightbox a
   * thumbnail opens into (a transcript's picture, a pin's picture).
   */
  import type { Snippet } from "svelte";
  import Lightbox from "./lightbox/Lightbox.svelte";

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<Lightbox />
