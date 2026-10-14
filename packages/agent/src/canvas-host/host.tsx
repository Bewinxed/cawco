/// <reference lib="dom" />

/**
 * A canvas artifact's host page (Projects spec §5.10, D24): Excalidraw with
 * its own chrome hidden, our tool rail over it, the empty state when it
 * holds nothing. The hub serves it at the canvas's root with the overlay in
 * it (core canvas-host.ts); the overlay joins the artifact's doc as it does
 * for any page, and hands it over through `window.cawcoArtifact`
 * (artifact.ts), which scene.ts binds Excalidraw to.
 */
import "@excalidraw/excalidraw/index.css";
import "./canvas.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  type AnimationEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import type { Map as YMap } from "yjs";
import tokensCss from "../../../hub/skills/decision-page/kit/tokens.css" with {
  type: "text",
};
import type { ArtifactGlobal, ArtifactHold } from "../preview-overlay/artifact";
import {
  heardFromHost,
  toHost as postToHost,
} from "../preview-overlay/host-origin";
import { Icon } from "./icons";
import { guardImages } from "./images";
import { tokenMs } from "./motion";
import { Rail } from "./rail";
import { bindScene, type CanvasInk, fitScene, tokenHex } from "./scene";

declare global {
  interface Window {
    cawcoArtifact: ArtifactGlobal;
  }
}

/** Excalidraw's grid step, which ours draws in `code-bg`. */
const GRID = 20;

/** Every canvas action of Excalidraw's own off: the rail is ours. Images are on: pasted, dropped or picked (images.ts). */
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
  tools: { image: true },
} as const;

// The kit's tokens as written: Bun's CSS bundler lowers `light-dark()` into
// `prefers-color-scheme` rules (the OS's scheme), so they stay out of it and
// follow the host's `color-scheme` (`scheme` below).
const tokenSheet = document.createElement("style");
tokenSheet.textContent = tokensCss;
document.head.prepend(tokenSheet);

