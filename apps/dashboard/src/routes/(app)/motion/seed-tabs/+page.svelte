<script lang="ts">
  /**
   * Dev only, for a preview against a scratch fleet: opens `?ids=` (comma
   * separated) as one group's tabs in this browser's workspace, the first
   * in front, and goes to it. A preview is an origin of its own, so the
   * storage it writes is the preview's, never the dashboard's. The layout
   * goes to localStorage, the workspace's source, and to the server's copy
   * (lib/cawco/prefs.ts) before the page moves on, so the server draws the
   * strip from the first paint.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";

  const KEY = "cawco-workspace";

  onMount(async () => {
    const ids = (page.url.searchParams.get("ids") ?? "")
      .split(",")
      .filter(Boolean);
    if (ids.length === 0) {
      return;
    }
    const layout = JSON.stringify({
      v: 1,
      root: { t: "l", id: "preview-leaf", tabs: ids, active: ids[0] },
      focusedLeaf: "preview-leaf",
      ctx: {},
    });
    localStorage.setItem(KEY, layout);
    await fetch("/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [KEY]: layout }),
    });
    location.replace(`/session/${ids[0]}`);
  });
</script>
