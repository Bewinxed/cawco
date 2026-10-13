/// <reference lib="dom" />

import {
  boxOf,
  CANVAS_LIMITS,
  type CanvasAuthor,
  type CanvasRequestResult,
} from "@cawco/core/canvas";
/**
 * The canvas's scene on its doc (Projects spec §5.10, D23–D25): Excalidraw
 * bound to the artifact's doc by y-excalidraw, the agent's writes converted
 * here, and the picture drawn for the agent.
 *
 * Two docs of the page's one Yjs (the overlay's, canvas-host/yjs.ts):
 *
 * - `live`, the overlay's doc itself, synced with the hub: the agent's
 *   requests are claimed and answered here, and converted elements written
 *   here;
 * - `scene`, what Excalidraw is bound to: it takes what `live` hears only
 *   while no pointer is down, so nothing moves under a hand and a change
 *   that lands mid-stroke waits for the pen to lift (DESIGN.md, The agent's
 *   turn on the canvas). The scene's own changes go out at once.
 *
 * y-excalidraw takes a changed remote element as it is, with no version
 * check and no regard for what is being edited here, so the binding is
 * given Excalidraw with its `updateScene` guarded by Excalidraw's own
 * reconcile rule: an element being written, resized or drawn here is kept,
 * and so is one whose version here is higher.
 */
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  getSceneVersion,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { ExcalidrawBinding } from "y-excalidraw";
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  type Transaction,
  type Array as YArray,
  type YEvent,
  Map as YMap,
} from "yjs";
import type { ArtifactHold } from "../preview-overlay/artifact";

/** With `CAWCO_PROBE_HOOKS=1` at build (core canvas-host.ts), the page shows the probe what it binds. */
declare const __CAWCO_PROBE_HOOKS__: boolean;

/** Origins of the page's own transactions. */
const LIVE = "live";
const SCENE = "scene";
const AGENT = "agent";
const CLAIM = "claim";
const STAMP = "stamp";
const PEN = "pen";

/** How long after the person's last input a change is theirs. Our call. */
const INPUT_MS = 1000;
/** How long a run of the person's changes waits before it is stamped theirs. Our call. */
const STAMP_MS = 250;
/** The quiet before the picture is drawn: the brief's 2 s. */
const PICTURE_MS = 2000;
/** The picture's margin, the brief's number. */
const PICTURE_PADDING = 16;
/** The room left between the drawing and Mermaid added under it. Our call: `--space-8` × 2. */
const BELOW_GAP = 64;
/** Excalidraw's default ink, which ours replaces on what the agent draws. */
const EXCALIDRAW_INK = "#1e1e1e";

type Entry = YMap<unknown>;

/** The colours the canvas draws with, each a token resolved to its hex by day (Excalidraw's dark theme inverts them). */
export interface CanvasInk {
  /** `surface-raised`: the picture's ground. */
  ground: string;
  /** `ink-strong`: every stroke. */
  stroke: string;
}

/** A token's value by day, as a hex Excalidraw stores. */
export const tokenHex = (token: string): string => {
  const probe = document.createElement("span");
  probe.style.cssText = `color-scheme: light; color: var(${token}); display: none`;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  const paint = document.createElement("canvas").getContext("2d");
  if (!paint) {
    return color;
  }
  paint.fillStyle = color;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
};

const CUBIC_BEZIER = /cubic-bezier\(([^)]+)\)/;

/** A cubic-bezier curve token (`--ease-out`) as a function of time. */
const curve = (token: string): ((t: number) => number) => {
  const found = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .match(CUBIC_BEZIER);
  const [x1, y1, x2, y2] = (found?.[1] ?? "0, 0, 1, 1").split(",").map(Number);
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return at(y1, y2, (lo + hi) / 2);
  };
};

/** A token's duration in ms (`--dur-menu` is 140ms). */
const duration = (token: string): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(token)
  ) || 0;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * The `n`th of a run of order keys after `last`: `last` and three base-62
 * digits, then `V`, so each sorts after `last` and after the one before it,
 * and stays a valid fractional index (it never ends in `0`).
 */
