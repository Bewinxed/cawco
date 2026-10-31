/**
 * A component canvas's design graph (Projects spec §5.10, "The design
 * graph"): what its page holds (`cawco:graph`, core design-graph.ts
 * `GraphModel`), the tab shown, the state kept in each states file and the
 * one a hover previews; each change asks the page what to stand on its
 * stage (`cawco:stage`). The kept states are kept per session, as the
 * canvas's view is, so the graph opens on the state kept last, or on the
 * step its address names (`?step=<story>`), its dock folded when the
 * address says so (`?dock=folded`).
 *
 * The dock's state too: the kept move as its page played it (`cawco:move`),
 * the agent's timing of each clip and the person's edits of it (Original |
 * Edited, the owner's pick "segments") and the playhead; a clip's
 * controls open in its row (his pick). Every edit's timing goes to the page as
 * runs to play (`cawco:move-ask`) and to the artifact as `tuned`, each value
 * marked a token or ad hoc.
 */

import type { Pin } from "@cawco/core/comments";
import {
  type ClipTiming,
  curveOf,
  type DialsModel,
  durationTokenOf,
  easingTokenOf,
  type GraphModel,
  type GraphSection,
  graphOf,
  type MoveModel,
  onState,
  pinPathOf,
  runEnd,
  runOf,
  type SectionGraph,
  type StagePoint,
  type StepState,
  samePoint,
  stepsOf,
  type TunedClip,
} from "@cawco/core/design-graph";
import { INTERACTIONS } from "@cawco/core/stage";
import { designGraphWords } from "@cawco/core/words/design-graph";
import { store, stored } from "../../storage";

/** Every interaction a kept point may stand at (core stage.ts `INTERACTIONS`). */
const KNOWN_INTERACTIONS: ReadonlySet<unknown> = new Set(INTERACTIONS);

/** What a session keeps of its graph: the tab, each file's kept state, the panel's and dock's sizes, and the person's edits. */
interface Kept {
  /** The steps bar folded to its pill. */
  barHidden: boolean;
  dockH: number | null;
  edits: Record<string, ClipTiming[]>;
  file: string | null;
  graphH: number | null;
  /** The index standing over the stage, as the person last switched it; null until they have. */
  index: Index | null;
  kept: Record<string, StagePoint>;
  open: boolean;
  panelW: number | null;
}

/** The two indexes over the stage (the primitives spec §0): the step slider, or the overview graph. */
export type Index = "steps" | "graph";

const NOTHING_KEPT: Kept = {
  barHidden: false,
  file: null,
  index: null,
  kept: {},
  open: true,
  panelW: null,
  graphH: null,
  dockH: null,
  edits: {},
};

const sizeOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** A kept point as storage holds it: a file, a story, an interaction it reaches. */
const isPoint = (value: unknown): value is StagePoint => {
  const point: Partial<Record<keyof StagePoint, unknown>> | null =
    value && typeof value === "object" ? value : null;
  return (
    typeof point?.file === "string" &&
    typeof point.story === "string" &&
    KNOWN_INTERACTIONS.has(point.interaction)
  );
};

function keptOf(key: string): Kept {
  try {
    const parsed: unknown = JSON.parse(stored("local", key) ?? "null");
    const raw: Partial<Record<keyof Kept, unknown>> | null =
      parsed && typeof parsed === "object" ? parsed : null;
    const kept = Object.fromEntries(
      Object.entries(
        raw?.kept && typeof raw.kept === "object" ? raw.kept : {}
      ).filter((entry): entry is [string, StagePoint] => isPoint(entry[1]))
    );
    return {
      barHidden: raw?.barHidden === true,
      file: typeof raw?.file === "string" ? raw.file : null,
      index:
        raw?.index === "steps" || raw?.index === "graph" ? raw.index : null,
      kept,
      open: raw?.open !== false,
      panelW: sizeOf(raw?.panelW),
      graphH: sizeOf(raw?.graphH),
      dockH: sizeOf(raw?.dockH),
      edits:
        raw?.edits && typeof raw.edits === "object"
          ? (raw.edits as Record<string, ClipTiming[]>)
          : {},
    };
  } catch {
    return { ...NOTHING_KEPT };
  }
}

/** The step the address opens on (`?step=Several`), a story name; null when it names none. */
function addressedStep(): string | null {
  if (typeof location === "undefined") {
    return null;
  }
  return new URLSearchParams(location.search).get("step") || null;
}

