<script lang="ts">
  /** The kept move's Play, a bare symbol in a glass group: the dock's head and a phone's timeline at rest share it. */
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import { IconPause, IconPlay } from "#lib/icons.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import { SYMBOL } from "./symbol";

  let { graph }: { graph: DesignGraph } = $props();
</script>

<button
  aria-label={graph.playing ? words.pause : words.play}
  class={SYMBOL}
  data-play
  onclick={() => (graph.playing ? graph.stop() : graph.play())}
  title={graph.playing ? words.pause : words.play}
  type="button"
>
  {#if graph.playing}<IconPause />{:else}<IconPlay />{/if}
</button>
