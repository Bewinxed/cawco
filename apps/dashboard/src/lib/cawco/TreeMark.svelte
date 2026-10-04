<script lang="ts" module>
  /** What a row is doing, as its mark says it. */
  export type MarkStatus = "live" | "attn" | "done" | "fail" | "idle";
</script>

<script lang="ts">
  /**
   * A tree row's mark: the 18px tile that leads every row a list nests rows
   * under (a session and its delegates, a project and its sessions, the
   * "N older" row), and the one place that says how many rows a parent has
   * and opens them. What stands on the tile at rest is the caller's (`face`:
   * a session's sprite, a project's folder, the history glyph).
   *
   * - A parent with a count: up to three shaded copies of the tile stand
   *   behind it as a deck, receding downward outside the 18px box, one a
   *   row under it; the tile shows the count in place of its face. The deck
   *   is away while its rows are out (app.css, by the group under the row):
   *   the children's marks leave from it and come back to it (motion/branch).
   * - A switch: under a fine pointer, and while its rows are open, what the
   *   tile shows gives way to a chevron. With `ontoggle` the mark's own hit
   *   area is the switch, and the rest of the row still does what the row
   *   does (a session row opens the session). With `rowToggles` the row is
   *   the switch (a project's row, the "N older" row, each a button): the
   *   mark draws the same morph and takes no press of its own. A count that
   *   is the parent's own status (`countIsStatus`: a project's running
   *   sessions) stays on the tile while its rows are out.
   * - Working: the tile echoes. A copy of it grows from under the tile and
   *   fades, each working row in its list a beat after the one above
   *   (motion/echo `echoBeat`, on the list). With reduced motion, a still
   *   dot in the live ink instead.
   * - Needs you, failed: a dot on the tile's top-right corner in that
   *   status's ink, the tile cut away round it so it reads on any hue. The
   *   failed dot is still; the needs-you dot echoes as a working tile does,
   *   on the same beat. Idle, finished or no status: nothing.
   *
   * The dot is decoration: the row says the status in its name. Nothing
   * here moves the tile, the row or the nesting lines that meet it.
   */
  import type { Snippet } from "svelte";
  import ChevronIcon from "~icons/solar/alt-arrow-right-bold-duotone";

  let {
    count = 0,
    open = false,
    ontoggle,
    rowToggles = false,
    countIsStatus = false,
    fill,
    status,
    noun = "delegate",
    face,
  }: {
    /** The rows under it, at every depth. */
    count?: number;
    /** Its rows are out. */
    open?: boolean;
    /** Opens and folds them from the mark's own hit area. */
    ontoggle?: () => void;
    /** The row itself is the switch: the mark only draws the morph. */
    rowToggles?: boolean;
    /**
     * The count says something about the parent (a project's running
     * sessions), not how many rows are listed under it: it stays on the
     * tile while the rows are out, and the chevron shows only under a
     * pointer.
     */
    countIsStatus?: boolean;
    /** The tile's colour; without one the face stands bare, in muted ink. */
    fill?: string;
    status?: MarkStatus;
    /** What one row under it is, for the switch's name ("3 delegates"). */
    noun?: string;
    /** What the tile shows when it has no count. */
    face: Snippet;
  } = $props();

  const dot = $derived(
    status === "live" || status === "attn" || status === "fail"
      ? status
      : undefined
  );
  const has = $derived(count > 0);
  /** Rows hang under it: it draws the chevron its face gives way to. */
  const parent = $derived(has || rowToggles);
  /** The tile has room for two figures. */
  const shown = $derived(count >= 100 ? "99" : String(count));
  const label = $derived(
    `${open ? "Hide" : "Show"} ${count} ${noun}${count === 1 ? "" : "s"}`
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

<span
  class="tree-mark"
  data-bare={fill ? undefined : ""}
  data-dot={dot}
  data-has={has || undefined}
  data-open={(parent && open) || undefined}
  data-status-count={countIsStatus ? "" : undefined}
  data-switch={(has && ontoggle) || rowToggles ? "" : undefined}
  style:--fill={fill}
  style:--n={Math.min(count, 3)}
>
  {#if has}
    <span aria-hidden="true" class="deck" data-deck={Math.min(count, 3)}>
      {#each [1, 2, 3] as i (i)}
        <span class="card" style:--i={i}></span>
      {/each}
    </span>
  {/if}
  <!-- What the tile shows: its face, or its count, and the chevron either
       gives way to. The echo is the bare tile: only what grows past the
       tile is ever seen of it. -->
  <span aria-hidden="true" class="face tile">
    <span class="rest">
      {#if has}
        <span class="num">{shown}</span>
      {:else}
        {@render face()}
      {/if}
    </span>
    {#if parent}
      <span class="chev"><ChevronIcon aria-hidden="true" /></span>
    {/if}
  </span>
  <span aria-hidden="true" class="skin" data-ride-skin></span>
  {#if dot}
    <span aria-hidden="true" class="dot"></span>
  {/if}
  {#if status === "live"}
    <!-- Last of what the mark draws, in a box cut to the outside of the
         tile and its deck (the style below says why). -->
    <span aria-hidden="true" class="echo-box">
      <span class="echo tile" data-echo></span>
    </span>
  {:else if status === "attn"}
    <!-- The dot's echo, on its list's beat with the working tiles. Over the
         dot it is the dot's own colour, so it needs no cut. -->
    <span aria-hidden="true" class="dot ping" data-echo></span>
  {/if}
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
  .tree-mark {
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
  /* No tile: the face stands bare in the slot, in the muted ink (a row that
     is no session or project: "N older"). */
  .tree-mark[data-bare] {
    color: var(--ink-muted);

    & .tile {
      background: none;
    }
  }
  /* The echo: a copy of the tile that grows from it and fades, on its
     list's beat (motion/echo), seen only outside the tile and its deck.
     It is under them by shape, not by order. The browser runs the echo on
     a layer of its own, and whatever is drawn after a moving layer and
     might touch it is put on a layer too: drawn first, under the tile, the
     echo took the tile onto one, every mark down the rail after it into
     the same one, and the pane behind them. So it is the last thing the
     mark draws, in a box as large as it ever grows (--echo-scale, to the
     pixel above), and the box is cut: the tile's own rounded square is a
     hole in it, and so is the band of each card that shows under the tile
     (--n of them, none while the deck is away, --deck-away). The hole
     stands still; only the echo inside moves. Last in order means over the
     switch too (`.hit`, z-index 4), which takes the presses through it. */
  .echo-box {
    z-index: 5;
    --reach: round(up, calc(var(--size) * (var(--echo-scale) - 1) / 2), 1px);
    --r: var(--radius-xs);
    --side: calc(var(--size) - 2 * var(--r));
    --foot: calc(var(--reach) + var(--size));
    --cards: calc(var(--n, 0) * (1 - var(--deck-away, 0)));
    position: absolute;
    inset: calc(-1 * var(--reach));
    pointer-events: none;
    clip-path: shape(
      evenodd from 0 0,
      hline to 100%,
      vline to 100%,
      hline to 0,
      close,
      move to calc(var(--reach) + var(--r)) var(--reach),
      hline by var(--side),
      arc by var(--r) var(--r) of var(--r) cw,
      vline by var(--side),
      arc by calc(-1 * var(--r)) var(--r) of var(--r) cw,
      hline by calc(-1 * var(--side)),
      arc by calc(-1 * var(--r)) calc(-1 * var(--r)) of var(--r) cw,
      vline by calc(-1 * var(--side)),
      arc by var(--r) calc(-1 * var(--r)) of var(--r) cw,
      close,
      move to calc(var(--reach) + var(--size) * var(--deck-shrink) / 2)
        var(--foot),
      hline by calc(var(--size) * (1 - var(--deck-shrink))),
      vline by calc(var(--deck-step) * min(1, var(--cards))),
      hline by calc(-1 * var(--size) * (1 - var(--deck-shrink))),
      close,
      move to calc(var(--reach) + var(--size) * var(--deck-shrink))
        calc(var(--foot) + var(--deck-step) * min(1, var(--cards))),
      hline by calc(var(--size) * (1 - 2 * var(--deck-shrink))),
      vline by
        calc(var(--deck-step) * (min(2, var(--cards)) - min(1, var(--cards)))),
      hline by calc(-1 * var(--size) * (1 - 2 * var(--deck-shrink))),
      close,
      move to calc(var(--reach) + var(--size) * var(--deck-shrink) * 1.5)
        calc(var(--foot) + var(--deck-step) * min(2, var(--cards))),
      hline by calc(var(--size) * (1 - 3 * var(--deck-shrink))),
      vline by
        calc(var(--deck-step) * (min(3, var(--cards)) - min(2, var(--cards)))),
      hline by calc(-1 * var(--size) * (1 - 3 * var(--deck-shrink))),
      close
    );
  }
  .echo {
    inset: var(--reach);
    opacity: 0;
  }

  /* The deck: the tile's copies behind it. Card i stands i places back
     (1 nearest), the tile scaled by 1 - --deck-shrink x its place about a
     point under the tile (the deck's vanishing point), so it shows
     --deck-step below the one in front; a card with no row to stand for is
     not drawn. A plain scale, drawn with the row: receding in z through a
     perspective put the same card in the same place, but each card, each
     deck and each mark was then a layer of its own on the compositor, and
     every tile over them one more. */
  .deck {
    position: absolute;
    inset: 0;
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
    transform-origin: 50%
      calc(var(--size) + var(--deck-step) / var(--deck-shrink));
    transform: scale(calc(1 - var(--deck-shrink) * var(--p)));
  }
  /* The skin: a child's tile wears its parent's card (--p its place,
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

  /* What the tile shows at rest (its face or its count), and the chevron
     it gives way to: both stay in the tile; the one leaving shrinks and
     blurs out as the other grows and sharpens in. Transitions, so a pointer
     that turns back mid-way turns them with it. */
  .num {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  /* Which of the two shows (--swap-away: 1 for the one that has given way).
     That number is what transitions (app.css): the swap is by opacity; the
     shrink and the blur are motion, and ride on it only where motion is
     welcome. The chevron's turn and the tile's press are numbers of the
     same kind. */
  .rest,
  .chev {
    display: inline-grid;
    place-items: center;
    opacity: calc(1 - var(--swap-away));
    transition: --swap-away var(--dur-control) var(--ease-out);
  }
  .chev {
    --swap-away: 1;
    inline-size: 12px;
    block-size: 12px;

    & :global(svg) {
      inline-size: 100%;
      block-size: 100%;
      rotate: var(--swap-turn);
    }
  }
  /* Open, the chevron points down at the rows. It stands in the face's
     place, unless the count is a status of the parent's own
     (`countIsStatus`): then the count stays and only a pointer brings the
     chevron. */
  .tree-mark[data-open] .chev :global(svg) {
    --swap-turn: 90deg;
  }
  .tree-mark[data-open]:not([data-status-count]) {
    & .rest {
      --swap-away: 1;
    }
    & .chev {
      --swap-away: 0;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .tree-mark[data-switch]:hover {
      & .rest {
        --swap-away: 1;
      }
      & .chev {
        --swap-away: 0;
      }
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .rest,
    .chev {
      scale: calc(1 - 0.75 * var(--swap-away));
      filter: blur(calc(4px * var(--swap-away)));
    }
    .chev :global(svg) {
      transition: --swap-turn var(--dur-toggle) var(--ease-out);
    }
    .face {
      scale: var(--press-by);
      transition: --press-by var(--dur-toggle) var(--ease-out);
    }
    /* The press: the tile gives a little under it. */
    .tree-mark:has(.hit:active) .face {
      --press-by: var(--press-scale);
    }
  }

  /* The switch: over the tile, the dot's overhang round it and the deck
     under it, and never past the gap to the next row (--mark-hit-max, the
     room a row leaves under its mark plus the gap between rows), so it takes
     no press meant for the row below. */
  .hit {
    /* How far the dot stands out of the tile. */
    --reach: calc(var(--status-dot-size) / 2);
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

  /* The status dot, for a row that needs you or has failed: a circle
     centred on the tile's top-right corner, half of it out of the tile, over
     the tile, its count and its deck. The tile is cut away round it
     (--status-dot-cut wide) rather than ringed in a surface colour: what
     shows in the cut is whatever the row stands on, so the dot reads on
     every tile hue and over the hover and selected washes alike. The cut is
     a hole in the face's mask; the tile's box and what it holds stay where
     they are. */
  .dot {
    position: absolute;
    z-index: 5;
    top: calc(var(--status-dot-size) / -2);
    right: calc(var(--status-dot-size) / -2);
    inline-size: var(--status-dot-size);
    block-size: var(--status-dot-size);
    border-radius: var(--radius-pill);
    background-color: var(--dot);
    pointer-events: none;
  }
  /* The needs-you dot's echo: unseen until its beat (motion/echo). */
  .ping {
    opacity: 0;
  }
  .tree-mark[data-dot] .face {
    --hole: calc(var(--status-dot-size) / 2 + var(--status-dot-cut));
    mask-image: radial-gradient(
      circle at 100% 0,
      transparent calc(var(--hole) - 0.25px),
      #000 calc(var(--hole) + 0.25px)
    );
  }
  .tree-mark[data-dot="attn"] {
    --dot: var(--status-attn-glyph);
  }
  .tree-mark[data-dot="fail"] {
    --dot: var(--status-fail-glyph);
  }
  /* Working: a still dot in the live ink, only where the echo that says it
     does not run. */
  .tree-mark[data-dot="live"] {
    --dot: var(--status-live-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .tree-mark[data-dot="live"] {
      & .dot {
        display: none;
      }
      & .face {
        mask-image: none;
      }
    }
  }
</style>
