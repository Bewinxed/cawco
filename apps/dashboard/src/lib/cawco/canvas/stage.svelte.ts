/**
 * A canvas on screen (Projects spec §5.10, DESIGN.md Artifact panel, canvas
 * and ink): one iframe of its host page, standing over one slot at a time,
 * the composer's or the artifact panel's. The iframe never moves in the
 * DOM: a moved iframe reloads, and the one move that keeps it (`moveBefore`)
 * is not in Safari ("Apple Safari — Unsupported",
 * nowyoucanuse.com/features--move-before.html), where the pencil draws. So
 * the stage is a fixed layer (CanvasStages, portalled to the body) laid over
 * its slot's box, and Dock is the same layer flying from one box to the
 * other: one object.
 *
 * Whoever shows a canvas holds its stage (the composer for its draft's
 * canvas, the panel for the canvas it shows) and lets go when it no longer
 * does; the last to let go removes it.
 *
 * Placement reads the slot's box and writes the layer's, only while the
 * page may be moving under it: a pointer held, a transition or animation
 * starting, a resize or scroll, a slot resizing, or a motion a holder runs
 * (`watch`), and for a short tail after each.
 */
import { SvelteMap } from "svelte/reactivity";
import { artifactSyncPath } from "../preview/artifact-doc";

export type Slot = "composer" | "panel";

/** What the canvas's rail asks of whoever holds the slot it stands in. */
export interface SlotActions {
  dock?: () => void;
  done?: () => void;
  undock?: () => void;
}

/** How long placement keeps reading after the page last moved, ms. */
const TAIL = 500;
/** How long the page has to draw the picture a send carries, ms. */
const PICTURE_WAIT = 5000;

export interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export class Stage {
  readonly id: string;
  readonly instanceId: string;
  name = $state("canvas");
  /** The slot it stands over; null while folded to its chip. */
  at = $state<Slot | null>(null);
  readonly slots: Partial<Record<Slot, HTMLElement>> = {};
  readonly actions: Partial<Record<Slot, SlotActions>> = {};
  /** The fixed layer, and the iframe in it (CanvasStages). */
  el = $state<HTMLElement>();
  frame = $state<HTMLIFrameElement>();
  /** The page has said it is ready (`cawco:ready`). */
  connected = $state(false);
  /** A box it stands on instead of its slot's, while a flight lands there. */
  pinned: Box | null = null;
  /** The holders, by token. */
  readonly holders = new Set<symbol>();
  /** The page's answer to an asked picture. */
  pictured: (() => void) | null = null;
  /** The resize grab's handlers, the composer's while it stands there. */
  grab: {
    down: (event: PointerEvent) => void;
    key: (event: KeyboardEvent) => void;
  } | null = null;
  /** The grab's state for a screen reader: the height and its bounds, px. */
  grabValue = $state<{ min: number; max: number; now: number } | null>(null);

  readonly #waiting = new Set<() => void>();

  /** Something it waits for came true: the page connected, a slot registered. */
  changed(): void {
    for (const check of this.#waiting) {
      check();
    }
  }

  /** Resolves once `ok` holds, checked at each change; refused after `ms`. */
  #when<T>(ok: () => T | undefined, ms: number, why: string): Promise<T> {
    return new Promise((done, fail) => {
      const check = () => {
        const value = ok();
        if (value !== undefined) {
          this.#waiting.delete(check);
          clearTimeout(timer);
          done(value);
        }
      };
      const timer = setTimeout(() => {
        this.#waiting.delete(check);
        fail(new Error(why));
      }, ms);
      this.#waiting.add(check);
      check();
    });
  }

  /** The page has joined its doc. */
  ready(): Promise<true> {
    return this.#when(
      () => (this.connected ? true : undefined),
      10_000,
      "the canvas page didn't load within 10 s"
    );
  }

  /** The slot is on the page (the panel mounting its well). */
  slotted(slot: Slot): Promise<HTMLElement> {
    return this.#when(
      () => this.slots[slot],
      5000,
      "the artifact panel didn't open within 5 s"
    );
  }

  constructor(instanceId: string, id: string, name: string) {
    this.instanceId = instanceId;
    this.id = id;
    this.name = name;
  }

  /** The host page's address: the canvas by id, under its session's preview prefix. */
  get base(): string {
    return `/preview/${encodeURIComponent(this.instanceId)}/canvas/`;
  }
  get src(): string {
    return `${this.base}__cawco/canvas/${this.id}/`;
  }

  post(message: object): void {
    this.frame?.contentWindow?.postMessage(message, location.origin);
  }

  /** Tells the page which artifact it is, where its doc is, and where it stands. */
  hello(): void {
    this.connected = false;
    this.post({
      type: "cawco:hello",
      artifact: { id: this.id, kind: "canvas", name: this.name },
      sync: artifactSyncPath(this.base, this.id),
    });
    this.tellPlace();
  }

  tellPlace(): void {
    this.post({ type: "cawco:place", docked: this.at === "panel" });
  }

  /** Stands over `slot` (null: folded away) and places itself there now. */
  standAt(slot: Slot | null): void {
    this.at = slot;
    this.tellPlace();
    this.place();
    watch();
  }

  /** The box it stands on now: its pin, else its slot's; null when hidden. */
  target(): Box | null {
    if (this.pinned) {
      return this.pinned;
    }
    const slot = this.at ? this.slots[this.at] : undefined;
    if (!slot?.isConnected) {
      return null;
    }
    if (!slot.checkVisibility({ visibilityProperty: true })) {
      return null;
    }
    const box = boxOf(slot);
    return box.width > 0 && box.height > 0 ? box : null;
  }

  /** Writes its layer onto its box. Reads one box, writes only on change. */
  place(): void {
    const { el } = this;
    if (!el) {
      return;
    }
    const box = this.target();
    const hidden = box === null;
    if (el.hidden !== hidden) {
      el.hidden = hidden;
    }
    if (!box) {
      return;
    }
    const s = el.style;
    const set = (prop: "left" | "top" | "width" | "height", v: number) => {
      const px = `${v}px`;
      if (s[prop] !== px) {
        s[prop] = px;
      }
    };
    set("left", box.left);
    set("top", box.top);
    set("width", box.width);
    set("height", box.height);
    el.classList.toggle(
      "over-sheet",
      this.at === "panel" && !!this.slots.panel?.closest(".preview-sheet")
    );
  }

  /** The page draws its picture now and posts it (cawco:picture); resolves once it has. */
  picture(): Promise<void> {
    if (!this.connected) {
      return Promise.reject(
        new Error("the canvas page isn't connected to the hub")
      );
    }
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        this.pictured = null;
        fail(new Error("the canvas didn't draw its picture within 5 s"));
      }, PICTURE_WAIT);
      this.pictured = () => {
        clearTimeout(timer);
        this.pictured = null;
        done();
      };
      this.post({ type: "cawco:picture" });
    });
  }
}

