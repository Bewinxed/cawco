<script lang="ts">
  /**
   * What every route stands on, the app's and the bare ones alike (an
   * artifact in its own tab, a custom view): the styles, the theme, the one
   * socket and its upkeep, and the toasts. The app around a page (the Shell)
   * is the `(app)` group's layout, so a bare route downloads none of it.
   */
  import "../app.css";
  import "#lib/theme.svelte.js";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { ensureConnected } from "#lib/cawco/client.svelte.js";
  import { trackDevicePixel } from "#lib/cawco/device-pixel.js";
  import { restWhenHidden } from "#lib/cawco/motion/rest.js";
  import { tabIcon } from "#lib/cawco/tab-icon/tab-icon.svelte.js";
  import { tallestComposer } from "#lib/cawco/transcript/composer-presence.svelte.js";
  import { startUpdateWatch } from "#lib/cawco/updates/update-notice.svelte.js";
  import { trackVisibleViewport } from "#lib/cawco/visible-viewport.svelte.js";
  import { workspace } from "#lib/cawco/workspace/workspace.svelte.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { enableLongPressMenus } from "#lib/utils/longpress.js";

  let { children }: { children: Snippet } = $props();

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
</script>

<Toaster
  data-safe-bottom
  expand
  offset={toastOffset}
  position={narrowToasts.current ? "top-center" : "bottom-right"}
/>
{@render children()}
