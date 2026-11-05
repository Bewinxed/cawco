/**
 * The canvas page's own style and the agent's dials (component canvas §2):
 * the page drawn on CawCo's tokens (DESIGN.md), scoped to its own root so
 * the project's CSS never reaches it, its rules on classes no project
 * writes: the stage (stage.ts), the frames grid of a Preview and a map's
 * card (frames.ts), a section that didn't load, the skeleton while one is
 * on its way, the rig. A move's timeline and the agent's dials are
 * DialKit's own (vendored at packages/hub/skills/decision-page/kit/vendor/
 * dialkit, MIT, Josh Puckett), docked in the stage's page.
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

/** A move played where the person sees it (stage.ts): what it fired, and each animation made again, paused, on its own element, for the timeline to seek. */
export interface PlayedMove {
  move: MoveRender;
  replays: { animation: Animation | null; read: AnimationRead }[];
}

/** A page narrower than this is a phone's: the timeline starts at a quarter of its height. DESIGN.md's breakpoint. */
const PHONE_MAX = 640;
/** DialKit's timeline handle's step, per arrow key (vendor/dialkit browser.global.js, `createDialTimelineRoot`). */
const TIMELINE_STEP = 20;
const BEZIER = /cubic-bezier\(([^)]+)\)/u;
const CLIP_NAME = /[^A-Za-z0-9_]/gu;

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

declare global {
  interface Window {
    DialKit?: DialKitGlobal;
  }
}

export interface ChromeOptions {
  applyDials: (values: Record<string, unknown>) => void;
  /**
   * The page is a decision page's Preview (runtime `by=embed`): its frames
   * alone in the page's own flow. Only the page's own style is set.
   */
  embedded: boolean;
  /** The house faces' `@font-face` rules, set in the page. */
  faces: string;
  spec: CanvasSpec;
  tokens: string;
}

