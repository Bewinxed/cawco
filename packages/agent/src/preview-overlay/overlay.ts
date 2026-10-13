/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { PreviewElement } from "@cawco/core";
import type { ChoiceChange } from "@cawco/core/choices";
import { domToPng } from "modern-screenshot";
import { artifact, NO_ARTIFACT, type State } from "./artifact";
import { fillFields, trackFields } from "./fields";
import { morphPage, watchPointers, whenPointersUp } from "./morph";

const INSPECTOR_PATH = /^(.*):(\d+):(\d+)$/;
const PNG_PREFIX = /^data:image\/png;base64,/;
/** The page hash on the overlay's tag in a page's HTML (core `injectOverlay`). */
const SERVED_HASH =
  /<script src="\/__cawco\/overlay\.js" data-page-hash="([0-9a-f]{64})"/;
let selecting = false;
/** The tag that loaded this script (core's `injectOverlay`). */
const tag = document.currentScript as HTMLScriptElement | null;
/** The page as it was served; a morph moves it to the revision morphed to. */
let pageHash = tag?.dataset.pageHash ?? "";
// A page the hub serves carries its artifact's doc, so it is filled before it paints.
if (tag?.dataset.artifact && tag.dataset.state) {
  artifact.seed(tag.dataset.artifact, tag.dataset.state);
}
// Before any listener that stops a press: a morph waits for every pointer up.
watchPointers();

/**
 * The `/preview/<id>/<revision>/` prefix this page lives under. Derived from the current
 * path at load time — the overlay script is the first thing in <head>, so
 * location.pathname is the iframe's initial URL before any SPA navigation.
 */
