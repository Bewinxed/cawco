<script lang="ts" module>
  import { cawco, type InstanceRow, isFailed, isStale } from "./client.svelte";

  /** What a session is doing, as the rim round its mark says it. */
  export type MarkStatus = "live" | "attn" | "done" | "fail" | "idle";
  /** Its word, for the row's accessible name: colour is never the only signal. */
  export const STATUS_WORD: Record<MarkStatus, string> = {
    live: "Working",
    attn: "Needs you",
    done: "Finished",
    fail: "Failed",
    idle: "Idle",
  };

  /**
   * A session's status, one rule for every row that draws its mark. `done`:
   * the row is listed as finished, so a session at rest there is done rather
   * than idle.
   */
  export function sessionStatus(
    instance: InstanceRow | null | undefined,
    done = false
  ): MarkStatus {
    if (!instance) {
      return "idle";
    }
    if (isFailed(instance)) {
      return "fail";
    }
    if (isStale(instance) || instance.status === "sleeping") {
      return "idle";
    }
    // A workflow run that ended has stopped; listed as finished, it is done.
    if (instance.status === "stopped") {
      return done ? "done" : "idle";
    }
    const activity = cawco.activityOf(instance.id);
    if (activity === "blocked") {
      return "attn";
    }
    if (activity === "working") {
      return "live";
    }
    return done ? "done" : "idle";
  }
</script>

<script lang="ts">
  /**
   * A session's mark: its sprite on its project's hue, the same tile in every
   * list that names a session, and round it a rim saying what it is doing.
   * Working, a sweep that runs round the rim; needs you or failed, the rim
   * standing in that status's ink; idle or finished, no rim. The rim stands
   * outside the tile, so the tile, the row and the nesting lines that meet
   * it never move for it.
   */
  import { markHue, sessionSprite } from "./mark";

  let {
    id,
    place,
    status,
  }: {
    /** The session, for its sprite. */
    id: string;
    /** Where it runs (its cwd, or its machine), for its hue. */
    place: string;
    status: MarkStatus;
  } = $props();

  const Sprite = $derived(sessionSprite(id));
  const rim = $derived(
    status === "live" || status === "attn" || status === "fail"
      ? status
      : undefined
  );
</script>

<span
  aria-hidden="true"
  class="session-mark"
  data-rim={rim}
  style:--fill="var(--mark-{markHue(place)})"
>
  <Sprite aria-hidden="true" class="session-mark-glyph" />
</span>

<style>
  /* The lead slot's tile (18px; --mark-size where a list sets its own) with
     its 12px glyph. */
  .session-mark {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--mark-size, 18px);
    block-size: var(--mark-size, 18px);
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);
    color: var(--mark-glyph);
  }
  .session-mark :global(.session-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
  /* The rim: a 1.5px ring 1px clear of the tile, on the tile's own curve
     (its radius grown by the ring's offset). The ring is a filled box with
     its middle masked out, so its paint can be a sweep.
     Both lengths are whole device pixels (--dpx, device-pixel.ts). The
     browser draws the tile and the ring each on the pixel grid, edge by
     edge: a ring 2.5px out on a 1x screen was drawn 3px out on one side and
     2px on the other, off the tile's centre and against its far edges. A
     whole number of device pixels out lands every edge the same distance
     from the tile's. */
  .session-mark[data-rim]::before {
    --rim-gap: max(var(--dpx, 1px), round(1px, var(--dpx, 1px)));
    --rim-ring: max(var(--dpx, 1px), round(1.5px, var(--dpx, 1px)));
    --rim-out: calc(var(--rim-gap) + var(--rim-ring));
    content: "";
    position: absolute;
    /* Over the nesting arm that ends at the tile (.kit-nest, z-index 1):
       the arm runs under the ring, never across it. */
    z-index: 2;
    inset: calc(-1 * var(--rim-out));
    padding: var(--rim-ring);
    border-radius: calc(var(--radius-xs) + var(--rim-out));
    background: var(--rim);
    mask:
      linear-gradient(#000 0 0) content-box exclude,
      linear-gradient(#000 0 0);
    pointer-events: none;
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .session-mark[data-rim="attn"] {
    --rim: var(--status-attn-glyph);
  }
  .session-mark[data-rim="fail"] {
    --rim: var(--status-fail-glyph);
  }
  .session-mark[data-rim="live"] {
    --rim: var(--status-live-glyph);
  }
  /* Working: an arc of the live ink running round the rim, fading out along
     its tail, once a --dur-loop. */
  @media (prefers-reduced-motion: no-preference) {
    .session-mark[data-rim="live"]::before {
      background: conic-gradient(
        from var(--rim-turn),
        transparent 0turn,
        var(--status-live-glyph) 0.45turn,
        transparent 0.45turn
      );
      animation: kit-rim-sweep var(--dur-loop) linear infinite;
    }
  }
</style>
