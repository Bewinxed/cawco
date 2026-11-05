<script lang="ts">
  /**
   * The design graph with the dials an agent put on the routine form,
   * where the person tries them: `?at=glass` hangs them from the bar's
   * glass, `?number=field` or `?number=slider` draws a number dial in that form, `?face=dials`
   * opens on them, `?turned` with two of them turned, `?menu` with a second component
   * on its way, so the title is the components' menu.
   */
  import { ROUTINE_DIALS } from "#lib/cawco/graph/bench/fixture.js";
  import GraphBench from "#lib/cawco/graph/bench/GraphBench.svelte";
  import { page } from "$app/state";

  const query = page.url.searchParams;
  const NUMBER_FORMS = ["pill", "field", "slider"] as const;
</script>

<GraphBench
  also={query.has("menu")
    ? ["apps/dashboard/src/lib/cawco/routines/RoutineRow.stories.ts"]
    : []}
  dials={query.get("dials") === "none" ? [] : ROUTINE_DIALS}
  dialsAt={query.get("at") === "glass" ? "glass" : "face"}
  face={query.get("face") === "dials" ? "dials" : undefined}
  numberForm={NUMBER_FORMS.find((one) => one === query.get("number")) ?? "pill"}
  turned={query.has("turned") ? { radius: 4, ink: "#1f5f7a" } : {}}
/>
