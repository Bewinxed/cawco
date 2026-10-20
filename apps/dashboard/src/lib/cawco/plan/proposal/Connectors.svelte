<script lang="ts" module>
  /** One line: a step to the step that starts after it, or a step to its delegate. */
  export interface Edge {
    from: string;
    /** "after": a dependency; "carries": a step down to its delegate. */
    kind: "after" | "carries";
    /** A band travels it: the delegate at its foot is working. */
    pulse?: boolean;
    to: string;
  }
</script>

<script lang="ts">
  /**
   * THE CONNECTORS (proposal, Lanes and Crew first's to-dos): the lines the
   * panel draws between tiles, in the nesting rail's stroke (1px,
   * `nest-ink`) with the rail's own quarter-turn at each bend, under the
   * tiles. Every upright run stands on a lane's rail, the x of that lane's
   * tile centres, which is the x the nesting rails under a tile take too:
   * one line system. A line to a step in the same lane runs straight down
   * the rail into the dependent's top; a line out to the other lane leaves
   * the source's side and turns down that lane's rail into the dependent's
   * top; a line back runs down the source's rail and turns into the
   * dependent's side. So two lines into one step arrive at two different
   * edges and share no stretch, and each crosses to the other lane in the
   * gutter beside its own tile. Where steps stand in columns side by side
   * (Lanes: a band of steps that start after the same step, `data-band`),
   * a line between two columns runs down its source's rail to the gap
   * above the dependent's band, across that gap, and down the dependent's
   * rail into its top: it turns only between rows, so it never runs
   * through a row's words or boxes. A line draws down over 160ms when it
   * first appears (Thinking steps). Where a step's delegate is working, a
   * band of the live ink travels its line once per --dur-loop, by
   * transform only, and is drawn only while it moves.
   *
   * Measured off the tiles (`data-tile`) in this layer's parent, again on
   * every frame of a change in it (a fold opening, a row arriving), in the
   * layer's own pixels (motion/drawn.ts): a box drawn under CSS zoom (a
   * decision page's embed, fitted to its card) is read back through it, as
   * the lines are drawn in the pixels the layer lays out in.
   */
  import { onMount } from "svelte";
  import { drawnBox } from "#lib/cawco/motion/drawn.js";

  let { edges }: { edges: Edge[] } = $props();

  interface Drawn {
    d: string;
    from: string;
    id: string;
    kind: Edge["kind"];
    /** The run a band travels: its x, top and length. */
    pulse?: { x: number; y: number; length: number };
    to: string;
  }

  const uid = $props.id();
  let svg = $state<SVGSVGElement>();
  let drawn = $state<Drawn[]>([]);
  const R = 3;

  interface Box {
    /** The y of the gap above the row (or band of columns) the tile stands in. */
    above: number;
    bottom: number;
    cx: number;
    cy: number;
    left: number;
    right: number;
    top: number;
  }

  /**
   * Down `a`'s rail to the gap above `b`'s row, across it, and down into
   * `b`'s top a quarter of its tile from the centre, on the side it came
   * from: the line straight down `b`'s own rail lands on the centre, so two
   * lines into one step meet it at two points and share no stretch. Lines
   * out of one step share its rail down to the gap, a trunk that splits.
   */
  function between(a: Box, b: Box): string {
    const y = b.above;
    const toward = b.cx > a.cx ? R : -R;
    const land = b.cx - Math.sign(toward) * ((b.right - b.left) / 4);
    return `M ${a.cx} ${a.bottom} V ${y - R} Q ${a.cx} ${y} ${a.cx + toward} ${y} H ${land - toward} Q ${land} ${y} ${land} ${y + R} V ${b.top}`;
  }

  /** The path of one line between two measured tiles. */
  function pathOf(
    edge: Edge,
    a: Box,
    b: Box,
    columns: boolean
  ): Pick<Drawn, "d" | "pulse"> {
    if (edge.kind === "carries") {
      // Down from the step's tile, round, and along to the delegate's.
      const turn = b.cy - R;
      return {
        d: `M ${a.cx} ${a.bottom} V ${turn} Q ${a.cx} ${b.cy} ${a.cx + R} ${b.cy} H ${b.left}`,
        pulse: edge.pulse
          ? { x: a.cx, y: a.bottom, length: Math.max(0, turn - a.bottom) }
          : undefined,
      };
    }
    if (Math.abs(a.cx - b.cx) < 1) {
      return { d: `M ${a.cx} ${a.bottom} V ${b.top}` };
    }
    if (columns) {
      return { d: between(a, b) };
    }
    if (b.cx > a.cx) {
      // Out of the source's side, then down the other lane's rail.
      return {
        d: `M ${a.right} ${a.cy} H ${b.cx - R} Q ${b.cx} ${a.cy} ${b.cx} ${a.cy + R} V ${b.top}`,
      };
    }
    // Down the source's rail, then into the dependent's side.
    return {
      d: `M ${a.cx} ${a.bottom} V ${b.cy - R} Q ${a.cx} ${b.cy} ${a.cx - R} ${b.cy} H ${b.right}`,
    };
  }

  function measure(): void {
    const host = svg?.parentElement;
    if (!host) {
      return;
    }
    const origin = drawnBox(host);
    const x = (at: number) => at - origin.left;
    const y = (at: number) => at - origin.top;
    /** The gap above the row a tile stands in: its band of columns, else its own row. */
    const aboveOf = (el: Element): number => {
      const row = el.closest("[data-band]") ?? el.closest("[data-row]");
      const top = row ? drawnBox(row).top : 0;
      const prior = row?.previousElementSibling;
      return y(prior ? (drawnBox(prior).bottom + top) / 2 : top);
    };
    const box = (id: string): Box | null => {
      const el = host.querySelector(`[data-tile="${CSS.escape(id)}"]`);
      const r = el ? drawnBox(el) : null;
      if (!(el && r) || r.width === 0) {
        return null;
      }
      return {
        above: aboveOf(el),
        left: x(r.left),
        right: x(r.right),
        top: y(r.top),
        bottom: y(r.bottom),
        cx: x(r.left + r.width / 2),
        cy: y(r.top + r.height / 2),
      };
    };
    const columns = host.querySelector("[data-band]") !== null;
    drawn = edges.flatMap((edge): Drawn[] => {
      const a = box(edge.from);
      const b = box(edge.to);
      if (!(a && b)) {
        return [];
      }
      return [
        {
          id: `${edge.from}>${edge.to}`,
          from: edge.from,
          to: edge.to,
          kind: edge.kind,
          ...pathOf(edge, a, b, columns),
        },
      ];
    });
  }

  onMount(() => {
    const host = svg?.parentElement;
    if (!host) {
      return;
    }
    let until = 0;
    let frame = 0;
    const run = () => {
      measure();
      frame = performance.now() < until ? requestAnimationFrame(run) : 0;
    };
    const follow = () => {
      until = performance.now() + 700;
      if (!frame) {
        frame = requestAnimationFrame(run);
      }
    };
    // Any row that changes size moves the tiles under it (a fold, words
    // rewrapped as a font lands or a column narrows): the host's own size
    // need not change with it.
    const sizes = new ResizeObserver(follow);
    const watch = () => {
      sizes.observe(host);
      for (const row of host.querySelectorAll("[data-row], [data-band]")) {
        sizes.observe(row);
      }
    };
    watch();
    const changes = new MutationObserver(() => {
      watch();
      follow();
    });
    changes.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-open", "data-state", "data-status"],
    });
    follow();
    return () => {
      sizes.disconnect();
      changes.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    // A new set of lines (the live frame moving on) is measured at once.
    if (edges) {
      measure();
    }
  });
