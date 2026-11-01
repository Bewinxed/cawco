<script lang="ts">
  /**
   * The design graph in a frame of its own (its states file's): the
   * artifact panel's well at the story's width and a real panel's height,
   * the house tooltips' provider round it, as the panel gives it.
   */
  import type { ComponentProps } from "svelte";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import DesignGraph from "./DesignGraph.svelte";
  import type { GraphComponent } from "./graph";

  let {
    graphs,
    start = {},
    layout = {},
    height,
  }: {
    graphs: GraphComponent[];
    start?: ComponentProps<typeof DesignGraph>["start"];
    layout?: ComponentProps<typeof DesignGraph>["layout"];
    /** The well's height in px. */
    height: number;
  } = $props();
</script>

<Tooltip.Provider>
  <div class="h-(--frame-h) w-full" style:--frame-h={`${height}px`}>
    <DesignGraph {graphs} {layout} {start} />
  </div>
</Tooltip.Provider>
