/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { PreviewElement } from "@cawco/core";
import { domToPng } from "modern-screenshot";

const INSPECTOR_PATH = /^(.*):(\d+):(\d+)$/;
const PNG_PREFIX = /^data:image\/png;base64,/;
let selecting = false;
/** The page as it was served, from the tag that loaded this script (core's `injectOverlay`). */
const pageHash =
  (document.currentScript as HTMLScriptElement | null)?.dataset.pageHash ?? "";

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
 * The choices bridge (Projects spec §5.7). A page marks a choice in markup —
 * `data-cawco-choice="hero"` on the element (or a container), `data-option="b"`
 * on each option, `data-cawco-multiple` on the choice to allow several — or
 * calls `cawco.choose`, `cawco.note`, `cawco.set` and `cawco.on("picks", …)`.
 *
 * Those sit on MCP Apps' messages (JSON-RPC 2.0 over postMessage, spec
 * 2026-01-26), so the page talks to the pane as an MCP App view talks to its
 * host: `ui/initialize` then `ui/notifications/initialized`; each change is a
 * `ui/update-model-context` request whose `structuredContent` is one id's
 * change (CawCo keeps every id rather than overwriting); the picks are read
 * with `tools/call` → `read_choices` and arrive after every change as
 * `ui/notifications/tool-result`; `ui/message` sends the picks to the session.
 * The pane checks each message and stores it in the hub; the page hears the
 * stored picks back, so nothing here shows a pick the hub has not kept. The
 * bridge starts on first use, so a page without choices sends nothing.
 */

interface Pick {
  at: string;
  note: string | null;
  options: string[];
  pageHash: string;
  value: unknown;
}
type Picks = Record<string, Pick>;

let picks: Picks = {};
let heard = false;
const listeners = new Set<(current: Picks) => void>();

let nextId = 1;
const waiting = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>();

function request(method: string, params: object): Promise<unknown> {
  const id = nextId;
  nextId += 1;
  window.parent.postMessage(
    { jsonrpc: "2.0", id, method, params },
    location.origin
  );
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

function notify(method: string, params: object) {
  window.parent.postMessage(
    { jsonrpc: "2.0", method, params },
    location.origin
  );
}

/** The host's answers and notifications; false when the message is not the bridge's. */
function answered(data: unknown): boolean {
  const message = data as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: { structuredContent?: { choices?: Picks } };
    result?: unknown;
    error?: { message?: unknown };
  } | null;
  if (message?.jsonrpc !== "2.0") {
    return false;
  }
  if (message.method === "ui/notifications/tool-result") {
    const choices = message.params?.structuredContent?.choices;
    if (choices) {
      heardPicks(choices);
    }
    return true;
  }
  const pending =
    typeof message.id === "number" ? waiting.get(message.id) : undefined;
  if (pending) {
    waiting.delete(message.id as number);
    if (message.error) {
      pending.reject(new Error(String(message.error.message)));
    } else {
      pending.resolve(message.result);
    }
  }
  return true;
}

/** A refusal the pane already showed the person; the page stays as stored. */
const shownByPane = () => undefined;

let bridge: Promise<void> | undefined;
/** The handshake and the first read, once per page load. */
function connect(): Promise<void> {
  bridge ??= request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appCapabilities: {},
    clientInfo: { name: "cawco-preview", version: "1.0.0" },
  })
    .then(() => {
      notify("ui/notifications/initialized", {});
      return request("tools/call", { name: "read_choices", arguments: {} });
    })
    .then((result) => {
      const read = result as
        | { structuredContent?: { choices?: Picks } }
        | undefined;
      heardPicks(read?.structuredContent?.choices ?? {});
    })
    .catch((error: unknown) => {
      // The next use tries the handshake again.
      bridge = undefined;
      throw error;
    });
  return bridge;
}

async function change(entry: {
  choice: string;
  options?: string[];
  note?: string;
  value?: unknown;
}): Promise<void> {
  await connect();
  await request("ui/update-model-context", {
    structuredContent: { ...entry, pageHash },
  });
}

const choiceOf = (option: Element): Element | null =>
  option.closest("[data-cawco-choice]");

/** Marks each option in the page as picked or not, from the stored picks. */
function reflect() {
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

function heardPicks(next: Picks) {
  picks = next;
  heard = true;
  reflect();
  for (const listener of listeners) {
    listener(picks);
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
  return change({ choice, options });
}

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
    const current = picks[choice]?.options ?? [];
    if (holder.hasAttribute("data-cawco-multiple")) {
      choose(
        choice,
        current.includes(value)
          ? current.filter((picked) => picked !== value)
          : [...current, value]
      ).catch(shownByPane);
    } else {
      choose(choice, current.includes(value) ? null : value).catch(shownByPane);
    }
  },
  true
);

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
      on: (event: "picks", listener: (picks: Picks) => void) => () => void;
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

Object.defineProperty(window, "cawco", {
  value: Object.freeze({
    choose,
    note: (choice: string, text: string) => change({ choice, note: text }),
    set: (key: string, value: unknown) => change({ choice: key, value }),
    send: async (text = "") => {
      await connect();
      await request("ui/message", {
        role: "user",
        content: { type: "text", text },
      });
    },
    on: (event: "picks", listener: (current: Picks) => void) => {
      if (event !== "picks") {
        throw new Error(`cawco.on: unknown event ${event}`);
      }
      listeners.add(listener);
      if (heard) {
        listener(picks);
      } else {
        connect().catch(shownByPane);
      }
      return () => listeners.delete(listener);
    },
    pickPlace: async () => {
      await connect();
      return (await request("cawco/pick-place", {
        pageHash,
      })) as PlacePick | null;
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

async function capture(
  el: Element
): Promise<{ png: string | null; error?: string }> {
  try {
    const png = await domToPng(el, {
      scale: Math.min(2, devicePixelRatio),
      filter: (node) => node !== host,
    });
    return { png: png.replace(PNG_PREFIX, "") };
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : String(reason);
    post("cawco:error", { message: error });
    return { png: null, error };
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
    const { png, error } = await capture(el);
    post("cawco:selected-png", error ? { id, error } : { id, png });
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
    // Markup choices show their stored picks as soon as the pane is there.
    if (document.querySelector("[data-cawco-choice]")) {
      connect().catch(shownByPane);
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
