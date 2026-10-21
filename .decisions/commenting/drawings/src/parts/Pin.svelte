<!--
  A marker placed on the page at its pressed point (`x`, `y` inside the
  positioned element that holds it).
  - `tail`: the tail-corner pill stands up-right of the point, its tail
    corner on it; where the well's edge leaves no room, up-left or below.
  - `stem`: the round pill stands centred over a 4px dot on the point, a stem
    between them (28px tall in all); at the well's edge the pill slides in
    (`shift`) and the stem stays on the point.
  `deck` draws the comments stacked behind it, each `--deck-step` ×2 further
  down-right, at most two.
-->
<script lang="ts">
  import type { PinState } from "../data";
  import Marker from "./Marker.svelte";

  let {
    x,
    y,
    n = null,
    state = "sent",
    shape = "tail",
    place = "up-right",
    shift = "0px",
    focused = false,
    dot = null,
    deck = [],
  }: {
    x: string;
    y: string;
    n?: number | null;
    state?: PinState;
    shape?: "tail" | "stem";
    place?: "up-right" | "up-left" | "below";
    shift?: string;
    focused?: boolean;
    dot?: "live" | "unread" | null;
    deck?: number[];
  } = $props();

  const TAIL = {
    "up-right": "bottom-start",
    "up-left": "bottom-end",
    below: "top-start",
  } as const;
  const MOVE = {
    "up-right": "translate-y-[-100%]",
    "up-left": "translate-x-[-100%] translate-y-[-100%]",
    below: "",
  } as const;
</script>

<span
  class="pointer-events-none absolute z-10 size-0"
  data-pin={n ?? "new"}
  data-shape={shape}
  style:inset-inline-start={x}
  style:inset-block-start={y}
>
  {#if shape === "tail"}
    <span class={["absolute start-0 top-0 grid", MOVE[place]]}>
      {#each deck.slice(0, 2).toReversed() as behind, k (behind)}
        <span
          class="col-start-1 row-start-1"
          style:translate={`calc(var(--deck-step) * 2 * ${deck.slice(0, 2).length - k}) calc(var(--deck-step) * 2 * ${deck.slice(0, 2).length - k})`}
        >
          <Marker n={behind} {state} tail={TAIL[place]} />
        </span>
      {/each}
      <span class="col-start-1 row-start-1" data-pin-front>
        <Marker {dot} {focused} {n} {state} tail={TAIL[place]} />
      </span>
    </span>
  {:else}
    <span
      class="absolute start-0 top-0 grid translate-x-[-50%] translate-y-[calc(-100%+2px)]"
    >
      {#each deck.slice(0, 2).toReversed() as behind, k (behind)}
        <span
          class="col-start-1 row-start-1 flex flex-col items-center"
          style:translate={`calc(var(--deck-step) * 2 * ${deck.slice(0, 2).length - k}) calc(var(--deck-step) * 2 * ${deck.slice(0, 2).length - k})`}
        >
          <Marker n={behind} {state} />
          <span class="h-1 w-px bg-action-solid"></span>
          <span class="size-1 rounded-pill bg-action-solid"></span>
        </span>
      {/each}
      <span
        class="col-start-1 row-start-1 flex flex-col items-center"
        data-pin-front
      >
        <span style:translate={`${shift} 0`}>
          <Marker {dot} {focused} {n} {state} />
        </span>
        <span class="h-1 w-px bg-action-solid"></span>
        <span
          class="size-1 rounded-pill bg-action-solid ring-2 ring-surface-raised"
        ></span>
      </span>
    </span>
  {/if}
</span>
