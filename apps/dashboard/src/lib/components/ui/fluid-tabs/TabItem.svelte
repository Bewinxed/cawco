<script lang="ts">
  /**
   * One segment. The item draws nothing of its own state — the track's
   * overlays do — it only places its content over them and changes weight
   * when chosen. The label is stacked over an invisible copy set at the
   * strong weight, so choosing it changes nothing but the weight: the box
   * the indicator was aimed at is the box it lands on.
   *
   * A folder tab draws its own shape: one SVG path (fold-path.ts), its sheet
   * and its rim.
   *
   * `href` makes the item a link — the row keeps a real address for
   * middle-click and copy — with a plain click still choosing in place.
   */
  import type { Component, Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { HALF } from "#lib/cawco/motion/hang-shape.js";
  import { cn } from "#lib/utils.js";
  import { restRank, useList, useTabs } from "./context.svelte";
  import { type FoldMeasure, rememberFoldBox } from "./fold-memory";
  import { type FoldPose, foldPath, restPose, taperStops } from "./fold-path";

  /** How long a box holds still before its measure is kept, ms (a resize settling). */
  const KEEP_AFTER = 400;

  let {
    value,
    label,
    icon: Icon,
    href,
    class: className,
    lead,
    trail,
    onclick,
    flush,
    hung = false,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, "onclick"> & {
    value: string;
    label: string;
    /** An optional leading icon. */
    icon?: Component<{ class?: string }>;
    href?: string;
    /** Custom leading content, in the icon's place. */
    lead?: Snippet;
    /** Content after the label: a close control, a count. */
    trail?: Snippet;
    onclick?: (event: MouseEvent) => void;
    /**
     * A folder tab's side that stands square at its foot, with no flare: a
     * card hanging from it there runs straight on down its side (PaneTabs).
     */
    flush?: "start" | "end";
    /**
     * A hang (a card, a menu) stands drawn out of it as one silhouette with
     * it (motion/hang-shape): it draws no rim, and its sheet stops at the
     * one outline's centre (PaneTabs).
     */
    hung?: boolean;
  } = $props();

  const tabs = useTabs();
  const list = useList();
  const uid = $props.id();

  let node = $state<HTMLElement | undefined>();
  // The root learns the order from the items themselves, in the order they
  // stand in the track — kept as tabs arrive, leave and are moved.
  $effect(() => {
    if (node) {
      return list.rects.register(node, value);
    }
  });
  /** Where this item stands now, not where it stood when it mounted. */
  const index = $derived(node ? list.rects.items.indexOf(node) : -1);

  const selected = $derived(tabs.value === value);
  /**
   * The strip's one tab stop (`tabindex` 0, the rest -1), on the chosen tab
   * a frame after the choice. Chrome reads a focused element's focusability
   * again as its `tabindex` changes, a style pass over all the choice has
   * changed so far: the pressed tab is focused as it is chosen, so moving
   * the stop with the choice forced that pass into the switch's task (3.2 to
   * 4.7ms a switch, two-pane-perf). Moved once that frame has painted, it
   * reads a page with little left to restyle. Focus moves along the strip by
   * script (`focus()` takes a -1 stop too), and a Tab into the strip in the
   * frame between lands on the tab chosen before.
   */
  let stop = $state(untrack(() => tabs.value === value));
  $effect(() => {
    const now = selected;
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        stop = now;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });
  /**
   * Where a folder tab stands in the stack at rest, from the order and the
   * value alone (`restRank`): what the first render draws, the server's
   * included, until the track ranks the tabs itself (TabsList `--z`).
   */
  const restAt = $derived.by(() => {
    const at = tabs.order.indexOf(value);
    return at < 0
      ? undefined
      : restRank(
          tabs.order.length,
          tabs.value === undefined ? -1 : tabs.order.indexOf(tabs.value),
          at
        );
  });
  /**
   * How chosen the tab is, 0 to 1: a folder tab's sheet, its rim's
   * strength and its title's strong ink all follow it. At rest it is 1 on
   * the chosen tab and 0 on the rest; a choice carries it over the choice's
   * own length and curve (`--pick`, a typed number, so it is one value
   * interpolated, not several). Under a gesture (the root's `travel`) the
   * chosen tab gives up the fraction the gesture has travelled and the tab
   * it is heading to takes as much, so the choice crosses between the two
   * with the finger and lands with the pane on the same frame; the track's
   * `data-ride` holds its transition off while it does.
   */
  const pick = $derived.by(() => {
    const { travel } = tabs;
    const at = selected ? 1 : 0;
    if (!travel || travel.toward === tabs.value) {
      return at;
    }
    const f = Math.min(1, Math.max(0, travel.fraction));
    return at + ((value === travel.toward ? 1 : 0) - at) * f;
  });

  /* ── A folder tab's shape ─────────────────────────────────────────
     Measured from the tab's own box whenever it resizes, the tokens the
     outline is drawn to read where it stands (the phone's row rounds them
     up), and each measure kept (fold-memory.ts) so the server's next render
     draws the same shape before anything runs. A tab with neither a
     measure nor a kept one draws no shape until it is measured: never a
     guess stretched to its box. */
  const folder = $derived(tabs.variant === "folder");
  let measured = $state<FoldMeasure | null>(null);
  /** The measure waiting to be kept, a beat after the box stops changing. */
  let keep: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const el = node;
    if (!(el && folder)) {
      return;
    }
    const read = () => {
      const style = getComputedStyle(el);
      const px = (name: string) =>
        Number.parseFloat(style.getPropertyValue(name)) || 0;
      const now: FoldMeasure = {
        box: {
          width: el.offsetWidth,
          height: el.offsetHeight,
          flare: px("--flare"),
          radius: px("--radius"),
          slopeStart: px("--slope-start"),
          slopeEnd: px("--slope-end"),
        },
        ink: {
          stroke: px("--rim-w") || 1,
          taper: px("--tab-rim-taper"),
          ease: px("--tab-rim-taper-ease") || 1,
        },
      };
      measured = now;
      clearTimeout(keep);
      keep = setTimeout(() => rememberFoldBox(value, now), KEEP_AFTER);
    };
    const sizes = new ResizeObserver(read);
    sizes.observe(el);
    read();
    return () => {
      sizes.disconnect();
      clearTimeout(keep);
    };
  });
  const shape = $derived(measured ?? tabs.boxes[value] ?? null);
  /**
   * Which of its sides a tab above it covers, as the track reads them where
   * they are drawn (TabsList `fold`); until it has, the neighbour above it
   * at rest, from the order and the value alone. A side the host stands
   * flush (`flush`) is square too.
   */
  const fold = $derived.by((): readonly [boolean, boolean] => {
    const ranked = node ? list.folds.get(node) : undefined;
    let start = ranked?.[0];
    let end = ranked?.[1];
    if (ranked === undefined) {
      const at = tabs.order.indexOf(value);
      const chosen =
        tabs.value === undefined ? -1 : tabs.order.indexOf(tabs.value);
      const n = tabs.order.length;
      const rank = (i: number) => restRank(n, chosen, i);
      start = at > 0 && rank(at - 1) > rank(at);
      end = at >= 0 && at < n - 1 && rank(at + 1) > rank(at);
    }
    return [
      Boolean(start) || flush === "start",
      Boolean(end) || flush === "end",
    ];
  });
  /**
   * How it stands: the pose a come-forward has it in (TabsList, `list.poses`)
   * while one moves the stack, else at rest on its folds. A side the host
   * stands flush is square in either.
   */
  const pose = $derived.by((): FoldPose => {
    const moving = node ? list.poses.get(node) : undefined;
    if (!moving) {
      return restPose(fold);
    }
    return {
      ...moving,
      spread: [
        flush === "start" ? 0 : moving.spread[0],
        flush === "end" ? 0 : moving.spread[1],
      ],
    };
  });
  /**
   * Its outline; while a hang stands drawn out of it (`hung`), in by half
   * the hang's stroke all round (motion/hang-shape `HALF`): the sheet stops
   * where the one outline over tab and hang is centred, so no edge of the
   * sheet's lies under that stroke's edge, and the tab draws no rim of its
   * own (the outline is the rim).
   */
  const outline = $derived(
    shape ? foldPath(shape.box, pose, hung ? { inset: HALF } : {}) : ""
  );
  const stops = $derived(
    shape
      ? taperStops(shape.box, shape.ink.stroke, shape.ink.taper, shape.ink.ease)
      : []
  );
  // The list's props land on the hit, not the box; `class` is the box's.

  function choose(event: MouseEvent): void {
    onclick?.(event);
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    if (
      href &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    ) {
      return;
    }
    event.preventDefault();
    // The indicator moves on the click, ahead of the value arriving.
    list.optimisticIndex = index;
    tabs.select(value);
  }
