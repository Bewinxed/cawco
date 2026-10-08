<script lang="ts" module>
  /** Rim width and the gap inside it, in px, per size: the rim reads at 16px. */
  const RIMS = { 16: [1.5, 1], 24: [2, 1.5], 56: [3, 2.5] } as const;
</script>

<script lang="ts">
  /**
   * An account's double dial: the inner disc is its 5-hour window, filled as
   * a sector clockwise from 12 o'clock for the share left, over a track disc;
   * the outer rim, a hairline outside it, is its week, drawn the same way.
   * Both in the account's colour. At its limit the spent window's fill is
   * gone; a reading out of date draws at 40%. Past its weekly reserve the
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
    size: 16 | 24 | 56;
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
      const timer = setTimeout(() => {
        refill = false;
      }, dur("--dur-settle") * 2);
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
          { strokeDashoffset: arc.style.strokeDashoffset },
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

<svg
  aria-hidden="true"
  class={[
    "rings",
    ring.state === "limit" && "limit",
    refill && "refill",
    ring.state === "stale" && "stale",
  ]}
  data-account={ring.id}
  data-disc={disc}
  data-rim={rim}
  height={size}
  viewBox="0 0 24 24"
  width={size}
  bind:this={svg}
  style:--c={ring.color}
>
  <circle class="disc-track" cx="12" cy="12" r={geometry.rd.toFixed(3)} />
  <circle
    class="arc"
    cx="12"
    cy="12"
    data-arc="disc"
    pathLength="100"
    r={(geometry.rd / 2).toFixed(3)}
    stroke-width={geometry.rd.toFixed(3)}
    style:stroke-dashoffset={off(disc)}
  />
  <circle
    class="track"
    cx="12"
    cy="12"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
  />
  <circle
    class="arc"
    cx="12"
    cy="12"
    data-arc="rim"
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
    style:stroke-dashoffset={off(rim)}
  />
  <circle
    class="arc reserved"
    cx="12"
    cy="12"
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.w.toFixed(3)}
    style:stroke-dashoffset={off(reserve === null ? 0 : Math.min(rim, reserve))}
  />
  <circle
    class="notch"
    cx="12"
    cy="12"
    pathLength="100"
    r={geometry.rr.toFixed(3)}
    stroke-width={geometry.notch.toFixed(3)}
    style:stroke-dashoffset={(-(reserve ?? 0) + 0.8).toFixed(2)}
    class:off={reserve === null}
  />
</svg>

<style>
  .rings {
    display: block;
    flex: none;
    overflow: visible;
  }
  circle {
    fill: none;
    transform: rotate(-90deg);
    transform-origin: 12px 12px;
  }
  .disc-track {
    fill: var(--border-control);
  }
  .track {
    stroke: var(--border-control);
  }
  .arc {
    stroke: var(--c);
    stroke-dasharray: 100 100;
    stroke-linecap: butt;
    transition:
      stroke-dashoffset var(--dur-panel) var(--ease-in-out),
      stroke var(--dur-toggle) var(--ease-out),
      opacity var(--dur-toggle) var(--ease-out);
  }
  .arc.reserved {
    stroke: var(--account-reserved);
  }
  .notch {
    stroke: var(--ring-ground, var(--sidebar));
    stroke-dasharray: 1.6 98.4;
    transition: opacity var(--dur-toggle) var(--ease-out);
  }
  .notch.off {
    opacity: 0;
  }
  .stale .arc {
    opacity: 0.4;
  }
  .refill .arc {
    transition: stroke-dashoffset var(--dur-settle) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .arc,
    .notch {
      transition: none;
    }
  }
</style>
