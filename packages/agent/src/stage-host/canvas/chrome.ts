/**
 * The canvas's own chrome (component canvas §2), in a shadow root so the
 * project's CSS never reaches it and it never reaches the project's: the
 * name when the page stands alone (framed in a panel or the artifact's own
 * tab, the host's head names it and says its ask under it, so the band says
 * neither), the crumb of the frame in view, an outline of sections and frames
 * that moves the canvas (J and K step), the count line, and on a phone one
 * frame at a time with a state strip and a swipe that plays the move. The
 * move's timeline and the agent's dials are DialKit's own (vendored at
 * packages/hub/skills/decision-page/kit/vendor/dialkit, MIT, Josh Puckett),
 * docked in the page. Drawn on CawCo's tokens (DESIGN.md).
 */
import type {
  AnimationRead,
  CanvasDial,
  CanvasSpec,
  MoveRender,
  RenderReport,
} from "@cawco/core/stage";
import { bridge, type Section, type View } from "./runtime";
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
  canvas: HTMLElement;
  /** The house faces' `@font-face` rules, set in the page: a shadow root's own are not heard. */
  faces: string;
  go: (key: string) => void;
  playVisible: (
    file: string,
    to: string
  ) => Promise<{
    move: MoveRender;
    replays: { animation: Animation | null; read: AnimationRead }[];
  } | null>;
  resetLayout: () => void;
  sections: () => Section[];
  setView: (next: Partial<View>) => void;
  spec: CanvasSpec;
  tokens: string;
  view: View;
  world: () => { x: number; y: number; z: number };
}

/** A pane narrower than this is a phone's: one frame at a time. DESIGN.md's breakpoint. */
const PHONE_MAX = 640;
const SWIPE_PX = 48;
/** DialKit's timeline handle's step, per arrow key (vendor/dialkit browser.global.js, `createDialTimelineRoot`). */
const TIMELINE_STEP = 20;

/** Solar's glyphs the chrome draws (24px grid): the linear chevrons and the duotone sort-vertical (DESIGN.md, Icons). */
const GLYPHS = {
  back: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 5L9 12L15 19"/>',
  ahead:
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5L15 12L9 19"/>',
  sort: '<g fill="currentColor"><path d="M20 10.875C20.3013 10.875 20.5733 10.6948 20.6907 10.4173C20.8081 10.1399 20.7482 9.81916 20.5384 9.60289L16.5384 5.47789C16.3972 5.33222 16.2029 5.25 16 5.25C15.7971 5.25 15.6029 5.33222 15.4616 5.47789L11.4616 9.60289C11.2519 9.81916 11.1919 10.1399 11.3093 10.4173C11.4268 10.6948 11.6988 10.875 12 10.875H15.25V18C15.25 18.4142 15.5858 18.75 16 18.75C16.4142 18.75 16.75 18.4142 16.75 18L16.75 10.875H20Z"/><path d="M12 13.125C12.3013 13.125 12.5733 13.3052 12.6907 13.5827C12.8081 13.8601 12.7482 14.1808 12.5384 14.3971L8.53844 18.5221C8.39719 18.6678 8.20293 18.75 8.00002 18.75C7.79711 18.75 7.60285 18.6678 7.46159 18.5221L3.46159 14.3971C3.25188 14.1808 3.19192 13.8601 3.30934 13.5827C3.42676 13.3052 3.69877 13.125 4.00002 13.125H7.25002L7.25002 6C7.25002 5.58579 7.5858 5.25 8.00002 5.25C8.41423 5.25 8.75002 5.58579 8.75002 6L8.75002 13.125L12 13.125Z" opacity=".5"/></g>',
};

/** One of {@link GLYPHS}, 16px, hidden from the reader: its control's words name it. */
function glyph(name: keyof typeof GLYPHS): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = GLYPHS[name];
  return svg;
}

