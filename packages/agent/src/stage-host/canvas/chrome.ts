/**
 * What the canvas draws of its own around the frames, on classes no project
 * writes: the page's sheet (the well, the sections, the frames, the stage
 * the design graph stands a state on, the change marks over it). The canvas
 * names nothing and steers nothing itself: its panel's head names it, and
 * the design graph beside it (the pane's GraphPanel) is how a state is
 * found, previewed and kept, and how the kept move is timed (Projects spec
 * §5.10, "The design graph"). Drawn on CawCo's tokens (DESIGN.md).
 */

/** The page's sheet: frames, sections, the stage and its washes, on classes no project writes. */
const PAGE_CSS = `
/* On the stage, the room the design graph's panel and dock leave the canvas (the pane's ask): none until a pane asks. */
html.cawco-canvas-page { color-scheme: light dark; --cawco-stage-end: 0px; --cawco-stage-bottom: 0px; --cawco-stage-top: 0px; }
html.cawco-canvas-page[data-theme="light"] { color-scheme: light; }
html.cawco-canvas-page[data-theme="dark"] { color-scheme: dark; }
/* The page is the well the frames stand in (surface-well): the frame recesses, each frame's own page reads raised on it. */
html.cawco-canvas-page, html.cawco-canvas-page body { margin: 0; block-size: 100%; overflow: hidden; background: var(--surface-well); }
/* The canvas ends where the design graph's panel and dock begin: no frame is ever drawn under them. */
.cawco-canvas { position: fixed; inset-block: var(--cawco-stage-top) var(--cawco-stage-bottom); inset-inline: 0 var(--cawco-stage-end); overflow: hidden;
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
.cawco-section-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-1) var(--space-3);
  padding-block-end: var(--space-1); border-block-end: 1px solid var(--border-well); }
.cawco-section-title { grid-column: 1; font: var(--type-title); color: var(--ink-strong); text-wrap: balance; }
/* The file on one row across the head, never widening it (inline-size containment): its folders give way first, then its own
   name, each to an ellipsis; the whole path is its title. */
.cawco-section-file { grid-column: 1 / -1; display: flex; contain: inline-size; white-space: nowrap; font: var(--type-meta); color: var(--ink-muted); }
.cawco-section-file-folder { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-file-name { flex-shrink: 0; max-inline-size: 100%; overflow: hidden; text-overflow: ellipsis; }
/* A section on its way (DESIGN.md's Real Wait Rule): nothing until the wait has lasted the grace, then the line saying what it
   waits for and each story's frame as a skeleton where its frame lands; they hold their room from the first, so nothing moves. */
.cawco-waiting { animation: cawco-wait 1ms var(--dur-wait-grace) both; }
.cawco-section-status { grid-column: 2; grid-row: 1; align-self: baseline; margin: 0; font: var(--type-meta); color: var(--ink-muted); }
.cawco-stand-in { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.cawco-stand-in > .cawco-frame-words { padding: var(--space-row) var(--space-1); }
/* The skeleton recipe: a surface-fill block at the frame's size, pulsing down to --skeleton-pulse-floor and back once a
   --dur-skeleton-pulse on ease-in-out (transitions.dev Skeleton loader and reveal), still without motion. */
.cawco-stand-in-body { inline-size: var(--c-canvas-skeleton-w); max-inline-size: 100vw; block-size: var(--c-canvas-skeleton-h);
  border-radius: var(--radius-sm); background: var(--surface-fill); }
@media (prefers-reduced-motion: no-preference) {
  .cawco-waiting { animation-duration: var(--dur-fade); animation-timing-function: var(--ease-out); }
  .cawco-stand-in-body { animation: cawco-pulse var(--dur-skeleton-pulse) var(--ease-crossfade) infinite; }
}
@keyframes cawco-wait { from { opacity: 0; } }
@keyframes cawco-pulse { 0%, 100% { opacity: 1; } 50% { opacity: var(--skeleton-pulse-floor); } }
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
/* The gap clears the selected frame's 1px edge. */
.cawco-frame { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); min-inline-size: 0; position: relative; }
.cawco-frame-label { all: unset; box-sizing: border-box; display: grid; gap: var(--space-row); max-inline-size: 360px; border-radius: var(--radius-xs);
  padding: var(--space-row) var(--space-1); }
.cawco-frame-words { font: var(--type-label); color: var(--ink-strong); overflow-wrap: anywhere; }
.cawco-frame-small { font: var(--type-meta); color: var(--ink-muted); overflow-wrap: anywhere; }
.cawco-frame-label[data-cawco-unnamed] .cawco-frame-words { font: var(--type-meta); color: var(--ink-muted); }
.cawco-frame[data-cawco-edited] .cawco-frame-small::after { content: " · edited"; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-frame-status { font: var(--type-meta); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.cawco-frame-status[data-state="failed"] { color: var(--status-fail-ink); }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
/* A probe held still while its values are read (runtime.ts probeState): no keyframes run and no transition starts in it. */
.cawco-rig .cawco-held, .cawco-rig .cawco-held *, .cawco-rig .cawco-held *::before, .cawco-rig .cawco-held *::after {
  animation-name: none !important; transition-property: none !important; }
/* The stage (Projects spec §5.10, "The design graph"): a pane with the design graph beside the page stands one state, the one
   kept or the one a hover previews; every frame stays mounted and measured where the canvas laid it out, unseen and out of
   reach. The graph names the state, so no head, label or status line is drawn. */
html[data-cawco-staged] :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status) { visibility: hidden; }
html[data-cawco-staged] :is(.cawco-frame, .cawco-stand-in):not([data-cawco-on-stage]),
html[data-cawco-staged] .cawco-section:not([data-cawco-on-stage]) .cawco-section-failed { opacity: 0; pointer-events: none; }
/* Change marks (the owner's pick "washes"): while a hover previews a state that differs from the kept one, a wash behind every
   value that came in or changed (the diff's added ground, its edge in data-ok) and one where a value went, at its old box (the
   removed ground, its edge in data-bad). They stand in the world, so they move with what they mark; they take no press. */
.cawco-washes { position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: 0; block-size: 0; overflow: visible;
  pointer-events: none; z-index: 2; }
.cawco-wash { position: absolute; box-sizing: border-box; opacity: 0; transition: opacity var(--dur-control) var(--ease-out); }
.cawco-wash[data-kind="add"] { background: var(--diff-add-bg); box-shadow: inset 0 0 0 1px var(--data-ok); }
.cawco-wash[data-kind="del"] { background: var(--diff-del-bg); box-shadow: inset 0 0 0 1px var(--data-bad); }
.cawco-wash[data-in] { opacity: 1; }
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
html.cawco-embed :is(.cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status, .cawco-stand-in > .cawco-frame-words) { display: none; }
html.cawco-embed .cawco-grid { display: flex; flex-direction: column; align-items: start; gap: var(--space-3); }
html.cawco-embed .cawco-frame { gap: 0; min-inline-size: 0; }
html.cawco-embed .cawco-stand-in-body { max-inline-size: 100%; }
`;