const media = (query: string) => {
  const list = matchMedia(query);
  return {
    now: () => list.matches,
    subscribe: (changed: () => void) => {
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
  };
};
const lessMotion = media("(prefers-reduced-motion: reduce)");

/**
 * The scheme the canvas draws in: the host's (the dashboard's theme, which
 * its `cawco:hello` and `cawco:theme` carry), never the OS's. Light until
 * the host says.
 */
let scheme: "light" | "dark" = "light";
const schemeListeners = new Set<() => void>();
const takeScheme = (said: unknown) => {
  if ((said !== "light" && said !== "dark") || said === scheme) {
    return;
  }
  scheme = said;
  document.documentElement.style.colorScheme = said;
  for (const listener of schemeListeners) {
    listener();
  }
};
document.documentElement.style.colorScheme = scheme;
window.addEventListener("message", (event) => {
  if (
    heardFromHost(event) &&
    (event.data?.type === "cawco:hello" || event.data?.type === "cawco:theme")
  ) {
    takeScheme(event.data.theme);
  }
});
const schemeStore = {
  subscribe: (changed: () => void) => {
    schemeListeners.add(changed);
    return () => schemeListeners.delete(changed);
  },
  now: () => scheme,
};

/** The doc as the overlay holds it now: the first hold, and every one after. */
let current: ArtifactHold | null = null;
const holdListeners = new Set<() => void>();
window.cawcoArtifact.subscribe((hold) => {
  current = hold;
  for (const listener of holdListeners) {
    listener();
  }
});
const holdStore = {
  subscribe: (changed: () => void) => {
    holdListeners.add(changed);
    return () => holdListeners.delete(changed);
  },
  now: () => current,
};

/** A word to the dashboard that hosts the canvas (the rail's Dock, Undock, Done and Remove post their own). */
export const toHost = (what: "dock" | "done" | "pictured") =>
  postToHost({ type: `cawco:${what}` });

// What of the canvas's edges the host's chrome takes (`inset`) the overlay
// takes for the page (preview-overlay page.ts `takeInset`): it hears the
// host's hello, which can come before this module runs.

/**
 * Where the host stands the canvas (`cawco:place`): docked in the artifact
 * panel, or in the composer. The rail's Dock reads Undock while docked.
 */
let placedDocked = false;
const placeListeners = new Set<() => void>();
window.addEventListener("message", (event) => {
  if (heardFromHost(event) && event.data?.type === "cawco:place") {
    placedDocked = event.data.docked === true;
    for (const listener of placeListeners) {
      listener();
    }
  }
});
const placeStore = {
  subscribe: (changed: () => void) => {
    placeListeners.add(changed);
    return () => placeListeners.delete(changed);
  },
  now: () => placedDocked,
};

/*
 * The first press acts. In the panel the page is a frame without the focus:
 * a press there hands the window the focus as its default action, after
 * Excalidraw has begun the drag, and that drag then moved nothing (the
 * frame heard pointerdown, focus, focus, pointermove, pointerup). The
 * window takes the focus first, here, before Excalidraw's own listener, and
 * on a press only: the pointer passing over leaves the keyboard where it is.
 */
window.addEventListener(
  "pointerdown",
  () => {
    if (!document.hasFocus()) {
      window.focus();
    }
  },
  true
);

// ⌘⇧D (Ctrl+Shift+D) with the canvas focused folds it, as it does from the field.
window.addEventListener("keydown", (event) => {
  if (
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "d"
  ) {
    event.preventDefault();
    toHost("done");
  }
});

/** The doc's order, by its order keys (y-excalidraw's `pos`), compared code unit by code unit. */
const byPos = (a: { pos: string }, b: { pos: string }) => {
  if (a.pos === b.pos) {
    return 0;
  }
  return a.pos < b.pos ? -1 : 1;
};

/**
 * What the canvas holds before Excalidraw binds to it: its elements in
 * their order and its files (Excalidraw's first scene), its pen mode, and
 * whether it is empty.
 */
const firstLook = (hold: ArtifactHold | null) => {
  const meta = hold?.doc.getMap("meta");
  const elements = (
    hold?.doc.getArray<YMap<unknown>>("elements").toArray() ?? []
  )
    .map((map) => ({
      el: map.get("el") as ExcalidrawElement,
      pos: map.get("pos") as string,
    }))
    .sort(byPos)
    .map((entry) => entry.el);
  return {
    elements,
    files: (hold?.doc.getMap("files").toJSON() ?? {}) as BinaryFiles,
    empty: elements.every((el) => el.isDeleted),
    penMode: meta?.get("penMode") === true,
    penDetected: meta?.get("penDetected") === true,
  };
};

/**
 * Resolves once Excalidraw has loaded its first scene (`initialData`): it
 * loads it after handing out its API, and a binding made before would hear
 * the empty scene before it as the person's change, and delete every
 * element of the doc (y-excalidraw's onChange diffs the scene against the
 * doc it bound).
 */
const loaded = (api: ExcalidrawImperativeAPI): Promise<void> =>
  new Promise((done) => {
    if (!api.getAppState().isLoading) {
      done();
      return;
    }
    const stop = api.onChange((_elements, state) => {
      if (!state.isLoading) {
        stop();
        done();
      }
    });
  });

function Empty({ onDraw }: { onDraw: () => void }) {
  return (
    <div className="canvas-empty">
      <div className="canvas-empty-body">
        <span className="canvas-empty-mark">
          <Icon name="pen" size={20} />
        </span>
        <p className="canvas-empty-title">Nothing drawn yet</p>
        <p className="canvas-empty-line">
          Draw with the pencil, or ask the agent to draw.
        </p>
        <button className="canvas-empty-action" onClick={onDraw} type="button">
          Draw
        </button>
      </div>
    </div>
  );
}

/**
 * A file the canvas wouldn't take, said over its grid in the error formula:
 * it fades in, stands for `--dur-hold`, and fades out (canvas.css); a new
 * refusal replaces it.
 */
function Refusal({ refusal, gone }: { refusal: Said; gone: () => void }) {
  const ended = useCallback(
    (event: AnimationEvent<HTMLParagraphElement>) => {
      if (event.animationName === "canvas-refusal-out") {
        gone();
      }
    },
    [gone]
  );
  return (
    <p
      className="canvas-refusal"
      key={refusal.at}
      onAnimationEnd={ended}
      role="alert"
    >
      {refusal.text}
    </p>
  );
}

interface Said {
  at: number;
  text: string;
}

/**
 * The canvas can't reach the hub (artifact.ts `refused`): said over its
 * grid in the error formula while it can't, and the pen draws nothing
 * meanwhile, so nothing is drawn that the agent would never see.
 */
function Unlinked({ why }: { why: string }) {
  return (
    <div className="canvas-unlinked" role="alert">
      <p className="canvas-unlinked-line">
        The canvas isn't connected to the hub, so what you draw wouldn't reach
        the agent. {why}. Open it again once the connection is back.
      </p>
    </div>
  );
}

/** Why the canvas can't reach the hub, as the formula's middle clause. */
const unlinkedBecause = (hold: ArtifactHold | null): string =>
  hold?.link.error ?? `It is still connecting to ${location.host}`;

/**
 * Whether the refusal line shows over the grid. The pen is off whenever the
 * canvas is refused; the line waits. Before the doc first syncs it shows
 * once the refusal has stood `--dur-wait-grace` (DESIGN.md, The Real Wait
 * Rule: no feedback is needed under 1 s), counted from the host mounting
 * or its doc being replaced, so a good link that syncs in tens of ms shows
 * nothing. A
 * lost link is refused once it has stood its 5 s (artifact.ts), and the
 * line shows then.
 */
function useUnlinkedShown(hold: ArtifactHold | null): boolean {
  const refused = hold?.refused ?? true;
  const hasSynced = hold?.hasSynced ?? false;
  const generation = hold?.generation ?? -1;
  /** The doc whose first connect has stood the grace unsynced. */
  const [graced, setGraced] = useState<number | null>(null);
  const waiting = refused && !hasSynced;
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setTimeout(
      () => setGraced(generation),
      tokenMs("--dur-wait-grace")
    );
    return () => clearTimeout(timer);
  }, [waiting, generation]);
  return refused && (hasSynced || graced === generation);
}

