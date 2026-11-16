<script lang="ts">
  /**
   * A share as a small ring, the size of a chip's glyph: the arc is the
   * share the words beside it name (what is used, or what is left), in the
   * state colour of what is used, on a track that is no state's.
   * It never stands alone: the words beside it say the figure (DESIGN.md:
   * status reads by glyph, then word, then hue), so it is hidden from
   * assistive tech.
   */
  import type { MeterState } from "../usage";

  let {
    share,
    state,
  }: {
    /** The share the arc draws, 0–100: the figure the words beside it say. */
    share: number;
    state: MeterState;
  } = $props();

  const drawn = $derived(Math.min(100, Math.max(0, share)));
</script>

<svg
  aria-hidden="true"
  class="group/ring size-icon-sm flex-none -rotate-90"
  data-state={state}
  viewBox="0 0 16 16"
>
  <circle
    class="fill-none stroke-border-control"
    cx="8"
    cy="8"
    r="6"
    stroke-width="2.5"
  ></circle>
  <circle
    class="fill-none stroke-meter-calm group-state-near/ring:stroke-warning-9 group-state-over/ring:stroke-error-9 group-state-reached/ring:stroke-error-9 group-state-stale/ring:stroke-meter-stale motion-safe:transition-[stroke-dasharray] motion-safe:duration-(--duration-morph) motion-safe:ease-drawer"
    cx="8"
    cy="8"
    pathLength="100"
    r="6"
    stroke-dasharray={`${drawn} 100`}
    stroke-linecap="round"
    stroke-width="2.5"
  ></circle>
</svg>
