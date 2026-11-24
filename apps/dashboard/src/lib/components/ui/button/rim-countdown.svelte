<script lang="ts">
  /**
   * The time an armed button has left before it disarms, drawn along its
   * rim: a 2px line over the button's edge, starting whole at the top's
   * middle and running out back towards it over --duration-arm (owner's
   * pick, 2026-11-24: "a ring that draws alongside the rims that shows how
   * much time left before acting").
   *
   * One path round the button's own rounded box, measured from it, with
   * `pathLength` 1, so the line runs out at one speed along every side and
   * round every corner (a conic sweep from the centre would cross a wide
   * button's long sides slower than its ends). It stands on the button's
   * border box (`-inset-px` over its 1px edge), its stroke from the outer
   * edge 2px in, in the button's ink (`currentColor`).
   */
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { dur } from "#lib/platform/motion/curves.svelte.js";

  let { armed }: { armed: boolean } = $props();

  /** The stroke's width; its centre line runs this far in from the edge, halved. */
  const STROKE = 2;

  let box = $state({ w: 0, h: 0, r: 0 });
  const measure = frameSize(
    (node: HTMLElement) => {
      const host = node.parentElement;
      return {
        w: node.offsetWidth,
        h: node.offsetHeight,
        r: host
          ? Number.parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0
          : 0,
      };
    },
    (value) => {
      box = value;
    }
  );

  /** Clockwise from the top's middle, round the box inset by half the stroke. */
  const d = $derived.by(() => {
    const { w, h } = box;
    if (w === 0 || h === 0) {
      return "";
    }
    const i = STROKE / 2;
    const r = Math.max(
      0,
      Math.min(box.r - i, (w - STROKE) / 2, (h - STROKE) / 2)
    );
    const [x0, y0, x1, y1] = [i, i, w - i, h - i];
    const arc = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;
    return [
      `M ${w / 2} ${y0}`,
      `H ${x1 - r}`,
      arc(x1, y0 + r),
      `V ${y1 - r}`,
      arc(x1 - r, y1),
      `H ${x0 + r}`,
      arc(x0, y1 - r),
      `V ${y0 + r}`,
      arc(x0 + r, y0),
      "Z",
    ].join(" ");
  });

  let line = $state<SVGPathElement | null>(null);
  /** Each arming runs the line out from whole, over the arm's whole window. */
  $effect(() => {
    if (!(armed && line && d)) {
      return;
    }
    const run = line.animate(
      [{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }],
      { duration: dur("--duration-arm"), easing: "linear", fill: "forwards" }
    );
    return () => run.cancel();
  });
</script>

<span
  {@attach measure}
  aria-hidden="true"
  class="pointer-events-none absolute -inset-px opacity-0 transition-[opacity] duration-(--duration-fast) ease-out data-armed:opacity-100"
  data-armed={armed || undefined}
  data-slot="rim-countdown"
>
  <svg aria-hidden="true" class="size-full overflow-visible" fill="none">
    {#if d}
      <path
        bind:this={line}
        {d}
        pathLength="1"
        stroke="currentColor"
        stroke-dasharray="1 1"
        stroke-linecap="round"
        stroke-width={STROKE}
      />
    {/if}
  </svg>
</span>