/** The address opens the dock folded to its head (`?dock=folded`), as far down as its top edge drags it. */
function addressedDockFolded(): boolean {
  if (typeof location === "undefined") {
    return false;
  }
  return new URLSearchParams(location.search).get("dock") === "folded";
}

/** A section's first state, at rest: where its graph opens before anything was kept. */
const firstOf = (section: GraphSection, graph: SectionGraph): StagePoint => ({
  file: section.file,
  story: graph.machines[0]?.states[0]?.story ?? section.stories[0]?.name ?? "",
  interaction: "rest",
});

/** Whether a point names a story its section holds, at an interaction that story reaches. */
const holds = (section: GraphSection, point: StagePoint): boolean => {
  const story = section.stories.find((one) => one.name === point.story);
  return (
    !!story &&
    (point.interaction === "rest" ||
      story.interactions.includes(point.interaction))
  );
};

/** Where a session keeps its graph (`Kept`), by the pane's instance. */
export const keptKeyOf = (instanceId: string): string =>
  `cawco-design-graph:${instanceId}`;

/** Two timings that run alike. */
const sameTiming = (a: ClipTiming, b: ClipTiming): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** A clip's timing as the agent wrote it, from what the page read of it. */
const timingOf = (clip: MoveModel["clips"][number]): ClipTiming => ({
  start: clip.start,
  duration: clip.duration,
  curve: curveOf(clip.easing),
});

/** The move's key in what a session keeps: its states file and the state it moves into. */
const moveKey = (move: Pick<MoveModel, "file" | "to">) =>
  `${move.file}|${move.to}`;

export class DesignGraph {
  model = $state.raw<GraphModel | null>(null);
  /** The tab: the states file whose graph and kept state stand. */
  file = $state<string | null>(null);
  /** Each states file's kept state; replaced whole on each change, so what goes to the page is plain values its `postMessage` can clone. */
  kept = $state.raw<Record<string, StagePoint>>({});
  /** What a hover or a held press previews on the page, over the kept state. */
  peek = $state.raw<StagePoint | null>(null);
  /** The panel shown, or folded into its tab. */
  open = $state(true);
  /** The steps bar folded to its pill, kept per session as the panel's fold is. */
  barHidden = $state(false);
  /** A narrow pane's drawer: the face it shows. */
  face = $state<"graph" | "move">("graph");
  /** The person's sizes: the panel's width, the graph's height, the dock's height; null is the default. */
  panelW = $state<number | null>(null);
  graphH = $state<number | null>(null);
  dockH = $state<number | null>(null);

  /** The kept move as its page played it, or null when the kept state has none that animates. */
  move = $state.raw<MoveModel | null>(null);
  /** The agent's timing of each clip, by id, as the page read it. */
  original = $state.raw<ClipTiming[]>([]);
  /** The person's timing of each clip: the agent's until edited. */
  edited = $state.raw<ClipTiming[]>([]);
  /** Which the page plays and the dock draws (the owner's pick "segments"). */
  view = $state<"original" | "edited">("edited");
  /** The clip whose controls are open; null for none. */
  chosen = $state<number | null>(null);
  /** The playhead, ms since the move began; null at rest (the move's end, as the frame stands). */
  time = $state<number | null>(null);
  playing = $state(false);
  looping = $state(false);

  /** The agent's dials and the values its frames draw with. */
  dials = $state.raw<DialsModel | null>(null);

  /** The index the person switched to, kept per session; null until they have, when the agent's `steps` decide. */
  #index = $state<Index | null>(null);
  /** The index standing over the stage: the person's switch, else the slider when the agent gave `steps`, else the graph. */
  index = $derived<Index>(
    this.#index ?? (this.model?.steps?.length ? "steps" : "graph")
  );
  /**
   * The ultrawide pair (the owner's pick "pair"): the hovered state stands
   * in a page of its own beside the kept one, so the kept page is never
   * asked to preview it.
   */
  pairing = $state(false);
  /** Where the slider's thumb stands while held, in stops from the first (2.4: two fifths of the way from the third to the fourth); null at rest on the kept stop. */
  scrubAt = $state<number | null>(null);