</script>

<span
  class={cn("ff-tab", selected && "selected", className)}
  data-flush={flush}
  data-tab-index={index}
  bind:this={node}
  style:--pick={pick}
  style:--z-rest={restAt}
>
  {#if folder && shape}
    <!-- The tab's shape: one path, its sheet filled and its rim stroked
         inside its edge (clipped to it), the stroke's ink tapering up from
         each foot's tip (the gradient), drawn to the tab's measured box. -->
    <svg
      aria-hidden="true"
      class="fold"
      preserveAspectRatio="none"
      viewBox="0 0 {shape.box.width + 2 * shape.box.flare} {shape.box.height}"
    >
      <defs>
        <path d={outline} id="{uid}-outline" />
        <clipPath id="{uid}-inside">
          <use href="#{uid}-outline" />
        </clipPath>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="{uid}-taper"
          x1="0"
          x2="0"
          y1={shape.box.height}
          y2="0"
        >
          {#each stops as stop (stop.offset)}
            <stop offset={stop.offset} stop-opacity={stop.ink} />
          {/each}
        </linearGradient>
      </defs>
      <use class="sheet" href="#{uid}-outline" />
      {#if !hung}
        <g class="rim">
          <use
            class="stroke"
            clip-path="url(#{uid}-inside)"
            href="#{uid}-outline"
            stroke="url(#{uid}-taper)"
          />
        </g>
      {/if}
    </svg>
  {/if}
  <svelte:element
    this={href ? "a" : "button"}
    aria-selected={selected}
    class="hit touch-hit"
    draggable={href ? "false" : undefined}
    {href}
    onclick={choose}
    role="tab"
    tabindex={stop ? 0 : -1}
    type={href ? undefined : "button"}
    {...rest}
  >
    {#if lead}
      {@render lead()}
    {:else if Icon}
      <Icon class="ff-tab-icon" />
    {/if}
    <!-- The name, and over it the same name in the strong ink: a folder tab
         fades the strong one in as it is chosen (transitions.dev, text swap
         soft), so its ink travels with the choice. -->
    <span class="label">
      <span class="text">{label}</span>
      <!-- Its words drawn, not written (`::before`): as a second copy of
           the name in the link's text, the tab's visible text was the name
           twice, which its accessible name does not hold (axe,
           label-content-name-mismatch). -->
      <span aria-hidden="true" class="text strong" data-text={label}></span>
    </span>
  </svelte:element>
  {#if trail}
    {@render trail()}
  {/if}
</span>

<style>
  /* How chosen a folder tab is (`pick`), typed so a choice interpolates the
     one number and everything drawn from it follows on its clock. */
  @property --pick {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }
  /* The measured box: the hit and whatever trails it. The overlays are
     aimed at this, so a trailing control sits inside the segment. */
  /* The tab box makes no stacking context of its own: its contents rise
     above the overlays (the sheet is z-index 2, a segmented list's hover
     ghost 1), while anything the box paints behind them stays under both.
     A folder tab, or the box a host wraps round it, is one stack of its
     own instead, at its rank (TabsList). */
  .ff-tab {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-inline-size: 0;
    block-size: var(--item);
    border-radius: var(--shape);
    color: var(--ink-muted);

    /* Only a tab with something after its hit carries end padding. */
    &:not(:has(.hit:last-child)) {
      padding-inline-end: calc(var(--px) - 6px);
    }
    /* Chosen, or under the list's hover ghost (the kit highlight marks
       the row it stands under). A tap leaves no ghost behind to ink. */
    &.selected {
      color: var(--ink-strong);
    }
    @media (hover: hover) {
      &[data-ghosted] {
        color: var(--ink-strong);
      }
    }

    /* The press tints the whole segment (trailing controls included), not
       the label's hit alone. A press on a trailing control leaves it be. */
    &:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
      --press: light-dark(var(--surface-fill-strong), var(--surface-fill));
      background-color: var(--press);
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--dur-ghost) var(--ease-out);
    }
  }
  .ff-tab > :global(*) {
    position: relative;
    z-index: 3;
  }
  /* The name's strong ink layer draws its words (`data-text`): they are no
     second copy of the name in the tab's text. */
  .strong::before {
    content: attr(data-text);
  }
  .hit {
    display: flex;
    align-items: center;
    align-self: stretch;
    flex: 1 1 auto;
    gap: calc(var(--gap) + 4px);
    min-inline-size: 0;
    padding-block: 0;
    /* A host may set a tab's two ends apart (PaneTabs' phone row). */
    padding-inline-start: var(--px-start, var(--px));
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text);
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    outline: none;
    /* Not positioned, so the box is the containing block of the area below;
       as a flex item its z-index still lifts it over the sheet. */
    position: static;

    /* Last in the box: the hit's own end padding. When a trailing control
       follows, the box's end padding keeps it off the segment's edge. */
    &:last-child {
      padding-inline-end: var(--px);
    }

    /* The whole segment chooses, not only the label: the hit's area spans
       the box, end padding included. It sits under the hit's content, and
       a trailing control, later in the box, stands over it and takes its
       own presses. */
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
    }
  }
  /* ── Folder tabs ───────────────────────────────────────────────────
     Each tab is a sheet standing on the shelf: one path (fold-path.ts) on
     a box one flare wider than the tab each side, with rounded shoulders,
     sides brought in at the top by `--slope-start` and `--slope-end`, and
     at each foot a curve out into the shelf on the flare, but on a side
     under its neighbour (TabsList `list.folds`), which runs straight down.
     It is filled in the receded tint (a host may set it, `--tab-fill`)
     toward the sheet's own surface (`--sheet`) as the tab is chosen
     (`--pick`), and a host's rim strokes it inside its edge
     (`--rim-ink`, `--rim-rest` to `--rim-full` by `--pick`, `--rim-w`
     wide), the stroke's ink
     tapering up from each foot's tip (`taperStops`), a glow following it
     at half its strength, stopped at the shelf's line. The tabs overlap,
     each its own stack at its rank (TabsList), so the tab in front covers
     the one behind, rim and all: where two meet, the front's edge is the
     edge. */
  :global([data-variant="folder"]) .ff-tab {
    /* The chosen tab's name is its strong ink layer (`.label .strong`): the
       muted one under it stays as it was. */
    &.selected {
      color: var(--ink-muted);
    }
    /* The trailing pad is the full pad: an edge under a neighbour by the
       overlap still leaves the close control clear of it. */
    &:not(:has(.hit:last-child)) {
      padding-inline-end: var(--px-end, var(--px));
    }
    /* The press tints the tab's own shape, its feet too; the box itself
       stays clear behind it. */
    &:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
      background-color: transparent;
    }

    /* A choice carries `--pick` over the choice's own length and curve;
       under a gesture it is where the fraction puts it. */
    @media (prefers-reduced-motion: no-preference) {
      transition:
        color var(--dur-ghost) var(--ease-out),
        --pick var(--choose-dur) var(--choose-ease);
    }
    :global([data-ride]) & {
      transition: none;
    }
  }
  .ff-tab > .fold {
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(-1 * var(--flare));
    z-index: 1;
    inline-size: calc(100% + 2 * var(--flare));
    block-size: 100%;
    overflow: visible;
    pointer-events: none;
    /* The rim's glow stops at the shelf's line. */
    clip-path: inset(-24px -24px 0);
  }
  .fold .sheet {
    fill: color-mix(
      in oklab,
      var(--sheet) calc(var(--pick) * 100%),
      var(--tab-fill, var(--surface-recess-deep))
    );
  }
  /* Under the pointer an unchosen tab lights its own shape in the hover
     tint (the track's ghost cannot glide between overlapping tabs). */
  @media (hover: hover) {
    .ff-tab:global([data-ghosted]):not(.selected) .fold .sheet {
      fill: var(--tab-hover, var(--surface-hover));
    }
  }
  .ff-tab:has(.hit:active:not(:disabled, [aria-disabled="true"])) .fold .sheet {
    fill: var(--press);
  }
  /* A host's rim (PaneTabs: `--rim-ink`, its strength unchosen
     `--rim-rest` and chosen `--rim-full`) at the strength the tab is
     chosen at now; none where the host draws none. */
  .fold .rim {
    opacity: calc(
      var(--rim-rest, 0) + (var(--rim-full, 0) - var(--rim-rest, 0)) *
        var(--pick)
    );
    filter: drop-shadow(
      0 0 6px color-mix(in oklab, var(--rim-ink, transparent) 50%, transparent)
    );

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      filter: none;
    }
  }
  .fold .stroke {
    fill: none;
    /* Twice the rim's width, clipped to the shape: the half inside it, at
       its own width even where a kept shape is stretched to a box that has
       since moved (its fonts still loading), until it is measured again. */
    stroke-width: calc(var(--rim-w, 1) * 2px);
    vector-effect: non-scaling-stroke;
  }
  .fold stop {
    stop-color: var(--rim-ink, transparent);
  }
  /* The chosen folder sheet's flared foot is the tab's too: the area takes
     the sheet's outline, square-shouldered, so the foot reaches past the
     box on each side. */
  :global([data-variant="folder"]) .ff-tab.selected .hit::before {
    inset-inline: calc(-1 * var(--flare));
    clip-path: shape(
      from 0 100%,
      arc to var(--flare) calc(100% - var(--flare)) of var(--flare) ccw,
      line to var(--flare) 0,
      line to calc(100% - var(--flare)) 0,
      line to calc(100% - var(--flare)) calc(100% - var(--flare)),
      arc to 100% 100% of var(--flare) ccw,
      close
    );
  }
  .ff-tab :global(.ff-tab-icon) {
    inline-size: var(--icon);
    block-size: var(--icon);
    flex: 0 0 auto;
  }

  /* A tab's name is in the label role whatever its state; the colour and
     the sheet say which one is chosen. */
  .label {
    display: grid;
    min-inline-size: 0;

    /* Clipped for the ellipsis, so the line box is left whole — a
       trimmed one would lose its descenders to the clip. */
    & > span {
      grid-area: 1 / 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: var(--item);
    }
  }
  .text {
    font-weight: var(--weight-strong);
  }
  /* The strong ink layer is a folder tab's: a segmented one changes colour
     under its sliding thumb. It is as strong as the tab is chosen, on the
     choice's clock (`--pick`). */
  .strong {
    display: none;
  }
  :global([data-variant="folder"]) .strong {
    display: block;
    color: var(--ink-strong);
    opacity: var(--pick);
  }
  /* By day the press is the step past the hover ghost, and an unchosen
     tab's muted label goes strong on it (app.css .press-tint). Last, so it
     outranks every tab rule above by order as well as by weight. */
  :global(:root:not(.dark))
    .ff-tab:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
    color: var(--ink-strong);
  }
</style>
