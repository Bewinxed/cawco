<script lang="ts">
  /**
   * What every route stands on, the app's and the bare ones alike (an
   * artifact in its own tab, a custom view), and nothing more: the owner,
   * "an artifact shouldn't load anything that is not needed for the
   * preview/artifact, no unnecessary connections etc". The app's socket, its
   * upkeep and its toasts are the `(app)` group's layout, with the Shell.
   */
  // The styles and tokens every route draws in.
  import "../app.css";
  // The theme every route draws in, light or dark, before its first paint.
  import "#lib/theme.svelte.js";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { trackDevicePixel } from "#lib/cawco/device-pixel.js";
  import { trackVisibleViewport } from "#lib/cawco/visible-viewport.svelte.js";

  let { children }: { children: Snippet } = $props();

  // Effects flush only once the whole tree has hydrated, so every handler is
  // attached before the taps app.html held are replayed: app.html holds them
  // on every route.
  onMount(() => window.releaseHeldTaps());
  // Hairlines drawn outside a box stand on whole device pixels: app.css draws
  // the kit's hairlines on `--dpx`, an artifact's pane's among them.
  onMount(trackDevicePixel);
  // Bottom sheets rest on the keyboard, and a focused field stays in view: a
  // pin's reply and a page's place picker are fields on a phone too.
  onMount(trackVisibleViewport);
</script>

{@render children()}
