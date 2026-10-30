/**
 * Comment mode across an origin: a frame of another origin in the page (a
 * decision page's Preview of a component canvas or a dev server's preview,
 * each on an embed origin of its own, hub server.ts `embedAt`), pointed at
 * element by element, never as one box.
 *
 * The page's overlay cannot read a frame of another origin (frames.ts). The
 * embed's own overlay runs (overlay.ts: its parent is of another origin),
 * but no host says it hello (decisions host Preview.svelte frames it bare,
 * and host-origin.ts admits only a dashboard or its own origin as a host),
 * so it holds no doc, no composer and no pins. So the page's overlay keeps
 * the one doc, the composer's link and the pin layer, and asks the embed's
 * overlay the two things only it can read: the element under a point, and
 * where an anchor stands now (core `findAnchor`, in its own document). It
 * answers what it read of each, and tells again whenever what it answered
 * moves.
 *
 * Each answer stands in the page as a stand-in: an unseen element at the
 * answered box inside a layer laid over the frame's content box (a sibling
 * of the frame, so the scrollers and clips round the frame hold it too, and
 * it clips it to the frame). The One Target, the composer's chain, a pin's
 * anchor, its pill and its scroll into view take a stand-in as they take any
 * element of the page; what they read of an element's own (its anchor, its
 * description, its label, whether it draws a box, its corners) is the
 * embed's answer (page.ts asks {@link Embeds.read}).
 *
 * A frame is bridged once its overlay says it is there (`cawco:embedded`,
 * to any parent: it says nothing else). Until then, and for a frame whose
 * document runs no overlay, the frame is one element, as frames.ts has it.
 */
import type {
  AnchorFound,
  PageAnchor,
  PinnedElement,
} from "@cawco/core/comments";
import { EMBED_WORDS } from "@cawco/core/stage";
import {
  contentBox,
  type FrameElement,
  frameDocument,
  framesOf,
  frameWindows,
  isFrame,
  rectOf,
} from "./frames";

/** An embed's overlay is there: said to its parent, whatever its origin, and carrying nothing. */
const EMBEDDED = "cawco:embedded";
/** The page asks the element at a point of the embed's viewport; answered as {@link TARGET}. */
const AT = "cawco:embed-at";
const TARGET = "cawco:embed-target";
/** The page asks where anchors stand; answered, and told again as they move, as {@link FOUND}. */
const FIND = "cawco:embed-find";
const FOUND = "cawco:embed-found";
/** The page asks a picture of a box of the embed's viewport (a pin's crop); answered as {@link PICTURED}. */
const PICTURE = "cawco:embed-picture";
const PICTURED = "cawco:embed-pictured";

/** The attribute a frame showing an artifact carries (decisions host Preview.svelte): its id. */
export const EMBED_ARTIFACT = "data-cawco-artifact";
/** The layer of stand-ins over a frame: the overlay's own, never the page's (ink.ts `OWN`, page.ts `OVERLAY_OWN`). */
export const STAND_INS = "data-cawco-stand-ins";

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** What an embed's overlay read of one of its elements. */
export interface Remote {
  /** Its anchor in the embed's document, the box left out (the page's box is the page's to say). */
  anchor: PageAnchor;
  /** Its box in the embed's viewport, px. */
  box: Box;
  /** Whether it draws a box of its own (page.ts `drawsBox`). */
  boxed: boolean;
  /** Its four corners as the One Target's outline takes them (page.ts `cornersOf`). */
  corners: string[];
  element: PinnedElement;
  /** What the hover label says of it. */
  label: string;
}

/** An element at a point, or an anchor found: with what holds it, innermost first, the embed's page as a whole left out. */
interface RemoteTarget extends Remote {
  by?: AnchorFound<Element>["by"];
  chain: Remote[];
}

/** Any JSON value written with its keys in order: two anchors read alike name one element. */
const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
};

