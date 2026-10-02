<script lang="ts" module>
  import cawReady from "$lib/assets/caw/caw-ready.png";
  import cawReadyDark from "$lib/assets/caw/dark-rim-cream-caw-ready.png";
  import loadingDotsDark from "$lib/assets/caw/dark-rim-cream-loading-dots.png";
  import loadingFeatherDark from "$lib/assets/caw/dark-rim-cream-loading-feather.png";
  import loadingPeerDark from "$lib/assets/caw/dark-rim-cream-loading-peer.png";
  import reconnectingHopDark from "$lib/assets/caw/dark-rim-cream-reconnecting-hop.png";
  import reconnectingReachDark from "$lib/assets/caw/dark-rim-cream-reconnecting-reach.png";
  import reconnectingSearchDark from "$lib/assets/caw/dark-rim-cream-reconnecting-search.png";
  import loadingDots from "$lib/assets/caw/loading-dots.png";
  import loadingFeather from "$lib/assets/caw/loading-feather.png";
  import loadingPeer from "$lib/assets/caw/loading-peer.png";
  import reconnectingHop from "$lib/assets/caw/reconnecting-hop.png";
  import reconnectingReach from "$lib/assets/caw/reconnecting-reach.png";
  import reconnectingSearch from "$lib/assets/caw/reconnecting-search.png";

  /**
   * Each pose's stills, a light and a night (cream rim) version of each.
   * Loading and reconnecting take turns: one is picked at random each time Caw appears.
   */
  const POSES = {
    ready: [{ light: cawReady, dark: cawReadyDark }],
    loading: [
      { light: loadingFeather, dark: loadingFeatherDark },
      { light: loadingDots, dark: loadingDotsDark },
      { light: loadingPeer, dark: loadingPeerDark },
    ],
    reconnecting: [
      { light: reconnectingReach, dark: reconnectingReachDark },
      { light: reconnectingSearch, dark: reconnectingSearchDark },
      { light: reconnectingHop, dark: reconnectingHopDark },
    ],
  } as const;
</script>

<script lang="ts">
  /**
   * Caw, the CawCo crow, at a brand moment: an empty home, a detail area
   * with nothing open yet, a fleet still being read, a hub being reached
   * again. Never in a row, an error or a permission request. Every still has
   * a night version with a thin cream rim, so Caw reads on the dark surface.
   */
  let {
    pose,
    size = 160,
  }: {
    pose: "ready" | "loading" | "reconnecting";
    /** Drawn width in px; the art is shipped at 2× of the largest use. */
    size?: number;
  } = $props();

  /** Picked once per appearance: a remount is a new appearance, a re-render is not. */
  const pick = Math.random();
  const still = $derived(POSES[pose][Math.floor(pick * POSES[pose].length)]);
</script>

<img alt="" class="caw light-only" src={still.light} width={size}>
<img alt="" class="caw dark-only" src={still.dark} width={size}>

<style>
  .caw {
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }
  .dark-only {
    display: none;
  }
  :global(.dark) .light-only {
    display: none;
  }
  :global(.dark) .dark-only {
    display: block;
  }
</style>
