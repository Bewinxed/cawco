<script lang="ts" module>
  /**
   * Rim width and the gap inside it, in px, per size: the rim reads at 16px;
   * at the usage popover's dial wall (32px) and the Usage page's limits
   * (56px) the week is a band wide enough, and far enough off the disc,
   * that weeks compare by eye from cell to cell.
   */
  const RIMS = {
    16: [1.5, 1],
    24: [2, 1.5],
    32: [3.5, 1.5],
    56: [6, 3],
  } as const;
</script>

<script lang="ts">
  /**
   * An account's double dial: the inner disc is its 5-hour window, filled as
   * a sector clockwise from 12 o'clock for the share left, over a track disc;
   * the outer rim, outside it, is its week, drawn the same way. The disc is
   * the account's colour, the rim the same hue at another lightness
   * (--account-week-toward, --account-week-mix). At its limit the spent
   * window's fill is gone and its track takes --ring-track-spent, which
   * holds on the limit wash; a reading out of date draws at --account-stale-opacity (3:1 on
   * the raised surface for every hue). Past its weekly reserve the
   * part of the rim under the reserve is the reserved neutral, with a notch
   * cut where the reserve sits, in the ground's paint (`--ring-ground`).
   *
   * Motion: a new reading eases each arc to its value (--dur-panel,
   * in-out); a window that resets refills (--dur-settle, ease-out); with
   * `reveal`, the arcs draw from empty as the mark first appears. Reduced
   * motion: every change lands at once.
   */
  import { onMount, untrack } from "svelte";
  import { CURVE, dur, motionOk } from "../motion/curves.svelte";
  import type { RingAccount } from "./rings";

  let {
    ring,
    size,
    reveal = false,
    index = 0,
  }: {
    ring: RingAccount;
    size: keyof typeof RIMS;
    /** Draw the arcs from empty as it mounts (the strip and the page). */
    reveal?: boolean;
    /** Its place among the marks it appears with: the reveal's stagger. */
    index?: number;
  } = $props();

  const geometry = $derived.by(() => {
    const [rim, gap] = RIMS[size];
    const u = 24 / size;
    const w = rim * u;
    const rr = 12 - w / 2;
    const rd = 12 - w - gap * u;
    return { w, rr, rd, notch: w + 1.2 * u };
  });

  const disc = $derived(ring.limitOn === "5h" ? 0 : (ring.w5?.left ?? 0));
  const rim = $derived(ring.limitOn === "week" ? 0 : (ring.week?.left ?? 0));
  const reserve = $derived(ring.reserveLeft);
  const off = (left: number) => (100 - left).toFixed(2);

  /** A window coming back from its limit refills, a beat slower. */
  let refill = $state(false);
  let wasLimit = untrack(() => ring.state === "limit");
  $effect(() => {
    const limit = ring.state === "limit";
    if (wasLimit && !limit && motionOk.current) {
      refill = true;
      const timer = setTimeout(
        () => {
          refill = false;
        },
        dur("--dur-settle") * 2
      );
      wasLimit = limit;
      return () => clearTimeout(timer);
    }
    wasLimit = limit;
  });

  let svg: SVGSVGElement | undefined = $state();
  onMount(() => {
    if (!(reveal && svg && motionOk.current)) {
      return;
    }
    const arcs = svg.querySelectorAll<SVGCircleElement>("[data-arc]");
    arcs.forEach((arc, i) => {
      arc.animate(
        [
          { strokeDashoffset: "100" },
          { strokeDashoffset: arc.style.getPropertyValue("--arc-offset") },
        ],
        {
          duration: dur("--dur-settle"),
          easing: CURVE.out,
          delay: (index * arcs.length + i) * dur("--dur-stagger"),
          fill: "backwards",
        }
      );
    });
  });
</script>