/** A token's value as CSS writes it: a time (`280ms`, `0.28s`) or a length in px. */
const TIME = /^(-?[\d.]+)(ms|s)$/u;
const PX = /^(-?[\d.]+)px$/u;
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/gu;

/**
 * Sets the page's sheet: the house faces, CawCo's tokens scoped to the
 * canvas page's root class (so a project's `:root` keeps its own), and
 * {@link PAGE_CSS}. Answers a house token's milliseconds or pixels, read
 * from the tokens as written.
 */
export function dressPage(options: { faces: string; tokens: string }): {
  ms: (token: `--dur-${string}`) => number;
  px: (token: `--${string}`) => number;
} {
  const page = document.createElement("style");
  page.dataset.cawcoCanvas = "";
  page.textContent = `${options.faces}\n${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${PAGE_CSS}`;
  document.head.append(page);
  const values = new Map<string, string>();
  // Read with the sheet's comments out: a token's note names others as words ("--reveal-dur: 400ms. */"), which would swallow the declaration after it.
  for (const [, name, value] of options.tokens
    .replaceAll(COMMENT, "")
    .matchAll(DECLARATION)) {
    if (name && value && !values.has(name)) {
      values.set(name, value.trim());
    }
  }
  const read = (token: string, pattern: RegExp): RegExpMatchArray => {
    const match = values.get(token)?.match(pattern);
    if (!match) {
      throw new Error(`The house tokens have no ${token} to read.`);
    }
    return match;
  };
  return {
    ms: (token) => {
      const time = read(token, TIME);
      return Number(time[1]) * (time[2] === "s" ? 1000 : 1);
    },
    px: (token) => Number(read(token, PX)[1]),
  };
}
