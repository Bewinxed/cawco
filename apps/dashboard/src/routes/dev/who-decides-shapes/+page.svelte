<script lang="ts">
  /**
   * WHO DECIDES, SHAPING FRAMES (dev only, throwaway): the Who decides pane
   * alone, at the width it has on a 1440 screen beside the sidebar and
   * Configure's rail (920px), on mock records (fixtures.ts). `?shape=team|kinds|calls`, `?state=` the one
   * state where a shape's flow differs (team: move, kinds: pick, calls:
   * reroute).
   */
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { page } from "$app/state";
  import ShapeCalls from "./ShapeCalls.svelte";
  import ShapeKinds from "./ShapeKinds.svelte";
  import ShapeTeam from "./ShapeTeam.svelte";

  // His scheme is dark; `?scheme=light` draws the other.
  $effect(() => {
    document.documentElement.classList.toggle(
      "dark",
      page.url.searchParams.get("scheme") !== "light"
    );
  });
  const shape = $derived(page.url.searchParams.get("shape") ?? "team");
  const state = $derived(page.url.searchParams.get("state"));
</script>

<Tooltip.Provider>
  <div class="min-h-dvh bg-surface-recess px-space-5 pt-space-4 pb-space-6">
    <div class="w-[920px]">
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
