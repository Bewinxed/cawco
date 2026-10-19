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
   * gutter beside its own tile. A line draws down over 160ms when it first
   * appears (Thinking steps). Where a step's delegate is working, a band of
   * the live ink travels its line once per --dur-loop, by transform only,
   * and is drawn only while it moves.
   *
   * Measured off the tiles (`data-tile`) in this layer's parent, again on
   * every frame of a change in it (a fold opening, a row arriving).
   */
  import { onMount } from "svelte";

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
    bottom: number;
    cx: number;
    cy: number;
    left: number;
    right: number;
    top: number;
  }

  /** The path of one line between two measured tiles. */
  function pathOf(edge: Edge, a: Box, b: Box): Pick<Drawn, "d" | "pulse"> {
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
    const origin = host.getBoundingClientRect();
    const box = (id: string): Box | null => {
      const el = host.querySelector(`[data-tile="${CSS.escape(id)}"]`);
      const r = el?.getBoundingClientRect();
      if (!r || r.width === 0) {
        return null;
      }
      return {
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
        cx: r.left - origin.left + r.width / 2,
        cy: r.top - origin.top + r.height / 2,
      };
    };
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
          ...pathOf(edge, a, b),
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
    const sizes = new ResizeObserver(follow);
    sizes.observe(host);
    const changes = new MutationObserver(follow);
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
  .wires {
    position: absolute;
    inset: 0;
    z-index: 0;
    inline-size: 100%;
    block-size: 100%;
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
