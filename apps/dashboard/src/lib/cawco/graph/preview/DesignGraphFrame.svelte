<script lang="ts">
  /**
   * The design graph in a frame of its own (its states files'): a window's
   * height at the frame's width, so the surface lays itself out as it does
   * in the panel, holding the routine form and the roster from their own
   * states files.
   */
  import { screenHeight } from "@cawco/core/stage";
  import type { ComponentProps } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import DesignGraph from "../DesignGraph.svelte";
  import { roster, routineForm } from "../reviews";

  let {
    arrangement,
    ask,
    stale = false,
    components = "both",
  }: Pick<ComponentProps<typeof DesignGraph>, "arrangement" | "ask" | "stale"> & {
    /** Which components the ask names. */
    components?: "both" | "form" | "roster";
  } = $props();

  const INPUTS = {
    both: [routineForm, roster],
    form: [routineForm],
    roster: [roster],
  };
  let tall = $state(0);
  /** When the agent opened the surface, as the records name it. */
  const opened = new Date();
</script>

<div
  class="h-(--window-h)"
  style:--window-h="{tall}px"
  {@attach frameSize((node: HTMLElement) => {
    tall = screenHeight(node.clientWidth);
  })}
>
  <DesignGraph
    {arrangement}
    {ask}
    inputs={INPUTS[components]}
    recordsAt={opened}
    {stale}
  />
</div>
