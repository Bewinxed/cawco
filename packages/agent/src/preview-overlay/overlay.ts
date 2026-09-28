/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { PreviewElement } from "@whiffle/core";
import { domToPng } from "modern-screenshot";

const INSPECTOR_PATH = /^(.*):(\d+):(\d+)$/;
const PNG_PREFIX = /^data:image\/png;base64,/;
let selecting = false;

/**
 * The `/preview/<id>/` prefix this page lives under. Derived from the current
 * path at load time — the overlay script is the first thing in <head>, so
 * location.pathname is the iframe's initial URL before any SPA navigation.
 */
const prefix = location.pathname.match(/^\/preview\/[^/]+\//)?.[0] ?? "";

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

const host = document.createElement("whiffle-overlay");
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
  post("whiffle:ready", {
    url: stripPrefix(location.href),
    title: document.title,
  });
}

function navigated() {
  post("whiffle:navigated", {
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
      "whiffle-overlay, script[src='/__whiffle/overlay.js']"
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
    post("whiffle:error", { message: error });
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

async function selectAt(clientX: number, clientY: number) {
  const el = elementAt(clientX, clientY);
  if (el) {
    const element = describe(el);
    post("whiffle:selected", { element, ...(await capture(el)) });
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
      post("whiffle:escape");
    }
  },
  true
);

window.addEventListener("message", async (event) => {
  if (event.source !== window.parent || event.origin !== location.origin) {
    return;
  }
  const message = event.data;
  if (message?.type === "whiffle:hello") {
    ready();
  } else if (message?.type === "whiffle:mode") {
    mode(message.mode === "select");
  } else if (message?.type === "whiffle:capture") {
    post("whiffle:capture", await capture(document.documentElement));
  }
});

window.addEventListener("popstate", navigated);
window.addEventListener("hashchange", navigated);
ready();