const CHROME_CSS = `
:host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; color-scheme: inherit;
  font: var(--type-body); color: var(--ink-strong); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
svg { inline-size: 16px; block-size: 16px; flex: none; }
/* The band and, on a phone, the strip under it: one raised head in flow, so
   the strip stands under the band, and one edge at its foot, the well's. */
.head { pointer-events: auto; position: absolute; inset-inline: 0; inset-block-start: 0; display: flex; flex-direction: column;
  background: var(--surface-raised); border-block-end: 1px solid var(--border-well); box-shadow: var(--shadow-xs); }
.band { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1) var(--space-3); padding: var(--space-2) var(--space-3); }
.name { font: var(--type-label); color: var(--ink-strong); min-width: 0; overflow-wrap: anywhere; }
.crumb { grid-column: 1; font: var(--type-meta); color: var(--ink-muted); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crumb .num { font-variant-numeric: tabular-nums; }
.crumb .said { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.tools { grid-column: 2; grid-row: 1 / span 2; align-self: center; display: flex; align-items: center; gap: var(--space-1); }
.ghost { all: unset; box-sizing: border-box; position: relative; font: var(--type-label); color: var(--ink-strong); block-size: 30px;
  padding: 0 var(--space-2); border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; }
@media (hover: hover) { .ghost:not([aria-pressed="true"]):hover { background: var(--surface-hover); } }
/* Pressed is the kit Toggle's on step, never the hover's. */
.ghost[aria-pressed="true"] { background: var(--surface-pressed); }
.ghost:focus-visible, .chip:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
.outline { pointer-events: auto; position: absolute; inset-block: var(--band) calc(var(--foot) + var(--cawco-floor)); inset-inline-end: 0;
  inline-size: min(280px, 80vw); overflow: auto; overscroll-behavior: contain; background: var(--surface-raised);
  border-inline-start: 1px solid var(--border-well); padding: var(--space-2) 0; }
.outline[hidden] { display: none; }
.outline h3 { margin: var(--space-2) var(--space-3) var(--space-1); font: var(--type-caps); color: var(--ink-muted); overflow-wrap: anywhere; }
.outline h3 code { font: var(--type-code); font-variant-ligatures: none; }
.row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: var(--space-2); align-items: center;
  inline-size: 100%; min-block-size: 32px; padding: var(--space-1) var(--space-3); cursor: pointer; font: var(--type-meta); color: var(--ink-strong); }
.row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row small { font: var(--type-meta); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
/* The frame in view: the selected pair, never the hover's fill. */
.row[aria-current="true"], .row[aria-current="true"] small { background: var(--selected-bg); color: var(--selected-ink); }
@media (hover: hover) { .row:not([aria-current="true"]):hover { background: var(--surface-hover); } }
/* A row stands flush in a scroller: its ring is inset. */
.row:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-inset); }
.foot { pointer-events: auto; position: absolute; inset-inline: 0; inset-block-end: 0; padding: var(--space-1) var(--space-3);
  font: var(--type-meta); color: var(--ink-muted); background: var(--surface-raised); border-block-start: 1px solid var(--border-well);
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.strip { display: none; gap: var(--space-2); align-items: center; flex-wrap: wrap; padding: 0 var(--space-3) var(--space-2); }
:host([data-phone]) .strip { display: flex; }
/* A map's live card: the frames alone. */
:host([data-card]) :is(.head, .outline, .foot, .steps) { display: none; }
:host([data-phone]) .outline { inset-inline: 0; inline-size: auto; }
/* The story picker: the input recipe as a select trigger (DESIGN.md, Inputs and fields), its sort-vertical glyph at the end. */
.pick { position: relative; display: inline-flex; align-items: center; min-inline-size: 0; max-inline-size: 60vw; }
.pick select { appearance: none; font: var(--type-body); color: var(--ink-strong); background: var(--surface-raised);
  border: 1px solid var(--border-button-outline); border-radius: var(--radius-md); box-shadow: var(--shadow-xs); block-size: 36px;
  min-inline-size: 0; max-inline-size: 100%; padding-block: 0; padding-inline: var(--space-3) calc(var(--space-2) * 2 + 16px);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.pick select:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-inset); }
.pick svg { position: absolute; inset-inline-end: var(--space-2); pointer-events: none; color: var(--ink-muted); }
/* The state chips: the option chip, 30px at the item radius; the chosen one takes the coral edge on its recess. */
.chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.chip { all: unset; box-sizing: border-box; position: relative; font: var(--type-label); color: var(--ink-strong); block-size: 30px;
  padding: 0 var(--space-3); border-radius: var(--radius-sm); display: inline-flex; align-items: center; background: var(--surface-recess);
  cursor: pointer; }
.chip[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--brand-solid); }
.steps { pointer-events: auto; position: absolute; inset-inline: 0; inset-block-end: calc(var(--foot) + var(--cawco-floor)); display: none;
  justify-content: space-between; padding: var(--space-2) var(--space-3); }
:host([data-phone]) .steps { display: flex; }
.steps .ghost { block-size: 44px; background: var(--surface-raised); box-shadow: var(--shadow-xs); }
/* The 44 Touch Rule: under a finger every control reaches 44px through its ::after, its drawn size kept. */
@media (pointer: coarse) {
  .ghost::after, .chip::after { content: ""; position: absolute;
    inset-block: min(0px, calc((100% - 44px) / 2)); inset-inline: min(0px, calc((100% - 44px) / 2)); }
  .chips { gap: var(--space-2); }
  .pick select { block-size: 44px; font-size: 16px; }
}
@media (prefers-reduced-motion: no-preference) {
  .ghost, .chip, .row { transition: background-color var(--dur-control) var(--ease-out), box-shadow var(--dur-control) var(--ease-out); }
}
`;

