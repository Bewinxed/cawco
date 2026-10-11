<script lang="ts">
  /**
   * The week's mark before a week figure: the dial's rim in small, 10px
   * across, its arc filled clockwise from 12 o'clock to what is left of the
   * week in the rim's own shade (the account's hue toward
   * `account-week-toward`, as Rings draws it), over the empty track's grey.
   * At the week's limit only the track shows.
   */
  import type { RingAccount } from "./rings";

  let { ring }: { ring: RingAccount } = $props();

  const left = $derived(ring.limitOn === "week" ? 0 : (ring.week?.left ?? 0));
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
  <circle class="track" cx="5" cy="5" r="4" />
  <circle
    class="arc"
    cx="5"
    cy="5"
    pathLength="100"
    r="4"
    style:stroke-dashoffset={(100 - left).toFixed(2)}
  />
</svg>

<style>
  .week-mark {
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
  circle {
    fill: none;
    stroke-width: 2;
    transform: rotate(-90deg);
    transform-origin: 5px 5px;
  }
  .track {
    stroke: var(--border-control);
  }
  .arc {
    stroke: color-mix(
      in oklch,
      var(--c),
      var(--account-week-toward) calc(var(--account-week-mix) * 100%)
    );
    stroke-dasharray: 100 100;
    transition: stroke-dashoffset var(--dur-panel) var(--ease-in-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .arc {
      transition: none;
    }
  }
</style>
