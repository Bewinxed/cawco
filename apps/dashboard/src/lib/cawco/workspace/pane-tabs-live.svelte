<script lang="ts">
  import { untrack } from "svelte";
  /**
   * The session strip as a group's head draws it (PaneTabs), its
   * conversations the board holds (tab-switch-seed.ts, written by the
   * states file's `beforeEach`), with a switch's come-forward drawn the way
   * `forward` names (fluid-tabs/forward-style.ts). A press on a tab chooses
   * it in this group, as the workspace would; `at` is the tab chosen as it
   * opens, `count` how many tabs the group holds. `again` (an action dial's
   * count) opens the strip anew.
   */
  import {
    type ForwardStyle,
    provideForwardStyle,
  } from "#lib/components/ui/fluid-tabs/forward-style.js";
  import PaneTabs from "./PaneTabs.svelte";
  import { switchIds } from "./tab-switch-seed";
  import type { LeafNode } from "./workspace.svelte";

  let {
    forward = "every",
    count = 29,
    at = 14,
    again = 0,
  }: {
    /** How the switch's come-forward is drawn. */
    forward?: ForwardStyle;
    /** How many tabs the group holds. */
    count?: number;
    /** The tab chosen as it opens, from the first. */
    at?: number;
    /** Presses of Start again. */
    again?: number;
  } = $props();

  // Read as the strip mounts: the track reads it once.
  provideForwardStyle(untrack(() => forward));

  const ids = $derived(switchIds(count));
  /** The tab chosen: `at` until a press picks another (the workspace's own state). */
  let active = $derived(ids[Math.min(Math.max(0, at), ids.length - 1)]);
  const leaf = $derived<LeafNode>({
    id: "tab-switch",
    t: "l",
    tabs: ids,
    active,
  });

  /**
   * A press on a tab chooses it in this group: the strip's own choice goes
   * to the workspace, which holds no such group. A press on a close control
   * closes nothing here.
   */
  function choose(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const id = target
      ?.closest('[data-slot="tab"]')
      ?.querySelector("[data-session-tab]")
      ?.getAttribute("data-session-tab");
    if (!id || id === active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!target?.closest('[data-slot="tclose"]') && ids.includes(id)) {
      active = id;
    }
  }
</script>

{#key again}
  <div
    class="@container/leaf flex flex-col bg-surface-shelf pt-space-7"
    data-slot="group"
    onclickcapture={choose}
  >
    <PaneTabs {leaf} />
    <div class="h-32 bg-surface-recess"></div>
  </div>
{/key}
