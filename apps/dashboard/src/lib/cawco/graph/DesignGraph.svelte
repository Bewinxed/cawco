<script lang="ts">
  /**
   * The design graph (Projects spec §5.10; its surface brief under
   * apps/dashboard/.impeccable/surfaces): what the artifact panel shows of a
   * component artifact, where the owner judges a component an agent built.
   * The stage holds the real component in the state he keeps, and only
   * that: a press on a state keeps it, and nothing else changes the stage.
   * The component lives in the project's toolchain, on the stage's origin,
   * in the one frame the stage's panel holds (StagePane); the graph says
   * what to stand at by messages (StageLink, core stage-graph.ts) and the
   * page answers. Beside the stage one room, the states list with its
   * steps. Several components under one ask: one in front, the others
   * behind its name's menu.
   *
   * One bar of one row (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): leading the component's name (its menu when there are several),
   * trailing one glass group of bare symbols (the stage's view, and Show
   * states only while the room is put away: the room's one close is its
   * own). The view is a card hung from the glass (HangCard, as the app's
   * own glass hangs its cards): one settings row each, its name leading and
   * its control trailing, the widths as device glyphs with their figures,
   * the scheme as sun and moon, Reduce motion as a switch.
   *
   * One grid under the bar: the stage and the room are two panels of one
   * kind (one corner, one edge, one raised head on one head line), sharing
   * a top and a foot inside the page's gutters; the bar's title starts on
   * their leading edge and its glass ends on their trailing one. The stage
   * holds its drawing and no more (the page's `laid`), so the room takes
   * what a form held to its measure leaves. Under the line where the
   * surface holds both whole the room is the kit's bottom drawer, its stops
   * head, half and whole, the stage whole above it at the head stop.
   */
  import type { CanvasSpec } from "@cawco/core/stage";
  import type { StateRef } from "@cawco/core/stage-graph";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, type Snippet, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import {
    dur,
    motionOk,
    numberOf,
    sheetSlide,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconClose,
    IconEye,
    IconListRows,
    IconMaximize,
    IconMonitor,
    IconMoon,
    IconPhone,
    IconRoom,
    IconSun,
    IconTablet,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { besideLine, DIVIDER } from "./beside";
  import { figureOf, pageLang } from "./figures";
  import Journey from "./Journey.svelte";
  import { pathOf, type Review, reviewOf } from "./model";
  import StagePane from "./StagePane.svelte";
  import Stepper from "./Stepper.svelte";
  import type { StageLink } from "./stage-link.svelte";

  let {
    link,
    files,
    spec,
    ask = "",
    stale = false,
    lang = pageLang(),
    frame,
    paneSheet = false,
    onroom,
    inspector,
  }: {
    /** The line to the stage page: what it said, and what the graph asks of it. */
    link: StageLink;
    /** The canvas's states files, in its order: the components under review. */
    files: readonly string[];
    /** The agent's canvas spec: its groups and edges. */
    spec: CanvasSpec;
    /** The artifact's ask, in words: the component and the state it names open in front. */
    ask?: string;
    /** The hub's link is down. */
    stale?: boolean;
    /** The page's language, which every figure is written in (figures.ts); the document's when not given. */
    lang?: string;
    /** The frame that holds the stage page. */
    frame: Snippet;
    /**
     * A sheet of the pane's own stands at the surface's foot (the
     * inspector on a phone): the room's drawer is put away under it and
     * comes back at its stop as it goes, so one sheet stands at a time.
     */
    paneSheet?: boolean;
    /** He brought the room back while the pane's sheet stands: the pane puts its sheet away. */
    onroom?: () => void;
    /**
     * The pane's inspector, while it stands open where the room stands
     * beside the stage (a desk, beside.ts): drawn in the room under the
     * states, so the states and the props stand together and the stage
     * keeps its width. The room's column stays while it does, the states
     * put away or not.
     */
    inspector?: Snippet;
  } = $props();

  /** The page's own ids, for a label's `for`. */
  const uid = $props.id();
  /** `n` as a figure in the page's language. */
  const figure = (n: number) => figureOf(n, lang);
  /** Each states file the page has said, in the canvas's order. */
  const reviews = $derived(
    files.flatMap((file) => {
      const sheet = link.sheets[file];
      return sheet ? [reviewOf(sheet, spec, figure)] : [];
    })
  );
  /** Whether the ask names `words` (a component's or a state's name), as a person writes it. */
  const asks = (named: string) =>
    named.length > 0 && ask.toLowerCase().includes(named.toLowerCase());
  /** The component the ask names (its longest name it holds), else the first: the one in front until he picks another. */
  const askedFront = $derived.by(() => {
    let best = 0;
    let longest = 0;
    reviews.forEach((one, index) => {
      if (asks(one.name) && one.name.length > longest) {
        best = index;
        longest = one.name.length;
      }
    });
    return best;
  });
  let front = $derived(askedFront);
  const review = $derived<Review | undefined>(reviews[front] ?? reviews[0]);

  /** A state and one of its variants (null: the state as written). */
  interface Pick {
    state: string;
    variant: string | null;
  }
  /** Where a component opens: the state the ask names (a variant of it too; its longest name the ask holds), else its first. */
  const first = (one: Review): Pick => {
    const said = one === reviews[askedFront];
    let best: Pick = { state: one.order[0] ?? "", variant: null };
    let longest = 0;
    const consider = (named: string, pick: Pick) => {
      if (said && asks(named) && named.length > longest) {
        best = pick;
        longest = named.length;
      }
    };
    for (const id of one.order) {
      const state = one.states[id];
      consider(state?.name ?? id, { state: id, variant: null });
      consider(id, { state: id, variant: null });
      for (const variant of state?.variants ?? []) {
        consider(variant.name, { state: id, variant: variant.id });
      }
    }
    return best;
  };
  /**
   * The room's faces, in its switch's order: the States face alone until
   * the Map and Animation faces stand on the page. The room is named by
   * the faces it has.
   */
  const FACES = [
    { value: "states", label: words.statesFace, icon: IconListRows },
  ] as const;
  const roomName = words.room(FACES.map((one) => one.label));
  /** The kept state of each component, by its name. */
  let keptOf = $state<Record<string, Pick>>({});
  /** The state he kept on the component in front, while its states file still has it; else where the component opens. */
  const kept = $derived.by<Pick | null>(() => {
    if (!review) {
      return null;
    }
    const pick = keptOf[review.name];
    return pick && review.states[pick.state] ? pick : first(review);
  });
  // A new ask (the agent showed the canvas again, or changed its ask)
  // opens on the state it names: what he kept under the last ask goes.
  let askSeen: string | null = null;
  $effect(() => {
    const said = ask;
    untrack(() => {
      if (askSeen !== null && askSeen !== said) {
        keptOf = {};
      }
      askSeen = said;
    });
  });
  let roomOpen = $state(true);
  /** The phone's drawer stands: the room open, and no sheet of the pane's own over the surface's foot. */
  const drawerShown = $derived(roomOpen && !paneSheet);
  let width = $state<number | null>(null);
  let scheme = $state<"light" | "dark">(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  );
  let reduce = $state(false);
  const still = $derived(reduce || !motionOk.current);
  let surface = $state(0);
  /** The room stands beside the stage only where the surface holds both whole (beside.ts); under that the room is the drawer, measured on the panel's own width, so a pane under it gets the drawer on a desk too. */
  const line = $derived(browser ? besideLine() : 0);
  const desk = $derived(surface === 0 || surface >= line);
  /** The room stands where he sees it: beside the stage on a desk, its drawer elsewhere. */
  const roomShown = $derived(desk ? roomOpen : drawerShown);
  /**
   * The page is held from view until the split is laid out for the
   * drawing (the page's `laid`), so its first paint is its last. Held no
   * longer than the wait grace, past which the stage page draws its own
   * skeleton.
   */
  let graceOver = $state(false);
  onMount(() => {
    const timer = setTimeout(() => {
      graceOver = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(timer);
  });

  /** The state the stage stands at, as the page names it: a variant's own story or record set; at a width he picked that one of its stories is written for (its phone story at 390), that story. */
  const refOf = (on: Review, pick: Pick, atWidth: number | null): StateRef => {
    const state = on.states[pick.state];
    const variant = state?.variants.find((one) => one.id === pick.variant);
    if (variant) {
      return { file: on.file, story: pick.state, variant: variant.variant };
    }
    const sized =
      atWidth === null
        ? undefined
        : state?.widths.find((one) => one.width === atWidth);
    return { file: on.file, story: sized?.story ?? pick.state };
  };
  /** A press on a state keeps it (a record set too). */
  const keep = (state: string, variant: string | null) => {
    if (review) {
      keptOf = { ...keptOf, [review.name]: { state, variant } };
    }
  };
  /** The state a story stands for: a state's own, a variant's under it, or a state's at another width (with that width). */
  const pickOf = (
    on: Review,
    story: string
  ): { pick: Pick; width?: number } | null => {
    if (on.states[story]) {
      return { pick: { state: story, variant: null } };
    }
    for (const id of on.order) {
      const state = on.states[id];
      if (state?.variants.some((one) => one.id === story)) {
        return { pick: { state: id, variant: story } };
      }
      const sized = state?.widths.find((one) => one.story === story);
      if (sized) {
        return { pick: { state: id, variant: null }, width: sized.width };
      }
    }
    return null;
  };
  // A story he picked in the inspector: its component in front and its
  // state kept, so the stage stands at what the controls edit. One the
  // states file doesn't hold yet (a story just added) waits for its sheet.
  $effect(() => {
    const wish = link.wanted;
    const all = reviews;
    untrack(() => {
      const at = wish ? all.findIndex((one) => one.file === wish.file) : -1;
      const on = all[at];
      const found = wish && on ? pickOf(on, wish.story) : null;
      if (!(wish && on && found)) {
        return;
      }
      front = at;
      keptOf = { ...keptOf, [on.name]: found.pick };
      if (found.width !== undefined) {
        ({ width } = found);
      } else if (refOf(on, found.pick, width).story !== wish.story) {
        // At a width it has a story of its own for, the state as written is that story: back to its own width.
        width = null;
      }
      link.wanted = null;
    });
  });

  // --- The stage brought to the kept state -------------------------------------

  /** The width the stage asks of its column, px (StagePane `need`): the drawing and its panel; 0 until laid out. */
  let stageNeed = $state(0);
  /**
   * The stage is on its way to the kept state; the surface says so as
   * `data-arriving`, so a read of the page (the probe kit's `--wait-for`)
   * waits for its rest.
   */
  let arriving = $state(true);
  /** The ask the stage answers next, and the state it stands at (by this page load). */
  let asking = 0;
  let stood: StateRef | null = null;
  /** The page load the stage stands at a state on: a new page holds no drawing. */
  let loadSeen = 0;
  /** The reach pressed in place from the state that stood: what it changed is brought into view once it lands. */
  let pressed = false;

  // The view first, so the state reached on a new page is laid out at it.
  $effect(() => {
    const view = { scheme, width, motion: reduce ? "reduce" : "on" } as const;
    const { loads } = link;
    untrack(() => {
      if (loads > 0) {
        link.view(view);
      }
    });
  });
  // Each kept state is reached on the one live instance: set in place from
  // the state that stood, or mounted afresh on a new page. A width he picks
  // that the state has a story for reaches that story. A state the states
  // file plays a move into arrives by that move, played from its from state
  // (the page docks the move's timeline over it).
  $effect(() => {
    const on = review;
    const pick = kept;
    const { loads } = link;
    const to = on && pick ? refOf(on, pick, width) : null;
    untrack(() => {
      // Every way a state comes to be kept (a row's press, a step, the
      // ask's state, a new ask, the inspector's pick, a width's own story,
      // another component in front) names it here: the inspector's
      // controls follow it, so an edit lands on the drawing he sees.
      if (to && JSON.stringify(to) !== JSON.stringify(link.kept)) {
        link.kept = to;
      }
      if (!(on && pick && to) || loads === 0) {
        return;
      }
      const fresh = loads !== loadSeen;
      if (!fresh && JSON.stringify(to) === JSON.stringify(stood)) {
        return;
      }
      loadSeen = loads;
      const into = pick.variant === null ? on.states[pick.state] : undefined;
      const played = into?.play && into.from ? into.from : null;
      let from = fresh ? null : stood;
      if (played) {
        from = { file: on.file, story: played } satisfies StateRef;
      }
      pressed = !(fresh || played);
      arriving = true;
      asking = link.reach(to, from, { play: played !== null, still });
      stood = to;
    });
  });
  // The reach landed (or its mount threw): the stage is at rest; a press's
  // change brought into view where it stands out of it (bring-into-view
  // moves nothing for a region already in view): on a phone, a line 500px
  // under the drawer's top.
  $effect(() => {
    const { reached, fault } = link;
    untrack(() => {
      if (fault || (reached && reached.ask === asking)) {
        arriving = false;
      }
      if (reached?.ask === asking && !reached.superseded && pressed) {
        pressed = false;
        link.reveal();
      }
    });
  });

  // --- Keys and presses ------------------------------------------------------

  onMount(() => {
    const key = (event: KeyboardEvent) => {
      const field = (event.target as HTMLElement | null)?.closest(
        "input, textarea, select, [contenteditable='true']"
      );
      if (
        event.key === "Escape" &&
        event.isTrusted &&
        !event.defaultPrevented &&
        !field &&
        roomShown
      ) {
        roomOpen = false;
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
    };
  });

  /** The journey's one order: the component's path, as the list shows it. */
  const path = $derived(review ? pathOf(review) : []);
  const at = $derived(kept ? path.indexOf(kept.state) : -1);
  const single = $derived((review?.order.length ?? 0) <= 1);
  const keptState = $derived(
    review && kept ? review.states[kept.state] : undefined
  );
  const keptVariant = $derived(
    keptState?.variants.find((one) => one.id === kept?.variant)
  );
  /** The widths the stage is drawn at, each a device's glyph; its own first. */
  const WIDTHS = [
    { value: 390, icon: IconPhone, name: words.phone },
    { value: 680, icon: IconTablet, name: words.tablet },
    { value: 1440, icon: IconMonitor, name: words.desk },
  ] as const;
  const DESK_FORM = 1280;
  const ownWidth = $derived(
    keptVariant?.width ?? keptState?.width ?? DESK_FORM
  );
  /**
   * The stage's share of a wide surface before the page has laid the
   * drawing out: the widest of the component's own widths, so it holds
   * still from state to state.
   */
  const stageWidth = $derived(
    Math.max(
      0,
      ...(review?.order.map((id) => review.states[id]?.width ?? DESK_FORM) ??
        [])
    ) || DESK_FORM
  );
  /** The head's glass, which the view's card hangs from, and whether it hangs. */
  let glass = $state<HTMLElement | null>(null);
  let viewJoined = $state(false);
  /**
   * The view card is open. Shut, it is gone: kept mounted (`forceMount`)
   * as the Shell's glass card is, it rested slid up behind a glass that
   * here stands 4px under the window's top, its shadow a band across both
   * panels until a reload.
   */
  let viewOpen = $state(false);
  /** The components' menu is open. */
  let menuOpen = $state(false);
  // A press on the stage lands in its frame and never reaches this page:
  // the page says it (`cawco:press`), and what is open here closes, as a
  // press outside it does.
  $effect(() => {
    if (link.presses > 0) {
      untrack(() => {
        viewOpen = false;
        menuOpen = false;
      });
    }
  });
  /** The card just closed, its control holding the focus it handed back: no tooltip until the focus or the pointer leaves. */
  let viewQuiet = $state(false);
  let viewWasOpen = false;
  $effect(() => {
    const open = viewOpen;
    if (viewWasOpen && !open) {
      viewQuiet = true;
    }
    viewWasOpen = open;
  });
  /** What takes the focus when pressed: a control or a field. */
  const FOCUSABLE =
    "button, input, select, textarea, a[href], [contenteditable='true'], [tabindex]:not([tabindex='-1'])";
  /**
   * A press on the drawer's own surface (its grabber, its head, the space
   * between its rows) leaves the focus where it was: the drawer's content
   * is the dialog's (bits-ui gives it `tabindex="-1"`), and a browser hands
   * the focus to the focusable box round whatever a mouse press, or a
   * finger's press as it ends, lands on, so a drag of the drawer moved the
   * focus into it. A press on a control still focuses that control.
   */
  const keepFocusOnPage = (event: MouseEvent) => {
    if (!(event.target as Element | null)?.closest(FOCUSABLE)) {
      event.preventDefault();
    }
  };
  /** The drawer's layer: the box it stands in, as tall as the surface, and the bar's foot in it. */
  let roomLayer = $state<HTMLElement | null>(null);
  let layerHeight = $state(0);
  let barFoot = $state(0);
  let drawerNode = $state<HTMLElement | null>(null);
  /** vaul reads a px snap point with parseInt: every one whole. */
  const pxOf = (height: number) => `${Math.round(height)}px`;
  /**
   * The drawer's stops, as vaul takes them: heights shown over the
   * surface's foot, measured on the surface the drawer stands in (its
   * root's `container`), never the window. The surface stands where its
   * panel puts it: under the panel's head on a desk, in a phone's sheet at
   * whichever of the sheet's stops; measured on the window, every stop
   * stood lower by the surface's top, and at 390 the drawer stood wholly
   * under the screen's foot. Its head (the steps), half the surface, and
   * whole: up to the bar's foot. A stop no taller than the one under it
   * goes (a surface too short for three).
   */
  const SNAPS = $derived.by(() => {
    const room = Math.max(0, layerHeight - barFoot);
    const heights = [
      Math.min(browser ? numberOf("--c-graph-drawer-head") : 0, room),
      layerHeight / 2,
      room,
    ].map(Math.round);
    return heights
      .filter(
        (height, place) => height > 0 && height > (heights[place - 1] ?? 0)
      )
      .map(pxOf);
  });
  /** The stop the drawer stands at, by its place among the stops: the head first. */
  let stopAt = $state(0);
  const snap = $derived(SNAPS[Math.min(stopAt, SNAPS.length - 1)] ?? null);
  /** The drawer stands at its head stop: the steps, no list. */
  const atHead = $derived(stopAt === 0);
  /** How much of the surface the drawer stands over at its stop, px: the stage ends at its top. */
  const cover = $derived(snap ? Number.parseFloat(snap) : 0);
  /** The grabber steps the drawer to its next stop, and from the last back to its head (HIG, Sheets: a tap on the grabber cycles its detents). */
  const nextStop = () => {
    stopAt = SNAPS.length > 0 ? (stopAt + 1) % SNAPS.length : 0;
  };
  // vaul places the drawer at a stop as the stop changes; the surface
  // taking another height (a phone's sheet moving between its stops, a
  // pane resized) moves every stop's offset under it, so the drawer is
  // placed again at the stop it stands at, at once.
  let laidHeight = 0;
  $effect(() => {
    const height = layerHeight;
    const shown = cover;
    const node = drawerNode;
    untrack(() => {
      if (!(node && drawerShown && height > 0) || height === laidHeight) {
        laidHeight = height;
        return;
      }
      laidHeight = height;
      const ease = node.style.transition;
      node.style.transition = "none";
      node.style.transform = `translate3d(0, ${height - shown}px, 0)`;
      node.getBoundingClientRect();
      node.style.transition = ease;
    });
  });
  /** The stop the drawer stood at as the pane's sheet put it away; null while it stands. */
  let stopAway: number | null = null;
  // Put away under the pane's sheet, the drawer comes back at the stop it
  // stood at: vaul opens it at its first stop, so it is stepped there once
  // it stands again.
  $effect(() => {
    const away = paneSheet && roomOpen;
    untrack(() => {
      if (away) {
        stopAway ??= stopAt;
        return;
      }
      const back = stopAway;
      stopAway = null;
      if (back === null || back === 0 || !drawerShown) {
        return;
      }
      stopAt = 0;
      requestAnimationFrame(() => {
        stopAt = back;
      });
    });
  });
  /** The drawer's stop the stage was last brought to; null until the drawer stands at its first. */
  let stopShown: string | null = null;
  // At each stop he moves the drawer to, what the last press changed stays
  // in view above it. The stop the drawer opens at moves nothing (the stage
  // opens at its drawing's top), and nor does a press: only the stop
  // changing does.
  $effect(() => {
    const standing = snap;
    if (desk || standing === null) {
      stopShown = null;
      return;
    }
    untrack(() => {
      const opening = stopShown === null;
      if (opening || stopShown === standing) {
        stopShown = standing;
        return;
      }
      stopShown = standing;
      requestAnimationFrame(() => link.reveal());
    });
  });

  /** His own width, when it is one of the listed widths: that one stands for it, marked his own. */
  const ownListed = $derived(WIDTHS.some((one) => one.value === ownWidth));
  /** The view's width choice: his own width (null) is "own", or the listed width it equals. */
  const widthValue = $derived.by(() => {
    if (width !== null) {
      return String(width);
    }
    return ownListed ? String(ownWidth) : "own";
  });
  const pickWidth = (next: string) => {
    if (!next) {
      return;
    }
    width = next === "own" || Number(next) === ownWidth ? null : Number(next);
  };

  /**
   * Focus a menu or a card hands back, or takes as it opens, after a
   * press shows no ring (DESIGN.md, The One Ring Rule: pointer focus on a
   * control shows nothing): the focus moves as a script's, which would
   * draw it, so a press's moves it with `focusVisible: false`.
   */
  const quietFocus = (event: Event, to: HTMLElement | null | undefined) => {
    if (lastInput.current !== "pointer") {
      return;
    }
    event.preventDefault();
    to?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  };
  let menuTrigger = $state<HTMLElement | null>(null);
  let viewTrigger = $state<HTMLElement | null>(null);
  /** The room stands beside the stage on a desk: the states, the inspector, or both. */
  const beside = $derived(desk && (roomOpen || !!inspector));
  const laidOut = $derived(!beside || stageNeed > 0 || graceOver);

  /**
   * The stage and the room beside it are one resizable split (the kit's
   * Resizable, paneforge, on the app's own split edge, as side/Split.svelte
   * draws it): the edge between them drags, the stage never under
   * `c-graph-stage-min` and the room never under `c-graph-room-w`. Its
   * panes are sized in shares of the split's width, so each least width is
   * read as a share of the width it stands in now.
   */
  let splitWidth = $state(0);
  /** What the panes share, px. */
  const panesWidth = $derived(Math.max(0, splitWidth - DIVIDER));
  /** The room's width the person dragged the edge to, px; null until he has. */
  let roomDragged: number | null = null;
  /** The person holds the split's edge: a drag, or its keys while it has the focus. */
  let edgeHeld = false;
  let edgeNode = $state<HTMLElement | null>(null);
  let roomPane = $state<{ resize: (size: number) => void } | null>(null);
  const splitShare = (px: number) =>
    panesWidth > 0 ? Math.min(100, (px / panesWidth) * 100) : 0;
  /** Shares in hundredths, rounded up: a least width read as a share never stands under itself once laid out. */
  const leastShare = (px: number) => Math.ceil(splitShare(px) * 100) / 100;
  /** Each pane's least: its surface's least width and the pane's own inset beside the edge (`pe-space-2`, `ms-space-2`). */
  const stageLeast = $derived(
    leastShare(
      browser ? numberOf("--c-graph-stage-min") + numberOf("--space-2") : 0
    )
  );
  const roomLeast = $derived(
    leastShare(
      browser ? numberOf("--c-graph-room-w") + numberOf("--space-2") : 0
    )
  );
  /**
   * The room's share: the width he dragged it to, else what the stage
   * leaves once it holds its drawing (a form held to its measure asks for
   * that and no more, so the room takes the rest), each held between the
   * least widths. paneforge lays the split out again from it whenever a
   * least width changes with the split's width; the dragged width is read
   * untracked, so a drag never lays it out anew.
   */
  const roomShare: number = $derived(
    Math.min(
      100 - stageLeast,
      Math.max(
        roomLeast,
        // One state: the room holds one line, so it keeps its least and
        // the stage the rest.
        single
          ? 0
          : splitShare(
              untrack(() => roomDragged) ??
                splitWidth -
                  (stageNeed || (width ?? stageWidth)) -
                  (browser ? 2 * numberOf("--space-2") : 0)
            )
      )
    )
  );
  // The room takes its share whenever the share changes (the stage's
  // drawing measured, the surface resized), until he has moved the edge
  // himself: paneforge takes `defaultSize` once, as the split first lays
  // out.
  $effect(() => {
    const share = roomShare;
    const pane = roomPane;
    if (pane && beside && roomDragged === null) {
      pane.resize(share);
    }
  });
</script>

{#snippet statesFace(stepperHere: boolean)}
  {#if review && kept}
    {#if single}
      <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
        {words.oneState}
      </p>
    {:else}
      <Journey
        against={null}
        kept={kept.state}
        keptVariant={kept.variant}
        {lang}
        onpress={keep}
        onstep={(next) => keep(next, null)}
        {review}
        stepper={stepperHere}
      />
    {/if}
  {/if}
{/snippet}

{#snippet faceName(heading: boolean)}
  <!-- The room's one face: its Solar duotone glyph before its name. In
       the drawer the sheet's own title is the heading a reader hears (the
       kit's, read out only), so the name drawn here is not a second one. -->
  {@const [face] = FACES}
  <svelte:element
    this={heading ? "h2" : "p"}
    aria-hidden={heading ? undefined : "true"}
    class="mark-line m-0 flex min-w-0 flex-1 items-center gap-space-2 type-label text-ink-strong"
  >
    <face.icon
      aria-hidden="true"
      class="size-icon-md flex-none text-ink-muted"
      data-box
    />
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{face.label}</span
    >
  </svelte:element>
{/snippet}

{#snippet stepper()}
  <Stepper {at} {lang} onstep={(next) => keep(next, null)} {path} />
{/snippet}

{#snippet widthItem(
  value: string,
  name: string,
  px: number,
  own: boolean,
  Icon: typeof IconPhone
)}
  <ToggleGroup.Item aria-label={name} {value}>
    <!-- The device's glyph, then its figure, on one line inside the item. -->
    <span class="mark-line flex items-center gap-space-1" data-box>
      <Icon aria-hidden="true" class="size-icon-md flex-none" data-box />
      <span
        class={[
          "type-meta num",
          own && "underline decoration-dotted underline-offset-2",
        ]}>{figure(px)}</span
      >
    </span>
  </ToggleGroup.Item>
{/snippet}

<TooltipProvider>
  <div
    data-slot="design-graph"
    class="flex h-full min-h-0 min-w-0 flex-col bg-surface-page contain-layout"
    data-arriving={arriving || undefined}
    {lang}
    {@attach frameSize((node: HTMLElement) => {
      surface = node.clientWidth;
    })}
  >
    <!-- The bar: one row, no ground of its own. -->
    <header
      {@attach frameSize((node: HTMLElement) => {
        barFoot = node.offsetTop + node.offsetHeight;
      })}
      data-slot="graph-bar"
      class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3 px-space-6 max-desk:px-space-5"
    >
      <div class="flex min-w-0 flex-1 items-center">
        {#if reviews.length > 1 && review}
          <DropdownMenu.Root bind:open={menuOpen}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  bind:this={menuTrigger}
                  aria-label={words.components}
                  class="mark-line pointer-hit touch-hit -ms-space-2 inline-flex h-c-btn-h-sm min-w-0 items-center gap-space-1 rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
                  type="button"
                >
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{review.name}</span
                  >
                  <IconChevronDown
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-ink-muted"
                    data-box
                  />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="start"
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, menuTrigger)}
              width="regular"
            >
              <DropdownMenu.RadioGroup
                bind:value={
                  () => String(front),
                  (next: string) => {
                    front = Number(next);
                  }
                }
              >
                {#each reviews as one, index (one.file)}
                  <DropdownMenu.RadioItem value={String(index)}>
                    <span
                      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
                      >{one.name}</span
                    >
                  </DropdownMenu.RadioItem>
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else if review}
          <h1 class="m-0 min-w-0 truncate type-label text-ink-strong">
            {review.name}
          </h1>
        {/if}
      </div>

      <div
        class="flex flex-1 justify-end"
        {@attach (node: HTMLElement) => {
          glass = node.querySelector<HTMLElement>('[data-slot="tools"]');
        }}
      >
        <!-- The view; Show states only while the room is put away. The
             room's one close is its own. -->
        <BarGlass form="group" joined={viewJoined}>
          <Popover.Root bind:open={viewOpen}>
            <!-- No tooltip over its own open card: shown, it took the
                 card's Escape for itself. Nor as the card hands the focus
                 back on its close; it shows again once the focus or the
                 pointer leaves the control. -->
            <Tip disabled={viewOpen || viewQuiet} label={words.stageView}>
              {#snippet children(tip)}
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <button
                      data-bar-item
                      {...mergeProps(tip, props, {
                        onblur: () => {
                          viewQuiet = false;
                        },
                        onpointerleave: () => {
                          viewQuiet = false;
                        },
                      })}
                      bind:this={viewTrigger}
                      aria-label={words.stageView}
                      class="select-none touch-hit press-tint"
                      type="button"
                    >
                      <IconEye data-slot="bar-symbol" aria-hidden="true" />
                    </button>
                  {/snippet}
                </Popover.Trigger>
              {/snippet}
            </Tip>
            <!-- The view, hung from the glass as the app's glass hangs its
                 cards: it comes down out of the glass and goes back up. -->
            <HangCard
              align="end"
              anchor={glass}
              aria-label={words.stageView}
              bind:joined={viewJoined}
              customAnchor={glass}
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, viewTrigger)}
              onOpenAutoFocus={(event: Event) => quietFocus(event, viewTrigger)}
              frame="settings"
              side="bottom"
              sideOffset={0}
            >
              <!-- One pattern for every setting: its name leading, its
                   control trailing, on one grid, so the three read down
                   two columns (Jitter's inspector rows). On a phone the
                   card has no room for both columns: each control stands
                   under its name, at its own width, never past the card's
                   edge. -->
              <div
                class="grid min-w-0 grid-cols-(--cols) items-center justify-between gap-x-space-5 gap-y-space-3 p-space-4 max-phone:grid-cols-1 max-phone:gap-y-space-4"
                style:--cols="auto auto"
              >
                <div
                  class="contents max-phone:grid max-phone:min-w-0 max-phone:gap-space-2"
                >
                  <span class="type-label text-ink-row">{words.width}</span>
                  <!-- Each width once: his own is the listed width it
                       equals, marked his own, and stands apart only when
                       none is. The names are the items' own; no tooltip
                       opens over the card. -->
                  <ToggleGroup.Root
                    aria-label={words.width}
                    class="justify-self-end max-phone:justify-self-start"
                    onValueChange={pickWidth}
                    type="single"
                    value={widthValue}
                  >
                    {#if !ownListed}
                      {@render widthItem(
                        "own",
                        words.ownWidth(figure(ownWidth)),
                        ownWidth,
                        true,
                        IconMaximize
                      )}
                    {/if}
                    {#each WIDTHS as one (one.value)}
                      {@const own = one.value === ownWidth}
                      {@render widthItem(
                        String(one.value),
                        own
                          ? words.ownListed(one.name, figure(one.value))
                          : words.widthOf(one.name, figure(one.value)),
                        one.value,
                        own,
                        one.icon
                      )}
                    {/each}
                  </ToggleGroup.Root>
                </div>
                <div
                  class="contents max-phone:grid max-phone:min-w-0 max-phone:gap-space-2"
                >
                  <span class="type-label text-ink-row">{words.scheme}</span>
                  <ToggleGroup.Root
                    aria-label={words.scheme}
                    class="justify-self-end max-phone:justify-self-start"
                    onValueChange={(next: string) => {
                      if (next) {
                        scheme = next === "dark" ? "dark" : "light";
                      }
                    }}
                    type="single"
                    value={scheme}
                  >
                    <ToggleGroup.Item aria-label={words.light} value="light">
                      <IconSun aria-hidden="true" class="size-icon-md" />
                    </ToggleGroup.Item>
                    <ToggleGroup.Item aria-label={words.dark} value="dark">
                      <IconMoon aria-hidden="true" class="size-icon-md" />
                    </ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>
                <div
                  class="contents max-phone:flex max-phone:min-w-0 max-phone:items-center max-phone:justify-between max-phone:gap-space-3"
                >
                  <label class="type-label text-ink-row" for="{uid}-reduce"
                    >{words.reduceMotion}</label
                  >
                  <Switch
                    bind:checked={reduce}
                    class="justify-self-end"
                    id="{uid}-reduce"
                  />
                </div>
              </div>
            </HangCard>
          </Popover.Root>
          {#if !roomShown}
            <Tip label={words.openRoom(roomName)}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  {...mergeProps(tip, {
                    onclick: () => {
                      roomOpen = true;
                      stopAt = 0;
                      // The one asked for last stands: the pane's sheet goes as the drawer rises.
                      if (paneSheet) {
                        onroom?.();
                      }
                    },
                  })}
                  aria-label={words.openRoom(roomName)}
                  class="select-none touch-hit press-tint"
                  type="button"
                >
                  <IconRoom data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
        </BarGlass>
      </div>
    </header>

    <!-- The page: the stage, and on a desk the room beside it. On a phone
         its foot stands at the drawer's top at each stop, so the stage
         ends where the drawer begins. -->
    <div
      data-slot="graph-page"
      class={[
        !laidOut && "invisible",
        "flex min-h-0 min-w-0 flex-1 overflow-clip px-space-6 max-desk:px-space-5",
        !desk && drawerShown ? "pb-(--drawer-cover)" : "pb-space-6",
      ]}
      style:--drawer-cover="{cover}px"
      {@attach frameSize((node: HTMLElement) => {
        const style = getComputedStyle(node);
        splitWidth =
          node.clientWidth -
          Number.parseFloat(style.paddingInlineStart) -
          Number.parseFloat(style.paddingInlineEnd);
      })}
    >
      <!-- The stage, and on a desk the room beside it: one resizable split.
           The stage's pane stays while the room comes and goes, so the
           frame in it, and the component on its page, stay the one live
           instance. -->
      <Resizable.PaneGroup
        class="min-w-0 flex-1"
        direction="horizontal"
        height="shrink"
      >
        <Resizable.Pane
          defaultSize={beside ? 100 - roomShare : 100}
          id="stage"
          look="split"
          minSize={beside ? stageLeast : 100}
          order={1}
        >
          <!-- The panes clip: the panels inside stand a border's width in
               from each clipped edge, so their ring draws whole. -->
          <div
            class={[
              "flex min-h-0 min-w-0 flex-1 flex-col py-(--border-width) ps-(--border-width)",
              beside ? "pe-space-2" : "pe-(--border-width)",
            ]}
          >
            <StagePane
              bind:need={stageNeed}
              {frame}
              laid={link.laid}
              name={keptState?.name ?? ""}
              {stale}
              variant={keptVariant?.name ?? null}
            />
          </div>
        </Resizable.Pane>
        {#if beside}
          <Resizable.Handle
            bind:ref={edgeNode}
            look="split"
            onDraggingChange={(on: boolean) => {
              edgeHeld = on;
            }}
          />
          <Resizable.Pane
            defaultSize={roomShare}
            id="room"
            look="split"
            minSize={roomLeast}
            order={2}
            bind:this={roomPane}
            onResize={(size) => {
              const his =
                edgeHeld ||
                (edgeNode !== null && document.activeElement === edgeNode);
              if (his && panesWidth > 0) {
                roomDragged = (size / 100) * panesWidth;
              }
            }}
          >
            <!-- The room: one surface, closed by its Close or Esc. It
                 comes in from its edge and goes back there, as the app's
                 panels do (the sheet recipe's motion, `sheetSlide`). -->
            <aside
              data-slot="graph-room"
              aria-label={roomOpen ? roomName : undefined}
              in:sheetSlide|global={{ axis: "X", leaving: false }}
              out:sheetSlide|global={{ axis: "X", leaving: true }}
              class="relative my-(--border-width) ms-space-2 me-(--border-width) flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
            >
              {#if roomOpen}
                <!-- Its head on the stage's head line: its face, its Close. -->
                <div
                  class="flex min-h-c-top-bar-h min-w-0 flex-none items-center gap-space-2 border-b border-border-hairline ps-space-4 pe-space-2"
                >
                  {@render faceName(true)}
                  <Tip label={words.closeRoom(roomName)}>
                    {#snippet children(tip)}
                      <button
                        {...mergeProps(tip, {
                          onclick: () => {
                            roomOpen = false;
                          },
                        })}
                        type="button"
                        aria-label={words.closeRoom(roomName)}
                        class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-pill text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
                      >
                        <IconClose aria-hidden="true" class="size-icon-md" />
                      </button>
                    {/snippet}
                  </Tip>
                </div>
                <div class="flex min-h-0 min-w-0 flex-1 flex-col p-space-4">
                  {@render statesFace(true)}
                </div>
              {/if}
              {@render inspector?.()}
            </aside>
          </Resizable.Pane>
        {/if}
      </Resizable.PaneGroup>
    </div>

    {#if !desk}
      <!-- Under the beside line: the room is the kit's bottom drawer, its
         stops head (the steps), half and whole; the page above it stays
         live and ends at its top. Its grabber steps between the stops; its
         Close is its own, 44px to a finger. Drawn in place, in a layer as
         big as the surface (its root's `container`, the kit's `contained`
         sheet), so its stops are heights over the surface's own foot and
         it is clipped there, wherever the surface stands. -->
      <div
        data-slot="room-layer"
        class="pointer-events-none absolute inset-0 overflow-clip"
        bind:this={roomLayer}
        {@attach frameSize((node: HTMLElement) => {
          layerHeight = node.clientHeight;
        })}
      >
        <Drawer.Root
          bind:activeSnapPoint={
            () => snap,
            (next: number | string | null) => {
              const at = SNAPS.indexOf(String(next));
              if (at >= 0) {
                stopAt = at;
              }
            }
          }
          bind:open={
            () => drawerShown,
            (next: boolean) => {
              // Put away under the pane's sheet, the drawer keeps his choice for when it goes.
              if (!paneSheet) {
                roomOpen = next;
              }
            }
          }
          container={roomLayer}
          dismissible={false}
          modal={false}
          shouldScaleBackground={false}
          snapPoints={SNAPS}
        >
          <Drawer.Content
            bind:ref={drawerNode}
            contained
            grabber={{ label: words.nextStop(roomName), onpress: nextStop }}
            modal={false}
            onOpenAutoFocus={(event: Event) => event.preventDefault()}
            portalProps={{ disabled: true }}
            onmousedown={keepFocusOnPage}
            trapFocus={false}
            ownHead
            title={roomName}
          >
            <div
              class="flex min-h-0 flex-auto flex-col gap-space-3 px-space-4 pb-(--snap-drop)"
              style:--snap-drop="{Math.max(0, layerHeight - cover)}px"
            >
              <div class="flex min-w-0 items-center gap-space-2">
                {@render faceName(false)}
                <!-- The drawer's one Close, the ghost the kit's sheet heads
                     draw. It puts the room away itself: vaul's Close asks
                     the dialog to close, and a root that is not
                     `dismissible` refuses every such ask; the drawer is not
                     dismissible so that a drag past its head stop never
                     closes it. -->
                <Button
                  aria-label={words.closeRoom(roomName)}
                  icon={IconClose}
                  onclick={() => {
                    roomOpen = false;
                  }}
                  press="pressable"
                  size="icon-sm"
                  title={words.closeRoom(roomName)}
                  variant="ghost"
                />
              </div>
              <!-- At the head stop the drawer holds its head alone, the steps:
                   the list drawn into its sliver ran past the screen's foot. -->
              {#if !single}
                {@render stepper()}
              {/if}
              {#if single || !atHead}
                {@render statesFace(false)}
              {/if}
            </div>
          </Drawer.Content>
        </Drawer.Root>
      </div>
    {/if}
  </div>
</TooltipProvider>
