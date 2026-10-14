<script lang="ts">
  /**
   * The app around a page: the Shell (rail, top bar, tab strips, the session
   * surface) and the stages canvases stand on. Every route but the bare ones
   * (an artifact in its own tab, a custom view) is in this group.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import CanvasStages from "#lib/cawco/canvas/CanvasStages.svelte";
  import { GROUPS } from "#lib/cawco/config/sections.js";
  import { PREFETCHES as CAW_PREFETCHES } from "#lib/cawco/home/Caw.svelte";
  import { leaving, plan, route } from "#lib/cawco/motion/route.svelte.js";
  import { departAll } from "#lib/cawco/motion/share.svelte.js";
  import Shell from "#lib/cawco/Shell.svelte";
  import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { onNavigate } from "$app/navigation";
  import type { LayoutServerData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutServerData } =
    $props();

  /** Configure's sections in the rail's order, top to bottom. */
  const SECTION_ORDER = GROUPS.flatMap(({ sections }) =>
    sections.map((section) => section.slug as string)
  );
  const narrow = new MediaQuery(NARROW_QUERY);

  // Every route change moves the page the way the navigation went; the
  // sidebar, the top bar and the tab strips sit outside the keyed page and
  // hold still. The plan is written here, before the DOM changes, and read
  // by the page's own transitions (motion/route.svelte.ts). Same-page param
  // changes and moves between conversations re-key nothing, so they are
  // instant: the workspace store shows a pane and writes the URL with
  // `pushState`, which runs no navigation at all.
  onNavigate((navigation) => {
    if (navigation.shallow) {
      return;
    }

    if (!(navigation.from && navigation.to)) {
      return;
    }
    // What the page going away shares with the page arriving hands itself
    // over: its rects are taken now, before the DOM changes.
    departAll();
    leaving(navigation.from.url);
    route.travel = plan({
      from: navigation.from.url.pathname,
      to: navigation.to.url.pathname,
      history: navigation.type === "popstate" ? Math.sign(navigation.delta) : 0,
      rtl: getComputedStyle(document.documentElement).direction === "rtl",
      narrow: narrow.current,
      sections: SECTION_ORDER,
    });
  });
</script>

<svelte:head>
  <!-- Caw's runtime and his waiting file go to the HTTP cache at idle
       priority, so a wait that outlasts its grace shows him without fetching. -->
  {#each CAW_PREFETCHES as href (href)}
    <link crossorigin="anonymous" {href} rel="prefetch">
  {/each}
</svelte:head>

<Shell railWidth={data.railWidth}> {@render children()} </Shell>
<CanvasStages />
