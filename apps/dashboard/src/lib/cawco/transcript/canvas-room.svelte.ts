/**
 * The composer's canvas (DESIGN.md Artifact panel, canvas and ink; Composer,
 * The pen's swipe): the draft's canvas standing over the field, grown out of
 * the pill as the recall wheel grows, the field below it writable.
 *
 * - **Open.** The grown shape (grown.ts) rises out of the pill's top edge
 *   over `--dur-grow` and keeps rising until the canvas stands over the
 *   column above the field; the canvas (its stage, canvas/stage.svelte.ts)
 *   is clipped to the shape as it grows. Reopened from its chip, the canvas
 *   opens out of the chip's box on the same clock.
 * - **Resize.** Its top edge's grab drags its height between 40% of the
 *   column and the column less the field, and settles on the house spring
 *   (motion/spring.ts) at the finger's speed; a press mid-settle takes it
 *   from where it stands. Its left and right edges' grabs drag that edge
 *   alone, the other staying, its width from the pill's to the column's
 *   less `--space-3` each side, settling the same way; the grown shape's
 *   shoulders step out from the pill's edges to it (grown.ts `wide`). The
 *   height and the width chosen are kept across Done and reopen.
 * - **Done** folds it over `--dur-grow-exit` into its chip, its picture the
 *   chip's thumbnail. The rail's **Remove** folds it back into the pill on
 *   the same clock, leaves no chip, and takes it out of the message as the
 *   chip's remove does; the panel still lists it.
 * - **Dock** flies the same iframe into the artifact panel (280ms on the
 *   drawer curve) while the shape gives the field's room back over the
 *   composer's clock (`--dur-control`, ease-out); Undock flies it back.
 * - **Send** carries its `.excalidraw` file, its outline and its picture.
 *
 * Every motion is a Web Animation, so each turns back from where it is
 * drawn and the probe scrubs it. With reduced motion each fades
 * (`--dur-fade`) and nothing travels.
 */
import { tick } from "svelte";
import {
  canvasSent,
  createDraftCanvas,
  exportCanvas,
  showArtifact,
} from "../artifact-api";
import {
  type Box,
  type Edge,
  type GrabValue,
  type handBack,
  holdStage,
  letGo,
  type Stage,
  stages,
  watch,
} from "../canvas/stage.svelte";
import { closePreview, type SendExtras } from "../client.svelte";
import { CURVE, dur, motionOk } from "../motion/curves.svelte";
import { integrate, spring } from "../motion/spring";
import { inks } from "../preview/ink.svelte";
import type { ComposerDraft, DraftCanvas } from "./composer-draft.svelte";
import { boxCut, type ClipBox, GrownShape, measureShape } from "./grown";

/** Keyframes a growth or fold of the shape is sampled at: its own curve, linear between. */
const STEPS = 24;
/** How much of the drag past a bound the canvas follows (DESIGN.md, Drag to dismiss). */
const RUBBER = 0.35;
/** The furthest past a bound it follows, as a share of its height. */
const RUBBER_MAX = 0.25;
/** The shortest share of the column the canvas stands at (§5.10: "floor 40 % of the column"). */
const FLOOR = 0.4;
/**
 * How far a release carries the height, s: Apple's projection at the
 * normal deceleration rate, 0.998 a ms (`v / 1000 * d / (1 - d)`), our call
 * from WWDC 2018 "Designing Fluid Interfaces".
 */
const PROJECT = 0.998 / (1 - 0.998) / 1000;
/**
 * How long the pointer may stand still before it lets go and still carry
 * its last speed, ms: past it the release carries nothing and the edge
 * stays where it was let go. Our call: six frames at 60Hz, past any gap
 * between a moving finger's events.
 */
const STILL_MS = 100;
/** A keyboard step of the grab, px. */
const KEY_STEP = 25;

export interface RoomParts {
  /** The chip, while the canvas is folded. */
  chip: () => HTMLElement | undefined;
  /** The composer's box, whose top the canvas stands on (`.composer`). */
  column: () => HTMLElement | undefined;
  /** The whole dock: the column the canvas stands in. */
  dock: () => HTMLElement | undefined;
  draft: () => ComposerDraft;
  field: () => HTMLTextAreaElement | undefined;
  pill: () => HTMLElement | undefined;
  /** The session the canvas is made in and sent to. */
  session: () => string | undefined;
  shell: () => HTMLElement | undefined;
  /** The canvas's box over the field, while it stands there. */
  slot: () => HTMLElement | undefined;
}

/** How far the canvas stands past the pill's left and right edges, px. */
interface Wide {
  left: number;
  right: number;
}

/** What the room's motion reads once before it writes: every box in px. */
interface Sizes {
  /** The shape's box and the stage's, in the shell's terms (grown.ts ClipBox). */
  halo: ClipBox;
  /** How far the column's top stands over the pill's (the chips, a notice). */
  lift: number;
  max: number;
  min: number;
  /** How far each side may reach past the pill: to the column's edge less `--space-3`. */
  reach: Wide;
  size: ReturnType<typeof measureShape>["size"];
  stage: ClipBox;
  wide: Wide;
}

