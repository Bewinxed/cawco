<script lang="ts">
  /**
   * The week's mark before a week figure: a 10px disc in the empty track's
   * grey, the week's share left drawn over it as a sector clockwise from 12
   * o'clock in the rim's own shade (the account's hue toward
   * `account-week-toward`, as Rings draws the rim). A full week is a solid
   * disc; any share above nothing shows at least an eighth (`MIN_SHOWN`), so
   * 5% still reads as a wedge, not a speck; at the week's limit only the
   * track shows.
   */
  import type { RingAccount } from "./rings";

  let { ring }: { ring: RingAccount } = $props();

  /** The least wedge drawn for a share above nothing, percent. */
  const MIN_SHOWN = 12;

  const left = $derived(ring.limitOn === "week" ? 0 : (ring.week?.left ?? 0));
  const shown = $derived(left > 0 ? Math.max(left, MIN_SHOWN) : 0);
</script>

<svg
  aria-hidden="true"
  class="week-mark"
  data-week-left={left}
  height="10"
  viewBox="0 0 10 10"
  width="10"
  style:--c={ring.color}
>
  <circle class="track" cx="5" cy="5" r="5" />
  <circle
    class="share"
    cx="5"
    cy="5"
    pathLength="100"
    r="2.5"
    style:stroke-dashoffset={(100 - shown).toFixed(2)}
  />
</svg>

<style>
  .week-mark {
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
  .track {
    fill: var(--border-control);
  }
  /* A sector: a stroke as wide as its circle's diameter, so it fills the
     disc from the centre out (as Rings draws its disc). */
  .share {
    fill: none;
    stroke: color-mix(
      in oklch,
      var(--c),
      var(--account-week-toward) calc(var(--account-week-mix) * 100%)
    );
    stroke-width: 5;
    stroke-dasharray: 100 100;
    transform: rotate(-90deg);
    transform-origin: 5px 5px;
    transition: stroke-dashoffset var(--dur-panel) var(--ease-in-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .share {
      transition: none;
    }
  }
</style>