  /** The section of the tab shown. */
  section = $derived(
    this.model?.sections.find((one) => one.file === this.file) ?? null
  );
  /** Its graph: machines, states, variations and links. */
  graph = $derived(
    this.section && this.model
      ? graphOf(this.section, this.model.group, this.model.edges)
      : null
  );
  /** The state kept in the tab shown. */
  keptHere = $derived(this.file ? (this.kept[this.file] ?? null) : null);
  /** The step slider's stops: the agent's `steps` in the tab shown, else its every story in file order. */
  steps = $derived<StepState[]>(
    this.section ? stepsOf(this.section, this.model?.steps) : []
  );
  /** The kept state's stop on the slider; -1 when it is none of them (a variation the steps don't name). */
  at = $derived(
    this.steps.findIndex((one) => one.point.story === this.keptHere?.story)
  );
  /** The timing the dock draws and the page plays: the original's under Original. */
  timings = $derived(this.view === "original" ? this.original : this.edited);
  /** The clips the person changed, by id. */
  changed = $derived(
    new Set(
      this.edited.flatMap((one, id) => {
        const was = this.original[id];
        return was && !sameTiming(one, was) ? [id] : [];
      })
    )
  );
  /** When the move's last run ends, ms: its length on the ruler and the playhead's end. */
  length = $derived(
    Math.max(0, ...this.timings.map((one) => one.start + one.duration))
  );
  /** When its last run rests, a spring's settle included. */
  playLength = $derived(Math.max(0, ...this.timings.map(runEnd)));

  readonly #key: string;
  readonly #post: (message: object) => void;
  #room = { end: 0, bottom: 0, top: 0 };
  /** The scrub's seek waits for the next frame: one ask per frame however fast the pointer moves. */
  #scrubFrame = 0;
  #said = "";
  #clock = 0;
  #tuning: ReturnType<typeof setTimeout> | undefined;
  #edits: Record<string, ClipTiming[]>;
  /** The story the address names to open on, over the kept one; stood once, in the first section that holds it. */
  #opening: string | null;

