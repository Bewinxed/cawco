<script lang="ts" module>
  /** The >< faces drawn for a denied key (caw-pairing-picks), both marks level. */
  export type DeniedFace = "squeeze" | "wince";
</script>

<script lang="ts">
  /**
   * A denied face in the key: the real PairingQr with the face as its head,
   * at the size the screen draws it, and the same head enlarged beside it.
   * The faces are the drawings the Caw takes page made, the marks moved
   * level (one line, one size). Preview only, until one is picked and goes
   * into the app's icons.
   */
  import PairingQr from "../PairingQr.svelte";
  import squeeze from "./faces/squeeze.webp";
  import wince from "./faces/wince.webp";
  import { FIXTURE, verification } from "./fixture";

  let { face }: { face: DeniedFace } = $props();

  const FACES: Record<DeniedFace, string> = { squeeze, wince };
  const src = $derived(FACES[face]);
  const payload = verification(FIXTURE.hub, FIXTURE.code);
</script>

<!-- One compact frame: the key at its size, the head enlarged beside it. -->
<div class="flex items-center justify-center gap-[var(--space-5)]">
  <div class="w-[var(--c-pair-w)] shrink-0">
    <PairingQr act="still" centre={{ key: face, src }} {payload} />
  </div>
  <img
    class="size-32 shrink-0 rounded-[22%] object-cover"
    alt=""
    height="128"
    {src}
    width="128"
  />
</div>
