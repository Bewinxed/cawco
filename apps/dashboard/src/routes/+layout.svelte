<script lang="ts">
  import "../app.css";
  import "$lib/theme.svelte";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { onNavigate } from "$app/navigation";
  import { Toaster } from "$lib/components/ui/sonner";
  import { NARROW_QUERY } from "$lib/hooks/is-mobile.svelte";
  import { enableLongPressMenus } from "$lib/utils/longpress";
  import { ensureConnected } from "$lib/whiffle/client.svelte";
  import { GROUPS } from "$lib/whiffle/config/sections";
  import { plan, route } from "$lib/whiffle/motion/route.svelte";
  import { departAll } from "$lib/whiffle/motion/share.svelte";
  import Shell from "$lib/whiffle/Shell.svelte";
  import { tallestComposer } from "$lib/whiffle/transcript/composer-presence.svelte";
  import { workspace } from "$lib/whiffle/workspace/workspace.svelte";
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
          bottom: `calc(var(--space-4) + env(safe-area-inset-bottom) + ${composerLift}px + var(--space-3))`,
        }
      : undefined
  );

  // One socket for the whole app; routes only read the state it fills in.
  onMount(ensureConnected);
  // iOS has no right-click; a held press is its context menu.
  onMount(enableLongPressMenus);

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
    if (!(navigation.from && navigation.to)) {
      return;
    }
    // What the page going away shares with the page arriving hands itself
    // over: its rects are taken now, before the DOM changes.
    departAll();
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

<Toaster
  offset={toastOffset}
  position={narrowToasts.current ? "top-center" : "bottom-right"}
/>
<Shell railWidth={data.railWidth}> {@render children()} </Shell>