/** The page's own rules: the page, a section that didn't load, the skeleton, the rig and the dials' dock. */
const PAGE_CSS = `
html.cawco-canvas-page { color-scheme: light dark; }
html.cawco-canvas-page[data-theme="light"] { color-scheme: light; }
html.cawco-canvas-page[data-theme="dark"] { color-scheme: dark; }
/* Something on its way (DESIGN.md's Real Wait Rule): nothing until the wait has lasted the grace, then what stands for it,
   holding its room from the first, so nothing moves. */
.cawco-waiting { animation: cawco-wait 1ms var(--dur-wait-grace) both; }
/* The skeleton recipe: a surface-fill block, pulsing down to --skeleton-pulse-floor and back once a --dur-skeleton-pulse on
   ease-in-out (transitions.dev Skeleton loader and reveal), still without motion. */
.cawco-stand-in-body { inline-size: var(--c-canvas-skeleton-w); max-inline-size: 100vw; block-size: var(--c-canvas-skeleton-h);
  border-radius: var(--radius-sm); background: var(--surface-fill); }
@media (prefers-reduced-motion: no-preference) {
  .cawco-waiting { animation-duration: var(--dur-fade); animation-timing-function: var(--ease-out); }
  .cawco-stand-in-body { animation: cawco-pulse var(--dur-skeleton-pulse) var(--ease-crossfade) infinite; }
}
@keyframes cawco-wait { from { opacity: 0; } }
@keyframes cawco-pulse { 0%, 100% { opacity: 1; } 50% { opacity: var(--skeleton-pulse-floor); } }
/* What failed says so where it would stand: the error formula's line, then Show details. It reads raised on the page, so its
   details recess inside it in both schemes. */
.cawco-section-failed, .cawco-stage-failed { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2); inline-size: 0;
  min-inline-size: max(100%, var(--c-canvas-skeleton-w)); box-sizing: border-box; padding: var(--space-3); background: var(--surface-raised);
  border: 1px solid var(--border-hairline); border-radius: var(--radius-md); font: var(--type-body); color: var(--ink-strong); }
.cawco-section-failed-line { margin: 0; font: var(--type-body); color: var(--status-fail-ink); text-wrap: pretty; }
/* Show details: the sm ghost, its words standing on the line's start (its own inset pulled back), no disclosure triangle. */
:is(.cawco-section-failed, .cawco-stage-failed) summary { list-style: none; display: inline-flex; align-items: center; inline-size: fit-content;
  block-size: var(--c-btn-h-sm); padding-inline: var(--space-2); margin-inline-start: calc(var(--space-2) * -1); border-radius: var(--radius-sm);
  font: var(--type-label); color: var(--ink-strong); cursor: pointer; }
:is(.cawco-section-failed, .cawco-stage-failed) summary::-webkit-details-marker { display: none; }
/* Its details stand in the card's one track: a wide code frame scrolls inside it, never widens it. */
:is(.cawco-section-failed, .cawco-stage-failed) details { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); }
@media (hover: hover) { :is(.cawco-section-failed, .cawco-stage-failed) summary:hover { background: var(--surface-hover); } }
:is(.cawco-section-failed, .cawco-stage-failed) :is(summary, button):focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset); }
:is(.cawco-section-failed, .cawco-stage-failed) pre { margin: var(--space-1) 0 0; padding: var(--space-2); font: var(--type-code);
  font-variant-ligatures: none; color: var(--ink-strong); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface-recess);
  border-radius: var(--radius-sm); }
/* Vite's code frame: its columns line up, so it scrolls rather than wraps. */
.cawco-section-failed pre.cawco-section-failed-frame { white-space: pre; overflow-wrap: normal; overflow-x: auto; }
/* The place stays whole on one line: the path gives way inside (The Truncate Inside Rule), :line:column never. */
.cawco-section-failed-place { display: flex; min-inline-size: 0; margin: 0; font: var(--type-code); font-variant-ligatures: none;
  color: var(--ink-muted); white-space: nowrap; }
.cawco-section-failed-place > span:first-child { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.cawco-section-failed-place > span:last-child { flex: none; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
/* A probe held still while its values are read (runtime.ts probeInteraction): no keyframes run and no transition starts in it. */
.cawco-rig .cawco-held, .cawco-rig .cawco-held *, .cawco-rig .cawco-held *::before, .cawco-rig .cawco-held *::after {
  animation-name: none !important; transition-property: none !important; }
/* A move's timeline, DialKit's, across the page's floor; the stage's page ends over it (--cawco-floor). */
.cawco-dock-timeline { position: fixed; inset-inline: var(--space-3); inset-block-end: var(--space-2); z-index: 2147483001; }
/* The agent's dials, DialKit's panel, at the page's inline end under its top, scrolling inside. */
.cawco-dock-dials { position: fixed; z-index: 2147483001; overflow: auto; overscroll-behavior: contain;
  inset-block-start: var(--space-2); inset-inline-end: var(--space-3); inline-size: min(280px, calc(100vw - var(--space-3) * 2));
  max-block-size: calc(100dvh - var(--space-2) * 2); }

/* The stage (stage.ts): the component on the page it lives on, the page's gutter round it (the head's inset in the panel),
   the page itself the scroller, never scaled. A drawing wider than the page scrolls sideways. No scrollbar's gutter stands
   empty beside the drawing (the preview proxy's floor keeps one): a strip of the panel showed through it. */
html.cawco-stage-page { overflow: auto; overscroll-behavior: contain; scrollbar-gutter: auto; background: var(--surface-page); }
html.cawco-stage-page body { margin: 0; min-block-size: 100%; }
html.cawco-stage-page .cawco-canvas { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
  box-sizing: border-box; inline-size: max-content; min-inline-size: 100%; min-block-size: 100dvh; padding: var(--space-4);
  padding-block-end: calc(var(--space-4) + var(--cawco-floor, 0px)); }
/* The drawing laid out at its width (a container its rules answer), shown at its own: no paper stands beside a component held
   to its measure. Its height held while the next drawing mounts, so the page's scroll stays where it stood. What spills
   past its sides is cut, but no nearer than a popover's shadow reaches (DESIGN.md, Shadows: the overlay's 48px blur): cut at
   the gutter, a popover's shadow stood as a grey box beside it, its hard sides running down past its foot. */
.cawco-stage-frame { position: relative; inline-size: var(--frame-w); min-block-size: max(var(--held-h, 0px), var(--against-h, 0px));
  overflow-x: clip; overflow-clip-margin: calc(2 * var(--space-8)); }
.cawco-stage-frame[hidden] { display: none; }
/* The state just set in place, drawn afresh and hidden, read against the live instance (stage.ts landed) and gone. */
.cawco-stage-fresh { position: absolute; inset-block-start: 0; inset-inline-start: 0; visibility: hidden; pointer-events: none; }
/* Compare (stage.ts compare): the state compared with, drawn hidden under the drawing at its width; side by side it stands
   the gap past it, and flipped it stands in its place. Placed by the left edge, as the boxes its rings are read in are. */
.cawco-stage-against { position: absolute; inset-block-start: 0; left: 0; visibility: hidden; pointer-events: none; }
.cawco-stage-frame.cawco-stage-beside { inline-size: calc(2 * var(--frame-w) + var(--space-6)); }
.cawco-stage-beside > .cawco-stage-against { left: calc(var(--frame-w) + var(--space-6)); visibility: visible; }
.cawco-stage-flipped > .cawco-stage-against { visibility: visible; }
.cawco-stage-flipped > .cawco-stage-drawing { visibility: hidden; }
/* Side by side, each drawing named over its own column. */
.cawco-stage-names { display: flex; gap: var(--space-6); font: var(--type-meta); color: var(--ink-muted); }
.cawco-stage-names[hidden] { display: none; }
.cawco-stage-names > span { inline-size: var(--frame-w); min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A difference's ring: outside the element's box on its own shape, solid for what came in or changed, dashed for what
   went, in the stage's own layer over both drawings, taking no press. */
.cawco-stage-rings { position: absolute; inset: 0; pointer-events: none; }
.cawco-change-ring { --ring-out: calc(var(--c-change-ring-offset) + var(--c-change-ring-width)); position: absolute; box-sizing: border-box;
  left: calc(var(--ring-x) - var(--ring-out)); top: calc(var(--ring-y) - var(--ring-out));
  inline-size: calc(var(--ring-w) + 2 * var(--ring-out)); block-size: calc(var(--ring-h) + 2 * var(--ring-out));
  border: var(--c-change-ring-width) solid var(--c-change-ring); border-radius: calc(var(--ring-r) + var(--c-change-ring-offset)); }
.cawco-change-ring[data-kind="went"] { border-style: dashed; }
.cawco-stage-waiting { display: grid; gap: var(--space-2); }
.cawco-stage-waiting > .cawco-stand-in-body { inline-size: min(var(--frame-w), 100%); }
.cawco-stage-failed { justify-items: start; }
.cawco-stage-failed-head { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: var(--type-label); color: var(--status-fail-ink); }
.cawco-stage-failed-head svg { inline-size: var(--icon-md); block-size: var(--icon-md); flex: none; }
.cawco-stage-failed-message { margin: 0; max-inline-size: var(--c-measure); font: var(--type-body); color: var(--ink-row); overflow-wrap: anywhere; }
/* Try again: the kit's sm outline button. */
.cawco-stage-failed button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; block-size: var(--c-btn-h-sm);
  padding-inline: var(--space-3); border: 1px solid var(--border-button-outline); border-radius: var(--radius-md); background: var(--surface-raised);
  box-shadow: var(--shadow-xs); font: var(--type-label); color: var(--ink-strong); cursor: pointer; }
@media (hover: hover) { .cawco-stage-failed button:hover { background: var(--surface-hover); } }
.cawco-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

/** DialKit drawn in CawCo's own tokens (its theme follows ours), through its own custom properties, over its sheet's layer. The vendored file is untouched. */
const DIALKIT_THEME = `
.dialkit-root {
  --dial-surface: var(--surface-recess); --dial-surface-subtle: var(--surface-recess);
  --dial-surface-hover: var(--surface-hover); --dial-surface-active: var(--surface-pressed);
  --dial-text-root: var(--ink-strong); --dial-text-focus: var(--ink-strong); --dial-text-primary: var(--ink-strong);
  --dial-text-section: var(--ink-muted); --dial-text-label: var(--ink-muted); --dial-text-secondary: var(--ink-muted);
  --dial-text-tertiary: var(--ink-subtle);
  --dial-border: var(--border-hairline); --dial-border-hover: var(--border-control); --dial-focus-ring: var(--focus-ring);
  --dial-glass-bg: var(--surface-raised); --dial-dropdown-bg: var(--surface-raised); --dial-backdrop-blur: 0px;
  --dial-radius: var(--radius-sm);
  --dial-shadow: var(--shadow-md); --dial-shadow-collapsed: var(--shadow-xs); --dial-shadow-dropdown: var(--shadow-overlay);
  font-family: var(--font-sans); color: var(--ink-strong);
}
.dialkit-root :is(.dialkit-folder-title, .dialkit-folder-title-root, .dialkit-shortcut-pill, .dialkit-shortcuts-title,
  .dialkit-shortcuts-row-key) { font-weight: var(--weight-strong); }
