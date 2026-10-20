<!--
  The live dot (DESIGN.md, Artifact panel: a pin's row and card while the
  agent works on it, an artifact's row while it waits on the person): the
  live glyph's hue in a pill, breathing where motion is welcome. Its words
  are for the screen reader; it says nothing to the eye but that it is live.
-->
<script lang="ts">
  let {
    label,
    kind = "live",
    id,
  }: {
    /** What it means, read out. */
    label: string;
    /** Its `data-slot`: what the row calls it. */
    kind?: string;
    id?: string;
  } = $props();
</script>

<span
  data-slot={kind}
  aria-label={label}
  class="loops size-space-2 flex-none rounded-pill bg-status-live-glyph motion-safe:animate-pulse"
  {id}
  role="img"
></span>
