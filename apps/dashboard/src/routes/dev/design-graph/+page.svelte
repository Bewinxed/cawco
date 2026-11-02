<script lang="ts">
  import DesignGraph, {
    type Arrangement,
  } from "#lib/cawco/graph/DesignGraph.svelte";
  import { roster } from "#lib/cawco/graph/roster-review.js";
  import { routineForm } from "#lib/cawco/graph/routine-form-review.js";
  /**
   * The design graph, mounted once with its real records: the routine form
   * and Who decides' roster from their own states files, as an agent opens
   * them with the ask "Judge the Create routine form at Save failed". The
   * records are the set as it stood when the page opened (`?at=` names
   * another moment). `?arrange=` sets where the states stand on a desk
   * (beside, below, stage); `?link=lost` draws the hub's link down; `?face=whole` and `?face=move`
   * open the room on the whole set or the move, as an ask may name them.
   */
  import { page } from "$app/state";

  const ARRANGEMENTS: readonly Arrangement[] = ["beside", "below", "stage"];
  const said = page.url.searchParams;
  const arrangement =
    ARRANGEMENTS.find((one) => one === said.get("arrange")) ?? "beside";
  const at = said.get("at");
  const recordsAt = at ? new Date(at) : new Date();
</script>

<svelte:head><title>Design graph</title></svelte:head>

<div class="h-dvh">
  <DesignGraph
    {arrangement}
    ask={{
      component: "Routine form",
      state: "FailedSave",
      face:
        (["states", "whole", "move"] as const).find(
          (one) => one === said.get("face")
        ) ?? "states",
    }}
    inputs={[routineForm, roster]}
    {recordsAt}
    stale={said.get("link") === "lost"}
  />
</div>