const keyAfter = (last: string | null, n: number): string => {
  let digits = "";
  let rest = n;
  for (let i = 0; i < 3; i += 1) {
    digits = BASE62[rest % 62] + digits;
    rest = Math.floor(rest / 62);
  }
  return `${last ?? "a0"}${digits}V`;
};

const highest = (keys: (string | null | undefined)[]): string | null =>
  keys.reduce<string | null>(
    (top, key) => (key && (top === null || key > top) ? key : top),
    null
  );

const nonce = () => Math.floor(Math.random() * 2 ** 31);

/** The maps an elements event added or changed. */
const mapsOf = (
  elements: YArray<Entry>,
  events: YEvent<YArray<Entry> | Entry>[]
): Entry[] =>
  events.flatMap((event) =>
    event.target === elements
      ? [...event.changes.added].flatMap(
          (item) => item.content.getContent() as Entry[]
        )
      : [event.target as Entry]
  );

/** The agent's elements an update brought: the ones it changed first, then the ones it added, in the order of its write. */
const agentArrivals = (
  elements: YArray<Entry>,
  events: YEvent<YArray<Entry> | Entry>[]
): string[] => {
  const changed: string[] = [];
  const added: string[] = [];
  for (const event of events) {
    const fresh = event.target === elements;
    for (const map of mapsOf(elements, [event])) {
      const el = map.get("el") as ExcalidrawElement | undefined;
      if (el && map.get("by") === "agent") {
        (fresh ? added : changed).push(el.id);
      }
    }
  }
  return [...changed, ...added];
};

export interface BoundScene {
  destroy: () => void;
  picture: () => Promise<void>;
}

