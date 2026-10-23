/**
 * The overlay where it runs: the outermost previewed document (overlay.ts
 * decides; a same-origin frame inside stands down and is reached from here).
 */
import type { PreviewElement } from "@cawco/core";
import type { ChoiceChange } from "@cawco/core/choices";
import {
  ANCHOR_IDENTITIES,
  type ChainLink,
  COMMENT_LIMITS,
  type CommentAttachment,
  type CommentTarget,
  commentOn,
  deletePin,
  findAnchor,
  generatedId,
  type MarkPicture,
  type PageAnchor,
  type Pin,
  type PinnedElement,
  type PreviewMode,
  pinUnsent,
  previewMode,
  replyToPin,
  resolvePin,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import { shellShortcutOf } from "@cawco/core/shell-shortcuts";
import type { Map as YMap } from "yjs";
import { artifact, type Link, NO_ARTIFACT, type State } from "./artifact";
import { here, mark, markOf } from "./boot";
import { type Changes, startChanges } from "./changes";
import {
  answerEmbedder,
  EMBED_ARTIFACT,
  type Remote,
  STAND_INS,
  startEmbeds,
} from "./embeds";
import { fillFields, trackFields } from "./fields";
import {
  deepElementAt,
  frameDocument,
  frameLoading,
  frameOrigin,
  framesOf,
  frameWindows,
  isFrame,
  rectOf,
  watchFrames,
} from "./frames";
import { hold, isHeld } from "./hold";
import { heardFromHost, toHost } from "./host-origin";
import { startInk } from "./ink";
import { morphPage, watchPointers, whenPointersUp } from "./morph";
import { choiceOf, listenForPicks } from "./pick";
import { cropPicture } from "./picture";
import {
  type Box,
  type DraftTarget,
  type Pins,
  padded,
  startPins,
} from "./pins";
import { inkChrome } from "./radial";
import { drawInScheme, type Scheme } from "./schemes";

const INSPECTOR_PATH = /^(.*):(\d+):(\d+)$/;
/** A page hash: sha256, hex. */
const PAGE_HASH = /^[0-9a-f]{64}$/;
/** The page hash on the overlay's tag in a page's HTML (core `injectOverlay`). */
const SERVED_HASH =
  /<script src="\/__cawco\/overlay\.js(?:\?k=[0-9a-z]+)?" data-page-hash="([0-9a-f]{64})"/;
/** The overlay's own tag's address: its path, at the overlay's key (core `keyOverlay`) or not. */
const OVERLAY_SRC = /^\/__cawco\/overlay\.js(?:\?|$)/;
/**
 * The pane's mode (its head's Interact | Comment | Draw): Interact gives the
 * page every press; Comment takes them, and a tap pins a comment to what it
 * lands on; Draw takes them, and any pointer inks. A pen inks in every mode.
 */
let modeNow: PreviewMode = "interact";
const commenting = () => modeNow === "comment";
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
  "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:light dark!important";
const shadow = host.attachShadow({ mode: "open" });
const sheet = document.createElement("style");
sheet.textContent = `
  .layer { position:fixed; inset:0; pointer-events:none; cursor:crosshair; }
  .layer.comment { pointer-events:auto; }
  .layer.draw { pointer-events:auto; touch-action:none; }
  .rect { position:fixed; pointer-events:none; outline:var(--c-target-stroke) solid var(--brand-solid); outline-offset:0; border-radius:var(--radius-xs); background:var(--c-target-tint); }
  .rect[data-bare] { outline-offset:var(--c-target-gap); }
  .rect[data-rest] { outline-style:none; }
  .rect[data-root] { outline-style:dashed; outline-offset:calc(-1 * (var(--space-1) + var(--c-target-stroke))); background:none; }
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

/*
 * The One Target Rule (DESIGN.md): the overlay draws one target at a time.
 * At rest (Comment mode, the element under the pointer) it is a see-through
 * coral tint (`c-target-tint`; the opaque `brand-wash` would hide the element's words)
 * and the label; chosen (a pin's element: its thread open, its disc
 * rested on, stepped to with J and K) it adds a 1px `brand-solid` line on its
 * border box (`c-target-stroke`), `c-target-gap` outside a bare element, and no label; the page's root takes a 1px dashed line
 * `space-1` inside its edge, and no tint. While a composer stands, the
 * pointer's tint is off and the chosen element alone is drawn.
 */
/** The element under the pointer in Comment mode. */
let hovered: Element | null = null;
/** The pin's element pins.ts names: the open thread's, a rested-on pill's, the stepped-to pin's. */
let pinEl: Element | null = null;
/** In Comment mode, whether the pinned element leads the pointer's: until the pointer leaves a pill, or a thread closes. */
let pinLeads = false;
/** The host's thread card stands open on a pin (`cawco:track-pin`). */
let threadOpen = false;

/**
 * The comment being written: what the press chose (an element and the
 * point on it, or an ink group), the element's chain out to the page's
 * root, which of it the person chose in the composer's target chip, and the
 * press. Nothing of it is written until the host says the words
 * (`cawco:comment`). Its composer closed with words in it (Esc, a press
 * outside, a mode switch: The Work Outlives Its Surface Rule), the host parks
 * it (`cawco:compose-park`): its hollow pill stays at its target saying it
 * holds a draft, and one press on it opens the composer again; a reload
 * brings it back from the host's keeping (`cawco:compose-restore`). Only the
 * host's cancel of an empty composer, or its comment written, ends it.
 */
let drafting: {
  chain: Element[];
  chosen: number;
  /**
   * Each of the chain's elements as a pin would hold it, read at the press:
   * what the comment stands on however the page draws its element again
   * while it is written ({@link draftEl}).
   */
  named: ReturnType<typeof named>[];
  /** Its composer is closed and its words kept: the pill stays, pressable, and nothing is chosen. */
  parked?: boolean;
  /** Where on its first target it stands, as fractions of its box: a draft brought back after a reload keeps its place however the page lays out. */
  point?: { x: number; y: number };
  /** An ink group's Comment: the elements it marks, and its anchor. */
  ink?: {
    anchor: PageAnchor;
    elements: PinnedElement[] | string[];
    id: string;
  };
  x: number;
  y: number;
} | null = null;
/** A composer or a thread stands: the chosen element alone is drawn. */
const composing = () =>
  threadOpen || (drafting !== null && drafting.parked !== true);

/**
 * Frames of another origin whose overlay answers (a decision page's
 * Preview): their elements stand in this page as stand-ins (embeds.ts), and
 * every read of an element below takes a stand-in's from what its embed
 * answered.
 */
const embeds = startEmbeds({
  changed: () => framesChanged(),
  inUse: (el) =>
    el === hovered || el === pinEl || !!drafting?.chain.includes(el),
  selectorOf: (el) => selectorOf(el),
});

/**
 * Pin `el`'s element chosen, or none; `lead` says whether it leads the
 * pointer's in Comment mode (a disc rested on, a pin stepped to), and left
 * out keeps the lead as it was (the same pin drawn again where it stands).
 */
function outline(el: Element | null, lead?: boolean) {
  pinEl = el;
  if (lead !== undefined) {
    pinLeads = lead;
  }
  paint();
}

/** A computed colour with no alpha: the element paints nothing with it. */
const CLEAR = /^(?:transparent|rgba\(.*,\s*0\)|.*\/\s*0\))$/;

/**
 * Whether `el` draws a box of its own (a computed border, a background
 * colour or image): the chosen line sits on its border box. A bare element
 * (a text container, a label-and-field group) takes the line `c-target-gap`
 * outside, so it never touches the glyphs; the outline's corners grow with
 * the offset.
 */
function drawsBox(el: Element): boolean {
  const standIn = embeds.read(el);
  if (standIn) {
    return standIn.remote.boxed;
  }
  const own = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  return (
    !CLEAR.test(own.backgroundColor) ||
    own.backgroundImage !== "none" ||
    sides.some(
      (side) =>
        (Number.parseFloat(own[`border${side}Width`]) || 0) > 0 &&
        !["none", "hidden"].includes(own[`border${side}Style`])
    )
  );
}

/** The one target drawn: the chosen pin's element, else the element under the pointer in Comment mode; and its label in Comment mode. */
function paint() {
  // The draft's element as the page holds it now: drawn again, the one there takes its outline.
  const drafted = drafting && !drafting.parked ? draftEl() : null;
  const pinned =
    pinEl?.isConnected && (!commenting() || composing() || pinLeads)
      ? pinEl
      : null;
  const chosen = drafted?.isConnected ? drafted : pinned;
  const target = chosen ?? (commenting() && !composing() ? hovered : null);
  highlight.hidden = !target;
  const doc = target?.ownerDocument;
  const root =
    !!target && (target === doc?.body || target === doc?.documentElement);
  // The label names what rests under the pointer; a chosen target carries none.
  label.hidden = !(target && commenting() && !chosen);
  if (!target) {
    return;
  }
  const rect = outlineOver(target);
  highlight.toggleAttribute("data-root", root);
  highlight.toggleAttribute("data-bare", !(root || drawsBox(target)));
  highlight.toggleAttribute("data-rest", !(root || chosen));
  if (label.hidden) {
    return;
  }
  label.textContent = labelOf(target);
  label.style.left = `${Math.max(0, Math.min(rect.x, innerWidth - label.offsetWidth))}px`;
  label.style.top = `${Math.max(0, rect.y - label.offsetHeight)}px`;
}

const CORNERS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const;

/**
 * Lays the highlight over `el`, in the top viewport's px, its corners
 * concentric with `el`'s: each corner takes `el`'s own computed radius
 * (scaled as a frame or a transform draws it), `--radius-xs` its floor, so a
 * square block is never a hard square; the line, at offset 0 on the border
 * box, follows those corners exactly. The page as a whole (its root or body)
 * keeps the sheet's own corners. Returns the box.
 */
function outlineOver(el: Element): DOMRect {
  const rect = rectOf(el);
  Object.assign(highlight.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  const doc = el.ownerDocument;
  if (el === doc.body || el === doc.documentElement) {
    for (const corner of CORNERS) {
      highlight.style[corner] = "";
    }
    return rect;
  }
  const corners = embeds.read(el)?.remote.corners ?? cornersOf(el, rect);
  for (const [i, corner] of CORNERS.entries()) {
    highlight.style[corner] = corners[i] ?? "";
  }
  return rect;
}

/**
 * `el`'s four corners as the outline takes them, `rect` its box on screen:
 * each its own computed radius scaled as it is drawn, `--radius-xs` its
 * floor. An embed's overlay reads them for its parent (embeds.ts).
 */
function cornersOf(el: Element, rect: DOMRect): string[] {
  const own = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  const laidWidth = el instanceof HTMLElement ? el.offsetWidth : 0;
  const scale = laidWidth > 0 ? rect.width / laidWidth : 1;
  // A computed corner is one or two lengths (px) or percentages; a percentage is of the box, which the highlight shares.
  return CORNERS.map((corner) =>
    own[corner]
      .split(" ")
      .map((part) => {
        const px = part.endsWith("px") ? Number.parseFloat(part) : Number.NaN;
        const value = Number.isNaN(px) ? part : `${px * scale}px`;
        return `max(var(--radius-xs), ${value})`;
      })
      .join(" ")
  );
}

/** The person's pins, drawn after the ink (pins.ts). */
const pins: Pins = startPins({
  anchorOf,
  chrome,
  compose: (target, elements) => composeInk(target, elements),
  describe,
  groupBox: (id) => ink.groupBox(id),
  locate,
  outline,
  post,
  redraft: () => (draftEl() ? draftTarget() : null),
  reopenDraft: () => reopenDraft(),
  waiting,
});

/** What the latest revision changed that the person hasn't looked at, washed under the pins (changes.ts). */
const changes: Changes = startChanges({
  chrome,
  interacting: () => modeNow === "interact",
  locate,
  outline: (el) => outline(el),
  post,
});

/**
 * Whether a press that is not a pen's inks: in Draw mode, the main button or
 * a first finger on the overlay's own layer. One on the ink's icon or menu is
 * theirs, and one on a pin's disc opens that pin (the blockers below).
 */
function freehand(event: PointerEvent): boolean {
  return (
    modeNow === "draw" &&
    event.isPrimary &&
    event.button === 0 &&
    event.composedPath()[0] === layer &&
    !pinUnder(event.clientX, event.clientY)
  );
}

/** The pin whose disc stands at the viewport's `x`, `y`, under the overlay's layer; null when none does. */
function pinUnder(x: number, y: number): string | null {
  return (
    elementAt(x, y)?.closest("[data-pin-id]")?.getAttribute("data-pin-id") ??
    null
  );
}

/** The ink drawn on the page, a pen's in any mode and any pointer's in Draw, and the icon and menu at a stroke's end (ink.ts, radial.ts). */
const ink = startInk({
  anchorOf,
  chrome,
  describe,
  elementsAt,
  // Drawn once its group is on the page: the next frame, after the ink layer drew it.
  ended: (id) => requestAnimationFrame(() => groupPicture(id)),
  pageSized,
  freehand,
  locate,
  pins: () => pins,
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
    embeds.fit();
    ink.replace();
    if (!highlight.hidden) {
      paint();
    }
  });
}
watchFrames(framesChanged);
// A sheet's stage swapped a component in place (its sheet module says so on
// each Vite HMR update), or a decision page's host drew a revision of its
// program (decision-host, naming the program's hash): every pin's anchor is
// read again, its source and chain with it, and every option marked again
// from the stored picks, which a re-render does not carry over.
addEventListener("cawco:hmr", (event) => {
  const hash = (event as CustomEvent<{ pageHash?: unknown } | null>).detail
    ?.pageHash;
  if (typeof hash === "string" && PAGE_HASH.test(hash)) {
    pageHash = hash;
  }
  reflect();
  told();
  pins.draw();
  ink.replace();
  pins.keepClear();
  changes.draw();
});
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

/** The doc's link to the hub, to the host (`cawco:sync`): connecting, synced or lost, why it was lost, and whether to silence (said at once). */
function tellLink(link: Link) {
  post("cawco:sync", {
    state: link.state,
    ...(link.error ? { error: link.error } : {}),
    ...(link.silent ? { silent: true } : {}),
  });
  tellPagePins();
}

/** How long a burst of doc changes (typing a note) is gathered into one word to the host. Our call. */
const DOC_TOLD_MS = 100;
let docTelling: ReturnType<typeof setTimeout> | null = null;

/**
 * The doc changed — a pick, a note, a pin, the agent's patch, a Send's
 * stamp — so a host that counts from the hub's reads (the app's pins and Send)
 * reads again at once (`cawco:doc`): one word per burst.
 */
function tellDoc() {
  if (docTelling) {
    return;
  }
  docTelling = setTimeout(() => {
    docTelling = null;
    post("cawco:doc");
    tellPagePins();
  }, DOC_TOLD_MS);
}

/**
 * While the page's link to the hub isn't synced, the pins this page holds
 * (`cawco:page-pins`): one written meanwhile, or given back by the device
 * after a reload, may stand only here; and always the comments the hub
 * refused, each with its reason (artifact.ts `refused`). The host lists
 * each with why it isn't sent and its Try again, so the person's words are
 * never out of reach.
 */
function tellPagePins() {
  const refused = artifact.refused();
  const linked = artifact.link().state === "synced";
  if (!artifact.keeps() || (linked && refused.length === 0)) {
    return;
  }
  post("cawco:page-pins", {
    pins: [
      ...(linked ? [] : Object.values(artifact.doc().getMap("pins").toJSON())),
      // The hub refused these: each carries its reason (`notSent`).
      ...refused,
    ],
  });
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

/**
 * Marks each option in the page as picked or not, from the stored picks. A
 * plain button option (an HTML page's toggle) says it with `aria-pressed`;
 * one with a role of its own (a decision program's radio or checkbox, whose
 * option group says `aria-checked`) keeps its role's state alone.
 */
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
    if (option.localName === "button" && !option.hasAttribute("role")) {
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
  marked: () => picturesLater(),
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
let hostTheme: Scheme | null = null;

/**
 * A page artifact (HTML the agent wrote) draws in the host's theme, never the
 * OS's (DESIGN.md: the theme follows ours), on its root's `color-scheme` and
 * `data-theme`; a preview is someone's own app and keeps its own. A sheet's
 * app page lost its own theme script with its inline scripts (the stage drops
 * them), so it takes the host's too, and the `dark` class an app's tokens
 * and Tailwind's dark variant key on.
 */
function themed() {
  if (hostTheme && themesWithHost()) {
    themeRoot(document.documentElement, hostTheme);
  }
}

/** This page draws in the host's theme: a page artifact or a sheet, never a preview. */
function themesWithHost(): boolean {
  const kind = artifact.kind();
  return kind === "page" || kind === "component";
}

/** `root` (this page's, or its copy's in schemes.ts) set to draw in `scheme`. */
function themeRoot(root: HTMLElement, scheme: Scheme) {
  root.style.colorScheme = scheme;
  root.dataset.theme = scheme;
  if (artifact.kind() === "component") {
    root.classList.toggle("dark", scheme === "dark");
  }
}

/**
 * The host's theme said: the page drawn in it where it takes the host's
 * ({@link themed}), and the overlay's own marks in it always, never the OS's.
 * Until a host says one the overlay follows the OS (`light dark` on its host).
 */
function takeTheme(said: unknown) {
  if (said === "light" || said === "dark") {
    hostTheme = said;
    host.style.setProperty("color-scheme", said, "important");
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
  const inset = said as
    { bottom?: unknown; side?: unknown; top?: unknown } | undefined;
  if (!inset) {
    return;
  }
  const px = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `${value}px`
      : null;
  // `bottom`: what a host's docked composer covers of the page's foot (the
  // Decisions tab's); a decision page stands its sticky foot clear of it
  // (decisions/host Decisions.svelte), an HTML page pads for it (page.css `.dp`).
  const bottom = px(inset.bottom);
  if (bottom !== null) {
    document.documentElement.style.setProperty("--page-inset-bottom", bottom);
  }
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
 * the page's, and stay as they are; so is what the app's web view put in
 * the page before it loaded (`data-cawco-host`: its viewport, as the web's
 * iframe lays a page out).
 */
const kept = (node: Node): boolean =>
  node === host ||
  node === ink.layer ||
  node === pins.layer ||
  node === pins.fixed ||
  node === changes.layer ||
  (node instanceof Element && node.hasAttribute("data-cawco-host")) ||
  (node instanceof HTMLScriptElement &&
    OVERLAY_SRC.test(node.getAttribute("src") ?? ""));

/**
 * Where the page was served: the root of its own address in the panel, its
 * own path (`/__cawco/page/<id>/`) in the Decisions tab. Read at load, so a
 * page's own history moves never move it.
 */
const servedAt = location.pathname;
const pageUrl = () => new URL(servedAt, location.origin);

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
  // The open card's pin, moved under the host's chrome, is brought out again.
  pins.keepClear();
  // Each wash stands on its element as the revision has it.
  changes.draw();
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
  // A page that draws itself (a decision page's host, from its program)
  // takes the revision: it draws the new program and says so with
  // `cawco:hmr`, so its DOM is never swapped under it.
  if (
    !dispatchEvent(
      new CustomEvent("cawco:revision", {
        cancelable: true,
        detail: { pageHash: wanted },
      })
    )
  ) {
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

listenForPicks(window, {
  choose,
  interacting: () => modeNow === "interact",
  picked: (choice) => artifact.state()[choice]?.options ?? [],
  refused: toldHost,
});

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

/**
 * The host's answer to an ask; false when the message is not one. An answer
 * is a JSON-RPC response: a `result` or an `error`, and no `method`. The ask
 * itself has a `method` and neither, so a host in this same window (the
 * app's host script, the page in its own tab) never has the overlay take its
 * own ask for the answer.
 */
function answered(data: unknown): boolean {
  const message = data as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
  } | null;
  if (
    message?.jsonrpc !== "2.0" ||
    typeof message.id !== "number" ||
    "method" in message ||
    !("result" in message || "error" in message)
  ) {
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

/**
 * A machine and a folder on it, as `cawco.pickPlace` answers: the machine's
 * id, its label (the name the dashboard shows it by, core `machineLabel`)
 * and the folder's full path.
 */
interface PlacePick {
  label: string;
  machineId: string;
  path: string;
}

const placeOf = (value: unknown): PlacePick | null => {
  const raw = value as Partial<Record<keyof PlacePick, unknown>> | null;
  return typeof raw?.machineId === "string" &&
    typeof raw.label === "string" &&
    typeof raw.path === "string"
    ? { label: raw.label, machineId: raw.machineId, path: raw.path }
    : null;
};

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
      const place = placeOf(await askHost("cawco/pick-place", { pageHash }));
      if (!place) {
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

/** The pane's mode; `again` names the moved pin the next tap in Comment places again. */
function mode(next: PreviewMode, again: string | null = null) {
  // A mode switch closes a comment's composer; the host parks its words, or cancels an empty one.
  modeNow = next;
  placing = next === "comment" ? again : null;
  layer.classList.toggle("comment", next === "comment");
  layer.classList.toggle("draw", next === "draw");
  hovered = null;
  pinLeads = false;
  paint();
  post("cawco:peek", { id: null });
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

/** One entry of Svelte's dev stack (`__svelte_meta.parent`): a block or a component's call site, its column 0-based. */
interface DevStackEntry {
  column: number;
  componentTag?: string;
  file: string;
  line: number;
  parent?: DevStackEntry | null;
  type: string;
}

type DevElement = Element & {
  __svelte_meta?: {
    loc?: { file: string; line: number; column: number };
    parent?: DevStackEntry | null;
  };
  __vueParentComponent?: { type?: { __file?: string } };
};

/**
 * Whether a dev source's file is one on disk: a plugin's virtual module (an
 * `unplugin-icons` icon's `~icons/…`, a `virtual:` or `\0` id, a `/@…` path)
 * is not, and gives way to the place it is used.
 */
const onDisk = (file: string): boolean =>
  !(
    file.startsWith("~") ||
    file.startsWith("virtual:") ||
    file.startsWith("\0") ||
    file.startsWith("/@") ||
    file.includes("?")
  );

/** The component call sites a Svelte element stands in, innermost first (its dev stack's `component` entries). */
const svelteCalls = (el: DevElement): DevStackEntry[] => {
  const calls: DevStackEntry[] = [];
  for (let at = el.__svelte_meta?.parent; at; at = at.parent) {
    if (at.type === "component") {
      calls.push(at);
    }
  }
  return calls;
};

/** A stamped component root's call site (`data-insp-path="<file>:<line>:<column>:<Tag>"`), its tag capitalised. */
const STAMPED_CALL = /^(.*):(\d+):(\d+):([A-Z][\w.$]*)$/;
/** A frame's story place (`data-cawco-source="<file>:<line>:<column>"`). */
const STORY_PLACE = /^(.*):(\d+):(\d+)$/;

/**
 * On a sheet (live components): the components `el` stands in, each where
 * it is used, innermost first, then the story whose frame holds it; and the
 * sheet's story file with that story. Svelte's own dev stack names the
 * components; elsewhere, a stamped component root names its call site. Null
 * outside a sheet's frame.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the chain from either framework's marks, then the frame's story and state, in one walk
function sheetChain(el: Element): Pick<PageAnchor, "chain" | "sheet"> | null {
  const frame = el.closest<HTMLElement>("[data-cawco-story]");
  const story = frame?.dataset.cawcoStory;
  const place = frame?.dataset.cawcoSource?.match(STORY_PLACE);
  if (!(frame && story && place)) {
    return null;
  }
  // The nearest element Svelte's dev compile marked (a tapped icon's <path> may carry none of its own).
  let marked: DevElement | null = el as DevElement;
  while (marked && marked !== frame && !marked.__svelte_meta) {
    marked = marked.parentElement as DevElement | null;
  }
  const meta = marked && marked !== frame ? marked : null;
  const chain: ChainLink[] = (meta ? svelteCalls(meta) : []).map((call) => ({
    component: call.componentTag ?? "component",
    file: call.file,
    line: call.line,
    column: call.column + 1,
  }));
  if (!meta) {
    for (
      let at: Element | null = el;
      at && at !== frame;
      at = at.parentElement
    ) {
      const call = at.getAttribute("data-insp-path")?.match(STAMPED_CALL);
      if (call) {
        chain.push({
          component: call[4],
          file: call[1],
          line: Number(call[2]),
          column: Number(call[3]),
        });
      }
    }
  }
  chain.push({
    component: story,
    file: place[1],
    line: Number(place[2]),
    column: Number(place[3]),
  });
  const file = frame.dataset.cawcoFile ?? place[1];
  const interaction = frame.dataset.cawcoInteraction;
  const scheme = frame.dataset.cawcoScheme;
  const width = Number(frame.dataset.cawcoWidth);
  return {
    chain,
    sheet: {
      file,
      story,
      ...(interaction && scheme
        ? {
            state: {
              interaction: FRAME_INTERACTIONS.includes(interaction)
                ? (interaction as "rest")
                : "rest",
              scheme: scheme === "light" || scheme === "dark" ? scheme : "page",
              // A frame at its story's own form is as wide as its body laid out (unscaled by the canvas's zoom).
              width: Number.isFinite(width)
                ? width
                : (frame.querySelector<HTMLElement>(".cawco-frame-body")
                    ?.offsetWidth ??
                    0) ||
                  null,
            },
          }
        : {}),
    },
  };
}
const FRAME_INTERACTIONS = ["rest", "hover", "focus", "pressed"];
/** The widest frame a pane may ask a canvas for, px. Ours: past a desk's. */
const CANVAS_WIDTH_MAX = 3840;

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
  if (loc && onDisk(loc.file)) {
    // Svelte's line is 1-based, its column 0-based.
    return { ...loc, column: loc.column + 1, framework: "svelte", of };
  }
  if (loc) {
    // A virtual component's own element (an icon's svg): its call site in a real file.
    const call = svelteCalls(el).find((one) => onDisk(one.file));
    return call
      ? {
          file: call.file,
          line: call.line,
          column: call.column + 1,
          framework: "svelte",
          of: `ancestor:${call.componentTag ?? "component"}`,
        }
      : null;
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

/** Whether `selector` names exactly one element of `doc`. */
const namesOne = (doc: Document, selector: string): boolean => {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

/**
 * What names `el` alone in its document by what it is (core
 * `ANCHOR_IDENTITIES`): its id, its test id, its choice, or its option
 * within the choice that holds it. Null when none does.
 */
function identityOf(el: Element): string | null {
  const doc = el.ownerDocument;
  // A framework's minted id (React's `useId`, Radix's) names whatever its next render hands it to: no identity.
  if (el.id && !generatedId(el.id) && namesOne(doc, `#${CSS.escape(el.id)}`)) {
    return `#${CSS.escape(el.id)}`;
  }
  for (const name of ANCHOR_IDENTITIES) {
    const value = el.getAttribute(name);
    if (!value) {
      continue;
    }
    const own = `[${name}="${CSS.escape(value)}"]`;
    if (namesOne(doc, own)) {
      return own;
    }
    // An option's value repeats from one choice to the next: named within its own.
    const holder = el.parentElement?.closest("[data-cawco-choice]");
    const choice = name === "data-option" && holder && identityOf(holder);
    if (choice && namesOne(doc, `${choice} ${own}`)) {
      return `${choice} ${own}`;
    }
  }
  return null;
}

