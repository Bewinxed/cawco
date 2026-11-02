<script lang="ts">
  import DesignGraph from "#lib/cawco/graph/DesignGraph.svelte";
  import { roster } from "#lib/cawco/graph/roster-review.js";
  import { routineForm } from "#lib/cawco/graph/routine-form-review.js";
  /**
   * The design graph, mounted once with its real records: the routine form
   * and Who decides' roster from their own states files, as an agent opens
   * them with the ask "Judge the Create routine form at Save failed".
   * `?link=lost` draws the hub's link down; `?face=whole` and `?face=move`
   * open the room on the map or the animation, as an ask may name them.
   */
  import { page } from "$app/state";

  const said = page.url.searchParams;
</script>

<svelte:head><title>Design graph</title></svelte:head>

<div class="h-dvh">
  <DesignGraph
    ask={{
      component: "Routine form",
      state: "FailedSave",
      face:
        (["states", "whole", "move"] as const).find(
          (one) => one === said.get("face")
        ) ?? "states",
    }}
    inputs={[routineForm, roster]}
    stale={said.get("link") === "lost"}
  />
</div>
