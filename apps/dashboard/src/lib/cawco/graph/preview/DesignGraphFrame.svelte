<script lang="ts">
  /**
   * The design graph in a frame of its own (its states files'): a window's
   * height at the frame's width, so the surface lays itself out as it does
   * in the panel, holding the routine form from its own states file, and
   * the roster beside it when the ask names it too (loaded only then); or,
   * for the surface's own edge states, a states file of one story (the
   * kit's menu) or one whose component throws as it mounts.
   */
  import { screenHeight } from "@cawco/core/stage";
  import type { ComponentProps } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import DesignGraph from "../DesignGraph.svelte";
  import type { ReviewInput } from "../model";
  import { routineForm } from "../routine-form-review";

  let {
    ask,
    stale = false,
    withRoster = false,
    alone = null,
  }: Pick<ComponentProps<typeof DesignGraph>, "ask" | "stale"> & {
    /** Whether the ask names the roster beside the routine form. */
    withRoster?: boolean;
    /** The one component under review in place of the routine form. */
    alone?: ReviewInput | null;
  } = $props();

  let roster = $state<ReviewInput | null>(null);
  $effect(() => {
    if (!withRoster) {
      return;
    }
    let live = true;
    import("../roster-review").then((one) => {
      if (live) {
        ({ roster } = one);
      }
    });
    return () => {
      live = false;
    };
  });
  const inputs = $derived.by(() => {
    if (alone) {
      return [alone];
    }
    return roster ? [routineForm, roster] : [routineForm];
  });
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
  <DesignGraph {ask} {inputs} recordsAt={opened} {stale} />
</div>
