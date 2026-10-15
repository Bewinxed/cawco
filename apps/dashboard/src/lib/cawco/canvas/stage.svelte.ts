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
import {
  type PreviewAddress,
  type PreviewTicket,
  previewEnterUrl,
  previewOrigin,
} from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";
import { theme } from "#lib/theme.svelte.js";
import { artifactSyncPath } from "../preview/artifact-doc";

export type Slot = "composer" | "panel";

/** What the canvas's rail asks of whoever holds the slot it stands in. */
export interface SlotActions {
  dock?: () => void;
  done?: () => void;
  remove?: () => void;
  undock?: () => void;
}

/** How long placement keeps reading after the page last moved, ms. */
const TAIL = 500;
/** How long the page has to draw the picture a send carries, ms. */
const PICTURE_WAIT = 5000;
/**
 * How long a lost link stands before what is drawn on the page is refused,
 * ms: the page's own (preview-overlay artifact.ts `LOST_REFUSES_MS`).
 */
export const LOST_REFUSES_MS = 5000;

/** The page's doc's link to the hub, as its `cawco:sync` says (artifact.ts `Link`). */
export type Link = "connecting" | "synced" | "lost";
const LINKS = new Set<string>(["connecting", "synced", "lost"]);

export interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * A handle of the composer's canvas that resizes it: the top grab its
 * height, a top corner its width (both sides at once) and its height.
 */
export type Handle = "top" | "top-left" | "top-right";

export interface GrabValue {
  max: number;
  min: number;
  now: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Each session's preview origin, as the hub last named it (`Stage.#reach`). */
const sessionOrigins = new Map<string, { origin: string }>();
/**
 * Each canvas's iframe address and the origin it was made for: a stage made
 * anew for the same canvas keeps it, so its iframe never reloads, and its
 * host-mode ticket (spent once) is not asked for again.
 */
const canvasEntries = new Map<string, { origin: string; src: string }>();

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
  /** The page has said it is ready (`cawco:ready`). Whether its doc reached the hub is `link`'s to say. */
  connected = $state(false);
  /** The page's doc's link to the hub, as the page last said (`cawco:sync`). */
  link: Link = "connecting";
  /** Why the link was lost, the page's own clause. */
  linkError: string | null = null;
  /** The page's doc has synced with the hub since its hello. */
  hasSynced = $state(false);
  /** Since when the link has stood lost, `performance.now()`. */
  #lostSince: number | null = null;
  /** Elements the page's doc holds, drawn and not deleted (`cawco:drawn`); null until it said. */
  drawn: number | null = null;
  /** A box it stands on instead of its slot's, while a flight lands there. */
  pinned: Box | null = null;
  /** The holders, by token. */
  readonly holders = new Set<symbol>();
  /** The page's answer to an asked picture. */
  pictured: (() => void) | null = null;
  /** The resize handles' handlers: the composer's while it stands there. */
  grab: {
    down: (handle: Handle, event: PointerEvent) => void;
    key: (handle: Handle, event: KeyboardEvent) => void;
  } | null = null;
  /**
   * The handles' state for a screen reader, px: the top's the height and its
   * bounds, the corners' the width and its bounds (`text` both sizes).
   */
  grabValue = $state<{
    top: GrabValue;
    corner: GrabValue & { text: string };
  } | null>(null);
  /**
   * Where the shape's top corners stand, px: how far in from the stage's
   * box sides, and their radius, which the corner grips sit under.
   */
  corner = $state({ inset: 0, radius: 0 });

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

  /**
   * What is drawn on the page wouldn't reach the hub (artifact.ts
   * `refused`): before its doc first synced, and once a lost link has stood
   * {@link LOST_REFUSES_MS}.
   */
  get refused(): boolean {
    return (
      !this.hasSynced ||
      (this.#lostSince !== null &&
        performance.now() - this.#lostSince >= LOST_REFUSES_MS)
    );
  }

  /** The page's word on its link (`cawco:sync`): a lost one keeps the time it was first lost. */
  heardLink(state: unknown, error: unknown): void {
    if (typeof state !== "string" || !LINKS.has(state)) {
      return;
    }
    const link = state as Link;
    if (link === "synced") {
      this.hasSynced = true;
    }
    this.#lostSince =
      link === "lost" ? (this.#lostSince ?? performance.now()) : null;
    this.link = link;
    this.linkError = typeof error === "string" ? error : null;
    this.changed();
  }

  /** The page's count of what its doc holds (`cawco:drawn`). */
  heardDrawn(count: unknown): void {
    if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
      this.drawn = count;
      this.changed();
    }
  }

  /** Resolves true once the link is synced; false if it isn't within `ms`. */
  synced(ms: number): Promise<boolean> {
    return this.#when(
      () => (this.link === "synced" ? true : undefined),
      Math.max(0, ms),
      "not synced"
    ).catch(() => false);
  }

  constructor(instanceId: string, id: string, name: string) {
    this.instanceId = instanceId;
    this.id = id;
    this.name = name;
    // The origin its session's canvases already stand on: a stage made anew
    // for the same canvas (its holder let go and took it again) keeps its
    // iframe, never reloaded for a moment with no address.
    const named = sessionOrigins.get(instanceId);
    this.origin = named?.origin ?? null;
    const held = canvasEntries.get(id);
    this.entry = held && held.origin === this.origin ? held.src : null;
    this.#reach();
  }

