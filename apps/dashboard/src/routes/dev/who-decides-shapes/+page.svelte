<script lang="ts">
  /**
   * WHO DECIDES, SHAPING FRAMES (dev only, throwaway): the Who decides pane
   * alone, at Configure's width (`c-config-max-w`), on mock records
   * (fixtures.ts). `?shape=team|kinds|calls`, `?state=` the one state where
   * a shape's flow differs (team: move, kinds: pick, calls: reroute),
   * `?scheme=light` the other scheme (his is dark).
   */
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { page } from "$app/state";
  import ShapeCalls from "./ShapeCalls.svelte";
  import ShapeKinds from "./ShapeKinds.svelte";
  import ShapeTeam from "./ShapeTeam.svelte";

  const shape = $derived(page.url.searchParams.get("shape") ?? "team");
  const state = $derived(page.url.searchParams.get("state"));
  $effect(() => {
    document.documentElement.classList.toggle(
      "dark",
      page.url.searchParams.get("scheme") !== "light"
    );
  });
</script>

<Tooltip.Provider>
  <div class="min-h-dvh bg-surface-recess px-space-5 pt-space-4 pb-space-6">
    <div class="w-c-config-max-w">
      {#if shape === "kinds"}
        <ShapeKinds {state} />
      {:else if shape === "calls"}
        <ShapeCalls {state} />
      {:else}
        <ShapeTeam {state} />
      {/if}
    </div>
  </div>
</Tooltip.Provider>