/**
 * `element`'s selector in its own document (a frame's, for an element
 * inside one): from the nearest of it and its ancestors named by identity
 * ({@link identityOf}), else from the page's root, its body, down by places.
 */
function selectorOf(element: Element): string {
  const doc = element.ownerDocument;
  const path: string[] = [];
  for (let el: Element | null = element; el; el = el.parentElement) {
    const identity = identityOf(el);
    if (identity) {
      path.unshift(identity);
      break;
    }
    if (el === doc.body || el === doc.documentElement) {
      path.unshift(el.localName);
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

/** The overlay's own: its host, and the ink and pin layers it puts in the page. */
const OVERLAY_OWN = `cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins], svg[data-cawco-pins-fixed], [${STAND_INS}]`;

/**
 * The page's own deepest element at each of the viewport's points, seen
 * through the overlay's host and its ink and pin layers (a pin's disc on a
 * card is not what a stroke over the card marks): the first of the
 * browser's hits there (`elementsFromPoint`) that is the page's, into every
 * same-origin frame it lands on.
 */
function elementsAt(points: [x: number, y: number][]): (Element | null)[] {
  return points.map(([x, y]) => {
    const element =
      document
        .elementsFromPoint(x, y)
        .find((hit) => hit !== host && !hit.closest(OVERLAY_OWN)) ?? null;
    return deepElementAt(element, x, y);
  });
}

/** How much of the page's extent a container covers, each way, to be the page's own box. Our call. */
const PAGE_SHARE = 0.9;

/**
 * Whether `el` is the page's own box rather than content on it: its
 * document's root or body, or a container nearly as wide and as tall as the
 * body (a `main` holding every card). The body's box, not the document's
 * scroll: the overlay's own layers stand in that.
 */
function pageSized(el: Element): boolean {
  const doc = el.ownerDocument;
  if (el === doc.documentElement || el === doc.body || !doc.body) {
    return true;
  }
  const page = doc.body.getBoundingClientRect();
  const { width, height } = el.getBoundingClientRect();
  return (
    width >=
      PAGE_SHARE * Math.min(page.width, doc.documentElement.clientWidth) &&
    height >= PAGE_SHARE * page.height
  );
}

/**
 * Whether a kept anchor's box, `w` wide and `h` tall, is nearly as wide and
 * as tall as `doc`'s body now ({@link PAGE_SHARE}): it was the page's own
 * box. Never on a body with no extent, which every box would cover.
 */
function pageSizedBox(doc: Document, box: { h: number; w: number }): boolean {
  if (!doc.body) {
    return false;
  }
  const page = doc.body.getBoundingClientRect();
  return (
    page.width > 0 &&
    page.height > 0 &&
    box.w >=
      PAGE_SHARE * Math.min(page.width, doc.documentElement.clientWidth) &&
    box.h >= PAGE_SHARE * page.height
  );
}

/** How far round a press it looks for content when the press itself lands on the page's own box, px. Our call. */
const NEAR_RINGS = [6, 12, 20, 32] as const;
const NEAR_WAYS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

/**
 * What a press at the viewport's `x`, `y` names: the smallest element under
 * it; when that is the page's own box (a press in the gap between two
 * paragraphs, or in the page's padding), the nearest content round it within
 * {@link NEAR_RINGS}. With nothing else there, the page as a whole: its
 * document's body (core `wholePage`), never a page-sized container, which
 * holds every word the page says and names none of them.
 */
function contentAt(x: number, y: number): Element | null {
  const [hit = null] = elementsAt([[x, y]]);
  // A frame of another origin is content however big it stands: what is in
  // it is its embed's to name (embeds.ts), never this page's as a whole.
  if (!(hit && pageSized(hit)) || (isFrame(hit) && !frameDocument(hit))) {
    return hit;
  }
  const round = NEAR_RINGS.flatMap((r) =>
    NEAR_WAYS.map(([dx, dy]): [number, number] => [x + dx * r, y + dy * r])
  );
  return (
    elementsAt(round).find((near) => !!near && !pageSized(near)) ??
    hit.ownerDocument.body ??
    hit
  );
}

/** The selectors of the frames `el` stands in, outermost first, each in its parent's document. */
const frameSelectors = (el: Element): string[] => framesOf(el).map(selectorOf);

/** An element's own dev source, none of its ancestors': what a pin's file:line finds it by. */
function ownSource(el: Element): Source | null {
  return sourceAt(el as DevElement, "self");
}

/** Elements whose text is never what an element shows. */
const UNSHOWN = new Set(["script", "style", "template", "noscript"]);

/**
 * What an element with no words of its own reads as, in this order: the
 * name it is given (`aria-label`, an image's `alt`, `title`, a field's
 * `placeholder` and `name`), else where it leads or what it shows (`href`,
 * `src`). A picture repeated card by card is told apart by these alone.
 */
const NAMED_BY = [
  "aria-label",
  "alt",
  "title",
  "placeholder",
  "name",
  "href",
  "src",
] as const;

/**
 * The element's text as a pin keeps it: its words in order, white space
 * run together, cut to the anchor's bound; with none, its name
 * ({@link NAMED_BY}). Read from its text nodes until the bound is reached,
 * so a page-sized element costs what a paragraph does.
 */
function textOf(el: Element): string {
  const words = wordsOf(el);
  if (words) {
    return words;
  }
  for (const attribute of NAMED_BY) {
    const name = el.getAttribute(attribute)?.replace(/\s+/g, " ").trim();
    if (name) {
      return name.slice(0, COMMENT_LIMITS.anchorText);
    }
  }
  return "";
}

/** The element's words, as {@link textOf} reads them. */
function wordsOf(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = "";
  let parent: Node | null = null;
  for (
    let node = walker.nextNode();
    node && text.length <= COMMENT_LIMITS.anchorText;
    node = walker.nextNode()
  ) {
    if (UNSHOWN.has(node.parentElement?.localName ?? "")) {
      continue;
    }
    // Words of another element than the last are words apart.
    text += `${parent && node.parentNode !== parent ? " " : ""}${node.textContent ?? ""}`;
    parent = node.parentNode;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, COMMENT_LIMITS.anchorText);
}

/**
 * What a page's mark stands on, read from `el` as it is now: inside a frame,
 * the frames it stands in too. A mark on the page as a whole (its root or
 * body) is named by that alone and keeps none of its words, which change
 * from one state of the page to the next and say nothing of where it stands.
 */
function anchorOf(el: Element): PageAnchor {
  const remote = embeds.anchorOf(el);
  if (remote) {
    return remote;
  }
  const { x, y, width, height } = rectOf(el);
  const frames = frameSelectors(el);
  const doc = el.ownerDocument;
  const whole = el === doc.body || el === doc.documentElement;
  // The artifact the nearest frame showing one shows: the one it stands in, or the frame itself.
  const shown = [...framesOf(el), ...(isFrame(el) ? [el] : [])]
    .findLast((frame) => frame.hasAttribute(EMBED_ARTIFACT))
    ?.getAttribute(EMBED_ARTIFACT);
  return {
    ...(frames.length > 0 ? { frames } : {}),
    ...(shown ? { embed: { artifact: shown } } : {}),
    selector: whole ? el.localName : selectorOf(el),
    source: sourceOf(el),
    ...(sheetChain(el) ?? {}),
    ...(whole ? {} : { text: textOf(el) }),
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
    (el) => !el.closest(OVERLAY_OWN)
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
  const remote = embeds.find(anchor);
  if (remote) {
    return remote.state === "waiting";
  }
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

/**
 * Where a page's anchor stands now (core `findAnchor`: down its frames, then
 * file:line, then selector, then text); one that leads into a frame of
 * another origin, where its embed found it (embeds.ts).
 */
function locate(anchor: PageAnchor) {
  const remote = embeds.find(anchor);
  if (remote) {
    return remote.state === "found" ? { by: remote.by, el: remote.el } : null;
  }
  return findAnchor<Element, Document>(anchor, {
    top: document,
    frame: frameIn,
    page: (within) => within.body,
    pageSized: pageSizedBox,
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
  const remote = embeds.describe(el);
  if (remote) {
    return remote;
  }
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

/**
 * The pixels of the page's thumbnail (the pane's `cawco:capture`, drawn in
 * its tool row at 90 by 64): a few times that at a phone's density. Our call.
 */
const THUMB_AREA = 200_000;

/**
 * How long a thumbnail waits for a page that has drawn nothing but its
 * ground to draw something: an app behind a port is still starting when the
 * overlay, in its head, says ready. Our call, inside the 15 s Files gives an
 * unseen page (files/page-thumbs.ts `PAGE_MS`).
 */
const THUMB_WAIT_MS = 10_000;
/** After the page changes, how long it settles before it is drawn again: the pane's own wait (PreviewPane `CAPTURE_AFTER_MS`). */
const THUMB_SETTLE_MS = 1000;

/** Resolves true at the page's next change outside the overlay, false once `ms` pass with none. */
function pageChanges(ms: number): Promise<boolean> {
  return new Promise((done) => {
    const ours = document.querySelector("cawco-overlay");
    const seen = new MutationObserver((records) => {
      if (records.some((record) => !ours?.contains(record.target))) {
        finish(true);
      }
    });
    const bound = setTimeout(() => finish(false), ms);
    function finish(changed: boolean) {
      clearTimeout(bound);
      seen.disconnect();
      done(changed);
    }
    seen.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

/**
 * The viewport's picture once the page has drawn something of its own: a
 * crop of its bare ground is none (picture.ts), so it is drawn again each
 * time the page changes and settles, until {@link THUMB_WAIT_MS} pass. Null
 * when it never drew, or when a part's failure was heard (`failedYet`).
 */
async function pageDrawn(
  heard: (message: string) => void,
  failedYet: () => boolean
): Promise<string | null> {
  const until = performance.now() + THUMB_WAIT_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one picture at a time, each after the page's last change
    const png = await cropPicture(
      { x: scrollX, y: scrollY, w: innerWidth, h: innerHeight },
      heard,
      { area: THUMB_AREA, thumbnail: true }
    );
    const left = until - performance.now();
    if (png || failedYet() || left <= 0 || !(await pageChanges(left))) {
      return png;
    }
    await new Promise((settle) => setTimeout(settle, THUMB_SETTLE_MS));
  }
}

/**
 * The page's thumbnail: what stands in its viewport now, drawn by the crop
 * (picture.ts), so its work is what is on screen, never the whole document
 * (a whole tall page drawn once was 1.8 s of the dashboard's own thread,
 * the frame sharing its process).
 *
 * `png` is drawn in `scheme`, the one the page shows. A page that draws in
 * the host's theme is drawn in the other scheme too, from an unpainted copy
 * (schemes.ts), as `other`; `single` says the page looks the same in both (a
 * page with no dark styles, or a preview, which keeps its own scheme), and
 * its one picture stands for both.
 */
async function thumbnail(): Promise<{
  error?: string;
  other: string | null;
  png: string | null;
  scheme: Scheme;
  single: boolean;
}> {
  // A part left undrawn is said only when no picture came at all.
  let error: string | undefined;
  const heard = (message: string) => {
    error ??= message;
  };
  const png = await pageDrawn(heard, () => error !== undefined);
  const shown = themesWithHost() ? hostTheme : null;
  if (!(png && shown)) {
    return {
      png,
      scheme:
        shown ??
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
      other: null,
      single: !!png,
      // A page that drew nothing but its ground is said by no picture alone.
      ...(png || error === undefined ? {} : { error }),
    };
  }
  // The other scheme undrawn leaves that scheme without a thumbnail, never this one's picture in its place.
  const drawn = await drawInScheme(shown === "dark" ? "light" : "dark", {
    area: THUMB_AREA,
    into: shadow,
    theme: themeRoot,
    failed: heard,
  });
  return {
    png,
    scheme: shown,
    other: drawn.same ? null : drawn.png,
    single: drawn.same,
  };
}

/** The page's root's tag in Comment mode: the word the design and the commenting page use. */
const WHOLE_PAGE = "Whole page";

/** The most of an element's words its hover label quotes, characters. Our call: a button's or a heading's whole, a paragraph's start. */
const LABEL_WORDS = 40;

/** Whether `el` draws words of its own: a text node of its own that says something, not only its children's. */
const drawsWords = (el: Element): boolean =>
  [...el.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()
  );

/**
 * What the hover label says of `el` (the page's root: {@link WHOLE_PAGE}):
 * a canvas's story frame by its story ("Story On"); else its tag, id, first
 * class, its own words when it draws some (two buttons one line writes read
 * apart), and dev source; a frame of another origin, which cannot be read
 * into, by its origin.
 */
function labelOf(el: Element): string {
  const standIn = embeds.read(el);
  if (standIn) {
    return standIn.remote.label;
  }
  const doc = el.ownerDocument;
  if (el === doc.body || el === doc.documentElement) {
    return WHOLE_PAGE;
  }
  const story = el.getAttribute("data-cawco-story");
  if (story) {
    return `Story ${story}`;
  }
  const named = `${el.localName}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${el.classList[0]}` : ""}`;
  if (isFrame(el) && !frameDocument(el)) {
    return `${named} — ${frameOrigin(el)}`;
  }
  const words = drawsWords(el) ? wordsOf(el) : "";
  const quoted = words
    ? ` "${words.length > LABEL_WORDS ? `${words.slice(0, LABEL_WORDS - 1).trimEnd()}…` : words}"`
    : "";
  const source = sourceOf(el);
  return `${named}${quoted}${source?.file ? ` — ${source.file}:${source.line ?? "?"}` : ""}`;
}

/** The element under the pointer in Comment mode, drawn at rest unless a chosen one stands ({@link paint}); none clears it. */
function hover(el: Element | null) {
  hovered = el?.isConnected ? el : null;
  paint();
}

/** The pointer's latest place asked of: an embed's answer for an earlier one is let go. */
let pointing = 0;

/**
 * What the pointer at the viewport's `x`, `y` names, then `then` with it:
 * `el`, what this page has there (`contentAt`), at once; over a frame whose
 * embed answers (embeds.ts), its element there as the embed names it, once
 * it has.
 */
function pointed(
  el: Element | null,
  x: number,
  y: number,
  then: (named: Element | null) => void
) {
  pointing += 1;
  const mine = pointing;
  if (!embeds.bridged(el)) {
    then(el);
    return;
  }
  embeds.at(el, x, y).then((inside) => {
    if (inside && mine === pointing) {
      then(inside);
    }
  });
}

window.addEventListener(
  "mousemove",
  (event) => {
    if (!commenting()) {
      return;
    }
    const el = contentAt(event.clientX, event.clientY);
    // Over an embed, nothing of this page's stands while its answer comes:
    // the target its last answer named stays, or none.
    if (
      embeds.bridged(el) &&
      !(hovered && embeds.read(hovered)?.frame === el)
    ) {
      hover(null);
    }
    pointed(el, event.clientX, event.clientY, (found) => {
      if (commenting()) {
        hover(found);
      }
    });
  },
  true
);

let touchCaptured = false;

/** A tap in Comment mode: a comment's composer opened where it landed, or the moved pin being placed again. */
function commentAt(clientX: number, clientY: number) {
  // A tap on a pin's own pill opens that pin, as it does out of Comment mode.
  const pill = pinUnder(clientX, clientY);
  if (pill) {
    pins.open(pill);
    return;
  }
  pointed(contentAt(clientX, clientY), clientX, clientY, (el) => {
    if (commenting()) {
      pressedOn(el, clientX, clientY);
    }
  });
}

/** A Comment-mode tap named `el`: its composer opened there, or the moved pin placed again on it. */
function pressedOn(el: Element | null, clientX: number, clientY: number) {
  if (!(el && artifact.keeps())) {
    return;
  }
  if (placing) {
    const id = placing;
    pins.placeAgain(id, el, clientX, clientY);
    placing = null;
    // Drawn once its pill stands: the next frame.
    requestAnimationFrame(() => pinPicture(id));
    return;
  }
  startDraft(el, clientX, clientY);
}

/** The most of an element's ancestors its composer's target chip offers, before the whole page. Our call. */
const CHAIN_MOST = 5;

/**
 * What a press on `el` may stand on, innermost first: `el`, its ancestors
 * that draw a box of their own (a wrapper exactly as big as what it holds
 * says nothing new), at most {@link CHAIN_MOST}, then the page as a whole.
 * In an embed of another origin, what holds `el` there as its embed read it
 * (embeds.ts), then its frame and what holds that here.
 */
function chainOf(el: Element): Element[] {
  const standIn = embeds.read(el);
  if (standIn) {
    const outer = chainOf(standIn.frame);
    return [
      ...[el, ...standIn.chain, ...outer.slice(0, -1)].slice(0, CHAIN_MOST + 1),
      ...outer.slice(-1),
    ];
  }
  const doc = el.ownerDocument;
  const root = doc.body ?? doc.documentElement;
  if (el === root || el === doc.documentElement) {
    return [root];
  }
  const chain: Element[] = [el];
  let last = rectOf(el);
  for (
    let at = el.parentElement;
    at &&
    at !== root &&
    at !== doc.documentElement &&
    chain.length <= CHAIN_MOST;
    at = at.parentElement
  ) {
    const box = rectOf(at);
    const same =
      Math.abs(box.width - last.width) < 1 &&
      Math.abs(box.height - last.height) < 1;
    if (!(same || pageSized(at))) {
      chain.push(at);
      last = box;
    }
  }
  chain.push(root);
  return chain;
}

/** What the host names a target by: its anchor and its element, as a pin would hold them. */
const named = (el: Element) => ({
  anchor: anchorOf(el),
  elements: [describe(el)],
});

/** The composer's word to the host: what the comment stands on, its chain, the one chosen, and how it was opened. */
function tellDraft() {
  if (!drafting) {
    return;
  }
  const { ink: inked } = drafting;
  const point = draftTarget()?.point;
  post("cawco:compose", {
    via: "pointer",
    chosen: drafting.chosen,
    chain: inked
      ? [{ anchor: inked.anchor, elements: inked.elements, ink: true }]
      : drafting.named,
    // What the host keeps to bring it back after a reload.
    ...(point ? { point } : {}),
    ...(inked ? { inkId: inked.id } : {}),
  });
}

/** The parked draft's pill pressed: its composer opens again with what it held. */
function reopenDraft() {
  if (!drafting?.parked) {
    return;
  }
  drafting.parked = false;
  tellDraft();
  pins.draft(draftTarget());
  paint();
}

/**
 * A draft the host kept across a reload (`cawco:compose-restore`): its
 * target found again by its anchor, at the point it stood on, parked or
 * with its composer open.
 */
function restoreDraft(message: HostMessage) {
  const target = message.target as {
    anchor?: unknown;
    elements?: unknown;
    inkId?: unknown;
    point?: { x?: unknown; y?: unknown };
  } | null;
  const anchor = target?.anchor as PageAnchor | undefined;
  if (!(anchor && typeof anchor.selector === "string" && artifact.keeps())) {
    return;
  }
  const el = locate(anchor)?.el ?? null;
  if (!el) {
    return;
  }
  const parked = message.parked === true;
  const group =
    typeof target?.inkId === "string"
      ? (artifact.doc().getMap("ink") as YMap<InkGroup>).get(target.inkId)
      : undefined;
  const r = el.getBoundingClientRect();
  const fx = Number(target?.point?.x);
  const fy = Number(target?.point?.y);
  const chain = group ? [el] : chainOf(el);
  drafting = {
    chain,
    named: group ? [] : chain.map(named),
    chosen: 0,
    x: r.left + (Number.isFinite(fx) ? fx : 0.5) * r.width,
    y: r.top + (Number.isFinite(fy) ? fy : 0.5) * r.height,
    parked,
    ...(Number.isFinite(fx) && Number.isFinite(fy)
      ? { point: { x: fx, y: fy } }
      : {}),
    ...(group
      ? {
          ink: {
            anchor: group.anchor as PageAnchor,
            elements: Array.isArray(target?.elements)
              ? (target.elements as PinnedElement[])
              : [],
            id: group.id,
          },
        }
      : {}),
  };
  if (!parked) {
    tellDraft();
  }
  pins.draft(draftTarget());
  paint();
}

/**
 * The chosen element of the comment being written, as the page holds it
 * now: its own while it stands in the page; once the page has drawn it
 * again (a panel rebuilt, a list re-rendered), the one its anchor, read at
 * the press, finds now, which takes its place; null while none stands there.
 */
function draftEl(): Element | null {
  const el = drafting?.chain[drafting.chosen];
  if (!(drafting && el)) {
    return null;
  }
  if (el.isConnected || drafting.ink) {
    return el;
  }
  const atPress = drafting.named[drafting.chosen];
  const found = atPress ? (locate(atPress.anchor)?.el ?? null) : null;
  if (found) {
    drafting.chain[drafting.chosen] = found;
  }
  return found;
}

/** The chosen target of the comment being written, as pins.ts draws its hollow pill. */
function draftTarget(): DraftTarget | null {
  const el = draftEl();
  if (!(drafting && el)) {
    return null;
  }
  const parked = drafting.parked ? { parked: true } : {};
  if (drafting.ink) {
    return { el, ink: drafting.ink.id, ...parked };
  }
  const root = el === el.ownerDocument.body;
  const point =
    drafting.point && drafting.chosen === 0
      ? drafting.point
      : pins.pointOn(el, drafting.x, drafting.y);
  return root ? { el, ...parked } : { el, point, ...parked };
}

/**
 * A press chose `el` at the viewport's `x`, `y`: its composer opens in the
 * host and its hollow pill stands where the press landed. Nothing is
 * written. A comment already being written gives way to this one.
 *
 * The host hears the draft before its pill is drawn: drawing it tells the
 * host where it stands (pins.ts `tell`, `cawco:compose-at`), which the host
 * keeps only for a composer it has, so told first, the pill's place came
 * before the composer and was dropped, and the composer stood at the
 * well's corner, never beside its pill, until the page scrolled.
 */
function startDraft(el: Element, x: number, y: number) {
  const chain = chainOf(el);
  drafting = {
    chain,
    named: chain.map(named),
    chosen: 0,
    x,
    y,
    // Where on it the press landed, kept as its fractions: the pill stays there as the page scrolls or draws it again.
    ...(el === el.ownerDocument.body ? {} : { point: pins.pointOn(el, x, y) }),
  };
  tellDraft();
  pins.draft(draftTarget());
  paint();
}

/** The radial's Comment on an ink group: its composer opens on the ink. */
function composeInk(target: DraftTarget, elements: PinnedElement[] | string[]) {
  const group = target.ink
    ? (artifact.doc().getMap("ink") as YMap<InkGroup>).get(target.ink)
    : undefined;
  if (!(group && artifact.keeps())) {
    return;
  }
  drafting = {
    chain: [target.el],
    named: [],
    chosen: 0,
    x: 0,
    y: 0,
    ink: { anchor: group.anchor as PageAnchor, elements, id: group.id },
  };
  // The draft first, then its pill's place (`startDraft`).
  tellDraft();
  pins.draft(draftTarget());
  paint();
}

/** The comment being written is let go: its pill and its outline with it. */
function endDraft() {
  if (!drafting) {
    return;
  }
  drafting = null;
  pins.draft(null);
  paint();
}

/**
 * What the comment being written stands on as it is written: its element
 * as the page holds it now ({@link draftEl}), read afresh; while the page
 * holds none (drawing it again), as it was read at the press, which its
 * pin's anchor finds once it is back. An ink group's Comment stands on its
 * ink.
 */
function draftWritten(
  at: NonNullable<typeof drafting>,
  atPress: ReturnType<typeof named> | undefined
): CommentTarget | null {
  if (at.ink) {
    return { anchor: at.ink.anchor, elements: at.ink.elements, ink: at.ink.id };
  }
  const point = at.chosen === 0 ? at.point : undefined;
  const el = draftEl();
  if (el) {
    return {
      anchor: anchorOf(el),
      elements: [describe(el)],
      ...(el === el.ownerDocument.body
        ? {}
        : { point: point ?? pins.pointOn(el, at.x, at.y) }),
    };
  }
  return atPress ? { ...atPress, ...(point ? { point } : {}) } : null;
}

/**
 * The host's words for the comment being written (`cawco:comment`): its pin
 * and first entry in one write (core `commentOn`), answered as
 * `cawco:comment-result` with the pin, or the refusal's sentence, the
 * comment still standing to try again.
 */
async function writeDraft(message: HostMessage) {
  const said = {
    text: typeof message.text === "string" ? message.text : "",
    attachments: Array.isArray(message.attachments)
      ? (message.attachments as CommentAttachment[])
      : [],
  };
  const at = drafting;
  const target = at && draftWritten(at, at.named[at.chosen]);
  if (!(at && target)) {
    post("cawco:comment-result", {
      ok: false,
      error:
        "This comment's place is gone from the page, so it wasn't kept. Click the page again.",
    });
    return;
  }
  if (!artifact.keeps()) {
    post("cawco:comment-result", { ok: false, error: NO_ARTIFACT });
    return;
  }
  await artifact.whenKnown();
  const pin = commentOn(artifact.doc(), target, said);
  if (typeof pin === "string") {
    post("cawco:comment-result", { ok: false, error: pin });
    return;
  }
  if (drafting === at) {
    endDraft();
  }
  post("cawco:comment-result", { ok: true, pin });
  // Drawn once its pill stands: the next frame.
  requestAnimationFrame(() => pinPicture(pin.id));
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
      commenting() ||
      target?.closest("[data-pin-id], cawco-overlay") ||
      !artifact.keeps()
    ) {
      return;
    }
    post("cawco:press");
  },
  { capture: true, passive: true }
);

/** A press on the overlay's own chrome (the ink's icon and menu), never the layer over the page: its own. */
const onChrome = (event: Event) => {
  const path = event.composedPath();
  return path[0] !== layer && path.includes(host);
};

/** Whether the overlay takes this press from the page: every one in Comment and Draw, but a pen's and its own chrome's. */
const taken = (event: Event) =>
  modeNow !== "interact" &&
  !(event instanceof PointerEvent && event.pointerType === "pen") &&
  !(modeNow === "draw" && onChrome(event));

// In Comment and Draw the whole press belongs to the overlay: a
// document-level outside-click handler in the app must not dismiss the thing
// being pointed at on pointerdown, before the click that would pin it
// arrives. In Draw, a press the ink did not take (a disc's, a second finger)
// is the page's no more than a stroke is; one on a pin's disc opens it.
for (const type of [
  "pointerdown",
  "pointermove",
  "pointerup",
  "mousemove",
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
      if (taken(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (modeNow === "draw") {
          const disc =
            event.type === "pointerdown" &&
            pinUnder(
              (event as PointerEvent).clientX,
              (event as PointerEvent).clientY
            );
          if (disc) {
            pins.open(disc);
          }
        } else if (event.type === "pointerdown") {
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
    if (!taken(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (commenting() && !touchCaptured) {
      commentAt(event.clientX, event.clientY);
    }
  },
  true
);

/** The pane's keys, heard while the page has the keyboard: V, C and D, ⇧C (as `C`), J, K, `/` (the rail's search), Enter and Esc. */
const PANE_KEYS = new Set([
  "v",
  "c",
  "d",
  "C",
  "j",
  "k",
  "/",
  "Enter",
  "Escape",
]);

/** Whether `target` takes typing: the page's own keys stay its own there. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

window.addEventListener(
  "keydown",
  (event) => {
    // A composer or a thread stands: Esc is the host's to unwind (composer,
    // then thread, then the mode), wherever the keyboard is.
    if (event.key === "Escape" && composing()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      post("cawco:key", { key: "Escape" });
      return;
    }
    if (modeNow !== "interact" && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      mode("interact");
      post("cawco:escape");
      return;
    }
    const letter = event.key.length === 1 ? event.key.toLowerCase() : null;
    // ⇧C (Figma's hide/show comments) goes as `C`; every other letter as itself.
    const key = letter === "c" && event.shiftKey ? "C" : (letter ?? event.key);
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

/*
 * The shell's own combos (core `SHELL_SHORTCUTS`: ⌘K Jump, ⌘⇧N, ⌘\ and
 * ⌘⇧\), pressed while the page has the keyboard. The page has the first
 * claim on every key; the shell takes only a combo the page left unhandled.
 * That is decided at the very end of the event's dispatch, after every
 * listener the page has: the capture listener here (the first thing on the
 * window to hear it) puts `leftToShell` at the end of the window's own
 * bubbling listeners, which run last. "Let listeners be a clone of event's
 * currentTarget attribute value's event listener list. This avoids event
 * listeners added after this point from being run." (DOM Standard, invoke,
 * https://dom.spec.whatwg.org/#concept-event-listener-invoke): the window's
 * bubbling list is cloned when that phase starts, after this capture, so
 * the listener added here is in it, last. Unhandled (not
 * `defaultPrevented`), the overlay takes it: it prevents the default there
 * and then, so the browser's own Ctrl+K (Chrome's "Search from anywhere on
 * the page") does not run beside Jump, and tells the host. A page that
 * handles the combo keeps it: one that prevents its default, stops its
 * propagation (`leftToShell` never runs), or adds a bubbling listener of
 * its own on the window in this same dispatch. A text field in the page is
 * no exception: what the page does with the combo decides, as anywhere in
 * it. The one exception is a ⌃ combo in a field on Apple's systems, which
 * is the text system's own key there (⌃K deletes to the line's end, with
 * no listener to prevent it); ⌘ is the shell's in that field.
 */
let shortcutPress: KeyboardEvent | null = null;

/** Apple's systems, where ⌃ letters in a field are text keys and ⌘ is the command key. */
const APPLE = /Mac|iPhone|iPad/.test(navigator.platform);

/** Whether `event` is a field's own text key rather than a shell combo. */
const fieldKeeps = (event: KeyboardEvent): boolean =>
  APPLE && event.ctrlKey && !event.metaKey && typing(event.target);

function leftToShell(event: KeyboardEvent) {
  window.removeEventListener("keydown", leftToShell);
  if (event !== shortcutPress) {
    return;
  }
  shortcutPress = null;
  const name = shellShortcutOf(event);
  if (!name || event.defaultPrevented) {
    return;
  }
  event.preventDefault();
  post("cawco:shortcut", { name });
}

window.addEventListener(
  "keydown",
  (event) => {
    window.removeEventListener("keydown", leftToShell);
    shortcutPress = null;
    if (!shellShortcutOf(event) || fieldKeeps(event)) {
      return;
    }
    shortcutPress = event;
    window.addEventListener("keydown", leftToShell);
  },
  true
);

/**
 * Each mark's picture (picture.ts), by the mark's id: drawn once, when the
 * mark is made, and again only when what it shows moved or grew (its look).
 */
const shots = new Map<string, { look: string; png: Promise<string | null> }>();

/** Mark `id`'s picture, cropped to `box`; the one already drawn while its `look` is the same. */
function shot(
  id: string,
  look: string,
  box: Box,
  el: Element | null = null
): Promise<string | null> {
  const had = shots.get(id);
  if (had?.look === look) {
    return had.png;
  }
  const undrawn = (message: string) => post("cawco:error", { message });
  // A mark on an embed of another origin is drawn there, by its own overlay:
  // this page cannot draw what a frame of another origin shows.
  const png =
    el && embeds.read(el)
      ? embeds.picture(el, box, undrawn)
      : cropPicture(box, undrawn);
  shots.set(id, { look, png });
  return png;
}

/** A stroke group's picture: the page round its ink, as the ink layer placed it. */
function groupPicture(id: string): Promise<string | null> {
  const box = ink.groupBox(id);
  return box
    ? shot(id, JSON.stringify(box), padded(box))
    : Promise.resolve(null);
}

/** A pin's picture: its ink's, or the page round its element at its point. */
function pinPicture(id: string): Promise<string | null> {
  const crop = pins.cropOf(id);
  const pin = (artifact.doc().getMap("pins") as YMap<Pin>).get(id);
  if (pin?.ink) {
    return groupPicture(pin.ink);
  }
  return crop ? shot(id, crop.look, crop.box, crop.el) : Promise.resolve(null);
}

/**
 * The pictures of the person's marks the session has not heard: each unsent
 * pin's, and each stroke group's no pin stands on. Each was drawn when its
 * mark was made; only one whose mark moved since is drawn again.
 */
async function markPictures(): Promise<MarkPicture[]> {
  const doc = artifact.doc();
  const all = [...(doc.getMap("pins") as YMap<Pin>).values()];
  const owed = all.filter(pinUnsent).sort((a, b) => a.number - b.number);
  const pinned = new Set(all.map((pin) => pin.ink));
  const loose = [...(doc.getMap("ink") as YMap<InkGroup>).values()].filter(
    (group) => !(group.sentAt || pinned.has(group.id))
  );
  const marks = [
    ...loose.map((group) => ({ id: group.id, png: groupPicture(group.id) })),
    ...owed.map((pin) => ({ id: pin.id, png: pinPicture(pin.id) })),
  ].slice(0, COMMENT_LIMITS.pictures);
  const pictures: MarkPicture[] = [];
  for (const { id, png } of marks) {
    // biome-ignore lint/performance/noAwaitInLoops: each was started when its mark was made
    const drawn = await png;
    if (drawn) {
      pictures.push({ mark: id, png: drawn });
    }
  }
  return pictures;
}

/**
 * How long after the person's last mark here the page draws its pictures
 * for the hub: a pause in the burst, inside the hub's own quiet before it
 * delivers the marks (hub artifacts/service.ts `COMMENTS_QUIET_MS`, 3 s), so
 * the delivery finds them there. Our call.
 */
const PICTURES_AFTER_MS = 1500;
let picturesTimer: ReturnType<typeof setTimeout> | undefined;

/** The pictures of what is unheard, to the hub now. */
async function postPictures(): Promise<void> {
  const pictures = await markPictures();
  if (pictures.length > 0) {
    await artifact
      .pictures({ pictures, url: location.href })
      .catch((error: unknown) => {
        console.warn(
          `[cawco] the marks' pictures did not reach the hub: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }
}

/** The person marked this page: once they pause, its pictures of what is unheard go to the hub. A canvas's picture is its own. */
function picturesLater() {
  clearTimeout(picturesTimer);
  if (artifact.kind() === "canvas") {
    return;
  }
  picturesTimer = setTimeout(postPictures, PICTURES_AFTER_MS);
}

type HostMessage = Record<string, unknown>;

/** The most boxes a host says it covers the page with. Our call: a list and a card. */
const COVERED_MOST = 4;

/** The host's covered boxes, the viewport's px; each finite and sized, or left out. */
function coveredOf(value: unknown): Box[] {
  return (Array.isArray(value) ? value.slice(0, COVERED_MOST) : []).flatMap(
    (raw) => {
      const box = raw as Partial<Record<keyof Box, unknown>> | null;
      const [x, y, w, h] = [box?.x, box?.y, box?.w, box?.h].map((n) =>
        typeof n === "number" && Number.isFinite(n) ? n : Number.NaN
      );
      return [x, y, w, h].some(Number.isNaN) || w <= 0 || h <= 0
        ? []
        : [{ x, y, w, h }];
    }
  );
}

const idOf = (message: HostMessage) =>
  typeof message.id === "string" ? message.id : null;

/** A host's list of strings, its other entries left out; none when it is no list. Our bound: 200. */
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((one): one is string => typeof one === "string")
        .slice(0, 200)
    : [];

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
  // The pin as this page holds it now (null once deleted): a host drawing it
  // from the page (its own doc doesn't hold it yet) draws it again from this.
  const now = (artifact.doc().getMap("pins") as YMap<Pin>).get(pin) ?? null;
  post(result, error ? { pin, ok: false, error, now } : { pin, ok: true, now });
}

/** What each of the host's messages does, by its type. */
const fromHost: Record<string, (message: HostMessage) => void | Promise<void>> =
  {
    "cawco:hello": (message) => {
      ready();
      // The host names the artifact this page is, and where its doc is synced.
      const hello = message as {
        artifact: Parameters<typeof artifact.join>[0];
        sync: Parameters<typeof artifact.join>[1];
      };
      if (artifact.join(hello.artifact, hello.sync)) {
        tellLink(artifact.link());
      } else {
        failed("artifact", NO_ARTIFACT);
      }
      takeTheme(message.theme);
      takeInset(message.inset);
      // A sheet's module ran before the pane said hello: its sheet goes now.
      const onPage = (window as { __cawcoSheetOnPage?: object })
        .__cawcoSheetOnPage;
      if (onPage) {
        post("cawco:sheet", { sheet: onPage });
      }
    },
    "cawco:place": (message) => takeInset(message.inset),
    // A sheet's inspector: a story mounted again with the pane's args (null lets them go), and the story it shows.
    "cawco:story-args": (message) => {
      dispatchEvent(
        new CustomEvent("cawco:story-args", {
          detail: {
            story: message.story,
            args:
              message.args && typeof message.args === "object"
                ? message.args
                : null,
          },
        })
      );
    },
    "cawco:story-select": (message) => {
      dispatchEvent(
        new CustomEvent("cawco:story-select", {
          detail: { story: message.story },
        })
      );
    },
    // A component canvas's view from the pane's head: scheme, widths, motion, every permutation, zoom.
    "cawco:canvas-view": (message) => {
      const view = message.view as Record<string, unknown> | undefined;
      if (!view || typeof view !== "object") {
        return;
      }
      const widths = Array.isArray(view.widths)
        ? view.widths.filter(
            (one): one is number =>
              typeof one === "number" && one > 0 && one <= CANVAS_WIDTH_MAX
          )
        : null;
      dispatchEvent(
        new CustomEvent("cawco:canvas-view", {
          detail: {
            ...(["light", "dark", "both", "page"].includes(String(view.scheme))
              ? { scheme: view.scheme }
              : {}),
            ...("widths" in view
              ? { widths: widths?.length ? widths : null }
              : {}),
            ...(view.motion === "on" || view.motion === "reduce"
              ? { motion: view.motion }
              : {}),
            ...(typeof view.all === "boolean" ? { all: view.all } : {}),
            ...(view.zoom === "fit" ||
            (typeof view.zoom === "number" && view.zoom > 0 && view.zoom <= 4)
              ? { zoom: view.zoom }
              : {}),
          },
        })
      );
    },
    "cawco:theme": (message) => takeTheme(message.theme),
    // A host that holds no doc of its own (the app) writes the person's reply,
    // resolve and delete through this page's, by the one write core keeps.
    "cawco:reply": (message) =>
      personWrite(message, "cawco:reply-result", (pin) =>
        replyToPin(artifact.doc(), pin, {
          text: typeof message.text === "string" ? message.text : "",
          attachments: Array.isArray(message.attachments)
            ? (message.attachments as CommentAttachment[])
            : [],
        })
      ),
    "cawco:resolve": (message) =>
      personWrite(message, "cawco:resolve-result", (pin) =>
        typeof message.resolved === "boolean"
          ? resolvePin(artifact.doc(), pin, message.resolved)
          : "A resolve says resolved or reopened, so the pin wasn't changed."
      ),
    "cawco:delete": (message) =>
      personWrite(message, "cawco:delete-result", (pin) =>
        // One the hub refused stands only in the device's keep: it goes from there.
        artifact.letGoRefused(pin) ? null : deletePin(artifact.doc(), pin)
      ),
    // The composer's words: the comment written, its pin and first entry at once.
    "cawco:comment": (message) => writeDraft(message),
    // The composer closed with nothing said (Esc, a press outside, Close): nothing was written, and its pill goes.
    "cawco:compose-cancel": () => endDraft(),
    // The composer closed with its words kept: its pill stays, saying it holds a draft, and opens it again.
    "cawco:compose-park": () => {
      if (drafting) {
        drafting.parked = true;
        pins.draft(draftTarget());
        paint();
      }
    },
    // A comment the hub refused, tried again (its Try again): written into the doc once more.
    "cawco:resend-pin": (message) => {
      if (typeof message.id === "string" && artifact.resend(message.id)) {
        tellPagePins();
      }
    },
    // A draft the host kept across a reload: brought back at its target.
    "cawco:compose-restore": (message) => restoreDraft(message),
    // The composer's target chip chose another of the press's chain: its pill and outline follow.
    "cawco:compose-target": (message) => {
      const index = typeof message.index === "number" ? message.index : -1;
      if (!drafting?.chain[index]) {
        return;
      }
      drafting.chosen = index;
      // The draft first, then its pill's place (`startDraft`).
      tellDraft();
      pins.draft(draftTarget());
      paint();
    },
    // A comment on the whole page (the rail's +): its composer opens with the page as its target.
    "cawco:compose-page": () => {
      if (artifact.keeps() && document.body) {
        startDraft(document.body, 0, 0);
      }
    },
    // The agent working on a pin, and an answer the person hasn't read: each pin's dot.
    "cawco:pin-marks": (message) =>
      pins.marks(
        new Set(Array.isArray(message.live) ? (message.live as string[]) : []),
        new Set(
          Array.isArray(message.unread) ? (message.unread as string[]) : []
        )
      ),
    "cawco:mode": (message) =>
      mode(
        previewMode(message.mode) ?? "interact",
        typeof message.place === "string" ? message.place : null
      ),
    // ⇧C: every pin hidden from the page, or shown again.
    "cawco:pins-shown": (message) => pins.show(message.shown !== false),
    // The host's Try again on a lost link: the doc's socket opened again now.
    "cawco:reconnect": () => artifact.reconnect(),
    "cawco:focus-pin": (message) =>
      pins.focus(idOf(message), message.scroll === true),
    // What the latest revision changed that the person hasn't looked at, and the pins with an answer he hasn't: washed, their stops told.
    "cawco:changes": (message) =>
      changes.show(strings(message.anchors), strings(message.pins)),
    // A step of the host's tag, or a chip's decision card: brought into view and chosen.
    "cawco:show-element": (message) => {
      if (typeof message.selector === "string") {
        changes.step(message.selector, message.outline === "flash");
      }
    },
    // The card open on a pin: its element is the one target while it stands; closed, the pointer's leads again.
    // The pointer or the keyboard on a pin's row in the host's list: its element chosen while it rests there.
    "cawco:hover-pin": (message) => pins.hover(idOf(message)),
    "cawco:track-pin": (message) => {
      const id = idOf(message);
      threadOpen = id !== null;
      if (!composing()) {
        pinLeads = false;
      }
      pins.track(id);
      paint();
      // The open thread's element and what holds it, for its card's chain line.
      const pin = id
        ? (artifact.doc().getMap("pins") as YMap<Pin>).get(id)
        : undefined;
      const el =
        pin && "selector" in pin.anchor ? locate(pin.anchor)?.el : undefined;
      if (id && el) {
        post("cawco:pin-chain", { id, chain: chainOf(el).map(named) });
      }
    },
    // What the host's chrome covers of the page (its Comments list, a
    // phone's card): a pin it opens is brought out from under it.
    "cawco:covered": (message) => pins.cover(coveredOf(message.boxes)),
    // Asked as `cawco:capture`, answered as `cawco:captured`: a host in this
    // same window hears its ask and this answer, and neither is the other.
    // A picture that throws is answered too, with why: unanswered, the host
    // waits out its bound for a picture that never comes.
    "cawco:capture": async () =>
      post(
        "cawco:captured",
        await thumbnail().catch((reason: unknown) => ({
          png: null,
          error: `The page's picture failed: ${reason instanceof Error ? reason.message : String(reason)}`,
        }))
      ),
    // Its conversation's tab off screen, and back (hold.ts): this document
    // and every same-origin frame in it, which the pane hears as `cawco:held`.
    "cawco:hold": () => holdPage(true),
    "cawco:release": () => holdPage(false),
  };

/**
 * Held or let go, with every same-origin frame in it, and the pane told. A
 * hold of a held page, or a release of one let go, changes nothing and says
 * nothing: the pane lets the page go as its tab is reached for, and the
 * switch that chooses the tab releases it again (PreviewPane).
 */
function holdPage(on: boolean) {
  if (on === isHeld()) {
    return;
  }
  hold(on);
  for (const view of frameWindows(document)) {
    markOf(view)?.hold(on);
  }
  post("cawco:held", { held: on });
}

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

/*
 * A sheet's page (live components): its module says the sheet on each run
 * and each props refresh (stage-host host.ts), and the pane's inspector
 * draws its controls from it.
 */
window.addEventListener("cawco:sheet", (event) => {
  post("cawco:sheet", { sheet: (event as CustomEvent<object>).detail });
});

/** What this page reads of one of its elements for a page that frames it from another origin (embeds.ts). */
function remoteOf(el: Element): Remote {
  const rect = rectOf(el);
  const { box: _box, ...anchor } = anchorOf(el);
  return {
    anchor,
    box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    boxed: drawsBox(el),
    corners: cornersOf(el, rect),
    element: describe(el),
    label: labelOf(el),
  };
}

// Framed by a page of another origin (a decision page's Preview): its
// overlay asks what stands under its pointer here, and where its pins do.
answerEmbedder({
  at: contentAt,
  chain: chainOf,
  locate,
  own: (node) =>
    !!(
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement
    )?.closest(OVERLAY_OWN),
  // The box as this page's viewport has it, drawn from its page.
  picture: (box, undrawn) =>
    cropPicture(
      { x: box.x + scrollX, y: box.y + scrollY, w: box.w, h: box.h },
      undrawn
    ),
  read: remoteOf,
});

window.addEventListener("popstate", navigated);
window.addEventListener("hashchange", navigated);
ready();