/** An anchor as the embed reads it: the page's box and the artifact it names are the page's, never part of what finds it there. */
const innerOf = (anchor: PageAnchor): PageAnchor => {
  const { box: _box, embed: _embed, ...inner } = anchor;
  return inner;
};
const keyOf = (anchor: PageAnchor): string => stable(innerOf(anchor));

/** The most anchors an embed keeps watching for the page. Our call: every pin a page may hold, and a hover's chain. */
const WATCHED_MOST = 256;

/** What the embed's overlay reads for its parent (page.ts). */
export interface EmbeddedDeps {
  /** The element a press at the viewport's `x`, `y` names (page.ts `contentAt`). */
  at: (x: number, y: number) => Element | null;
  /** What a press on `el` may stand on, `el` first, the page's root last (page.ts `chainOf`). */
  chain: (el: Element) => Element[];
  locate: (anchor: PageAnchor) => AnchorFound<Element> | null;
  /** Whether a node is the overlay's own: its changes move nothing the page asked of. */
  own: (node: Node) => boolean;
  /**
   * The embed's picture of `box`, its viewport's px, as a mark's picture is
   * drawn (picture.ts `cropPicture`); `failed` hears what of it was not drawn.
   */
  picture: (
    box: Box,
    failed: (message: string) => void
  ) => Promise<string | null>;
  read: (el: Element) => Remote;
}

/**
 * The embed's side: says it is there, answers its parent's asks, and tells
 * it again, once per frame at most, each anchor it was asked of whose answer
 * moved since. Only the parent is heard, and answered on the origin it asked
 * from; a document at the top has no parent and says nothing.
 */
