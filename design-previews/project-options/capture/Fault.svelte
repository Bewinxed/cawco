<!--
  The failure pattern (report part 4, rulings 5 and F), one component in two
  sizes: the error Alert (the kit's, its destructive status pair: "A compact
  tinted row, never a slab … No border") holding the three slots in their
  fixed order, who, when, now, and when the board last read.

  - `band` (F1): the Alert as one row under the bar, over the kept board.
  - `popover` (F2): the same Alert stacked, in the popover the place's stale
    mark opens.

  The WHEN slot is drawn, not only written (The Show Don't Tell Rule): its
  glyph is the Task ring recipe, wound from the top as a clock is read,
  emptying over the wait, the seconds beside it. The wait is the client's
  own (`scheduleReconnect`: 1000ms × 2^attempt, capped at 30000ms; config.ts
  6-8), read from `retryAt`: the frame (frame.js, `retryClock`) runs that
  schedule and writes the ring's arc, the seconds and the time of the last
  good read. The words are the advisor's for a hub that answered 502, drawn
  for the state.
-->
<script>
  import { Alert, Button, IconChevronRight } from "./kit.js";

  let { size = "band" } = $props();
  const stacked = $derived(size === "popover");
  /** The ring's geometry: the Task ring's 16px, its stroke the ring's own. */
  const box = 16;
  const stroke = 2;
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
</script>

<Alert
  data-fault={size}
  data-band={size === "band" ? "" : undefined}
  class={["gap-x-space-3 gap-y-space-2", stacked ? "flex flex-col items-start" : "flex flex-wrap items-center"]}
  variant="destructive"
>
  <span class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1">
    <svg
      aria-hidden="true"
      class="size-icon-md flex-none"
      data-ring
      data-circumference={circumference}
      viewBox="0 0 {box} {box}"
    >
      <circle cx={box / 2} cy={box / 2} fill="none" opacity="0.25" r={radius} stroke="currentColor" stroke-width={stroke} />
      <!-- Wound from the top, as a clock is read; the frame sets its arc to the share of the wait still to run. -->
      <circle
        class="origin-center -rotate-90 transform-view"
        cx={box / 2}
        cy={box / 2}
        data-ring-arc
        fill="none"
        r={radius}
        stroke="currentColor"
        stroke-dasharray="{circumference} {circumference}"
        stroke-linecap="round"
        stroke-width={stroke}
      />
    </svg>
    <span data-slot="who" class="type-label">The hub didn't answer (502)</span>
    <span data-slot="when" class="type-meta"
      >Trying again in <span data-slot="num" class="num">1</span> s</span
    >
    <span data-slot="as-of" class="type-meta">as of <time class="num" data-as-of></time></span>
  </span>
  <span data-slot="now" class={["flex items-center gap-space-2", !stacked && "ms-auto"]}>
    <Button size="sm" variant="outline">Retry now</Button>
    <Button size="sm" variant="ghost"><span>Details</span><IconChevronRight aria-hidden="true" /></Button>
  </span>
</Alert>
