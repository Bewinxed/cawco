/**
 * What the canvas draws of its own around the frames, on classes no project
 * writes: the page's sheet (the well, the sections, the frames, the stage
 * the design graph stands a state on), and DialKit's move timeline and the
 * agent's dials, docked in the page (vendored at
 * packages/hub/skills/decision-page/kit/vendor/dialkit, MIT, Josh Puckett).
 * The canvas names nothing and steers nothing itself: its panel's head
 * names it, and the design graph beside it (the pane's GraphPanel) is how
 * a state is found, previewed and kept (Projects spec §5.10, "The design
 * graph"). Drawn on CawCo's tokens (DESIGN.md).
 */
import type {
  AnimationRead,
  CanvasDial,
  CanvasSpec,
  MoveRender,
} from "@cawco/core/stage";
import { bridge } from "./runtime";
import { type PageScheme, pageScheme } from "./scheme";
import { windowHeight, windowWidth } from "./viewport";

/** DialKit's vanilla build as the page has it once loaded (`window.DialKit`). */
interface DialKitGlobal {
  createDialKit: (
    name: string,
    config: Record<string, unknown>,
    options?: { id?: string }
  ) => {
    id: string;
    subscribe: (
      listener: (values: Record<string, unknown>) => void
    ) => () => void;
  };
  createDialRoot: (options: Record<string, unknown>) => {
    element: HTMLElement;
  };
  createDialTimeline: (
    name: string,
    config: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => TimelineHandle;
  createDialTimelineRoot: (options: Record<string, unknown>) => {
    element: HTMLElement;
    update: (next: Record<string, unknown>) => void;
  };
  DialStore: {
    getValues: (id: string) => Record<string, unknown>;
    updateValues: (id: string, values: Record<string, unknown>) => void;
  };
}
interface TimelineHandle {
  destroy: () => void;
  id: string;
  play: () => void;
  seek: (time: number) => void;
  subscribe: (listener: (values: { time: number }) => void) => () => void;
}

declare global {
  interface Window {
    DialKit?: DialKitGlobal;
  }
}

export interface ChromeOptions {
  applyDials: (values: Record<string, unknown>) => void;
  /** The house edge fade's sheet, set in the page: a wide embed's frame scrolls under it (runtime.ts `fitToEmbed`). */
  edgeFade: string;
  /** The house faces' `@font-face` rules, set in the page. */
  faces: string;
  playVisible: (
    file: string,
    to: string
  ) => Promise<{
    move: MoveRender;
    replays: { animation: Animation | null; read: AnimationRead }[];
  } | null>;
  spec: CanvasSpec;
  tokens: string;
}

/** A page narrower than this is a phone's: the docks share its floor. DESIGN.md's breakpoint. */
const PHONE_MAX = 640;
/** DialKit's timeline handle's step, per arrow key (vendor/dialkit browser.global.js, `createDialTimelineRoot`). */
const TIMELINE_STEP = 20;

/** The page's sheet: frames, sections and the docks, on classes no project writes. */
export const PAGE_CSS = `
/* The room the docks take from the canvas: at the floor (a move's timeline, a phone's dials) and at the inline end (a
   desk's dials); none until one of them stands. On the stage, the room the design graph's panel and dock leave it too. */
html.cawco-canvas-page { color-scheme: light dark; --cawco-floor: 0px; --cawco-end: 0px; --cawco-timeline-room: 0px;
  --cawco-stage-end: 0px; --cawco-stage-bottom: 0px; }
html.cawco-canvas-page[data-theme="light"] { color-scheme: light; }
html.cawco-canvas-page[data-theme="dark"] { color-scheme: dark; }
/* The page is the well the frames stand in (surface-well): the frame recesses, each frame's own page reads raised on it. */
html.cawco-canvas-page, html.cawco-canvas-page body { margin: 0; block-size: 100%; overflow: hidden; background: var(--surface-well); }
/* The canvas ends where the docks begin: no frame is ever drawn under one. */
.cawco-canvas { position: fixed; inset-block: 0 var(--cawco-floor); inset-inline: 0 var(--cawco-end); overflow: hidden;
  touch-action: none; background: var(--surface-well); }
/* The width a frame without one answers its story's width conditions at (canvas width.ts): the canvas's own, as the window
   was. A frame with a width answers its own body's. */
.cawco-canvas { container: cawco-width / inline-size; }
.cawco-world { position: absolute; inset-block-start: 0; inset-inline-start: 0; transform-origin: 0 0; display: flex; flex-direction: column;
  gap: var(--space-8); padding-block-end: 160px; will-change: transform; }
.cawco-section { display: flex; flex-direction: column; gap: var(--space-3); min-block-size: 120px; }
.cawco-section[data-cawco-asleep] .cawco-grid { display: none; }
/* A section's head: its name in plain words in the title role, its file in small print under it, and while it is on its way
   the status line beside the name, on the title's row, so its going moves nothing. */
.cawco-section-head { display: grid; grid-template-columns: auto auto; justify-content: start; gap: var(--space-1) var(--space-3);
  padding-block-end: var(--space-1); border-block-end: 1px solid var(--border-well); }
.cawco-section-title { grid-column: 1; font: var(--type-title); color: var(--ink-strong); text-wrap: balance; }
.cawco-section-file { grid-column: 1; font: var(--type-meta); color: var(--ink-muted); overflow-wrap: anywhere; }
/* A section on its way (DESIGN.md's Real Wait Rule): nothing until the wait has lasted the grace, then the line saying what it
   waits for and each story's frame as a skeleton where its frame lands; they hold their room from the first, so nothing moves. */
.cawco-waiting { animation: cawco-wait 1ms var(--dur-wait-grace) both; }
.cawco-section-status { grid-column: 2; grid-row: 1; align-self: baseline; margin: 0; font: var(--type-meta); color: var(--ink-muted); }
.cawco-stand-in { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.cawco-stand-in > .cawco-frame-words { padding: var(--space-row) var(--space-1); }
/* The skeleton recipe: a surface-fill block at the frame's size, one raised band crossing it each loop, still without motion. */
.cawco-stand-in-body { position: relative; overflow: hidden; inline-size: var(--c-canvas-skeleton-w); max-inline-size: 100vw; block-size: var(--c-canvas-skeleton-h);
  border-radius: var(--radius-sm); background: var(--surface-fill); }
@media (prefers-reduced-motion: no-preference) {
  .cawco-waiting { animation-duration: var(--dur-fade); animation-timing-function: var(--ease-out); }
  .cawco-stand-in-body::after { content: ""; position: absolute; inset: 0; translate: -100% 0;
    background: linear-gradient(90deg, transparent 0 30%, var(--skeleton-sheen) 50%, transparent 70% 100%);
    animation: cawco-sweep var(--dur-loop) linear infinite; }
}
@keyframes cawco-wait { from { opacity: 0; } }
@keyframes cawco-sweep { to { translate: 100% 0; } }
/* A section whose module didn't load says so where its frames would stand: the error formula's line, then Show details. */
/* It reads raised on the well, as a frame's page does, so its details recess inside it in both schemes (the well is surface-recess in light). */
.cawco-section-failed { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2); inline-size: 0; min-inline-size: max(100%, var(--c-canvas-skeleton-w)); box-sizing: border-box;
  padding: var(--space-3); background: var(--surface-raised); border: 1px solid var(--border-hairline); border-radius: var(--radius-md); }
.cawco-section-failed-line { margin: 0; font: var(--type-body); color: var(--status-fail-ink); text-wrap: pretty; }
/* Show details: the sm ghost, its words standing on the line's start (its own inset pulled back), no disclosure triangle. */
.cawco-section-failed summary { list-style: none; display: inline-flex; align-items: center; inline-size: fit-content; block-size: var(--c-btn-h-sm);
  padding-inline: var(--space-2); margin-inline-start: calc(var(--space-2) * -1); border-radius: var(--radius-sm);
  font: var(--type-label); color: var(--ink-strong); cursor: pointer; }
.cawco-section-failed summary::-webkit-details-marker { display: none; }
/* Its details stand in the card's one track: a wide code frame scrolls inside it, never widens it. */
.cawco-section-failed details { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); }
@media (hover: hover) { .cawco-section-failed summary:hover { background: var(--surface-hover); } }
.cawco-section-failed summary:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
.cawco-section-failed pre { margin: var(--space-1) 0 0; padding: var(--space-2); font: var(--type-code); font-variant-ligatures: none; color: var(--ink-strong);
  white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface-recess); border-radius: var(--radius-sm); }
/* Vite's code frame: its columns line up, so it scrolls rather than wraps. */
.cawco-section-failed pre.cawco-section-failed-frame { white-space: pre; overflow-wrap: normal; overflow-x: auto; }
/* The place stays whole on one line: the path gives way inside (The Truncate Inside Rule), :line:column never. */
.cawco-section-failed-place { display: flex; min-inline-size: 0; margin: 0; font: var(--type-code); font-variant-ligatures: none; color: var(--ink-muted); white-space: nowrap; }
.cawco-section-failed-place > span:first-child { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-failed-place > span:last-child { flex: none; }
.cawco-grid { display: grid; grid-auto-columns: max-content; gap: var(--space-6) var(--space-6); align-items: start; justify-content: start; }
.cawco-colhead { font: var(--type-meta); color: var(--ink-muted); text-transform: none; }
/* The gap clears the selected ring (2px at a 2px offset) of the label above and the status below. */
.cawco-frame { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); min-inline-size: 0; position: relative; }
.cawco-frame-label { all: unset; box-sizing: border-box; display: grid; gap: var(--space-row); max-inline-size: 360px; cursor: pointer; border-radius: var(--radius-xs);
  padding: var(--space-row) var(--space-1); }
.cawco-frame-label:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
.cawco-frame-words { font: var(--type-label); color: var(--ink-strong); overflow-wrap: anywhere; }
.cawco-frame-small { font: var(--type-meta); color: var(--ink-muted); overflow-wrap: anywhere; }
.cawco-frame-label[data-cawco-unnamed] .cawco-frame-words { font: var(--type-meta); color: var(--ink-muted); }
.cawco-frame-label[data-cawco-picked] { box-shadow: inset 0 0 0 1px var(--brand-solid); }
/* The inspector's story: one solid neutral edge round its frames (3:1); the focus ring is for focus alone. */
.cawco-frame[data-cawco-selected] > .cawco-frame-body { outline: var(--focus-ring-width) solid var(--border-button-outline); outline-offset: var(--focus-ring-offset); }
.cawco-frame[data-cawco-edited] .cawco-frame-small::after { content: " · edited"; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-frame-status { font: var(--type-meta); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.cawco-frame-status[data-state="failed"] { color: var(--status-fail-ink); }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
/* The stage (Projects spec §5.10, "The design graph"): a pane with the design graph beside the page stands one state, the one
   kept or the one a hover previews; every frame stays mounted and measured where the canvas laid it out, unseen and out of
   reach. The graph names the state, so no head, label or status line is drawn, and the canvas ends where the graph's panel
   and dock begin (the room the pane says). */
html[data-cawco-staged] .cawco-canvas { inset-inline-end: calc(var(--cawco-end) + var(--cawco-stage-end));
  inset-block-end: calc(var(--cawco-floor) + var(--cawco-stage-bottom)); }
html[data-cawco-staged] :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status) { visibility: hidden; }
html[data-cawco-staged] :is(.cawco-frame, .cawco-stand-in):not([data-cawco-on-stage]),
html[data-cawco-staged] .cawco-section:not([data-cawco-on-stage]) .cawco-section-failed { opacity: 0; pointer-events: none; }
/* The docks stand as chrome, never on each other: a move's timeline across the floor; on a desk the dials at the inline end,
   above the timeline; on a phone the dials across the floor over the timeline. On the stage they stand clear of the graph. */
.cawco-dock-timeline { position: fixed; inset-inline: var(--space-3) calc(var(--space-3) + var(--cawco-stage-end));
  inset-block-end: calc(var(--space-2) + var(--cawco-stage-bottom)); z-index: 2147483001; }
.cawco-dock-dials { position: fixed; z-index: 2147483001; overflow: auto; overscroll-behavior: contain;
  inset-block-start: var(--space-2); inset-inline-end: calc(var(--space-3) + var(--cawco-stage-end)); inline-size: 280px;
  max-block-size: calc(100dvh - var(--cawco-floor) - var(--cawco-stage-bottom) - var(--space-2) * 2); }
/* On a phone the two docks share the floor and leave the canvas most of the screen: the dials at most a quarter of it, scrolling
   inside; the timeline starts at a quarter too (Chrome.openMove), its height the person's after that, through DialKit's handle. */
html[data-cawco-phone] .cawco-dock-dials { inset-block-start: auto; inset-inline: var(--space-3); inline-size: auto;
  inset-block-end: calc(var(--space-2) + var(--cawco-timeline-room) + var(--cawco-stage-bottom)); max-block-size: 25dvh; }
/* A decision page's Preview (runtime by=embed): its frames alone, one under another in the page's own flow, each at its own
   width from the embed's start (the decision page's words stand on the same edge), one wider than the embed scaled down to
   fit it (runtime fitToEmbed, CSS zoom), and on a desk one that would scale its words under 12px stops there and scrolls
   sideways in its frame (data-cawco-wide); the page
   holding it makes its frame as tall (CANVAS_EMBED_SIZE), and a wheel or a finger on it scrolls that page. A section that
   didn't load still says so; one holding none of the stories the embed names takes no place (data-cawco-none), and a named
   story no section holds is said once, in the embed's own place (runtime unnamedInEmbed). */
html.cawco-embed, html.cawco-embed body { block-size: auto; overflow-x: hidden; overflow-y: auto; }
/* An embed is no well: around a frame narrower than it stands the surface the decision page draws its Preview on (the
   host's Preview.svelte frame, surface-page), so no gutter of another colour shows beside a story. */
html.cawco-embed, html.cawco-embed body, html.cawco-embed .cawco-canvas { background: var(--surface-page); }
html.cawco-embed .cawco-canvas { position: static; inset: auto; overflow: visible; touch-action: auto; }
html.cawco-embed .cawco-world { position: static; inline-size: 100%; gap: var(--space-3); padding: 0; will-change: auto; }
html.cawco-embed .cawco-section { min-block-size: 0; gap: var(--space-3); }
html.cawco-embed .cawco-section[data-cawco-none] { display: none; }
html.cawco-embed :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status, .cawco-stand-in > .cawco-frame-words) { display: none; }
html.cawco-embed .cawco-grid { display: flex; flex-direction: column; align-items: start; gap: var(--space-3); }
html.cawco-embed .cawco-frame { gap: 0; min-inline-size: 0; max-inline-size: 100%; }
html.cawco-embed .cawco-frame[data-cawco-wide] { align-self: stretch; overflow-x: auto; overscroll-behavior-inline: contain; }
/* Its fade is the house edge fade at its full 40px on every width (DESIGN.md: over words cut mid-word a phone's 16px reads as
   a clip); a frame showing less than twice that has each fade cut to half of what it shows (the kit's caps), so the two meet
   in its middle and never cross into a hard edge. */
html.cawco-embed .cawco-frame[data-cawco-wide] { --fade-len: 40px; --fade-cap-start: 50%; --fade-cap-end: 50%; }
html.cawco-embed .cawco-stand-in-body { max-inline-size: 100%; }
`;

/** A CSS easing as the four numbers of its curve; a curve DialKit can't draw is read as linear. */
function bezierOf(easing: string): [number, number, number, number] {
  const named: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
  };
  const known = named[easing.trim()];
  if (known) {
    return known;
  }
  const numbers = easing.match(BEZIER)?.[1]?.split(",").map(Number);
  return numbers?.length === 4 && numbers.every(Number.isFinite)
    ? (numbers as [number, number, number, number])
    : [0, 0, 1, 1];
}
const BEZIER = /cubic-bezier\(([^)]+)\)/;
const CLIP_NAME = /[^A-Za-z0-9_]/g;