.dialkit-root :is(.dialkit-slider-value, .dialkit-slider-input, .dialkit-shortcuts-row-key) { font-family: var(--font-mono); font-variant-ligatures: none; }
.dialkit-root .dialkit-toggle-thumb { background: var(--surface-lift); box-shadow: var(--shadow-raised); }
.dialkit-root .dialkit-toggle[data-checked="true"] .dialkit-toggle-track { background: var(--brand-solid); }
.dialkit-root :is(.dialkit-timeline-title, .dialkit-timeline-label, .dialkit-timeline-loop-infinity, .dialkit-timeline-playhead-flag,
  .dialkit-timeline-popover-title) { font-weight: var(--weight-strong); }
.dialkit-root { --dial-timeline-clip-overlay: transparent; }
/* DialKit fixes its timeline to the viewport's foot; it stands in our dock instead. */
.cawco-dock-timeline .dialkit-timeline { position: static; }
.dialkit-root .dialkit-timeline-dock { border-radius: var(--radius-lg); }
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
  readonly #page: HTMLStyleElement;
  /** DialKit's dials root, once the dials stand: it takes the page's scheme on the attribute it reads (scheme). */
  #dialRoot: { element: HTMLElement } | null = null;
  /** The dials on their way, or standing: made once. */
  #dialing: Promise<void> | null = null;
  /** The move's timeline standing now, its dock and root, and the replays it seeks. */
  #timeline: TimelineHandle | null = null;
  #dock: HTMLElement | null = null;
  #timelineRoot: { update: (next: Record<string, unknown>) => void } | null =
    null;
  #replays: (Animation | null)[] = [];
  readonly #sizes = new ResizeObserver(() => this.#measure());

  constructor(options: ChromeOptions) {
    this.#o = options;
    this.#page = document.createElement("style");
    this.#page.dataset.cawcoCanvas = "";
    this.#page.textContent = `${options.faces}\n${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${PAGE_CSS}`;
    document.head.append(this.#page);
    document.documentElement.classList.add("cawco-canvas-page");
  }

  /** Rules a mode adds to the page's own, on its own classes. */
  style(css: string): void {
    this.#page.textContent += `\n${css}`;
  }

  /** The page's scheme turned (runtime's one subscription, scheme.ts): each DialKit root takes it its own way, the timeline's through its `update`, the dials' on the attribute it reads. */
  scheme(scheme: PageScheme): void {
    this.#timelineRoot?.update({ theme: scheme });
    if (this.#dialRoot) {
      this.#dialRoot.element.dataset.theme = scheme;
    }
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

  /** The room the timeline takes at the page's floor (`--cawco-floor`), so the stage's page ends over it. */
  #measure(): void {
    const gap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    );
    const tall = this.#dock?.getBoundingClientRect().height ?? 0;
    document.documentElement.style.setProperty(
      "--cawco-floor",
      `${tall > 0 ? tall + gap : 0}px`
    );
  }

  /** The move's timeline put away: its replays let go, its dock gone, the page's floor its own again. */
  closeMove(): void {
    this.#timeline?.destroy();
    this.#timeline = null;
    for (const replay of this.#replays) {
      replay?.cancel();
    }
    this.#replays = [];
    if (this.#dock) {
      this.#sizes.unobserve(this.#dock);
      this.#dock.remove();
    }
    this.#dock = null;
    this.#timelineRoot = null;
    this.#measure();
  }

  /**
   * A move's timeline: the move played in the stage's drawing (stage.ts),
   * each animation it fired a clip at its own start, length and curve, the
   * playhead seeking the engine's own animations made again, paused; the
   * person's tuned timing previews on them at once and goes to the artifact
   * as `tuned`.
   */
  async openMove(played: PlayedMove, id: string): Promise<void> {
    const kit = await loadDialKit();
    this.closeMove();
    this.#replays = played.replays.map((one) => one.animation);
    const dock = document.createElement("div");
    dock.id = "cawco-dock-timeline";
    dock.className = "cawco-dock-timeline";
    document.body.append(dock);
    this.#dock = dock;
    this.#sizes.observe(dock);
    this.#timelineRoot = kit.createDialTimelineRoot({
      target: dock,
      theme: pageScheme(),
    });
    if (windowWidth() < PHONE_MAX) {
      timelineStartsAt(dock, windowHeight() / 4);
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
      { autoplay: false, id: `move:${id}` }
    );
    this.#timeline = timeline;
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
  }

  /** The agent's dials, once, when it sent any: their first values read off `first`, the body that draws with them. */
  dials(first: () => HTMLElement | null): void {
    const dials = this.#o.spec.dials ?? [];
    if (this.#dialing || this.#o.embedded || dials.length === 0) {
      return;
    }
    this.#dialing = this.#dials(dials, first).catch((error: unknown) =>
      console.error("[cawco] canvas:", error)
    );
  }

  /** The agent's dials: DialKit's panel, each value set on every body (a CSS variable) or through `update` (an arg), kept in the artifact. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each dial kind's DialKit control from the value the body draws with, then kept in step both ways
  async #dials(
    dials: CanvasDial[],
    firstBody: () => HTMLElement | null
  ): Promise<void> {
    const kit = await loadDialKit();
    const dock = document.createElement("div");
    dock.id = "cawco-dock-dials";
    dock.className = "cawco-dock-dials";
    document.body.append(dock);
    this.#dialRoot = kit.createDialRoot({
      mode: "inline",
      target: dock,
      theme: pageScheme(),
    });
    const config: Record<string, unknown> = {};
    const first = firstBody();
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
      // DialKit says its values as it subscribes: the bodies already draw them; only a change is applied.
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

/**
 * DialKit starts its timeline 400px tall and keeps its height inline, the
 * person's to change with its resize handle (a separator that steps 20px
 * on each arrow key): on a phone it starts at `most` instead, stepped down
 * through that same handle, so the person can still make it taller.
 */
function timelineStartsAt(dock: HTMLElement, most: number): void {
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
