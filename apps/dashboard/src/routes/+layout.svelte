<script lang="ts">
  import "../app.css";
  import "$lib/theme.svelte";
  /**
   * The UI face, by the name the build gives it. `app.css` reaches this same
   * file through @fontsource's `@font-face`, but only once the stylesheet has
   * parsed — so on a cold load the page painted in the system fallback and
   * reflowed every line ~100ms later when Geist arrived. Importing the asset
   * gets Vite's resolved (hashed) URL, which is the one the CSS will ask for,
   * so the preload below is a head start rather than a second download.
   */
  import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { onNavigate } from "$app/navigation";
  import { Toaster } from "$lib/components/ui/sonner";
  import { enableLongPressMenus } from "$lib/utils/longpress";
  import { ensureConnected } from "$lib/whiffle/client.svelte";
  import Shell from "$lib/whiffle/Shell.svelte";
  import type { LayoutServerData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutServerData } =
    $props();

  /**
   * Where toasts appear. A phone's bottom edge belongs to the composer, so
   * there they drop from the top, under the top bar; the sonner kit carries
   * the narrow placement. A desk keeps the corner.
   */
  const narrowToasts = new MediaQuery("(max-width: 640px)");

  // One socket for the whole app; routes only read the state it fills in.
  onMount(ensureConnected);
  // iOS has no right-click; a held press is its context menu.
  onMount(enableLongPressMenus);

  /**
   * Everything the tab strip reaches: the conversations, and the fleet board
   * that leads them. One surface with several things stacked in it, not several
   * pages — `session/+layout.svelte` keeps all of them mounted at once.
   */
  const SESSION = /^\/session(\/|$)/;

  // Route changes cross-fade (app.css `content`); same-page param changes and
  // session tab switches are instant.
  //
  // Moving between conversations never arrives here at all: the workspace
  // store shows the pane and writes the URL with `pushState`, which runs no
  // navigation.
  onNavigate((navigation) => {
    if (!document.startViewTransition) {
      return;
    }
    if (!(navigation.from && navigation.to)) {
      return;
    }

    const from = navigation.from.url.pathname;
    const to = navigation.to.url.pathname;

    // Same page, different params — instant.
    if (from === to) {
      return;
    }

    // Session tab switches skip VT entirely. The panes are visibility-toggled
    // with their own CSS crossfade (opacity transition in session/+layout), so
    // a VT here only adds ~300ms of capture/animate overhead on top of the
    // transition that already runs. The DOM swap is 4ms; don't gate it.
    if (SESSION.test(from) && SESSION.test(to)) {
      return;
    }

    // Hidden or reduced motion — instant.
    if (document.hidden) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete.catch(() => {
          /* the transition still finishes on a cancelled navigation */
        });
      });
    });
  });
</script>

<svelte:head>
  <link
    as="font"
    crossorigin="anonymous"
    href={geistLatin}
    rel="preload"
    type="font/woff2"
  >
</svelte:head>

<Toaster position={narrowToasts.current ? "top-center" : "bottom-right"} />
<Shell railWidth={data.railWidth}> {@render children()} </Shell>