/**
 * DialKit drawn in CawCo's own tokens (DESIGN.md: its theme follows ours),
 * through its own custom properties, over its sheet's layer: every colour a
 * token that follows the page's scheme live (light-dark()), the house faces,
 * no weight past 500, our radii and shadows. The vendored file is untouched.
 */
const DIALKIT_THEME = `
.dialkit-root {
  --dial-surface: var(--surface-recess); --dial-surface-subtle: var(--surface-recess);
  --dial-surface-hover: var(--surface-hover); --dial-surface-active: var(--surface-pressed);
  --dial-text-root: var(--ink-strong); --dial-text-focus: var(--ink-strong); --dial-text-primary: var(--ink-strong);
  --dial-text-section: var(--ink-muted); --dial-text-label: var(--ink-muted); --dial-text-secondary: var(--ink-muted);
  --dial-text-tertiary: var(--ink-subtle);
  --dial-border: var(--border-hairline); --dial-border-hover: var(--border-control); --dial-focus-ring: var(--focus-ring);
  --dial-timeline-clip-overlay: transparent;
  --dial-glass-bg: var(--surface-raised); --dial-dropdown-bg: var(--surface-raised); --dial-backdrop-blur: 0px;
  --dial-radius: var(--radius-sm);
  --dial-shadow: var(--shadow-md); --dial-shadow-collapsed: var(--shadow-xs); --dial-shadow-dropdown: var(--shadow-overlay);
  font-family: var(--font-sans); color: var(--ink-strong);
}
.dialkit-root :is(.dialkit-folder-title, .dialkit-folder-title-root, .dialkit-shortcut-pill, .dialkit-shortcuts-title,
  .dialkit-shortcuts-row-key, .dialkit-timeline-title, .dialkit-timeline-label, .dialkit-timeline-loop-infinity,
  .dialkit-timeline-playhead-flag, .dialkit-timeline-popover-title) { font-weight: var(--weight-strong); }
.dialkit-root :is(.dialkit-slider-value, .dialkit-slider-input, .dialkit-shortcuts-row-key) { font-family: var(--font-mono); font-variant-ligatures: none; }
.dialkit-root .dialkit-toggle-thumb { background: var(--surface-lift); box-shadow: var(--shadow-raised); }
/* DialKit fixes its timeline to the viewport's foot (12px up), over the canvas's foot and frames: it stands in our dock instead, above the foot. */
.cawco-dock-timeline .dialkit-timeline { position: static; }
.dialkit-root .dialkit-timeline-dock { border-radius: var(--radius-lg); }
.dialkit-root .dialkit-toggle[data-checked="true"] .dialkit-toggle-track { background: var(--brand-solid); }
`;