export function answerEmbedder(deps: EmbeddedDeps): void {
  if (window.parent === window) {
    return;
  }
  /** The origin the parent asked from: where every answer and every move goes. */
  let asker: string | null = null;
  const watched = new Map<string, { anchor: PageAnchor; said: string }>();
  const isRoot = (el: Element) =>
    el === el.ownerDocument.body || el === el.ownerDocument.documentElement;
  const target = (
    el: Element,
    by?: AnchorFound<Element>["by"]
  ): RemoteTarget => ({
    ...deps.read(el),
    ...(by ? { by } : {}),
    chain: deps
      .chain(el)
      .slice(1)
      .filter((one) => !isRoot(one))
      .map(deps.read),
  });
  const watch = (key: string, anchor: PageAnchor, said: string) => {
    watched.delete(key);
    watched.set(key, { anchor, said });
    if (watched.size > WATCHED_MOST) {
      const [oldest] = watched.keys();
      if (oldest !== undefined) {
        watched.delete(oldest);
      }
    }
  };
  const lookUp = (anchor: PageAnchor): RemoteTarget | null => {
    const found = deps.locate(anchor);
    return found && !isRoot(found.el) ? target(found.el, found.by) : null;
  };
  const say = (message: object) => {
    if (asker) {
      window.parent.postMessage(message, asker);
    }
  };
  /** The parent asked from `origin`: answers go there, and from its first ask on, what moves here is watched. */
  const askedFrom = (origin: string) => {
    if (asker === null) {
      watchMoves();
    }
    asker = origin;
  };

  /** The element at the embed's `x`, `y`, with what holds it, watched from now on; null for its page as a whole or nothing. */
  const answerAt = (x: number, y: number): RemoteTarget | null => {
    const el = Number.isFinite(x) && Number.isFinite(y) ? deps.at(x, y) : null;
    const answer = el && !isRoot(el) ? target(el) : null;
    if (answer) {
      watch(keyOf(answer.anchor), answer.anchor, stable(answer));
      for (const one of answer.chain) {
        watch(keyOf(one.anchor), one.anchor, "");
      }
    }
    return answer;
  };
  /** Where each anchor asked of stands now, by its key, each watched from now on. */
  const answerFind = (
    anchors: unknown
  ): Record<string, RemoteTarget | null> => {
    const asked =
      anchors && typeof anchors === "object"
        ? Object.entries(anchors as Record<string, PageAnchor>)
        : [];
    const found: Record<string, RemoteTarget | null> = {};
    for (const [key, anchor] of asked.slice(0, WATCHED_MOST)) {
      if (typeof anchor?.selector === "string") {
        const now = lookUp(anchor);
        found[key] = now;
        watch(key, anchor, stable(now));
      }
    }
    return found;
  };

  /** The picture the parent asked as `seq` of `box`, answered with what failed in drawing it. */
  const drawFor = async (seq: unknown, box: unknown) => {
    const asked = box as Partial<Box> | null;
    const sides = [asked?.x, asked?.y, asked?.w, asked?.h];
    if (!sides.every((n) => typeof n === "number" && Number.isFinite(n))) {
      say({ type: PICTURED, seq, png: null, errors: ["No box to draw."] });
      return;
    }
    const errors: string[] = [];
    const png = await deps
      .picture(asked as Box, (message) => errors.push(message))
      .catch((error: unknown) => {
        errors.push(error instanceof Error ? error.message : String(error));
        return null;
      });
    say({ type: PICTURED, seq, png, errors });
  };

  addEventListener("message", (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const said = event.data as {
      anchors?: unknown;
      box?: unknown;
      seq?: unknown;
      type?: unknown;
      x?: unknown;
      y?: unknown;
    } | null;
    if (said?.type === PICTURE) {
      askedFrom(event.origin);
      drawFor(said.seq, said.box);
    } else if (said?.type === AT) {
      askedFrom(event.origin);
      const answer = answerAt(Number(said.x), Number(said.y));
      say({ type: TARGET, seq: said.seq, target: answer });
    } else if (said?.type === FIND) {
      askedFrom(event.origin);
      say({ type: FOUND, found: answerFind(said.anchors) });
    }
  });

  /** What it answered, read again: each answer that moved told once more. */
  let telling = 0;
  const moved = () => {
    if (!asker || telling || watched.size === 0) {
      return;
    }
    telling = requestAnimationFrame(() => {
      telling = 0;
      const found: Record<string, RemoteTarget | null> = {};
      let any = false;
      for (const [key, held] of watched) {
        const now = lookUp(held.anchor);
        const said = stable(now);
        if (said !== held.said) {
          held.said = said;
          found[key] = now;
          any = true;
        }
      }
      if (any) {
        say({ type: FOUND, found });
      }
    });
  };
  /** Everything that may move an element: watched only once a parent asks, so a page nothing frames pays for none of it. */
  function watchMoves() {
    addEventListener("scroll", moved, { capture: true, passive: true });
    addEventListener("resize", moved);
    addEventListener("transitionend", moved, { capture: true });
    addEventListener("animationend", moved, { capture: true });
    document.fonts?.addEventListener("loadingdone", moved);
    new ResizeObserver(moved).observe(document.documentElement);
    new MutationObserver((records) => {
      if (records.some((record) => !deps.own(record.target))) {
        moved();
      }
    }).observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }
  window.parent.postMessage({ type: EMBEDDED }, "*");
  tellWords(deps.own);
}

/** The most text nodes read for the least words: a page past them is read at its first. Our call. */
const WORDS_READ_MOST = 4000;

/** The least font size, CSS px, any shown word of this page is set at (the overlay's own left out); null with none shown. */
function leastWords(own: (node: Node) => boolean): number | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let least = Number.POSITIVE_INFINITY;
  let read = 0;
  for (
    let node = walker.nextNode();
    node && read < WORDS_READ_MOST;
    node = walker.nextNode()
  ) {
    const holder = node.parentElement;
    if (!(holder && node.textContent?.trim()) || own(node)) {
      continue;
    }
    read += 1;
    if (holder.checkVisibility?.({ visibilityProperty: true }) === false) {
      continue;
    }
    const size = Number.parseFloat(getComputedStyle(holder).fontSize);
    if (size > 0 && size < least) {
      least = size;
    }
  }
  return Number.isFinite(least) ? least : null;
}

