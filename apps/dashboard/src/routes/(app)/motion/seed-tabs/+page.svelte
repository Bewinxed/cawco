<script lang="ts">
  /**
   * Dev only, for a preview against a scratch fleet: opens `?ids=` (comma
   * separated) as one group's tabs in this browser's workspace, the first
   * in front, and goes to it. A preview is an origin of its own, so the
   * storage it writes is the preview's, never the dashboard's. The layout
   * goes to localStorage, the workspace's source, and to the server's copy
   * (lib/platform/prefs.ts) before the page moves on, so the server draws the
   * strip from the first paint.
   *
   * Opened with no ids, it says what to pass and takes them by hand (DESIGN.md,
   * The Empty Starts Work Rule): the field is the parameter, so Open asks for
   * this page again with `?ids=` as typed, a whole load, and the page goes on
   * from there.
   */
  import { onMount } from "svelte";
  import { leaveThePage } from "#lib/cawco/leaving.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconWindow } from "#lib/icons.js";
  import { store } from "#lib/platform/storage.js";
  import { page } from "$app/state";

  const KEY = "cawco-workspace";

  const ids = $derived(
    (page.url.searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );

  onMount(async () => {
    if (ids.length === 0) {
      return;
    }
    const layout = JSON.stringify({
      v: 1,
      root: { t: "l", id: "preview-leaf", tabs: ids, active: ids[0] },
      focusedLeaf: "preview-leaf",
      ctx: {},
    });
    store("local", KEY, layout);
    await fetch("/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [KEY]: layout }),
    });
    leaveThePage(() => location.replace(`/session/${ids[0]}`));
  });
</script>

{#if ids.length === 0}
  <!-- The action stands the block's width (`fill`), so the field takes what
       the row leaves it at a phone's width rather than its own 480px. -->
  <EmptyState
    actionWidth="fill"
    icon={IconWindow}
    pad="pane"
    title="No sessions to open"
  >
    {#snippet line()}
      Pass their ids as <code>?ids=</code>, comma separated: they open as one
      group's tabs, the first in front.
    {/snippet}
    {#snippet action()}
      <form
        class="flex w-c-bench-field-w max-w-full gap-space-2"
        data-sveltekit-reload
        method="get"
      >
        <Input
          aria-label="Session ids"
          class="flex-1"
          face="mono"
          measure="shrink"
          name="ids"
          required
        />
        <Button label="Open as tabs" type="submit" />
      </form>
    {/snippet}
  </EmptyState>
{/if}
