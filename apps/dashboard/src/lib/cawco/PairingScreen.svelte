<script lang="ts">
  /**
   * What a browser the hub does not know sees, in place of the app, while
   * the hub requires paired devices (hub-auth.svelte.ts): its pairing,
   * drawn by PairingPanel, its QR carrying the hub and the code.
   *
   * It asks for a code as it opens. While the code waits its countdown
   * reads the shared second (motion/clock). Approved, the moment is held,
   * the screen leaves and the page reloads as this device; denied or
   * expired, it says so and offers to start again.
   */
  import { onMount } from "svelte";
  import { hubAuth, startPairing } from "./hub-auth.svelte";
  import { leaveThePage } from "./leaving";
  import { tickingClock } from "./motion/clock.svelte";
  import { dur } from "./motion/curves.svelte";
  import PairingPanel from "./pairing/PairingPanel.svelte";

  onMount(() => {
    if (hubAuth.pairing.kind === "idle") {
      // biome-ignore lint/complexity/noVoid: the pairing reports its own outcome in its stage
      void startPairing();
    }
  });

  const stage = $derived(hubAuth.pairing);
  const clock = tickingClock(() => stage.kind === "waiting");
  const payload = $derived(
    "verificationUriComplete" in stage ? stage.verificationUriComplete : null
  );

  let leaving = $state(false);
  /** The approval has been seen: the screen fades out and the app opens. */
  function held(): void {
    leaving = true;
    setTimeout(() => leaveThePage(() => location.reload()), dur("--dur-fade"));
  }
</script>

<PairingPanel
  {leaving}
  now={clock.now}
  onheld={held}
  onstart={startPairing}
  {payload}
  {stage}
  watch={clock.watch}
/>
