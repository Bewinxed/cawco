<script lang="ts">
  /**
   * The design graph with the dials an agent put on the routine form,
   * where the person tries them: `?at=glass` hangs them from the bar's
   * glass, `?number=slider` draws a number dial as a slider, `?face=dials`
   * opens on them.
   */
  import { ROUTINE_DIALS } from "#lib/cawco/graph/bench/fixture.js";
  import GraphBench from "#lib/cawco/graph/bench/GraphBench.svelte";
  import { page } from "$app/state";

  const query = page.url.searchParams;
</script>

<GraphBench
  dials={query.get("dials") === "none" ? [] : ROUTINE_DIALS}
  dialsAt={query.get("at") === "glass" ? "glass" : "face"}
  face={query.get("face") === "dials" ? "dials" : undefined}
  numberForm={query.get("number") === "slider" ? "slider" : "field"}
/>
