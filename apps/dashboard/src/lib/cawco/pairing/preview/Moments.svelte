<script lang="ts">
  /**
   * A moment of the key, held still at a few times of its clock, side by
   * side: the real PairingQr in the act (and Caw over it, where he reacts),
   * each frame a still that many ms into the act (still.ts), so takes are
   * compared at the same moments, where they differ. No words, so a page
   * may draw the row scaled to its width. Preview only.
   */
  import Caw, { type CawStatus } from "../../home/Caw.svelte";
  import PairingQr, {
    type QrAct,
    type QrCentre,
    type QrWait,
  } from "../PairingQr.svelte";
  import { FIXTURE, verification } from "./fixture";
  import { still } from "./still";

  let {
    act,
    at,
    wait = "ping",
    caw,
    centre,
  }: {
    act: QrAct;
    /** Each frame's time into the act, in ms. */
    at: number[];
    wait?: QrWait;
    /** Caw over each frame, as he stands at its time; none, no Caw. */
    caw?: CawStatus[];
    centre?: QrCentre;
  } = $props();

  const payload = verification(FIXTURE.hub, FIXTURE.code);

  /** A frame held once its act's runs have started: two frames after it is drawn. */
  const hold = (ms: number) => (node: HTMLElement) => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        node.dataset.still = String(still(node, ms));
      });
    });
    return () => cancelAnimationFrame(frame);
  };
</script>

<!-- On the pairing screen's own ground, as the frames stand there; a key
     alone keeps room round it for what leaves its edge (the ping's ring). -->
<div
  class={[
    "flex items-end justify-center gap-[var(--space-3)] bg-[var(--background)] px-[var(--space-3)]",
    caw ? "py-[var(--space-3)]" : "py-[calc(var(--space-8)*2)]",
  ]}
>
  {#each at as ms, index (index)}
    <div
      class="grid w-[var(--c-pair-w)] min-w-0 justify-items-center gap-[var(--space-4)]"
      data-at={ms}
      {@attach hold(ms)}
    >
      {#if caw?.[index]}
        <Caw size={80} status={caw[index]} />
      {/if}
      <PairingQr {act} {centre} {payload} {wait} />
    </div>
  {/each}
</div>