  /** `post`: to the page, on its own origin (the pane's). */
  constructor(instanceId: string, post: (message: object) => void) {
    this.#key = keptKeyOf(instanceId);
    this.#post = post;
    const kept = keptOf(this.#key);
    this.#opening = addressedStep();
    this.file = kept.file;
    this.kept = kept.kept;
    this.open = kept.open;
    this.barHidden = kept.barHidden;
    this.#index = kept.index;
    this.panelW = kept.panelW;
    this.graphH = kept.graphH;
    // Folded is the dock's least height: GraphPanel holds it to its head (`dockFloor`).
    this.dockH = addressedDockFolded() ? 0 : kept.dockH;
    this.#edits = kept.edits;
  }

  /** The page said what it holds: the tab and every file's kept state stand where they still can. */
  heard(model: GraphModel): void {
    this.model = model;
    if (!model.sections.some((one) => one.file === this.file)) {
      this.file = model.sections[0]?.file ?? null;
    }
    const kept = { ...this.kept };
    for (const section of model.sections) {
      const had = kept[section.file];
      // A section still on its way keeps what was kept: its stories aren't all known yet.
      if (section.state === "drawn" && had && !holds(section, had)) {
        delete kept[section.file];
      }
      const opening: StagePoint | null = this.#opening
        ? { file: section.file, story: this.#opening, interaction: "rest" }
        : null;
      if (opening && holds(section, opening)) {
        kept[section.file] = opening;
        this.file = section.file;
        this.#opening = null;
      }
      if (!kept[section.file]) {
        kept[section.file] = firstOf(
          section,
          graphOf(section, model.group, model.edges)
        );
      }
    }
    this.kept = kept;
    if (
      this.peek &&
      !this.section?.stories.some((one) => one.name === this.peek?.story)
    ) {
      this.peek = null;
    }
    this.#keep();
    // Said on each word from the page: a page loaded anew has to be told again.
    this.again();
  }

  /** A press on a state or a chip: it is kept, its tab shown. */
  keepAt(point: StagePoint): void {
    this.kept = { ...this.kept, [point.file]: point };
    this.file = point.file;
    this.peek = null;
    this.#keep();
    this.ask();
  }

  /** A hover or a held press previews a state over the kept one; null lets it go. */
  preview(point: StagePoint | null): void {
    const next = point && !samePoint(point, this.keptHere) ? point : null;
    if (samePoint(next, this.peek) || (next === null && this.peek === null)) {
      return;
    }
    this.peek = next;
    this.ask();
  }

  /** Another tab: its kept state stands. */
  show(file: string): void {
    if (file === this.file) {
      return;
    }
    this.file = file;
    this.peek = null;
    this.#keep();
    this.ask();
  }

  /** The pair stands or goes: the kept page stops or starts previewing the hover. */
  setPairing(pairing: boolean): void {
    if (this.pairing !== pairing) {
      this.pairing = pairing;
      this.ask();
    }
  }

  /** The panel folded into its tab, or grown back out of it. */
  setOpen(open: boolean): void {
    this.open = open;
    this.#keep();
  }

  /** The steps bar folded to its pill, or grown back out of it. */
  setBarHidden(hidden: boolean): void {
    this.barHidden = hidden;
    this.#keep();
  }

  /** The person's sizes, kept for the session; null goes back to the default. */
  resize(sizes: {
    dockH?: number | null;
    graphH?: number | null;
    panelW?: number | null;
  }): void {
    if ("panelW" in sizes) {
      this.panelW = sizes.panelW ?? null;
    }
    if ("graphH" in sizes) {
      this.graphH = sizes.graphH ?? null;
    }
    if ("dockH" in sizes) {
      this.dockH = sizes.dockH ?? null;
    }
    this.#keep();
  }

  /** The room the index, the panel and the dock take from the page, in CSS px: its inline end, its foot and its top. */
  room(end: number, bottom: number, top = 0): void {
    const next = {
      end: Math.round(end),
      bottom: Math.round(bottom),
      top: Math.round(top),
    };
    if (
      next.end === this.#room.end &&
      next.bottom === this.#room.bottom &&
      next.top === this.#room.top
    ) {
      return;
    }
    this.#room = next;
    this.ask();
  }

  /* --- The step slider ----------------------------------------------------- */

  /** The person switched the index: kept for the session. */
  setIndex(index: Index): void {
    this.#index = index;
    this.peek = null;
    this.#keep();
    this.ask();
  }

  /** Whether a stop's story plays a move into it (`from` with a `play`): only then does the slider hold an in-between. */
  #moves(step: StepState | undefined): boolean {
    return !!(
      step &&
      !step.missing &&
      this.section?.stories.find((one) => one.name === step.point.story)?.from
    );
  }

  /**
   * The thumb held at `place` stops from the first (the primitives spec
   * §1.2): between stop i and i+1 the next is kept, so the page plays the
   * move into it, and held at that fraction of its length; a stop whose
   * story plays no move has no in-between, and the thumb snaps at the
   * midpoint. One seek per frame.
   */
  scrub(place: number): void {
    const last = this.steps.length - 1;
    if (last < 0) {
      return;
    }
    const at = Math.max(0, Math.min(last, place));
    this.scrubAt = at;
    const from = Math.floor(at);
    const fraction = at - from;
    const next = this.steps[Math.min(last, from + 1)];
    if (fraction === 0 || !this.#moves(next)) {
      const stop = this.steps[fraction < 0.5 ? from : from + 1];
      if (stop && !stop.missing && !samePoint(stop.point, this.keptHere)) {
        this.keepAt(stop.point);
      }
      return;
    }
    if (next && !samePoint(next.point, this.keptHere)) {
      this.keepAt(next.point);
    }
    cancelAnimationFrame(this.#scrubFrame);
    this.#scrubFrame = requestAnimationFrame(() => {
      if (this.move && this.move.to === next?.point.story) {
        this.seek(fraction * this.playLength);
      }
    });
  }

