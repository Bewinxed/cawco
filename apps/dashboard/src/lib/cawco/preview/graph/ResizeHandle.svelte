<script lang="ts" module>
  /** Where the handle stands: how far its leg reaches along each edge from the corner (null: not reached), and whether it is held. */
  export interface HandleState {
    /** Along the edge that sets the width (the panel's leading edge). */
    a: number | null;
    /** Along the edge that sets the height (the panel's foot, the dock's top). */
    b: number | null;
    held: boolean;
  }
</script>

<script lang="ts">
  /**
   * The resize handle (the owner's pick "edges"; pins 25 and 26; round 29,
   * section A): one shape at three lengths. At rest an arc in the corner
   * that resizes, concentric with the panel's radius, the house grip's
   * stroke in the row-outline ink; no pill on any edge. Pointed at, the arc
   * closes to its quarter and its leg grows along the edge under the
   * pointer to a reach past it, in the strong ink and twice the stroke;
   * held, the leg sweeps the whole edge being dragged in coral, tapered at
   * its far end; let go, it folds back. One component, so another design
   * can replace it whole. `corner`: the panel's bottom-leading corner, or
   * the dock's top-trailing (the same shape turned over).
   */
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";

  let {
    corner,
    handle,
    height,
    width,
  }: {
    corner: "bl" | "tr";
    handle: HandleState;
    /** The owner's box: the full length each leg sweeps. */
    height: number;
    width: number;
  } = $props();

  const uid = $props.id();
  const reached = $derived(
    handle.a !== null || handle.b !== null || handle.held
  );
  /**
   * Its gap from the edge and its stroke, as the engine resolves them: both
   * tokens are written from others (a share of the panel's radius, the
   * grip's stroke), so they are measured on a box of their size, not read
   * as text.
   */
  let gap = $state(0);
  let stroke = $state(0);
  const measure = (node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    gap = box.width;
    stroke = box.height;
  };
  /** The geometry (round 28's measure of iPadOS 26's corner handle, kept by round 29): concentric with the panel's radius, its gap from the edge 0.122 of it, its body 65.6° of the quarter at rest. */
  const R = $derived(numberOf("--radius-panel"));
  const inset = $derived(1 + gap + stroke / 2);
  const r = $derived(R - inset);
  const quarter = $derived((Math.PI / 2) * r);
  const rest = $derived(quarter * (65.6 / 90));
  /** Each leg runs from where the curve meets its edge to the edge's far corner. */
  const fullA = $derived(Math.max(0, height - 2 * R));
  const fullB = $derived(Math.max(0, width - 2 * R));
  const lengthOf = (reach: number | null, full: number): number => {
    if (reach === null) {
      return 0;
    }
    return handle.held ? full : Math.min(full, Math.max(0, reach - R));
  };
  const legA = $derived(lengthOf(handle.a, fullA));
  const legB = $derived(lengthOf(handle.b, fullB));
  const taper = () => numberOf("--c-handle-reach");
  /** Where it stands: held, reached, or at rest. */
  const phase = $derived.by((): "held" | "reached" | "rest" => {
    if (handle.held) {
      return "held";
    }
    return reached ? "reached" : "rest";
  });
  /** Its clock: the sweep over --dur-pop, the reach over --dur-control, the fold back over --dur-exit. */
  const CLOCK = {
    held: "duration-(--dur-pop)",
    reached: "duration-(--dur-control)",
    rest: "duration-(--dur-exit)",
  } as const;
  /** Its ink: coral held, the strong ink reached, the row outline at rest. */
  const INK = {
    held: "text-brand-solid",
    reached: "text-ink-strong",
    rest: "text-border-row-outline",
  } as const;
  const clock = $derived(CLOCK[phase]);
</script>

<span
  {@attach measure}
  aria-hidden="true"
  class="invisible absolute h-c-handle-stroke w-c-handle-arc-gap"
></span>
<!-- The shape is drawn for the bottom-leading corner; the top-trailing is the same turned over. -->
<svg
  aria-hidden="true"
  class={[
    "pointer-events-none absolute top-0 left-0 z-5 h-(--h) w-(--w) overflow-visible transition-colors ease-out",
    clock,
    corner === "tr" && "-scale-100",
    INK[phase],
  ]}
  data-held={handle.held || undefined}
  data-reached={reached || undefined}
  data-resize-handle={corner}
  style:--h={`${height}px`}
  style:--w={`${width}px`}
  viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
>
  <defs>
    <linearGradient
      gradientUnits="userSpaceOnUse"
      id={`${uid}-a`}
      x1={inset}
      x2={inset}
      y1={height - R}
      y2={height - R - legA}
    >
      <stop offset="0" stop-color="currentColor"></stop>
      <stop
        offset={legA > 0 ? Math.max(0, 1 - taper() / legA) : 0}
        stop-color="currentColor"
      ></stop>
      <stop offset="1" stop-color="currentColor" stop-opacity="0"></stop>
    </linearGradient>
    <linearGradient
      gradientUnits="userSpaceOnUse"
      id={`${uid}-b`}
      x1={R}
      x2={R + legB}
      y1={height - inset}
      y2={height - inset}
    >
      <stop offset="0" stop-color="currentColor"></stop>
      <stop
        offset={legB > 0 ? Math.max(0, 1 - taper() / legB) : 0}
        stop-color="currentColor"
      ></stop>
      <stop offset="1" stop-color="currentColor" stop-opacity="0"></stop>
    </linearGradient>
  </defs>
  <path
    class={[
      "arc fill-none stroke-current transition-[stroke-dasharray,stroke-dashoffset,stroke-width] ease-out",
      clock,
      reached
        ? "stroke-(length:--c-handle-stroke-held)"
        : "stroke-(length:--c-handle-stroke)",
    ]}
    d={`M ${inset} ${height - R} A ${r} ${r} 0 0 0 ${R} ${height - inset}`}
    stroke-linecap="round"
    style:--dash={reached ? `${quarter} ${quarter}` : `${rest} ${quarter}`}
    style:--offset={reached ? 0 : -(quarter - rest) / 2}
  ></path>
  <path
    class={[
      "leg fill-none transition-[stroke-dasharray,opacity] ease-out stroke-(length:--c-handle-stroke-held)",
      clock,
    ]}
    d={`M ${inset} ${height - R} V ${R}`}
    opacity={legA > 0 ? 1 : 0}
    stroke={`url(#${uid}-a)`}
    stroke-linecap="round"
    style:--dash={`${legA} ${fullA + 1}`}
  ></path>
  <path
    class={[
      "leg fill-none transition-[stroke-dasharray,opacity] ease-out stroke-(length:--c-handle-stroke-held)",
      clock,
    ]}
    d={`M ${R} ${height - inset} H ${width - R}`}
    opacity={legB > 0 ? 1 : 0}
    stroke={`url(#${uid}-b)`}
    stroke-linecap="round"
    style:--dash={`${legB} ${fullB + 1}`}
  ></path>
</svg>

<style>
  /* tailwind: no stroke-dasharray utility exists, so the handle's dashes stand here — tailwindcss.com/docs/stroke-width */
  /* residual: svg-paint — the arc's visible run and each leg's length, as dashes of their own paths */
  .arc,
  .leg {
    stroke-dasharray: var(--dash);
  }
  .arc {
    stroke-dashoffset: var(--offset);
  }
  @media (prefers-reduced-motion: reduce) {
    /* residual: svg-paint — with less motion the run's length lands at once; only its ink fades */
    .arc,
    .leg {
      transition-property: opacity, stroke-width;
    }
  }
</style>
