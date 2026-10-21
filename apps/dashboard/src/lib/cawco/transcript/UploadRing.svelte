<script lang="ts">
  /**
   * How far a file's upload has gone, as a ring that fills over
   * --dur-control: in the sent turn's tile (DocThumb) and the composer's
   * chip (AttachmentChips), in the glyph's place.
   */
  let { progress, class: className = "" }: { progress: number; class?: string } = $props();

  /** The ring's arc: its circumference, and how much of it is still to fill. */
  const RING = 2 * Math.PI * 9;
</script>

<svg
  data-slot="ring"
  aria-hidden="true"
  class={["-rotate-90", className]}
  viewBox="0 0 24 24"
>
  <circle
    class="fill-none stroke-current opacity-25"
    cx="12"
    cy="12"
    r="9"
    stroke-width="2.5"
  />
  <circle
    data-slot="arc"
    class="fill-none stroke-current motion-safe:transition-[stroke-dashoffset] motion-safe:duration-(--dur-control) motion-safe:ease-out"
    cx="12"
    cy="12"
    r="9"
    stroke-dasharray={RING}
    stroke-dashoffset={RING * (1 - progress)}
    stroke-linecap="round"
    stroke-width="2.5"
  />
</svg>
