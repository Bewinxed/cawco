<script lang="ts" module>
  import cawReady from "$lib/assets/caw/caw-ready.png";
  import cawReadyDark from "$lib/assets/caw/dark-rim-cream-caw-ready.png";
  import loadingDots from "$lib/assets/caw/loading-dots.png";
  import loadingFeather from "$lib/assets/caw/loading-feather.png";
  import loadingPeer from "$lib/assets/caw/loading-peer.png";
  import reconnectingHop from "$lib/assets/caw/reconnecting-hop.png";
  import reconnectingReach from "$lib/assets/caw/reconnecting-reach.png";
  import reconnectingSearch from "$lib/assets/caw/reconnecting-search.png";

  /** The poses that take turns: one is picked at random each time Caw appears. */
  const TURNS = {
    loading: [loadingFeather, loadingDots, loadingPeer],
    reconnecting: [reconnectingReach, reconnectingSearch, reconnectingHop],
  } as const;
</script>

<script lang="ts">
  /**
   * Caw, the CawCo crow, at a brand moment: an empty home, a detail area
   * with nothing open yet, a fleet still being read, a hub being reached
   * again. Never in a row, an error or a permission request. The ready pose
   * has a night version (cream rim); the others are drawn for both.
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
  const turn = $derived(
    pose === "ready" ? null : TURNS[pose][Math.floor(pick * TURNS[pose].length)]
  );
</script>

{#if turn}
  <img alt="" class="caw" src={turn} width={size}>
{:else}
  <img alt="" class="caw light-only" src={cawReady} width={size}>
  <img alt="" class="caw dark-only" src={cawReadyDark} width={size}>
{/if}

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
