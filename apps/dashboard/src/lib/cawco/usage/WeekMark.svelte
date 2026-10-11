<script lang="ts">
  /**
   * The week's mark before a cell's week figure: the dial's rim on its own,
   * an outline ring 10px across, its stroke the 32px dial's rim at this
   * size, in the line's ink, so "62%" reads as what the rim measures.
   */
  import { RIMS } from "./Rings.svelte";

  const [rim] = RIMS[32];
  /** The 32px dial's rim in the 24-unit box both draw in. */
  const width = (rim * 24) / 32;
</script>

<svg
  aria-hidden="true"
  class="week-mark"
  height="10"
  viewBox="0 0 24 24"
  width="10"
>
  <circle
    cx="12"
    cy="12"
    fill="none"
    r={12 - width / 2}
    stroke="currentColor"
    stroke-width={width}
  />
</svg>

<style>
  .week-mark {
    display: inline-block;
    margin-inline-end: var(--space-1);
    vertical-align: middle;
  }
</style>
