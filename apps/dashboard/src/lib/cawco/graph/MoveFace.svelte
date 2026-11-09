<script lang="ts" module>
  /** Where the move into the kept state stands. */
  export type MoveState =
    | { kind: "none"; state: string }
    | { kind: "reading"; from: string; to: string }
    | { kind: "failed"; from: string; to: string; why: string }
    | { kind: "ready"; from: string; to: string; clips: Clip[] };
</script>

<script lang="ts">
  /**
   * The animation into the kept state (spec, The move), drawn from what the
   * person comes to do with it (the task model's T3, T9, T18; the run
   * record of 4 November names each step and the one control that serves
   * it), as the motion tools lay a timeline out (Motion Studio, Jitter).
   *
   * - **The title** is the move ("Filled in → Hub didn't answer"), a menu
   *   of every move the states file names under it, as the bar's own
   *   component title is: a press on one plays it from its from state.
   * - **The transport**, one group at the ruler's leading corner: Play,
   *   Repeat (a toggle: the move goes round again each time it ends), and
   *   the time held over the move's length.
   * - **The ruler** is the playhead's slider (bits-ui Slider): a press or a
   *   drag on it scrubs, during a play too, and the move stays held where
   *   it is let go (T3); let go within half a mark of either end, it lands
   *   on that end's state. Its handle is a flag on the ruler.
   * - **One row per thing that moves**, every row one line, a hairline
   *   between rows, read down three fixed columns: what moves and how
   *   ("Form failure unfolds", cut with the whole in its tooltip); its own
   *   length (the animations' durations as written, never a measured
   *   span); its lane. A thing that moves more than once has a disclosure
   *   triangle at its leading edge (an outline's, as Motion Studio's tracks
   *   open into their properties), opening one row per animation named by
   *   the property it animates ("opacity", "--press-by").
   * - **A press on a row, or on its bar**, selects it: the house Selected
   *   wash (coral is the selected row's alone), its bar ringed, its three
   *   settings opened under it (ClipSettings, his pick: a clip is adjusted
   *   in place). A bar's body drags its delay and its ends its length
   *   (ClipBar).
   * - **A change** is marked as the Controls face marks one (the owner's
   *   pick, graph-dials-questions `changed-mark`, and his pin on the words
   *   that said a state): a changed row keeps its own ink, and the undo
   *   glyph in the edit's ink stands at its name's end (every value of that
   *   row back), as one does after a changed setting. Reset all stands in
   *   the head once anything changed, Undo reset in its place after it.
   *
   * One scale for all of it: the lane runs from the move's start (the
   * moment it first set anything off) to the ruler's next mark a quarter
   * past its end, so a bar can always be dragged past the end it has: a
   * lane that ended on the move's last mark held every edit under it. The
   * ruler, every bar, the gridlines and the playhead are placed by one
   * rule, `t / scale` of the lane's width. The ruler's marks stand every
   * 100 ms, or every step of 1, 2 and 5 past it that keeps them
   * `--spacing-space-2` apart; its figures thin to the lane's width.
   *
   * Where the face is narrower than `--container-timeline` (the phone's
   * drawer, a room at its least), each row's name stands over a lane the
   * face's full width (T18): a lane of 100px left 9 ms a pixel.
   *
   * Resting on a row, or focusing in it, rings the thing it names on the
   * stage (DesignGraph `lit`); nothing else on the stage changes.
   *
   * What a timeline tool gives besides (parity.md, and the surface brief's
   * list of where each stands), on the same rows and ruler:
   * - **Replay** after Play, always from the move's start.
   * - **Zoom and pan**: a pinch or Ctrl-wheel on the lanes zooms round the
   *   pointer, a sideways wheel or Shift-wheel pans; while zoomed, a strip
   *   under the ruler draws the part shown, dragged to move along the
   *   move, and Fit in the transport puts the whole move back.
   * - **Scrub anywhere**: a press on an empty part of a lane scrubs as the
   *   ruler does; Shift and a press on a bar scrub over it.
   * - **Repeat from a time**: while Repeat is on, a mark on the ruler the
   *   move goes round again from, at 0 until dragged.
   * - **The agent's groups**: rows whose things stand in one of the
   *   agent's groups (`data-cawco-group`) under the house section head,
   *   its chevron folding them.
   * - **Legs and a clip's own repeat** on the bars (ClipBar), **values**
   *   and **repeats** in the settings (ClipSettings).
   * - Escape closes the open row first; the room's own Escape is next.
   */
  import type { ClipKind } from "@cawco/core/stage-graph";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconChevronRight,
    IconPause,
    IconPlay,
    IconRepeat,
    IconReplay,
    IconReset,
    IconZoomOut,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { browser } from "$app/env";
  import ChoiceList, { toChosen } from "./ChoiceList.svelte";
  import ClipBar from "./ClipBar.svelte";
  import ClipSettings from "./ClipSettings.svelte";
  import { figureOf, inkWidth } from "./figures";
  import {
    type Clip,
    editsOf,
    lengthOf,
    type Part,
    partsOf,
    RUN_STEP,
    type Run,
    releg,
    retimeRun,
    type Track,
    tracksOf,
    untune,
  } from "./motion";

  let {
    move,
    playhead,
    playing,
    repeat,
    onplay,
    onpause,
    onreplay,
    onrepeat,
    loopFrom = 0,
    onloopfrom,
    onseek,
    onseekend,
    onretime,
    onreset,
    onlight,
    choices,
    chosen,
    onchoose,
    onfocusthing,
    peek = false,
    titled = true,
    onretry,
    lang,
    still = false,
    undoable = false,
    onundo,
    selected = $bindable(null),
  }: {
    move: MoveState;
    /** The playhead, ms into the move. */
    playhead: number;
    playing: boolean;
    /** Play goes round again each time the move ends. */
    repeat: boolean;
    onplay: () => void;
    onpause: () => void;
    /** Play from the move's start, wherever the playhead stands. */
    onreplay: () => void;
    onrepeat: (on: boolean) => void;
    /** Where a repeat goes round again from, ms. */
    loopFrom?: number;
    /** The repeat's mark dragged to `at` ms. */
    onloopfrom: (at: number) => void;
    /** A scrub: the move held at `t` ms. */
    onseek: (t: number) => void;
    /** The scrub let go at `t` ms (0 or the move's end when let go near either). */
    onseekend: (t: number) => void;
    /** Clips he tuned, to put in the move; a key's nudge plays nothing. */
    onretime: (clips: Clip[], replay?: boolean) => void;
    /** Clips put back as the engine ran them, by id. */
    onreset: (ids: string[]) => void;
    /** The thing a row names, rested on, by the page's id for it (null: none). */
    onlight: (thing: string | null) => void;
    /** Every move the states file names, by its states' ids. */
    choices: { from: string; key: string; name: string; to: string }[];
    /** The move on the face, `from->to`; null with none. */
    chosen: string | null;
    /** A move picked from the title's menu: played from its from state. */
    onchoose: (from: string, to: string) => void;
    /** A row took the focus (a key, or a press on it): the thing it names, to bring into view on the stage. */
    onfocusthing: (thing: string | null) => void;
    /** The phone drawer at its head stop: Play, its time and the move's name, one line. */
    peek?: boolean;
    /** The move's name heads the face; false where what stands round it names the state already (the panel's stepper). */
    titled?: boolean;
    /** A move whose play threw, played again from its from state. */
    onretry: () => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
    /** Reduced motion is on: Play lands the move at its end. */
    still?: boolean;
    /** Reset all can be taken back: nothing has changed since. */
    undoable?: boolean;
    onundo: () => void;
    /** The line whose settings stand open under it, by its key (a row's first clip's id; an animation's `row/clip`). */
    selected?: string | null;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  /** The rows he changed, as he sees them: one curve picked on a row of four animations is one change. */
  const changedCount = $derived(
    tracksOf(clips).filter((track) => editsOf(track).size > 0).length
  );
  const tracks = $derived(tracksOf(clips));
  const length = $derived(Math.max(1, lengthOf(clips)));

  /** The ruler's finest mark, ms. */
  const FINEST = 100;
  /** The marks a ruler draws before its lane is measured, at most. */
  const MARKS_UNMEASURED = 50;
  /** How far past the move's end the lane reaches: a quarter more, so a bar is never held under the end it has. */
  const HEADROOM = 1.25;
  /** The lane's width, px: the ruler's marks and figures thin to it. */
  let lane = $state(0);
  /** The ruler's lane, in its figures' type. */
  let ruler = $state<HTMLElement | null>(null);
  /** How far the lane must reach: the move's end and its end as the engine ran it, a quarter past. */
  const reach = $derived(
    Math.max(length, lengthOf(clips.map(untune))) * HEADROOM
  );
  /**
   * The lane's end as it last stood for this move: the lane only grows
   * while one move is on the face, so a drag, a key or a reset never
   * rescales it under him (a bar dragged 60px
   * moved 270 ms as the ruler rescaled mid-drag).
   */
  let kept = $derived<{ move: string | null; scale: number }>({
    move: chosen,
    scale: 0,
  });
  const keptScale = $derived(kept.scale);
  const span = $derived(Math.max(reach, keptScale));
  /** How far the lanes are zoomed in (1: the whole move), and where the part shown begins, ms. */
  let zoom = $state(1);
  let viewStart = $state(0);
  /** The step of a ruler `across` ms wide: 100 ms, else the least of 200, 500, 1000, 2000, 5000… whose marks stand `--spacing-space-2` apart on the lane. A mark every 100 ms drew 18,000 of them for a move of 30 minutes. */
  const stepFor = (across: number) => {
    const apart = browser ? numberOf("--spacing-space-2") : 1;
    const most = Math.max(
      1,
      lane > 0 ? Math.floor(lane / apart) : MARKS_UNMEASURED
    );
    const ladder = [1, 2, 5].map((one) => one * FINEST);
    let at = 0;
    let found = FINEST;
    while (Number.isFinite(across) && Math.ceil(across / found) > most) {
      at += 1;
      found = (ladder[at % 3] as number) * 10 ** Math.floor(at / 3);
    }
    return found;
  };
  const wholeStep = $derived(stepFor(span));
  /** The lane's end: the ruler's next mark past its reach. */
  const scale = $derived(
    Math.max(wholeStep, Math.ceil(span / wholeStep) * wholeStep)
  );
  $effect(() => {
    if (kept.scale < scale) {
      kept = { move: chosen, scale };
    }
  });
  /** The most the lanes zoom in: a tenth of a second across, or eight times, whichever is more. */
  const zoomMost = $derived(Math.max(8, scale / (10 * RUN_STEP)));
  /** The part of the move the lanes show, ms: the whole of it unzoomed. */
  const viewSpan = $derived(scale / Math.min(zoom, zoomMost));
  const viewFrom = $derived(
    Math.min(Math.max(0, viewStart), Math.max(0, scale - viewSpan))
  );
  const viewTo = $derived(viewFrom + viewSpan);
  const zoomed = $derived(viewSpan < scale - 0.5);
  /** The ruler's step for the part shown. */
  const step = $derived(stepFor(viewSpan));
  const marks = $derived(
    Array.from(
      {
        length: Math.floor(viewTo / step) - Math.ceil(viewFrom / step) + 1,
      },
      (_, at) => (Math.ceil(viewFrom / step) + at) * step
    )
  );
  /** The lane's inset, px (`px-space-2`): a figure centred on an end mark may reach into it, no further. */
  const INSET = browser ? numberOf("--spacing-space-2") : 0;
  /** `--spacing-space-3`: the least room between two figures. */
  const FIGURE_GAP = browser ? numberOf("--spacing-space-3") : 0;
  const FOUR_FIGURES = browser ? numberOf("--spacing-space-8") : 0;
  const figure = (n: number) => figureOf(n, lang);
  const widest = $derived(
    ruler ? inkWidth(figure(scale), ruler) : FOUR_FIGURES
  );
  /** A figure on every mark, every second, every fourth… so each centred figure stands `--spacing-space-3` clear of the next. */
  const figureEvery = $derived.by(() => {
    const apart = lane > 0 ? (lane * step) / viewSpan : 0;
    return apart <= 0
      ? 1
      : Math.max(
          1,
          2 ** Math.ceil(Math.log2(Math.max(1, (widest + FIGURE_GAP) / apart)))
        );
  });
  const figured = $derived(
    new Set(
      marks.filter(
        (mark, at) =>
          at % figureEvery === 0 &&
          (at < marks.length - 1 ||
            !ruler ||
            inkWidth(figure(mark), ruler) / 2 <= INSET)
      )
    )
  );
  /** Where `t` ms stands across the lanes, as a share of their width: the part shown, zoomed or whole. */
  const pct = (t: number) => `${((t - viewFrom) / viewSpan) * 100}%`;
  /** How far a ruler figure stands back from its mark: centred, or from the lane's end it stands at. */
  const shiftOf = (mark: number): string => {
    if (mark <= viewFrom) {
      return "0%";
    }
    return mark >= viewTo ? "100%" : "50%";
  };
  /** A pointer's moment on a lane, ms, from where it stands across `box`. */
  const momentAt = (event: PointerEvent, box: DOMRect) => {
    const across = (event.clientX - box.left) / Math.max(1, box.width);
    const share =
      getComputedStyle(event.currentTarget as Element).direction === "rtl"
        ? 1 - across
        : across;
    return Math.min(length, Math.max(0, viewFrom + share * viewSpan));
  };
  /** The lanes zoomed by `by` round `at` ms, held between whole and the most. */
  const zoomBy = (by: number, at: number) => {
    const next = Math.min(zoomMost, Math.max(1, zoom * by));
    const share = (at - viewFrom) / viewSpan;
    zoom = next;
    viewStart = at - share * (scale / next);
  };
  /** The part shown moved along the move by `ms`. */
  const panBy = (ms: number) => {
    viewStart = viewFrom + ms;
  };
  /** The whole move on the lanes again. */
  const fit = () => {
    zoom = 1;
    viewStart = 0;
  };
  /**
   * The wheel on the lanes: a pinch (which a browser says as a Ctrl-wheel)
   * or a Ctrl- or ⌘-wheel zooms round the pointer; a sideways wheel or a
   * Shift-wheel pans. A plain wheel scrolls the rows as it did.
   */
  const wheel = (event: WheelEvent) => {
    const box = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
      "[data-slot=ruler-lane]"
    );
    if (!box) {
      return;
    }
    const rect = box.getBoundingClientRect();
    const across = (event.clientX - rect.left) / Math.max(1, rect.width);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY / 200), viewFrom + across * viewSpan);
      return;
    }
    const sideways = event.shiftKey ? event.deltaY : event.deltaX;
    if (
      zoomed &&
      Math.abs(sideways) > Math.abs(event.shiftKey ? 0 : event.deltaY)
    ) {
      event.preventDefault();
      panBy((sideways / Math.max(1, rect.width)) * viewSpan);
    }
  };
  /** The playhead as the ruler's handle holds it, on its 1 ms steps. */
  const handle = $derived(Math.round(Math.min(playhead, length)));
  /** A key's step of the playhead, ms; with Shift, a ruler's mark. */
  const KEY_STEP = 10;
  /**
   * The ruler's keys, held where they leave the playhead (WAI-ARIA APG,
   * Slider): the arrows 10 ms, with Shift a mark, Page Up and Page Down a
   * mark, Home and End the move's two ends. bits-ui's own steps were 1 ms,
   * each committed, and a commit within half a mark of 0 snapped back to
   * it, so the arrows never left 0.
   */
  const rulerKey = (event: KeyboardEvent) => {
    const big = event.shiftKey ? step : KEY_STEP;
    const by: Record<string, number> = {
      ArrowRight: big,
      ArrowUp: big,
      ArrowLeft: -big,
      ArrowDown: -big,
      PageUp: step,
      PageDown: -step,
      Home: -length,
      End: length,
    };
    const shift = by[event.key];
    if (shift !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      const t = Math.max(0, Math.min(length, handle + shift));
      onseek(t);
      onseekend(t);
    }
  };
  /** A pointer is scrubbing the ruler: its let-go lands near an end on that end. */
  let scrubbing = false;
  /** A scrub let go within half a mark of either end lands on that end's state (T3: letting go lands on the nearest whole state). */
  const letGo = (t: number) => {
    const near = scrubbing ? step / 2 : 0;
    scrubbing = false;
    let landed = t;
    if (t <= near) {
      landed = 0;
    } else if (length - t <= near) {
      landed = length;
    }
    if (landed !== t) {
      onseek(landed);
    }
    onseekend(landed);
  };

  /**
   * What an animation changes, in words: the property's own name where
   * the words have one ("Opacity", "Position"), else the property's name
   * said plainly ("--press-by" is "Press by"), never the CSS in code type.
   */
  const LEADING_DASHES = /^-+/u;
  const JOINERS = /[-_]+/gu;
  const propertyName = (property: string): string => {
    const said = words.properties[property];
    if (said) {
      return said;
    }
    const plain = property
      .replace(LEADING_DASHES, "")
      .replace(JOINERS, " ")
      .trim();
    return plain.charAt(0).toUpperCase() + plain.slice(1);
  };
  /** A row as a person says it: what moves and how. */
  const nameOf = (track: Track) => words.clipName(track.name, track.how);
  // Another move on the face: its rows are other rows, none selected.
  let selectedIn = chosen;
  $effect.pre(() => {
    if (chosen !== selectedIn) {
      selectedIn = chosen;
      selected = null;
      zoom = 1;
      viewStart = 0;
    }
  });
  /** The selected line's thing, rung on the stage while it is selected. */
  const keptLit = (): string | null => picked?.track.thing ?? null;
  /** Rest and focus on a row light its thing; leaving gives the ring back to the selected row's. */
  const lights = (track: Track) => ({
    onpointerenter: () => onlight(track.thing),
    onpointerleave: () => onlight(keptLit()),
    onfocusin: () => {
      onlight(track.thing);
      onfocusthing(track.thing);
    },
    onfocusout: () => onlight(keptLit()),
  });
  // A row selected rings its thing on the stage until another is.
  $effect(() => {
    onlight(picked?.track.thing ?? null);
  });

  interface Line {
    key: string;
    /** A row under its row: the animations of one property in one run. */
    part: Part | null;
    track: Track;
  }
  /** The row open on the face: the selected line's row, a row itself or one of its animations. */
  const openRow = $derived(selected ? selected.split("/")[0] : null);
  /** The agent's groups he folded, by name: their rows stand put away under their head. */
  let folded = $state<string[]>([]);
  /** The agent's group whose head stands before a row: the first row of each group, in the rows' order. */
  const headOf = $derived.by(() => {
    const seen = new Set<string>();
    const heads = new Map<string, string>();
    for (const track of tracks) {
      if (track.group && !seen.has(track.group)) {
        seen.add(track.group);
        heads.set(track.id, track.group);
      }
    }
    return heads;
  });
  /** A row's lines: itself, and while open its animations by run and property, in the order the engine ran them, so retiming one never moves it. */
  const linesOf = (track: Track): Line[] => {
    const own: Line = { key: track.id, track, part: null };
    const parts = partsOf(track);
    if (!(openRow === track.id && parts.length > 1)) {
      return [own];
    }
    return [
      own,
      ...parts.map((part) => ({ key: part.key, track: part.track, part })),
    ];
  };
  const isFolded = (track: Track) =>
    track.group !== null && folded.includes(track.group);
  /** The timeline's lines, in order, a folded group's put away. */
  const lines = $derived(
    tracks.flatMap((track) => (isFolded(track) ? [] : linesOf(track)))
  );
  /** What the timeline draws, in order: each group's head before its first row, then every line it shows. */
  const entries = $derived(
    tracks.flatMap((track) => {
      const group = headOf.get(track.id);
      const head = group
        ? [{ kind: "head" as const, key: `group:${group}`, group }]
        : [];
      return [
        ...head,
        ...(isFolded(track)
          ? []
          : linesOf(track).map((line) => ({
              kind: "line" as const,
              key: line.key,
              line,
            }))),
      ];
    })
  );
  const foldGroup = (group: string) => {
    folded = folded.includes(group)
      ? folded.filter((one) => one !== group)
      : [...folded, group];
  };

  /**
   * A press on an empty part of a lane scrubs as the ruler does, and with
   * Shift a press on a bar does too: the playhead follows the pointer and
   * the move is held where it is let go, an end within half a mark landing
   * on that end's state.
   */
  const laneScrub = (event: PointerEvent) => {
    const onBar = (event.target as Element | null)?.closest(
      "[data-slot=run-bar], [data-run-end], [data-slot=leg-end]"
    );
    if (event.button !== 0 || (onBar && !event.shiftKey)) {
      return;
    }
    // Ahead of the bar's own drag (interact.js listens on the bar).
    event.stopPropagation();
    event.preventDefault();
    const node = event.currentTarget as HTMLElement;
    const box = node.getBoundingClientRect();
    node.setPointerCapture(event.pointerId);
    scrubbing = true;
    let at = momentAt(event, box);
    onseek(at);
    const follow = (next: PointerEvent) => {
      at = momentAt(next, box);
      onseek(at);
    };
    const up = () => {
      node.removeEventListener("pointermove", follow);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      letGo(at);
    };
    node.addEventListener("pointermove", follow);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  };

  /** A drag along `node` (the overview strip, the repeat's mark): `to` with each moment, from where the pointer stands across the lanes. */
  const dragAlong =
    (to: (t: number) => void, across: () => HTMLElement | null) =>
    (event: PointerEvent) => {
      const box = across()?.getBoundingClientRect();
      if (event.button !== 0 || !box) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const node = event.currentTarget as HTMLElement;
      node.setPointerCapture(event.pointerId);
      to(momentAt(event, box));
      const follow = (next: PointerEvent) => to(momentAt(next, box));
      const up = () => {
        node.removeEventListener("pointermove", follow);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      };
      node.addEventListener("pointermove", follow);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    };
  /** The repeat's mark at `t`, on the ruler's 10 ms steps, never past the move's end. */
  const setLoopFrom = (t: number) =>
    onloopfrom(
      Math.min(
        Math.max(0, length - RUN_STEP),
        Math.max(0, Math.round(t / RUN_STEP) * RUN_STEP)
      )
    );
  /** The repeat mark's keys: the arrows 10 ms, Shift a mark, Home and End. */
  const loopKey = (event: KeyboardEvent) => {
    const big = event.shiftKey ? step : RUN_STEP;
    const by: Record<string, number> = {
      ArrowRight: big,
      ArrowUp: big,
      ArrowLeft: -big,
      ArrowDown: -big,
      Home: -length,
      End: length,
    };
    const shift = by[event.key];
    if (shift !== undefined) {
      event.preventDefault();
      setLoopFrom(loopFrom + shift);
    }
  };
  /**
   * The overview strip: a press or a drag on it centres the part shown on
   * that moment of the whole move. It reads the strip's own width as the
   * whole move, so the drag is its own.
   */
  const overviewTo = (t: number) => {
    viewStart = (t / Math.max(1, length)) * scale - viewSpan / 2;
  };
  let overview = $state<HTMLElement | null>(null);
  /** The overview's own moment: across the strip, the whole lane. */
  const overviewDrag = (event: PointerEvent) => {
    const box = overview?.getBoundingClientRect();
    if (event.button !== 0 || !box) {
      return;
    }
    event.preventDefault();
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    const at = (next: PointerEvent) =>
      overviewTo(
        Math.min(1, Math.max(0, (next.clientX - box.left) / box.width)) * length
      );
    at(event);
    const up = () => {
      node.removeEventListener("pointermove", at);
      node.removeEventListener("pointerup", up);
    };
    node.addEventListener("pointermove", at);
    node.addEventListener("pointerup", up);
  };
  let rulerLane = $state<HTMLElement | null>(null);
  /** Escape closes the open row first (parity question 4); the room's own Escape comes after, once none is open. */
  const closeRow = (event: KeyboardEvent) => {
    if (
      event.key === "Escape" &&
      selected !== null &&
      !event.defaultPrevented
    ) {
      const field = (event.target as HTMLElement | null)?.closest(
        "input, textarea, select, [contenteditable='true']"
      );
      if (!field) {
        event.preventDefault();
        selected = null;
      }
    }
  };
  /**
   * One press on a row does one thing: it opens the row or closes it, its
   * chevron turning. An open row shows its settings under it and, where its
   * thing moves more than once, a row per animation under those; each of
   * those opens and closes its own settings the same way. Closing an
   * animation's row leaves its row open; closing a row closes all of it.
   * (A row's words and its chevron opened two different things, and
   * nothing said which: his words, "if I click the button it opens one
   * thing, but if I open the chevron it opens something completely
   * different".)
   */
  const isOpen = (line: Line) =>
    line.part ? selected === line.key : openRow === line.key;
  const press = (line: Line) => {
    if (line.part) {
      selected = selected === line.key ? (openRow ?? null) : line.key;
    } else {
      selected = openRow === line.key ? null : line.key;
    }
  };
  /** The kinds of change the bars show, in the key's order: their colours named. */
  const KINDS: ClipKind[] = ["size", "move", "fade", "tint", "effect", "other"];
  const kindsShown = $derived(
    KINDS.filter((kind) => lines.some((line) => line.track.kind === kind))
  );
  /** The selected line, while it still stands. */
  const picked = $derived(lines.find((line) => line.key === selected) ?? null);
  /** Every bar's edges but `run`'s own: where a dragged edge settles. */
  const edgesBesides = (run: Run) =>
    tracks.flatMap((track) =>
      track.runs
        .filter((one) => one.id !== run.id)
        .flatMap((one) => [one.from, one.to])
    );
  /** A line's name for a reader: a row's words, an animation's property and run. */
  const lineName = (line: Line) =>
    line.part
      ? words.clipName(line.track.name, propertyName(line.part.property))
      : nameOf(line.track);

  /** Each kind's swatch in the key: its bar's wash and edge. */
  const BAR: Record<ClipKind, string> = {
    size: "bg-c-clip-size-wash border-c-clip-size",
    move: "bg-c-clip-move-wash border-c-clip-move",
    fade: "bg-c-clip-fade-wash border-c-clip-fade",
    tint: "bg-c-clip-tint-wash border-c-clip-tint",
    effect: "bg-c-clip-effect-wash border-c-clip-effect",
    other: "bg-c-clip-other-wash border-c-clip-other",
  };
  /** The drawer's head line while the move has no rows to play. */
  const peekLine = $derived.by(() => {
    if (move.kind === "none") {
      return words.noMove(move.state);
    }
    return move.kind === "reading"
      ? words.reading
      : words.move(move.from, move.to);
  });
  let titleOpen = $state(false);
  let movesList = $state<HTMLElement>();
  /** The time's widest reading, in characters of its monospaced figures: the length over the length. */
  const timeWidth = $derived(
    words.playhead(figure(Math.round(length)), figure(Math.round(length)))
      .length
  );
  const bare =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover";
