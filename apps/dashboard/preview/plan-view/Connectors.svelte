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
   * THE CONNECTORS (proposal, Lanes and Crew first): the lines the panel
   * draws between tiles, in the nesting rail's stroke (1px, `nest-ink`)
   * with the rail's own quarter-turn at each bend, under the tiles. Lanes
   * leaves a tile's foot and arrives at the dependent's top, bending across
   * a lane; Crew first runs every line straight down the mark column, and a
   * line that would cross another tile takes the column's inline-start side
   * instead. A line draws down over 160ms when it first appears (Thinking
   * steps). Where a step's delegate is working, a band of the live ink
   * travels its line once per --dur-loop, by transform only.
   *
   * Measured off the tiles (`data-tile`) in this layer's parent, again on
   * every frame of a change in it (a fold opening, a row arriving).
   */
  import { onMount } from "svelte";

  let { edges, mode }: { edges: Edge[]; mode: "lanes" | "column" } = $props();

  interface Drawn {
    d: string;
    id: string;
    kind: Edge["kind"];
    /** The run a band travels: its x, top and length. */
    pulse?: { x: number; y: number; length: number };
  }

  const uid = $props.id();
  let svg = $state<SVGSVGElement>();
  let drawn = $state<Drawn[]>([]);
  const R = 4;
  const BEND = 7;

  function measure(): void {
    const host = svg?.parentElement;
    if (!host) {
      return;
    }
    const origin = host.getBoundingClientRect();
    const box = (id: string) => {
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
    const tops = [...host.querySelectorAll("[data-tile]")]
      .filter((el) => !el.getAttribute("data-tile")?.startsWith("d:"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top - origin.top,
          cx: r.left - origin.left + r.width / 2,
        };
      });
    drawn = edges.flatMap((edge): Drawn[] => {
      const a = box(edge.from);
      const b = box(edge.to);
      if (!(a && b)) {
        return [];
      }
      const id = `${edge.from}>${edge.to}`;
      if (edge.kind === "carries") {
        // Down from the step's tile, round, and along to the delegate's.
        const turn = b.cy - R;
        return [
          {
            id,
            kind: edge.kind,
            d: `M ${a.cx} ${a.bottom} V ${turn} Q ${a.cx} ${b.cy} ${a.cx + R} ${b.cy} H ${b.left}`,
            pulse: edge.pulse
              ? { x: a.cx, y: a.bottom, length: Math.max(0, turn - a.bottom) }
              : undefined,
          },
        ];
      }
      if (Math.abs(a.cx - b.cx) < 1) {
        const crosses = tops.some(
          (t) =>
            Math.abs(t.cx - a.cx) < 1 && t.top > a.bottom && t.top < b.top - 1
        );
        if (crosses && mode === "column") {
          // Round the tiles between, on the column's inline-start side.
          const x = a.left - BEND;
          return [
            {
              id,
              kind: edge.kind,
              d: `M ${a.left} ${a.cy} H ${x + R} Q ${x} ${a.cy} ${x} ${a.cy + R} V ${b.cy - R} Q ${x} ${b.cy} ${x + R} ${b.cy} H ${b.left}`,
            },
          ];
        }
        return [{ id, kind: edge.kind, d: `M ${a.cx} ${a.bottom} V ${b.top}` }];
      }
      // Across a lane: bend just after the source going out, just before
      // the dependent coming back.
      const out = b.cx > a.cx;
      const y = out ? a.bottom + BEND : b.top - BEND;
      const dir = out ? 1 : -1;
      return [
        {
          id,
          kind: edge.kind,
          d: `M ${a.cx} ${a.bottom} V ${y - R} Q ${a.cx} ${y} ${a.cx + dir * R} ${y} H ${b.cx - dir * R} Q ${b.cx} ${y} ${b.cx} ${y + R} V ${b.top}`,
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
    <path class="wire" d={wire.d} data-kind={wire.kind} pathLength="1" />
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
  .pv-pulse {
    @media (prefers-reduced-motion: reduce) {
      display: none;
    }
  }
  @keyframes pv-pulse {
    to {
      translate: 0 var(--len);
    }
  }
</style>
