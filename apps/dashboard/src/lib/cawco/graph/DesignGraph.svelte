<script lang="ts" module>
  /** What the agent's ask names: the component in front, the state it opens on, and the face the room opens on. */
  export interface Ask {
    component?: string;
    /** The room's face it opens on: the states (the default), the whole set, or the move. */
    face?: Face;
    state?: string;
  }

  /** The room's three faces: the states list with its steps, the whole set, the move. */
  export type Face = "states" | "whole" | "move";
</script>

<script lang="ts">
  /**
   * The design graph (spec.md §5; its surface brief under
   * apps/dashboard/.impeccable/surfaces): where the owner judges a
   * component an agent built. The stage holds the real component in the
   * state he keeps, and only that: a press on a state keeps it, and
   * nothing else changes the stage. Beside it one room, its one switch
   * (fluid-tabs) choosing its face: the states list with its steps, the
   * whole set, or the move into the kept state. Compare, a switch that
   * stays on, compares the kept state with the one before it (model
   * `previousOf`, the state the Move face plays from) at once,
   * and a press on another state compares with that one instead; the
   * stage keeps the kept state and rings what differs. The move into a
   * kept state plays once as it arrives, then its playhead rests at its
   * start. Several components under one ask: one in front, the others
   * behind its name's menu.
   *
   * One bar of one row (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): leading the component's name (its menu when there are several),
   * trailing one glass group of bare symbols (Compare, the stage's view,
   * and Show states only while the room is put away: the room's one close
   * is its own). The view is a card hung from the glass (HangCard, as the
   * app's own glass hangs its cards): the widths as device glyphs, the
   * scheme as sun and moon, Reduce motion as a switch. Under the desk line
   * (900px of its own width) the room is the kit's bottom drawer, its
   * stops head, half and whole, the stage whole above it at the head stop.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, tick, untrack } from "svelte";
  import { bridge } from "#lib/cawco/decisions/host/page.svelte.js";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import {
    motionOk,
    numberOf,
    sheetSlide,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
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
    IconCompare,
    IconLayers,
    IconListRows,
    IconMaximize,
    IconMonitor,
    IconMoon,
    IconPhone,
    IconPlay,
    IconSidebar,
    IconStructure,
    IconSun,
    IconTablet,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { figureOf, langOf } from "./figures";
  import Journey from "./Journey.svelte";
  import MoveFace, { type MoveState, type Timings } from "./MoveFace.svelte";
  import {
    type Move,
    moveInto,
    pathOf,
    previousOf,
    type Review,
    type ReviewInput,
    reviewOf,
  } from "./model";
  import { type Clip, lengthOf, Replays, tunedRecord, untune } from "./motion";
  import Stage, { type Shown } from "./Stage.svelte";
  import Stepper from "./Stepper.svelte";
  import WholeSet from "./WholeSet.svelte";

  let {
    inputs,
    ask = {},
    stale = false,
  }: {
    /** The components under review, each its states file and the agent's spec. */
    inputs: ReviewInput[];
    ask?: Ask;
    /** The hub's link is down. */
    stale?: boolean;
  } = $props();

  const reviews = $derived(inputs.map(reviewOf));
  /** The component the ask names, else the first: the one in front until he picks another. */
  const askedFront = $derived(
    Math.max(
      0,
      reviews.findIndex((one) => one.name === ask.component)
    )
  );
  let front = $derived(askedFront);
  const review = $derived(reviews[front] as Review);

  /** A state and one of its variants (null: the state as written). */
  interface Pick {
    state: string;
    variant: string | null;
  }
  /** Where a component opens: the state the ask names (a variant's or a width's state too), else its first. */
  const first = (one: Review): Pick => {
    const asked =
      one.name === ask.component || reviews.length === 1
        ? ask.state
        : undefined;
    const holder = one.order.find(
      (id) =>
        id === asked ||
        one.states[id]?.variants.some((each) => each.id === asked) ||
        one.states[id]?.widths.some((size) => size.story === asked)
    );
    const state = holder ?? one.order[0] ?? "";
    const variant =
      one.states[state]?.variants.find((each) => each.id === asked)?.id ?? null;
    return { state, variant };
  };
  /** The kept state of each component, by its name. */
  let keptOf = $state<Record<string, Pick>>(
    untrack(() =>
      Object.fromEntries(reviews.map((one) => [one.name, first(one)]))
    )
  );
  const kept = $derived(keptOf[review.name] ?? first(review));
  let comparing = $state(false);
  /** The state the kept one is compared with, while comparing. */
  let against = $state<string | null>(null);
  /** The face the ask names: the room's until he picks another. */
  const askedFace = $derived<Face>(ask.face ?? "states");
  let face = $derived<Face>(askedFace);
  let roomOpen = $state(true);
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
  /** The page's language, which its figures are grouped in (figures.ts). */
  let lang = $state<string | undefined>(undefined);
  /**
   * The divider's width (the kit handle's `w-px`): paneforge shares what is
   * left of the group beside it between the panes, so every share is of
   * that (as side/Split.svelte reads it).
   */
  const DIVIDER = 1;
  /** The px the two least shares, each rounded up to a hundredth, may add between them on the widest surface: under one. */
  const ROUNDING = 1;
  /**
   * The room stands beside the stage only where the surface holds both
   * whole: the stage at its least (`c-graph-stage-min`), the room at its
   * least (`c-graph-room-w`), the gap between them, the split's divider
   * and the page's gutters. Under that (1066px today) the room is the
   * drawer, as the stage's least width says it becomes ("under it the room
   * becomes the drawer"); a narrower desk ran the room past the surface's
   * edge.
   */
  const besideLine = $derived(
    browser
      ? numberOf("--c-graph-stage-min") +
          numberOf("--c-graph-room-w") +
          numberOf("--space-5") +
          numberOf("--space-7") +
          numberOf("--space-6") +
          DIVIDER +
          ROUNDING
      : 0
  );
  const desk = $derived(surface === 0 || surface >= besideLine);

  /**
   * A state as the stage draws it: a record set's args when one is picked;
   * at a width he picked that one of its stories is written for (its
   * phone story at 390), that story's; else as written.
   */
  const drawOf = (pick: Pick, atWidth: number | null): Shown => {
    const state = review.states[pick.state];
    const variant = state?.variants.find((one) => one.id === pick.variant);
    const sized =
      atWidth === null
        ? null
        : state?.widths.find((one) => one.width === atWidth);
    return {
      args: variant?.args ?? sized?.args ?? state?.args ?? review.args,
      name: state?.name ?? pick.state,
      story: variant?.story ?? sized?.story ?? pick.state,
      variant: variant?.name ?? null,
      width: sized?.width ?? state?.width ?? null,
      line: state?.line ?? null,
    };
  };
  const shown = $derived(drawOf(kept, width));
  const againstShown = $derived(
    comparing && against
      ? drawOf({ state: against, variant: null }, width)
      : null
  );

  /** Compare turned on compares with the state before the kept one (`previousOf`), the one the move plays from. It leaves the room as it stands: the states are what he compares against. */
  const setComparing = (on: boolean) => {
    comparing = on;
    against = on ? previousOf(review, kept.state) : null;
  };
  /** A press on a state: while comparing, compare with it; else keep it (a record set too). */
  const press = (state: string, variant: string | null) => {
    if (comparing && state !== kept.state) {
      against = state;
      return;
    }
    keep(state, variant);
  };
  const keep = (state: string, variant: string | null) => {
    keptOf = { ...keptOf, [review.name]: { state, variant } };
    if (comparing && against === state) {
      against = previousOf(review, state);
    }
  };

  // --- The move into the kept state ------------------------------------------

  let stage = $state<ReturnType<typeof Stage>>();
  let move = $state<MoveState>({ kind: "none", state: "" });
  let playhead = $state(0);
  let playing = $state(false);
  let run = 0;
  let clock = 0;
  const replays = new Replays();

  /** The components whose kept region has been brought into view, once, as each opened. */
  const opened = new Set<string>();
  /** What the move changed on the stage: each moving thing. */
  const regionOf = (clips: readonly Clip[]): Element[] =>
    clips.flatMap((clip) => (clip.thing ? [clip.thing] : []));
  /** What a row rested on in the move names on the stage. */
  let lit = $state<Element | null>(null);

  const stop = () => {
    playing = false;
    cancelAnimationFrame(clock);
  };
  /** The animation as read, or as he changed it: what the rows show and Play plays. */
  let timings = $state<Timings>("edited");
  const clipsNow = (): Clip[] => {
    if (move.kind !== "ready") {
      return [];
    }
    return timings === "original" ? move.clips.map(untune) : move.clips;
  };

  /** The state the live instance stands in, by component, and the pick it was reached for. */
  let onStage: { key: string; review: string; state: string } | null = null;
  const keyOf = (on: Review, pick: Pick) =>
    `${on.name}\u0000${pick.state}\u0000${pick.variant ?? ""}`;
  /** A state's args as the stage draws it at the width he picked. */
  const argsOf = (pick: Pick) => drawOf(pick, width).args;

  /** The state a pick names, by its name; "" when it names none. */
  const nameIn = (on: Review, state: string) => on.states[state]?.name ?? "";

  /**
   * The component opened on the stage for `pick`: at the from state when
   * the states file plays a move into it (the move then plays once as it
   * arrives), else at the pick itself, at rest. Answers whether the move is
   * still to play.
   */
  const openFor = async (
    on: Review,
    pick: Pick,
    played: Move | null
  ): Promise<boolean> => {
    const opening: Pick = played ? { state: played.from, variant: null } : pick;
    await stage?.reach(argsOf(opening));
    onStage = {
      key: keyOf(on, opening),
      review: on.name,
      state: opening.state,
    };
    return played !== null;
  };

  /**
   * The stage brought to `pick` on `on` (Stage `reach`, the one way it
   * moves): its args set on the live instance, or, when the states file
   * plays the move into it from the state on stage, that play run on it.
   * What the engine ran is the Animation face's, from the state that stood
   * there; then its playhead rests at its start.
   */
  const arrive = async (on: Review, pick: Pick) => {
    const key = keyOf(on, pick);
    if (onStage?.key === key) {
      return;
    }
    stop();
    replays.release();
    run += 1;
    const mine = run;
    playhead = 0;
    timings = "edited";
    const to = nameIn(on, pick.state) || pick.state;
    const into = pick.variant === null ? moveInto(on, pick.state) : null;
    const played = into && on.states[pick.state]?.play ? into : null;
    const none: MoveState = { kind: "none", state: to };
    try {
      if (onStage?.review !== on.name && !(await openFor(on, pick, played))) {
        move = mine === run ? none : move;
        opened.add(on.name);
        return;
      }
      await pressOn(on, pick, played, mine);
    } catch (error) {
      // A play that threw left the instance part-way: no state is on stage.
      onStage = { key: "", review: on.name, state: "" };
      if (mine === run && move.kind === "reading") {
        move = {
          kind: "failed",
          from: move.from,
          to: move.to,
          why: error instanceof Error ? error.message : String(error),
        };
      }
    }
  };

  /** The live instance moved to `pick` from the state on stage: by the played move when it starts there, else by its args; its clips read. */
  const pressOn = async (
    on: Review,
    pick: Pick,
    played: Move | null,
    mine: number
  ) => {
    const to = nameIn(on, pick.state) || pick.state;
    const none: MoveState = { kind: "none", state: to };
    const from = nameIn(on, onStage?.state ?? "");
    const play =
      played && onStage?.state === played.from
        ? (on.states[pick.state]?.play ?? null)
        : null;
    move = from ? { kind: "reading", from, to } : none;
    await tick();
    const clips = await stage?.reach(argsOf(pick), play, still);
    if (!clips) {
      return;
    }
    onStage = { key: keyOf(on, pick), review: on.name, state: pick.state };
    if (mine !== run) {
      return;
    }
    move = from ? { kind: "ready", from, to, clips } : none;
    // On open, once: the region the move changed brought into view with
    // room for its ring, the state's own evidence. A press after that
    // keeps the stage's scroll where he left it.
    if (!opened.has(on.name)) {
      opened.add(on.name);
      await stage?.reveal(regionOf(clips));
    }
  };
  // Each kept state is reached on the one live instance; a width or a
  // scheme picked lays it out anew and moves nothing.
  $effect(() => {
    const on = review;
    const pick = kept;
    const drawn = stage;
    untrack(() => {
      if (drawn) {
        arrive(on, pick);
      }
    });
  });

  /** The rate the move last played at, and the one a scrub resumes at once let go. */
  let lastRate = 1;
  let resumeRate: number | null = null;
  const play = (rate: number) => {
    const clips = clipsNow();
    if (clips.length === 0) {
      return;
    }
    stop();
    lastRate = rate;
    const length = lengthOf(clips);
    if (still) {
      replays.seek(clips, length);
      stage?.fadeIn();
      playhead = 0;
      return;
    }
    const from = playhead >= length ? 0 : playhead;
    replays.play(clips, from, rate);
    playing = true;
    const t0 = performance.now();
    const step = () => {
      playhead = Math.min(length, from + (performance.now() - t0) * rate);
      if (playhead >= length) {
        playing = false;
        playhead = 0;
        return;
      }
      clock = requestAnimationFrame(step);
    };
    clock = requestAnimationFrame(step);
  };
  /** A scrub while the move plays pauses it; let go, it plays on from there (DialKit's rule). */
  const scrub = (t: number) => {
    if (playing) {
      resumeRate = lastRate;
    }
    stop();
    playhead = t;
    replays.seek(clipsNow(), t);
  };
  /**
   * A move whose play threw, played again (its Try again): the stage is
   * left part-way by the throw, so its from state is reached anew and the
   * move plays from there, as it played on arrival.
   */
  const retry = () => {
    onStage = null;
    arrive(review, kept);
  };
  const scrubbed = () => {
    if (resumeRate !== null) {
      const rate = resumeRate;
      resumeRate = null;
      play(rate);
    }
  };
  /**
   * Every change he made goes to the artifact as the component canvas's
   * `tuned` record (stage-host canvas chrome.ts `openMove`), the tuned clips
   * alone, 300 ms after the last change, through the preview's bridge;
   * `artifact_read` answers it. A reset clip leaves the record.
   */
  const SEND_AFTER_MS = 300;
  let sending: ReturnType<typeof setTimeout> | undefined;
  const sendTuned = () => {
    clearTimeout(sending);
    const now = move;
    sending = setTimeout(() => {
      if (now.kind === "ready") {
        bridge()
          ?.set("tuned", tunedRecord(words.move(now.from, now.to), now.clips))
          .catch(() => undefined);
      }
    }, SEND_AFTER_MS);
  };
  /**
   * The clips he tuned put in the move, which plays at once from where the
   * changed row now begins: he nudges a length or a curve "and feel[s] the
   * difference before he writes a remark" (spec.md §2, "That's too slow.
   * Let me try 260."), and the difference is that row's. What ran before
   * it stands at its end; what runs with it plays with it.
   */
  const retime = (changed: readonly Clip[]) => {
    if (move.kind !== "ready" || changed.length === 0) {
      return;
    }
    const by = new Map(changed.map((clip) => [clip.id, clip]));
    move = {
      ...move,
      clips: move.clips.map((clip) => by.get(clip.id) ?? clip),
    };
    if (!move.clips.some((clip) => clip.was)) {
      timings = "edited";
    }
    sendTuned();
    playhead = Math.min(...changed.map((clip) => clip.start + clip.delay));
    play(1);
  };

  // --- Keys ---------------------------------------------------------------------

  /**
   * Only the person's own press or key closes what he opened. A move's
   * play presses inside the stage with events of its own making
   * (core stage-play.ts `userEventIn`: a `pointerdown` that bubbles to the
   * document, a focus, keys), and the view card's layer read that
   * `pointerdown` as a press outside it and closed: picking a width draws
   * the state's story at that width, whose move plays as it arrives.
   */
  const personsOwn = (event: Event) => {
    if (!event.isTrusted) {
      event.preventDefault();
    }
  };

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
        roomOpen
      ) {
        roomOpen = false;
      }
    };
    window.addEventListener("keydown", key);
    const resized = () => {
      windowHeight = window.innerHeight;
    };
    window.addEventListener("resize", resized);
    return () => {
      window.removeEventListener("resize", resized);
      window.removeEventListener("keydown", key);
      stop();
      replays.release();
    };
  });

  /** The journey's one order: the component's path, as the list shows it. */
  const path = $derived(pathOf(review));
  const at = $derived(path.indexOf(kept.state));
  const single = $derived(review.order.length === 1);
  /** The widths the stage is drawn at, each a device's glyph; its own first. */
  const WIDTHS = [
    { value: 390, icon: IconPhone, name: words.phone },
    { value: 680, icon: IconTablet, name: words.tablet },
    { value: 1440, icon: IconMonitor, name: words.desk },
  ] as const;
  const DESK_FORM = 1280;
  const ownWidth = $derived(drawOf(kept, null).width ?? DESK_FORM);
  /**
   * The stage's share of a wide surface: the widest of the component's own
   * widths, so it holds still from state to state. Taken from the kept
   * state's own width, a press on a state written at 680 after one at
   * 1440 narrowed the stage and widened the room beside it, and the list's
   * rows wrapped anew.
   */
  const stageWidth = $derived(
    Math.max(
      0,
      ...review.order.map((id) => review.states[id]?.width ?? DESK_FORM)
    ) || DESK_FORM
  );
  /** The head's glass, which the view's card hangs from, and whether it hangs. */
  let glass = $state<HTMLElement | null>(null);
  let viewJoined = $state(false);
  /**
   * The view card is open. It is kept mounted while shut (`forceMount`), as
   * the glass's own card is (GlassCard), so it goes back up behind the
   * glass's cut on its close and rests there (motion/hang), never cut off
   * as bits-ui unmounted it.
   */
  let viewOpen = $state(false);
  /**
   * The drawer's stops, as vaul takes them: shares of the window's height
   * for a sheet as tall as its cap (`--c-sheet-max-h`, a share of the
   * window), so a stop showing `px` of it is that share less what the cap
   * leaves above the sheet. Its head (the faces and the steps), half, and
   * whole.
   */
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
  /** A root token's value as the page computes it. */
  const rootValue = (name: string): string =>
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement).getPropertyValue(name);
  let windowHeight = $state(
    typeof window === "undefined" ? 844 : window.innerHeight
  );
  const capShare = $derived(
    Number.parseFloat(rootValue("--c-sheet-max-h")) / 100 || 1
  );
  const shareOf = (px: number) =>
    Math.min(1, px / windowHeight + (1 - capShare));
  const head = $derived(
    shareOf(browser ? numberOf("--c-graph-drawer-head") : 0)
  );
  const SNAPS = $derived([head, shareOf(windowHeight / 2), 1]);
  let snap = $state<number | string | null>(null);
  $effect(() => {
    if (snap === null) {
      snap = head;
    }
  });
  /** How much of the window the drawer stands over at a stop (a share as vaul takes it), px: the stage's scroller ends at its top. */
  const coverOf = (share: number) =>
    Math.max(0, (share - (1 - capShare)) * windowHeight);
  const cover = $derived(
    typeof snap === "number" ? coverOf(snap) : coverOf(head)
  );
  /** The grabber steps the drawer to its next stop, and from the last back to its head (HIG, Sheets: a tap on the grabber cycles its detents). */
  const nextStop = () => {
    const here = typeof snap === "number" ? SNAPS.indexOf(snap) : -1;
    snap = SNAPS[(here + 1) % SNAPS.length] ?? head;
  };
  // At each stop the region he is judging stays in view above the drawer:
  // the first difference while comparing, else what the move changed.
  $effect(() => {
    if (desk || snap === null) {
      return;
    }
    const clips = clipsNow();
    untrack(() => {
      requestAnimationFrame(() => stage?.reveal(regionOf(clips)));
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
  /** The room stands beside the stage on a desk. */
  const beside = $derived(desk && roomOpen);

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
  const splitShare = (px: number) =>
    panesWidth > 0 ? Math.min(100, (px / panesWidth) * 100) : 0;
  /** Shares in hundredths, rounded up: a least width read as a share never stands under itself once laid out. */
  const leastShare = (px: number) => Math.ceil(splitShare(px) * 100) / 100;
  /** Each pane's least: its surface's least width and the pane's own inset beside the edge (`pe-space-2`, `ms-space-3`). */
  const stageLeast = $derived(
    leastShare(
      browser ? numberOf("--c-graph-stage-min") + numberOf("--space-2") : 0
    )
  );
  const roomLeast = $derived(
    leastShare(
      browser ? numberOf("--c-graph-room-w") + numberOf("--space-3") : 0
    )
  );
  /**
   * The room's share: the width he dragged it to, else what the stage at
   * its component's widest leaves, each held between the least widths.
   * paneforge lays the split out again from it whenever a least width
   * changes with the split's width; the dragged width is read untracked, so
   * a drag never lays it out anew.
   */
  const roomShare = $derived(
    Math.min(
      100 - stageLeast,
      Math.max(
        roomLeast,
        splitShare(
          untrack(() => roomDragged) ??
            splitWidth -
              (width ?? stageWidth) -
              (browser ? numberOf("--space-5") : 0)
        )
      )
    )
  );
</script>

{#snippet statesFace(stepperHere: boolean)}
  {#if single}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.oneState}
    </p>
  {:else if face === "whole"}
    <WholeSet
      against={comparing ? against : null}
      kept={kept.state}
      onpress={press}
      {review}
    />
  {:else}
    <Journey
      against={comparing ? against : null}
      kept={kept.state}
      keptVariant={kept.variant}
      onpress={press}
      onstep={(next) => keep(next, null)}
      {review}
      stepper={stepperHere}
    />
  {/if}
{/snippet}

{#snippet moveFace()}
  <MoveFace
    {move}
    onlight={(thing) => {
      lit = thing;
    }}
    onpause={stop}
    onplay={play}
    onreset={(ids) =>
      retime(
        clipsNow()
          .filter((clip) => ids.includes(clip.id))
          .map(untune)
      )}
    onretime={retime}
    onretry={retry}
    onseek={scrub}
    onseekend={scrubbed}
    ontimings={(next) => {
      timings = next;
      stop();
      replays.release();
      playhead = 0;
      play(1);
    }}
    {lang}
    {playhead}
    {playing}
    {still}
    {timings}
  />
{/snippet}

{#snippet faces()}
  <Tabs
    class="min-w-0 flex-1"
    onValueChange={(next) => {
      face = next === "whole" || next === "move" ? next : "states";
      lit = null;
    }}
    size="compact"
    value={face}
  >
    <TabsList aria-label={words.faces}>
      <!-- Each face its Solar duotone glyph before its name, at the
           tabs' own icon size and ink (fluid-tabs TabItem `icon`). -->
      <TabItem icon={IconListRows} label={words.statesFace} value="states" />
      <TabItem icon={IconStructure} label={words.wholeSet} value="whole" />
      <TabItem icon={IconPlay} label={words.moveFace} value="move" />
    </TabsList>
  </Tabs>
{/snippet}

{#snippet stepper()}
  <Stepper {at} onstep={(next) => keep(next, null)} {path} />
{/snippet}

{#snippet widthItem(
  value: string,
  name: string,
  figure: number,
  own: boolean,
  Icon: typeof IconPhone
)}
  <ToggleGroup.Item aria-label={name} {value}>
    <!-- mark-line: the device's glyph stands over its figure, not beside it -->
    <span class="flex flex-col items-center gap-space-row" data-box>
      <Icon aria-hidden="true" />
      <span
        class={[
          "type-meta num",
          own && "underline decoration-dotted underline-offset-2",
        ]}>{figureOf(figure, lang)}</span
      >
    </span>
  </ToggleGroup.Item>
{/snippet}

<TooltipProvider>
  <div
    data-slot="design-graph"
    class="flex h-full min-h-0 min-w-0 flex-col bg-surface-page contain-layout"
    {@attach frameSize((node: HTMLElement) => {
      surface = node.clientWidth;
      lang = langOf(node);
    })}
  >
    <!-- The bar: one row, no ground of its own. -->
    <header
      data-slot="graph-bar"
      class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3 ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
    >
      <div class="flex min-w-0 flex-1 items-center">
        {#if reviews.length > 1}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  bind:this={menuTrigger}
                  aria-label={words.components}
                  class="mark-line pointer-hit touch-hit inline-flex h-c-btn-h-sm min-w-0 items-center gap-space-1 rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
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
                    against = null;
                    comparing = false;
                    lit = null;
                  }
                }
              >
                {#each reviews as one, index (one.name)}
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
        {:else}
          <h1
            class="m-0 min-w-0 truncate px-space-2 type-label text-ink-strong"
          >
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
        <!-- Compare and the view; Show states only while the room is put
             away. The room's one close is its own. -->
        <BarGlass form="group" joined={viewJoined}>
          {#if !single}
            <Tip label={words.compare}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  {...mergeProps(tip, {
                    onclick: () => setComparing(!comparing),
                  })}
                  aria-label={words.compare}
                  aria-pressed={comparing}
                  class="select-none touch-hit press-tint aria-pressed:bg-selected-bg aria-pressed:text-selected-ink"
                  type="button"
                >
                  <IconCompare data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
          <Popover.Root bind:open={viewOpen}>
            <Tip label={words.stageView}>
              {#snippet children(tip)}
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <button
                      data-bar-item
                      {...mergeProps(tip, props)}
                      bind:this={viewTrigger}
                      aria-label={words.stageView}
                      class="select-none touch-hit press-tint"
                      type="button"
                    >
                      <IconLayers data-slot="bar-symbol" aria-hidden="true" />
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
              forceMount
              inert={!viewOpen}
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, viewTrigger)}
              onEscapeKeydown={personsOwn}
              onInteractOutside={personsOwn}
              onOpenAutoFocus={(event: Event) => quietFocus(event, viewTrigger)}
              side="bottom"
              sideOffset={0}
            >
              <div class="flex min-w-0 flex-col gap-space-4 p-space-4">
                <div class="flex min-w-0 flex-col gap-space-2">
                  <span class="type-label text-ink-muted">{words.width}</span>
                  <!-- Each width once: his own is the listed width it
                       equals, marked his own, and stands apart only when
                       none is. The names are the items' own; no tooltip
                       opens over the card. -->
                  <ToggleGroup.Root
                    aria-label={words.width}
                    onValueChange={pickWidth}
                    type="single"
                    value={widthValue}
                  >
                    {#if !ownListed}
                      {@render widthItem(
                        "own",
                        words.ownWidth(ownWidth),
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
                          ? words.ownListed(one.name, one.value)
                          : words.widthOf(one.name, one.value),
                        one.value,
                        own,
                        one.icon
                      )}
                    {/each}
                  </ToggleGroup.Root>
                </div>
                <div
                  class="flex min-w-0 items-center justify-between gap-space-4"
                >
                  <span class="type-label text-ink-muted">{words.scheme}</span>
                  <Tabs
                    onValueChange={(next) => {
                      scheme = next === "dark" ? "dark" : "light";
                    }}
                    size="compact"
                    value={scheme}
                  >
                    <TabsList aria-label={words.scheme}>
                      <TabItem
                        glyphOnly
                        icon={IconSun}
                        label={words.light}
                        value="light"
                      />
                      <TabItem
                        glyphOnly
                        icon={IconMoon}
                        label={words.dark}
                        value="dark"
                      />
                    </TabsList>
                  </Tabs>
                </div>
                <label
                  class="flex min-w-0 items-center justify-between gap-space-4 type-label text-ink-row"
                >
                  <span>{words.reduceMotion}</span>
                  <Switch bind:checked={reduce} />
                </label>
              </div>
            </HangCard>
          </Popover.Root>
          {#if !roomOpen}
            <Tip label={words.openRoom}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  {...mergeProps(tip, {
                    onclick: () => {
                      roomOpen = true;
                      snap = head;
                    },
                  })}
                  aria-label={words.openRoom}
                  class="select-none touch-hit press-tint"
                  type="button"
                >
                  <IconSidebar data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
        </BarGlass>
      </div>
    </header>

    <!-- The page: the stage, and on a desk the room beside or under it. On
         a phone its foot stands at the drawer's top at each stop, so the
         stage's scroller ends where the drawer begins. -->
    <div
      data-slot="graph-page"
      class={[
        "flex min-h-0 min-w-0 flex-1 overflow-clip ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5",
        !desk && roomOpen ? "pb-(--drawer-cover)" : "pb-space-6",
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
      {#snippet stagePane()}
        <Stage
          bind:this={stage}
          against={againstShown}
          {lang}
          {lit}
          {review}
          {scheme}
          {shown}
          {stale}
          {width}
        />
      {/snippet}
      <!-- The stage, and on a desk the room beside it: one resizable split.
           The stage's pane stays while the room comes and goes, so the
           component on it stays the one live instance. -->
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
          <div
            class={[
              "flex min-h-0 min-w-0 flex-1 flex-col",
              beside && "pe-space-2",
            ]}
          >
            {@render stagePane()}
          </div>
        </Resizable.Pane>
        {#if beside}
          <Resizable.Handle look="split" />
          <Resizable.Pane
            defaultSize={roomShare}
            id="room"
            look="split"
            minSize={roomLeast}
            order={2}
            onResize={(size) => {
              if (panesWidth > 0) {
                roomDragged = (size / 100) * panesWidth;
              }
            }}
          >
            <!-- The room: one surface, three faces, closed by its Close or
                 Esc. It comes in from its edge and goes back there, as the
                 app's panels do (the sheet recipe's motion, `sheetSlide`:
                 the inspector's): from the trailing edge beside the stage. -->
            <aside
              data-slot="graph-room"
              aria-label={words.room}
              in:sheetSlide|global={{ axis: "X", leaving: false }}
              out:sheetSlide|global={{ axis: "X", leaving: true }}
              class="relative ms-space-3 flex min-h-0 min-w-0 flex-1 flex-col gap-space-3 rounded-lg border border-border-hairline bg-surface-raised p-space-4 pt-space-3 shadow-tile"
            >
              <div class="flex min-w-0 items-center gap-space-2">
                {@render faces()}
                <Tip label={words.closeRoom}>
                  {#snippet children(tip)}
                    <button
                      {...mergeProps(tip, {
                        onclick: () => {
                          roomOpen = false;
                          lit = null;
                        },
                      })}
                      type="button"
                      aria-label={words.closeRoom}
                      class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-pill text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
                    >
                      <IconClose aria-hidden="true" class="size-icon-md" />
                    </button>
                  {/snippet}
                </Tip>
              </div>
              {#if face === "move"}
                {@render moveFace()}
              {:else}
                {@render statesFace(true)}
              {/if}
            </aside>
          </Resizable.Pane>
        {/if}
      </Resizable.PaneGroup>
    </div>

    {#if !desk}
      <!-- Under the desk line: the room is the kit's bottom drawer, its stops
         head (the faces and the steps), half and whole; the page above it
         stays live and ends at its top. Its grabber steps between the
         stops; its Close is its own, 44px to a finger. Drawn in place, the
         surface its containing block (`contain: layout`), so it stands on
         the surface's foot wherever the surface stands. -->
      <Drawer.Root
        bind:activeSnapPoint={snap}
        bind:open={roomOpen}
        dismissible={false}
        modal={false}
        shouldScaleBackground={false}
        snapPoints={SNAPS}
      >
        <Drawer.Content
          grabber={{ label: words.nextStop, onpress: nextStop }}
          height="cap"
          modal={false}
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
          portalProps={{ disabled: true }}
          onmousedown={keepFocusOnPage}
          trapFocus={false}
          ownHead
          title={words.room}
        >
          <div
            class="flex min-h-0 flex-auto flex-col gap-space-3 px-space-4 pb-(--snap-drop)"
            style:--snap-drop="calc((1 - {typeof snap === 'number' ? snap : 0})
            * 100dvh)"
          >
            <div class="flex min-w-0 items-center gap-space-2">
              {@render faces()}
              <!-- The drawer's one Close, the ghost the kit's sheet heads
                   draw. It puts the room away itself: vaul's Close asks
                   the dialog to close, and a root that is not
                   `dismissible` refuses every such ask
                   (use-drawer-root.svelte.js `onDialogOpenChange`: "if
                   (!opts.dismissible.current && !o) return;"); the drawer
                   is not dismissible so that a drag past its head stop
                   never closes it. -->
              <Button
                aria-label={words.closeRoom}
                icon={IconClose}
                onclick={() => {
                  roomOpen = false;
                  lit = null;
                }}
                press="pressable"
                size="icon-sm"
                title={words.closeRoom}
                variant="ghost"
              />
            </div>
            {#if face === "move"}
              {@render moveFace()}
            {:else}
              {#if !single && face === "states"}
                {@render stepper()}
              {/if}
              {@render statesFace(false)}
            {/if}
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {/if}
  </div>
</TooltipProvider>
