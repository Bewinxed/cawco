<script lang="ts">
  import "../app.css";
  import "#lib/theme.svelte.js";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { ensureConnected } from "#lib/cawco/client.svelte.js";
  import { GROUPS } from "#lib/cawco/config/sections.js";
  import { trackDevicePixel } from "#lib/cawco/device-pixel.js";
  import { PREFETCHES as CAW_PREFETCHES } from "#lib/cawco/home/Caw.svelte";
  import { restWhenHidden } from "#lib/cawco/motion/rest.js";
  import { leaving, plan, route } from "#lib/cawco/motion/route.svelte.js";
  import { departAll } from "#lib/cawco/motion/share.svelte.js";
  import Shell from "#lib/cawco/Shell.svelte";
  import { tabIcon } from "#lib/cawco/tab-icon/tab-icon.svelte.js";
  import { tallestComposer } from "#lib/cawco/transcript/composer-presence.svelte.js";
  import { startUpdateWatch } from "#lib/cawco/updates/update-notice.svelte.js";
  import { trackVisibleViewport } from "#lib/cawco/visible-viewport.svelte.js";
  import { workspace } from "#lib/cawco/workspace/workspace.svelte.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { enableLongPressMenus } from "#lib/utils/longpress.js";
  import { onNavigate } from "$app/navigation";
  import type { LayoutServerData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutServerData } =
    $props();

  /**
   * Where toasts appear. A phone's bottom edge belongs to the composer, so
   * there they drop from the top, under the top bar; the sonner kit carries
   * the narrow placement. A desk keeps the corner.
   */
  const narrowToasts = new MediaQuery("(max-width: 640px)");

  /**
   * On a desk the corner is shared with the composer's Send, so the toasts
   * stand on top of the tallest composer showing: its bottom inset, its
   * measured height, and a step of air. The fleet board keeps its panes
   * mounted under it, so it counts as no composer, like a page with none.
   */
  const composerLift = $derived(
    workspace.activeSessionId === null ? 0 : tallestComposer()
  );
  const toastOffset = $derived(
    composerLift > 0
      ? {
          bottom: `calc(var(--space-4) + var(--safe-bottom) + ${composerLift}px + var(--space-3))`,
        }
      : undefined
  );

  // One socket for the whole app; routes only read the state it fills in.
  onMount(ensureConnected);
  // The update notice's upkeep: an idle old tab reloads, "running on N
  // machines" leaves by itself. The notice itself is a row of Caw's panel.
  onMount(startUpdateWatch);
  // iOS has no right-click; a held press is its context menu.
  onMount(enableLongPressMenus);
  // Effects flush only once the whole tree has hydrated, so every handler is
  // attached before the taps app.html held are replayed.
  onMount(() => window.releaseHeldTaps());
  // A hidden tab runs no loop on its page; its icon, still seen, keeps Caw's
  // plea while something needs the operator.
  onMount(restWhenHidden);
  // Hairlines drawn outside a box stand on whole device pixels.
  onMount(trackDevicePixel);
  // Bottom sheets rest on the keyboard, and a focused field stays in view.
  onMount(trackVisibleViewport);
  // The tab's icon is app.html's link, there on every route; it follows the fleet.
  $effect(() =>
    tabIcon(document.querySelector('link[rel="icon"]') as HTMLLinkElement)
  );

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

<Toaster
  expand
  offset={toastOffset}
  position={narrowToasts.current ? "top-center" : "bottom-right"}
/>
<Shell railWidth={data.railWidth}> {@render children()} </Shell>