/** A drag's coordinate grows the edge's value (+1) or shrinks it (-1): up is taller, outward is wider. */
const SIGN: Record<Edge, number> = { top: -1, left: -1, right: 1 };

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The page drawn with every finite animation under `root` at its end, for one read. */
function atRest<T>(read: () => T): T {
  const runs = document
    .getAnimations()
    .filter((run) =>
      Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
    );
  const was = runs.map((run) => run.currentTime);
  for (const run of runs) {
    run.currentTime = Number(run.effect?.getComputedTiming().endTime);
  }
  const value = read();
  runs.forEach((run, at) => {
    run.currentTime = was[at];
  });
  return value;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export class CanvasRoom {
  /** The canvas stands over the field (growing, grown or folding). */
  up = $state(false);
  /** Its height, px: the slot's, the stage's box being a pixel inside it. */
  height = $state(0);
  /** The chip is drawn but not shown: the canvas is flying into it or out of it. */
  chipHidden = $state(false);
  /** Making, reading or sending it, said under the chip or the pill. */
  error = $state("");
  /** A canvas is being made or read for a send. */
  working = $state(false);

  readonly #parts: RoomParts;
  readonly #holder = Symbol("composer");
  #stage: Stage | null = null;
  #shape: GrownShape | null = null;
  #sizes: Sizes | null = null;
  /** The height the reader chose by the grab, kept while it fits. */
  #chosen: number | null = null;
  /** How far past the pill each side was dragged, kept while it fits. */
  #chosenWide: Wide = { left: 0, right: 0 };
  /** The motion running now, which the next one replaces from where it is drawn. */
  #runs: Animation[] = [];
  #settle: { run: Animation; frame: number; edge: Edge } | null = null;
  #drag: {
    edge: Edge;
    id: number;
    /** The pointer's coordinate along the drag (y for the top, x for a side) at the press. */
    at: number;
    from: number;
    last: number;
    lastAt: number;
    /** The value's speed, px/s. */
    v: number;
  } | null = null;

  constructor(parts: RoomParts) {
    this.#parts = parts;
  }

  get draft(): ComposerDraft {
    return this.#parts.draft();
  }

  /** The stage the room shows, held while the draft has its canvas. */
  get stage(): Stage | null {
    return this.#stage;
  }

  #hold(canvas: DraftCanvas): Stage {
    const session = this.#parts.session() as string;
    if (this.#stage && this.#stage.id !== canvas.id) {
      this.#letGoStage();
    }
    const stage = holdStage(this.#holder, session, canvas.id, canvas.name);
    this.#stage = stage;
    stage.actions.composer = {
      dock: () => this.dock(),
      done: () => this.fold(),
      remove: () => this.discard(),
    };
    stage.grab = {
      down: (edge, event) => this.#grabDown(edge, event),
      key: (edge, event) => this.#grabKey(edge, event),
    };
    return stage;
  }

  /** The side grabs show while the canvas stands still over the field, and go as it moves. */
  #edges(shown: boolean): void {
    if (this.#stage) {
      this.#stage.edgesShown = shown;
    }
  }

  #letGoStage(): void {
    const stage = this.#stage;
    if (!stage) {
      return;
    }
    if (stage.at === "composer") {
      stage.standAt(null);
    }
    stage.actions.composer = undefined;
    stage.grab = null;
    stage.grabValue = null;
    stage.edgesShown = false;
    stage.slots.composer = undefined;
    if (stage.el) {
      stage.el.style.clipPath = "";
    }
    letGo(this.#holder, stage.id);
    this.#stage = null;
  }

  // --- sizes ------------------------------------------------------------------

  /** Every size, read once before anything is written, the page at rest. */
  #measure(): Sizes | null {
    const shell = this.#parts.shell();
    const pill = this.#parts.pill();
    const field = this.#parts.field();
    const dock = this.#parts.dock();
    const column = this.#parts.column();
    if (!(shell && pill && field && dock && column)) {
      return null;
    }
    return atRest(() => {
      const { size } = measureShape(shell, pill, field);
      const at = shell.getBoundingClientRect();
      const columnTop = column.getBoundingClientRect().top;
      const room = dock.getBoundingClientRect();
      const gap = Number.parseFloat(
        getComputedStyle(shell).getPropertyValue("--space-3")
      );
      const lift = at.top - columnTop;
      const max = Math.max(0, columnTop - room.top - gap);
      const min = Math.min(max, FLOOR * room.height);
      const height = Math.min(max, Math.max(min, this.#chosen ?? max));
      const reach = {
        left: Math.max(0, at.left - room.left - gap),
        right: Math.max(0, room.right - gap - at.right),
      };
      const wide = {
        left: Math.min(reach.left, this.#chosenWide.left),
        right: Math.min(reach.right, this.#chosenWide.right),
      };
      return this.#boxes({ size, lift, min, max, reach, wide }, height);
    });
  }

  #boxes(at: Omit<Sizes, "halo" | "stage">, height: number): Sizes {
    this.height = height;
    const { size, lift, min, max, reach, wide } = at;
    return {
      size,
      lift,
      min,
      max,
      reach,
      wide,
      halo: { left: 0, bottom: 0, height: size.base + lift + height },
      stage: {
        left: 1 - wide.left,
        bottom: size.base + lift,
        height: height - 1,
      },
    };
  }

  /** The shape's reach over the pill: the chips' row and the canvas. */
  #ext(sizes = this.#sizes): number {
    return sizes ? sizes.lift + sizes.stage.height + 1 : 0;
  }

  /** The slot written to the canvas's box: its height and how far each side stands past the pill. */
  #slotTo(slot: HTMLElement, sizes: Sizes): void {
    slot.style.height = `${sizes.stage.height}px`;
    slot.style.left = `${1 - sizes.wide.left}px`;
    slot.style.right = `${1 - sizes.wide.right}px`;
  }

  /** Each grab's value and bounds, for a screen reader: the height, and the width each side holds. */
  #grabValues(sizes: Sizes): Record<Edge, GrabValue> {
    const { w } = sizes.size;
    const { wide, reach } = sizes;
    const now = w + wide.left + wide.right;
    return {
      top: { min: sizes.min, max: sizes.max, now: this.height },
      left: { min: w + wide.right, max: w + wide.right + reach.left, now },
      right: { min: w + wide.left, max: w + wide.left + reach.right, now },
    };
  }

  /**
   * The canvas at `height` and `wide`: the shape, the stage's cut and its
   * grabs written (the slot is written by whoever moves it).
   */
  #standAt(height: number, wide = this.#sizes?.wide): void {
    const sizes = this.#sizes;
    const shape = this.#shape;
    if (!(sizes && shape && wide)) {
      return;
    }
    this.#sizes = this.#boxes({ ...sizes, wide }, height);
    shape.ext = this.#ext();
    shape.wide = { ...wide };
    shape.paint();
    this.#restCut();
    this.#tellStage();
  }

  /** The stage's grabs: their values, and how far in the shape's sides stand at the side grabs' height. */
  #tellStage(): void {
    const stage = this.#stage;
    const sizes = this.#sizes;
    if (!(stage && sizes)) {
      return;
    }
    stage.grabValue = this.#grabValues(sizes);
    stage.edgeInset = Math.max(
      0,
      (this.#shape?.taperAt(1 + sizes.stage.height / 2) ?? 0) - 1
    );
    stage.place();
  }

  /** The stage cut to the grown shape, standing. */
  #restCut(): void {
    const el = this.#stage?.el;
    if (el && this.#shape && this.#sizes) {
      el.style.clipPath = this.#shape.cutAt(1, this.#sizes.stage);
    }
  }

  #newShape(sizes: Sizes): GrownShape {
    this.#shape?.remove();
    const shell = this.#parts.shell() as HTMLElement;
    const shape = new GrownShape(shell, { ...sizes.size }, this.#ext(sizes), {
      taperRows: 1,
      fade: false,
    });
    shape.wide = { ...sizes.wide };
    this.#shape = shape;
    return shape;
  }

  /**
   * The shape follows a run's clock: its outline is painted each frame at
   * the run's progress (its curve applied), so its edge, the pill's border,
   * is drawn whole while it grows and folds, as the wheel's is. The run
   * itself changes nothing drawn (a custom property): it is the clock, so it
   * is held, scrubbed and turned back like any other, and the shape with it.
   */
  #paintAlong(
    shape: GrownShape,
    ms: number,
    easing: string,
    from: number,
    to: number
  ): Animation {
    const run = shape.layers.halo.animate(
      [{ "--canvas-morph": "0" }, { "--canvas-morph": "1" }],
      { duration: ms, easing }
    );
    const paint = () => {
      if (run.playState === "idle" || this.#shape !== shape) {
        return;
      }
      const progress = run.effect?.getComputedTiming().progress;
      const t = typeof progress === "number" ? progress : 1;
      shape.open = from + (to - from) * t;
      shape.paint();
      if (run.playState !== "finished") {
        requestAnimationFrame(paint);
      }
    };
    paint();
    return run;
  }

  #stop(): void {
    for (const run of this.#runs) {
      run.cancel();
    }
    this.#runs = [];
    this.#stopSettle(false);
  }

  // --- open and fold ------------------------------------------------------------

  /**
   * ⌘⇧D, Attach → Draw, a pen's swipe: the draft's canvas opens, a new one
   * made when it has none; standing open, it folds (⌘⇧D again).
   */
  async toggle(): Promise<void> {
    const { canvas } = this.draft;
    if (canvas && !canvas.folded && this.up) {
      await this.fold();
    } else {
      await this.open();
    }
  }

  async open(): Promise<void> {
    const { draft } = this;
    if (this.up || this.working) {
      return;
    }
    const session = this.#parts.session();
    if (!session) {
      return;
    }
    this.error = "";
    if (!draft.canvas) {
      this.working = true;
      try {
        const made = await createDraftCanvas(session);
        if (this.draft !== draft) {
          return;
        }
        draft.canvas = { ...made, folded: false, thumb: null };
      } catch (error) {
        this.error = `The canvas couldn't be made: ${errorOf(error)}. Nothing changed in your message; try again.`;
        return;
      } finally {
        this.working = false;
      }
      await this.#grow(null);
      return;
    }
    const chip = draft.canvas.folded ? this.#parts.chip() : undefined;
    const from = chip ? boxOf(chip) : null;
    draft.canvas.folded = false;
    await this.#grow(from);
  }

  /**
   * The canvas stands up out of the pill (`from` null) or out of its chip's
   * box: the shape grows over `--dur-grow` and the stage, already on its
   * box, is uncovered by the same outline.
   */
  async #grow(from: Box | null): Promise<void> {
    const { canvas } = this.draft;
    if (!canvas) {
      return;
    }
    this.#stop();
    const stage = this.#hold(canvas);
    this.#edges(false);
    this.up = true;
    await tick();
    const sizes = this.#measure();
    const slot = this.#parts.slot();
    if (!(sizes && slot && stage.el && this.draft.canvas === canvas)) {
      return;
    }
    this.#sizes = sizes;
    this.#slotTo(slot, sizes);
    stage.slots.composer = slot;
    const shape = this.#newShape(sizes);
    shape.open = 1;
    shape.paint();
    const slotBox = atRest(() => boxOf(slot));
    stage.pinned = slotBox;
    stage.standAt("composer");
    this.#tellStage();
    const { halo } = shape.layers;
    const ms = dur("--dur-grow");
    const rest = shape.cutAt(1, sizes.stage);
    let runs: Animation[];
    if (motionOk.current) {
      const grown = (box: ClipBox) =>
        Array.from({ length: STEPS + 1 }, (_, i) => ({
          clipPath: shape.cutAt(i / STEPS, box),
        }));
      const chip = from
        ? boxCut(
            {
              left: from.left - slotBox.left,
              top: from.top - slotBox.top,
              width: from.width,
              height: from.height,
            },
            Number.parseFloat(
              getComputedStyle(halo).getPropertyValue("--radius-sm")
            )
          )
        : null;
      runs = [
        this.#paintAlong(shape, ms, "linear", 0, 1),
        chip
          ? stage.el.animate([{ clipPath: chip }, { clipPath: rest }], {
              duration: ms,
              easing: CURVE.drawer,
            })
          : stage.el.animate(grown(sizes.stage), {
              duration: ms,
              easing: "linear",
            }),
      ];
    } else {
      const fade = { duration: dur("--dur-fade"), easing: CURVE.out };
      runs = [
        halo.animate([{ opacity: 0 }, { opacity: 1 }], fade),
        stage.el.animate([{ opacity: 0 }, { opacity: 1 }], fade),
      ];
    }
    stage.el.style.clipPath = rest;
    for (const run of runs) {
      run.id = "canvas-grow";
    }
    this.#runs = runs;
    this.chipHidden = false;
    const landed = await Promise.all(runs.map((run) => run.finished)).then(
      () => true,
      () => false
    );
    if (landed && this.#shape === shape) {
      stage.pinned = null;
      stage.place();
      this.#runs = [];
      shape.morphTo(1, shape.ext, 0);
      this.#edges(true);
    }
  }

  /** Done: the canvas folds into its chip over `--dur-grow-exit`; its picture becomes the chip's. */
  async fold(): Promise<void> {
    await this.#fold(true);
  }

  /**
   * The rail's Remove: the canvas folds back into the pill as Done folds it,
   * leaving no chip, and leaves the message as the chip's remove takes it
   * (`remove`); the panel still lists it.
   */
  async discard(): Promise<void> {
    if (await this.#fold(false)) {
      this.remove();
    }
  }

  /**
   * The canvas folds over `--dur-grow-exit`: into its chip's box (`intoChip`),
   * or back into the pill along the grown shape's own fold. Whether it
   * landed folded.
   */
  async #fold(intoChip: boolean): Promise<boolean> {
    const { canvas } = this.draft;
    const stage = this.#stage;
    const shape = this.#shape;
    const sizes = this.#sizes;
    if (!(canvas && stage?.el && shape && sizes && this.up)) {
      return false;
    }
    this.#stop();
    this.#edges(false);
    shape.unsettle();
    const from = boxOf(stage.el);
    stage.pinned = from;
    let to: Box | null = null;
    if (intoChip) {
      this.chipHidden = true;
      canvas.folded = true;
      await tick();
      const chip = this.#parts.chip();
      to = chip ? atRest(() => boxOf(chip)) : null;
    }
    const { halo } = shape.layers;
    const ms = dur("--dur-grow-exit");
    let runs: Animation[];
    if (motionOk.current && (to || !intoChip)) {
      const into = to
        ? boxCut(
            {
              left: to.left - from.left,
              top: to.top - from.top,
              width: to.width,
              height: to.height,
            },
            Number.parseFloat(
              getComputedStyle(halo).getPropertyValue("--radius-sm")
            )
          )
        : null;
      runs = [
        this.#paintAlong(shape, ms, "linear", 1, 0),
        into
          ? stage.el.animate(
              [{ clipPath: shape.cutAt(1, sizes.stage) }, { clipPath: into }],
              { duration: ms, easing: CURVE.drawer, fill: "forwards" }
            )
          : stage.el.animate(
              Array.from({ length: STEPS + 1 }, (_, i) => ({
                clipPath: shape.cutAt(1 - i / STEPS, sizes.stage),
              })),
              { duration: ms, easing: "linear", fill: "forwards" }
            ),
      ];
    } else {
      const fade = {
        duration: dur("--dur-fade"),
        easing: CURVE.out,
        fill: "forwards",
      } as const;
      runs = [
        halo.animate([{ opacity: 1 }, { opacity: 0 }], fade),
        stage.el.animate([{ opacity: 1 }, { opacity: 0 }], fade),
      ];
    }
    for (const run of runs) {
      run.id = "canvas-fold";
    }
    this.#runs = runs;
    const landed = await Promise.all(runs.map((run) => run.finished)).then(
      () => true,
      () => false
    );
    if (!(landed && this.draft.canvas === canvas)) {
      return false;
    }
    this.#runs = [];
    for (const run of runs) {
      run.cancel();
    }
    this.#putAway();
    stage.pinned = null;
    stage.standAt(null);
    this.chipHidden = false;
    if (intoChip) {
      await this.#thumb(canvas, stage);
    }
    return true;
  }

  /** The chip's thumbnail: the picture drawn now, as the hub exports it. */
  async #thumb(canvas: DraftCanvas, stage: Stage): Promise<void> {
    try {
      await stage.ready();
      await stage.picture();
      const out = await exportCanvas(canvas.id);
      if (this.draft.canvas === canvas) {
        canvas.thumb = out.png;
      }
    } catch (error) {
      if (this.draft.canvas === canvas) {
        this.error = `The canvas's picture couldn't be drawn: ${errorOf(error)}. The chip shows no picture; the canvas is kept.`;
      }
    }
  }

  /** The shape and its slot go; the stage stays held for the chip. */
  #putAway(): void {
    this.#stop();
    this.#shape?.remove();
    this.#shape = null;
    this.#sizes = null;
    this.up = false;
    const stage = this.#stage;
    if (stage) {
      stage.slots.composer = undefined;
      stage.grabValue = null;
      stage.edgesShown = false;
      if (stage.el) {
        stage.el.style.clipPath = "";
      }
    }
  }

  /** An ask takes the composer: the canvas folds to its chip at once. */
  stepAside(): void {
    const { canvas } = this.draft;
    if (!(canvas && this.up)) {
      return;
    }
    canvas.folded = true;
    this.#putAway();
    this.#stage?.standAt(null);
  }

  /**
   * The chip's remove and the rail's Remove: the canvas leaves the message,
   * and so does the ink drawn on it (its Ink chip, which the next Send would
   * carry); the panel still lists it.
   */
  remove(): void {
    const id = this.draft.canvas?.id;
    const session = this.#parts.session();
    this.#putAway();
    this.#letGoStage();
    this.draft.canvas = null;
    this.error = "";
    if (id && session && inks.get(session)?.artifactId === id) {
      inks.delete(session);
    }
  }

  /**
   * The composer is handed another conversation's draft: this one's canvas
   * goes at once, and the new draft's stands at once if it was standing.
   */
  rebind(): void {
    this.#putAway();
    this.#letGoStage();
    this.error = "";
    const { canvas } = this.draft;
    if (canvas && !canvas.folded) {
      this.#grow(null);
    }
  }

  /** The window or the column changed size: the canvas keeps its height and width where they fit. */
  refit(): void {
    if (!(this.up && this.#shape && this.#runs.length === 0 && !this.#drag)) {
      return;
    }
    this.#stopSettle(false);
    const sizes = this.#measure();
    const slot = this.#parts.slot();
    if (!(sizes && slot)) {
      return;
    }
    this.#sizes = sizes;
    this.#newShape(sizes).morphTo(1, this.#ext(sizes), 0);
    this.#slotTo(slot, sizes);
    this.#standAt(sizes.stage.height + 1);
  }

  /** The panel shows the canvas the composer stood (picked from its list): it is the panel's now. */
  yielded(): void {
    this.#putAway();
    this.#letGoStage();
    this.draft.canvas = null;
  }

  // --- dock -------------------------------------------------------------------

  /**
   * Dock: the canvas flies from its box over the field into the artifact
   * panel (the drawer on a phone), the same iframe, while the shape gives
   * the field its room back on the composer's clock.
   */
  async dock(): Promise<void> {
    const { canvas } = this.draft;
    const stage = this.#stage;
    const shape = this.#shape;
    const sizes = this.#sizes;
    const session = this.#parts.session();
    if (!(canvas && stage?.el && shape && sizes && session && this.up)) {
      return;
    }
    this.#stop();
    this.#edges(false);
    shape.unsettle();
    const from = boxOf(stage.el);
    stage.pinned = from;
    const { draft } = this;
    // The canvas is the panel's from here: the message no longer carries it.
    draft.canvas = null;
    try {
      await showArtifact(session, canvas.id);
      const slot = await stage.slotted("panel");
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      );
      const to = atRest(() => boxOf(slot));
      const { halo } = shape.layers;
      const room = motionOk.current
        ? this.#paintAlong(shape, dur("--dur-control"), CURVE.out, 1, 0)
        : halo.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: dur("--dur-fade"),
            easing: CURVE.out,
            fill: "forwards",
          });
      room.id = "canvas-room";
      stage.el.style.clipPath = "";
      stage.pinned = to;
      stage.standAt("panel");
      const flight = this.#fly(stage.el, from, to);
      this.#runs = [room, flight];
      await Promise.all([room.finished, flight.finished]).catch(
        () => undefined
      );
      stage.pinned = null;
      stage.place();
      this.#runs = [];
      this.#putAway();
      // The panel holds it now.
      stage.actions.composer = undefined;
      stage.grab = null;
      letGo(this.#holder, stage.id);
      this.#stage = null;
    } catch (error) {
      stage.pinned = null;
      if (this.draft === draft && !draft.canvas) {
        draft.canvas = canvas;
        await tick();
        if (stage.at !== "panel") {
          stage.slots.composer = this.#parts.slot();
          stage.standAt("composer");
          this.refit();
          this.#edges(true);
        }
      }
      this.error = `The canvas couldn't dock: ${errorOf(error)}. It stays over the field.`;
    }
  }

  /** The same layer from one box to another: a transform off its new box (FLIP). */
  #fly(el: HTMLElement, from: Box, to: Box): Animation {
    const run = motionOk.current
      ? el.animate(
          [
            {
              transformOrigin: "0 0",
              transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            },
            { transformOrigin: "0 0", transform: "none" },
          ],
          { duration: dur("--dur-panel"), easing: CURVE.drawer }
        )
      : el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--dur-fade"),
          easing: CURVE.out,
        });
    run.id = "canvas-flight";
    watch(dur("--dur-panel"));
    return run;
  }

  /**
   * Undock (and Done while docked): the panel gives its canvas back. It
   * flies from the panel's box to its place over the field while the shape
   * takes the field's room again on the composer's clock; folded, it is the
   * chip at once.
   */
  async takeBack(ask: NonNullable<(typeof handBack)["ask"]>): Promise<void> {
    const session = this.#parts.session();
    const stage = stages.get(ask.id);
    if (!(session && stage?.el)) {
      return;
    }
    const from = boxOf(stage.el);
    if (this.draft.canvas && this.draft.canvas.id !== ask.id) {
      this.remove();
    }
    this.#stop();
    // It leaves the panel before the message takes it, standing where it is
    // drawn: a canvas the message holds while the panel still stands it is
    // one the panel took (the composer's `yielded`).
    stage.pinned = from;
    stage.at = null;
    this.draft.canvas = {
      id: ask.id,
      name: ask.name,
      folded: ask.folded,
      thumb: null,
    };
    // The draft keeps its own (reactive) copy: that is the one compared below.
    const { canvas } = this.draft;
    if (!canvas) {
      return;
    }
    this.#hold(canvas);
    try {
      await closePreview(session);
    } catch (error) {
      stage.pinned = null;
      this.draft.canvas = null;
      this.#letGoStage();
      stage.standAt("panel");
      this.error = `The canvas couldn't leave the panel: ${errorOf(error)}. It stays docked.`;
      return;
    }
    if (canvas.folded) {
      stage.pinned = null;
      stage.standAt(null);
      await this.#thumb(canvas, stage);
      return;
    }
    this.up = true;
    await tick();
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
    const sizes = this.#measure();
    const slot = this.#parts.slot();
    if (!(sizes && slot && stage.el && this.draft.canvas === canvas)) {
      stage.pinned = null;
      return;
    }
    this.#sizes = sizes;
    this.#slotTo(slot, sizes);
    stage.slots.composer = slot;
    const shape = this.#newShape(sizes);
    shape.open = 1;
    shape.paint();
    const to = atRest(() => boxOf(slot));
    const { halo } = shape.layers;
    const room = motionOk.current
      ? this.#paintAlong(shape, dur("--dur-control"), CURVE.out, 0, 1)
      : halo.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--dur-fade"),
          easing: CURVE.out,
        });
    room.id = "canvas-room";
    stage.pinned = to;
    stage.standAt("composer");
    this.#tellStage();
    const flight = this.#fly(stage.el, from, to);
    this.#runs = [room, flight];
    const landed = await Promise.all([room.finished, flight.finished]).then(
      () => true,
      () => false
    );
    if (landed && this.#shape === shape) {
      stage.pinned = null;
      this.#runs = [];
      this.#restCut();
      stage.place();
      shape.morphTo(1, shape.ext, 0);
      this.#edges(true);
    }
  }

  // --- resize -----------------------------------------------------------------

  #grabDown(edge: Edge, event: PointerEvent): void {
    const sizes = this.#sizes;
    const slot = this.#parts.slot();
    if (!(sizes && slot && this.up) || this.#runs.length > 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    // A settle caught mid-way is taken from where it stands.
    this.#stopSettle(true);
    this.#shape?.unsettle();
    const at = edge === "top" ? event.clientY : event.clientX;
    this.#drag = {
      edge,
      id: event.pointerId,
      at,
      from: this.#valueOf(edge),
      last: at,
      lastAt: event.timeStamp,
      v: 0,
    };
    const target = event.currentTarget as HTMLElement;
    const move = (e: PointerEvent) => this.#grabMove(e);
    const up = (e: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      this.#grabUp(e);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  /** What an edge's drag moves: the height for the top, how far that side stands past the pill for a side. */
  #valueOf(edge: Edge): number {
    const sizes = this.#sizes as Sizes;
    return edge === "top" ? this.height : sizes.wide[edge];
  }

  /** An edge's bounds, and the size the rubber band's furthest reach is a share of. */
  #bounds(edge: Edge): {
    min: number;
    max: number;
    scale: (bound: number) => number;
  } {
    const sizes = this.#sizes as Sizes;
    if (edge === "top") {
      return { min: sizes.min, max: sizes.max, scale: (bound) => bound };
    }
    const other = sizes.wide[edge === "left" ? "right" : "left"];
    return {
      min: 0,
      max: sizes.reach[edge],
      scale: (bound) => sizes.size.w + other + bound,
    };
  }

  /** The value under the finger: 1:1 inside its bounds, rubber-banded past them. */
  #follow(edge: Edge, value: number): number {
    const { min, max, scale } = this.#bounds(edge);
    const past = value > max ? value - max : Math.min(0, value - min);
    if (past === 0) {
      return value;
    }
    const bound = past > 0 ? max : min;
    const reach = Math.min(Math.abs(past) * RUBBER, scale(bound) * RUBBER_MAX);
    return bound + Math.sign(past) * reach;
  }

  #grabMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    const at = drag.edge === "top" ? event.clientY : event.clientX;
    const sign = SIGN[drag.edge];
    const dt = event.timeStamp - drag.lastAt;
    if (dt > 0) {
      // The value's speed, px/s: up is taller, outward is wider.
      drag.v = ((sign * (at - drag.last)) / dt) * 1000;
    }
    drag.last = at;
    drag.lastAt = event.timeStamp;
    this.#write(
      drag.edge,
      this.#follow(drag.edge, drag.from + sign * (at - drag.at))
    );
  }

  /** Writes the canvas with `edge` at `value` this frame: the slot, the shape, the cut. */
  #write(edge: Edge, value: number): void {
    const slot = this.#parts.slot();
    const sizes = this.#sizes;
    if (!(slot && sizes)) {
      return;
    }
    if (edge === "top") {
      slot.style.height = `${value - 1}px`;
      this.#standAt(value);
      return;
    }
    slot.style[edge] = `${1 - value}px`;
    this.#standAt(this.height, { ...sizes.wide, [edge]: value });
  }

  /** Where the slot stands now for `edge`, the settle's motion included. */
  #readSlot(edge: Edge, slot: HTMLElement): number {
    const at = slot.getBoundingClientRect();
    if (edge === "top") {
      return at.height + 1;
    }
    const pill = (this.#parts.shell() as HTMLElement).getBoundingClientRect();
    return edge === "left"
      ? pill.left - at.left + 1
      : at.right - pill.right + 1;
  }

  #grabUp(event: PointerEvent): void {
    const drag = this.#drag;
    const sizes = this.#sizes;
    this.#drag = null;
    if (!(drag && sizes) || event.pointerId !== drag.id) {
      return;
    }
    const { edge } = drag;
    const now = this.#valueOf(edge);
    const { min, max } = this.#bounds(edge);
    const v = event.timeStamp - drag.lastAt > STILL_MS ? 0 : drag.v;
    const target = Math.min(max, Math.max(min, now + v * PROJECT * 1000));
    this.#choose(edge, target);
    this.#settleTo(edge, now, target, v);
  }

  /** The reader's choice for `edge`, kept across Done and reopen. */
  #choose(edge: Edge, value: number): void {
    if (edge === "top") {
      this.#chosen = value;
    } else {
      this.#chosenWide = { ...this.#chosenWide, [edge]: value };
    }
  }

  /** The house spring from `now` to `target`, at the finger's speed: one animation on the slot's edge. */
  #settleTo(edge: Edge, now: number, target: number, v: number): void {
    const slot = this.#parts.slot();
    if (!slot) {
      return;
    }
    if (!motionOk.current) {
      this.#write(edge, target);
      this.#shape?.morphTo(1, this.#ext(), 0);
      return;
    }
    const path = integrate(now - target, v);
    const [run] = spring(path, [
      {
        el: slot,
        frame: (x) =>
          edge === "top"
            ? { height: `${target + x - 1}px` }
            : { [edge]: `${1 - (target + x)}px` },
      },
    ]);
    run.id = "canvas-settle";
    const follow = () => {
      const at = this.#readSlot(edge, slot);
      if (edge === "top") {
        this.#standAt(at);
      } else if (this.#sizes) {
        this.#standAt(this.height, { ...this.#sizes.wide, [edge]: at });
      }
      if (this.#settle?.run === run) {
        this.#settle.frame = requestAnimationFrame(follow);
      }
    };
    this.#settle = { run, frame: requestAnimationFrame(follow), edge };
    run.finished.then(
      () => {
        if (this.#settle?.run === run) {
          this.#stopSettle(false);
          this.#write(edge, target);
          this.#shape?.morphTo(1, this.#ext(), 0);
        }
      },
      () => undefined
    );
  }

  /** Stops a settle; with `keep`, where it stands is written. */
  #stopSettle(keep: boolean): void {
    const settle = this.#settle;
    if (!settle) {
      return;
    }
    this.#settle = null;
    cancelAnimationFrame(settle.frame);
    const slot = this.#parts.slot();
    const at = slot ? this.#readSlot(settle.edge, slot) : null;
    settle.run.cancel();
    if (keep && at !== null) {
      this.#write(settle.edge, at);
    }
  }

  #grabKey(edge: Edge, event: KeyboardEvent): void {
    const sizes = this.#sizes;
    if (!(sizes && this.up)) {
      return;
    }
    const { min, max } = this.#bounds(edge);
    // Up is taller; toward its own side, a side's edge stands wider.
    const steps: Record<Edge, Record<string, number>> = {
      top: {
        ArrowUp: KEY_STEP,
        ArrowDown: -KEY_STEP,
        PageUp: max,
        PageDown: -max,
        Home: max,
        End: -max,
      },
      left: {
        ArrowLeft: KEY_STEP,
        ArrowRight: -KEY_STEP,
        Home: -max,
        End: max,
      },
      right: {
        ArrowRight: KEY_STEP,
        ArrowLeft: -KEY_STEP,
        Home: -max,
        End: max,
      },
    };
    const by = steps[edge][event.key];
    if (by === undefined) {
      return;
    }
    event.preventDefault();
    this.#stopSettle(false);
    const value = Math.min(max, Math.max(min, this.#valueOf(edge) + by));
    this.#choose(edge, value);
    this.#write(edge, value);
    this.#shape?.morphTo(1, this.#ext(), 0);
  }

  // --- send -------------------------------------------------------------------

  /**
   * What the send carries for the canvas: its `.excalidraw` file and its
   * outline as text attachments, its picture as an image, drawn now. Null
   * when nothing can go: the reason stands under the chip or the pill.
   */
  async extras(): Promise<Required<
    Pick<SendExtras, "attachments" | "images">
  > | null> {
    const { canvas } = this.draft;
    if (!canvas) {
      return null;
    }
    this.error = "";
    this.working = true;
    try {
      const stage =
        this.#stage?.id === canvas.id ? this.#stage : this.#hold(canvas);
      await stage.ready();
      await stage.picture();
      const out = await exportCanvas(canvas.id);
      const drawn = out.file.elements.filter((el) => !el.isDeleted).length;
      if (drawn === 0) {
        this.error =
          "Nothing is drawn on the canvas, so nothing was sent. Draw on it, or remove it from the message, then send again.";
        return null;
      }
      if (!out.png) {
        this.error =
          "The canvas's picture isn't drawn yet, so nothing was sent. Send again in a moment.";
        return null;
      }
      return {
        attachments: [
          {
            kind: "text",
            name: "canvas.excalidraw",
            content: JSON.stringify(out.file),
          },
          { kind: "text", name: "canvas.md", content: out.outline },
        ],
        images: [{ mediaType: "image/png", data: out.png }],
      };
    } catch (error) {
      this.error = `The canvas couldn't be read for sending: ${errorOf(error)}. Nothing was sent; send again.`;
      return null;
    } finally {
      this.working = false;
    }
  }

  /** The send went out with the canvas: it is the session's, no longer a draft, and leaves the composer. */
  sent(id: string): void {
    const session = this.#parts.session();
    this.#putAway();
    this.#letGoStage();
    if (session) {
      canvasSent(session, id).catch((error) => {
        this.error = `The canvas went out, but it is still marked as a draft: ${errorOf(error)}.`;
      });
    }
  }

  destroy(): void {
    this.#putAway();
    this.#letGoStage();
  }
}