/** Binds Excalidraw (`api`) to the artifact's doc (`hold`), converts the agent's writes, and draws the picture. */
export function bindScene(
  api: ExcalidrawImperativeAPI,
  hold: () => ArtifactHold,
  options: { ink: CanvasInk; dark: () => boolean; reduced: () => boolean }
): BoundScene {
  const stops: (() => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (run: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
    return timer;
  };

  // live ⇄ scene: the scene hears live only while no pointer is down.
  const live = hold().doc;
  const scene = new Doc();
  applyUpdate(scene, encodeStateAsUpdate(live), LIVE);
  const pressed = new Set<number>();
  const waiting: Uint8Array[] = [];
  const heard = (update: Uint8Array, origin: unknown) => {
    if (origin === SCENE) {
      return;
    }
    if (pressed.size > 0) {
      waiting.push(update);
    } else {
      applyUpdate(scene, update, LIVE);
    }
  };
  live.on("update", heard);
  stops.push(() => live.off("update", heard));
  scene.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== LIVE) {
      applyUpdate(live, update, SCENE);
    }
  });
  if (__CAWCO_PROBE_HOOKS__) {
    (window as unknown as { cawcoCanvasProbe: object }).cawcoCanvasProbe = {
      live,
      scene,
      elements: () => api.getSceneElements(),
    };
  }
  /** What waited for the pointers: after Excalidraw has ended the gesture on the same pointerup. */
  const release = () =>
    later(() => {
      if (pressed.size > 0) {
        return;
      }
      for (const update of waiting.splice(0)) {
        applyUpdate(scene, update, LIVE);
      }
    }, 0);

  let lastInput = 0;
  const input = () => {
    lastInput = performance.now();
  };
  const listeners: [string, (event: Event) => void][] = [
    [
      "pointerdown",
      (event) => {
        pressed.add((event as PointerEvent).pointerId);
        input();
      },
    ],
    [
      "pointermove",
      (event) => {
        if ((event as PointerEvent).buttons > 0) {
          input();
        }
      },
    ],
    [
      "pointerup",
      (event) => {
        pressed.delete((event as PointerEvent).pointerId);
        input();
        release();
      },
    ],
    [
      "pointercancel",
      (event) => {
        pressed.delete((event as PointerEvent).pointerId);
        release();
      },
    ],
    ["keydown", input],
    ["paste", input],
    ["drop", input],
    ["input", input],
  ];
  for (const [type, listener] of listeners) {
    window.addEventListener(type, listener, true);
    stops.push(() => window.removeEventListener(type, listener, true));
  }

  /** Excalidraw's reconcile rule (`shouldDiscardRemoteElement`), kept here for every remote element. */
  const guarded: ExcalidrawImperativeAPI = {
    ...api,
    updateScene: (data) => {
      if (!data.elements) {
        api.updateScene(data);
        return;
      }
      const state = api.getAppState();
      const editing = new Set(
        [
          state.editingTextElement?.id,
          state.resizingElement?.id,
          state.newElement?.id,
        ].filter((id): id is string => !!id)
      );
      const local = new Map(
        api.getSceneElementsIncludingDeleted().map((el) => [el.id, el])
      );
      const kept = data.elements.map((remote) => {
        const mine = local.get(remote.id);
        return mine &&
          (editing.has(remote.id) ||
            mine.version > remote.version ||
            (mine.version === remote.version &&
              mine.versionNonce < remote.versionNonce))
          ? mine
          : remote;
      });
      for (const id of editing) {
        const mine = local.get(id);
        if (mine && !kept.some((el) => el.id === id)) {
          kept.push(mine);
        }
      }
      api.updateScene({
        ...data,
        elements: kept,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
  };

  // The hub serves no awareness (awareness cursors are out of scope): the
  // binding gets one that hears no one.
  const awareness = {
    clientID: scene.clientID,
    getStates: () => new Map(),
    on: () => undefined,
    off: () => undefined,
    setLocalStateField: () => undefined,
  } as unknown as ConstructorParameters<typeof ExcalidrawBinding>[3];
  const sceneElements = scene.getArray<Entry>("elements");
  const binding = new ExcalidrawBinding(
    sceneElements,
    scene.getMap("files"),
    guarded,
    awareness
  );
  stops.push(() => binding.destroy());

  // The person's changes are theirs: `by: "person"` and `at`, beside `el`.
  const unstamped = new Set<Entry>();
  let stampTimer: ReturnType<typeof setTimeout> | undefined;
  const stamp = () => {
    const at = new Date().toISOString();
    scene.transact(() => {
      for (const map of unstamped) {
        if (map.doc) {
          map.set("by", "person" satisfies CanvasAuthor);
          map.set("at", at);
        }
      }
    }, STAMP);
    unstamped.clear();
  };

  // The agent's elements arrive as a transcript row does: each fades up
  // where it stands, the changed ones first (DESIGN.md).
  const ease = curve("--ease-out");
  const fadeIn = (ids: string[]) => {
    const fade = duration("--dur-menu");
    const step = duration("--dur-stagger") / Math.max(1, ids.length);
    const start = performance.now();
    const order = new Map(ids.map((id, i) => [id, i]));
    const versions = new Map<string, { version: number; opacity: number }>();
    for (const el of api.getSceneElementsIncludingDeleted()) {
      if (order.has(el.id)) {
        versions.set(el.id, { version: el.version, opacity: el.opacity });
      }
    }
    const frame = (now: number) => {
      let running = false;
      const elements = api.getSceneElementsIncludingDeleted().map((el) => {
        const was = versions.get(el.id);
        if (!was || el.version !== was.version) {
          return el;
        }
        const t = Math.min(
          1,
          Math.max(0, (now - start - (order.get(el.id) ?? 0) * step) / fade)
        );
        running ||= t < 1;
        const opacity = was.opacity * ease(t);
        return el.opacity === opacity ? el : { ...el, opacity };
      });
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      if (running) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  };

  const observer = (
    events: YEvent<YArray<Entry> | Entry>[],
    transaction: Transaction
  ) => {
    if (
      transaction.origin === binding &&
      performance.now() - lastInput < INPUT_MS
    ) {
      for (const map of mapsOf(sceneElements, events)) {
        unstamped.add(map);
      }
      clearTimeout(stampTimer);
      stampTimer = later(stamp, STAMP_MS);
    }
    if (transaction.origin === LIVE && !options.reduced()) {
      const arrived = agentArrivals(sceneElements, events);
      if (arrived.length > 0) {
        fadeIn(arrived);
      }
    }
    // A stamp names who drew; it draws nothing.
    if (transaction.origin !== STAMP) {
      schedulePicture();
    }
  };
  sceneElements.observeDeep(observer);
  stops.push(() => sceneElements.unobserveDeep(observer));

  // Pen mode, once a pen touched the canvas, is the canvas's (its meta).
  const meta = scene.getMap("meta");
  stops.push(
    api.onChange((_elements, state) => {
      if (
        state.penMode !== (meta.get("penMode") ?? false) ||
        state.penDetected !== (meta.get("penDetected") ?? false)
      ) {
        scene.transact(() => {
          meta.set("penMode", state.penMode);
          meta.set("penDetected", state.penDetected);
        }, PEN);
      }
    })
  );

  // The picture: drawn after 2 s with no change, posted beside the doc.
  let pictureTimer: ReturnType<typeof setTimeout> | undefined;
  let drawn = -1;
  const drawPicture = async () => {
    const { sync } = hold();
    if (!sync) {
      schedulePicture();
      return;
    }
    const elements = api.getSceneElements();
    const version = getSceneVersion(elements);
    if (version === drawn) {
      return;
    }
    drawn = version;
    const body =
      elements.length === 0
        ? null
        : await exportToBlob({
            elements,
            files: api.getFiles(),
            mimeType: "image/png",
            exportPadding: PICTURE_PADDING,
            appState: {
              exportBackground: true,
              exportWithDarkMode: options.dark(),
              viewBackgroundColor: options.ink.ground,
            },
            getDimensions: (width: number, height: number) => {
              const scale = Math.min(
                CANVAS_LIMITS.pictureScale,
                Math.sqrt(CANVAS_LIMITS.picturePixels / (width * height))
              );
              return {
                width: Math.floor(width * scale),
                height: Math.floor(height * scale),
                scale,
              };
            },
          });
    const posted = await fetch(`${sync}/picture`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body,
    }).catch(() => null);
    if (!posted?.ok) {
      // Not kept: the next quiet draws it again.
      drawn = -1;
    }
  };
  function schedulePicture() {
    clearTimeout(pictureTimer);
    pictureTimer = later(() => {
      drawPicture().catch(() => {
        drawn = -1;
      });
    }, PICTURE_MS);
  }
  schedulePicture();

  stops.push(serveRequests(live, options.ink));

  return {
    /** The picture drawn and posted now, for a send that carries it. */
    picture: async () => {
      clearTimeout(pictureTimer);
      await drawPicture();
    },
    destroy: () => {
      for (const stop of stops.splice(0)) {
        stop();
      }
      for (const timer of timers) {
        clearTimeout(timer);
      }
      // `live` is the overlay's: it keeps syncing after this binding goes.
      scene.destroy();
    },
  };
}

/*
 * The agent's requests (hub artifacts/canvas.ts): claim each one, and
 * convert those the hub says this page holds.
 */

/** A skeleton as the agent sent it. */
type Skeleton = { id?: string; type: string } & Record<string, unknown>;

/** The live elements by id, with their maps. */
const entriesOf = (live: Doc) =>
  new Map(
    live
      .getArray<Entry>("elements")
      .toArray()
      .map((map) => [(map.get("el") as ExcalidrawElement).id, map])
  );

/**
 * A skeleton replacing an element fills what it leaves out from that
 * element: its box, its label, its text, an arrow's ends. So "move B" is
 * B's id, type and new x.
 */
const filled = (
  skeleton: Skeleton,
  old: ExcalidrawElement,
  entries: Map<string, Entry>
): Skeleton => {
  const out: Skeleton = { ...skeleton };
  for (const key of ["x", "y", "width", "height"] as const) {
    if (out[key] === undefined) {
      out[key] = old[key];
    }
  }
  if (old.type === "text" && out.text === undefined && "text" in old) {
    out.text = old.text;
  }
  const label = old.boundElements?.find((bound) => bound.type === "text");
  const labelEl = label
    ? (entries.get(label.id)?.get("el") as { text?: string } | undefined)
    : undefined;
  if (out.label === undefined && labelEl?.text !== undefined) {
    out.label = { text: labelEl.text };
  }
  if (old.type === "arrow" && "startBinding" in old) {
    if (out.start === undefined && old.startBinding) {
      out.start = { id: old.startBinding.elementId };
    }
    if (out.end === undefined && old.endBinding) {
      out.end = { id: old.endBinding.elementId };
    }
  }
  return out;
};

/** Writes converted elements into live as the agent's: replaced in place by id, else added after the last. */
const write = (
  live: Doc,
  elements: readonly OrderedExcalidrawElement[],
  bound: readonly OrderedExcalidrawElement[],
  ink: CanvasInk
) => {
  const array = live.getArray<Entry>("elements");
  const at = new Date().toISOString();
  live.transact(() => {
    dropOldLabels(live, elements);
    const entries = entriesOf(live);
    const all = array.toArray();
    const last = {
      pos: highest(all.map((map) => map.get("pos") as string)),
      index: highest(
        all.map((map) => (map.get("el") as ExcalidrawElement).index)
      ),
    };
    let added = 0;
    for (const converted of elements) {
      const el =
        converted.strokeColor === EXCALIDRAW_INK
          ? { ...converted, strokeColor: ink.stroke }
          : converted;
      const map = entries.get(el.id);
      if (map) {
        replaceElement(map, el, at);
      } else {
        array.push([
          new YMap<unknown>(
            Object.entries({
              el: { ...el, index: keyAfter(last.index, added) },
              pos: keyAfter(last.pos, added),
              by: "agent" satisfies CanvasAuthor,
              at,
            })
          ),
        ]);
        added += 1;
      }
    }
    for (const el of bound) {
      gainArrows(entries.get(el.id), el);
    }
  }, AGENT);
};

/** A replaced container's old label goes; its new one is written with it. */
const dropOldLabels = (
  live: Doc,
  elements: readonly OrderedExcalidrawElement[]
) => {
  const array = live.getArray<Entry>("elements");
  const entries = entriesOf(live);
  const ids = new Set(elements.map((el) => el.id));
  const replaced = new Set(
    elements.filter((el) => entries.has(el.id)).map((el) => el.id)
  );
  for (let index = array.length - 1; index >= 0; index -= 1) {
    const el = array.get(index).get("el") as ExcalidrawElement;
    const container = "containerId" in el ? el.containerId : null;
    if (container && replaced.has(container) && !ids.has(el.id)) {
      array.delete(index, 1);
    }
  }
};

/** The agent's element in place of the one of its id: its order kept, the arrows bound to it kept, a version past the old. */
const replaceElement = (
  map: Entry,
  el: OrderedExcalidrawElement,
  at: string
) => {
  const old = map.get("el") as ExcalidrawElement;
  const arrows = (old.boundElements ?? []).filter(
    (one) =>
      one.type === "arrow" &&
      !(el.boundElements ?? []).some((mine) => mine.id === one.id)
  );
  map.set("el", {
    ...el,
    index: old.index,
    boundElements: [...(el.boundElements ?? []), ...arrows],
    version: Math.max(old.version + 1, el.version),
    versionNonce: nonce(),
  });
  map.set("by", "agent" satisfies CanvasAuthor);
  map.set("at", at);
};

/** An element an arrow binds to that the agent did not send: it gains the arrow. */
const gainArrows = (map: Entry | undefined, el: OrderedExcalidrawElement) => {
  const old = map?.get("el") as ExcalidrawElement | undefined;
  if (!(map && old)) {
    return;
  }
  const known = new Set((old.boundElements ?? []).map((one) => one.id));
  const gained = (el.boundElements ?? []).filter((one) => !known.has(one.id));
  if (gained.length > 0) {
    map.set("el", {
      ...old,
      boundElements: [...(old.boundElements ?? []), ...gained],
      version: old.version + 1,
      versionNonce: nonce(),
      updated: Date.now(),
    });
  }
};

/** Skeleton elements: added, or replacing the element of the id they carry. */
const fromSkeletons = (
  live: Doc,
  skeletons: Skeleton[],
  ink: CanvasInk
): string[] => {
  const entries = entriesOf(live);
  const sent = skeletons.map((skeleton) => {
    const map = skeleton.id ? entries.get(skeleton.id) : undefined;
    return map
      ? filled(skeleton, map.get("el") as ExcalidrawElement, entries)
      : skeleton;
  });
  // An arrow may bind to an element already drawn: it converts beside them.
  const sentIds = new Set(sent.map((one) => one.id));
  const context = new Set<string>();
  for (const one of sent) {
    for (const end of [one.start, one.end] as ({ id?: string } | undefined)[]) {
      if (end?.id && !sentIds.has(end.id) && entries.has(end.id)) {
        context.add(end.id);
      }
    }
  }
  const converted = convertToExcalidrawElements(
    [
      ...[...context].map((id) => entries.get(id)?.get("el")),
      ...sent,
    ] as ExcalidrawElementSkeleton[],
    { regenerateIds: false }
  );
  const drawn = converted.filter((el) => !context.has(el.id));
  write(
    live,
    drawn,
    converted.filter((el) => context.has(el.id)),
    ink
  );
  return drawn.map((el) => el.id);
};

/** Mermaid, drawn below what the canvas holds. */
const fromMermaid = async (
  live: Doc,
  text: string,
  ink: CanvasInk
): Promise<string[]> => {
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const parsed = await parseMermaidToExcalidraw(text);
  const converted = convertToExcalidrawElements(
    parsed.elements as ExcalidrawElementSkeleton[]
  );
  const existing = [...entriesOf(live).values()]
    .map((map) => map.get("el") as ExcalidrawElement)
    .filter((el) => !el.isDeleted)
    .map((el) => boxOf(el));
  const boxes = converted.map((el) => boxOf(el));
  let dx = 0;
  let dy = 0;
  if (existing.length > 0 && boxes.length > 0) {
    const left = Math.min(...existing.map((box) => box.x));
    const bottom = Math.max(...existing.map((box) => box.y + box.height));
    dx = left - Math.min(...boxes.map((box) => box.x));
    dy = bottom + BELOW_GAP - Math.min(...boxes.map((box) => box.y));
  }
  const placed = converted.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }));
  const files = live.getMap("files");
  live.transact(() => {
    for (const [id, file] of Object.entries(parsed.files ?? {})) {
      files.set(id, file as BinaryFileData);
    }
  }, AGENT);
  write(live, placed, [], ink);
  return placed.map((el) => el.id);
};