<!-- literal: 12px 12px; rotate(-90deg) -->
<svg
  aria-hidden="true"
  class="group/rings block flex-none overflow-visible"
  data-account={ring.id}
  data-disc={disc}
  data-limit={ring.state === "limit" || undefined}
  data-refill={refill || undefined}
  data-rim={rim}
  data-stale={ring.state === "stale" || undefined}
  height={size}
  viewBox="0 0 24 24"
  width={size}
  bind:this={svg}
  style:--c={ring.color}
  style:--ring-origin="12px 12px"
  style:--ring-turn="rotate(-90deg)"
>
  <circle
    class="fill-border-control origin-(--ring-origin) transform-(--ring-turn) data-spent:fill-ring-track-spent"
    cx="12"
    cy="12"
    data-spent={ring.limitOn === "5h" || undefined}
    r={geometry.rd.toFixed(3)}
  />
  <circle
    class="arc fill-none stroke-(--c) origin-(--ring-origin) transform-(--ring-turn) group-data-stale/rings:opacity-(--account-stale-opacity)"
    cx="12"
    cy="12"
    data-arc="disc"
    data-full={disc >= 100 || undefined}
    pathLength="100"
    r={(geometry.rd / 2).toFixed(3)}
    stroke-width={geometry.rd.toFixed(3)}
    style:--arc-offset={off(disc)}
  />
  <circle
    class="fill-none stroke-border-control origin-(--ring-origin) transform-(--ring-turn) data-spent:stroke-ring-track-spent"
    cx="12"
    cy="12"
    data-spent={ring.limitOn === "week" || undefined}
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
  />
  <circle
    class="arc week fill-none origin-(--ring-origin) transform-(--ring-turn) group-data-stale/rings:opacity-(--account-stale-opacity)"
    cx="12"
    cy="12"
    data-arc="rim"
    data-full={rim >= 100 || undefined}
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
    style:--arc-offset={off(rim)}
  />
  <circle
    class="arc fill-none stroke-account-reserved origin-(--ring-origin) transform-(--ring-turn) group-data-stale/rings:opacity-(--account-stale-opacity) data-off:opacity-0 data-off:group-data-stale/rings:opacity-(--account-stale-opacity)"
    cx="12"
    cy="12"
    data-off={reserve === null || Math.min(rim, reserve) <= 0 || undefined}
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
    style:--arc-offset={off(reserve === null ? 0 : Math.min(rim, reserve))}
  />
  <circle
    class="notch fill-none origin-(--ring-origin) transform-(--ring-turn) transition-[opacity] dur-toggle ease-out data-off:opacity-0 motion-reduce:transition-none"
    cx="12"
    cy="12"
    data-off={reserve === null || undefined}
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.notch.toFixed(3)}
    style:--notch-offset={(-(reserve ?? 0) + 0.8).toFixed(2)}
  />
</svg>

<style>
  /* residual: svg-paint — the arcs' dash and its offset; a whole window is a
     whole circle: a dash 100 long on a closed circle leaves a ~2% wedge
     uncovered at its start (the disc), so it is not dashed. The week's rim
     in the account's hue toward --account-week-toward, and the notch cut in
     the ground's paint. */
  .arc {
    stroke-dasharray: 100 100;
    stroke-linecap: butt;
    stroke-dashoffset: var(--arc-offset);
  }
  .week {
    stroke: color-mix(
      in oklch,
      var(--c),
      var(--account-week-toward) calc(var(--account-week-mix) * 100%)
    );
  }
  .arc[data-full] {
    stroke-dasharray: none;
  }
  .notch {
    stroke: var(--ring-ground, var(--sidebar));
    stroke-dasharray: 1.6 98.4;
    stroke-dashoffset: var(--notch-offset);
  }
  /* residual: unmapped — three properties at two durations in one
     transition (needs transition token); a refill, and reduced motion,
     override it, so they stay beside it. */
  .arc {
    transition:
      stroke-dashoffset var(--dur-panel) var(--ease-in-out),
      stroke var(--dur-toggle) var(--ease-out),
      opacity var(--dur-toggle) var(--ease-out);
  }
  [data-refill] .arc {
    transition: stroke-dashoffset var(--dur-settle) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .arc {
      transition: none;
    }
  }
</style>