  /** The thumb let go: it lands on the nearer stop and keeps it, the move resting as it ends. */
  release(): void {
    const at = this.scrubAt;
    this.scrubAt = null;
    cancelAnimationFrame(this.#scrubFrame);
    if (at === null) {
      return;
    }
    const near = Math.round(at);
    const stop = this.steps[near];
    if (stop && !stop.missing) {
      this.keepAt(stop.point);
    }
    if (this.move) {
      this.stop();
    }
  }

  /** ← and → (J and K): the next stop the keys reach, a missing one skipped. */
  stepBy(delta: -1 | 1): void {
    // From before the first stop going on, after the last going back, when the kept state is none of them.
    const outside = delta > 0 ? -1 : this.steps.length;
    let at = this.at < 0 ? outside : this.at;
    do {
      at += delta;
    } while (this.steps[at]?.missing);
    const stop = this.steps[at];
    if (stop) {
      this.keepAt(stop.point);
    }
  }

  /** Home and End: the first or the last stop the keys reach. */
  stepTo(end: "first" | "last"): void {
    const order = end === "first" ? this.steps : [...this.steps].reverse();
    const stop = order.find((one) => !one.missing);
    if (stop) {
      this.keepAt(stop.point);
    }
  }

  /** The page asked again (a new load said hello): it stands what stands now. */
  again(): void {
    this.#said = "";
    this.ask();
  }

  /** Asks the page to stand the state kept, or the one previewed, in the room left. */
  ask(): void {
    const kept = this.keptHere;
    if (!kept) {
      return;
    }
    const message = {
      type: "cawco:stage",
      kept,
      peek: this.pairing ? null : this.peek,
      room: this.#room,
    };
    const said = JSON.stringify(message);
    if (said === this.#said) {
      return;
    }
    this.#said = said;
    this.#post(message);
  }

  /* --- The dock ------------------------------------------------------------ */

  /** The page played the kept move (or the kept state has none): its clips, the person's edits of it kept from before. */
  heardMove(move: MoveModel | null): void {
    this.#stopClock();
    this.move = move;
    this.chosen = null;
    this.time = null;
    if (!move) {
      this.original = [];
      this.edited = [];
      return;
    }
    this.original = move.clips.map(timingOf);
    const had = this.#edits[moveKey(move)];
    this.edited =
      had?.length === this.original.length
        ? had.map((one) => ({ ...one }))
        : this.original.map((one) => ({ ...one }));
    this.view = "edited";
  }

  /** Each clip's run as the page plays it, for the view drawn. */
  #runs() {
    return this.timings.map((one, id) => runOf(id, one));
  }

