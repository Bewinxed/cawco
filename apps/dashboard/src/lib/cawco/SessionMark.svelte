<script lang="ts" module>
  import { cawco, type InstanceRow, isFailed, isStale } from "./client.svelte";

  /** What a session is doing, as its mark says it. */
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
   * A session's mark: its sprite on its project's hue, the same 18px tile in
   * every list that names a session. It is also the one place that says how
   * many delegates a session has, and the switch that opens them.
   *
   * - Delegates: up to three shaded copies of the tile stand behind it as a
   *   deck, receding downward outside the 18px box, one a delegate; the tile
   *   shows the count in place of the sprite. Under a fine pointer, and
   *   while its rows are open, the number gives way to a chevron. The mark's
   *   hit area is the switch; the rest of the row still opens the session.
   *   The deck is away while its rows are out (app.css, by the group under
   *   the row): the children's icons leave from it and come back to it
   *   (motion/branch).
   * - Working: the tile echoes. A copy of it grows from under the tile and
   *   fades, each working row in its list a beat after the one above
   *   (motion/echo `echoBeat`, on the list). With reduced motion, a still
   *   hairline round the tile instead.
   * - Needs you, failed: a ring round the tile in that status's ink, behind
   *   the deck. Idle or finished: nothing.
   *
   * Everything stands outside the tile, so the tile, the row and the nesting
   * lines that meet it never move for it.
   */
  import ChevronIcon from "~icons/solar/alt-arrow-right-bold-duotone";
  import { markHue, sessionSprite } from "./mark";

  let {
    id,
    place,
    status,
    count = 0,
    open = false,
    ontoggle,
  }: {
    /** The session, for its sprite. */
    id: string;
    /** Where it runs (its cwd, or its machine), for its hue. */
    place: string;
    status: MarkStatus;
    /** The delegates under it, at every depth. */
    count?: number;
    /** Its delegates' rows are out. */
    open?: boolean;
    /** Opens and folds them; without it the mark only says the count. */
    ontoggle?: () => void;
  } = $props();

  const Sprite = $derived(sessionSprite(id));
  const rim = $derived(
    status === "live" || status === "attn" || status === "fail"
      ? status
      : undefined
  );
  const has = $derived(count > 0);
  /** The tile has room for two figures. */
  const shown = $derived(count >= 100 ? "99" : String(count));
  const label = $derived(
    `${open ? "Hide" : "Show"} ${count} delegate${count === 1 ? "" : "s"}`
  );

  /**
   * The switch's press is its own and never the row's link's (it sits inside
   * it, so it is a button by role: a <button> cannot nest in an <a>).
   */
  function toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    ontoggle?.();
  }
</script>