/** DialKit's vanilla build, its stylesheet and nothing else, loaded once from the stage. */
let dialKit: Promise<DialKitGlobal> | undefined;
const loadDialKit = (): Promise<DialKitGlobal> => {
  dialKit ??= (async () => {
    const css = await (
      await fetch(new URL("dialkit.css", location.href))
    ).text();
    const style = document.createElement("style");
    style.dataset.cawcoDialkit = "";
    // DialKit's sheet in a layer of its own under the page's: the theme below (unlayered) wins whatever its selectors.
    style.textContent = `@layer dialkit {\n${css}\n}\n${DIALKIT_THEME}`;
    document.head.append(style);
    await new Promise<void>((done, fail) => {
      const script = document.createElement("script");
      script.src = new URL("dialkit.js", location.href).href;
      script.onload = () => done();
      script.onerror = () =>
        fail(new Error("DialKit did not load from the stage."));
      document.head.append(script);
    });
    if (!window.DialKit) {
      throw new Error("DialKit loaded without its global.");
    }
    return window.DialKit;
  })();
  return dialKit;
};

export class Chrome {
  readonly #o: ChromeOptions;
  #timeline: TimelineHandle | null = null;
  #dock: HTMLElement | null = null;
  /** DialKit's two roots, as their own handles: each takes the page's scheme its own way (scheme). */
  #dialRoot: { element: HTMLElement } | null = null;
  #timelineRoot: { update: (next: Record<string, unknown>) => void } | null =
    null;
  /** Whether the dials stand; whether the page is a phone's; whether it is embedded or a map's card (no docks). */
  readonly #flags: { bare: boolean; dialed: boolean; phone: boolean } = {
    bare: false,
    dialed: false,
    phone: false,
  };

  constructor(options: ChromeOptions) {
    this.#o = options;
    const page = document.createElement("style");
    page.dataset.cawcoCanvas = "";
    page.textContent = `${options.faces}\n${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${options.edgeFade}\n${PAGE_CSS}`;
    document.head.append(page);
    this.#measure();
  }

  readonly #sizes = new ResizeObserver(() => this.#measure());

  /**
   * The page's scheme turned (runtime's one subscription, scheme.ts): each
   * DialKit root takes it its own way, the timeline's through its `update`,
   * the dials' (which has none) on the attribute it reads.
   */
  scheme(scheme: PageScheme): void {
    this.#timelineRoot?.update({ theme: scheme });
    if (this.#dialRoot) {
      this.#dialRoot.element.dataset.theme = scheme;
    }
  }

  /** The page as a map's live card or a decision page's Preview: its frames alone, no dock. */
  bare(): void {
    this.#flags.bare = true;
  }

  /**
   * The room each dock standing over the canvas takes, so no frame is ever
   * drawn under it: at the floor, a move's timeline and a phone's dials
   * (`--cawco-floor`, the timeline's own share `--cawco-timeline-room` for
   * the dials stacked over it); at the inline end, a desk's dials
   * (`--cawco-end`).
   */
  #measure(): void {
    const root = document.documentElement;
    const px = (value: string) =>
      Number.parseFloat(getComputedStyle(root).getPropertyValue(value)) || 0;
    const gap = px("--space-2");
    const inset = px("--space-3");
    const box = (el: Element | null) =>
      el?.getBoundingClientRect() ?? new DOMRect();
    const timeline = box(document.getElementById("cawco-dock-timeline"));
    const dials = box(document.getElementById("cawco-dock-dials"));
    const { phone } = this.#flags;
    const timelineRoom = timeline.height > 0 ? timeline.height + gap : 0;
    const dialsAtFloor = phone && dials.height > 0 ? dials.height + gap : 0;
    const dialsAtEnd = !phone && dials.width > 0 ? dials.width + inset * 2 : 0;
    const room: Record<string, number> = {
      "--cawco-timeline-room": timelineRoom,
      "--cawco-floor":
        timelineRoom + dialsAtFloor + (timelineRoom || dialsAtFloor ? gap : 0),
      "--cawco-end": dialsAtEnd,
    };
    for (const [name, value] of Object.entries(room)) {
      root.style.setProperty(name, `${value}px`);
    }
  }

  /** A duration token's milliseconds, from the page's tokens. */
  duration(token: string, fallback: number): number {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
    const ms = value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
    return Number.isFinite(ms) && ms > 0 ? ms : fallback;
  }

  /** The agent's dials, once the first frames stand: they read what the frames draw with. */
  dialsOnce(anyFrame: boolean): void {
    if (
      this.#flags.bare ||
      this.#flags.dialed ||
      !this.#o.spec.dials?.length ||
      !anyFrame
    ) {
      return;
    }
    this.#flags.dialed = true;
    this.#dials(this.#o.spec.dials).catch(failed);
  }

  /** Desk or phone, by the page's width: where the docks stand. */
  layout(): void {
    this.#flags.phone = !this.#flags.bare && windowWidth() < PHONE_MAX;
    document.documentElement.toggleAttribute(
      "data-cawco-phone",
      this.#flags.phone
    );
    this.#measure();
  }

  /** The move's timeline taken down: the state kept has no move into it, or one that runs no animation. */
  closeMove(): void {
    this.#timeline?.destroy();
    this.#timeline = null;
    this.#dock?.replaceChildren();
    this.#dock?.remove();
    this.#dock = null;
    this.#timelineRoot = null;
    this.#measure();
  }

  /**
   * DialKit starts its timeline 400px tall and keeps its height inline, the
   * person's to change with its resize handle (a separator that steps 20px
   * on each arrow key): on a phone it starts at `most` instead, stepped down
   * through that same handle, so the person can still make it taller.
   */
  #timelineStartsAt(dock: HTMLElement, most: number): void {
    const handle = dock.querySelector<HTMLElement>(
      ".dialkit-timeline-resize-handle"
    );
    const inner = dock.querySelector<HTMLElement>(".dialkit-timeline-dock");
    if (!(handle && inner)) {
      return;
    }
    const now = Number.parseFloat(getComputedStyle(inner).maxHeight);
    const steps = Number.isFinite(now)
      ? Math.max(0, Math.ceil((now - most) / TIMELINE_STEP))
      : 0;
    for (let step = 0; step < steps; step += 1) {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    }
  }

  /** The dock DialKit draws into, made once, in the page (DialKit's own CSS is scoped to its classes); its size takes its room from the canvas. */
  #dockOf(kind: "dials" | "timeline"): HTMLElement {
    const id = `cawco-dock-${kind}`;
    let dock = document.getElementById(id);
    if (!dock) {
      dock = document.createElement("div");
      dock.id = id;
      dock.className = `cawco-dock-${kind}`;
      document.body.append(dock);
      this.#sizes.observe(dock);
    }
    return dock;
  }

  /**
   * A move's timeline: the move played in its destination's frame, each
   * animation it fired a clip at its own start, length and curve, the
   * playhead seeking the engine's own animations; the person's tuned
   * timing previews on them at once and goes to the artifact as `tuned`.
   */
  async openMove(file: string, to: string): Promise<void> {
    const played = await this.#o.playVisible(file, to);
    if (!played) {
      return;
    }
    const kit = await loadDialKit();
    this.#timeline?.destroy();
    if (!this.#dock) {
      this.#dock = this.#dockOf("timeline");
      this.#timelineRoot = kit.createDialTimelineRoot({
        target: this.#dock,
        theme: pageScheme(),
      });
      if (this.#flags.phone) {
        this.#timelineStartsAt(this.#dock, windowHeight() / 4);
      }
    }
    const clips: Record<string, unknown> = {};
    const names = played.replays.map((one, at) => {
      const name = `${at + 1}_${one.read.target}_${one.read.property}`
        .replace(CLIP_NAME, "_")
        .slice(0, 60);
      const seconds = (ms: number) => Math.max(0.01, ms / 1000);
      clips[name] = {
        at: (one.read.start + one.read.delay) / 1000,
        duration: seconds(one.read.duration),
        from: { t: 0 },
        to: { t: 1 },
        transition: {
          type: "easing",
          duration: seconds(one.read.duration),
          ease: bezierOf(one.read.easing),
        },
      };
      return name;
    });
    const move = `${played.move.from} → ${played.move.to}`;
    const timeline = kit.createDialTimeline(
      `${played.move.from} to ${played.move.to}`,
      clips,
      {
        autoplay: false,
        id: `move:${file}|${to}`,
      }
    );
    this.#timeline = timeline;
    // The canvas has just given the timeline its room: the stage stands the kept state in what is left.
    this.#measure();
    let kept: ReturnType<typeof setTimeout> | undefined;
    timeline.subscribe((values) => {
      const tuned = kit.DialStore.getValues(timeline.id);
      const said: {
        animation: string;
        delay: number;
        duration: number;
        easing: string;
        move: string;
      }[] = [];
      played.replays.forEach((one, at) => {
        const name = names[at] as string;
        const start =
          Number(
            tuned[`${name}.at`] ?? (one.read.start + one.read.delay) / 1000
          ) * 1000;
        const duration =
          Number(tuned[`${name}.duration`] ?? one.read.duration / 1000) * 1000;
        const curve = tuned[`${name}.transition`] as
          { ease?: number[] } | undefined;
        // The engine's own easing until the person moves the curve off it.
        const easing =
          curve?.ease?.length === 4 &&
          curve.ease.join() !== bezierOf(one.read.easing).join()
            ? `cubic-bezier(${curve.ease.join(", ")})`
            : one.read.easing;
        if (one.animation) {
          one.animation.effect?.updateTiming({
            delay: start,
            duration: Math.max(1, duration),
            easing,
          });
          one.animation.currentTime = values.time * 1000;
        }
        said.push({
          move,
          animation: `${one.read.target} ${one.read.property}`,
          delay: Math.round(start),
          duration: Math.round(duration),
          easing,
        });
      });
      clearTimeout(kept);
      kept = setTimeout(() => {
        const changed = said.filter((one, at) => {
          const read = played.replays[at]?.read;
          return (
            read &&
            (one.duration !== Math.round(read.duration) ||
              one.delay !== Math.round(read.start + read.delay) ||
              one.easing !== read.easing)
          );
        });
        if (changed.length > 0) {
          bridge()
            ?.set("tuned", changed)
            .catch(() => undefined);
        }
        (window as unknown as { __cawcoTuned?: unknown }).__cawcoTuned = said;
      }, 300);
    });
    // The kept state stands as it ends: the playhead at the move's end, Play plays it from the start.
    timeline.seek(
      Math.max(
        0,
        ...played.replays.map(
          (one) => (one.read.start + one.read.delay + one.read.duration) / 1000
        )
      )
    );
  }

  /** The agent's dials: DialKit's panel, each value set on every frame (a CSS variable) or through `update` (an arg), kept in the artifact. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each dial kind's DialKit control from the value the frames draw with, then kept in step both ways
  async #dials(dials: CanvasDial[]): Promise<void> {
    const kit = await loadDialKit();
    const dock = this.#dockOf("dials");
    this.#dialRoot = kit.createDialRoot({
      mode: "inline",
      target: dock,
      theme: pageScheme(),
    });
    const config: Record<string, unknown> = {};
    const first = document.querySelector<HTMLElement>(".cawco-frame-body");
    const now = (dial: CanvasDial): unknown => {
      if ("cssVar" in dial.target && first) {
        const raw = getComputedStyle(first)
          .getPropertyValue(dial.target.cssVar)
          .trim();
        return dial.kind === "number" ? Number.parseFloat(raw) : raw;
      }
      return undefined;
    };
    const values: Record<string, unknown> = {};
    for (const dial of dials) {
      const value = now(dial);
      values[dial.name] = value;
      if (dial.kind === "number") {
        const min = dial.min ?? 0;
        const max =
          dial.max ??
          Math.max(
            1,
            (typeof value === "number" && Number.isFinite(value) ? value : 1) *
              4
          );
        const start =
          typeof value === "number" && Number.isFinite(value) ? value : min;
        values[dial.name] = start;
        config[dial.name] = [
          start,
          min,
          max,
          ...(dial.step ? [dial.step] : []),
        ];
      } else if (dial.kind === "color") {
        config[dial.name] = {
          type: "color",
          default: hexOf(String(value ?? "#000000")),
        };
      } else if (dial.kind === "select") {
        config[dial.name] = {
          type: "select",
          options: dial.options ?? [],
          default: dial.options?.includes(String(value))
            ? value
            : dial.options?.[0],
        };
      } else {
        config[dial.name] = value === "true" || value === true;
      }
    }
    const panel = kit.createDialKit("Dials", config, { id: "cawco-dials" });
    let heard = false;
    bridge()?.on("picks", (picks) => {
      const kept = picks.dials?.value;
      if (!heard && kept && typeof kept === "object") {
        heard = true;
        kit.DialStore.updateValues(panel.id, kept as Record<string, unknown>);
      }
    });
    let saving: ReturnType<typeof setTimeout> | undefined;
    let said = JSON.stringify(values);
    panel.subscribe((next) => {
      // DialKit says its values as it subscribes: the frames already draw them; only a change is applied.
      const told = JSON.stringify(next);
      if (told === said) {
        return;
      }
      said = told;
      this.#o.applyDials(next);
      (window as unknown as { __cawcoDials?: unknown }).__cawcoDials = next;
      clearTimeout(saving);
      saving = setTimeout(
        () =>
          bridge()
            ?.set("dials", next)
            .catch(() => undefined),
        400
      );
    });
  }
}

/** What a promise the chrome does not wait on threw: said on the console, where the page's errors are read. */
const failed = (error: unknown) => console.error("[cawco] canvas:", error);

/** A colour as `#rrggbb`, by the engine's own parse. */
function hexOf(color: string): string {
  const paint = document.createElement("canvas").getContext("2d");
  if (!paint) {
    return "#000000";
  }
  paint.fillStyle = "#000000";
  paint.fillStyle = color;
  const said = String(paint.fillStyle);
  return said.startsWith("#") ? said : "#000000";
}