function Host() {
  const hold = useSyncExternalStore(holdStore.subscribe, holdStore.now);
  const [refusal, setRefusal] = useState<Said | null>(null);
  const refuse = useCallback(
    (text: string) => setRefusal({ text, at: performance.now() }),
    []
  );
  const cleared = useCallback(() => setRefusal(null), []);
  const theme = useSyncExternalStore(schemeStore.subscribe, schemeStore.now);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // Pasted and dropped files, once Excalidraw has handed out its API.
  useEffect(() => (api ? guardImages(api, refuse) : undefined), [api, refuse]);
  const first = useMemo(() => firstLook(holdStore.now()), []);
  const [empty, setEmpty] = useState(first.empty);
  const [tool, setTool] = useState("selection");
  const surface = useRef<HTMLDivElement>(null);
  const ink = useMemo<CanvasInk>(
    () => ({
      stroke: tokenHex("--ink-strong"),
      ground: tokenHex("--surface-raised"),
    }),
    []
  );
  const generation = hold?.generation;
  const docked = useSyncExternalStore(placeStore.subscribe, placeStore.now);
  /** The drawing is fitted to the view once, when the canvas opens. */
  const fitted = useRef(false);
  useEffect(() => {
    if (!(api && generation !== undefined)) {
      return;
    }
    let bound: ReturnType<typeof bindScene> | null = null;
    let gone = false;
    // The host asks for the picture before it sends or folds the canvas.
    const asked = async (event: MessageEvent) => {
      if (!heardFromHost(event) || event.data?.type !== "cawco:picture") {
        return;
      }
      await bound?.picture().catch(() => undefined);
      toHost("pictured");
    };
    loaded(api).then(() => {
      if (gone) {
        return;
      }
      bound = bindScene(api, () => holdStore.now() as ArtifactHold, {
        ink,
        dark: () => schemeStore.now() === "dark",
      });
      if (fitted.current === false) {
        fitted.current = true;
        fitScene(api);
      }
      window.addEventListener("message", asked);
    });
    return () => {
      gone = true;
      window.removeEventListener("message", asked);
      bound?.destroy();
    };
  }, [api, generation, ink]);
  /*
   * The pencil's double-tap (`cawco:pencil-double-tap`, which the iOS app
   * posts into the page, or the dashboard relays) toggles the eraser: the
   * box of the tool the pen was on stays chosen and swaps its glyph for the
   * eraser's (DESIGN.md, Pen rules on the canvas), and a second double-tap
   * goes back to that tool. Any other way to a tool ends the swap.
   */
  const [swappedFrom, setSwappedFrom] = useState<string | null>(null);
  const swapped = useRef<string | null>(null);
  const endSwap = useCallback(() => {
    swapped.current = null;
    setSwappedFrom(null);
  }, []);
  useEffect(() => {
    if (!api) {
      return;
    }
    type Tool = Exclude<AppState["activeTool"]["type"], "custom">;
    let left: Tool = "freedraw";
    const tapped = (event: MessageEvent) => {
      // The app's host script posts on this window; the dashboard from its own origin.
      const fromHere =
        event.source === window && event.origin === location.origin;
      if (
        !(fromHere || heardFromHost(event)) ||
        event.data?.type !== "cawco:pencil-double-tap"
      ) {
        return;
      }
      const now = api.getAppState().activeTool.type;
      if (now === "eraser") {
        api.setActiveTool({ type: (swapped.current as Tool | null) ?? left });
        return;
      }
      left = now === "custom" ? left : now;
      swapped.current = left;
      setSwappedFrom(left);
      api.setActiveTool({ type: "eraser" });
    };
    window.addEventListener("message", tapped);
    return () => window.removeEventListener("message", tapped);
  }, [api]);
  const changed = useCallback(
    (elements: readonly ExcalidrawElement[], state: AppState) => {
      setEmpty(elements.every((el) => el.isDeleted));
      setTool(state.activeTool.type);
      if (state.activeTool.type !== "eraser" && swapped.current !== null) {
        endSwap();
      }
    },
    [endSwap]
  );
  // Our grid, in `code-bg`, moves with the scene under a clear canvas.
  const scrolled = useCallback(
    (scrollX: number, scrollY: number, zoom: { value: number }) => {
      const style = surface.current?.style;
      style?.setProperty("--grid", `${GRID * zoom.value}px`);
      style?.setProperty("--grid-x", `${scrollX * zoom.value}px`);
      style?.setProperty("--grid-y", `${scrollY * zoom.value}px`);
    },
    []
  );
  const initialData = useMemo(
    () => ({
      elements: first.elements,
      files: first.files,
      appState: {
        viewBackgroundColor: "transparent",
        currentItemStrokeColor: ink.stroke,
        currentItemBackgroundColor: "transparent",
        penMode: first.penMode,
        penDetected: first.penDetected,
      },
    }),
    [ink, first]
  );
  const draw = useCallback(
    () => api?.setActiveTool({ type: "freedraw" }),
    [api]
  );
  const unlinked = hold?.refused ?? true;
  const unlinkedShown = useUnlinkedShown(hold);
  return (
    <div
      className="canvas-host"
      data-docked={docked ? "" : undefined}
      ref={surface}
    >
      <Excalidraw
        detectScroll
        excalidrawAPI={setApi}
        gridModeEnabled={false}
        handleKeyboardGlobally={false}
        initialData={initialData}
        onChange={changed}
        onScrollChange={scrolled}
        theme={theme}
        UIOptions={UI_OPTIONS}
        viewModeEnabled={unlinked}
        zenModeEnabled={false}
      />
      {api ? (
        <Rail
          api={api}
          docked={docked}
          onPick={endSwap}
          onRefuse={refuse}
          reduced={lessMotion.now}
          swappedFrom={tool === "eraser" ? swappedFrom : null}
          tool={tool}
        />
      ) : null}
      {unlinkedShown ? <Unlinked why={unlinkedBecause(hold)} /> : null}
      {!unlinked && empty ? <Empty onDraw={draw} /> : null}
      {refusal ? <Refusal gone={cleared} refusal={refusal} /> : null}
    </div>
  );
}

const root = document.getElementById("canvas-root");
if (root) {
  createRoot(root).render(<Host />);
}
