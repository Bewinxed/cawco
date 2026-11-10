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
   * page answers. Beside the stage one room of faces on one switch: the
   * states list with its steps, the map of the whole set (WholeSet), where a
   * press on a card keeps its state, the Animation face (MoveFace), the move
   * into the kept state played, scrubbed and tuned on the page's own
   * replays, and the agent's dials once it has any. Compare, a switch
   * that stays on, compares the kept state with the one before it
   * (`previousOf`), and a press on another state compares with that one
   * instead: the page draws it hidden under the kept one, reads what
   * differs and rings it; the stage's head lists each difference, a press
   * on a line bringing its ring into view. Several components under one
   * ask: one in front, the others behind its name's menu.
   *
   * No bar of its own (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): the artifact panel's head floats over the graph, which runs to
   * the surface's top beneath it and clears it by the head's room
   * (`--side-room`). What a bar of the graph's held stands on the panel it
   * acts on: the stage's head leads with the components' menu where the ask
   * names several (the component in front, its menu of the others) and
   * trails one glass group of bare symbols (Compare, the stage's view, and
   * Show states only while the room is put away: the room's one close is
   * its own). The view is a card hung from that glass (HangCard, as the
   * app's own glass hangs its cards): one settings row each, its name
   * leading and its control trailing, the widths as device glyphs with
   * their figures, the scheme as sun and moon, Reduce motion as a switch.
   *
   * One grid under the head: the stage and the room are two panels of one
   * kind (one corner, one edge, one raised head on one head line), sharing
   * a top and a foot, standing the head's own inset (`--space-2`) in from
   * the surface's edges, so they share their edges with the head's glass.
   * The stage holds its drawing and no more (the page's `laid`), so the room takes
   * what a form held to its measure leaves. Under the line where the
   * surface holds both whole the room is the kit's bottom drawer, its stops
   * head, half and whole, the stage whole above it at the head stop.
   */
  import { type CanvasSpec, STORY_FILE } from "@cawco/core/stage";
  import { type StateRef, storyWords } from "@cawco/core/stage-graph";
  import type { TunedRecord } from "@cawco/core/tuned";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import { onMount, type Snippet, untrack } from "svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import {
    IconChevronDown,
    IconCompareLinear,
    IconEyeLinear,
    IconListRows,
    IconMaximize,
    IconMonitor,
    IconMoon,
    IconPhone,
    IconPlay,
    IconRoomLinear,
    IconStructure,
    IconSun,
    IconTablet,
    IconTuning,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import {
    dur,
    motionOk,
    numberOf,
    sheetSlide,
  } from "#lib/platform/motion/curves.svelte.js";
  import { track } from "#lib/platform/track.js";
  import { browser } from "$app/env";
  import { besideLine, DIVIDER } from "./beside";
  import Dials from "./Dials.svelte";
  import type { DialValue, DialValues, GraphDial } from "./dials";
  import { figureOf, pageLang } from "./figures";
  import Journey from "./Journey.svelte";
  import { keepUnder, keptUnder } from "./kept";
  import MoveFace, { type MoveState } from "./MoveFace.svelte";
  import { pathOf, previousOf, type Review, reviewOf } from "./model";
  import {
    type Clip,
    clipOf,
    lengthOf,
    tunedRecord,
    tuningOf,
    tuningsOf,
    untune,
    withTuned,
    withTuning,
  } from "./motion";
  import RoomFaces from "./RoomFaces.svelte";
  import StagePane from "./StagePane.svelte";
  import Stepper from "./Stepper.svelte";
  import type { StageLink } from "./stage-link.svelte";
  import WholeSet from "./WholeSet.svelte";

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
    memory,
    startFace,
    keptDials = {},
    ondials,
    keptTuned = [],
    ontuned,
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
    /**
     * The browser's key the person's picks are kept under (the artifact's):
     * the component in front and the state kept on each stand again after a
     * reload, for the ask they were kept under (kept.ts).
     */
    memory?: string;
    /** The room's face the graph opens on (the ask's `face`); the states when it names none or one the room lacks. */
    startFace?: "map" | "move" | "dials";
    /** His dial values as the artifact keeps them (its doc's `dials`), by name: they stand again on open. */
    keptDials?: DialValues;
    /** His dial values changed: the artifact keeps them (its doc's `dials`, which `artifact_read` answers). */
    ondials?: (values: DialValues) => void;
    /** His tuning of every move as the artifact keeps it (its doc's `tuned`): put back on each move's first read. */
    keptTuned?: readonly TunedRecord[];
    /** His tuning changed: the artifact keeps it (its doc's `tuned`, which `artifact_read` answers), every move's at once. */
    ontuned?: (records: TunedRecord[]) => void;
  } = $props();

  /** The page's own ids, for a label's `for`. */
  const uid = $props.id();
  /** `n` as a figure in the page's language. */
  const figure = (n: number) => figureOf(n, lang);
  /**
   * Each states file of the canvas, in its order, from the start: its
   * review once the page has said its sheet, else none yet. A file whose
   * sheet is on its way still stands in the components' menu, as loading:
   * listed only once its sheet came, a second component stood unseen for
   * 22 s, then the title turned into a menu under him.
   */
  const entries = $derived(
    files.map((file) => {
      const sheet = link.sheets[file];
      return { file, review: sheet ? reviewOf(sheet, spec, figure) : null };
    })
  );
  /** The components whose sheets the page has said. */
  const reviews = $derived(
    entries.flatMap((one) => (one.review ? [one.review] : []))
  );
  /** A states file's name while its sheet is on its way: its file's own, in words. */
  const loadingName = (file: string) =>
    storyWords((file.split("/").at(-1) ?? file).replace(STORY_FILE, ""));
  /** Whether the ask names `words` (a component's or a state's name), as a person writes it. */
  const asks = (named: string) =>
    named.length > 0 && ask.toLowerCase().includes(named.toLowerCase());
  /** The states file of the component the ask names (its longest name it holds), else the first: the one in front until he picks another. */
  const askedFile = $derived.by(() => {
    let best = files[0] ?? null;
    let longest = 0;
    for (const one of reviews) {
      if (asks(one.name) && one.name.length > longest) {
        best = one.file;
        longest = one.name.length;
      }
    }
    return best;
  });
  /** The states file he brought in front; null while he has picked none. */
  let chosenFile = $state<string | null>(null);
  const frontFile = $derived(
    chosenFile && files.includes(chosenFile) ? chosenFile : askedFile
  );
  const review = $derived<Review | undefined>(
    entries.find((one) => one.file === frontFile)?.review ?? undefined
  );
  /** A state and one of its variants (null: the state as written). */
  interface Pick {
    state: string;
    variant: string | null;
  }
  /** Where a component opens: the state the ask names (a variant of it too; its longest name the ask holds), else its first. */
  const first = (one: Review): Pick => {
    const said = one.file === askedFile;
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
   * The agent's dials (its canvas spec's `dials`), once the page has read
   * each one's value as written off the drawing: none stands before.
   */
  const dials = $derived<GraphDial[]>(
    link.dialsWritten
      ? (spec.dials ?? []).filter(
          (dial) => dial.name in (link.dialsWritten ?? {})
        )
      : []
  );
  const FACES = $derived([
    { value: "states", label: words.statesFace, icon: IconListRows },
    { value: "map", label: words.wholeSet, icon: IconStructure },
    { value: "move", label: words.moveFace, icon: IconPlay },
    ...(dials.length > 0
      ? [{ value: "dials", label: words.dialsFace, icon: IconTuning }]
      : []),
  ] as const);
  type Face = "states" | "map" | "move" | "dials";
  /** The room is named by the faces it has, in its switch's order. */
  const roomName = $derived(words.room(FACES.map((one) => one.label)));
  /** The face the room shows: the states until he picks another. */
  let face = $state<Face>(untrack(() => startFace) ?? "states");
  /** His values of the controls, by name, on the face and the drawing; the values Reset all took, while nothing has changed since. */
  let dialValues = $state<DialValues>({});
  let dialsUndo = $state<DialValues | null>(null);
  /** The control whose layer stands open on the Controls face (a select's list, a colour's picker). */
  let dialOpen = $state<string | null>(null);
  // The drawing takes every turn: the whole set, each time it changes, and
  // again on a new page, which holds none of them.
  $effect(() => {
    const set = $state.snapshot(dialValues);
    const { loads } = link;
    if (dials.length > 0 && loads > 0) {
      untrack(() => link.turn(set));
    }
  });
  const turnDial = (name: string, value: DialValue) => {
    dialValues = { ...dialValues, [name]: value };
    dialsUndo = null;
    ondials?.(dialValues);
  };
  /** Dials back to as written: Reset all (`all`) leaves Undo reset; a row's restore glyph doesn't. */
  const resetDials = (names: string[], all: boolean) => {
    if (all) {
      dialsUndo = dialValues;
    }
    dialValues = Object.fromEntries(
      Object.entries(dialValues).filter(([name]) => !names.includes(name))
    );
    ondials?.(dialValues);
  };
  // His values as the artifact keeps them come with its doc, after the graph
  // stands: taken once they come, while he has turned nothing here.
  let keptTaken = false;
  $effect(() => {
    const kept = keptDials;
    if (keptTaken || Object.keys(kept).length === 0) {
      return;
    }
    untrack(() => {
      keptTaken = true;
      if (Object.keys(dialValues).length === 0) {
        dialValues = { ...kept };
      }
    });
  });
  /** The face the room shows: his, while the room has it (the dials come once the page has read them); else the states. */
  const shownFace = $derived<Face>(
    FACES.some((one) => one.value === face) ? face : "states"
  );
  /** The kept state of each component, by its states file. */
  let keptOf = $state<Record<string, Pick>>({});
  /** The state he kept on the component in front, while its states file still has it; else where the component opens. */
  const kept = $derived.by<Pick | null>(() => {
    if (!review) {
      return null;
    }
    const pick = keptOf[review.file];
    return pick && review.states[pick.state] ? pick : first(review);
  });
  /** Compare is on: a switch that stays on until he turns it off. */
  let comparing = $state(false);
  /** The state the kept one is compared with, by its id, while comparing. */
  let against = $state<string | null>(null);
  /** The compared state shown in the kept one's place (Compare's flip). */
  let flipped = $state(false);
  /** The state compared with while Compare is on and the component in front has it. */
  const againstState = $derived(
    comparing && review && against ? review.states[against] : undefined
  );
  /** Compare turned on compares with the state before the kept one (`previousOf`); it leaves the room as it stands. */
  const setComparing = (on: boolean) => {
    comparing = on;
    against = on && review && kept ? previousOf(review, kept.state) : null;
    flipped = false;
  };
  /** The state Compare compares with: the one on, else the one it would turn on with. */
  const compareName = $derived.by(() => {
    if (!(review && kept)) {
      return "";
    }
    const id =
      againstState && against ? against : previousOf(review, kept.state);
    return (id && review.states[id]?.name) ?? "";
  });
  /** Compared with another state: the kept one shows in its place again. */
  const compareWith = (state: string | null) => {
    against = state;
    flipped = false;
  };
  // A new ask (the agent showed the canvas again, or changed its ask)
  // opens on the state it names: what he kept under the last ask goes.
  // Under the ask they were kept for, his picks stand again after a reload.
  let askSeen: string | null = null;
  $effect(() => {
    const said = ask;
    untrack(() => {
      if (askSeen === null) {
        const held = memory ? keptUnder(memory, said) : null;
        chosenFile = held?.front ?? null;
        keptOf = held?.kept ?? {};
      } else if (askSeen !== said) {
        chosenFile = null;
        keptOf = {};
      }
      askSeen = said;
    });
  });
  $effect(() => {
    const key = memory;
    const held = { ask, front: chosenFile, kept: keptOf };
    if (key && askSeen !== null) {
      keepUnder(key, held);
    }
  });
  // The component in front, said on the line: the panel's other views (Canvas view's Map) stand on it too.
  $effect(() => {
    link.front = frontFile;
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
  /** Actual size: a width wider than the stage drawn 1:1, the page scrolling across it; off, it is scaled to fit the stage. */
  let actual = $state(false);
  const still = $derived(reduce || !motionOk.current);
  let surface = $state(0);
  /** DESIGN.md's phone breakpoint (Breakpoints: "640px (phone: …)"), px: in a pane under it the map is a list (DESIGN.md, Map mode). */
  const PHONE_LINE = 640;
  /** The pane is a phone's width: the Map face is a list. */
  const narrow = $derived(surface > 0 && surface < PHONE_LINE);
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
  /** A state kept (a record set too); kept while it is the one compared with, Compare turns to the state before it. */
  const keep = (state: string, variant: string | null) => {
    if (review) {
      keptOf = { ...keptOf, [review.file]: { state, variant } };
      if (comparing && against === state) {
        compareWith(previousOf(review, state));
      }
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
      const on = wish ? all.find((one) => one.file === wish.file) : undefined;
      const found = wish && on ? pickOf(on, wish.story) : null;
      if (!(wish && on && found)) {
        return;
      }
      if (on.file !== frontFile) {
        // Another component in front: it compares with nothing of the last one.
        setComparing(false);
      }
      chosenFile = on.file;
      keptOf = { ...keptOf, [on.file]: found.pick };
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
  /** The ask the stage answers next, and the state it stands at (by this page load), by its ref and its state's id. */
  let asking = 0;
  let stood: StateRef | null = null;
  let stoodAt: string | null = null;
  /** A move chosen by name (the Animation face's title, an arrow on the map): its from state, stood at first; null while none waits. */
  let chosenFrom: { id: string; ref: StateRef } | null = null;
  /** Bumped to reach the kept state again: Try again after a play threw, a move chosen into the state kept. */
  let reachAgain = $state(0);
  let againSeen = 0;
  /** The page load the stage stands at a state on: a new page holds no drawing. */
  let loadSeen = 0;
  /** The reach pressed in place from the state that stood: what it changed is brought into view once it lands. */
  let pressed = false;

  // The view first, so the state reached on a new page is laid out at it.
  $effect(() => {
    const view = {
      scheme,
      width,
      motion: reduce ? "reduce" : "on",
      fit: !actual,
    } as const;
    const { loads } = link;
    untrack(() => {
      if (loads > 0) {
        link.view(view);
      }
    });
  });
  /**
   * Where a reach to `pick` starts: from nothing on a new page; from the
   * from state of a move he chose by name, played where the states file
   * plays it from there; from the from state the states file plays a move
   * into it from; else from the state that stood.
   */
  const startOf = (on: Review, pick: Pick, fresh: boolean) => {
    const into = pick.variant === null ? on.states[pick.state] : undefined;
    const chosen = fresh ? null : chosenFrom;
    chosenFrom = null;
    if (chosen) {
      return {
        fromId: chosen.id,
        from: chosen.ref,
        play: !!(into?.play && into.from === chosen.id),
      };
    }
    if (into?.play && into.from) {
      return {
        fromId: into.from,
        from: { file: on.file, story: into.from } satisfies StateRef,
        play: true,
      };
    }
    return {
      fromId: fresh ? null : stoodAt,
      from: fresh ? null : stood,
      play: false,
    };
  };
  // Each kept state is reached on the one live instance: set in place from
  // the state that stood, or mounted afresh on a new page. A width he picks
  // that the state has a story for reaches that story. A state the states
  // file plays a move into arrives by that move, played from its from state
  // (the page docks the move's timeline over it).
  $effect(() => {
    const on = review;
    const pick = kept;
    const { loads } = link;
    const again = reachAgain;
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
      if (
        !fresh &&
        again === againSeen &&
        JSON.stringify(to) === JSON.stringify(stood)
      ) {
        return;
      }
      loadSeen = loads;
      againSeen = again;
      const { fromId, from, play } = startOf(on, pick, fresh);
      pressed = !(fresh || play);
      arriving = true;
      asking = link.reach(to, from, { play, still });
      stood = to;
      stoodAt = pick.state;
      readMove(on, fromId, pick.state);
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
        link.reveal({ move: true });
      }
      if (reached) {
        heardMove(reached);
      }
    });
  });

  // --- The move into the kept state ------------------------------------------

  /** The move on the Animation face, as its states' ids (`from->to`); null with none. */
  let movePair = $state<string | null>(null);
  let move = $state<MoveState>({ kind: "none", state: "" });
  /** The move's playhead, ms: run from the page's clock (`cawco:stage-time`), set by a scrub. */
  let playhead = $state(0);
  let playing = $state(false);
  /** Play goes round again each time the move ends, from `loopFrom`. */
  let repeat = $state(false);
  let loopFrom = $state(0);
  /**
   * What he tuned on every move, by the move's states (`from->to`): put
   * back on each new read of that move, and every one of them sent to the
   * agent. Choosing another move and back lost his edits, and the record
   * held the last move's alone.
   */
  const tunings = new Map<string, { name: string; clips: Clip[] }>();
  /** The move the reach under way reads: its ask, its states' ids and names. */
  let moveAsked: {
    ask: number;
    from: string;
    key: string | null;
    to: string;
  } | null = null;
  /** The clips before Reset all, while nothing has changed since: Undo reset puts them back (the house answer, undo over confirm). */
  let beforeReset = $state<Clip[] | null>(null);
  /** The thing a row of the move rests on, by the page's id for it; null while none. */
  let lit = $state<string | null>(null);

  /** A state's name, by its id; its id where the component has none of it. */
  const nameIn = (on: Review, state: string) => on.states[state]?.name ?? state;
  /** The reach just asked moves the drawing from `fromId` (null: from nothing) to `toId`: the face reads it. */
  function readMove(on: Review, fromId: string | null, toId: string) {
    cancelAnimationFrame(clock);
    playing = false;
    playhead = 0;
    const from = fromId ? nameIn(on, fromId) : "";
    const to = nameIn(on, toId);
    movePair = fromId ? `${fromId}->${toId}` : null;
    moveAsked = { ask: asking, key: movePair, from, to };
    move = fromId ? { kind: "reading", from, to } : { kind: "none", state: to };
  }

  /** The page's answer to the reach the face reads: its clips, his tuning of that move put back. */
  function heardMove(reached: NonNullable<typeof link.reached>) {
    const asked = moveAsked;
    if (!asked || reached.ask !== asked.ask || reached.superseded) {
      return;
    }
    moveAsked = null;
    if (reached.failed && asked.key) {
      move = {
        kind: "failed",
        from: asked.from,
        to: asked.to,
        why: reached.failed.message,
      };
      return;
    }
    if (!(asked.key && reached.move)) {
      move = { kind: "none", state: asked.to };
      return;
    }
    const name = words.move(asked.from, asked.to);
    const read = reached.move.clips.map(clipOf);
    const tuned = tunings.get(asked.key);
    // What he tuned on this move before, put back on its fresh read; on its first read, what the artifact keeps.
    const clips = tuned
      ? withTuning(read, tuningOf(tuned.clips))
      : withTuned(name, read, keptTuned);
    if (!tuned && clips.some((clip) => clip.was)) {
      tunings.set(asked.key, { name, clips });
    }
    beforeReset = null;
    move = { kind: "ready", from: asked.from, to: asked.to, clips };
    // The move played as the stage arrived: its playhead rests on its end (his pick, animation-face-questions#playhead-rest).
    playhead = lengthOf(clips);
  }

  /** The animation as Play plays it: his timing. */
  const clipsNow = (): Clip[] => (move.kind === "ready" ? move.clips : []);
  /** The timing as the page plays it: every clip as he tuned it. */
  const tuningNow = () => tuningsOf(clipsNow());

  // The playhead runs from each word of the page's clock: the page runs the
  // animations and says the time as a play starts, wraps, ends or pauses;
  // between two words the readout runs on this page's frames.
  let clock = 0;
  $effect(() => {
    const said = link.time;
    untrack(() => {
      cancelAnimationFrame(clock);
      if (!said) {
        return;
      }
      ({ playing, t: playhead } = said);
      if (!said.playing) {
        return;
      }
      const step = () => {
        playhead = Math.min(
          said.length,
          said.t + performance.now() - said.heard
        );
        if (playhead < said.length) {
          clock = requestAnimationFrame(step);
        }
      };
      clock = requestAnimationFrame(step);
    });
  });

  /** The move played from `from` ms (from where the playhead stands, or 0 from its end), in sight of the stage. */
  const play = (from?: number) => {
    const clips = clipsNow();
    if (clips.length === 0) {
      return;
    }
    const length = lengthOf(clips);
    const at = from ?? (playhead >= length ? 0 : playhead);
    // The move plays in sight: on a phone the thing it moves stood under the drawer.
    link.reveal({ move: true });
    link.play({
      from: at,
      repeat,
      loopFrom: Math.min(loopFrom, length),
      still,
      tuning: tuningNow(),
    });
  };
  /** Pause: the move held on the frame it stands at, the stage with it. */
  const pause = () => link.pause();
  /** A scrub, during a play too: the move held on that frame where he lets go (T3). */
  const scrub = (t: number) => {
    cancelAnimationFrame(clock);
    playing = false;
    playhead = t;
    link.seek(t, tuningNow());
  };
  /** A scrub let go: on the move's end the drawing is let go, the kept state as it stands. */
  const scrubbed = (t: number) => link.letGo(t);
  /**
   * A move whose play threw, played again (its Try again): its from state
   * reached anew and the move played from there, as it played on arrival.
   */
  const retry = () => {
    reachAgain += 1;
  };
  /**
   * Every move he tuned goes to the artifact as the component canvas's
   * `tuned` record, the tuned clips of every move, 300 ms after the last
   * change: written into its doc, which `artifact_read` answers. A move he
   * tuned in an earlier visit and not this one keeps its records.
   */
  const SEND_AFTER_MS = 300;
  let sending: ReturnType<typeof setTimeout> | undefined;
  const sendTuned = () => {
    clearTimeout(sending);
    sending = setTimeout(() => {
      const moves = [...tunings.values()];
      ontuned?.([
        ...keptTuned.filter(
          (one) => !moves.some((tuned) => tuned.name === one.move)
        ),
        ...moves.flatMap((one) => tunedRecord(one.name, one.clips)),
      ]);
    }, SEND_AFTER_MS);
  };
  /**
   * The clips he tuned put in the move. A press or a drag let go plays it
   * at once from where the changed row now begins: he nudges a length or
   * a curve and feels the difference before he writes a remark. A key's
   * nudge plays nothing (T9: stillness after a keyboard nudge): a held
   * frame is drawn again on the new timing, the rest stays.
   */
  const retime = (changed: readonly Clip[], replay = true) => {
    if (move.kind !== "ready" || changed.length === 0) {
      return;
    }
    const by = new Map(changed.map((clip) => [clip.id, clip]));
    beforeReset = null;
    move = {
      ...move,
      clips: move.clips.map((clip) => by.get(clip.id) ?? clip),
    };
    if (movePair) {
      tunings.set(movePair, {
        name: words.move(move.from, move.to),
        clips: move.clips,
      });
    }
    sendTuned();
    if (replay) {
      play(Math.min(...changed.map((clip) => clip.start + clip.delay)));
    } else {
      link.retime(tuningNow(), null);
    }
  };
  const resetAll = (ids: string[]) => {
    if (move.kind !== "ready") {
      return;
    }
    const before = move.clips;
    retime(move.clips.filter((clip) => ids.includes(clip.id)).map(untune));
    beforeReset = before;
  };
  const undoReset = () => {
    const before = beforeReset;
    if (before) {
      retime(before);
    }
  };
  /** Every move the states file names, for the Animation face's title menu. */
  const moveChoices = $derived(
    review
      ? review.moves
          .filter((one) => one.from !== one.to)
          .map((one) => ({
            key: `${one.from}->${one.to}`,
            from: one.from,
            to: one.to,
            name: words.move(nameIn(review, one.from), nameIn(review, one.to)),
          }))
      : []
  );
  // The ring on the thing a rested row names, on the Animation face alone.
  let ringSaid: string | null = null;
  $effect(() => {
    const thing = shownFace === "move" && roomShown ? lit : null;
    untrack(() => {
      if (thing !== ringSaid) {
        ringSaid = thing;
        link.ring(thing, playhead);
      }
    });
  });

  // Compare said on the line after the reach, so the page compares with the
  // state at the kept one's width (its story there, as the reach names it);
  // again on a new page, which compares with nothing until asked.
  $effect(() => {
    const on = review;
    const id = againstState ? against : null;
    const atWidth = width;
    const show = flipped ? "compared" : "kept";
    const { loads } = link;
    untrack(() => {
      if (loads === 0 || !on) {
        return;
      }
      link.compare(
        id ? refOf(on, { state: id, variant: null }, atWidth) : null,
        show
      );
    });
  });
  /** Compare is reading what differs: asked for, and not yet answered. */
  const reading = $derived(
    !!link.comparing && link.differences?.ask !== link.comparing.ask
  );
  /**
   * A difference's line pressed: its ring brought into view; one that went
   * shows the compared state in the kept one's place, where its ring
   * stands, unless the two stand side by side (the page does the same).
   */
  const showDifference = (index: number) => {
    const read = link.differences;
    const one = read?.found[index];
    if (!(read && one)) {
      return;
    }
    flipped = !read.beside && one.kind === "went";
    link.reveal({ difference: index });
  };

  // --- Keys and presses ------------------------------------------------------

  onMount(() => {
    const key = (event: KeyboardEvent) => {
      const field =
        event.target instanceof Element
          ? event.target.closest(
              "input, textarea, select, [contenteditable='true']"
            )
          : null;
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
    if (!(event.target instanceof Element && event.target.closest(FOCUSABLE))) {
      event.preventDefault();
    }
  };
  /** The drawer's layer: the box it stands in, as tall as the surface, and the foot of the head's room in it. */
  let roomLayer = $state<HTMLElement | null>(null);
  let layerHeight = $state(0);
  let headFoot = $state(0);
  /** The drawer's floating head, its faces' row, px: what its face clears at rest. */
  let drawerRoom = $state(0);
  /** The room the stage's floating head takes over the stage page's top, px (StagePane). */
  let stageRoom = $state(0);
  // The page pads its top by it: told as it changes, and again as the page
  // lays a drawing out (a frame loaded afresh has heard nothing yet).
  $effect(() => {
    const px = stageRoom;
    track(link.laid);
    if (px > 0) {
      untrack(() => link.room(px));
    }
  });
  /** What floats over a face's top, px: the room's head on a desk, the drawer's faces on a phone. */
  /** The room's floating head beside the stage, px, as drawn. */
  let roomHeadRoom = $state(0);
  const faceTop = $derived(desk ? roomHeadRoom : drawerRoom);
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
   * whole: up to the foot of the panel head's room, so the head's glass
   * never stands over the drawer's grabber. A stop no taller than the one under it
   * goes (a surface too short for three).
   */
  const SNAPS = $derived.by(() => {
    const room = Math.max(0, layerHeight - headFoot);
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
  // Opened on a face of its own body (the map, the dials), the drawer stands
  // at its half stop: vaul opens it at its first, so it is stepped there once
  // it stands. Opened on the Animation face it stands at its head, its
  // transport and the move on one line over the stage, as a press on that
  // face's tab leaves it.
  onMount(() => {
    if (startFace === "map" || startFace === "dials") {
      requestAnimationFrame(() => {
        if (!desk && SNAPS.length > 1) {
          stopAt = 1;
        }
      });
    }
  });
  const snap = $derived(SNAPS[Math.min(stopAt, SNAPS.length - 1)] ?? null);
  /** The drawer stands at its head stop: the steps, no list. */
  const atHead = $derived(stopAt === 0);
  /** How much of the surface the drawer stands over at its stop, px: the stage ends at its top. */
  const cover = $derived(snap ? Number.parseFloat(snap) : 0);
  /** The stage's pane, the stage and its head with it. */
  let stageHold = $state<HTMLElement | null>(null);
  /**
   * The drawer stands over the whole stage (its whole stop: up to the foot
   * of the panel head's room, the stage closed to no height under it): the
   * stage is inert, so the keyboard and a screen reader reach what the eye
   * does, never its head's glass clipped away under the drawer. The way
   * back is the pointer's: the grabber, to the head stop, where the stage
   * and its room switch stand again.
   */
  const stageCovered = $derived(
    !desk &&
      drawerShown &&
      cover > 0 &&
      cover >= Math.round(layerHeight - headFoot)
  );
  // Focus inside the stage as the drawer covers it goes to the drawer's
  // head (its grabber), before the stage turns inert: an inert focus falls
  // to the body.
  $effect.pre(() => {
    if (!stageCovered) {
      return;
    }
    untrack(() => {
      const held = document.activeElement;
      if (stageHold && held && stageHold.contains(held)) {
        drawerNode
          ?.querySelector<HTMLElement>('[data-slot="drawer-grabber"]')
          ?.focus();
      }
    });
  });
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
  /**
   * A state picked from the room: kept, and where the drawer stands at its
   * last stop, over the whole stage, the drawer goes down to its head, so
   * the state picked is seen (a pick there showed nothing).
   */
  const choose = (state: string, variant: string | null) => {
    keep(state, variant);
    if (!desk && SNAPS.length > 1 && stopAt === SNAPS.length - 1) {
      // A task later: the press is also vaul's release of the drawer, and a
      // stop asked for inside its release is dropped (the kit grabber's way).
      setTimeout(() => {
        stopAt = 0;
      });
    }
  };
  /** A press on a state in the room: while comparing, on another state, compare with it; else keep it. */
  const press = (state: string, variant: string | null) => {
    if (comparing && kept && state !== kept.state) {
      compareWith(state);
      return;
    }
    choose(state, variant);
  };
  /**
   * A move chosen by name (the Animation face's title menu, an arrow on the
   * map, its line in the map's list): the Animation face opens on it, the
   * stage stood at its from state, then brought to its to state, so the
   * move read is that one, whatever state stood before.
   */
  const chooseMove = (fromId: string, toId: string) => {
    face = "move";
    if (!review) {
      return;
    }
    // The page stands at its from state first, whatever stood (stage.ts `standFor`).
    const ref = refOf(review, { state: fromId, variant: null }, width);
    chosenFrom = { id: fromId, ref };
    if (kept?.state === toId && kept.variant === null) {
      reachAgain += 1;
    } else {
      choose(toId, null);
    }
  };
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
      requestAnimationFrame(() => link.reveal({ move: true }));
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
    to?.focus({ preventScroll: true, focusVisible: false });
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

{#snippet dialsBody()}
  <Dials
    bind:open={dialOpen}
    {dials}
    {lang}
    onchange={turnDial}
    onreset={resetDials}
    onundo={() => {
      dialValues = dialsUndo ?? {};
      dialsUndo = null;
      ondials?.(dialValues);
    }}
    undoable={dialsUndo !== null}
    values={dialValues}
    written={link.dialsWritten ?? {}}
  />
{/snippet}

{#snippet moveFace(peek: boolean)}
  <MoveFace
    choices={moveChoices}
    chosen={movePair}
    {lang}
    {loopFrom}
    {move}
    onchoose={chooseMove}
    onfocusthing={(thing) => {
      if (thing) {
        link.reveal({ thing });
      }
    }}
    onlight={(thing) => {
      lit = thing;
    }}
    onloopfrom={(at) => {
      loopFrom = at;
    }}
    onpause={pause}
    onplay={() => play()}
    onrepeat={(next) => {
      repeat = next;
    }}
    onreplay={() => play(0)}
    onreset={(ids) => {
      const all =
        move.kind === "ready" &&
        move.clips
          .filter((clip) => clip.was)
          .every((clip) => ids.includes(clip.id));
      if (all) {
        resetAll(ids);
      } else {
        retime(
          (move.kind === "ready" ? move.clips : [])
            .filter((clip) => ids.includes(clip.id))
            .map(untune)
        );
      }
    }}
    onretime={retime}
    onretry={retry}
    onseek={scrub}
    onseekend={scrubbed}
    onundo={undoReset}
    {peek}
    {playhead}
    {playing}
    {repeat}
    {still}
    undoable={beforeReset !== null}
  />
{/snippet}

{#snippet roomFace(stepperHere: boolean)}
  {#if shownFace === "dials"}
    {@render dialsBody()}
  {:else if shownFace === "move" && review && kept}
    <!-- Its own head and scroller under the room's head's room. -->
    <div class="flex min-h-0 min-w-0 flex-1 flex-col pt-(--face-top,0px)">
      {@render moveFace(false)}
    </div>
  {:else if review && kept}
    {#if single}
      <p
        class="m-0 max-w-c-measure pt-(--face-top,0px) type-body text-ink-muted text-pretty"
      >
        {words.oneState}
      </p>
    {:else if shownFace === "map"}
      <WholeSet
        against={againstState ? against : null}
        kept={kept.state}
        {narrow}
        onmove={chooseMove}
        onpress={press}
        {review}
        top={faceTop}
      />
    {:else}
      <Journey
        against={againstState ? against : null}
        kept={kept.state}
        keptVariant={kept.variant}
        {lang}
        onpress={press}
        onstep={(next) => choose(next, null)}
        {review}
        stepper={stepperHere}
      />
    {/if}
  {/if}
{/snippet}

{#snippet faces(glyphs: boolean)}
  <RoomFaces
    faces={FACES}
    {glyphs}
    label={roomName}
    onchoose={(next) => {
      face =
        next === "map" || next === "move" || next === "dials" ? next : "states";
      // In the drawer at its head stop a face of its own body (the map, the
      // dials) shows nothing there: picked, it rises to the half stop, the
      // drawing still above it.
      if (
        !desk &&
        atHead &&
        face !== "states" &&
        face !== "move" &&
        SNAPS.length > 1
      ) {
        // A task later: the press is also vaul's release of the drawer (`choose`).
        setTimeout(() => {
          stopAt = 1;
        });
      }
    }}
    value={shownFace}
  />
{/snippet}

{#snippet componentsMenu()}
  {#if files.length > 1 && frontFile}
    {@const frontName = review?.name ?? loadingName(frontFile)}
    <!-- The title: plain text with its menu chevron, no glass at
         rest; open, its menu hangs from it as one shape (BarGlass
         `form="title"`, BarMenu), as Caw's card hangs from his glass. -->
    <!-- Its words on the panels' leading edge, as the h1's: the glass
         and the item stand out past it by their own padding, so the
         ground hung open stands out past the edge as a hover does. -->
    <div
      class="-ms-(--title-in) flex min-w-0"
      style:--title-in="calc(var(--c-bar-group-pad) + var(--space-2))"
    >
      <BarGlass flare="end" form="title">
        <DropdownMenu.Root bind:open={menuOpen}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <!-- Its name is what it shows, the switch said before it
                   (WCAG 2.5.3, Label in Name); the title says itself,
                   with no tooltip. -->
              <BarItem
                form="title"
                label={`${words.components}: ${frontName}`}
                {props}
                tip={false}
                bind:ref={menuTrigger}
              >
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                  >{frontName}</span
                >
                <IconChevronDown
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-ink-muted"
                />
              </BarItem>
            {/snippet}
          </DropdownMenu.Trigger>
          <!-- Hung flush from the title's ground, which stands a padding
               out past the panels' edge: no collision inset pushes it
               off the ground at the pane's edge. -->
          <BarMenu
            collisionPadding={0}
            label={words.components}
            onCloseAutoFocus={(event: Event) => quietFocus(event, menuTrigger)}
            width="regular"
          >
            <DropdownMenu.RadioGroup
              bind:value={
                () => frontFile,
                (next: string) => {
                  if (next !== frontFile) {
                    setComparing(false);
                  }
                  chosenFile = next;
                }
              }
            >
              <!-- Every states file from the start; one whose sheet is on
                   its way says so in its own place. -->
              {#each entries as one (one.file)}
                <DropdownMenu.RadioItem value={one.file}>
                  <span
                    class={[
                      "min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap",
                      !one.review && "text-ink-muted",
                    ]}
                    >{one.review
                      ? one.review.name
                      : words.mounting(loadingName(one.file))}</span
                  >
                </DropdownMenu.RadioItem>
              {/each}
            </DropdownMenu.RadioGroup>
          </BarMenu>
        </DropdownMenu.Root>
      </BarGlass>
    </div>
  {/if}
{/snippet}

<!-- The stage's tools, trailing its head (StagePane `tools`): Compare and
     the view; Show the room only while the room is put away. The room's one
     close is its own. -->
{#snippet stageTools()}
  <div
    class="flex flex-none"
    {@attach (node: HTMLElement) => {
      glass = node.querySelector<HTMLElement>('[data-slot="tools"]');
    }}
  >
    <BarGlass form="group" joined={viewJoined}>
      {#if !single}
        <BarItem
          icon={IconCompareLinear}
          label={words.compare(compareName)}
          onclick={() => setComparing(!comparing)}
          pressed={comparing}
        />
      {/if}
      <Popover.Root bind:open={viewOpen}>
        <!-- No tooltip over its own open card: shown, it took the
             card's Escape for itself. Nor as the card hands the focus
             back on its close; it shows again once the focus or the
             pointer leaves the control. -->
        <Popover.Trigger>
          {#snippet child({ props })}
            <BarItem
              icon={IconEyeLinear}
              label={words.stageView}
              props={mergeProps(props, {
                onblur: () => {
                  viewQuiet = false;
                },
                onpointerleave: () => {
                  viewQuiet = false;
                },
              })}
              tipOff={viewOpen || viewQuiet}
              bind:ref={viewTrigger}
            />
          {/snippet}
        </Popover.Trigger>
        <!-- The view, hung from the glass as the app's glass hangs its
             cards: it comes down out of the glass and goes back up. -->
        <HangCard
          align="end"
          anchor={glass}
          aria-label={words.stageView}
          bind:joined={viewJoined}
          customAnchor={glass}
          onCloseAutoFocus={(event: Event) => quietFocus(event, viewTrigger)}
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
              <!-- Each width once: the component's own is the listed
                   width it equals, so named, and stands apart only when
                   none is; the line under the widths says which it is.
                   The names are the items' own; no tooltip opens over the
                   card. -->
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
                    one.icon
                  )}
                {/each}
              </ToggleGroup.Root>
              <!-- Which width is the component's own, said in words under
                   the widths (a mark on its figure said it to no one). -->
              <span
                class="col-start-2 -mt-space-2 justify-self-end type-meta text-ink-muted num max-phone:col-start-1 max-phone:mt-0 max-phone:justify-self-start"
                data-slot="own-width">{words.ownWidth(figure(ownWidth))}</span
              >
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
            <!-- A width wider than the stage is scaled to fit it; this
                 draws it 1:1 instead, the page scrolling across it. It
                 stands only while it does something: while the drawing
                 stands scaled, or while it is on, so it can be turned
                 off (DESIGN.md Voice: a string a rare state needs
                 stands in that state). -->
            {#if actual || (link.laid && link.laid.scale < 1)}
              <div
                class="contents max-phone:flex max-phone:min-w-0 max-phone:items-center max-phone:justify-between max-phone:gap-space-3"
              >
                <label class="type-label text-ink-row" for="{uid}-actual"
                  >{words.actualSize}</label
                >
                <Switch
                  bind:checked={actual}
                  class="justify-self-end"
                  id="{uid}-actual"
                />
              </div>
            {/if}
          </div>
        </HangCard>
      </Popover.Root>
      <!-- The room's one switch: it opens the room beside the stage (or
           its drawer) and puts it away again, as a sidebar's toggle does:
           its name says which, and it says whether the room stands
           (`aria-expanded`), never a lit symbol held on. -->
      <BarItem
        data-slot="room-switch"
        icon={IconRoomLinear}
        label={roomShown ? words.closeRoom(roomName) : words.openRoom(roomName)}
        onclick={() => {
          if (roomShown) {
            roomOpen = false;
            return;
          }
          roomOpen = true;
          stopAt = 0;
          // The one asked for last stands: the pane's sheet goes as the drawer rises.
          if (paneSheet) {
            onroom?.();
          }
        }}
        expanded={roomShown}
      />
    </BarGlass>
  </div>
{/snippet}

{#snippet stepper()}
  <Stepper {at} {lang} onstep={(next) => choose(next, null)} {path} />
{/snippet}

{#snippet widthItem(
  value: string,
  name: string,
  px: number,
  Icon: typeof IconPhone
)}
  <ToggleGroup.Item aria-label={name} {value}>
    <!-- The device's glyph, then its figure, on one line inside the item. -->
    <span class="mark-line flex items-center gap-space-1" data-box>
      <Icon aria-hidden="true" class="size-icon-md flex-none" data-box />
      <span class="type-meta num">{figure(px)}</span>
    </span>
  </ToggleGroup.Item>
{/snippet}

<TooltipProvider>
  <div
    data-slot="design-graph"
    class="flex h-full min-h-0 min-w-0 flex-col bg-surface-page contain-layout"
    data-arriving={arriving || reading || undefined}
    {lang}
    {@attach frameSize(
      (node: HTMLElement) => node.clientWidth,
      (value) => {
        surface = value;
      }
    )}
  >
    <!-- The page: the stage, and on a desk the room beside it, running to
         the surface's top under the panel's floating head and clearing it
         by the head's room (`--side-room`): the graph has no bar of its own.
         On a phone its foot stands at the drawer's top at each stop, so the
         stage ends where the drawer begins. -->
    <div
      data-slot="graph-page"
      class={[
        !laidOut && "invisible",
        "flex min-h-0 min-w-0 flex-1 overflow-clip px-space-2 pt-(--side-room,var(--space-2))",
        !desk && drawerShown ? "pb-(--drawer-cover)" : "pb-space-2",
      ]}
      style:--drawer-cover="{cover}px"
      {@attach frameSize(
        (node: HTMLElement) => {
          const style = getComputedStyle(node);
          return {
            foot: node.offsetTop + Number.parseFloat(style.paddingTop),
            split:
              node.clientWidth -
              Number.parseFloat(style.paddingInlineStart) -
              Number.parseFloat(style.paddingInlineEnd),
          };
        },
        (value) => {
          headFoot = value.foot;
          splitWidth = value.split;
        }
      )}
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
            bind:this={stageHold}
            inert={stageCovered}
          >
            <StagePane
              bind:need={stageNeed}
              compare={againstState
                ? {
                    name: againstState.name,
                    flipped,
                    read: link.differences,
                  }
                : null}
              {frame}
              {lang}
              laid={link.laid}
              lead={files.length > 1 ? componentsMenu : undefined}
              tools={stageTools}
              bind:room={stageRoom}
              ondifference={showDifference}
              onflip={() => {
                flipped = !flipped;
              }}
              name={keptState?.name ?? ""}
              scale={link.laid && link.laid.scale < 1
                ? words.scaledTo(figure(Math.round(link.laid.scale * 100)))
                : null}
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
              class="relative my-(--border-width) ms-space-2 me-(--border-width) flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile timeline-scope-transcript-head"
              style:--face-top="var(--c-head-room)"
            >
              {#if roomOpen}
                <!-- Its head floats over its face as every bar does (DESIGN.md,
                     The Title Bars Follow Liquid Glass Rule), on the stage's
                     head line: its faces alone, the room's switch standing
                     in the stage's glass. What the face lists runs to the
                     room's top beneath it, clears it at rest by its room
                     (`--face-top`) and blurs and fades under it as it
                     scrolls (HeadFade on the face's scroll). -->
                <HeadFade band="var(--face-top)" tint="bg-surface-raised" />
                <header
                  class="absolute inset-x-0 top-0 z-2 flex h-c-head-room min-w-0 items-center ps-space-4 pe-space-2"
                  data-slot="room-head"
                  {@attach frameSize(
                    (node: HTMLElement) => node.offsetHeight,
                    (value) => {
                      roomHeadRoom = value;
                    }
                  )}
                >
                  {@render faces(false)}
                </header>
                <!-- The map takes the room's whole body, its own surface to
                     its edges; the other faces stand at the room's inset. -->
                <div
                  class={[
                    "flex min-h-0 min-w-0 flex-1 flex-col",
                    shownFace === "map" && !single
                      ? ""
                      : "px-space-4 pb-space-4",
                  ]}
                  data-slot="room-body"
                >
                  {@render roomFace(true)}
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
        {@attach frameSize(
          (node: HTMLElement) => node.clientHeight,
          (value) => {
            layerHeight = value;
          }
        )}
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
            grabber={{
              label: words.nextStop(roomName, stopAt < SNAPS.length - 1),
              onpress: nextStop,
            }}
            modal={false}
            onOpenAutoFocus={(event: Event) => event.preventDefault()}
            portalProps={{ disabled: true }}
            onmousedown={keepFocusOnPage}
            trapFocus={false}
            ownHead
            title={roomName}
          >
            <!-- The sheet's one bar, right under the grabber (the kit's
                 `ownHead`): the faces, floating over the face as the kit's
                 sheet head floats (no Close of its own: the room's one
                 switch stands in the stage's glass). What the face lists
                 runs up beneath it, clears it at rest by its room
                 (`--face-top`) and blurs and fades under it as it scrolls. -->
            <div
              class="relative flex min-h-0 flex-auto flex-col gap-space-3 px-space-4 pb-(--snap-drop) timeline-scope-transcript-head"
              style:--snap-drop="{Math.max(0, layerHeight - cover)}px"
              style:--face-top="{drawerRoom}px"
            >
              <HeadFade band="var(--face-top)" tint="bg-surface-raised" />
              <div
                class="absolute inset-x-space-4 top-0 z-2 flex min-w-0 items-center pb-space-3"
                data-slot="drawer-faces"
                {@attach frameSize(
                  (node: HTMLElement) => node.offsetHeight,
                  (value) => {
                    drawerRoom = value;
                  }
                )}
              >
                {@render faces(true)}
              </div>
              <!-- At the head stop the drawer holds its head alone, the faces
                   and the States face's steps: a face's body drawn into its
                   sliver ran past the screen's foot. -->
              {#if !single && shownFace === "states"}
                <div class="flex-none pt-(--face-top)">
                  {@render stepper()}
                </div>
                {#if !atHead}
                  <!-- Under the steps the list clears nothing more. -->
                  <div class="contents" style:--face-top="initial">
                    {@render roomFace(false)}
                  </div>
                {/if}
              {:else if shownFace === "move" && atHead && review && kept}
                <!-- At the head stop the Animation face is its transport, its time and the move, on one line over the stage. -->
                <div class="flex-none pt-(--face-top)">
                  {@render moveFace(true)}
                </div>
              {:else if single || !atHead}
                {@render roomFace(false)}
              {/if}
            </div>
          </Drawer.Content>
        </Drawer.Root>
      </div>
    {/if}
  </div>
</TooltipProvider>