/** How long the page stands still (its content, its size, its faces) before its words are read again. Our call: past one mount's burst of changes, short of a wait. */
const WORDS_QUIET_MS = 200;

/**
 * Tells the page holding this one the least font size its shown words are
 * set at (core `EMBED_WORDS`), to any parent: a number, and nothing else.
 * Said once the page has loaded, and again whenever its content, its
 * layout's size or its faces changed and stood still {@link WORDS_QUIET_MS}.
 * An app whose root keeps the window's size (a dashboard) shows no words at
 * its load and mounts them later, so its size alone never told them; and a
 * read waits on a timer, never an animation frame, which Chromium gives no
 * cross-origin frame off screen or unseen (its Preview holds it under its
 * skeleton until these words come).
 */
function tellWords(own: (node: Node) => boolean): void {
  let told: number | null = null;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const tell = () => {
    if (!document.body) {
      return;
    }
    const least = leastWords(own);
    if (least !== null && least !== told) {
      told = least;
      window.parent.postMessage({ type: EMBED_WORDS, least }, "*");
    }
  };
  const soon = () => {
    clearTimeout(quiet);
    quiet = setTimeout(tell, WORDS_QUIET_MS);
  };
  const start = () => {
    tell();
    document.fonts?.ready.then(soon);
    new ResizeObserver(soon).observe(document.documentElement);
    new MutationObserver((records) => {
      if (records.some((record) => !own(record.target))) {
        soon();
      }
    }).observe(document.documentElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  };
  if (document.readyState === "complete") {
    start();
  } else {
    addEventListener("load", start, { once: true });
  }
}

/** What the page's overlay gives the bridge (page.ts). */
export interface EmbedsDeps {
  /** What the bridge answered moved, or a frame's overlay came: the marks and the target are placed again. */
  changed: () => void;
  /** Whether a stand-in is held now (the target, a pin's element, a comment being written): it is never let go. */
  inUse: (el: Element) => boolean;
  /** `el`'s selector in its own document (page.ts `selectorOf`). */
  selectorOf: (el: Element) => string;
}

/** Where an anchor into an embed stands: on its stand-in, found by what; or not yet answered; or gone from the embed. */
type Standing =
  | { by: AnchorFound<Element>["by"]; el: Element; state: "found" }
  | { state: "waiting" }
  | { state: "gone" };

/** A stand-in, as page.ts reads it in place of the element's own. */
interface StandIn {
  /** What holds it, innermost first, each a stand-in. */
  chain: Element[];
  frame: FrameElement;
  remote: Remote;
}

export interface Embeds {
  /** A stand-in's page anchor: the frames down to the embed, the embed's anchor, the artifact it shows, its box in the page. */
  anchorOf: (el: Element) => PageAnchor | null;
  /** The element under the top viewport's `x`, `y` in `frame`, as its stand-in; the frame itself when the embed names its page as a whole; null when a later ask overtook this one. */
  at: (frame: FrameElement, x: number, y: number) => Promise<Element | null>;
  /** Whether `el` is a frame of another origin whose overlay answers. */
  bridged: (el: Element | null) => el is FrameElement;
  /** A stand-in's description as a pin keeps it, its box the page's. */
  describe: (el: Element) => PinnedElement | null;
  /** Where an anchor that leads into a bridged frame stands; null when it leads into no frame of another origin. */
  find: (anchor: PageAnchor) => Standing | null;
  /** Each frame's stand-ins laid over its content box again. */
  fit: () => void;
  /**
   * The picture of `box` (the page's px) round stand-in `el`, drawn by its
   * embed's own overlay, which alone can draw what the frame shows; null
   * when its embed draws none, or its document went before it answered.
   */
  picture: (
    el: Element,
    box: Box,
    failed: (message: string) => void
  ) => Promise<string | null>;
  /** What the embed read of a stand-in; null for any other element. */
  read: (el: Element) => StandIn | null;
}

interface Entry {
  /** Its anchor in the embed's document, as it is asked by. */
  anchor: PageAnchor;
  /** Keys of the entries that hold it, innermost first. */
  chain: string[];
  el: HTMLElement | null;
  /** A pin's: asked by {@link Embeds.find}, kept while the frame stands. */
  pinned: boolean;
  remote: RemoteTarget | null;
  /** What it was last answered, as written: a new answer that reads the same moves nothing. */
  said: string;
  state: "waiting" | "found" | "gone";
}

interface Bridge {
  asking: Map<number, (el: Element | null) => void>;
  /** Pictures asked and not yet answered, by their ask. */
  drawing: Map<number, (png: string | null) => void>;
  entries: Map<string, Entry>;
  /** Whether a find is about to go: the asks of one draw go as one. */
  flushing: boolean;
  frame: FrameElement;
  origin: string;
  wanted: Set<string>;
  wrapper: HTMLDivElement;
}

/** The most stand-ins a frame holds that no pin and nothing shown holds, before they are let go. Our call. */
const LOOSE_MOST = 64;
/** The most asks for a point a frame holds unanswered: a later one overtakes the oldest. */
const ASKING_MOST = 8;

/** The page's side: each bridged frame's stand-ins, and the asks that make them. */
export function startEmbeds(deps: EmbedsDeps): Embeds {
  const bridges = new Map<FrameElement, Bridge>();
  const standIns = new WeakMap<Element, { bridge: Bridge; entry: Entry }>();
  let seq = 0;

  /** The frame of another origin whose window `source` is, in this document or a same-origin frame's. */
  const frameOf = (source: MessageEventSource | null): FrameElement | null => {
    if (!source) {
      return null;
    }
    for (const doc of [
      document,
      ...frameWindows(document).map((view) => view.document),
    ]) {
      for (const frame of doc.querySelectorAll<FrameElement>("iframe, frame")) {
        if (frame.contentWindow === source && !frameDocument(frame)) {
          return frame;
        }
      }
    }
    return null;
  };

  const post = (bridge: Bridge, message: object) =>
    bridge.frame.contentWindow?.postMessage(message, bridge.origin);

  /** The layer of `bridge`'s stand-ins over its frame's content box, at the frame's own layout size; null once the frame is gone. */
  const laid = (bridge: Bridge): HTMLDivElement | null => {
    const { frame, wrapper } = bridge;
    const holder = frame.parentElement;
    if (!(frame.isConnected && holder)) {
      wrapper.remove();
      return null;
    }
    if (wrapper.parentElement !== holder) {
      holder.append(wrapper);
    }
    const box = contentBox(frame);
    const width = `${box.w / box.sx}px`;
    const height = `${box.h / box.sy}px`;
    if (wrapper.style.width !== width) {
      wrapper.style.width = width;
    }
    if (wrapper.style.height !== height) {
      wrapper.style.height = height;
    }
    // Moved by what it lacks: whatever positions it, it stands over the box.
    const now = wrapper.getBoundingClientRect();
    const dx = (box.x - now.x) / box.sx;
    const dy = (box.y - now.y) / box.sy;
    if (Math.abs(dx) > 0.01) {
      wrapper.style.left = `${(Number.parseFloat(wrapper.style.left) || 0) + dx}px`;
    }
    if (Math.abs(dy) > 0.01) {
      wrapper.style.top = `${(Number.parseFloat(wrapper.style.top) || 0) + dy}px`;
    }
    return wrapper;
  };

  /** `entry` as the embed answered it now; whether that moved anything. */
  const take = (
    bridge: Bridge,
    entry: Entry,
    remote: RemoteTarget | null
  ): boolean => {
    const said = stable(remote);
    const moved = said !== entry.said || entry.state === "waiting";
    entry.said = said;
    entry.remote = remote;
    entry.state = remote ? "found" : "gone";
    if (!remote) {
      entry.el?.remove();
      entry.el = null;
      return moved;
    }
    const layer = laid(bridge);
    if (!layer) {
      return moved;
    }
    const el = entry.el ?? layer.ownerDocument.createElement("div");
    const { x, y, w, h } = remote.box;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;margin:0;padding:0;border:0;box-sizing:border-box`;
    if (el.parentElement !== layer) {
      layer.append(el);
    }
    entry.el = el;
    standIns.set(el, { bridge, entry });
    if (remote.chain.length > 0) {
      entry.chain = remote.chain.map((one) => {
        const key = keyOf(one.anchor);
        const held = entryOf(bridge, key, one.anchor);
        take(bridge, held, { ...one, chain: [] });
        return key;
      });
    }
    return moved;
  };

  const entryOf = (bridge: Bridge, key: string, anchor: PageAnchor): Entry => {
    const had = bridge.entries.get(key);
    if (had) {
      return had;
    }
    const made: Entry = {
      anchor: innerOf(anchor),
      chain: [],
      el: null,
      pinned: false,
      remote: null,
      said: "",
      state: "waiting",
    };
    bridge.entries.set(key, made);
    return made;
  };

  /** Asked where `key` stands, with every other ask of this draw. */
  const want = (bridge: Bridge, key: string) => {
    bridge.wanted.add(key);
    if (bridge.flushing) {
      return;
    }
    bridge.flushing = true;
    queueMicrotask(() => {
      bridge.flushing = false;
      const anchors: Record<string, PageAnchor> = {};
      for (const one of bridge.wanted) {
        const entry = bridge.entries.get(one);
        if (entry) {
          anchors[one] = entry.anchor;
        }
      }
      bridge.wanted.clear();
      post(bridge, { type: FIND, anchors });
    });
  };

  /** The stand-ins no pin and nothing shown holds let go, once there are many. */
  const sweep = (bridge: Bridge) => {
    const loose = [...bridge.entries].filter(
      ([, entry]) => !(entry.pinned || (entry.el && deps.inUse(entry.el)))
    );
    if (loose.length <= LOOSE_MOST) {
      return;
    }
    for (const [key, entry] of loose) {
      entry.el?.remove();
      bridge.entries.delete(key);
    }
  };

  /** The pictures a frame owes, answered with none: its document went, and its asks with it. */
  const dropDrawing = (bridge: Bridge) => {
    for (const drawn of bridge.drawing.values()) {
      drawn(null);
    }
    bridge.drawing.clear();
  };

  /** A frame's overlay says it is there (its first load, or a load since): every anchor asked of it is asked again. */
  const came = (frame: FrameElement, origin: string) => {
    let bridge = bridges.get(frame);
    if (bridge) {
      bridge.origin = origin;
      for (const ask of bridge.asking.values()) {
        ask(null);
      }
      bridge.asking.clear();
      dropDrawing(bridge);
    } else {
      const wrapper = frame.ownerDocument.createElement("div");
      wrapper.setAttribute(STAND_INS, "");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.style.cssText =
        "position:absolute;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;overflow:hidden;pointer-events:none;visibility:hidden";
      bridge = {
        asking: new Map(),
        drawing: new Map(),
        entries: new Map(),
        flushing: false,
        frame,
        origin,
        wanted: new Set(),
        wrapper,
      };
      bridges.set(frame, bridge);
    }
    for (const key of bridge.entries.keys()) {
      want(bridge, key);
    }
    deps.changed();
  };

  /** The embed's answer to the ask `asked` for a point: its stand-in, or the frame itself for its page as a whole. */
  const targeted = (bridge: Bridge, asked: number, target: unknown) => {
    const answer = bridge.asking.get(asked);
    if (!answer) {
      return;
    }
    bridge.asking.delete(asked);
    const named = target as RemoteTarget | null;
    if (!named) {
      answer(bridge.frame);
      return;
    }
    sweep(bridge);
    const entry = entryOf(bridge, keyOf(named.anchor), named.anchor);
    take(bridge, entry, named);
    answer(entry.el ?? bridge.frame);
  };

  /** What failed in drawing a picture asked of an embed, by its ask: told where the page tells its own. */
  const failures = new Map<number, (message: string) => void>();

  /** The embed's picture for the ask `asked`, with what failed in drawing it. */
  const drew = (
    bridge: Bridge,
    asked: number,
    png: unknown,
    errors: unknown
  ) => {
    const drawn = bridge.drawing.get(asked);
    if (!drawn) {
      return;
    }
    bridge.drawing.delete(asked);
    const failed = failures.get(asked);
    failures.delete(asked);
    for (const message of Array.isArray(errors) ? errors.slice(0, 4) : []) {
      failed?.(String(message).slice(0, 300));
    }
    // Base64 PNG, as picture.ts `cropPicture` answers it.
    drawn(typeof png === "string" && png.length > 0 ? png : null);
  };

  /** Where the embed found anchors asked of it, now or since: each stand-in placed again, the page told once when any moved. */
  const foundIn = (bridge: Bridge, found: unknown) => {
    const answers =
      found && typeof found === "object"
        ? Object.entries(found as Record<string, RemoteTarget | null>)
        : [];
    let moved = false;
    for (const [key, remote] of answers) {
      const entry = bridge.entries.get(key);
      if (entry) {
        moved = take(bridge, entry, remote) || moved;
      }
    }
    if (moved) {
      deps.changed();
    }
  };

  addEventListener("message", (event) => {
    const said = event.data as {
      errors?: unknown;
      found?: unknown;
      png?: unknown;
      seq?: unknown;
      target?: unknown;
      type?: unknown;
    } | null;
    const type = said?.type;
    if (
      type !== EMBEDDED &&
      type !== TARGET &&
      type !== FOUND &&
      type !== PICTURED
    ) {
      return;
    }
    const frame = frameOf(event.source);
    if (!frame) {
      return;
    }
    if (type === EMBEDDED) {
      came(frame, event.origin);
      return;
    }
    const bridge = bridges.get(frame);
    if (!bridge || event.origin !== bridge.origin) {
      return;
    }
    if (type === PICTURED) {
      drew(bridge, Number(said?.seq), said?.png, said?.errors);
    } else if (type === TARGET) {
      targeted(bridge, Number(said?.seq), said?.target);
    } else {
      foundIn(bridge, said?.found);
    }
  });

  /**
   * The cross-origin frame an anchor's frames lead into, and the anchor as
   * the embed reads it (the frames past it); null when they lead into none.
   */
  const split = (
    anchor: PageAnchor
  ): { frame: FrameElement; inner: PageAnchor } | null => {
    const frames = anchor.frames ?? [];
    let within: Document = document;
    for (const [i, selector] of frames.entries()) {
      let found: Element | null = null;
      try {
        found = within.querySelector(selector);
      } catch {
        return null;
      }
      if (!isFrame(found)) {
        return null;
      }
      const doc = frameDocument(found);
      if (doc) {
        within = doc;
        continue;
      }
      const { frames: _frames, ...rest } = innerOf(anchor);
      const deeper = frames.slice(i + 1);
      return {
        frame: found,
        inner: deeper.length > 0 ? { ...rest, frames: deeper } : rest,
      };
    }
    return null;
  };

  const read = (el: Element): StandIn | null => {
    const held = standIns.get(el);
    const remote = held?.entry.remote;
    if (!(held && remote && held.entry.el === el)) {
      return null;
    }
    const { bridge, entry } = held;
    return {
      frame: bridge.frame,
      remote,
      chain: entry.chain.flatMap((key) => {
        const one = bridge.entries.get(key)?.el;
        return one?.isConnected ? [one] : [];
      }),
    };
  };

  return {
    bridged: (el): el is FrameElement =>
      isFrame(el) && !frameDocument(el) && bridges.has(el),
    at: (frame, x, y) => {
      const bridge = bridges.get(frame);
      if (!bridge) {
        return Promise.resolve(frame);
      }
      laid(bridge);
      const box = contentBox(frame);
      seq += 1;
      const mine = seq;
      if (bridge.asking.size >= ASKING_MOST) {
        const [oldest] = bridge.asking;
        if (oldest) {
          bridge.asking.delete(oldest[0]);
          oldest[1](null);
        }
      }
      post(bridge, {
        type: AT,
        seq: mine,
        x: (x - box.x) / box.sx,
        y: (y - box.y) / box.sy,
      });
      return new Promise((resolve) => bridge.asking.set(mine, resolve));
    },
    find: (anchor) => {
      const at = split(anchor);
      if (!at) {
        return null;
      }
      const bridge = bridges.get(at.frame);
      if (!bridge) {
        return { state: "waiting" };
      }
      const key = keyOf(at.inner);
      const had = bridge.entries.has(key);
      const entry = entryOf(bridge, key, at.inner);
      entry.pinned = true;
      if (!had) {
        want(bridge, key);
      }
      if (entry.state === "found" && entry.el && entry.remote) {
        laid(bridge);
        return {
          state: "found",
          by: entry.remote.by ?? "selector",
          el: entry.el,
        };
      }
      return entry.state === "gone" ? { state: "gone" } : { state: "waiting" };
    },
    fit: () => {
      for (const [frame, bridge] of bridges) {
        if (!laid(bridge)) {
          dropDrawing(bridge);
          bridges.delete(frame);
        }
      }
    },
    read,
    picture: (el, box, failed) => {
      const held = standIns.get(el);
      const remote = held?.entry.remote;
      if (!(held && remote)) {
        return Promise.resolve(null);
      }
      const { bridge } = held;
      // The box as the embed's viewport has it: from the stand-in, which
      // stands where the embed last said its element does.
      const r = rectOf(el);
      const sx = remote.box.w > 0 && r.width > 0 ? r.width / remote.box.w : 1;
      const sy = remote.box.h > 0 && r.height > 0 ? r.height / remote.box.h : 1;
      seq += 1;
      const mine = seq;
      failures.set(mine, failed);
      post(bridge, {
        type: PICTURE,
        seq: mine,
        box: {
          x: remote.box.x + (box.x - (r.x + scrollX)) / sx,
          y: remote.box.y + (box.y - (r.y + scrollY)) / sy,
          w: box.w / sx,
          h: box.h / sy,
        },
      });
      return new Promise((resolve) => bridge.drawing.set(mine, resolve));
    },
    anchorOf: (el) => {
      const held = read(el);
      if (!held) {
        return null;
      }
      const { frame, remote } = held;
      const artifact = frame.getAttribute(EMBED_ARTIFACT);
      const r = rectOf(el);
      return {
        ...remote.anchor,
        frames: [
          ...[...framesOf(frame), frame].map(deps.selectorOf),
          ...(remote.anchor.frames ?? []),
        ],
        ...(artifact ? { embed: { artifact } } : {}),
        box: {
          x: Math.round(r.x + scrollX),
          y: Math.round(r.y + scrollY),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      };
    },
    describe: (el) => {
      const held = read(el);
      if (!held) {
        return null;
      }
      const r = rectOf(el);
      return {
        ...held.remote.element,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        page: { x: r.x + scrollX, y: r.y + scrollY },
      };
    },
  };
}
