<script lang="ts">
  /**
   * The design graph's preview (scripts/design-graph-preview.ts, branch
   * only, until the owner has picked): the real artifact panel in a tab of
   * its own, as `/artifact/<id>` draws it, over a component canvas its
   * script serves on this page's own origin at `?path=`. Its fleet is a
   * stand-in holding that one canvas; the canvas page, its overlay and the
   * artifact's document are the script's.
   */
  import Overlays from "#lib/cawco/Overlays.svelte";
  import { benchFleet } from "#lib/cawco/preview/bench-fleet.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import { setPaneFleet } from "#lib/cawco/preview/pane-fleet.js";
  import { page } from "$app/state";

  const INSTANCE = "design-graph-preview";
  const params = page.url.searchParams;
  const port = Number(
    location.port || (location.protocol === "https:" ? 443 : 80)
  );
  const preview = {
    kind: "preview" as const,
    instanceId: INSTANCE,
    artifact: {
      id: "00000000-0000-4000-8000-00000000d6a1",
      kind: "component" as const,
      name: params.get("name") ?? "Task column",
      ask: params.get("ask") ?? "",
    },
    artifacts: ["00000000-0000-4000-8000-00000000d6a1"],
    origin: location.origin,
    port,
    revision: "design-graph-1",
    source: { port, path: params.get("path") ?? "/" },
    state: "open" as const,
  };
  setPaneFleet(benchFleet(INSTANCE, () => preview, "preview"));
</script>

<svelte:head><title>{preview.artifact.name} · CawCo</title></svelte:head>

<Overlays>
  <div
    class="flex h-dvh flex-col overflow-hidden bg-surface-page p-space-2"
    data-slot="artifact-tab"
  >
    <PreviewPane instanceId={INSTANCE} ownTab />
  </div>
</Overlays>
