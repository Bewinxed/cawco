<script lang="ts">
  /**
   * The design graph with the controls an agent put on the routine form,
   * where the person tries them: `?face=dials` opens on them, `?turned`
   * with two of them turned, `?dials=none` with none, `?menu` with a second
   * component on its way, so the title is the components' menu, `?props`
   * with the form's props on the Dials card, written to the bench's copy
   * of its states file, `?stale` with the hub's link down (Not live).
   */
  import { ROUTINE_DIALS_GROUPED } from "#lib/cawco/graph/bench/fixture.js";
  import GraphBench from "#lib/cawco/graph/bench/GraphBench.svelte";
  import { page } from "$app/state";

  const query = page.url.searchParams;
</script>

<GraphBench
  also={query.has("menu")
    ? ["apps/dashboard/src/lib/cawco/routines/RoutineRow.stories.ts"]
    : []}
  dials={query.get("dials") === "none" ? [] : ROUTINE_DIALS_GROUPED}
  face={query.get("face") === "dials" ? "dials" : undefined}
  props={query.has("props")}
  stale={query.has("stale")}
  turned={query.has("turned") ? { radius: 4, fill: "#e8f1ee" } : {}}
/>
