<script lang="ts">
  import { graphWords as words } from "@cawco/core/words/graph";
  /**
   * A curve drawn to be bent (his pick on animation-face-questions: the
   * Curve chip lets him draw his own, as Jitter's easing popover does):
   * progress up
   * against time across, the line from the start to the end, and its two
   * control points, each dragged with the pointer or moved with the arrow
   * keys (0.05, Shift 0.01). Letting go hands the four numbers back.
   */
  import type { PointerEventHandler } from "svelte/elements";

  let {
    at = [0, 0, 1, 1],
    onbend,
    easing = null,
  }: {
    /** The curve's four numbers: x1, y1, x2, y2. */
    at?: number[];
    /** Its points bent: absent, the curve is drawn read only. */
    onbend?: (at: number[]) => void;
    /** A `linear(…)` easing (a spring's) drawn read only, its points evenly apart, in the bezier's place. */
    easing?: string | null;
  } = $props();
  const FIGURES = /-?\d*\.?\d+/gu;
  /** A `linear(…)` easing's points, evenly apart across the box. */
  const linearPath = $derived.by(() => {
    const said = easing?.trim() ?? "";
    if (!said.startsWith("linear(")) {
      return null;
    }
    const values = (said.slice("linear(".length, -1).match(FIGURES) ?? []).map(
      Number
    );
    return values.length < 2
      ? null
      : values
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${(W * i) / (values.length - 1)} ${yOf(p)}`
          )
          .join(" ");
  });

  const W = 160;
  const H = 90;
  /** Progress from a little under 0 to a little over 1, so an overshoot stands inside the box (a spring's past it is drawn past the box's edge). */
  const LOW = -0.25;
  const HIGH = 1.25;
  const yOf = (p: number) => (H * (HIGH - p)) / (HIGH - LOW);
  /** The numbers while a point is held; the curve's own at rest. */
  let held = $state<{ for: number[]; at: number[] } | null>(null);
  /** The curve as he left it stands until the numbers come back changed. */
  const shown = $derived(held && held.for === at ? held.at : at);
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = $derived(shown);
  let box = $state<HTMLElement>();
  let dragging: 0 | 1 | null = null;
  const STEP = 0.05;
  const FINE = 0.01;

  const place = (point: 0 | 1, x: number, y: number) => {
    const next = [...shown];
    next[point * 2] = Math.min(1, Math.max(0, Math.round(x * 100) / 100));
    next[point * 2 + 1] = Math.min(
      HIGH,
      Math.max(LOW, Math.round(y * 100) / 100)
    );
    return next;
  };
  const fromPointer = (
    event: PointerEvent,
    from: HTMLElement
  ): [number, number] => {
    const r = from.getBoundingClientRect();
    return [
      (event.clientX - r.left) / r.width,
      HIGH - ((event.clientY - r.top) / r.height) * (HIGH - LOW),
    ];
  };
  const take =
    (point: 0 | 1): PointerEventHandler<HTMLElement> =>
    (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragging = point;
    };
  const drag = (event: PointerEvent) => {
    if (dragging !== null && box) {
      held = { for: at, at: place(dragging, ...fromPointer(event, box)) };
    }
  };
  const letGo = () => {
    if (held && dragging !== null) {
      onbend?.(held.at);
    }
    dragging = null;
  };
  const key = (point: 0 | 1) => (event: KeyboardEvent) => {
    const by = event.shiftKey ? FINE : STEP;
    const move = {
      ArrowRight: [by, 0],
      ArrowLeft: [-by, 0],
      ArrowUp: [0, by],
      ArrowDown: [0, -by],
    }[event.key];
    if (move) {
      event.preventDefault();
      const [dx = 0, dy = 0] = move;
      const next = place(
        point,
        (shown[point * 2] ?? 0) + dx,
        (shown[point * 2 + 1] ?? 0) + dy
      );
      held = { for: at, at: next };
      onbend?.(next);
    }
  };
  const points = $derived([
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]);
</script>

<div
  bind:this={box}
  class="relative aspect-16/9 w-full touch-none"
  onpointercancel={letGo}
  onpointermove={drag}
  onpointerup={letGo}
  role="presentation"
>
  <svg
    aria-hidden="true"
    class="size-full overflow-visible rounded-md border border-border-hairline bg-surface-recess text-ink-strong"
    data-slot="curve-graph"
    fill="none"
    preserveAspectRatio="none"
    viewBox="0 0 {W} {H}"
  >
    <path
      class="stroke-border-control"
      d="M0 {yOf(0)} H{W} M0 {yOf(1)} H{W}"
      stroke-dasharray="2 3"
      vector-effect="non-scaling-stroke"
    />
    {#if linearPath}
      <path
        d={linearPath}
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    {:else}
      <path
        class="stroke-ink-muted"
        d="M0 {yOf(0)} L{W * x1} {yOf(y1)} M{W} {yOf(1)} L{W * x2} {yOf(y2)}"
        vector-effect="non-scaling-stroke"
      />
      <path
        d="M0 {yOf(0)} C{W * x1} {yOf(y1)} {W * x2} {yOf(y2)} {W} {yOf(1)}"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    {/if}
  </svg>
  {#each onbend && !linearPath ? points : [] as point, index (index)}
    {@const which = index === 0 ? 0 : 1}
    <span
      aria-label={words.curvePoint(index + 1)}
      aria-valuetext="{point.x.toFixed(2)}, {point.y.toFixed(2)}"
      class="pointer-hit touch-hit absolute start-(--x) top-(--y) size-space-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-pill border border-border-row-outline bg-surface-raised shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 rtl:translate-x-1/2"
      onkeydown={key(which)}
      onpointerdown={take(which)}
      role="slider"
      aria-valuenow={point.x}
      style:--x="{point.x * 100}%"
      style:--y="{(yOf(point.y) / H) * 100}%"
      tabindex="0"
    ></span>
  {/each}
</div>