  /**
   * The iframe's address: the canvas's page on its origin (port mode), or
   * host mode's entry with a ticket of its own (hub preview-access.ts),
   * which sets the origin's pass and goes on to the page. Null until known.
   */
  entry = $state<string | null>(null);
  /** Entries in a row the page turned away (`cawco:locked`) without once saying it was ready. */
  #turnedAway = 0;

  /**
   * Its session's preview origin, never the dashboard's: the hub names it
   * (its listener started when it has none). Null until it has.
   */
  origin = $state<string | null>(null);
  /** Why the hub named none, its own sentence. */
  unreached = $state<string | null>(null);

  async #reach(): Promise<void> {
    const answer = await fetch(
      `/api/instances/${encodeURIComponent(this.instanceId)}/preview-address`,
      { method: "POST" }
    ).catch(() => null);
    if (!answer?.ok) {
      this.unreached =
        (await answer?.text().catch(() => "")) ||
        "The hub didn't say where this canvas stands.";
      this.changed();
      return;
    }
    const address = (await answer.json()) as PreviewAddress;
    const origin = previewOrigin(address, location);
    if (origin) {
      sessionOrigins.set(this.instanceId, { origin });
    }
    // Asked again each time: the fleet's preview mode may have moved it.
    if (origin !== this.origin) {
      this.origin = origin;
    }
    if (
      origin &&
      !(this.entry && canvasEntries.get(this.id)?.origin === origin)
    ) {
      await this.#enter(origin, "origin" in address);
    }
    this.changed();
  }

  /** The canvas's page on `origin`: straight (port mode), or with a new ticket (host mode). */
  async #enter(origin: string, byHost: boolean): Promise<void> {
    const at = `/__cawco/canvas/${this.id}/`;
    if (!byHost) {
      this.#entered(origin, `${origin}${at}`);
      return;
    }
    const answer = await fetch(
      `/api/instances/${encodeURIComponent(this.instanceId)}/preview-ticket`,
      { method: "POST" }
    ).catch(() => null);
    if (!answer?.ok) {
      this.unreached =
        (await answer?.text().catch(() => "")) ||
        "The hub didn't give this canvas a pass.";
      return;
    }
    const { ticket } = (await answer.json()) as PreviewTicket;
    this.#entered(origin, previewEnterUrl(origin, ticket, at));
  }

  #entered(origin: string, src: string): void {
    canvasEntries.set(this.id, { origin, src });
    this.unreached = null;
    this.entry = src;
  }

  /** The page turned the canvas's pass away (`cawco:locked`): it lapsed, so the canvas enters again, once in a row. */
  async turnedAway(): Promise<void> {
    this.#turnedAway += 1;
    if (this.#turnedAway > 1 || !this.origin) {
      this.unreached =
        "This canvas turned away its pass twice: this browser didn't keep the preview's cookie. Reach previews over https, then open the canvas again.";
      this.entry = null;
      this.changed();
      return;
    }
    await this.#enter(this.origin, true);
    this.changed();
  }

  /** The page said it is ready: a later lapse may enter again. */
  admitted(): void {
    this.#turnedAway = 0;
  }

  /** The host page's address, or "" until it is known. */
  get src(): string {
    return this.entry ?? "";
  }

  /** To the page, on its own origin alone. */
  post(message: object): void {
    if (this.origin) {
      this.frame?.contentWindow?.postMessage(message, this.origin);
    }
  }

  /** Tells the page which artifact it is, where its doc is, the dashboard's theme, and where it stands. */
  hello(): void {
    this.connected = false;
    // The page tells its link again once it hears this (overlay.ts); its
    // count it tells as its scene binds, which may precede the hello.
    this.link = "connecting";
    this.linkError = null;
    this.hasSynced = false;
    this.#lostSince = null;
    this.post({
      type: "cawco:hello",
      artifact: { id: this.id, kind: "canvas", name: this.name },
      sync: artifactSyncPath(this.id),
      theme: theme.resolved,
      inset: this.#inset(),
    });
    this.tellPlace();
  }

  /** The dashboard's theme changed: the canvas draws in it (never in the OS's). */
  tellTheme(scheme: "light" | "dark"): void {
    this.post({ type: "cawco:theme", theme: scheme });
  }

  tellPlace(): void {
    this.post({
      type: "cawco:place",
      docked: this.at === "panel",
      inset: this.#inset(),
    });
  }

  /**
   * What of the page's edges our chrome takes, which its rail stands inside:
   * over the composer the grab band over its top (`--c-btn-h-lg`: the top
   * grab in its middle, the corner handles at its ends), and at its sides
   * the grown shape's shoulders, which stand in from the page's box by the
   * corner's inset; none in the panel.
   */
  #inset(): { side: number; top: number } {
    if (this.at !== "composer") {
      return { side: 0, top: 0 };
    }
    return {
      side: this.corner.inset,
      top: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--c-btn-h-lg"
        )
      ),
    };
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