</script>

{#snippet title()}
  <!-- The move on the face, the list of every move under it (ChoiceList,
       as a clip's lengths and curves are listed): the bar's title pattern
       ("Routine form" with its chevron). -->
  <Popover.Root bind:open={titleOpen}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={move.kind === "none"
            ? words.chooseMove
            : `${words.moves}: ${words.move(move.from, move.to)}`}
          class="mark-line pointer-hit touch-hit -ms-space-2 inline-flex h-c-btn-h-sm max-w-full min-w-0 items-center gap-space-1 rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
          data-slot="move-title"
          type="button"
        >
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{move.kind === "none"
              ? words.chooseMove
              : words.move(move.from, move.to)}</span
          >
          <IconChevronDown
            aria-hidden="true"
            class="size-icon-sm flex-none text-ink-muted"
            data-box
          />
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      align="start"
      height="available"
      gap="none"
      onOpenAutoFocus={toChosen(() => movesList)}
      overflow="scroll"
      width="wide"
    >
      <ChoiceList
        bind:ref={movesList}
        label={words.moves}
        onpick={(next) => {
          titleOpen = false;
          const one = choices.find((each) => each.key === next);
          if (one) {
            onchoose(one.from, one.to);
          }
        }}
        options={choices.map((one) => ({ value: one.key, name: one.name }))}
        value={chosen}
      />
    </Popover.Content>
  </Popover.Root>
{/snippet}

{#snippet transport()}
  <!-- Play, Repeat and the time, one group at the ruler's leading corner
       (Motion Studio, Jitter). -->
  <div
    class="mark-line flex min-w-0 items-center gap-space-1"
    data-slot="transport"
  >
    <Tip label={playing ? words.pause : words.play}>
      {#snippet children(tip)}
        <button
          {...tip}
          type="button"
          data-box
          aria-label={playing ? words.pause : words.play}
          class={bare}
          onclick={() => (playing ? onpause() : onplay())}
        >
          {#if playing}
            <IconPause aria-hidden="true" class="size-icon-md" />
          {:else}
            <IconPlay aria-hidden="true" class="size-icon-md" />
          {/if}
        </button>
      {/snippet}
    </Tip>
    <Tip label={words.replay}>
      {#snippet children(tip)}
        <button
          {...tip}
          type="button"
          data-box
          aria-label={words.replay}
          class={bare}
          data-slot="replay"
          onclick={onreplay}
        >
          <IconReplay aria-hidden="true" class="size-icon-md" />
        </button>
      {/snippet}
    </Tip>
    <Tip label={words.repeat}>
      {#snippet children(tip)}
        <Toggle
          {...tip}
          aria-label={words.repeat}
          data-box
          onPressedChange={onrepeat}
          pressed={repeat}
          size="sm"
        >
          <IconRepeat aria-hidden="true" class="size-icon-md" />
        </Toggle>
      {/snippet}
    </Tip>
    {#if zoomed}
      <Tip label={words.fit}>
        {#snippet children(tip)}
          <button
            {...tip}
            type="button"
            data-box
            aria-label={words.fit}
            class={bare}
            data-slot="fit"
            onclick={fit}
          >
            <IconZoomOut aria-hidden="true" class="size-icon-md" />
          </button>
        {/snippet}
      </Tip>
    {/if}
    <!-- As wide as its widest reading, so nothing beside it moves while
         it counts (the move's name on a phone shifted at each figure). -->
    <span
      class="ms-space-1 min-w-(--time-w) type-code whitespace-nowrap text-ink-muted num"
      data-slot="time"
      style:--time-w="{timeWidth}ch"
      >{words.playhead(figure(handle), figure(Math.round(length)))}</span
    >
    {#if still}
      <!-- Why Play lands the move at its end: the reader asked for less motion. -->
      <span
        class="ms-space-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
        >{words.motionReduced}</span
      >
    {/if}
  </div>
{/snippet}

{#snippet back()}
  <!-- The time past the move's end, shaded, and a gridline down from each
       figured mark: drawn in each lane, so they run down the rows and stop
       where a row's settings stand. -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 start-(--at) end-0 bg-surface-recess"
    data-slot="past-end"
    style:--at={pct(length)}
  ></span>
  {#each marks as mark (mark)}
    {#if figured.has(mark) && mark > 0}
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 start-(--at) w-px -translate-x-1/2 bg-border-hairline rtl:translate-x-1/2"
        style:--at={pct(mark)}
      ></span>
    {/if}
  {/each}
{/snippet}

{#snippet playheadLine()}
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 start-(--at) z-1 w-px -translate-x-1/2 bg-ink-strong rtl:translate-x-1/2"
    data-slot="playhead"
    style:--at={pct(Math.min(playhead, length))}
  ></span>
{/snippet}

{#snippet rowWords(line: Line, tone: "open" | "rest")}
  <!-- A row's words: what moves in the row ink, how in muted; an
       animation's row says what it changes in words, its run and its
       parts; open, all in selected ink. -->
  {@const name = {
    open: "text-selected-ink",
    rest: "text-ink-row",
  }[tone]}
  {@const rest = tone === "open" ? "text-selected-ink" : "text-ink-muted"}
  <span class="min-w-0 truncate">
    {#if line.part}
      <span class={name}>{propertyName(line.part.property)}</span>
      {#if line.part.run !== null}
        <span class={rest}>{words.runAt(line.part.run)}</span>
      {/if}
      {#if line.part.count > 1}
        <span class={rest}>{words.partsCount(line.part.count)}</span>
      {/if}
    {:else}
      <span class={name}>{line.track.name}</span>
      <span class={rest}>{line.track.how}</span>
    {/if}
  </span>
{/snippet}

{#snippet overviewStrip()}
  <!-- While zoomed: the whole move, the part the lanes show drawn in it and
       the playhead's place; a press or a drag on it moves the part shown. -->
  <div
    bind:this={overview}
    aria-label={words.overview}
    class="relative h-space-2 w-full cursor-ew-resize touch-none rounded-pill bg-surface-fill"
    data-slot="overview"
    onpointerdown={overviewDrag}
    role="presentation"
  >
    <span
      aria-hidden="true"
      class="absolute inset-y-0 start-(--from) w-(--wide) rounded-pill border border-border-control bg-surface-raised"
      style:--from="{(viewFrom / scale) * 100}%"
      style:--wide="{(viewSpan / scale) * 100}%"
    ></span>
    <span
      aria-hidden="true"
      class="absolute inset-y-0 start-(--at) w-px bg-ink-strong"
      style:--at="{(Math.min(playhead, length) / scale) * 100}%"
    ></span>
  </div>
{/snippet}

<div
  data-slot="move"
  class="@container/move flex min-h-0 min-w-0 flex-1 flex-col gap-space-3"
  {@attach (node: HTMLElement) => {
    node.addEventListener("keydown", closeRow);
    return () => node.removeEventListener("keydown", closeRow);
  }}
>
  {#if peek}
    <!-- The drawer at its head stop: Play, the time and the move on one
       line over the stage, so the move plays in sight of the stage. -->
    {#if move.kind === "ready" && clips.length > 0}
      <div class="flex min-h-c-btn-h min-w-0 items-center gap-space-3">
        {@render transport()}
        <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
          >{words.move(move.from, move.to)}</span
        >
      </div>
      {#if zoomed}
        {@render overviewStrip()}
      {/if}
    {:else}
      <p class="m-0 min-w-0 truncate type-label text-ink-muted">
        {peekLine}
      </p>
    {/if}
  {:else}
    <!-- The head: the move as the face's title, and once he changed any
       timing, Reset all. -->
    <!-- One line of one height, whatever it holds (the title alone, Undo
         reset, or Reset all), never wrapping, so the rows under it never
         move as it comes and goes. The title gives way first, its whole
         name in its menu. -->
    <header
      class="flex h-c-btn-h min-w-0 flex-none items-center gap-x-space-3"
      data-slot="move-head"
    >
      <div class="flex min-w-0 flex-1 items-center">
        {#if titled}
          {@render title()}
        {/if}
      </div>
      {#if move.kind === "ready" && changedCount === 0 && undoable}
        <!-- Reset all taken back in place, until anything changes again
             (the house answer: undo over confirm). -->
        <Button
          data-slot="undo-reset"
          onclick={onundo}
          size="sm"
          variant="ghost">{words.undoReset}</Button
        >
      {/if}
      {#if move.kind === "ready" && changedCount > 0}
        <div class="flex flex-none items-center gap-space-2">
          <!-- Reset all, as the Controls face writes it: the undo glyph
               and its words, at every width. -->
          <Button
            aria-label={words.resetAllSaid}
            data-slot="reset-all"
            icon={IconReset}
            label={words.resetAll}
            onclick={() =>
              onreset(clips.filter((clip) => clip.was).map((clip) => clip.id))}
            size="sm"
            variant="ghost"
          />
        </div>
      {/if}
    </header>

    {#if move.kind === "none"}
      <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
        {words.noMove(move.state)}
      </p>
    {:else if move.kind === "reading"}
      <p class="m-0 type-meta text-ink-muted" role="status">
        {words.reading}
      </p>
    {:else if move.kind === "failed"}
      <!-- Why it didn't play, and the way back: Try again plays it once
         more from its from state, as it played on arrival. -->
      <div class="flex min-w-0 flex-col items-start gap-space-3" role="alert">
        <p class="m-0 type-body text-status-fail-ink wrap-anywhere">
          {words.moveFailed(move.why)}
        </p>
        <Button onclick={onretry} size="sm" variant="outline"
          >{words.tryAgain}</Button
        >
      </div>
    {:else if clips.length === 0}
      <p class="m-0 type-body text-ink-muted text-pretty">
        {words.nothingAnimated(move.from, move.to)}
      </p>
    {:else}
      <!-- The timeline: one grid of three fixed columns (what moves, its
         length, its lane), the ruler's row then a row per thing, each a
         subgrid of the timeline's columns. Narrower than a timeline's
         least, the lane takes a line of its own under its row's words. -->
      <!-- Under a finger the scroller keeps its scrollbar's room, so the
         lengths at the trailing edge never stand under it. -->
      <!-- Its scroller clips: it stands a step out on every side and pads
           the step back, so a focus ring on its edge (Play's, the first
           row's) is drawn whole (The One Ring Rule). -->
      <div
        class="-m-space-1 min-h-0 min-w-0 overflow-y-auto p-space-1 coarse:pe-space-4"
      >
        <div
          data-slot="timeline"
          class="grid min-w-0 grid-cols-(--cols) gap-x-space-3 @max-timeline/move:grid-cols-1"
          style:--cols={"minmax(var(--spacing-c-graph-move-name-w), 38%) minmax(0, 1fr)"}
          {@attach (node: HTMLElement) => {
            // Not passive: a pinch or a Ctrl-wheel zooms the lanes, never the page.
            node.addEventListener("wheel", wheel, { passive: false });
            return () => node.removeEventListener("wheel", wheel);
          }}
        >
          <div
            class="sticky top-0 z-2 col-span-full grid min-h-c-btn-h grid-cols-subgrid bg-surface-raised"
          >
            <div class="flex min-w-0 items-center">
              {@render transport()}
            </div>
            <div
              class="relative flex min-w-0 flex-col justify-end gap-space-1 px-space-2"
              data-slot="ruler"
            >
              <!-- Tall enough that its figures (at its top) and the
                   playhead's flag (at its foot) never meet: at 25px the
                   flag ran 3px into a figure standing over it. -->
              <Slider.Root
                class="relative block h-space-8 w-full cursor-ew-resize touch-none select-none coarse:h-c-btn-h-lg"
                max={Math.max(viewTo, viewFrom + 1)}
                min={viewFrom}
                onValueChange={(next: number) => onseek(Math.min(next, length))}
                onValueCommit={(next: number) => letGo(Math.min(next, length))}
                onpointerdown={() => {
                  scrubbing = true;
                }}
                step={1}
                thumbPositioning="exact"
                type="single"
                value={Math.min(viewTo, Math.max(viewFrom, handle))}
              >
                <div
                  bind:this={ruler}
                  class="absolute inset-0 overflow-x-clip type-code leading-none num"
                  aria-hidden="true"
                  data-slot="ruler-lane"
                  {@attach frameSize(
                    (node: HTMLElement) => [node.clientWidth, node] as const,
                    ([width, node]) => {
                      lane = width;
                      rulerLane = node;
                    }
                  )}
                >
                  {#each marks as mark (mark)}
                    <span
                      class="absolute start-(--at) bottom-0 h-space-1 w-px -translate-x-1/2 bg-border-control rtl:translate-x-1/2"
                      data-mark={mark}
                      style:--at={pct(mark)}
                    ></span>
                    {#if figured.has(mark)}
                      <!-- Centred on its mark; a figure at either end of the
                           lane stands from that end, so the lane's clip never
                           cuts it (its "0" stood half outside). -->
                      <span
                        class="absolute start-(--at) top-0 -translate-x-(--shift) text-ink-muted rtl:translate-x-(--shift) coarse:top-space-2"
                        style:--at={pct(mark)}
                        style:--shift={shiftOf(mark)}>{figure(mark)}</span
                      >
                    {/if}
                  {/each}
                </div>
                <!-- The playhead's flag: a pill standing on the ruler's
                   foot, its line running down the rows; under a finger
                   its area stays inside the ruler, never over a bar. -->
                <!-- Hidden while it stands outside the part the lanes show (zoomed). -->
                <Slider.Thumb
                  aria-label={words.scrub}
                  aria-valuetext={words.playhead(
                    figure(handle),
                    figure(Math.round(length))
                  )}
                  class={[
                    "pointer-hit bottom-0 block h-space-4 w-space-2 cursor-ew-resize rounded-pill bg-ink-strong shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 coarse:w-space-3",
                    (handle < viewFrom || handle > viewTo) && "invisible",
                  ]}
                  data-slot="playhead-head"
                  index={0}
                  onkeydown={rulerKey}
                />
                {#if repeat && loopFrom >= viewFrom && loopFrom <= viewTo}
                  <!-- Where a repeat goes round again from: at 0 until dragged. -->
                  <span
                    aria-label={words.repeatFrom(figure(loopFrom))}
                    aria-valuemax={Math.round(length)}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(loopFrom)}
                    class="pointer-hit touch-hit absolute top-0 start-(--at) z-1 block h-space-3 w-space-1 -translate-x-1/2 cursor-ew-resize touch-none rounded-pill bg-ink-muted focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 rtl:translate-x-1/2"
                    data-slot="repeat-from"
                    onkeydown={loopKey}
                    onpointerdown={dragAlong(setLoopFrom, () => rulerLane)}
                    role="slider"
                    style:--at={pct(loopFrom)}
                    tabindex="0"
                  ></span>
                {/if}
              </Slider.Root>
              {#if zoomed}
                {@render overviewStrip()}
              {/if}
            </div>
          </div>

          {#each entries as entry (entry.key)}
            {#if entry.kind === "head"}
              {@const open = !folded.includes(entry.group)}
              <!-- The agent's group: the house section head over its rows, its chevron folding them. -->
              <div
                class="col-span-full flex min-h-c-btn-h min-w-0 items-center border-t border-border-hairline"
                data-slot="clip-group"
              >
                <button
                  aria-expanded={open}
                  aria-label={words.groupFold(entry.group, open)}
                  class="mark-line pointer-hit touch-hit flex h-c-btn-h-sm min-w-0 items-center rounded-sm pe-space-2 type-meta text-ink-muted transition-control can-hover:hover:bg-surface-hover"
                  onclick={() => foldGroup(entry.group)}
                  type="button"
                >
                  <span
                    class="grid w-c-btn-h-xs flex-none place-items-center"
                    data-box
                  >
                    <IconChevronRight
                      aria-hidden="true"
                      class={[
                        "size-icon-sm transition-transform duration-(--duration-control) ease-out rtl:-scale-x-100",
                        open && "rotate-90 rtl:-rotate-90",
                      ]}
                    />
                  </span>
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{entry.group}</span
                  >
                </button>
              </div>
            {:else}
              {@const line = entry.line}
              {@const track = line.track}
              {@const name = lineName(line)}
              {@const open = isOpen(line)}
              {@const chosen = picked?.key === line.key}
              {@const edited = editsOf(track).size > 0}
              <!-- A row: one thing that moves, or under it one animation; one
               comment target named by its words, as a person says it. -->
              <div
                data-slot="clip"
                data-selected={chosen || undefined}
                class={[
                  "col-span-full grid min-w-0 grid-cols-subgrid border-t border-border-hairline",
                ]}
                {...lights(track)}
              >
                <div
                  class={[
                    "flex min-h-c-btn-h-lg min-w-0 items-center",
                    line.part && "ps-c-btn-h-xs",
                  ]}
                >
                  <!-- The row's one press: it opens or closes the row, its
                       chevron turning; what opens is under it. -->
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={name}
                    class="pointer-hit touch-hit flex h-c-btn-h-sm min-w-0 flex-1 items-center rounded-sm pe-space-1 text-start type-label transition-control data-chosen:bg-selected-bg can-hover:not-data-chosen:hover:bg-surface-hover"
                    data-chosen={chosen || undefined}
                    onclick={() => press(line)}
                    title={name}
                  >
                    <span
                      class="grid w-c-btn-h-xs flex-none place-items-center"
                      data-box
                    >
                      <IconChevronRight
                        aria-hidden="true"
                        class={[
                          "size-icon-sm transition-transform duration-(--duration-control) ease-out rtl:-scale-x-100",
                          open && "rotate-90 rtl:-rotate-90",
                          chosen ? "text-selected-ink" : "text-ink-muted",
                        ]}
                      />
                    </span>
                    {@render rowWords(line, chosen ? "open" : "rest")}
                  </button>
                  <!-- The undo glyph's slot, held in every row (as the Controls
                       face holds its column), so the row's press and its wash
                       keep one width as the glyph comes and goes, and the
                       lanes never move. -->
                  <span
                    class="flex h-c-btn-h-sm w-c-btn-h-xs flex-none items-center justify-center"
                  >
                    {#if edited}
                      {@const said = words.resetRow(name)}
                      <Tip label={said}>
                        {#snippet children(tip)}
                          <Button
                            {...tip}
                            aria-label={said}
                            data-edited
                            icon={IconReset}
                            onclick={() =>
                              onreset(
                                track.clips
                                  .filter((clip) => clip.was)
                                  .map((clip) => clip.id)
                              )}
                            press="pressable"
                            size="icon-xs"
                            tone="edited"
                            variant="ghost"
                          />
                        {/snippet}
                      </Tip>
                    {/if}
                  </span>
                </div>
                <div
                  class="relative flex min-w-0 items-center px-space-2 @max-timeline/move:min-h-c-btn-h"
                  data-slot="lane"
                >
                  <!-- A press on its empty part scrubs, as the ruler does; with Shift, a press on a bar too. -->
                  <div
                    class={[
                      "relative flex size-full min-w-0 cursor-ew-resize items-center",
                      zoomed && "overflow-x-clip",
                    ]}
                    onpointerdowncapture={laneScrub}
                    role="presentation"
                    title={words.laneScrub}
                  >
                    {@render back()}
                    <ClipBar
                      edges={edgesBesides}
                      {lang}
                      {name}
                      onlegs={(clip, legs, replay) =>
                        onretime([releg(clip, legs)], replay)}
                      onretime={(run, from, to, replay) =>
                        onretime(retimeRun(run, from, to), replay)}
                      view={{ from: viewFrom, to: viewTo }}
                      onselect={() => {
                        if (!open) {
                          press(line);
                        }
                      }}
                      {scale}
                      selected={chosen}
                      {track}
                    />
                    {@render playheadLine()}
                  </div>
                </div>
                {#if chosen}
                  <div
                    class="col-span-full min-w-0 ps-c-btn-h-xs pt-space-2 pb-space-3"
                    in:unfold
                    out:unfold
                  >
                    <ClipSettings
                      {lang}
                      {name}
                      onretime={(next) => onretime(next)}
                      {track}
                    />
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
        <!-- What the bars' colours say: each kind on the face, its
             swatch the bar's own wash and edge, then its word. -->
        <ul
          aria-label={words.kindsKey}
          class="m-0 flex list-none flex-wrap gap-x-space-4 gap-y-space-1 border-t border-border-hairline p-0 pt-space-3"
          data-slot="kinds"
        >
          {#each kindsShown as kind (kind)}
            <li
              class="mark-line flex items-center gap-space-1 type-meta text-ink-muted"
            >
              <span
                aria-hidden="true"
                class={["h-space-2 w-space-4 rounded-hair border", BAR[kind]]}
                data-box
              ></span>
              <span>{words.kinds[kind]}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>