<!-- What the tile shows: the sprite, or the count and the chevron it gives
     way to. Drawn in the tile and in its echo. -->
{#snippet face()}
  {#if has}
    <span class="num">{shown}</span>
    <span class="chev"><ChevronIcon aria-hidden="true" /></span>
  {:else}
    <Sprite aria-hidden="true" class="session-mark-glyph" />
  {/if}
{/snippet}

<span
  class="session-mark"
  data-has={has || undefined}
  data-open={(has && open) || undefined}
  data-rim={rim}
  style:--fill="var(--mark-{markHue(place)})"
  style:--n={Math.min(count, 3)}
>
  {#if status === "live"}
    <!-- First, so it is drawn under the deck and the tile. -->
    <span aria-hidden="true" class="echo tile" data-echo>{@render face()}</span>
  {/if}
  {#if has}
    <span aria-hidden="true" class="deck" data-deck={Math.min(count, 3)}>
      {#each [1, 2, 3] as i (i)}
        <span class="card" style:--i={i}></span>
      {/each}
    </span>
  {/if}
  <span aria-hidden="true" class="face tile">{@render face()}</span>
  <span aria-hidden="true" class="skin" data-ride-skin></span>
  {#if has && ontoggle}
    <!-- biome-ignore lint/a11y/useSemanticElements: it sits inside the row's link, and a <button> cannot nest in an <a>. -->
    <span
      aria-expanded={open}
      aria-label={label}
      class="hit focus-inset"
      onclick={toggle}
      onkeydown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          toggle(event);
        }
      }}
      role="button"
      tabindex="0"
    ></span>
  {/if}
</span>

<style>
  /* The lead slot's box (18px; --mark-size where a list sets its own): the
     scene its deck recedes in. Over the nesting arm that ends at the tile
     (.kit-nest, z-index 1): the arm runs under the mark, never across it. */
  .session-mark {
    --size: var(--mark-size, 18px);
    position: relative;
    /* A step up while its rows are out: their marks start and end their
       ride under it (app.css, motion/branch). */
    z-index: var(--mark-level, 2);
    display: inline-block;
    flex: none;
    inline-size: var(--size);
    block-size: var(--size);
    color: var(--mark-glyph);
    perspective: var(--deck-depth);
    perspective-origin: calc(var(--size) / 2)
      calc(var(--size) + var(--deck-step) / var(--deck-shrink));
  }
  /* The tile, and its copy that echoes. */
  .tile {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);

    & > :global(*) {
      grid-area: 1 / 1;
    }
  }
  .session-mark :global(.session-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
  /* The echo rests unseen under the tile; its list beats it (motion/echo). */
  .echo {
    opacity: 0;
    pointer-events: none;
  }

  /* The deck: the tile's copies behind it. Card i stands i places back
     (1 nearest), the tile scaled by 1 - --deck-shrink x its place through
     the scene's perspective, so it shows --deck-step below the one in
     front; a card with no delegate to stand for is not drawn. */
  .deck {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    pointer-events: none;
  }
  .card,
  .skin {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);
  }
  .card {
    --p: max(0, calc(var(--n) - var(--i) + 1));
    opacity: clamp(0, calc(var(--n) - var(--i) + 1), 1);
    transform: translateZ(
      calc(
        -1 *
        var(--deck-depth) *
        (1 / (1 - var(--deck-shrink) * var(--p)) - 1)
      )
    );
  }
  /* The skin: a delegate's tile wears its parent's card (--p its place,
     --pfill the parent's colour) as it leaves the deck, and sheds it on its
     way to its row (motion/branch). Unseen at rest. */
  .skin {
    --p: 1;
    background-color: var(--pfill, var(--fill));
    opacity: 0;
    pointer-events: none;
  }
  .card,
  .skin {
    /* Darker with depth. */
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--mark-deck-shade);
      opacity: calc(var(--p) * var(--deck-shade-step));
    }
    /* The shadow the card in front casts on the band of this one that
       shows. */
    &::before {
      content: "";
      position: absolute;
      z-index: 1;
      inset-inline: 0;
      inset-block-start: 0;
      block-size: calc(var(--deck-step) * 1.5);
      background: linear-gradient(var(--mark-deck-cast), transparent);
      transform: translateY(
        calc(
          (
            var(--size) -
            var(--deck-step) -
            var(--size) *
            var(--deck-shrink) *
            var(--p)
          ) /
          (1 - var(--deck-shrink) * var(--p))
        )
      );
    }
  }

  /* The count, and the chevron it gives way to: both stay in the tile; the
     one leaving shrinks and blurs out as the other grows and sharpens in.
     Transitions, so a pointer that turns back mid-way turns them with it. */
  .num {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  /* Which of the two shows (--away: 1 for the one that has given way). The
     swap is by opacity; the shrink and the blur are motion, and ride on it
     only where motion is welcome. */
  .num,
  .chev {
    opacity: calc(1 - var(--away));
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .num {
    --away: 0;
  }
  .chev {
    --away: 1;
    display: inline-flex;
    inline-size: 12px;
    block-size: 12px;

    & :global(svg) {
      inline-size: 100%;
      block-size: 100%;
    }
  }
  .session-mark[data-open] {
    & .num {
      --away: 1;
    }
    & .chev {
      --away: 0;
    }
    & .chev :global(svg) {
      rotate: 90deg;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .session-mark[data-has]:has(.hit:hover) {
      & .num {
        --away: 1;
      }
      & .chev {
        --away: 0;
      }
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .num,
    .chev {
      scale: calc(1 - 0.75 * var(--away));
      filter: blur(calc(4px * var(--away)));
      transition:
        opacity var(--dur-control) var(--ease-out),
        scale var(--dur-control) var(--ease-out),
        filter var(--dur-control) var(--ease-out);
    }
    .chev :global(svg) {
      transition: rotate var(--dur-toggle) var(--ease-out);
    }
    .face {
      transition: scale var(--dur-toggle) var(--ease-out);
    }
    /* The press: the tile gives a little under it. */
    .session-mark:has(.hit:active) .face {
      scale: var(--press-scale);
    }
  }

  /* The switch: over the tile, the ring's place round it and the deck under
     it, and never past the gap to the next row (--mark-hit-max, the room a
     row leaves under its mark plus the gap between rows), so it takes no
     press meant for the row below. */
  .hit {
    /* The ring's reach round the tile, in whole pixels. */
    --reach: 3px;
    position: absolute;
    z-index: 4;
    inset: calc(-1 * var(--reach));
    inset-block-end: calc(
      -1 *
      min(
        var(--n) *
        var(--deck-step) +
        var(--reach),
        var(--mark-hit-max, calc(5px + var(--tree-gap)))
      )
    );
    border-radius: var(--radius-xs);
    cursor: pointer;
  }

  /* The ring, for a session that needs you or has failed: 1.5px, 1px clear
     of the tile, on the tile's own curve (its radius grown by the ring's
     offset), drawn first so it stands behind the deck. A filled box with its
     middle masked out.
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
    position: absolute;
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
  .session-mark[data-rim]::before {
    content: "";
  }
  .session-mark[data-rim="attn"] {
    --rim: var(--status-attn-glyph);
  }
  .session-mark[data-rim="fail"] {
    --rim: var(--status-fail-glyph);
  }
  /* Working: a still hairline in the live ink in the ring's place, which
     the echo stands in for wherever motion is welcome. */
  .session-mark[data-rim="live"] {
    --rim: var(--status-live-glyph);
  }
  .session-mark[data-rim="live"]::before {
    --rim-ring: max(var(--dpx, 1px), round(1px, var(--dpx, 1px)));
  }
  @media (prefers-reduced-motion: no-preference) {
    .session-mark[data-rim="live"]::before {
      content: none;
    }
  }
</style>