  /** Plays the move from the start, once or on a loop (the owner's pick "replay" after each edit). */
  play(): void {
    if (!this.move) {
      return;
    }
    this.#stopClock();
    this.playing = true;
    this.time = 0;
    this.#post({
      type: "cawco:move-ask",
      ask: { op: "play", runs: this.#runs() },
    });
    const length = this.playLength;
    const started = performance.now();
    const tick = (now: number) => {
      // A frame's time is when the frame began, which can stand before the press's own `performance.now()`: never under 0.
      const at = Math.max(0, now - started);
      if (at < length) {
        this.time = at;
        this.#clock = requestAnimationFrame(tick);
        return;
      }
      if (this.looping) {
        this.play();
        return;
      }
      this.playing = false;
      this.time = null;
      this.#post({ type: "cawco:move-ask", ask: { op: "rest" } });
    };
    this.#clock = requestAnimationFrame(tick);
  }

  /** Stops playing: the frame stands as the move left it. */
  stop(): void {
    this.#stopClock();
    this.time = null;
    this.#post({ type: "cawco:move-ask", ask: { op: "rest" } });
  }

  /** The playhead held at `ms`: the page stands that moment of the move. */
  seek(ms: number): void {
    if (!this.move) {
      return;
    }
    this.#stopClock();
    const time = Math.max(0, Math.min(this.playLength, ms));
    this.time = time;
    this.#post({
      type: "cawco:move-ask",
      ask: { op: "seek", runs: this.#runs(), time },
    });
  }

  #stopClock(): void {
    cancelAnimationFrame(this.#clock);
    this.#clock = 0;
    this.playing = false;
  }

  /** Original | Edited: the page plays the one shown. */
  setView(view: "original" | "edited"): void {
    if (this.view === view) {
      return;
    }
    this.view = view;
    this.chosen = null;
    this.play();
  }

  /**
   * The person's timing of clip `id` (or every clip): kept, said to the
   * page and the artifact. `replay`: a drop, a chip changed or a curve
   * picked plays the move once from the start (the owner's pick "replay");
   * a keyboard nudge or a held slider stays still, the playhead where it
   * stands.
   */
  edit(next: ClipTiming[], { replay }: { replay: boolean }): void {
    if (!this.move) {
      return;
    }
    this.edited = next;
    if (this.changed.size === 0) {
      this.view = "edited";
    }
    this.#edits = { ...this.#edits, [moveKey(this.move)]: next };
    this.#keep();
    this.#tune();
    if (replay) {
      this.play();
    } else if (this.time !== null && !this.playing) {
      this.seek(this.time);
    }
  }

  /** One clip's timing changed. */
  editClip(
    id: number,
    change: (timing: ClipTiming) => ClipTiming,
    options: { replay: boolean }
  ): void {
    const was = this.edited[id];
    if (!was) {
      return;
    }
    const next = this.edited.map((one, at) => (at === id ? change(one) : one));
    if (sameTiming(next[id] as ClipTiming, was)) {
      return;
    }
    this.edit(next, options);
  }

  /** Every clip back to the agent's timing. */
  resetAll(): void {
    this.edit(
      this.original.map((one) => ({ ...one })),
      { replay: true }
    );
  }

  /** One clip back to the agent's timing. */
  resetClip(id: number): void {
    const was = this.original[id];
    if (was) {
      this.editClip(id, () => ({ ...was }), { replay: true });
    }
  }

  /** The person's timing as `tuned`, once they stop: each changed clip, its tokens or ad hoc. */
  #tune(): void {
    const { move } = this;
    if (!move) {
      return;
    }
    clearTimeout(this.#tuning);
    this.#tuning = setTimeout(() => {
      const tuned: TunedClip[] = [...this.changed].flatMap((id) => {
        const clip = move.clips[id];
        const timing = this.edited[id];
        if (!(clip && timing)) {
          return [];
        }
        const run = runOf(id, timing);
        const { curve } = timing;
        return [
          {
            move: designGraphWords.moveTuned(move.from, move.to),
            animation: `${clip.element} ${clip.property}`,
            delay: Math.round(run.start),
            duration: Math.round(run.duration),
            easing: run.easing,
            durationToken:
              durationTokenOf(timing.duration, move.tokens.durations)?.name ??
              null,
            easingToken:
              easingTokenOf(curve, move.tokens.easings)?.name ?? null,
            spring:
              curve.kind === "spring"
                ? {
                    response: Math.round(timing.duration),
                    bounce: curve.bounce,
                    mass: curve.mass,
                    velocity: curve.velocity,
                  }
                : null,
          },
        ];
      });
      this.#post({ type: "cawco:move-ask", ask: { op: "tune", tuned } });
    }, 300);
  }

  /* --- Pins on states ------------------------------------------------------- */

  /**
   * The state a pin was placed on, in words (core design-graph.ts
   * `pinPathOf`): "On Saving it › Save failed", "On the state …" for one
   * placed on a node, or that its state is gone from the file; null for a pin
   * placed on no state, or before the page said its graph.
   */
  stateWords(anchor: Pin["anchor"]): string | null {
    const sheet = "sheet" in anchor ? anchor.sheet : undefined;
    if (!(sheet && this.model)) {
      return null;
    }
    const path = pinPathOf(this.model, sheet);
    if (path === undefined) {
      return null;
    }
    if (path === null) {
      return designGraphWords.stateGone;
    }
    return sheet.node
      ? designGraphWords.onNode(path)
      : designGraphWords.onState(path);
  }

  /** Whether a pin stands on the state kept now (or one a hover previews): those on other states fold into the rail's own group. */
  onKept(anchor: Pin["anchor"]): boolean {
    return onState(anchor, this.keptHere, this.peek);
  }

  /** The state a pin was placed on, to keep it from the rail: its file, story and interaction; null for a pin on no state. */
  pointOfPin(anchor: Pin["anchor"]): StagePoint | null {
    const sheet = "sheet" in anchor ? anchor.sheet : undefined;
    return sheet?.state
      ? {
          file: sheet.file,
          story: sheet.story,
          interaction: sheet.state.interaction,
        }
      : null;
  }

  /* --- Dials ----------------------------------------------------------------- */

  /** The page said its dials and the values its frames draw with. */
  heardDials(dials: DialsModel): void {
    this.dials = dials;
  }

  /** A dial the person moved: every frame draws it. */
  dial(name: string, value: boolean | number | string): void {
    if (this.dials) {
      this.dials = {
        ...this.dials,
        values: { ...this.dials.values, [name]: value },
      };
    }
    this.#post({ type: "cawco:dial", name, value });
  }

  #keep(): void {
    const kept: Kept = {
      barHidden: this.barHidden,
      file: this.file,
      index: this.#index,
      kept: this.kept,
      open: this.open,
      panelW: this.panelW,
      graphH: this.graphH,
      dockH: this.dockH,
      edits: this.#edits,
    };
    store("local", this.#key, JSON.stringify(kept));
  }
}