/** Every canvas on screen, by artifact id. */
export const stages = new SvelteMap<string, Stage>();

/** Holds the canvas's stage for `holder`, making it when none stands. */
export function holdStage(
  holder: symbol,
  instanceId: string,
  id: string,
  name: string
): Stage {
  let stage = stages.get(id);
  if (!stage) {
    stage = new Stage(instanceId, id, name);
    stages.set(id, stage);
  }
  stage.name = name;
  stage.holders.add(holder);
  return stage;
}

/** `holder` no longer shows it; the last to let go removes it. */
export function letGo(holder: symbol, id: string): void {
  const stage = stages.get(id);
  if (!stage) {
    return;
  }
  stage.holders.delete(holder);
  if (stage.holders.size === 0) {
    stages.delete(id);
  }
}

/**
 * A canvas the panel gives back to the composer (Undock, or Done while
 * docked): the composer writing to its session takes it.
 */
export const handBack = $state<{
  ask: { instanceId: string; id: string; name: string; folded: boolean } | null;
}>({ ask: null });

/*
 * Placement. The frame loop runs while the page may be moving under a
 * stage, and stops `TAIL` ms after it last did.
 */
let until = 0;
let frame = 0;
let pressed = false;

function tick(now: number): void {
  for (const stage of stages.values()) {
    stage.place();
  }
  frame =
    pressed || now < until || pinnedAny() ? requestAnimationFrame(tick) : 0;
}

const pinnedAny = () => [...stages.values()].some((stage) => !!stage.pinned);

/** Keeps placing every stage for at least `ms`. */
export function watch(ms = TAIL): void {
  until = Math.max(until, performance.now() + ms);
  if (!frame && typeof requestAnimationFrame !== "undefined") {
    frame = requestAnimationFrame(tick);
  }
}

/** A slot's own size changing moves its stage too. */
export const slotSizes =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => watch());

if (typeof document !== "undefined") {
  const moved = () => {
    if (stages.size > 0) {
      watch();
    }
  };
  for (const type of [
    "transitionrun",
    "animationstart",
    "scroll",
    "pointermove",
  ]) {
    document.addEventListener(type, moved, { capture: true, passive: true });
  }
  document.addEventListener(
    "pointerdown",
    () => {
      pressed = true;
      moved();
    },
    { capture: true }
  );
  for (const type of ["pointerup", "pointercancel"]) {
    document.addEventListener(
      type,
      () => {
        pressed = false;
        moved();
      },
      { capture: true }
    );
  }
  window.addEventListener("resize", moved);
}
