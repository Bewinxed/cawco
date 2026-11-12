/**
 * The canvas page's own style (component canvas §2): the page drawn on
 * CawCo's tokens (DESIGN.md), scoped to its own root so the project's CSS
 * never reaches it, its rules on classes no project writes: the stage
 * (stage.ts) and its rings, the column of drawings a Preview and a map's
 * card draw (stage.ts `bootColumn`), a section that didn't load, the
 * skeleton while one is on its way, the rig. The design graph's controls (the Animation face, the
 * agent's dials) are the panel's, never this page's.
 */

/** The page's own rules: the page, a section that didn't load, the skeleton, the rig, the stage and its rings. */
const PAGE_CSS = `
html.cawco-canvas-page { color-scheme: light dark; }
html.cawco-canvas-page[data-theme="light"] { color-scheme: light; }
html.cawco-canvas-page[data-theme="dark"] { color-scheme: dark; }
/* Something on its way (DESIGN.md's Real Wait Rule): nothing until the wait has lasted the grace, then what stands for it,
   holding its room from the first, so nothing moves. */
.cawco-waiting { animation: cawco-wait 1ms var(--duration-wait-grace) both; }
/* The skeleton recipe: a surface-fill block, pulsing down to --skeleton-pulse-floor and back once a --duration-skeleton-pulse on
   ease-in-out (transitions.dev Skeleton loader and reveal), still without motion. */
.cawco-stand-in-body { inline-size: var(--spacing-c-canvas-skeleton-w); max-inline-size: 100vw; block-size: calc(var(--spacing)_*_24);
  border-radius: var(--radius-sm); background: var(--color-surface-fill); }
@media (prefers-reduced-motion: no-preference) {
  .cawco-waiting { animation-duration: var(--duration-fade); animation-timing-function: var(--ease-out); }
  .cawco-stand-in-body { animation: cawco-pulse var(--duration-skeleton-pulse) var(--ease-crossfade) infinite; }
}
@keyframes cawco-wait { from { opacity: 0; } }
@keyframes cawco-pulse { 0%, 100% { opacity: 1; } 50% { opacity: var(--skeleton-pulse-floor); } }
/* What failed says so where it would stand: the error formula's line, then Show details. It reads raised on the page, so its
   details recess inside it in both schemes. */
.cawco-section-failed, .cawco-stage-failed { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--spacing-space-2); inline-size: 0;
  min-inline-size: max(100%, var(--spacing-c-canvas-skeleton-w)); box-sizing: border-box; padding: var(--spacing-space-3); background: var(--color-surface-raised);
  border: 1px solid var(--color-border-hairline); border-radius: var(--radius-md); font: var(--type-body); color: var(--color-ink-strong); }
.cawco-section-failed-line { margin: 0; font: var(--type-body); color: var(--color-status-fail-ink); text-wrap: pretty; }
/* Show details: the sm ghost, its words standing on the line's start (its own inset pulled back), no disclosure triangle. */
:is(.cawco-section-failed, .cawco-stage-failed) summary { list-style: none; display: inline-flex; align-items: center; inline-size: fit-content;
  block-size: var(--spacing-c-btn-h-sm); padding-inline: var(--spacing-space-2); margin-inline-start: calc(var(--spacing-space-2) * -1); border-radius: var(--radius-sm);
  font: var(--type-label); color: var(--color-ink-strong); cursor: pointer; }
:is(.cawco-section-failed, .cawco-stage-failed) summary::-webkit-details-marker { display: none; }
/* Its details stand in the card's one track: a wide code frame scrolls inside it, never widens it. */
:is(.cawco-section-failed, .cawco-stage-failed) details { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--spacing-space-1); }
@media (hover: hover) { :is(.cawco-section-failed, .cawco-stage-failed) summary:hover { background: var(--color-surface-hover); } }
:is(.cawco-section-failed, .cawco-stage-failed) :is(summary, button):focus-visible { outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset); }
:is(.cawco-section-failed, .cawco-stage-failed) pre { margin: var(--spacing-space-1) 0 0; padding: var(--spacing-space-2); font: var(--type-code);
  font-variant-ligatures: none; color: var(--color-ink-strong); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--color-surface-recess);
  border-radius: var(--radius-sm); }
/* Vite's code frame: its columns line up, so it scrolls rather than wraps. */
.cawco-section-failed pre.cawco-section-failed-frame { white-space: pre; overflow-wrap: normal; overflow-x: auto; }
/* The place stays whole on one line: the path gives way inside (The Truncate Inside Rule), :line:column never. */
.cawco-section-failed-place { display: flex; min-inline-size: 0; margin: 0; font: var(--type-code); font-variant-ligatures: none;
  color: var(--color-ink-muted); white-space: nowrap; }
.cawco-section-failed-place > span:first-child { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-failed-place > span:last-child { flex: none; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
/* A probe held still while its values are read (runtime.ts probeInteraction): no keyframes run and no transition starts in it. */
.cawco-rig .cawco-held, .cawco-rig .cawco-held *, .cawco-rig .cawco-held *::before, .cawco-rig .cawco-held *::after {
  animation-name: none !important; transition-property: none !important; }

/* The stage (stage.ts): the component on the page it lives on, the page's gutter round it (the head's inset in the panel),
   the page itself the scroller, never scaled. Beside the drawing the gutter gives way to it (stage.ts sets --stage-gutter):
   a 1440 drawing in a 1440 window stands edge to edge, and the page never scrolls sideways for a gutter. A drawing wider
   than the page scrolls sideways. No scrollbar's gutter stands empty beside the drawing (the preview proxy's floor keeps
   one): a strip of the panel showed through it. */
html.cawco-stage-page { overflow: auto; overscroll-behavior: contain; scrollbar-gutter: auto; background: var(--color-surface-page);
  scroll-padding-block-start: var(--stage-room, 0px); }
/* The stage's floating head (the panel's StagePane) over the page's top: the column pads its top by its room (--stage-room,
   said by the panel), so the drawing at rest stands clear of it and scrolls beneath it, and the scroll edge effect under it
   blurs and fades what scrolls there into the page's ground, clear at rest (DESIGN.md, The Title Bars Follow Liquid Glass Rule). */
html.cawco-stage-page::before { content: ""; position: fixed; inset-inline: 0; inset-block-start: 0; z-index: 2147483000;
  block-size: var(--stage-room, 0px); pointer-events: none; opacity: 0;
  background: linear-gradient(to bottom, var(--color-surface-page) 40%, transparent);
  backdrop-filter: blur(var(--spacing-space-2)); mask-image: linear-gradient(to bottom, black 50%, transparent);
  transition: opacity var(--duration-control, 150ms) ease-out; }
html.cawco-stage-page.cawco-stage-scrolled::before { opacity: 1; }
html.cawco-stage-page body { margin: 0; min-block-size: 100%; }
html.cawco-stage-page .cawco-canvas { display: flex; flex-direction: column; align-items: flex-start; gap: var(--spacing-space-3);
  box-sizing: border-box; inline-size: max-content; min-inline-size: 100%; min-block-size: 100dvh;
  padding: calc(var(--spacing-space-4) + var(--stage-room, 0px)) var(--stage-gutter, var(--spacing-space-4)) var(--spacing-space-4); }
/* The drawing laid out at its width (a container its rules answer), shown at its own: no paper stands beside a component held
   to its measure. Its height held while the next drawing mounts, so the page's scroll stays where it stood. What spills
   past its sides is cut, but no nearer than a popover's shadow reaches (DESIGN.md, Shadows: the overlay's 48px blur): cut at
   the gutter, a popover's shadow stood as a grey box beside it, its hard sides running down past its foot. */
.cawco-stage-frame { position: relative; inline-size: var(--frame-w); min-block-size: max(var(--held-h, 0px), var(--against-h, 0px));
  overflow-x: clip; overflow-clip-margin: calc(2 * var(--spacing-space-8)); }
.cawco-stage-frame[hidden] { display: none; }
/* The state just set in place, drawn afresh and hidden, read against the live instance (stage.ts landed) and gone. */
.cawco-stage-fresh { position: absolute; inset-block-start: 0; inset-inline-start: 0; visibility: hidden; pointer-events: none; }
/* Compare (stage.ts compare): the state compared with, drawn hidden under the drawing at its width; side by side it stands
   the gap past it, and flipped it stands in its place. Placed by the left edge, as the boxes its rings are read in are. */
.cawco-stage-against { position: absolute; inset-block-start: 0; left: 0; visibility: hidden; pointer-events: none; }
.cawco-stage-frame.cawco-stage-beside { inline-size: calc(2 * var(--frame-w) + var(--spacing-space-6)); }
.cawco-stage-beside > .cawco-stage-against { left: calc(var(--frame-w) + var(--spacing-space-6)); visibility: visible; }
.cawco-stage-flipped > .cawco-stage-against { visibility: visible; }
.cawco-stage-flipped > .cawco-stage-drawing { visibility: hidden; }
/* Side by side, each drawing named over its own column. */
.cawco-stage-names { display: flex; gap: var(--spacing-space-6); font: var(--type-meta); color: var(--color-ink-muted); }
.cawco-stage-names[hidden] { display: none; }
.cawco-stage-names > span { inline-size: var(--frame-w); min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A difference's ring: outside the element's box on its own shape, solid for what came in or changed, dashed for what
   went, in the stage's own layer over both drawings, taking no press. */
.cawco-stage-rings { position: absolute; inset: 0; pointer-events: none; }
.cawco-change-ring { --ring-out: calc(var(--spacing-c-change-ring-offset) + var(--spacing-c-change-ring-width)); position: absolute; box-sizing: border-box;
  left: calc(var(--ring-x) - var(--ring-out)); top: calc(var(--ring-y) - var(--ring-out));
  inline-size: calc(var(--ring-w) + 2 * var(--ring-out)); block-size: calc(var(--ring-h) + 2 * var(--ring-out));
  border: var(--spacing-c-change-ring-width) solid var(--color-c-change-ring); border-radius: calc(var(--ring-r) + var(--spacing-c-change-ring-offset)); }
.cawco-change-ring[data-kind="went"] { border-style: dashed; }
/* The ring on what a row of the design graph's Animation face rests on: the change ring's stroke round the thing as it
   stands at the playhead's moment, in the same layer, taking no press. */
.cawco-lit-ring { --ring-out: calc(var(--spacing-c-change-ring-offset) + var(--spacing-c-change-ring-width)); position: absolute; box-sizing: border-box;
  pointer-events: none; left: calc(var(--ring-x) - var(--ring-out)); top: calc(var(--ring-y) - var(--ring-out));
  inline-size: calc(var(--ring-w) + 2 * var(--ring-out)); block-size: calc(var(--ring-h) + 2 * var(--ring-out));
  border: var(--spacing-c-change-ring-width) solid var(--color-c-change-ring); border-radius: var(--radius-sm); }
.cawco-lit-ring[hidden] { display: none; }
/* A decision page's Preview (by=embed) and a map's card (by=map), drawn by the stage (stage.ts bootColumn): each story it
   names a drawing, one under another, each at its own width, 1 CSS px per px. A drawing of no width of its own answers
   its story's width conditions at the canvas's width (canvas width.ts). */
html.cawco-column-page, html.cawco-column-page body { margin: 0; }
html.cawco-column-page .cawco-canvas { container: cawco-width / inline-size; }
.cawco-column { display: flex; flex-direction: column; align-items: flex-start; gap: var(--spacing-space-3); }
.cawco-column-part { display: contents; }
/* A Preview stands in the page's own flow on the surface the decision page draws its Preview on; the page holding it makes
   its frame as tall as the column and as wide as its widest story (CANVAS_EMBED_SIZE) and scrolls it sideways where its
   room is narrower, and a wheel or a finger on it scrolls that page. */
html.cawco-embed, html.cawco-embed body { block-size: auto; overflow-x: hidden; overflow-y: auto; background: var(--color-surface-page); }
/* A map's card: the column on the well, fitted to the card by one transform (stage.ts fit). */
html.cawco-map, html.cawco-map body { block-size: 100%; overflow: hidden; background: var(--color-surface-well); }
html.cawco-map .cawco-canvas { position: fixed; inset: 0; overflow: hidden; }
html.cawco-map .cawco-column { position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: max-content;
  transform-origin: 0 0; }
.cawco-stage-waiting { display: grid; gap: var(--spacing-space-2); }
.cawco-stage-waiting > .cawco-stand-in-body { inline-size: min(var(--frame-w), 100%); }
.cawco-stage-failed { justify-items: start; }
.cawco-stage-failed-head { display: flex; align-items: center; gap: var(--spacing-space-2); margin: 0; font: var(--type-label); color: var(--color-status-fail-ink); }
.cawco-stage-failed-head svg { inline-size: var(--spacing-icon-md); block-size: var(--spacing-icon-md); flex: none; }
.cawco-stage-failed-message { margin: 0; max-inline-size: var(--spacing-c-measure); font: var(--type-body); color: var(--color-ink-row); overflow-wrap: anywhere; }
/* Try again: the kit's sm outline button. */
.cawco-stage-failed button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; block-size: var(--spacing-c-btn-h-sm);
  padding-inline: var(--spacing-space-3); border: 1px solid var(--color-border-row-outline); border-radius: var(--radius-md); background: var(--color-surface-raised);
  box-shadow: var(--shadow-xs); font: var(--type-label); color: var(--color-ink-strong); cursor: pointer; }
@media (hover: hover) { .cawco-stage-failed button:hover { background: var(--color-surface-hover); } }
.cawco-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

export interface PageStyleOptions {
  /** The house faces' `@font-face` rules, set in the page. */
  faces: string;
  /** CawCo's tokens, `:root` scoped to the page's own root. */
  tokens: string;
}

/** The page's own sheet, set once in its head; a mode adds its rules to it. */
export class PageStyle {
  readonly #sheet: HTMLStyleElement;

  constructor(options: PageStyleOptions) {
    this.#sheet = document.createElement("style");
    this.#sheet.dataset.cawcoCanvas = "";
    this.#sheet.textContent = `${options.faces}\n${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${PAGE_CSS}`;
    document.head.append(this.#sheet);
    document.documentElement.classList.add("cawco-canvas-page");
  }

  /** Rules a mode adds to the page's own, on its own classes. */
  style(css: string): void {
    this.#sheet.textContent += `\n${css}`;
  }

  /** A duration token's milliseconds, from the page's own tokens. */
  duration(token: string, fallback: number): number {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
    const ms = value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
    return Number.isFinite(ms) && ms > 0 ? ms : fallback;
  }
}
