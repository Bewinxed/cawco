<script lang="ts">
  /**
   * A share as a small ring, set as a glyph of the words it stands beside
   * (the account chip's "38% left"): the arc is the share the words name,
   * in the state colour of what is used, on a track that is no state's.
   * It never stands alone: the words beside it say the figure (DESIGN.md:
   * status reads by glyph, then word, then hue), so it is hidden from
   * assistive tech.
   *
   * Its sizes are the words' own, in `em` of their font (Figtree: cap
   * height 0.70em, figures' round overshoot 0.012em, OS/2 and glyph
   * bounds), so it scales with whatever text it sits in:
   * - 1em across, a symbol at its text's size, as SF Symbols are set;
   * - its stroke 0.15em, so the ring's counter is 0.70em, the height of
   *   the figure's digits beside it;
   * - lifted 0.1em, so its centre stands at the digits' middle (0.35em up)
   *   rather than the x-height's (0.25em), where a row of marks and words
   *   centres a box (`mark-line`).
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
  /** On a 16-unit box (1em): the stroke is 0.15em, its centre line inset by half of it. */
  const STROKE = 2.4;
  const RADIUS = 8 - STROKE / 2;
</script>

<svg
  aria-hidden="true"
  class="group/ring size-glyph flex-none -translate-y-cap-lift -rotate-90"
  data-state={state}
  viewBox="0 0 16 16"
>
  <circle
    class="fill-none stroke-ui-2"
    cx="8"
    cy="8"
    r={RADIUS}
    stroke-width={STROKE}
  ></circle>
  <circle
    class="fill-none stroke-tx-2 group-state-near/ring:stroke-orange group-state-over/ring:stroke-red group-state-reached/ring:stroke-red group-state-stale/ring:stroke-tx-2 motion-safe:transition-[stroke-dasharray] motion-safe:duration-(--duration-base) motion-safe:ease-drawer"
    cx="8"
    cy="8"
    pathLength="100"
    r={RADIUS}
    stroke-dasharray={`${drawn} 100`}
    stroke-linecap="round"
    stroke-width={STROKE}
  ></circle>
</svg>