/** Light-DOM chrome: frames, labels, section heads, edges and the docks, on classes no project writes. */
export const PAGE_CSS = `
/* The room the chrome takes from the canvas (Chrome #reserve): at the floor (a move's timeline, a phone's dials),
   at the inline end (a desk's outline and dials), and the outline's own width; none until any of them stands. */
html.cawco-canvas-page { color-scheme: light dark; --cawco-floor: 0px; --cawco-end: 0px; --cawco-outline: 0px; --cawco-timeline-room: 0px; }
html.cawco-canvas-page[data-theme="light"] { color-scheme: light; }
html.cawco-canvas-page[data-theme="dark"] { color-scheme: dark; }
/* The page is the well the frames stand in (surface-well): the frame recesses, each frame's own page reads raised on it. */
html.cawco-canvas-page, html.cawco-canvas-page body { margin: 0; block-size: 100%; overflow: hidden; background: var(--surface-well); }
/* The canvas begins under the head and ends where the rest of the chrome begins (the foot, the docks, a desk's outline): no frame
   is ever drawn under any of it, whatever the head grows to. */
.cawco-canvas { position: fixed; inset-block: var(--band) calc(var(--foot) + var(--cawco-floor)); inset-inline: 0 var(--cawco-end); overflow: hidden;
  touch-action: none; background: var(--surface-well); }
/* The width a frame without one answers its story's width conditions at (canvas width.ts): the canvas's own, as the window
   was. A frame with a width answers its own body's. */
.cawco-canvas { container: cawco-width / inline-size; }
.cawco-world { position: absolute; inset-block-start: 0; inset-inline-start: 0; transform-origin: 0 0; display: flex; flex-direction: column;
  gap: var(--space-8); padding-block-end: 160px; will-change: transform; --cawco-gutter: 0px; padding-inline-start: var(--cawco-gutter); }
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
.cawco-frame-label { all: unset; box-sizing: border-box; display: grid; gap: var(--space-row); max-inline-size: 360px; cursor: grab; border-radius: var(--radius-xs);
  padding: var(--space-row) var(--space-1); }
.cawco-frame-label:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset); }
.cawco-frame-words { font: var(--type-label); color: var(--ink-strong); overflow-wrap: anywhere; }
.cawco-frame-small { font: var(--type-meta); color: var(--ink-muted); overflow-wrap: anywhere; }
.cawco-frame-label[data-cawco-unnamed] .cawco-frame-words { font: var(--type-meta); color: var(--ink-muted); }
.cawco-frame-label[data-cawco-picked] { box-shadow: inset 0 0 0 1px var(--brand-solid); }
/* The frame in view is said by its label row, in the selected pair. */
.cawco-frame[data-cawco-current] > .cawco-frame-label { background: var(--selected-bg); }
.cawco-frame[data-cawco-current] > .cawco-frame-label :is(.cawco-frame-words, .cawco-frame-small) { color: var(--selected-ink); }
/* The inspector's story: one solid neutral edge round its frames (3:1); the focus ring is for focus alone. */
.cawco-frame[data-cawco-selected] > .cawco-frame-body { outline: var(--focus-ring-width) solid var(--border-button-outline); outline-offset: var(--focus-ring-offset); }
.cawco-frame[data-cawco-edited] .cawco-frame-small::after { content: " · edited"; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-frame-status { font: var(--type-meta); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.cawco-frame-status[data-state="failed"] { color: var(--status-fail-ink); }
.cawco-edges { position: absolute; inset: 0; inline-size: 1px; block-size: 1px; overflow: visible; pointer-events: none; z-index: 1; }
.cawco-edge { fill: none; stroke: var(--ink-muted); stroke-width: 1.5; }
.cawco-edge-move { stroke: var(--brand-solid); stroke-width: 2; pointer-events: stroke; cursor: pointer; }
.cawco-edge-group { stroke-dasharray: 3 4; }
.cawco-edges marker path { fill: context-stroke; }
.cawco-edge-label { font: var(--type-meta); fill: var(--ink-muted); paint-order: stroke; stroke: var(--surface-well); stroke-width: 4px; }
.cawco-edge-label[data-cawco-move] { pointer-events: auto; cursor: pointer; fill: var(--brand-ink); }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
/* The docks stand as chrome, never on each other: a move's timeline across the floor over the foot; on a desk the dials at the
   inline end under the band, left of an open outline, above the timeline; on a phone the dials across the floor over the timeline. */
.cawco-dock-timeline { position: fixed; inset-inline: var(--space-3); inset-block-end: calc(var(--foot) + var(--space-2)); z-index: 2147483001; }
.cawco-dock-dials { position: fixed; z-index: 2147483001; overflow: auto; overscroll-behavior: contain;
  inset-block-start: calc(var(--band) + var(--space-2)); inset-inline-end: calc(var(--cawco-outline) + var(--space-3)); inline-size: 280px;
  max-block-size: calc(100dvh - var(--band) - var(--foot) - var(--cawco-floor) - var(--space-2) * 2); }
/* On a phone the two docks share the floor and leave the canvas most of the screen: the dials at most a quarter of it, scrolling
   inside; the timeline starts at a quarter too (Chrome.openMove), its height the person's after that, through DialKit's handle. */
html[data-cawco-phone] .cawco-dock-dials { inset-block-start: auto; inset-inline: var(--space-3); inline-size: auto;
  inset-block-end: calc(var(--foot) + var(--space-2) + var(--cawco-timeline-room)); max-block-size: 25dvh; }
/* A decision page's Preview (runtime by=embed): its frames alone, one under another in the page's own flow, each at its own
   size from the embed's start (the decision page's words stand on the same edge), never scaled; the page holding it makes
   its frame as tall and as wide as its widest story (CANVAS_EMBED_SIZE, runtime sayShape) and scrolls it sideways where its
   room is narrower, and a wheel or a finger on it scrolls that page. A section that
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
html.cawco-embed :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status, .cawco-edges, .cawco-stand-in > .cawco-frame-words) { display: none; }
html.cawco-embed .cawco-grid { display: flex; flex-direction: column; align-items: start; gap: var(--space-3); }
html.cawco-embed .cawco-frame { gap: 0; min-inline-size: 0; }
html.cawco-embed .cawco-stand-in-body { max-inline-size: 100%; }
html[data-cawco-phone][data-cawco-current] .cawco-frame:not([data-cawco-shown]), html[data-cawco-phone] .cawco-colhead, html[data-cawco-phone][data-cawco-current] .cawco-section:not([data-cawco-shown]) { display: none; }
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
  readonly #root: ShadowRoot;
  readonly #host: HTMLElement;
  readonly #head: HTMLElement;
  readonly #band: HTMLElement;
  readonly #crumb: HTMLElement;
  readonly #outline: HTMLElement;
  readonly #foot: HTMLElement;
  readonly #strip: HTMLElement;
  readonly #steps: HTMLElement;
  #current: string | null = null;
  #timeline: TimelineHandle | null = null;
  #dock: HTMLElement | null = null;
  /** DialKit's two roots, as their own handles: each takes the page's scheme its own way (scheme). */
  #dialRoot: { element: HTMLElement } | null = null;
  #timelineRoot: { update: (next: Record<string, unknown>) => void } | null =
    null;
  /** Whether a look for the frame in view waits on the next frame; whether the page is a phone's; whether the dials stand; whether it is embedded. */
  readonly #flags: {
    dialed: boolean;
    embedded: boolean;
    pending: boolean;
    phone: boolean;
  } = {
    dialed: false,
    embedded: false,
    pending: false,
    phone: false,
  };

  constructor(options: ChromeOptions) {
    this.#o = options;
    const page = document.createElement("style");
    page.dataset.cawcoCanvas = "";
    page.textContent = `${options.faces}\n${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${PAGE_CSS}`;
    document.head.append(page);
    this.#host = document.createElement("div");
    this.#host.id = "cawco-chrome";
    document.body.append(this.#host);
    this.#root = this.#host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${options.tokens.replaceAll(":root", ":host")}\n${CHROME_CSS}`;
    this.#band = document.createElement("header");
    this.#band.className = "band";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = options.spec.name ?? "Component canvas";
    // In a panel (or the artifact's own tab) the host's head names the canvas: the band would say it twice.
    name.hidden = window.top !== window;
    this.#crumb = document.createElement("div");
    this.#crumb.className = "crumb";
    this.#crumb.setAttribute("aria-live", "polite");
    const tools = document.createElement("div");
    tools.className = "tools";
    const outlineButton = this.#button("Outline", () => {
      this.#outline.hidden = !this.#outline.hidden;
      outlineButton.setAttribute("aria-pressed", String(!this.#outline.hidden));
    });
    outlineButton.setAttribute("aria-pressed", "false");
    outlineButton.title = "Outline: every section and frame (J and K step)";
    const reset = this.#button("Reset layout", () => options.resetLayout());
    tools.append(outlineButton, reset);
    this.#band.append(name, tools, this.#crumb);
    this.#strip = document.createElement("div");
    this.#strip.className = "strip";
    this.#head = document.createElement("div");
    this.#head.className = "head";
    this.#head.append(this.#band, this.#strip);
    this.#outline = document.createElement("nav");
    this.#outline.className = "outline";
    this.#outline.setAttribute("aria-label", "Outline");
    this.#outline.hidden = true;
    this.#foot = document.createElement("div");
    this.#foot.className = "foot";
    this.#steps = document.createElement("div");
    this.#steps.className = "steps";
    this.#root.append(
      style,
      this.#head,
      this.#outline,
      this.#steps,
      this.#foot
    );
    // What stands over the canvas (the head as its chips wrap, the foot, the outline, the docks) is measured as it changes size, and the canvas ends where it begins.
    this.#measure();
    this.#sizes.observe(this.#head);
    this.#sizes.observe(this.#foot);
    this.#sizes.observe(this.#outline);
    window.addEventListener("keydown", (event) => this.#key(event));
    this.#swipes();
  }

  #button(words: string, run: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = words;
    button.addEventListener("click", run);
    return button;
  }

  /** Whether the page is a phone's: one frame at a time. */
  phone(): boolean {
    return this.#flags.phone;
  }

  /** The head's height, the band's and on a phone the strip's under it: where the canvas begins (`--band`). */
  top(): number {
    return this.#head.getBoundingClientRect().height;
  }

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

  /**
   * The page as a map's live card (runtime `by=map`): the frames alone,
   * fitted to the card's view. The band, the foot, the outline and the
   * steps go (so the room they take measures none); the panel's map says
   * what the card is.
   */
  asCard(): void {
    this.#host.toggleAttribute("data-card", true);
    this.#measure();
  }

  /**
   * The page as a decision page's Preview (runtime `by=embed`): a card's
   * page with no chrome, never a phone's one frame at a time whatever its
   * width, its frames in the page's own flow (PAGE_CSS `cawco-embed`).
   */
  asEmbed(): void {
    this.#flags.embedded = true;
    this.asCard();
  }

  readonly #sizes = new ResizeObserver(() => this.#measure());

  /**
   * The room each piece of chrome standing over the canvas takes, so no
   * frame is ever drawn under it: the head (`--band`) and the foot
   * (`--foot`); at the floor over the foot, a move's timeline and a phone's
   * dials (`--cawco-floor`, the timeline's own share `--cawco-timeline-room`
   * for the dials stacked over it); at the inline end, a desk's open outline
   * (`--cawco-outline`) and its dials beside it (`--cawco-end`).
   */
  #measure(): void {
    const px = (value: string) =>
      Number.parseFloat(getComputedStyle(this.#host).getPropertyValue(value));
    const gap = px("--space-2");
    const inset = px("--space-3");
    const box = (el: Element | null) =>
      el?.getBoundingClientRect() ?? new DOMRect();
    const timeline = box(document.getElementById("cawco-dock-timeline"));
    const dials = box(document.getElementById("cawco-dock-dials"));
    const outline = box(this.#outline);
    const { phone } = this.#flags;
    const timelineRoom = timeline.height > 0 ? timeline.height + gap : 0;
    const dialsAtFloor = phone && dials.height > 0 ? dials.height + gap : 0;
    const outlineWide = !phone && outline.width > 0 ? outline.width : 0;
    const dialsAtEnd = !phone && dials.width > 0 ? dials.width + inset * 2 : 0;
    const room: Record<string, number> = {
      "--band": this.top(),
      "--foot": box(this.#foot).height,
      "--cawco-timeline-room": timelineRoom,
      "--cawco-floor":
        timelineRoom + dialsAtFloor + (timelineRoom || dialsAtFloor ? gap : 0),
      "--cawco-outline": outlineWide,
      "--cawco-end": outlineWide + dialsAtEnd,
    };
    for (const el of [this.#host, document.documentElement]) {
      for (const [name, value] of Object.entries(room)) {
        el.style.setProperty(name, `${value}px`);
      }
    }
  }

  /** A duration token's milliseconds, from the chrome's own tokens. */
  duration(token: string, fallback: number): number {
    const value = getComputedStyle(this.#host).getPropertyValue(token).trim();
    const ms = value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
    return Number.isFinite(ms) && ms > 0 ? ms : fallback;
  }

  /** The frames in reading order: sections, then rows, then columns. */
  #frames(): { key: string; section: Section; words: string; small: string }[] {
    return this.#o.sections().flatMap((section) =>
      [...section.frames.values()]
        .sort(
          (a, b) =>
            Number(a.el.style.gridRow) - Number(b.el.style.gridRow) ||
            Number(a.el.style.gridColumn) - Number(b.el.style.gridColumn)
        )
        .map((frame) => ({
          key: frame.key,
          section,
          words: frame.story.label ?? frame.story.name,
          small: [
            frame.story.label && frame.story.label !== frame.story.name
              ? frame.story.name
              : "",
            frame.column.interaction === "rest" ? "" : frame.column.interaction,
          ]
            .filter(Boolean)
            .join(" · "),
        }))
    );
  }

  /** The outline, rebuilt: a heading per section, a row per frame. */
  outline(): void {
    this.#outline.replaceChildren();
    for (const section of this.#o.sections()) {
      const head = document.createElement("h3");
      const title = section.mod?.SHEET.meta.title;
      if (title) {
        head.textContent = title;
      } else {
        const file = document.createElement("code");
        file.textContent = section.file;
        head.append(file);
      }
      this.#outline.append(head);
      if (!section.loaded) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row";
        row.innerHTML = "<span>Not drawn yet: go to it</span>";
        row.addEventListener("click", () => section.el.scrollIntoView());
        this.#outline.append(row);
        continue;
      }
      for (const one of this.#frames().filter(
        (each) => each.section === section
      )) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row";
        row.dataset.key = one.key;
        const words = document.createElement("span");
        words.textContent = one.words;
        const small = document.createElement("small");
        small.textContent = one.small;
        row.append(words, small);
        row.addEventListener("click", () => this.#o.go(one.key));
        this.#outline.append(row);
      }
    }
    this.#phoneStrip();
    const [first] = this.#frames();
    if (this.#flags.phone && !this.#current && first) {
      this.#o.go(first.key);
      return;
    }
    // The rows are new: the frame in view marks its own again.
    if (this.#current) {
      this.current(this.#current);
    }
    this.where();
  }

  /** The frame nearest the view's middle, after a pan or zoom: the crumb and the outline say it. */
  where(): void {
    if (this.#flags.pending) {
      return;
    }
    this.#flags.pending = true;
    requestAnimationFrame(() => {
      this.#flags.pending = false;
      const box = this.#o.canvas.getBoundingClientRect();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      let best: { key: string; d: number } | null = null;
      for (const one of this.#frames()) {
        const el = one.section.frames.get(one.key)?.el;
        const rect = el?.getBoundingClientRect();
        if (!rect || rect.width === 0) {
          continue;
        }
        const d = Math.hypot(
          rect.x + rect.width / 2 - cx,
          rect.y + rect.height / 2 - cy
        );
        if (!best || d < best.d) {
          best = { key: one.key, d };
        }
      }
      if (best && best.key !== this.#current) {
        this.current(best.key);
      }
    });
  }

  /** Marks frame `key` as the one in view. */
  current(key: string): void {
    this.#current = key;
    document.documentElement.toggleAttribute("data-cawco-current", true);
    const one = this.#frames().find((each) => each.key === key);
    for (const row of this.#outline.querySelectorAll<HTMLElement>(".row")) {
      row.setAttribute("aria-current", String(row.dataset.key === key));
    }
    for (const section of this.#o.sections()) {
      for (const frame of section.frames.values()) {
        // Always marked: the crumb's "Frame N of M" points at it.
        frame.el.toggleAttribute("data-cawco-current", frame.key === key);
        frame.el.toggleAttribute("data-cawco-shown", frame.key === key);
      }
      section.el.toggleAttribute("data-cawco-shown", one?.section === section);
    }
    if (!one) {
      return;
    }
    // The crumb says the one thing nothing else on screen does: which of
    // the frames J and K stand on. Its sheet, story and state are the
    // section head's, the label's and the column's (the picker's and the
    // chips' on a phone); a reader hears them with it.
    const frame = one.section.frames.get(key);
    const all = this.#frames();
    const at = all.findIndex((each) => each.key === key) + 1;
    const place = document.createElement("span");
    place.className = "num";
    place.textContent = `Frame ${at} of ${all.length}`;
    const said = document.createElement("span");
    said.className = "said";
    said.textContent = `: ${[
      one.section.mod?.SHEET.meta.title ?? one.section.file,
      frame?.story.label ?? frame?.story.name ?? "",
      frame?.column.interaction ?? "",
      frame && frame.column.scheme !== "page" ? frame.column.scheme : "",
    ]
      .filter(Boolean)
      .join(", ")}`;
    this.#crumb.replaceChildren(place, said);
    this.#phoneStrip();
  }

  /** J and K step through the frames; nothing while a field has the keys. */
  #key(event: KeyboardEvent): void {
    const target = event.composedPath()[0] as HTMLElement | undefined;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      target?.closest?.("input,textarea,select,[contenteditable='true']")
    ) {
      return;
    }
    const steps: Record<string, number> = { j: 1, k: -1 };
    const step = steps[event.key] ?? 0;
    if (!step) {
      return;
    }
    const all = this.#frames();
    const at = all.findIndex((one) => one.key === this.#current);
    const next = all[Math.min(all.length - 1, Math.max(0, at + step))];
    if (next) {
      event.preventDefault();
      this.#o.go(next.key);
    }
  }

  /** The count line: frames, sections, how each drew, and the unnamed. The agent's dials once the first frames stand, from what they draw with. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the count line and each frame's status line from one report
  counts(report: RenderReport): void {
    if (
      !this.#flags.dialed &&
      this.#o.spec.dials?.length &&
      report.sections.some((one) => one.frames.length > 0)
    ) {
      this.#flags.dialed = true;
      this.#dials(this.#o.spec.dials).catch(failed);
    }
    const frames = report.sections.flatMap((one) => one.frames);
    const by = (state: string) =>
      frames.filter((one) => one.state === state).length;
    const bits = [
      `${frames.length} frame${frames.length === 1 ? "" : "s"} in ${this.#o.sections().length} section${this.#o.sections().length === 1 ? "" : "s"}`,
      `drawn ${by("drawn")}`,
    ];
    if (by("empty")) {
      bits.push(`${by("empty")} empty`);
    }
    if (by("failed")) {
      bits.push(`${by("failed")} failed`);
    }
    if (by("unshown")) {
      bits.push(`${by("unshown")} not shown at this width`);
    }
    if (report.unnamed.length) {
      bits.push(`${report.unnamed.length} unnamed`);
    }
    if (report.page.errors.length) {
      bits.push(
        `${report.page.errors.length} page error${report.page.errors.length === 1 ? "" : "s"}`
      );
    }
    this.#foot.textContent = bits.join(" · ");
    for (const section of this.#o.sections()) {
      const drawn = report.sections.find((one) => one.file === section.file);
      for (const frame of section.frames.values()) {
        const read = drawn?.frames.find(
          (one) =>
            one.story === frame.story.name &&
            one.interaction === frame.column.interaction &&
            frame.key.endsWith(`|${frame.column.scheme}|${frame.column.width}`)
        );
        const status = frame.el.querySelector<HTMLElement>(
          ".cawco-frame-status"
        );
        if (status && read) {
          status.dataset.state = read.state;
          status.textContent =
            read.state === "failed"
              ? `failed: ${read.error?.message ?? ""}${read.error?.file ? ` at ${read.error.file}:${read.error.line}:${read.error.column}` : ""}`
              : `${read.state} ${read.box.w}×${read.box.h}`;
        }
      }
    }
    if (!this.#current) {
      this.where();
    }
  }

  view(view: View): void {
    this.#phoneStrip(view);
  }

  /** Desk or phone, by the page's width. */
  layout(): void {
    this.#flags.phone = !this.#flags.embedded && windowWidth() < PHONE_MAX;
    this.#host.toggleAttribute("data-phone", this.#flags.phone);
    document.documentElement.toggleAttribute(
      "data-cawco-phone",
      this.#flags.phone
    );
    this.#phoneStrip();
    this.#measure();
    if (this.#flags.phone) {
      const first = this.#current ?? this.#frames()[0]?.key;
      if (first) {
        this.#o.go(first);
      }
    }
  }

  /** On a phone: the story picker and the state strip of the frame shown, and its neighbours. */
  #phoneStrip(_view?: View): void {
    if (!this.#flags.phone) {
      return;
    }
    const all = this.#frames();
    const shown = all.find((one) => one.key === this.#current) ?? all[0];
    if (!shown) {
      return;
    }
    const frame = shown.section.frames.get(shown.key);
    const stories = [
      ...new Set(
        all
          .filter((one) => one.section === shown.section)
          .map((one) => one.section.frames.get(one.key)?.story.name ?? "")
      ),
    ];
    this.#strip.replaceChildren();
    const pick = document.createElement("select");
    pick.setAttribute("aria-label", "Story");
    for (const name of stories) {
      const option = document.createElement("option");
      option.value = name;
      const story = shown.section.mod?.SHEET.stories.find(
        (one) => one.name === name
      );
      option.textContent = story?.label ?? name;
      option.selected = name === frame?.story.name;
      pick.append(option);
    }
    pick.addEventListener("change", () =>
      this.#show(shown.section, pick.value, frame?.column.interaction ?? "rest")
    );
    const picker = document.createElement("span");
    picker.className = "pick";
    picker.append(pick, glyph("sort"));
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "State");
    const reached = shown.section.interactions.get(frame?.story.name ?? "") ?? [
      "rest",
    ];
    for (const interaction of reached) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = interaction;
      chip.setAttribute(
        "aria-pressed",
        String(interaction === frame?.column.interaction)
      );
      chip.addEventListener("click", () =>
        this.#show(shown.section, frame?.story.name ?? "", interaction)
      );
      chips.append(chip);
    }
    this.#strip.append(picker, chips);
    this.#steps.replaceChildren();
    const at = stories.indexOf(frame?.story.name ?? "");
    const back = stories[at - 1];
    const ahead = stories[at + 1];
    if (back) {
      const button = this.#button(back, () => this.#step(-1));
      button.prepend(glyph("back"));
      this.#steps.append(button);
    } else {
      this.#steps.append(document.createElement("span"));
    }
    if (ahead) {
      const button = this.#button(ahead, () => this.#step(1));
      button.append(glyph("ahead"));
      this.#steps.append(button);
    }
  }

  #show(section: Section, story: string, interaction: string): void {
    const frame =
      [...section.frames.values()].find(
        (one) =>
          one.story.name === story && one.column.interaction === interaction
      ) ?? [...section.frames.values()].find((one) => one.story.name === story);
    if (frame) {
      this.#o.go(frame.key);
    }
  }

  /** The story before or after on a phone; the move between them plays when one is declared. */
  #step(by: 1 | -1): void {
    const all = this.#frames();
    const shown = all.find((one) => one.key === this.#current) ?? all[0];
    if (!shown) {
      return;
    }
    const frame = shown.section.frames.get(shown.key);
    const stories = shown.section.mod?.SHEET.stories ?? [];
    const at = stories.findIndex((one) => one.name === frame?.story.name);
    const next = stories[at + by];
    if (!next) {
      return;
    }
    this.#show(shown.section, next.name, "rest");
    if (next.from === frame?.story.name && next.play) {
      this.openMove(shown.section.file, next.name).catch(failed);
    }
  }

  #swipes(): void {
    let start: { x: number; y: number; id: number } | null = null;
    this.#o.canvas.addEventListener("pointerdown", (event) => {
      if (this.#flags.phone && event.pointerType !== "mouse") {
        start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }
    });
    this.#o.canvas.addEventListener("pointerup", (event) => {
      if (!(start && event.pointerId === start.id)) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.#step(dx < 0 ? 1 : -1);
      }
    });
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
    // The canvas has just given the timeline its room: the move's frame is shown in what is left.
    this.#measure();
    const shown = this.#frames().find(
      (one) =>
        one.section.file === file &&
        one.section.frames.get(one.key)?.story.name === to &&
        one.section.frames.get(one.key)?.column.interaction === "rest"
    );
    if (shown) {
      this.#o.go(shown.key);
    }
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
