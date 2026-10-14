/**
 * The overlay where it runs: the outermost previewed document (overlay.ts
 * decides; a same-origin frame inside stands down and is reached from here).
 */
import type { PreviewElement } from "@cawco/core";
import type { ChoiceChange } from "@cawco/core/choices";
import {
  COMMENT_LIMITS,
  deletePin,
  findAnchor,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  pinUnsent,
  replyToPin,
  resolvePin,
  type SendPicture,
  withdrawPin,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import { domToPng } from "modern-screenshot";
import type { Map as YMap } from "yjs";
import { artifact, type Link, NO_ARTIFACT, type State } from "./artifact";
import { here, mark } from "./boot";
import { fillFields, trackFields } from "./fields";
import {
  deepElementAt,
  frameDocument,
  frameLoading,
  frameOrigin,
  framesOf,
  isFrame,
  rectOf,
  watchFrames,
} from "./frames";
import { heardFromHost, toHost } from "./host-origin";
import { startInk } from "./ink";
import { morphPage, watchPointers, whenPointersUp } from "./morph";
import { type Pins, startPins } from "./pins";
import { inkChrome } from "./radial";

const INSPECTOR_PATH = /^(.*):(\d+):(\d+)$/;
const PNG_PREFIX = /^data:image\/png;base64,/;
/** The page hash on the overlay's tag in a page's HTML (core `injectOverlay`). */
const SERVED_HASH =
  /<script src="\/__cawco\/overlay\.js" data-page-hash="([0-9a-f]{64})"/;
/** Comment mode is on: a tap on the page pins a comment to what it lands on. */
let commenting = false;
/** The moved pin a tap in Comment mode places again, instead of a new one. */
let placing: string | null = null;
/** The tag that loaded the script (core's `injectOverlay`), as the entry read it. */
const { tag } = here;
/** The page as it was served; a morph moves it to the revision morphed to. */
let pageHash = tag?.dataset.pageHash ?? "";
// A page the hub serves carries its artifact's doc, so it is filled before it paints.
if (tag?.dataset.artifact && tag.dataset.state) {
  artifact.seed(tag.dataset.artifact, tag.dataset.state, tag.dataset.kind);
}
// Before any listener that stops a press: a morph waits for every pointer up.
watchPointers();

// The history patch (boot.ts) tells the host of each in-place navigation.
here.navigated = () => navigated();

const host = document.createElement("cawco-overlay");
host.style.cssText =
  "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important";
const shadow = host.attachShadow({ mode: "open" });
const sheet = document.createElement("style");
sheet.textContent = `
  :host { color-scheme: light dark; }
  .layer { position:fixed; inset:0; pointer-events:none; cursor:crosshair; }
  .layer.comment { pointer-events:auto; }
  .rect { position:fixed; pointer-events:none; outline:var(--focus-ring-width, 2px) solid var(--brand-solid); outline-offset:2px; border-radius:var(--radius-xs); background:color-mix(in srgb, var(--brand-solid) 8%, transparent); }
  .label { position:fixed; pointer-events:none; max-width:100%; box-sizing:border-box; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:var(--space-1) var(--space-2); border-radius:var(--radius-xs); background:var(--surface-raised); color:var(--ink-strong); font:var(--type-meta); border:1px solid var(--border-control); box-shadow:var(--shadow-tile); }
`;
const layer = document.createElement("div");
layer.className = "layer";
const highlight = document.createElement("div");
highlight.className = "rect";
const label = document.createElement("div");
label.className = "label";
highlight.hidden = true;
label.hidden = true;
shadow.append(sheet, layer, highlight, label);
document.documentElement.append(host);

const chrome = inkChrome(shadow);

/** The overlay's outline round `el`, the pin's element the person rests on or the host focuses; none hides it. */
function outline(el: Element | null) {
  if (commenting) {
    return;
  }
  highlight.hidden = !el;
  label.hidden = true;
  if (el) {
    cover(highlight, rectOf(el));
  }
}

/** Lays `node` over `rect`, the viewport's px. */
function cover(node: HTMLElement, rect: DOMRect) {
  Object.assign(node.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

/** The person's pins, drawn after the ink (pins.ts). */
const pins: Pins = startPins({
  anchorOf,
  capture: (el, scale) => capture(el, scale),
  chrome,
  describe,
  groupBox: (id) => ink.groupBox(id),
  locate,
  outline,
  post,
  waiting,
});

/** The ink a pen draws on the page, and the icon and menu at a stroke's end (ink.ts, radial.ts). */
const ink = startInk({
  anchorOf,
  chrome,
  capture: pageCapture,
  describe,
  elementAt,
  locate,
  pins: () => pins,
  post,
  waiting,
});

/*
 * A same-origin frame scrolled, resized, grew or navigated, or a scroll
 * container of the page's own (a transcript, a pane) scrolled: the marks in
 * it stand where its elements are now, and the outline Comment mode drew
 * over one of them follows, once per frame. The window's own scroll moves
 * the marks with it: their layers are the page's.
 */
let framesFrame = 0;
function framesChanged() {
  if (framesFrame) {
    return;
  }
  framesFrame = requestAnimationFrame(() => {
    framesFrame = 0;
    ink.replace();
    if (commenting && hovered) {
      hover(hovered);
    }
  });
}
watchFrames(framesChanged);
addEventListener(
  "scroll",
  (event) => {
    if (event.target !== document) {
      framesChanged();
    }
  },
  { capture: true, passive: true }
);
// A frame inside, whose own overlay stood down, says when its history moved it in place.
mark.frameChanged = framesChanged;

function post(type: string, payload: object = {}) {
  toHost({ type, ...payload });
}

/** The doc's link to the hub, to the host (`cawco:sync`): connecting, synced or lost, and why it was lost. */
function tellLink(link: Link) {
  post("cawco:sync", {
    state: link.state,
    ...(link.error ? { error: link.error } : {}),
  });
}

/** How long a burst of doc changes (typing a note) is gathered into one word to the host. Our call. */
const DOC_TOLD_MS = 100;
let docTelling: ReturnType<typeof setTimeout> | null = null;

/**
 * The doc changed — a pick, a note, a pin, the agent's patch, a Send's
 * stamp — so a host that counts from the hub's reads (the app's Send N)
 * reads again at once (`cawco:doc`): one word per burst.
 */
function tellDoc() {
  if (docTelling) {
    return;
  }
  docTelling = setTimeout(() => {
    docTelling = null;
    post("cawco:doc");
  }, DOC_TOLD_MS);
}

function ready() {
  post("cawco:ready", {
    url: location.href,
    title: document.title,
  });
}

/*
 * The page's state (Projects spec §5.10), kept in its artifact's document,
 * which the overlay joins itself (artifact.ts). A page marks a choice in
 * markup — `data-cawco-choice="hero"` on the element (or a container),
 * `data-option="b"` on each option, `data-cawco-multiple` on the choice to
 * allow several — or calls `cawco.choose`, `cawco.note`, `cawco.set` and
 * `cawco.on("picks", …)`; every named field of a page is kept too
 * (fields.ts). All of them read and write the doc's `state` directly; the
 * host relays nothing. The one thing the page asks its host is
 * `cawco.pickPlace`, which needs the host's own pickers.
 */

const listeners = new Set<(current: State) => void>();

/**
 * Tells the host something went wrong, `of` naming what: a field the hub's
 * bounds refused, a send, the state as a whole, a morph, the artifact.
 */
function failed(
  of: "artifact" | "field" | "morph" | "send" | "state",
  message: string
) {
  post("cawco:error", { message: message.slice(0, 300), of });
}

/** Writes one change into the doc; refused with the bound's sentence, which the host also hears. */
function change(entry: ChoiceChange): Promise<void> {
  const problem = artifact.write(entry);
  if (problem) {
    failed("state", problem);
    return Promise.reject(new Error(problem));
  }
  return Promise.resolve();
}

const choiceOf = (option: Element): Element | null =>
  option.closest("[data-cawco-choice]");

/** Marks each option in the page as picked or not, from the stored picks. */
function reflect() {
  const picks = artifact.state();
  for (const option of document.querySelectorAll("[data-option]")) {
    const choice = choiceOf(option)?.getAttribute("data-cawco-choice");
    const on =
      !!choice &&
      (picks[choice]?.options ?? []).includes(
        option.getAttribute("data-option") ?? ""
      );
    option.toggleAttribute("data-cawco-picked", on);
    if (option.localName === "button") {
      option.setAttribute("aria-pressed", String(on));
    }
  }
}

/** The page's own listeners hear the state as it stands. */
function told() {
  const current = artifact.state();
  for (const listener of listeners) {
    listener(current);
  }
}

/** Whether this page's fields are kept: a page's are; a dev server's app is its own. */
const keepsFields = () => artifact.kind() === "page";

/** Fields whose last write the hub's bounds refused, so a later good one clears the host's word. */
const refusedFields = new Set<string>();

trackFields((key, holds, el) => {
  if (!keepsFields()) {
    return;
  }
  const problem = artifact.write({ choice: key, pageHash, ...holds });
  // Said under the field itself, as the browser says any field's problem.
  if ("setCustomValidity" in el) {
    (el as HTMLInputElement).setCustomValidity(problem ?? "");
  }
  if (problem) {
    refusedFields.add(key);
    (el as HTMLInputElement).reportValidity?.();
    failed("field", `${key}: ${problem}`);
  } else if (refusedFields.delete(key)) {
    post("cawco:resolved", { of: "field" });
  }
});

artifact.watch({
  state: (keys, remote) => {
    reflect();
    if (remote && keepsFields()) {
      fillFields(artifact.state(), keys);
    }
    told();
    tellDoc();
  },
  meta: () => {
    republished();
    tellDoc();
  },
  ink: () => {
    ink.changed();
    tellDoc();
  },
  link: (link) => tellLink(link),
  synced: () => {
    reflect();
    if (keepsFields()) {
      fillFields(artifact.state());
    }
    told();
    republished();
    tellDoc();
  },
  refused: (reason) => failed("state", reason),
});

/** The host's theme, once it said one: "light" or "dark". */
let hostTheme: "light" | "dark" | null = null;

/**
 * A page artifact (HTML the agent wrote) draws in the host's theme, never the
 * OS's (DESIGN.md: the theme follows ours), on its root's `color-scheme` and
 * `data-theme`; a preview is someone's own app and keeps its own.
 */
function themed() {
  if (!hostTheme || artifact.kind() !== "page") {
    return;
  }
  const root = document.documentElement;
  root.style.colorScheme = hostTheme;
  root.dataset.theme = hostTheme;
}

function takeTheme(said: unknown) {
  if (said === "light" || said === "dark") {
    hostTheme = said;
    themed();
  }
}

/**
 * What of the page's edges the host's chrome takes, px (`inset` in its
 * `cawco:hello` and `cawco:place`): `top`, the composer's grab band; `side`,
 * how far in its shape's sides stand; none in the panel. A canvas's rail
 * stands inside them (canvas.css `--canvas-inset-top`, `--canvas-inset-side`),
 * and stays unseen until a host has said them (`data-canvas-inset`), so its
 * first paint is where it stands. Taken here, in the overlay, which hears the
 * host from its first hello: a hello the app says while the document is still
 * interactive comes before the canvas's own module listens.
 */
function takeInset(said: unknown) {
  const inset = said as { side?: unknown; top?: unknown } | undefined;
  if (!inset) {
    return;
  }
  const px = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `${value}px`
      : null;
  const top = px(inset.top);
  if (top === null) {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--canvas-inset-top", top);
  root.style.setProperty("--canvas-inset-side", px(inset.side) ?? "0px");
  root.dataset.canvasInset = "";
}

/** The page as the doc has it, before the first paint the page reaches; a morph's new root takes the theme again. */
function filled() {
  themed();
  reflect();
  if (keepsFields()) {
    fillFields(artifact.state());
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", filled, { once: true });
} else {
  filled();
}

/*
 * Re-publish (`artifact_update` with new HTML): the doc's `meta` names the
 * page's new hash, and the page morphs to it in place (morph.ts), fetched
 * afresh from its own origin. The overlay's host and its own script are not
 * the page's, and stay as they are.
 */
const kept = (node: Node): boolean =>
  node === host ||
  node === ink.layer ||
  node === pins.layer ||
  (node instanceof HTMLScriptElement &&
    node.getAttribute("src") === "/__cawco/overlay.js");

/** Where the page is served: the root of its own address. */
const pageUrl = () => new URL("/", location.origin);

let fetching = false;
let fetchAgain = false;
/** The newest HTML fetched: what an element left unmorphed morphs to on its blur. */
let latest = "";

function morphTo(html: string) {
  const held = morphPage(html, kept);
  pageHash = html.match(SERVED_HASH)?.[1] ?? pageHash;
  filled();
  told();
  navigated();
  // The page moved under its ink: each group stands where its element is now.
  ink.replace();
  if (held) {
    held.addEventListener(
      "focusout",
      () => {
        if (latest === html) {
          whenPointersUp(() => {
            morphPage(html, kept);
            filled();
          });
        }
      },
      { once: true }
    );
  }
}

async function republished() {
  const wanted = artifact.meta().pageHash;
  if (!(keepsFields() && wanted) || wanted === pageHash) {
    return;
  }
  if (fetching) {
    fetchAgain = true;
    return;
  }
  fetching = true;
  try {
    const response = await fetch(pageUrl(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`The new revision did not load (${response.status}).`);
    }
    const html = await response.text();
    latest = html;
    whenPointersUp(() => morphTo(html));
  } catch (error) {
    failed("morph", error instanceof Error ? error.message : String(error));
  } finally {
    fetching = false;
    if (fetchAgain) {
      fetchAgain = false;
      republished();
    }
  }
}

function choose(
  choice: string,
  option: string | string[] | null
): Promise<void> {
  let options: string[] = [];
  if (Array.isArray(option)) {
    options = option;
  } else if (option !== null) {
    options = [option];
  }
  return change({ choice, pageHash, options });
}

/** A refusal the host was already told of; the page stays as stored. */
const toldHost = () => undefined;

window.addEventListener(
  "click",
  (event) => {
    if (commenting || !(event.target instanceof Element)) {
      return;
    }
    const option = event.target.closest("[data-option]");
    const holder = option && choiceOf(option);
    const choice = holder?.getAttribute("data-cawco-choice");
    const value = option?.getAttribute("data-option");
    if (!(holder && choice && value)) {
      return;
    }
    const current = artifact.state()[choice]?.options ?? [];
    if (holder.hasAttribute("data-cawco-multiple")) {
      choose(
        choice,
        current.includes(value)
          ? current.filter((picked) => picked !== value)
          : [...current, value]
      ).catch(toldHost);
    } else {
      choose(choice, current.includes(value) ? null : value).catch(toldHost);
    }
  },
  true
);

/*
 * `cawco.pickPlace`: the one request the page makes of its host, which
 * answers with its own machine list and folder browser (the dashboard's
 * PlacePick) as a JSON-RPC result.
 */
let nextAsk = 1;
const asking = new Map<number, (result: unknown) => void>();

function askHost(method: string, params: object): Promise<unknown> {
  const id = nextAsk;
  nextAsk += 1;
  toHost({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => asking.set(id, resolve));
}

/** The host's answer to an ask; false when the message is not one. */
function answered(data: unknown): boolean {
  const message = data as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
  } | null;
  if (message?.jsonrpc !== "2.0" || typeof message.id !== "number") {
    return false;
  }
  const resolve = asking.get(message.id);
  asking.delete(message.id);
  resolve?.(message.result ?? null);
  return true;
}

declare global {
  interface Window {
    cawco: {
      choose: (
        choice: string,
        option: string | string[] | null
      ) => Promise<void>;
      note: (choice: string, text: string) => Promise<void>;
      set: (key: string, value: unknown) => Promise<void>;
      /** The person's Send: the session hears it has new responses to read; `text` is kept with them. */
      send: (text?: string) => Promise<void>;
      on: (event: "picks", listener: (picks: State) => void) => () => void;
      /**
       * Asks the person for a machine and a folder on it, with CawCo's own
       * machine list and folder browser; the pick is stored under `place`
       * like a `set`, and answered, or null when they cancel.
       */
      pickPlace: () => Promise<PlacePick | null>;
    };
  }
}

/** A machine and a folder on it, as `cawco.pickPlace` answers. */
interface PlacePick {
  machineId: string;
  path: string;
}

const isPlace = (value: unknown): value is PlacePick =>
  typeof (value as PlacePick | null)?.machineId === "string" &&
  typeof (value as PlacePick).path === "string";

Object.defineProperty(window, "cawco", {
  value: Object.freeze({
    choose,
    note: (choice: string, text: string) =>
      change({ choice, pageHash, note: text }),
    set: (key: string, value: unknown) =>
      change({ choice: key, pageHash, value }),
    send: async (text = "") => {
      try {
        await artifact.send(text.trim());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed("send", message);
        throw error;
      }
    },
    on: (event: "picks", listener: (current: State) => void) => {
      if (event !== "picks") {
        throw new Error(`cawco.on: unknown event ${event}`);
      }
      listeners.add(listener);
      if (artifact.known()) {
        listener(artifact.state());
      }
      return () => listeners.delete(listener);
    },
    pickPlace: async () => {
      const place = await askHost("cawco/pick-place", { pageHash });
      if (!isPlace(place)) {
        return null;
      }
      await change({ choice: "place", pageHash, value: place });
      return place;
    },
  }),
});

function navigated() {
  post("cawco:navigated", {
    url: location.href,
    title: document.title,
  });
}

/** Comment mode on or off; `again` names the moved pin the next tap places again. */
function mode(on: boolean, again: string | null = null) {
  commenting = on;
  placing = on ? again : null;
  layer.classList.toggle("comment", on);
  hovered = null;
  highlight.hidden = true;
  label.hidden = true;
}

interface Fiber {
  _debugOwner?: Fiber;
  _debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  type?: { name?: string };
}

type DevElement = Element & {
  __svelte_meta?: { loc?: { file: string; line: number; column: number } };
  __vueParentComponent?: { type?: { __file?: string } };
};

function reactSource(
  el: Element
): Omit<NonNullable<PreviewElement["source"]>, "of"> | null {
  const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$"));
  let fiber = key ? (el as unknown as Record<string, Fiber>)[key] : undefined;
  let component: string | undefined;
  while (fiber) {
    if (fiber._debugSource) {
      const loc = fiber._debugSource;
      return {
        file: loc.fileName,
        line: loc.lineNumber,
        column: loc.columnNumber ?? null,
        framework: "react",
      };
    }
    component ??= fiber.type?.name;
    fiber = fiber._debugOwner;
  }
  return component
    ? { file: null, line: null, column: null, framework: "react", component }
    : null;
}

type Source = NonNullable<PreviewElement["source"]>;

function sourceAt(el: DevElement, of: Source["of"]): Source | null {
  const loc = el.__svelte_meta?.loc;
  if (loc) {
    return { ...loc, framework: "svelte", of };
  }
  const inspector = el.getAttribute("data-insp-path")?.match(INSPECTOR_PATH);
  if (inspector) {
    return {
      file: inspector[1],
      line: Number(inspector[2]),
      column: Number(inspector[3]),
      framework: "code-inspector",
      of,
    };
  }
  const react = reactSource(el);
  if (react) {
    return { ...react, of };
  }
  const file = el.__vueParentComponent?.type?.__file;
  if (file) {
    return { file, line: null, column: null, framework: "vue", of };
  }
  return null;
}

/**
 * The nearest source the agent can actually edit. A leaf often belongs to a
 * library component — a text-morph glyph, an icon's path — whose file sits in
 * node_modules; the ancestor that *uses* that component is the line to change,
 * so the walk keeps going past dependency code and only settles for it when
 * nothing else is on the way up.
 */
function sourceOf(element: Element): PreviewElement["source"] {
  let fallback: Source | null = null;
  for (let el: DevElement | null = element; el; el = el.parentElement) {
    const of = el === element ? "self" : (`ancestor:${el.localName}` as const);
    const found = sourceAt(el, of);
    if (!found) {
      continue;
    }
    // Only a real file outside dependency code ends the walk; a component
    // name with no file, or a file in node_modules, is kept in case nothing
    // better is on the way up.
    if (found.file && !found.file.includes("/node_modules/")) {
      return found;
    }
    fallback ??= found;
  }
  return fallback;
}

/** `element`'s selector in its own document (a frame's, for an element inside one). */
function selectorOf(element: Element): string {
  const doc = element.ownerDocument;
  if (
    element.id &&
    doc.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1
  ) {
    return `#${CSS.escape(element.id)}`;
  }
  const testId = element.getAttribute("data-testid");
  const testSelector = `[data-testid="${CSS.escape(testId || "")}"]`;
  if (testId && doc.querySelectorAll(testSelector).length === 1) {
    return testSelector;
  }
  const path: string[] = [];
  for (let el: Element | null = element; el; el = el.parentElement) {
    if (el.id && doc.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      path.unshift(`#${CSS.escape(el.id)}`);
      break;
    }
    let index = 1;
    for (
      let sibling = el.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      if (sibling.localName === el.localName) {
        index += 1;
      }
    }
    path.unshift(`${CSS.escape(el.localName)}:nth-of-type(${index})`);
  }
  return path.join(" > ");
}

/** The deepest element at the viewport's `x`, `y`: inside every same-origin frame it lands on (frames.ts). */
function elementAt(x: number, y: number): Element | null {
  layer.style.pointerEvents = "none";
  const element = document.elementFromPoint(x, y);
  layer.style.removeProperty("pointer-events");
  return element === host ? null : deepElementAt(element, x, y);
}

/** The selectors of the frames `el` stands in, outermost first, each in its parent's document. */
const frameSelectors = (el: Element): string[] => framesOf(el).map(selectorOf);

/** An element's own dev source, none of its ancestors': what a pin's file:line finds it by. */
function ownSource(el: Element): Source | null {
  return sourceAt(el as DevElement, "self");
}

/** The element's text as a pin keeps it: what it shows, cut to the anchor's bound. */
function textOf(el: Element): string {
  return ((el as HTMLElement).innerText || el.textContent || "")
    .trim()
    .slice(0, COMMENT_LIMITS.anchorText);
}

/** What a page's mark stands on, read from `el` as it is now: inside a frame, the frames it stands in too. */
function anchorOf(el: Element): PageAnchor {
  const { x, y, width, height } = rectOf(el);
  const frames = frameSelectors(el);
  return {
    ...(frames.length > 0 ? { frames } : {}),
    selector: selectorOf(el),
    source: sourceOf(el),
    text: textOf(el),
    box: {
      x: Math.round(x + scrollX),
      y: Math.round(y + scrollY),
      w: Math.round(width),
      h: Math.round(height),
    },
  };
}

/** `doc`'s own elements (the page's, or a frame's), any overlay's left out. */
function pageElements(doc: Document): Element[] {
  return [...(doc.body?.querySelectorAll("*") ?? [])].filter(
    (el) =>
      !el.closest("cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins]")
  );
}

/** The same-origin frame `selector` names in `within`, by its document; null when it is not there or not of this origin. */
function frameIn(within: Document, selector: string): Document | null {
  let frame: Element | null = null;
  try {
    frame = within.querySelector(selector);
  } catch {
    return null;
  }
  return isFrame(frame) ? frameDocument(frame) : null;
}

/**
 * Whether an anchor's frames lead to one still loading: its mark is not
 * found yet, and is not gone either.
 */
function waiting(anchor: PageAnchor): boolean {
  let within: Document | null = document;
  for (const selector of anchor.frames ?? []) {
    let frame: Element | null = null;
    try {
      frame = within.querySelector(selector);
    } catch {
      return false;
    }
    if (!isFrame(frame)) {
      return false;
    }
    if (frameLoading(frame)) {
      return true;
    }
    within = frameDocument(frame);
    if (!within) {
      return false;
    }
  }
  return false;
}

/** Where a page's anchor stands now (core `findAnchor`: down its frames, then file:line, then selector, then text). */
function locate(anchor: PageAnchor) {
  return findAnchor<Element, Document>(anchor, {
    top: document,
    frame: frameIn,
    bySource: (within, file, line) =>
      pageElements(within).filter((el) => {
        const own = ownSource(el);
        return own?.file === file && own.line === line;
      }),
    bySelector: (within, selector) => {
      try {
        return within.querySelector(selector);
      } catch {
        return null;
      }
    },
    textOf,
    byText: (within, text) => {
      const matches = pageElements(within).filter((el) => textOf(el) === text);
      // The deepest: the one holding no other match.
      return (
        matches.find(
          (el) => !matches.some((other) => other !== el && el.contains(other))
        ) ?? null
      );
    },
  });
}

/** `el` as a pin names it: its box in the top viewport and page, its styles, and the address of the document it is in. */
function describe(el: Element): PinnedElement {
  const { x, y, width, height } = rectOf(el);
  const computed = (el.ownerDocument.defaultView ?? window).getComputedStyle(
    el
  );
  const styles = Object.fromEntries(
    [
      "color",
      "backgroundColor",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "display",
      "position",
      "padding",
      "margin",
      "borderRadius",
    ].map((key) => [key, computed[key as keyof CSSStyleDeclaration]])
  ) as PreviewElement["styles"];
  return {
    selector: selectorOf(el),
    tag: el.localName,
    id: el.id,
    classes: [...el.classList],
    text: textOf(el),
    rect: { x, y, width, height },
    page: { x: x + scrollX, y: y + scrollY },
    styles,
    source: sourceOf(el),
    url: el.ownerDocument.location.href,
  };
}

/** A canvas side every browser draws (Chrome's area cap is this squared). */
const CANVAS_SIDE = 16_384;
/** Pixels in one screenshot: enough to read, small enough to send. */
const CANVAS_AREA = 16_000_000;

/**
 * The raster scale for an element: the screen's density up to 2, brought
 * down until the canvas fits. Past a browser's canvas limits the raster
 * comes out empty, so a tall element is drawn smaller instead.
 */
function scaleFor(el: Element): number {
  const { width, height } = el.getBoundingClientRect();
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return Math.min(
    2,
    devicePixelRatio,
    CANVAS_SIDE / w,
    CANVAS_SIDE / h,
    Math.sqrt(CANVAS_AREA / (w * h))
  );
}

/** The whole page as a picture, its ink on it, at `scale` (the page's own, when none). */
function pageCapture(scale?: number) {
  return capture(document.documentElement, scale);
}

async function capture(
  el: Element,
  scale = scaleFor(el)
): Promise<{ png: string | null; scale: number; error?: string }> {
  try {
    const png = await domToPng(el, {
      scale,
      // Any overlay's own UI, this one's or a same-origin frame's, is left out.
      filter: (node) => (node as Element).localName !== "cawco-overlay",
    });
    if (!PNG_PREFIX.test(png)) {
      throw new Error("The element was too large to draw.");
    }
    return { png: png.replace(PNG_PREFIX, ""), scale };
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : String(reason);
    post("cawco:error", { message: error });
    return { png: null, scale, error };
  }
}

/** The element Comment mode last outlined under the pointer. */
let hovered: Element | null = null;

/**
 * What the hover label says of `el`: its tag, id, first class and dev
 * source; a frame of another origin, which cannot be read into, by its origin.
 */
function labelOf(el: Element): string {
  const named = `${el.localName}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${el.classList[0]}` : ""}`;
  if (isFrame(el) && !frameDocument(el)) {
    return `${named} — ${frameOrigin(el)}`;
  }
  const source = sourceOf(el);
  return `${named}${source?.file ? ` — ${source.file}:${source.line ?? "?"}` : ""}`;
}

/** Comment mode's outline and label over `el`, mapped to the top viewport; none hides them. */
function hover(el: Element | null) {
  hovered = el?.isConnected ? el : null;
  highlight.hidden = !hovered;
  label.hidden = !hovered;
  if (!hovered) {
    return;
  }
  const rect = rectOf(hovered);
  cover(highlight, rect);
  label.textContent = labelOf(hovered);
  label.style.left = `${Math.max(0, Math.min(rect.x, innerWidth - label.offsetWidth))}px`;
  label.style.top = `${Math.max(0, rect.y - label.offsetHeight)}px`;
}

window.addEventListener(
  "mousemove",
  (event) => {
    if (commenting) {
      hover(elementAt(event.clientX, event.clientY));
    }
  },
  true
);

let touchCaptured = false;

/** A tap in Comment mode: a comment pinned where it landed, or the moved pin being placed again. */
function commentAt(clientX: number, clientY: number) {
  const el = elementAt(clientX, clientY);
  if (!(el && artifact.keeps())) {
    return;
  }
  // A tap on a pin's own disc opens that pin, as it does out of Comment mode.
  const disc = el.closest("[data-pin-id]")?.getAttribute("data-pin-id");
  if (disc) {
    post("cawco:pin-open", { id: disc });
    return;
  }
  if (placing) {
    pins.placeAgain(placing, el, clientX, clientY);
    placing = null;
    return;
  }
  pins.commentAt(el, clientX, clientY);
}

/*
 * A press on the page, out of Comment mode, tells the host (`cawco:press`):
 * a press outside the open pin's card closes it, and the page is a frame of
 * its own origin and process, whose presses the host's document never hears.
 * One on a pin's disc opens that pin instead, and the overlay's own chrome
 * (the ink's icon and menu) is the overlay's. A Comment-mode tap opens a pin
 * of its own (`cawco:pin-open`), which closes the last one's card.
 */
window.addEventListener(
  "pointerdown",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      commenting ||
      target?.closest("[data-pin-id], cawco-overlay") ||
      !artifact.keeps()
    ) {
      return;
    }
    post("cawco:press");
  },
  { capture: true, passive: true }
);

// In Comment mode the whole press belongs to the overlay: a document-level
// outside-click handler in the app must not dismiss the thing being pointed
// at on pointerdown, before the click that would pin it arrives.
for (const type of [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "auxclick",
  "contextmenu",
  "touchstart",
  "touchend",
] as const) {
  window.addEventListener(
    type,
    (event) => {
      // A pen draws, in Comment mode too: only a finger or a mouse pins.
      if (
        commenting &&
        !(event instanceof PointerEvent && event.pointerType === "pen")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerdown") {
          touchCaptured = false;
        } else if (event.type === "touchend") {
          const [touch] = (event as TouchEvent).changedTouches;
          if (touch) {
            // Compatibility clicks belong to this same, already captured press.
            touchCaptured = true;
            commentAt(touch.clientX, touch.clientY);
          }
        }
      }
    },
    { capture: true, passive: false }
  );
}

window.addEventListener(
  "click",
  (event) => {
    if (!commenting) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!touchCaptured) {
      commentAt(event.clientX, event.clientY);
    }
  },
  true
);

/** The pane's keys, heard while the page has the keyboard: C, J, K, Enter and Esc. */
const PANE_KEYS = new Set(["c", "j", "k", "Enter", "Escape"]);

/** Whether `target` takes typing: the page's own keys stay its own there. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

window.addEventListener(
  "keydown",
  (event) => {
    if (commenting && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      mode(false);
      post("cawco:escape");
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (
      !PANE_KEYS.has(key) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      typing(event.target) ||
      !artifact.keeps() ||
      artifact.kind() === "canvas"
    ) {
      return;
    }
    post("cawco:key", { key });
  },
  true
);

/** The pictures a send carries: each unsent pin's, and the page with its ink when ink no pin stands on is unsent. */
async function sendPictures(): Promise<SendPicture[]> {
  const doc = artifact.doc();
  const all = [...(doc.getMap("pins") as YMap<Pin>).values()];
  const owed = all.filter(pinUnsent).sort((a, b) => a.number - b.number);
  const pinned = new Set(all.map((pin) => pin.ink));
  const loose = [...(doc.getMap("ink") as YMap<InkGroup>).values()].some(
    (group) => !(group.sentAt || pinned.has(group.id))
  );
  const pictures: SendPicture[] = [];
  if (loose) {
    const png = await pins.pagePicture();
    if (png) {
      pictures.push({ pin: null, png });
    }
  }
  for (const pin of owed.slice(0, COMMENT_LIMITS.pictures - pictures.length)) {
    // biome-ignore lint/performance/noAwaitInLoops: one raster at a time keeps the page responsive
    const png = await pins.picture(pin.id, false);
    if (png) {
      pictures.push({ pin: pin.id, png });
    }
  }
  return pictures;
}

type HostMessage = Record<string, unknown>;

const idOf = (message: HostMessage) =>
  typeof message.id === "string" ? message.id : null;

/**
 * The person's write on pin `message.pin`, once the doc holds the hub's
 * state, answered as `result` with `ok`, or the refusal's sentence. A message
 * naming no pin has nothing to answer under.
 */
async function personWrite(
  message: HostMessage,
  result: "cawco:reply-result" | "cawco:resolve-result" | "cawco:delete-result",
  write: (pin: string) => string | null
) {
  const { pin } = message;
  if (typeof pin !== "string") {
    return;
  }
  if (!artifact.keeps()) {
    post(result, { pin, ok: false, error: NO_ARTIFACT });
    return;
  }
  await artifact.whenKnown();
  const error = write(pin);
  post(result, error ? { pin, ok: false, error } : { pin, ok: true });
}

/** What each of the host's messages does, by its type. */
const fromHost: Record<string, (message: HostMessage) => void | Promise<void>> =
  {
    "cawco:hello": (message) => {
      ready();
      // The host names the artifact this page is, and where its doc is synced.
      const named = message as {
        artifact: Parameters<typeof artifact.join>[0];
        sync: Parameters<typeof artifact.join>[1];
      };
      if (artifact.join(named.artifact, named.sync)) {
        tellLink(artifact.link());
      } else {
        failed("artifact", NO_ARTIFACT);
      }
      takeTheme(message.theme);
      takeInset(message.inset);
    },
    "cawco:place": (message) => takeInset(message.inset),
    "cawco:theme": (message) => takeTheme(message.theme),
    // A host that holds no doc of its own (the app) writes the person's reply,
    // resolve and delete through this page's, by the one write core keeps.
    "cawco:reply": (message) =>
      personWrite(message, "cawco:reply-result", (pin) =>
        replyToPin(
          artifact.doc(),
          pin,
          typeof message.text === "string" ? message.text : ""
        )
      ),
    "cawco:resolve": (message) =>
      personWrite(message, "cawco:resolve-result", (pin) =>
        typeof message.resolved === "boolean"
          ? resolvePin(artifact.doc(), pin, message.resolved)
          : "A resolve says resolved or reopened, so the pin wasn't changed."
      ),
    "cawco:delete": (message) =>
      personWrite(message, "cawco:delete-result", (pin) =>
        deletePin(artifact.doc(), pin)
      ),
    // The app dismissed the card of a pin it just made, said nothing in it: taken back.
    "cawco:withdraw": async (message) => {
      if (typeof message.pin === "string" && artifact.keeps()) {
        await artifact.whenKnown();
        withdrawPin(artifact.doc(), message.pin);
      }
    },
    "cawco:mode": (message) =>
      mode(
        message.mode === "comment",
        typeof message.place === "string" ? message.place : null
      ),
    "cawco:focus-pin": (message) =>
      pins.focus(idOf(message), message.scroll === true),
    "cawco:track-pin": (message) => pins.track(idOf(message)),
    // A card's thumbnail, or its full picture for the lightbox.
    "cawco:picture": async (message) => {
      const id = idOf(message);
      if (id) {
        const thumb = message.thumb === true;
        post("cawco:picture", {
          id,
          thumb,
          png: await pins.picture(id, thumb),
        });
      }
    },
    // The person's Send N: each unsent pin's picture, and the page with its ink.
    "cawco:send-pictures": async (message) =>
      post("cawco:send-pictures", {
        ask: message.ask,
        url: location.href,
        pictures: await sendPictures(),
      }),
    "cawco:capture": async () =>
      post("cawco:capture", await capture(document.documentElement)),
    // The composer's Send: the pins as text and the page with its ink as a picture.
    "cawco:ink-export": async () =>
      post("cawco:ink-exported", await ink.exported()),
    "cawco:ink-sent": () => ink.sent(),
  };

window.addEventListener("message", async (event) => {
  if (!heardFromHost(event)) {
    return;
  }
  const message = event.data as HostMessage | null;
  if (answered(message)) {
    return;
  }
  const handle =
    typeof message?.type === "string" ? fromHost[message.type] : undefined;
  await handle?.(message as HostMessage);
});

/*
 * A canvas's page tells its host which element a press (no drag) landed on
 * (canvas-host scene.ts): the Decisions tab opens a decision page from it.
 */
window.addEventListener("cawco:element-press", (event) => {
  post("cawco:element-press", {
    artifact: artifact.id(),
    ...(event as CustomEvent<object>).detail,
  });
});

window.addEventListener("popstate", navigated);
window.addEventListener("hashchange", navigated);
ready();
