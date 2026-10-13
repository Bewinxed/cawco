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
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { applyUpdate, Doc } from "yjs";
import type { ArtifactHold } from "../preview-overlay/artifact";
import { Icon } from "./icons";
import { Rail } from "./rail";
import { bindScene, type CanvasInk, tokenHex } from "./scene";

declare global {
  interface Window {
    cawcoArtifact: {
      subscribe: (holder: (hold: ArtifactHold) => void) => () => boolean;
    };
  }
}

/** Excalidraw's grid step, which ours draws in `code-bg`. */
const GRID = 20;

/** Every canvas action of Excalidraw's own off: the rail is ours. */
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
  tools: { image: false },
} as const;

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
const darkScheme = media("(prefers-color-scheme: dark)");
const lessMotion = media("(prefers-reduced-motion: reduce)");

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

/** What the canvas holds before Excalidraw binds to it: its pen mode, and whether it is empty. */
const firstLook = (hold: ArtifactHold | null) => {
  const doc = new Doc();
  if (hold) {
    applyUpdate(doc, hold.state());
  }
  const meta = doc.getMap("meta");
  const look = {
    empty: doc
      .getArray<{ get: (key: string) => unknown }>("elements")
      .toArray()
      .every((map) => (map.get("el") as ExcalidrawElement).isDeleted),
    penMode: meta.get("penMode") === true,
    penDetected: meta.get("penDetected") === true,
  };
  doc.destroy();
  return look;
};

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

function Host() {
  const hold = useSyncExternalStore(holdStore.subscribe, holdStore.now);
  const dark = useSyncExternalStore(darkScheme.subscribe, darkScheme.now);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
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
  useEffect(() => {
    if (!(api && generation !== undefined)) {
      return;
    }
    const bound = bindScene(api, () => holdStore.now() as ArtifactHold, {
      ink,
      dark: darkScheme.now,
      reduced: lessMotion.now,
    });
    return () => bound.destroy();
  }, [api, generation, ink]);
  const changed = useCallback(
    (elements: readonly ExcalidrawElement[], state: AppState) => {
      setEmpty(elements.every((el) => el.isDeleted));
      setTool(state.activeTool.type);
    },
    []
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
  return (
    <div className="canvas-host" ref={surface}>
      <Excalidraw
        detectScroll
        excalidrawAPI={setApi}
        gridModeEnabled={false}
        handleKeyboardGlobally={false}
        initialData={initialData}
        onChange={changed}
        onScrollChange={scrolled}
        theme={dark ? "dark" : "light"}
        UIOptions={UI_OPTIONS}
        zenModeEnabled={false}
      />
      {api ? <Rail api={api} reduced={lessMotion.now} tool={tool} /> : null}
      {empty ? <Empty onDraw={draw} /> : null}
    </div>
  );
}

const root = document.getElementById("canvas-root");
if (root) {
  createRoot(root).render(<Host />);
}
