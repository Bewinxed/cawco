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
   * app's own glass hangs its cards): one settings row each, its name
   * leading and its control trailing, the widths as device glyphs with
   * their figures, the scheme as sun and moon, Reduce motion as a switch.
   *
   * One grid under the bar: the stage and the room are two panels of one
   * kind (one corner, one edge, one raised head on one head line), sharing
   * a top and a foot inside the page's gutters; the bar's title starts on
   * their leading edge and its glass ends on their trailing one. The stage
   * holds its drawing and no more (Stage `need`), so the room, and the map
   * and the timeline in it, take what a form held to its measure leaves.
   * Under the desk line
   * (900px of its own width) the room is the kit's bottom drawer, its
   * stops head, half and whole, the stage whole above it at the head stop.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, tick, untrack } from "svelte";
  import { bridge } from "#lib/cawco/decisions/host/page.svelte.js";
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
  import { figureOf, pageLang } from "./figures";
  import Journey from "./Journey.svelte";
  import MoveFace, { type MoveState } from "./MoveFace.svelte";
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
    lang = pageLang(),
    opensAt = "head",
  }: {
    /** The components under review, each its states file and the agent's spec. */
    inputs: ReviewInput[];
    ask?: Ask;
    /** The hub's link is down. */
    stale?: boolean;
    /** The page's language, which every figure is written in (figures.ts); the document's when not given. */
    lang?: string;
    /** The phone drawer's stop it opens at: its head, as the spec opens it, unless a states file's state stands it taller. */
    opensAt?: "head" | "half" | "whole";
  } = $props();

  /** The page's own ids, for a label's `for`. */
  const uid = $props.id();
  /** `n` as a figure in the page's language. */
  const figure = (n: number) => figureOf(n, lang);
  const reviews = $derived(inputs.map((one) => reviewOf(one, figure)));
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
  /** A phone's width and under (DESIGN.md's 640px line). */
  const PHONE_LINE = 640;
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
   * least (`c-graph-room-w`), each pane's inset beside the split's
   * divider, the divider and the page's gutters. Under that (1058px today) the room is the
   * drawer, as the stage's least width says it becomes ("under it the room
   * becomes the drawer"); a narrower desk ran the room past the surface's
   * edge.
   */
  const besideLine = $derived(
    browser
      ? numberOf("--c-graph-stage-min") +
          numberOf("--c-graph-room-w") +
          2 * numberOf("--space-2") +
          2 * numberOf("--space-6") +
          DIVIDER +
          ROUNDING
      : 0
  );
  const desk = $derived(surface === 0 || surface >= besideLine);
  /**
   * The page is held from view until the split is laid out for the
   * drawing (Stage `need`), so its first paint is its last: drawn at once,
   * the stage stood 973px wide and jumped to 693 under him. Held no longer
   * than the wait grace, past which a mounting stage draws its skeleton.
   */
  let graceOver = $state(false);
  onMount(() => {
    const timer = setTimeout(() => {
      graceOver = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(timer);
  });

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
  /** The width the stage asks of its column, px (Stage `need`): the drawing and its panel; 0 until laid out. */
  let stageNeed = $state(0);
  let move = $state<MoveState>({ kind: "none", state: "" });
  let playhead = $state(0);
  let playing = $state(false);
  let run = 0;
  let clock = 0;
  const replays = new Replays();

  /** What the move changed on the stage: each moving thing. */
  const regionOf = (clips: readonly Clip[]): Element[] =>
    clips.flatMap((clip) => (clip.thing ? [clip.thing] : []));
  /** What a row rested on in the move names on the stage. */
  let lit = $state<Element | null>(null);

  const stop = () => {
    playing = false;
    cancelAnimationFrame(clock);
  };
  /** The animation as read, with what he changed: what the rows show and Play plays. */
  const clipsNow = (): Clip[] => (move.kind === "ready" ? move.clips : []);

  /**
   * The stage is on its way to the kept state (mounting it, or playing and
   * reading the move into it); the surface says so as `data-arriving`, so
   * a read of the page (the probe kit's `--wait-for`) waits for its rest.
   */
  let arriving = $state(true);
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
  /** The pick the stage is on its way to (the last press), by key: a press is measured against it, not the state that last landed. */
  let heading: string | null = null;
  /** The move on the Animation face, as its states' ids (`from->to`); null with none. */
  let movePair = $state<string | null>(null);
  /**
   * A move chosen by name (the Animation face's picker, an arrow on the
   * map): the stage stood at its from state at once, its own motion landed
   * where it stands, then brought to its to state, so the move read is that
   * one, whatever state stood before. Only the last two states pressed
   * gave a move, and a move no arrow names ("Delegate type refused → Every
   * hour") could be all there was.
   */
  const chooseMove = async (from: string, to: string) => {
    face = "move";
    const on = review;
    const at: Pick = { state: from, variant: null };
    stop();
    replays.release();
    heading = keyOf(on, at);
    await stage?.reach(argsOf(at), null, true);
    onStage = { key: keyOf(on, at), review: on.name, state: from };
    if (kept.state === to && kept.variant === null) {
      arrive(on, kept);
    } else {
      keep(to, null);
    }
  };
  /** Every move the states file names, for the Animation face's picker. */
  const moveChoices = $derived(
    review.moves
      .filter((one) => one.from !== one.to)
      .map((one) => ({
        key: `${one.from}->${one.to}`,
        from: one.from,
        to: one.to,
        name: words.move(nameIn(review, one.from), nameIn(review, one.to)),
      }))
  );
  const arrive = async (on: Review, pick: Pick) => {
    const key = keyOf(on, pick);
    // Against where the stage is heading: measured against the state that
    // last landed, a press back to it within the first press's flight
    // (Filled in, then Hub didn't answer in 300 ms) was taken as already
    // there, and the stage stayed on Filled in under Hub's name.
    if ((heading ?? onStage?.key) === key) {
      return;
    }
    heading = key;
    stop();
    replays.release();
    run += 1;
    const mine = run;
    playhead = 0;
    const to = nameIn(on, pick.state) || pick.state;
    const into = pick.variant === null ? moveInto(on, pick.state) : null;
    const played = into && on.states[pick.state]?.play ? into : null;
    const none: MoveState = { kind: "none", state: to };
    arriving = true;
    try {
      if (onStage?.review !== on.name && !(await openFor(on, pick, played))) {
        move = mine === run ? none : move;
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
    } finally {
      if (mine === run) {
        arriving = false;
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
    movePair = from ? `${onStage?.state}->${pick.state}` : null;
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
    // What the press changed, brought into view where it stands out of
    // it (bring-into-view moves nothing for a region already in view): on
    // a phone, Next to Hub didn't answer changed a line 500px under the
    // drawer's top. The stage's first arrival moves nothing.
    if (from) {
      requestAnimationFrame(() => stage?.reveal(regionOf(clips)));
    }
    // The stage's scroll stays where it stands: on open, at the drawing's
    // top, its head whole at every width (a reveal of the region the move
    // changed, at the form's foot, scrolled its top out of view under
    // 1200px); after that, where he left it.
    move = from ? { kind: "ready", from, to, clips } : none;
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

  /** A scrub during play: once let go, the move plays on. */
  let resume = false;
  const play = () => {
    const clips = clipsNow();
    if (clips.length === 0) {
      return;
    }
    stop();
    // The move plays in sight: on a phone the thing it moves stood under
    // the drawer, the stage scrolled to the form's head.
    stage?.reveal(regionOf(clips));
    const length = lengthOf(clips);
    if (still) {
      replays.seek(clips, length);
      stage?.fadeIn();
      playhead = 0;
      return;
    }
    const from = playhead >= length ? 0 : playhead;
    replays.play(clips, from);
    playing = true;
    const t0 = performance.now();
    const step = () => {
      playhead = Math.min(length, from + (performance.now() - t0));
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
      resume = true;
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
    heading = null;
    arrive(review, kept);
  };
  const scrubbed = () => {
    if (resume) {
      resume = false;
      play();
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
    sendTuned();
    playhead = Math.min(...changed.map((clip) => clip.start + clip.delay));
    play();
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
  /**
   * Escape closes the card unless the stage is acting a move: bits-ui hands
   * its layer a copy of the key (use-escape-layer `new KeyboardEvent(e.type,
   * e)`), never trusted, so the trust test kept the card open on his own
   * Escape; a play's keys land only while it arrives.
   */
  const personsEscape = (event: KeyboardEvent) => {
    if (arriving) {
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
   * The view card is open. Shut, it is gone: kept mounted (`forceMount`)
   * as the Shell's glass card is, it rested slid up behind a glass that
   * here stands 4px under the window's top, its shadow a band across both
   * panels until a reload.
   */
  let viewOpen = $state(false);
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
  /** The drawer stands at its head stop: the faces and the steps, no face's body. */
  const atHead = $derived(snap === null || snap === head);
  $effect(() => {
    if (snap === null) {
      snap = head;
      // A taller stop once the sheet stands at its head: vaul places a
      // sheet's first stop itself as it opens, and a stop asked for before
      // its node is drawn moves nothing (use-snap-points.svelte.js
      // `snapToPoint` sets the style of a node not there yet).
      const taller = SNAPS[["head", "half", "whole"].indexOf(opensAt)];
      if (taller !== undefined && taller !== head) {
        setTimeout(() => {
          snap = taller;
        });
      }
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
  /** The drawer's stop the stage was last brought to; null until the drawer stands at its first. */
  let stopShown: number | string | null = null;
  // At each stop he moves the drawer to, the region he is judging stays in
  // view above it: the first difference while comparing, else what the
  // move changed. The stop the drawer opens at moves nothing (the stage
  // opens at its drawing's top), and nor does a press, a retime or a play:
  // only the stop changing does.
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
      const clips = clipsNow();
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
   * leaves once it holds its drawing (Stage `need`: a form held to its
   * measure asks for that and no more, so the room, and the map and the
   * timeline in it, take the rest), each held between the least widths.
   * paneforge lays the split out again from it whenever a least width
   * changes with the split's width; the dragged width is read untracked, so
   * a drag never lays it out anew.
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
  // out, so the stage stood at the width it had before its drawing was
  // measured, with paper beside a form held to its measure.
  $effect(() => {
    const share = roomShare;
    const pane = roomPane;
    if (pane && beside && roomDragged === null) {
      pane.resize(share);
    }
  });
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
      onmove={chooseMove}
      onpress={press}
      narrow={surface > 0 && surface < PHONE_LINE}
      {review}
    />
  {:else}
    <Journey
      against={comparing ? against : null}
      kept={kept.state}
      keptVariant={kept.variant}
      {lang}
      onpress={press}
      onstep={(next) => keep(next, null)}
      {review}
      stepper={stepperHere}
    />
  {/if}
{/snippet}

{#snippet moveFace(peek = false)}
  <MoveFace
    choices={moveChoices}
    chosen={movePair}
    {move}
    onchoose={chooseMove}
    onfocusthing={(thing) => {
      if (thing) {
        stage?.reveal([thing]);
      }
    }}
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
    {lang}
    {peek}
    {playhead}
    {playing}
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
      data-slot="graph-bar"
      class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3 px-space-6 max-desk:px-space-5"
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
            <!-- No tooltip over its own open card: shown, it took the
                 card's Escape for itself. Nor as the card hands the focus
                 back on its close: it stood over the stage's edge until
                 the focus left (390, Escape); it shows again once the
                 focus or the pointer leaves the control. -->
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
              onCloseAutoFocus={(event: Event) =>
                quietFocus(event, viewTrigger)}
              onEscapeKeydown={personsEscape}
              onInteractOutside={personsOwn}
              onOpenAutoFocus={(event: Event) => quietFocus(event, viewTrigger)}
              frame="settings"
              side="bottom"
              sideOffset={0}
            >
              <!-- One pattern for every setting: its name leading, its
                   control trailing, on one grid, so the three read down
                   two columns (Jitter's inspector rows). -->
              <div
                class="grid min-w-0 grid-cols-(--cols) items-center justify-between gap-x-space-5 gap-y-space-3 p-space-4"
                style:--cols="auto auto"
              >
                <span class="type-label text-ink-row">{words.width}</span>
                <!-- Each width once: his own is the listed width it
                     equals, marked his own, and stands apart only when
                     none is. The names are the items' own; no tooltip
                     opens over the card. -->
                <ToggleGroup.Root
                  aria-label={words.width}
                  class="justify-self-end"
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
                <span class="type-label text-ink-row">{words.scheme}</span>
                <ToggleGroup.Root
                  aria-label={words.scheme}
                  class="justify-self-end"
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
                <label class="type-label text-ink-row" for="{uid}-reduce"
                  >{words.reduceMotion}</label
                >
                <Switch
                  bind:checked={reduce}
                  class="justify-self-end"
                  id="{uid}-reduce"
                />
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
        !laidOut && "invisible",
        "flex min-h-0 min-w-0 flex-1 overflow-clip px-space-6 max-desk:px-space-5",
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
          bind:need={stageNeed}
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
            <!-- The room: one surface, three faces, closed by its Close or
                 Esc. It comes in from its edge and goes back there, as the
                 app's panels do (the sheet recipe's motion, `sheetSlide`:
                 the inspector's): from the trailing edge beside the stage. -->
            <aside
              data-slot="graph-room"
              aria-label={words.room}
              in:sheetSlide|global={{ axis: "X", leaving: false }}
              out:sheetSlide|global={{ axis: "X", leaving: true }}
              class="relative ms-space-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
            >
              <!-- Its head on the stage's head line: the faces, its Close. -->
              <div
                class="flex min-h-c-top-bar-h min-w-0 flex-none items-center gap-space-2 border-b border-border-hairline ps-space-4 pe-space-2"
              >
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
              <div
                class={[
                  "flex min-h-0 min-w-0 flex-1 flex-col",
                  face === "whole" && !single ? "" : "p-space-4",
                ]}
              >
                {#if face === "move"}
                  {@render moveFace()}
                {:else}
                  {@render statesFace(true)}
                {/if}
              </div>
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
            <!-- At the head stop the drawer holds its head alone, the faces
                 and the steps: a face's body drawn into its sliver ran the
                 map at a fit of 1.8px words with its tools cut, and the
                 animation's lines past the screen's foot. -->
            {#if face === "move"}
              {@render moveFace(atHead)}
            {:else}
              {#if !single && face === "states"}
                {@render stepper()}
              {/if}
              {#if single || !atHead}
                {@render statesFace(false)}
              {/if}
            {/if}
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {/if}
  </div>
</TooltipProvider>
