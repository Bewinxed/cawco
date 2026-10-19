/**
 * What the canvas says about itself (component canvas §2, "What the canvas
 * says about itself"), in a shadow root so the project's CSS never reaches
 * it and it never reaches the project's: the name and the agent's `about`
 * line, the crumb of the frame in view, an outline of sections and frames
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
  createDialRoot: (options: Record<string, unknown>) => unknown;
  createDialTimeline: (
    name: string,
    config: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => TimelineHandle;
  createDialTimelineRoot: (options: Record<string, unknown>) => unknown;
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

const CHROME_CSS = `
:host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; color-scheme: inherit;
  font: var(--type-body); color: var(--text-strong); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
.band { pointer-events: auto; position: absolute; inset-inline: 0; top: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-1) var(--space-3); padding: var(--space-2) var(--space-3); background: var(--surface-raised);
  border-block-end: 1px solid var(--border-hairline); box-shadow: var(--shadow-xs); }
.name { font: var(--type-label); color: var(--text-strong); min-width: 0; overflow-wrap: anywhere; }
.about { grid-column: 1; font: var(--type-meta); color: var(--text-muted); min-width: 0; overflow-wrap: anywhere; }
.crumb { grid-column: 1; font: var(--type-meta); color: var(--text-muted); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crumb b { font-weight: 500; color: var(--text-strong); }
.tools { grid-column: 2; grid-row: 1 / span 3; display: flex; align-items: start; gap: var(--space-1); }
.ghost { all: unset; box-sizing: border-box; font: var(--type-label); color: var(--text-strong); height: 30px; padding: 0 var(--space-2);
  border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer;
  transition: background-color var(--dur-control) var(--ease-out); }
@media (hover: hover) { .ghost:hover { background: var(--surface-hover); } }
.ghost[aria-pressed="true"] { background: var(--surface-fill); }
.ghost:focus-visible, .row:focus-visible, .chip:focus-visible, select:focus-visible { outline: var(--focus-ring-width, 2px) solid var(--focus-ring); outline-offset: 2px; }
.outline { pointer-events: auto; position: absolute; inset-block: var(--band, 88px) var(--foot, 32px); inset-inline-end: 0;
  inline-size: min(280px, 80vw); overflow: auto; overscroll-behavior: contain; background: var(--surface-raised);
  border-inline-start: 1px solid var(--border-hairline); padding: var(--space-2) 0; }
.outline[hidden] { display: none; }
.outline h3 { margin: var(--space-2) var(--space-3) var(--space-1); font: var(--type-caps, var(--type-meta)); color: var(--text-muted); }
.row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: var(--space-2); align-items: center;
  inline-size: 100%; min-block-size: 32px; padding: var(--space-1) var(--space-3); cursor: pointer; font: var(--type-meta); color: var(--text-strong); }
.row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row small { font: var(--type-meta); color: var(--text-muted); font-variant-numeric: tabular-nums; }
.row[aria-current="true"] { background: var(--surface-fill); box-shadow: inset 2px 0 0 var(--coral-9); }
@media (hover: hover) { .row:hover { background: var(--surface-hover); } }
.foot { pointer-events: auto; position: absolute; inset-inline: 0; bottom: 0; padding: var(--space-1) var(--space-3);
  font: var(--type-meta); color: var(--text-muted); background: var(--surface-raised); border-block-start: 1px solid var(--border-hairline);
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.strip { pointer-events: auto; position: absolute; inset-inline: 0; display: none; gap: var(--space-2); align-items: center;
  padding: var(--space-2) var(--space-3); background: var(--surface-raised); border-block-end: 1px solid var(--border-hairline); flex-wrap: wrap; }
:host([data-phone]) .strip { display: flex; }
:host([data-phone]) .outline { inset-inline: 0; inline-size: auto; }
select { font: var(--type-label); color: var(--text-strong); background: var(--surface-recess); border: 1px solid var(--border-control);
  border-radius: var(--radius-sm); min-block-size: 44px; padding: 0 var(--space-2); max-inline-size: 60vw; }
.chips { display: flex; gap: var(--space-1); }
.chip { all: unset; box-sizing: border-box; font: var(--type-label); min-block-size: 44px; padding: 0 var(--space-3); border-radius: var(--radius-pill);
  display: inline-flex; align-items: center; background: var(--surface-recess); cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--surface-fill-strong, var(--surface-fill)); box-shadow: inset 0 0 0 1px var(--border-contrast); }
.steps { pointer-events: auto; position: absolute; inset-inline: 0; bottom: var(--foot, 32px); display: none; justify-content: space-between;
  padding: var(--space-2) var(--space-3); }
:host([data-phone]) .steps { display: flex; }
.steps .ghost { min-block-size: 44px; background: var(--surface-raised); box-shadow: var(--shadow-xs); }
@media (prefers-reduced-motion: reduce) { .ghost { transition: none; } }
`;

/** Light-DOM chrome: frames, labels, section heads, edges and the docks, on classes no project writes. */
export const PAGE_CSS = `
html.cawco-canvas-page, html.cawco-canvas-page body { margin: 0; block-size: 100%; overflow: hidden; }
.cawco-canvas { position: fixed; inset: 0; overflow: hidden; touch-action: none; }
.cawco-world { position: absolute; inset-block-start: 0; inset-inline-start: 0; transform-origin: 0 0; display: flex; flex-direction: column;
  gap: var(--space-8); padding-block-end: 160px; will-change: transform; }
.cawco-section { display: flex; flex-direction: column; gap: var(--space-3); min-block-size: 120px; }
.cawco-section[data-cawco-asleep] .cawco-grid { display: none; }
.cawco-section-head { font: var(--type-title); color: var(--text-strong); padding-block-end: var(--space-1); border-block-end: 1px solid var(--border-hairline); }
.cawco-section-head[data-cawco-failed] { color: var(--error-11); }
.cawco-grid { display: grid; grid-auto-columns: max-content; gap: var(--space-6) var(--space-6); align-items: start; justify-content: start; }
.cawco-colhead { font: var(--type-meta); color: var(--text-muted); text-transform: none; }
.cawco-frame { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); min-inline-size: 0; position: relative; }
.cawco-frame-label { all: unset; box-sizing: border-box; display: grid; gap: 2px; max-inline-size: 360px; cursor: grab; border-radius: var(--radius-xs);
  padding: 2px var(--space-1); }
.cawco-frame-label:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.cawco-frame-words { font: var(--type-label); color: var(--text-strong); overflow-wrap: anywhere; }
.cawco-frame-small { font: var(--type-meta); color: var(--text-muted); overflow-wrap: anywhere; }
.cawco-frame-label[data-cawco-unnamed] .cawco-frame-words { color: var(--text-muted); font-style: italic; }
.cawco-frame-label[data-cawco-picked] { box-shadow: inset 0 0 0 2px var(--coral-9); }
.cawco-frame[data-cawco-selected] > .cawco-frame-body { outline: 1px dashed var(--focus-ring); outline-offset: 8px; }
.cawco-frame[data-cawco-edited] .cawco-frame-small::after { content: " · edited"; }
.cawco-frame[data-cawco-current] > .cawco-frame-body { outline: 2px solid var(--coral-9); outline-offset: 6px; }
.cawco-frame-body { position: relative; min-inline-size: 24px; min-block-size: 16px; }
.cawco-frame-status { font: var(--type-meta); color: var(--text-muted); font-variant-numeric: tabular-nums; }
.cawco-frame-status[data-state="failed"] { color: var(--error-11); }
.cawco-edges { position: absolute; inset: 0; inline-size: 1px; block-size: 1px; overflow: visible; pointer-events: none; z-index: 1; }
.cawco-edge { fill: none; stroke: var(--text-muted); stroke-width: 1.5; }
.cawco-edge-move { stroke: var(--coral-9); stroke-width: 2; pointer-events: stroke; cursor: pointer; }
.cawco-edge-group { stroke-dasharray: 3 4; }
.cawco-edges marker path { fill: context-stroke; }
.cawco-edge-label { font: var(--type-meta); fill: var(--text-muted); paint-order: stroke; stroke: var(--surface-page); stroke-width: 4px; }
.cawco-edge-label[data-cawco-move] { pointer-events: auto; cursor: pointer; fill: var(--coral-11); }
.cawco-rig { position: fixed; inset-inline-start: -20000px; inset-block-start: 0; visibility: visible; pointer-events: none; }
.cawco-dock-dials { position: fixed; inset-inline-end: var(--space-3); inset-block-start: var(--band, 96px); z-index: 2147483001; inline-size: 280px; }
.cawco-dock-timeline { position: fixed; inset-inline: var(--space-3); inset-block-end: calc(var(--foot, 32px) + var(--space-2)); z-index: 2147483001; }
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

/** DialKit's vanilla build, its stylesheet and nothing else, loaded once from the stage. */
let dialKit: Promise<DialKitGlobal> | undefined;
const loadDialKit = (): Promise<DialKitGlobal> => {
  dialKit ??= (async () => {
    const css = await (
      await fetch(new URL("dialkit.css", location.href))
    ).text();
    const style = document.createElement("style");
    style.dataset.cawcoDialkit = "";
    style.textContent = css;
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
  readonly #band: HTMLElement;
  readonly #crumb: HTMLElement;
  readonly #outline: HTMLElement;
  readonly #foot: HTMLElement;
  readonly #strip: HTMLElement;
  readonly #steps: HTMLElement;
  #current: string | null = null;
  #timeline: TimelineHandle | null = null;
  #dock: HTMLElement | null = null;
  /** Whether a look for the frame in view waits on the next frame; whether the page is a phone's; whether the dials stand. */
  readonly #flags: { dialed: boolean; pending: boolean; phone: boolean } = {
    dialed: false,
    pending: false,
    phone: false,
  };

  constructor(options: ChromeOptions) {
    this.#o = options;
    const page = document.createElement("style");
    page.dataset.cawcoCanvas = "";
    page.textContent = `${options.tokens.replaceAll(":root", ".cawco-canvas-page")}\n${PAGE_CSS}`;
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
    const about = document.createElement("div");
    about.className = "about";
    about.textContent = options.spec.about ?? "";
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
    this.#band.append(name, tools, about, this.#crumb);
    this.#strip = document.createElement("div");
    this.#strip.className = "strip";
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
      this.#band,
      this.#strip,
      this.#outline,
      this.#steps,
      this.#foot
    );
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

  /** The band's height: where the world starts below it. */
  top(): number {
    return (
      (this.#band.getBoundingClientRect().height || 72) +
      (this.#flags.phone ? this.#strip.getBoundingClientRect().height : 0)
    );
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
          small:
            frame.column.interaction === "rest"
              ? frame.story.name
              : `${frame.story.name} · ${frame.column.interaction}`,
        }))
    );
  }

  /** The outline, rebuilt: a heading per section, a row per frame. */
  outline(): void {
    this.#outline.replaceChildren();
    for (const section of this.#o.sections()) {
      const head = document.createElement("h3");
      head.textContent = section.mod?.SHEET.meta.title ?? section.file;
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
      const cy = box.y + (box.height + this.top()) / 2;
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
        frame.el.toggleAttribute(
          "data-cawco-current",
          frame.key === key && this.#current !== null && this.#outlineOpen()
        );
        frame.el.toggleAttribute("data-cawco-shown", frame.key === key);
      }
      section.el.toggleAttribute("data-cawco-shown", one?.section === section);
    }
    if (!one) {
      return;
    }
    const frame = one.section.frames.get(key);
    const title = one.section.mod?.SHEET.meta.title ?? one.section.file;
    this.#crumb.replaceChildren();
    const parts = [
      title,
      frame?.story.label ?? frame?.story.name ?? "",
      frame?.column.interaction ?? "",
    ];
    parts.forEach((part, at) => {
      if (at > 0) {
        this.#crumb.append(" › ");
      }
      const b = document.createElement(at === 1 ? "b" : "span");
      b.textContent = part;
      this.#crumb.append(b);
    });
    this.#phoneStrip();
  }

  #outlineOpen(): boolean {
    return !this.#outline.hidden;
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
    this.#flags.phone = innerWidth < PHONE_MAX;
    this.#host.toggleAttribute("data-phone", this.#flags.phone);
    document.documentElement.toggleAttribute(
      "data-cawco-phone",
      this.#flags.phone
    );
    const band = this.top();
    const foot = this.#foot.getBoundingClientRect().height || 32;
    for (const el of [this.#host, document.documentElement]) {
      el.style.setProperty("--band", `${band}px`);
      el.style.setProperty("--foot", `${foot}px`);
    }
    if (this.#flags.phone) {
      this.#phoneStrip();
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
    this.#strip.append(pick, chips);
    this.#steps.replaceChildren();
    const at = stories.indexOf(frame?.story.name ?? "");
    const back = stories[at - 1];
    const ahead = stories[at + 1];
    if (back) {
      this.#steps.append(this.#button(`◀ ${back}`, () => this.#step(-1)));
    } else {
      this.#steps.append(document.createElement("span"));
    }
    if (ahead) {
      this.#steps.append(this.#button(`${ahead} ▶`, () => this.#step(1)));
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

  /** The dock DialKit draws into, made once, in the page (DialKit's own CSS is scoped to its classes). */
  #dockOf(kind: "dials" | "timeline"): HTMLElement {
    const id = `cawco-dock-${kind}`;
    let dock = document.getElementById(id);
    if (!dock) {
      dock = document.createElement("div");
      dock.id = id;
      dock.className = `cawco-dock-${kind}`;
      document.body.append(dock);
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
      kit.createDialTimelineRoot({
        target: this.#dock,
        theme:
          document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      });
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
    const timeline = kit.createDialTimeline(move, clips, {
      autoplay: false,
      id: `move:${file}|${to}`,
    });
    this.#timeline = timeline;
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
    kit.createDialRoot({
      mode: "inline",
      target: dock,
      theme:
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
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