const prefix = location.pathname.match(/^\/preview\/[^/]+\/[^/]+\//)?.[0] ?? "";

/**
 * Patch history.pushState/replaceState: a root-absolute `url` argument (starts
 * with `/` but not with the prefix) gets the prefix prepended so the iframe URL
 * stays under the routing prefix and Referer routing keeps working.
 */
for (const method of ["pushState", "replaceState"] as const) {
  const original = history[method];
  history[method] = function (...args: Parameters<History[typeof method]>) {
    if (prefix && typeof args[2] === "string") {
      const [, , u] = args;
      if (u.startsWith("/") && !u.startsWith(prefix)) {
        args[2] = `${prefix}${u.slice(1)}`;
      }
    }
    original.apply(this, args);
    navigated();
  };
}

/**
 * Patch WebSocket: a same-origin URL whose path does not start with the prefix
 * gets the prefix inserted. Vite's HMR client connects to `wss://host/` — this
 * makes it go through the dashboard's preview proxy instead of missing.
 */
if (prefix) {
  const OriginalWebSocket = window.WebSocket;
  const PatchedWebSocket = function (
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ): WebSocket {
    let resolved = typeof url === "string" ? url : url.toString();
    try {
      const parsed = new URL(resolved, location.href);
      if (
        parsed.host === location.host &&
        !parsed.pathname.startsWith(prefix)
      ) {
        parsed.pathname = `${prefix}${parsed.pathname.slice(1)}`;
        resolved = parsed.toString();
      }
    } catch {
      // leave as-is if URL parsing fails
    }
    if (protocols !== undefined) {
      return new OriginalWebSocket(resolved, protocols);
    }
    return new OriginalWebSocket(resolved);
  } as unknown as typeof WebSocket;
  Object.defineProperties(PatchedWebSocket, {
    prototype: { value: OriginalWebSocket.prototype },
    CONNECTING: { value: OriginalWebSocket.CONNECTING },
    OPEN: { value: OriginalWebSocket.OPEN },
    CLOSING: { value: OriginalWebSocket.CLOSING },
    CLOSED: { value: OriginalWebSocket.CLOSED },
  });
  window.WebSocket = PatchedWebSocket;
}

const host = document.createElement("cawco-overlay");
host.style.cssText =
  "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important";
const shadow = host.attachShadow({ mode: "open" });
const sheet = document.createElement("style");
sheet.textContent = `
  :host { color-scheme: light dark; }
  .layer { position:fixed; inset:0; pointer-events:none; cursor:crosshair; }
  .layer.select { pointer-events:auto; }
  .rect { position:fixed; pointer-events:none; outline:2px solid Highlight; background:color-mix(in srgb, Highlight 15%, transparent); }
  .label { position:fixed; pointer-events:none; max-width:100%; box-sizing:border-box; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:4px 7px; background:Canvas; color:CanvasText; font:12px/1.4 monospace; border:1px solid Highlight; }
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

/** Strip the preview prefix from a URL so the pane shows the app's own path. */
function stripPrefix(href: string): string {
  if (!prefix) {
    return href;
  }
  try {
    const u = new URL(href);
    if (u.pathname.startsWith(prefix)) {
      u.pathname = `/${u.pathname.slice(prefix.length)}`;
    }
    return u.toString();
  } catch {
    return href;
  }
}

function post(type: string, payload: object = {}) {
  // The pane serves this page at /preview/<id>/ on its own origin.
  window.parent.postMessage({ type, ...payload }, location.origin);
}

function ready() {
  post("cawco:ready", {
    url: stripPrefix(location.href),
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
  },
  meta: () => republished(),
  synced: () => {
    reflect();
    if (keepsFields()) {
      fillFields(artifact.state());
    }
    told();
    republished();
  },
  refused: (reason) => failed("state", reason),
});

/** The page as the doc has it, before the first paint the page reaches. */
function filled() {
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
  (node instanceof HTMLScriptElement &&
    node.getAttribute("src") === "/__cawco/overlay.js");

/** Where the page is served: the root of its own address. */
const pageUrl = () => new URL(prefix || "/", location.origin);

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
    if (selecting || !(event.target instanceof Element)) {
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
  window.parent.postMessage(
    { jsonrpc: "2.0", id, method, params },
    location.origin
  );
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
      /** Sends the picks to the session as one message, with `text` added when given. */
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
    url: stripPrefix(location.href),
    title: document.title,
  });
}

function mode(on: boolean) {
  selecting = on;
  layer.classList.toggle("select", on);
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

function selectorOf(element: Element): string {
  if (
    element.id &&
    document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1
  ) {
    return `#${CSS.escape(element.id)}`;
  }
  const testId = element.getAttribute("data-testid");
  const testSelector = `[data-testid="${CSS.escape(testId || "")}"]`;
  if (testId && document.querySelectorAll(testSelector).length === 1) {
    return testSelector;
  }
  const path: string[] = [];
  for (let el: Element | null = element; el; el = el.parentElement) {
    if (
      el.id &&
      document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1
    ) {
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

function elementAt(x: number, y: number): Element | null {
  layer.style.pointerEvents = "none";
  const element = document.elementFromPoint(x, y);
  layer.style.removeProperty("pointer-events");
  return element === host ? null : element;
}

function describe(el: Element): PreviewElement {
  const { x, y, width, height } = el.getBoundingClientRect();
  const computed = getComputedStyle(el);
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
  // The host hangs off <html>, so only a selection of the root itself can
  // carry overlay nodes; everything else serialises as it is, without a
  // subtree clone that a click on <body> would make expensive.
  let html = el.outerHTML;
  if (el.contains(host)) {
    const clone = el.cloneNode(true) as Element;
    for (const node of clone.querySelectorAll(
      "cawco-overlay, script[src='/__cawco/overlay.js']"
    )) {
      node.remove();
    }
    html = clone.outerHTML;
  }
  return {
    selector: selectorOf(el),
    tag: el.localName,
    id: el.id,
    classes: [...el.classList],
    html: html.slice(0, 2000),
    text: ((el as HTMLElement).innerText || el.textContent || "").slice(0, 200),
    rect: { x, y, width, height },
    page: { x: x + scrollX, y: y + scrollY },
    styles,
    source: sourceOf(el),
    url: stripPrefix(location.href),
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

async function capture(
  el: Element
): Promise<{ png: string | null; scale: number; error?: string }> {
  const scale = scaleFor(el);
  try {
    const png = await domToPng(el, {
      scale,
      filter: (node) => node !== host,
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

window.addEventListener(
  "mousemove",
  (event) => {
    if (!selecting) {
      return;
    }
    const el = elementAt(event.clientX, event.clientY);
    highlight.hidden = !el;
    label.hidden = !el;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const source = sourceOf(el);
    label.textContent = `${el.localName}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${el.classList[0]}` : ""}${source?.file ? ` — ${source.file}:${source.line ?? "?"}` : ""}`;
    label.style.left = `${Math.max(0, Math.min(rect.x, innerWidth - label.offsetWidth))}px`;
    label.style.top = `${Math.max(0, rect.y - label.offsetHeight)}px`;
  },
  true
);

let touchCaptured = false;

/** Resolves after the next frame has been drawn and handed on. */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setTimeout(resolve, 0))
    )
  );
}
let pickCount = 0;

/**
 * A pick goes out at once so its chip flies while the element is still
 * being drawn; the screenshot follows under the same id when it is ready.
 */
async function selectAt(clientX: number, clientY: number) {
  const el = elementAt(clientX, clientY);
  if (el) {
    pickCount += 1;
    const id = `${Date.now().toString(36)}-${pickCount}`;
    post("cawco:selected", { id, element: describe(el) });
    // This page shares the dashboard's thread, and the raster's first part
    // runs without a break: it starts only once the dashboard has taken the
    // pick and drawn the first frame of its flight, which the compositor then
    // carries on its own.
    await afterNextPaint();
    const { png, scale, error } = await capture(el);
    post("cawco:selected-png", error ? { id, error } : { id, png, scale });
  }
}

// While selecting, the whole press belongs to the overlay: a document-level
// outside-click handler in the app must not dismiss the thing being pointed
// at on pointerdown, before the click that would have selected it arrives.
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
    async (event) => {
      if (selecting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerdown") {
          touchCaptured = false;
        } else if (event.type === "touchend") {
          const [touch] = (event as TouchEvent).changedTouches;
          if (touch) {
            // Compatibility clicks belong to this same, already captured press.
            touchCaptured = true;
            await selectAt(touch.clientX, touch.clientY);
          }
        }
      }
    },
    { capture: true, passive: false }
  );
}

window.addEventListener(
  "click",
  async (event) => {
    if (!selecting) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!touchCaptured) {
      await selectAt(event.clientX, event.clientY);
    }
  },
  true
);

window.addEventListener(
  "keydown",
  (event) => {
    if (selecting && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      mode(false);
      post("cawco:escape");
    }
  },
  true
);

window.addEventListener("message", async (event) => {
  if (event.source !== window.parent || event.origin !== location.origin) {
    return;
  }
  const message = event.data;
  if (answered(message)) {
    return;
  }
  if (message?.type === "cawco:hello") {
    ready();
    // The host names the artifact this page is, and where its doc is synced.
    if (!artifact.join(message.artifact, message.sync)) {
      failed("artifact", NO_ARTIFACT);
    }
  } else if (message?.type === "cawco:mode") {
    mode(message.mode === "select");
  } else if (message?.type === "cawco:capture") {
    post("cawco:capture", await capture(document.documentElement));
  }
});

window.addEventListener("popstate", navigated);
window.addEventListener("hashchange", navigated);
ready();
