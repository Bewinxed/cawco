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
   * replays, and the Dials card: the agent's dials, then the props of the
   * state on the stage, once it has either. Compare, a switch
   * that stays on, compares the kept state with the one before it
   * (`previousOf`), and a press on another state compares with that one
   * instead: the page draws it hidden under the kept one, reads what
   * differs and rings it; a glass over the stage lists each difference, a press
   * on a line bringing its ring into view. Several components under one
   * ask: one in front, the others behind its name's menu.
   *
   * No bar of its own (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): the artifact panel's head floats over the graph, which runs to
   * the surface's top beneath it and clears it by the head's room
   * (`--side-room`), and the graph hands that head what it heads with
   * (`head`, graph-head.ts), so the panel has one bar: the kept state's
   * name as the title over what its agent wrote of it; leading, the room's
   * switch and Previous and Next; in the glass the stage's view, a card
   * hung from that glass (BarCard): one settings row each, its name
   * leading and its control trailing, the widths as device glyphs with
   * their figures, the scheme as sun and moon, Reduce motion and Compare as
   * switches; the components in the title's menu.
   *
   * The stage is the content and shows it directly, to the card's edges
   * with no frame round it (Liquid Glass: the content runs beneath the
   * floating controls); the room beside it on a desk is an inspector.
   * The stage holds its drawing and no more (the page's `laid`), so the room takes
   * what a form held to its measure leaves. Under the line where the
   * surface holds both whole the room is the kit's bottom drawer, its stops
   * head, half and whole, the stage whole above it at the head stop.
   */
  import { detach } from "@cawco/core/detach";
  import {
    type CanvasSpec,
    type PropMeta,
    STORY_FILE,
  } from "@cawco/core/stage";
  import { type StateRef, storyWords } from "@cawco/core/stage-graph";
  import type { TunedRecord } from "@cawco/core/tuned";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { onMount, type Snippet, untrack } from "svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
    BarSegments,
  } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import {
    IconAdaptLinear,
    IconBranchingLinear,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconCompareLinear,
    IconEyeLinear,
    IconMaximize,
    IconMonitorLinear,
    IconMoon,
    IconMoonLinear,
    IconPause,
    IconPhoneLinear,
    IconPlayLinear,
    IconSunLinear,
    IconTabletLinear,
    IconTuning,
    IconTuningLinear,
    IconWideLinear,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { motionOk, rise } from "#lib/platform/motion/curves.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import { track } from "#lib/platform/track.js";
  import PreviewTools from "../preview/PreviewTools.svelte";
  import type { SheetInspector } from "../preview/sheet-inspector.svelte";
  import ThreadSheet from "../preview/ThreadSheet.svelte";
  import Dials from "./Dials.svelte";
  import type { DialValue, DialValues, GraphDial } from "./dials";
  import { figureOf, pageLang } from "./figures";
  import type { GraphHead } from "./graph-head";
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
  import { contentCases, propDials, savedOf } from "./prop-dials";
  import StagePane from "./StagePane.svelte";
  import type { StageLink } from "./stage-link.svelte";
  import WholeSet from "./WholeSet.svelte";

  let {
    link,
    inspector = null,
    files,
    spec,
    ask = "",
    stale = false,
    lang = pageLang(),
    frame,
    memory,
    startFace,
    keptDials = {},
    ondials,
    keptTuned = [],
    ontuned,
    head = $bindable(null),
    modeTools,
    changesTools,
    modeCompact,
  }: {
    /** The line to the stage page: what it said, and what the graph asks of it. */
    link: StageLink;
    /** The props of the state on the stage, as its sheet's page says them, and their writes: the Dials card lists them under the agent's dials. */
    inspector?: SheetInspector | null;
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
     * The browser's key the person's picks are kept under (the artifact's):
     * the component in front and the state kept on each stand again after a
     * reload, for the ask they were kept under (kept.ts).
     */
    memory?: string;
    /** How the graph opens (the ask's `face`): on the map, with the move risen, or with the dials risen; the drawing when it names none. */
    startFace?: "map" | "move" | "dials";
    /** His dial values as the artifact keeps them (its doc's `dials`), by name: they stand again on open. */
    keptDials?: DialValues;
    /** His dial values changed: the artifact keeps them (its doc's `dials`, which `artifact_read` answers). */
    ondials?: (values: DialValues) => void;
    /** His tuning of every move as the artifact keeps it (its doc's `tuned`): put back on each move's first read. */
    keptTuned?: readonly TunedRecord[];
    /** His tuning changed: the artifact keeps it (its doc's `tuned`, which `artifact_read` answers), every move's at once. */
    ontuned?: (records: TunedRecord[]) => void;
    /** What the graph hands the panel's head (graph-head.ts): its title, its steps, its components. */
    head?: GraphHead | null;
    /** The page's mode (Interact, Comment, Draw), standing with the view over the stage's foot. */
    /** What changed since he looked, a glass beside the view (PreviewPane's ChangesTag); none while nothing did. */
    changesTools?: Snippet;
    modeTools?: Snippet;
    /** The mode as one button, where the tools have no room for its three segments. */
    modeCompact?: Snippet;
  } = $props();

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
  /** His values of the controls, by name, on the face and the drawing; the values Reset all took, while nothing has changed since. */
  let dialValues = $state<DialValues>({});
  let dialsUndo = $state<DialValues | null>(null);
  /** The state's unsaved props Reset all took, and the story they were on, while nothing has changed since. */
  let propsUndo = $state<{
    story: string;
    values: Record<string, unknown>;
  } | null>(null);
  /** Anything changed on the card: Undo reset goes. */
  const changedSince = () => {
    dialsUndo = null;
    propsUndo = null;
  };
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
    changedSince();
    ondials?.(dialValues);
  };
  /** A dial's value as its prop takes it: an enum's own option (a figure stays a figure), else the value itself. */
  const argOf = (prop: PropMeta | undefined, value: DialValue): unknown =>
    prop?.type.name === "enum"
      ? (prop.options?.find((one) => String(one) === String(value)) ?? value)
      : value;
  /**
   * The props of the state on the stage as the Dials card lists them (its
   * `state`): each as the dial of its kind, its value as the state's file
   * writes it, his unsaved values over them, and Save and Save as new state
   * writing them through the sheet's inspector. None where the stage read
   * no props, or where the file writes the story's args in code it can't
   * write to (`readOnly`).
   */
  const stateProps = $derived.by(() => {
    const held = inspector;
    const component = held?.component;
    if (!(held && component) || held.readOnly) {
      return null;
    }
    const metas = held.props;
    const saved = savedOf(metas, held.saved);
    const props = propDials(metas, dials, saved);
    if (props.length === 0) {
      return null;
    }
    const { edited } = held;
    const metaOf = (name: string) => metas.find((one) => one.name === name);
    const cases = contentCases(props);
    const reached = [...new Set(cases.flatMap((one) => Object.keys(one.fill)))];
    return {
      component: component.name,
      props,
      saved,
      edits: savedOf(
        metas.filter((one) => one.name in edited),
        edited
      ),
      content: {
        cases,
        // A case's words over the text props it reaches; Saved (null) takes them back.
        onpick: (fill: Record<string, string> | null) => {
          const values = Object.fromEntries(
            Object.entries(fill ?? {}).filter(
              ([name, fillWords]) => fillWords !== saved[name]
            )
          );
          changedSince();
          held.change(
            values,
            reached.filter((name) => !(name in values))
          );
        },
      },
      onchange: (name: string, value: DialValue) => {
        changedSince();
        if (value === saved[name]) {
          held.change({}, [name]);
        } else {
          held.change({ [name]: argOf(metaOf(name), value) });
        }
      },
      onreset: (names: string[], all: boolean) => {
        if (all && held.chosen) {
          propsUndo = { story: held.chosen, values: { ...held.edited } };
        }
        held.change({}, names);
      },
      onsave: () => detach(held.save(), "save the state"),
      onsavenew: () => detach(held.saveNew(), "save as new state"),
      saving: held.writing,
    };
  });
  /** The Dials card has rows: the agent's dials, or the props of the state on the stage. */
  const tunable = $derived(dials.length > 0 || stateProps !== null);
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
  /**
   * How he looks at the component (graph-head.ts): its kept state drawn, or
   * the map of every state in the drawing's place, and over the drawing's
   * foot the move into the kept state (its transport and timeline) or the
   * agent's dials, one at a time.
   */
  let rising = $state<"map" | "move" | "dials" | null>(
    untrack(() => startFace) ?? null
  );
  /** The tools' height over the drawing's foot, px: what rises stands above them. */
  let toolsHeight = $state(0);
  /** Under the phone line, what rises stands as a bottom sheet, drawn until it has slid down. */
  let sheetDrawn = $state(false);
  $effect(() => {
    if (rising && narrow) {
      sheetDrawn = true;
    }
  });
  /** What rises, read out: the sheet's name. */
  const RISING_NAMES = {
    map: words.wholeSet,
    move: words.moveFace,
    dials: words.dialsFace,
  } as const;
  const risingName = $derived(rising ? RISING_NAMES[rising] : "");
  /** Where what rises stands: a step clear of the tools' top. */
  const riseFoot = $derived(
    `calc(${toolsHeight}px + 2 * var(--spacing-space-3))`
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
  /**
   * The width he drew the stage at: Adapt (the room the stage has, its
   * default: the owner, "by default u should pin the size to adapt then the
   * user can click mobile/tab/desktop/wide"), or a device's.
   */
  let widthPick = $state<"adapt" | number>("adapt");
  /** Under this the drawing is said to stand scaled: a scale a pixel's rounding short of 1:1 is 1:1. */
  const SCALED_UNDER = 0.995;
  /** The stage's own width, px: what Adapt draws at. */
  let stageAcross = $state(0);
  const width = $derived.by(() => {
    if (widthPick !== "adapt") {
      return widthPick;
    }
    return stageAcross > 0 ? stageAcross : null;
  });
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
  /** The width the tools' full row needs on one line, px (PreviewTools `need`), as it last stood unfolded. */
  let toolsNeed = $state(0);
  let toolsFull = $state(0);
  /**
   * The tools stand folded (the mode a menu, the view View options): on a
   * phone's pane, or wherever the full row is wider than the stage, so the
   * row never wraps (the owner's pin: "this should NOT be on a 2nd row").
   */
  const folded = $derived(
    narrow || (toolsFull > 0 && stageAcross > 0 && stageAcross < toolsFull)
  );
  // The full row's need, kept from while it stood: folded, the row measures its compact form.
  $effect(() => {
    const need = toolsNeed;
    if (!folded && need > 0) {
      untrack(() => {
        toolsFull = need;
      });
    }
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
  // A story he added on the Dials card (Save as new state): its component
  // in front and its state kept, so the stage stands at what the props
  // edit. One the states file doesn't hold yet waits for its sheet.
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
        widthPick = found.width ?? "adapt";
      } else if (refOf(on, found.pick, width).story !== wish.story) {
        // At a width it has a story of its own for, the state as written is that story: back to Adapt.
        widthPick = "adapt";
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
      // ask's state, a new ask, a state saved as new, a width's own story,
      // another component in front) names it here: the Dials card's props
      // follow it, so an edit lands on the drawing he sees.
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
    const thing = rising === "move" ? lit : null;
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
        rising
      ) {
        rising = null;
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
    { value: 390, icon: IconPhoneLinear, name: words.phone },
    { value: 768, icon: IconTabletLinear, name: words.tablet },
    { value: 1440, icon: IconMonitorLinear, name: words.desk },
    { value: 1920, icon: IconWideLinear, name: words.wide },
  ] as const;
  /** The stepper's name swap: it slides the way the step went (motion/list-swap). */
  const stepSwap = new ListSwap<never>();
  /** Keep `next` from the stepper, its name sliding from the side the step went toward. */
  const stepTo = (next: string) => {
    if (next === kept?.state) {
      return;
    }
    stepSwap.swap([], path.indexOf(next) > at ? 1 : -1);
    keep(next, null);
  };
  /** Keep `next` of the states file `file`, bringing that file in front first. */
  const stepIn = (file: string, next: string) => {
    if (file !== frontFile) {
      setComparing(false);
      chosenFile = file;
    }
    stepTo(next);
  };
  /** A step along the component's path from the kept state, held at its ends. */
  const stepBy = (by: number) => {
    const next = path[Math.max(0, Math.min(path.length - 1, at + by))];
    if (next) {
      stepTo(next);
    }
  };
  // The panel's head draws what the graph hands it (graph-head.ts): the
  // graph has no bar of its own.
  $effect(() => {
    head = {
      title: review?.name ?? "",
      line: keptState?.note ?? "",
      more: moreItems,
      components: files.length > 1 ? componentsGroup : null,
    };
  });
  $effect(() => () => {
    head = null;
  });
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
  /** A press on a state in the room: while comparing, on another state, compare with it; else keep it. */
  const press = (state: string, variant: string | null) => {
    if (comparing && kept && state !== kept.state) {
      compareWith(state);
      return;
    }
    keep(state, variant);
  };
  /**
   * A move chosen by name (the Animation face's title menu, an arrow on the
   * map, its line in the map's list): the Animation face opens on it, the
   * stage stood at its from state, then brought to its to state, so the
   * move read is that one, whatever state stood before.
   */
  const chooseMove = (fromId: string, toId: string) => {
    // A move chosen on the map: the move's card takes the map's place.
    rising = "move";
    if (!review) {
      return;
    }
    // The page stands at its from state first, whatever stood (stage.ts `standFor`).
    const ref = refOf(review, { state: fromId, variant: null }, width);
    chosenFrom = { id: fromId, ref };
    if (kept?.state === toId && kept.variant === null) {
      reachAgain += 1;
    } else {
      keep(toId, null);
    }
  };
  /** The view's width choice, as the widths' switch names it. */
  const widthValue = $derived(String(widthPick));
  const pickWidth = (next: string) => {
    if (next) {
      widthPick = next === "adapt" ? "adapt" : Number(next);
    }
  };
  /** The scale as a figure, while the drawing stands scaled; null at 1:1. */
  const scalePercent = $derived(
    link.laid && link.laid.scale < SCALED_UNDER
      ? figure(Math.round(link.laid.scale * 100))
      : null
  );
</script>

<!-- What rises over the drawing: the map, the move, or the dials. -->
{#snippet risingBody()}
  {#if review && kept}
    {#if rising === "map"}
      {#if !single}
        <WholeSet
          against={againstState ? against : null}
          kept={kept.state}
          {narrow}
          onmove={chooseMove}
          onpress={press}
          {review}
        />
      {/if}
    {:else if rising === "move"}
      {@render moveFace(false)}
    {:else if rising === "dials"}
      {@render dialsBody()}
    {/if}
  {/if}
{/snippet}

{#snippet dialsBody()}
  <Dials
    bind:open={dialOpen}
    {dials}
    {lang}
    onchange={turnDial}
    onreset={resetDials}
    onundo={() => {
      if (dialsUndo) {
        dialValues = dialsUndo;
        ondials?.(dialValues);
      }
      if (propsUndo && propsUndo.story === inspector?.chosen) {
        inspector.change(propsUndo.values);
      }
      changedSince();
    }}
    state={stateProps}
    undoable={dialsUndo !== null ||
      (propsUndo !== null && propsUndo.story === inspector?.chosen)}
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
    titled={false}
    {playhead}
    {playing}
    {repeat}
    {still}
    undoable={beforeReset !== null}
  />
{/snippet}

<!-- The components under review, a group of the panel title's menu
     (graph-head.ts): every states file from the start; one whose sheet is
     on its way says so in its own place. Choosing one stops Compare. -->
{#snippet componentsGroup()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>{words.components}</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      bind:value={
        () => frontFile ?? "",
        (next: string) => {
          if (next !== frontFile) {
            setComparing(false);
          }
          chosenFile = next;
        }
      }
    >
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
  </DropdownMenu.Group>
{/snippet}

<!-- Leading the panel's head (graph-head.ts): the state stepper, one
     glass. Previous and Next along the component's path; between them the
     kept state's name, a menu of every state with what its agent wrote of
     it, the kept one ticked, where he sees how many there are. -->
{#snippet headLead()}
  {#if review && kept && !single && path.length > 1}
    <BarGlass form="group">
      <!-- Map: every state at once, on a card risen over the drawing; a
           press on one draws it behind the card, which stays. -->
      <BarItem
        icon={IconBranchingLinear}
        label={words.wholeSet}
        onclick={() => {
          rising = rising === "map" ? null : "map";
        }}
        pressed={rising === "map"}
      />
      <BarItem
        aria-disabled={at <= 0 || undefined}
        icon={IconChevronLeft}
        label={words.previous}
        onclick={() => stepBy(-1)}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <BarItem
              form="title"
              label={keptState?.name ?? ""}
              {props}
              tip={false}
            >
              <!-- Every state's name in one cell, the kept one shown: the
                   stepper is as wide as the longest name, so stepping never
                   moves what stands beside it (the owner's pin). -->
              <span
                class="relative grid min-w-0"
                data-box
                data-slot="state-name"
              >
                {#each path as id (id)}
                  <span
                    aria-hidden="true"
                    class="invisible col-start-1 row-start-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-row"
                    >{review.states[id]?.name ?? ""}</span
                  >
                {/each}
                <!-- The name slides the way the step went, as the app swaps a
                     view (motion/list-swap), in a box as wide as the longest. -->
                {#key kept.state}
                  <span
                    class="col-start-1 row-start-1 min-w-0 animate-(--swap) overflow-clip text-ellipsis whitespace-nowrap text-center text-ink-strong type-row"
                    style:--swap={stepSwap.rowAnim(0)}
                    out:stepSwap.leaveView>{keptState?.name ?? ""}</span
                  >
                {/key}
              </span>
              <IconChevronDown
                aria-hidden="true"
                class="size-icon-sm flex-none text-ink-muted"
              />
            </BarItem>
          {/snippet}
        </DropdownMenu.Trigger>
        <!-- The stepper stands at the drawing's foot, so its list opens
             upward, over the drawing (HIG, Toolbars: a bottom toolbar's
             menus open above it). The states stand in sections as the
             canvas has them: each states file under its section's name (its
             `title`), and a file the canvas groups into several parts each
             part under its own name (HIG, Menus: a section's title sets
             its items apart). Each state is one block: its name, and under
             it what its agent wrote of it, quieter, on up to two lines, so
             one state's words never run into the next's (the owner's pin:
             "the nested list is unreadable, no visual hierarchy"). A state
             of another file brings that file in front. -->
        <BarMenu label={words.statesFace} rises width="titles">
          {#each reviews as one, at (one.file)}
            {#if at > 0}
              <DropdownMenu.Separator />
            {/if}
            {#each one.machines as machine (machine.name)}
              <DropdownMenu.Group>
                <DropdownMenu.GroupHeading
                  >{one.machines.length > 1
                    ? machine.name
                    : one.name}</DropdownMenu.GroupHeading
                >
                <DropdownMenu.RadioGroup
                  onValueChange={(next: string) => stepIn(one.file, next)}
                  value={one.file === review.file ? kept.state : ""}
                >
                  {#each machine.path as id (id)}
                    {@const state = one.states[id]}
                    {#if state}
                      <DropdownMenu.RadioItem row="described" value={id}>
                        <span
                          class="flex min-w-0 flex-col gap-space-row"
                          data-box
                        >
                          <span
                            class="truncate type-label font-medium text-ink-strong"
                            >{state.name}</span
                          >
                          {#if state.note}
                            <span class="line-clamp-2 type-meta text-ink-muted"
                              >{state.note}</span
                            >
                          {/if}
                        </span>
                      </DropdownMenu.RadioItem>
                    {/if}
                  {/each}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Group>
            {/each}
          {/each}
        </BarMenu>
      </DropdownMenu.Root>
      <BarItem
        aria-disabled={at >= path.length - 1 || undefined}
        icon={IconChevronRight}
        label={words.next}
        onclick={() => stepBy(1)}
      />
      <!-- The move into the state on show: its transport and timeline
           rise over the drawing's foot. -->
      <BarItem
        aria-disabled={move.kind === "none" || undefined}
        icon={IconPlayLinear}
        label={move.kind === "none" && keptState
          ? words.noMove(keptState.name)
          : words.moveFace}
        onclick={() => {
          if (move.kind !== "none" || rising === "move") {
            rising = rising === "move" ? null : "move";
          }
        }}
        pressed={rising === "move"}
      />
    </BarGlass>
  {/if}
{/snippet}

<!-- The view as one button where the tools have no room for it (a phone,
     a narrow card): the widths, the appearance and Compare in a menu that
     opens above it. -->
<!-- The scale a figure among the view's tools while the drawing stands
     scaled down to fit, itself the Actual size switch (Apple's Actual
     Size), in its glyph's place (the owner's pick on the stage notices,
     "Into the floating tools"); while Actual size is on, 100%. -->
{#snippet scaleFigure()}
  <BarItem
    data-slot="stage-scale"
    form="words"
    label={scalePercent
      ? words.scaleShowActual(scalePercent)
      : words.actualSize}
    onclick={() => {
      actual = !actual;
    }}
    pressed={actual}>{words.scalePercent(scalePercent ?? figure(100))}</BarItem
  >
{/snippet}

{#snippet viewButton()}
  <BarGlass form="group">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <BarItem icon={IconEyeLinear} label={words.stageView} {props} />
        {/snippet}
      </DropdownMenu.Trigger>
      <BarMenu label={words.stageView} rises width="regular">
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading>{words.width}</DropdownMenu.GroupHeading>
          <DropdownMenu.RadioGroup onValueChange={pickWidth} value={widthValue}>
            <DropdownMenu.RadioItem value="adapt"
              ><IconAdaptLinear /><span>{words.adapt}</span
              ></DropdownMenu.RadioItem
            >
            {#each WIDTHS as one (one.value)}
              <DropdownMenu.RadioItem value={String(one.value)}
                ><one.icon data-box /><span
                  >{words.widthOf(one.name, figure(one.value))}</span
                ></DropdownMenu.RadioItem
              >
            {/each}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.CheckboxItem
          checked={scheme === "dark"}
          onCheckedChange={(on) => {
            scheme = on ? "dark" : "light";
          }}><IconMoon /><span>{words.dark}</span></DropdownMenu.CheckboxItem
        >
        {#if !single}
          <DropdownMenu.CheckboxItem
            bind:checked={() => comparing, setComparing}
            ><IconCompareLinear /><span>{words.compare(compareName)}</span
            ></DropdownMenu.CheckboxItem
          >
        {/if}
        {#if actual || scalePercent}
          <!-- Folded, the scale stands with the widths it follows from,
               in View options, so the row holds to one line. -->
          <DropdownMenu.CheckboxItem bind:checked={actual}
            ><IconMaximize /><span
              >{scalePercent
                ? words.actualSizeFrom(scalePercent)
                : words.actualSize}</span
            ></DropdownMenu.CheckboxItem
          >
        {/if}
        {#if tunable}
          <DropdownMenu.CheckboxItem
            checked={rising === "dials"}
            onCheckedChange={(on) => {
              rising = on ? "dials" : null;
            }}
            ><IconTuning /><span>{words.dialsFace}</span
            ></DropdownMenu.CheckboxItem
          >
        {/if}
      </BarMenu>
    </DropdownMenu.Root>
  </BarGlass>
{/snippet}

<!-- What the drawing's view keeps out of sight, in the head's More: Reduce
     motion (the owner's pin: "this isn't a crucial toggle to put up and
     front"). -->
{#snippet moreItems()}
  <DropdownMenu.CheckboxItem bind:checked={reduce}
    ><IconPause /><span>{words.reduceMotion}</span></DropdownMenu.CheckboxItem
  >
{/snippet}

<!-- The stage's view, every control in sight over the stage's foot
     (PreviewTools; the owner's pin on the Working area: "all of these need
     to be directly visible"): the widths as their devices' glyphs, the
     component's own first where no listed width is it, each saying its
     figure in its name and tooltip;
     light or dark; the dials; Compare; the scale, itself Actual size, while
     the drawing stands scaled, or while Actual size is on. -->
{#snippet viewTools()}
  <div class="flex items-center gap-space-2">
    <BarSegments
      label={words.width}
      onValueChange={pickWidth}
      segments={[
        { value: "adapt", icon: IconAdaptLinear, label: words.adapt },
        ...WIDTHS.map((one) => ({
          value: String(one.value),
          icon: one.icon,
          label: words.widthOf(one.name, figure(one.value)),
        })),
      ]}
      value={widthValue}
    />
    <BarGlass form="group">
      <BarItem
        icon={scheme === "dark" ? IconMoonLinear : IconSunLinear}
        label={scheme === "dark" ? words.dark : words.light}
        onclick={() => {
          scheme = scheme === "dark" ? "light" : "dark";
        }}
      />
      {#if tunable}
        <BarItem
          icon={IconTuningLinear}
          label={words.dialsFace}
          onclick={() => {
            rising = rising === "dials" ? null : "dials";
          }}
          pressed={rising === "dials"}
        />
      {/if}
      {#if !single}
        <BarItem
          icon={IconCompareLinear}
          label={words.compare(compareName)}
          onclick={() => setComparing(!comparing)}
          pressed={comparing}
        />
      {/if}
      {#if actual || scalePercent}
        {@render scaleFigure()}
      {/if}
    </BarGlass>
  </div>
{/snippet}

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
  <!-- The page: the stage, to the surface's edges, the panel's head
       floating over it and keeping no band (The Title Bars Follow Liquid
       Glass Rule). -->
  <div data-slot="graph-page" class="flex min-h-0 min-w-0 flex-1 overflow-clip">
    <div
      class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      {@attach frameSize(
        (node: HTMLElement) => node.clientWidth,
        (value) => {
          stageAcross = value;
        }
      )}
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
        bind:room={stageRoom}
        ondifference={showDifference}
        onflip={() => {
          flipped = !flipped;
        }}
        name={keptState?.name ?? ""}
        {stale}
        variant={keptVariant?.name ?? null}
      />
      <!-- Over the drawing, what acts on it: the mode leading, the
               states' stepper in the middle (the state on show is the
               drawing's, never a back button: the owner's pin), the view
               trailing. -->
      {#if rising && review && kept && !narrow}
        <!-- What rises over the drawing's foot, above the tools: the
                 map of every state (the owner's pick on pin 47: a card
                 over the drawing, never in its place), the move's
                 transport and timeline, or the dials. Under the phone
                 line it is a bottom sheet instead (below). -->
        <div
          class={[
            floatingSurface({ motion: "pop" }),
            "absolute inset-x-space-3 bottom-(--rise-foot) z-2 mx-auto flex min-h-0 flex-col overflow-hidden",
            rising === "map"
              ? "h-1/2 max-w-c-graph-stage-min"
              : "max-h-1/2 max-w-c-measure p-space-3",
          ]}
          data-slot="graph-rising"
          style:--rise-foot={riseFoot}
          in:rise={"--duration-panel"}
          out:rise={"--duration-exit"}
        >
          {@render risingBody()}
        </div>
      {/if}
      {#if narrow && sheetDrawn && review && kept}
        <!-- Under the phone line what rises is the kit's bottom sheet
             (the owner's pick: "Open as a sheet on phones"): half the
             room as it opens, dragged up to the whole, its grabber and
             its stops ThreadSheet's. -->
        <ThreadSheet
          label={risingName}
          onclose={() => {
            rising = null;
          }}
          onclosed={() => {
            if (!rising) {
              sheetDrawn = false;
            }
          }}
          open={rising !== null}
        >
          <div
            class="flex min-h-0 flex-1 flex-col px-space-3 pb-space-3"
            data-slot="graph-rising-sheet"
          >
            {@render risingBody()}
          </div>
        </ThreadSheet>
      {/if}
      <!-- The row folds on a phone's pane, or wherever its full form is
           wider than the stage: the mode and the view each one button
           opening its menu above it, the states' group as it is. -->
      <PreviewTools
        away={narrow && link.scrolledDown && !rising}
        spread={!folded}
        bind:height={toolsHeight}
        bind:need={toolsNeed}
      >
        <div class="flex items-center">
          {#if folded}
            {@render modeCompact?.()}
          {:else}
            {@render modeTools?.()}
          {/if}
        </div>
        <!-- Folded, the states' group gives up width first, its name cut
             at its end, so the row holds to one line. -->
        <div class="flex min-w-0">
          {@render headLead()}
        </div>
        <!-- What changed since he looked, beside the view (the owner's
                 pick: "On the page only"). -->
        <div class="flex items-end gap-space-2">
          {@render changesTools?.()}
          {#if folded}
            {@render viewButton()}
          {:else}
            {@render viewTools()}
          {/if}
        </div>
      </PreviewTools>
    </div>
  </div>
</div>
