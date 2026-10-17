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

<!-- The measured box: the hit and whatever trails it. The overlays are aimed
     at this, so a trailing control sits inside the segment. The tab box
     makes no stacking context of its own: its contents rise above the
     overlays (the sheet is z-index 2, a segmented list's hover ghost 1),
     while anything the box paints behind them stays under both. A folder
     tab, or the box a host wraps round it, is one stack of its own
     instead, at its rank (TabsList). Only a tab with something after its
     hit carries end padding; a folder tab's trailing pad is the full pad:
     an edge under a neighbour by the overlap still leaves the close control
     clear of it. Chosen, or under the list's hover ghost (the kit highlight
     marks the row it stands under), its ink is strong; a tap leaves no
     ghost behind to ink. A folder tab's chosen name is its strong ink layer
     (the label's `data-text` span): the muted one under it stays as it
     was. Under a swipe a folder tab takes no transition: the list
     (TabsList) carries `data-ride` inside the folder root, and the variant
     says them in that order, so it holds whether or not a tool lowers the
     nesting (folder-ride spec), and outranks the folder's own transition
     by its two attributes. -->
<!-- literal: 6px -->
<span
  data-tab-item-selected={selected || undefined}
  data-slot="ff-tab"
  class={cn(
    "relative flex h-(--item) min-w-0 flex-initial items-center rounded-(--shape) text-ink-muted",
    "[&:not(:has([data-slot=hit]:last-child))]:pe-(--end-pad)",
    "in-variant-folder:[&:not(:has([data-slot=hit]:last-child))]:pe-(--fold-end-pad)",
    "data-tab-item-selected:text-ink-strong hover-hover:data-ghosted:not-data-tab-item-selected:text-ink-strong",
    "in-variant-folder:data-tab-item-selected:text-ink-muted",
    "motion-safe:dur-ghost motion-safe:transition-[color] motion-safe:ease-out",
    "in-variant-folder:motion-safe:[transition:color_var(--dur-ghost)_var(--ease-out),--pick_var(--choose-dur)_var(--choose-ease)]",
    "[[data-variant=folder]_[data-ride]_&]:transition-off",
    "hit-pressed:bg-press-fill in-variant-folder:hit-pressed:bg-transparent light:hit-pressed:text-ink-strong",
    className
  )}
  data-flush={flush}
  data-tab-index={index}
  bind:this={node}
  style:--pick={pick}
  style:--z-rest={restAt}
  style:--end-pad="calc(var(--px) - 6px)"
  style:--fold-end-pad="var(--px-end, var(--px))"
>
  {#if folder && shape}
    <!-- The tab's shape: one path, its sheet filled and its rim stroked
         inside its edge (clipped to it), the stroke's ink tapering up from
         each foot's tip (the gradient), drawn to the tab's measured box.
         The rim's glow stops at the shelf's line. -->
    <!-- literal: -24px, 6px -->
    <svg
      data-slot="fold"
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 start-(--fold-start) z-1 h-full w-(--fold-w) overflow-visible clip-path-(--fold-clip)"
      style:--fold-start="calc(-1 * var(--flare))"
      style:--fold-w="calc(100% + 2 * var(--flare))"
      style:--fold-clip="inset(-24px -24px 0)"
      style:--rim-blur="6px"
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
      <use data-slot="sheet" href="#{uid}-outline" />
      {#if !hung}
        <g data-slot="rim">
          <use
            data-slot="stroke"
            clip-path="url(#{uid}-inside)"
            href="#{uid}-outline"
            stroke="url(#{uid}-taper)"
          />
        </g>
      {/if}
    </svg>
  {/if}
  <!-- The whole segment chooses, not only the label: the hit's area spans
       the box, end padding included. Not positioned, so the box is the
       containing block of the area below; as a flex item its z-index still
       lifts it over the sheet. A host may set a tab's two ends apart
       (PaneTabs' phone row). Last in the box: the hit's own end padding.
       When a trailing control follows, the box's end padding keeps it off
       the segment's edge. -->
  <svelte:element
    this={href ? "a" : "button"}
    data-slot="hit"
    data-hit
    aria-selected={selected}
    class="touch-hit static z-3 flex min-w-0 flex-auto cursor-pointer items-center gap-(--hit-gap) self-stretch rounded-inherit border-none border-current background-transparent py-0 ps-(--hit-ps) text-(length:--text) leading-none whitespace-nowrap text-inherit no-underline outline-off last:pe-(--px)"
    style:--hit-gap="calc(var(--gap) + var(--space-1))"
    style:--hit-ps="var(--px-start, var(--px))"
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
    <!-- A tab's name is in the label role whatever its state; the colour and
         the sheet say which one is chosen. Each layer is clipped for the
         ellipsis, so the line box is left whole — a trimmed one would lose
         its descenders to the clip. -->
    <span data-slot="tab-item-label" class="grid min-w-0">
      <span
        data-slot="text"
        class="col-start-1 row-start-1 min-w-0 truncate leading-(--item) font-medium"
        >{label}</span
      >
      <!-- Its words drawn, not written (`::before`): as a second copy of
           the name in the link's text, the tab's visible text was the name
           twice, which its accessible name does not hold (axe,
           label-content-name-mismatch). The strong ink layer is a folder
           tab's: a segmented one changes colour under its sliding thumb. It
           is as strong as the tab is chosen, on the choice's clock
           (`--pick`). -->
      <span
        data-slot="text"
        aria-hidden="true"
        class="col-start-1 row-start-1 hidden min-w-0 truncate leading-(--item) font-medium in-variant-folder:block in-variant-folder:text-ink-strong in-variant-folder:opacity-(--pick)"
        data-text={label}
      ></span>
    </span>
  </svelte:element>
  {#if trail}
    {@render trail()}
  {/if}
</span>

<style>
  /* residual: foreign-dom — every other child of the box rises over the
     overlays, the trailing control a host renders (`trail`) included. The
     fold stands behind at z-index 1 and the hit is not positioned (the box
     is the containing block of its area): their own classes say so. At
     the weight `> *` had, so a host's rule on its trailing control still
     meets it as before. */
  [data-slot="ff-tab"]
    > :global(:where(:not([data-slot="fold"], [data-slot="hit"]))) {
    position: relative;
    z-index: 3;
  }
  /* residual: foreign-dom — the leading icon a caller passes (`icon`). */
  [data-slot="ff-tab"] :global(.ff-tab-icon) {
    inline-size: var(--icon);
    block-size: var(--icon);
    flex: 0 0 auto;
  }
  /* residual: pseudo — the whole segment chooses, not only the label: the
     hit's area spans the box, end padding included. It sits under the
     hit's content, and a trailing control, later in the box, stands over
     it and takes its own presses. The chosen folder sheet's flared foot is
     the tab's too: the area takes the sheet's outline, square-shouldered,
     so the foot reaches past the box on each side. The name's strong ink
     layer draws its words (`data-text`): they are no second copy of the
     name in the tab's text. */
  [data-slot="hit"]::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
  }
  :global([data-variant="folder"])
    [data-slot="ff-tab"][data-tab-item-selected]
    [data-slot="hit"]::before {
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
  [data-text]::before {
    content: attr(data-text);
  }
  /* residual: svg-paint — the folder tab's sheet and rim. A host's rim
     (PaneTabs: `--rim-ink`, its strength unchosen `--rim-rest` and chosen
     `--rim-full`) at the strength the tab is chosen at now; none where the
     host draws none. Under the pointer an unchosen tab lights its own
     shape in the hover tint (the track's ghost cannot glide between
     overlapping tabs). The stroke is twice the rim's width, clipped to the
     shape: the half inside it, at its own width even where a kept shape is
     stretched to a box that has since moved (its fonts still loading),
     until it is measured again. */
  [data-slot="fold"] [data-slot="sheet"] {
    fill: color-mix(
      in oklab,
      var(--sheet) calc(var(--pick) * 100%),
      var(--tab-fill, var(--surface-recess-deep))
    );
  }
  @media (hover: hover) {
    [data-slot="ff-tab"]:global([data-ghosted]):not([data-tab-item-selected])
      [data-slot="fold"]
      [data-slot="sheet"] {
      fill: var(--tab-hover, var(--surface-hover));
    }
  }
  [data-slot="ff-tab"]:has(
      [data-slot="hit"]:active:not(:disabled, [aria-disabled="true"])
    )
    [data-slot="fold"]
    [data-slot="sheet"] {
    fill: var(--press-fill);
  }
  [data-slot="fold"] [data-slot="rim"] {
    opacity: calc(
      var(--rim-rest, 0) + (var(--rim-full, 0) - var(--rim-rest, 0)) *
        var(--pick)
    );
    filter: drop-shadow(
      0 0 var(--rim-blur)
        color-mix(in oklab, var(--rim-ink, transparent) 50%, transparent)
    );

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      filter: none;
    }
  }
  [data-slot="fold"] [data-slot="stroke"] {
    fill: none;
    stroke-width: calc(var(--rim-w, 1) * 2px);
    vector-effect: non-scaling-stroke;
  }
  [data-slot="fold"] stop {
    stop-color: var(--rim-ink, transparent);
  }
</style>