</script>

<svg aria-hidden="true" bind:this={svg} class="wires" data-slot="connectors">
  {#each drawn as wire, index (wire.id)}
    <path
      class="wire"
      d={wire.d}
      data-from={wire.from}
      data-kind={wire.kind}
      data-to={wire.to}
      pathLength="1"
    />
    {#if wire.pulse && wire.pulse.length > 0}
      <clipPath id="{uid}-{index}">
        <rect
          height={wire.pulse.length}
          width="2"
          x={wire.pulse.x - 1}
          y={wire.pulse.y}
        />
      </clipPath>
      <g class="pulse-run" clip-path="url(#{uid}-{index})">
        <rect
          class="pv-pulse"
          data-slot="pulse"
          height="24"
          style:--len="{wire.pulse.length + 24}px"
          width="2"
          x={wire.pulse.x - 1}
          y={wire.pulse.y - 24}
        />
      </g>
    {/if}
  {/each}
</svg>

<style>
  /* A point at the layer's corner the wires draw out from (layer px, no
     viewBox, never clipped): no box of its own over the rows, so the only
     paint it lays over them is each wire's, where that wire runs. */
  .wires {
    position: absolute;
    /* Physical: the wires are measured from the layer's left edge. */
    inset: 0 auto auto 0;
    z-index: 0;
    inline-size: 0;
    block-size: 0;
    overflow: visible;
    pointer-events: none;
  }
  .wire {
    fill: none;
    stroke: var(--nest-ink);
    stroke-width: 1px;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
    vector-effect: non-scaling-stroke;
  }
  @media (prefers-reduced-motion: no-preference) {
    .wire {
      transition: stroke-dashoffset var(--dur-toggle) var(--ease-out);

      @starting-style {
        stroke-dashoffset: 1;
      }
    }
    .pv-pulse {
      animation: pv-pulse var(--pv-sweep, var(--dur-loop)) linear infinite;
    }
  }
  .pulse-run {
    fill: var(--status-live-glyph);
    opacity: 0.5;
  }
  /* Drawn only while it moves: at rest (no animation, reduced motion, a
     frame whose runs were stopped) there is no band. */
  .pv-pulse {
    opacity: 0;
  }
  /* At rest at either end (a still picture is paused at the start): no
     band. It shows only along the way. */
  @keyframes pv-pulse {
    0% {
      opacity: 0;
      translate: 0 0;
    }
    15%,
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: 0 var(--len);
    }
  }
</style>
