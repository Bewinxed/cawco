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
  class="inline-block flex-none align-middle"
  data-week-left={left}
  height="10"
  viewBox="0 0 10 10"
  width="10"
  style:--c={ring.color}
>
  <circle class="fill-border-control" cx="5" cy="5" r="5" />
  <!-- literal: 5px 5px; rotate(-90deg) -->
  <circle
    class="share fill-none stroke-5 origin-(--share-origin) transform-(--share-turn) transition-[stroke-dashoffset] dur-panel ease-in-out motion-reduce:transition-none"
    cx="5"
    cy="5"
    pathLength="100"
    r="2.5"
    style:--share-offset={(100 - shown).toFixed(2)}
    style:--share-origin="5px 5px"
    style:--share-turn="rotate(-90deg)"
  />
</svg>

<style>
  /* residual: svg-paint — a sector: a stroke as wide as its circle's
     diameter, so it fills the disc from the centre out (as Rings draws its
     disc), in the rim's own shade. */
  .share {
    stroke: color-mix(
      in oklch,
      var(--c),
      var(--account-week-toward) calc(var(--account-week-mix) * 100%)
    );
    stroke-dasharray: 100 100;
    stroke-dashoffset: var(--share-offset);
  }
</style>