/** Claims every request, converts those this page holds; stops serving when called. */
const serveRequests = (live: Doc, ink: CanvasInk): (() => void) => {
  const requests = live.getMap<Entry>("requests");
  const mine = `claim-${live.clientID}`;
  const working = new Set<string>();
  const convert = async (request: Entry): Promise<CanvasRequestResult> => {
    const payload = request.get("payload") as {
      elements?: Skeleton[];
      mermaid?: string;
    };
    try {
      if (request.get("kind") === "mermaid") {
        return { ids: await fromMermaid(live, payload.mermaid ?? "", ink) };
      }
      return { ids: fromSkeletons(live, payload.elements ?? [], ink) };
    } catch (error) {
      return {
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          300
        ),
      };
    }
  };
  const serve = () => {
    for (const [id, request] of requests.entries()) {
      if (!(request instanceof YMap) || request.get("result") !== undefined) {
        continue;
      }
      const holder = request.get("holder");
      if (holder === undefined) {
        if (request.get(mine) === undefined) {
          live.transact(
            () => request.set(mine, new Date().toISOString()),
            CLAIM
          );
        }
      } else if (holder === String(live.clientID) && !working.has(id)) {
        working.add(id);
        convert(request).then((result) => {
          working.delete(id);
          if (request.doc) {
            live.transact(() => request.set("result", result), AGENT);
          }
        });
      }
    }
  };
  const heard = () => queueMicrotask(serve);
  requests.observeDeep(heard);
  serve();
  return () => requests.unobserveDeep(heard);
};
