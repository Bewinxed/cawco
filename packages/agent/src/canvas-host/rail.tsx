/// <reference lib="dom" />

/**
 * The canvas's tool rail (DESIGN.md, Artifact panel, canvas and ink): two
 * floating groups in the panel material over Excalidraw, whose own chrome
 * is hidden. Tools at the top-left (select, hand, pen, shapes as a menu,
 * arrow, text, eraser), view at the top-right (zoom as a menu, Dock, Done).
 * A tool is Excalidraw's own (`setActiveTool`); the chosen one is the one
 * Excalidraw reports (`appState.activeTool`). Dock (Undock while the host
 * says the canvas is docked) and Done are the host's: they post
 * `cawco:dock`, `cawco:undock` and `cawco:done` to it.
 *
 * Every control names what it does in `data-action`; the rail has one
 * press handler that reads it.
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type Glyph, Icon } from "./icons";

/** Excalidraw's tools the rail offers. */
export type Tool =
  | "selection"
  | "hand"
  | "freedraw"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "text"
  | "eraser";

const SHAPES: { tool: Tool; label: string; glyph: Glyph; key: string }[] = [
  { tool: "rectangle", label: "Rectangle", glyph: "rectangle", key: "R" },
  { tool: "diamond", label: "Diamond", glyph: "rectangle", key: "D" },
  { tool: "ellipse", label: "Ellipse", glyph: "ellipse", key: "O" },
];

/** The rail's own tools, in order, around the shapes' menu. */
const BEFORE_SHAPES: { tool: Tool; label: string; glyph: Glyph }[] = [
  { tool: "selection", label: "Select (V)", glyph: "select" },
  { tool: "hand", label: "Hand (H)", glyph: "hand" },
  { tool: "freedraw", label: "Pen (P)", glyph: "pen" },
];
const AFTER_SHAPES: { tool: Tool; label: string; glyph: Glyph }[] = [
  { tool: "arrow", label: "Arrow (A)", glyph: "arrow" },
  { tool: "text", label: "Text (T)", glyph: "text" },
  { tool: "eraser", label: "Eraser (E)", glyph: "eraser" },
];

/** Excalidraw's zoom bounds. */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 30;
/** One step of Zoom in or out. Excalidraw's own step. */
const ZOOM_STEP = 0.1;

/** Zooms about the middle of the canvas, as Excalidraw's own zoom does. */
const zoomTo = (api: ExcalidrawImperativeAPI, next: number) => {
  const state = api.getAppState();
  const value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  const x = state.width / 2;
  const y = state.height / 2;
  const sceneX = x / state.zoom.value - state.scrollX;
  const sceneY = y / state.zoom.value - state.scrollY;
  api.updateScene({
    appState: {
      zoom: { value: value as NormalizedZoomValue },
      scrollX: x / value - sceneX,
      scrollY: y / value - sceneY,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

/** What a control's `data-action` does. */
const perform = (
  api: ExcalidrawImperativeAPI,
  action: string,
  reduced: () => boolean
) => {
  const [kind, what] = action.split(":");
  if (kind === "tool") {
    api.setActiveTool({ type: what as Tool });
  } else if (kind === "host") {
    window.parent.postMessage({ type: `cawco:${what}` }, location.origin);
  } else if (what === "in" || what === "out") {
    const zoom = api.getAppState().zoom.value;
    zoomTo(api, what === "in" ? zoom + ZOOM_STEP : zoom - ZOOM_STEP);
  } else if (what === "actual") {
    zoomTo(api, 1);
  } else if (what === "fit") {
    api.scrollToContent(undefined, { fitToContent: true, animate: !reduced() });
  }
};

/** The control a press landed on, with what it does. */
const actionAt = (event: MouseEvent) =>
  (event.currentTarget as HTMLElement).dataset.action;

/** The rail's one press handler, which every box and item takes. */
const Press = createContext<(event: MouseEvent) => void>(() => undefined);

function Box({
  action,
  chosen,
  glyph,
  label,
  shape,
}: {
  action: string;
  chosen?: boolean;
  glyph: Glyph;
  label: string;
  shape?: Tool;
}) {
  const press = useContext(Press);
  return (
    <button
      aria-label={label}
      aria-pressed={chosen}
      className="rail-box"
      data-action={action}
      data-chosen={chosen || undefined}
      data-shape={shape}
      onClick={press}
      title={label}
      type="button"
    >
      <Icon name={glyph} />
    </button>
  );
}

/** A box whose press opens a menu of items under it; picking an item closes it, unless the item stays (`data-stay`). */
function MenuBox({
  label,
  glyph,
  chosen,
  shape,
  children,
}: {
  children: ReactNode;
  chosen?: boolean;
  glyph: Glyph;
  label: string;
  shape?: Tool;
}) {
  const [open, setOpen] = useState(false);
  /** Whether the menu was opened from the keyboard: its focus moves in, and back out on close. */
  const byKeyboard = useRef<boolean>(false);
  const id = useId();
  const holder = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    if (byKeyboard.current) {
      list.current?.querySelector<HTMLElement>("[data-action]")?.focus();
    }
    const outside = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const close = useCallback(() => {
    setOpen(false);
    if (byKeyboard.current) {
      trigger.current?.focus();
    }
  }, []);
  const toggle = useCallback((event: MouseEvent) => {
    byKeyboard.current = event.detail === 0;
    setOpen((was) => !was);
  }, []);
  const picked = useCallback(
    (event: MouseEvent) => {
      const item = (event.target as Element).closest<HTMLElement>(
        "[data-action]"
      );
      if (item && !item.hasAttribute("data-stay")) {
        close();
      }
    },
    [close]
  );
  const keys = useCallback(
    (event: KeyboardEvent) => {
      const items = [
        ...(list.current?.querySelectorAll<HTMLElement>("[data-action]") ?? []),
      ];
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      }
    },
    [close]
  );
  return (
    <div className="rail-menu-holder" ref={holder}>
      <button
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="rail-box"
        data-chosen={chosen || undefined}
        data-shape={shape}
        onClick={toggle}
        ref={trigger}
        title={label}
        type="button"
      >
        <Icon name={glyph} />
      </button>
      {open ? (
        <div
          aria-label={label}
          className="rail-menu"
          id={id}
          onClick={picked}
          onKeyDown={keys}
          ref={list}
          role="menu"
          tabIndex={-1}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** One of a menu's items: a command, or (`checked` given) one of a set the tool is. */
function Item({
  action,
  checked,
  glyph,
  hint,
  label,
  shape,
  stay,
}: {
  action: string;
  checked?: boolean;
  glyph: Glyph;
  hint?: string;
  label: string;
  shape?: Tool;
  stay?: boolean;
}) {
  const press = useContext(Press);
  const inside = (
    <>
      <Icon name={glyph} />
      <span className="rail-item-label">{label}</span>
      {hint ? <span className="rail-item-hint">{hint}</span> : null}
    </>
  );
  return checked === undefined ? (
    <button
      className="rail-item"
      data-action={action}
      data-stay={stay || undefined}
      onClick={press}
      role="menuitem"
      tabIndex={-1}
      type="button"
    >
      {inside}
    </button>
  ) : (
    <button
      aria-checked={checked}
      className="rail-item"
      data-action={action}
      data-shape={shape}
      onClick={press}
      role="menuitemradio"
      tabIndex={-1}
      type="button"
    >
      {inside}
    </button>
  );
}

export function Rail({
  api,
  docked,
  tool,
  reduced,
}: {
  api: ExcalidrawImperativeAPI;
  /** The host stands the canvas in its artifact panel: Dock reads Undock. */
  docked: boolean;
  reduced: () => boolean;
  tool: string;
}) {
  const pressed = useCallback(
    (event: MouseEvent) => {
      const action = actionAt(event);
      if (action) {
        perform(api, action, reduced);
      }
    },
    [api, reduced]
  );
  const shape = SHAPES.find((one) => one.tool === tool) ?? SHAPES[0];
  const box = (one: { tool: Tool; label: string; glyph: Glyph }) => (
    <Box
      action={`tool:${one.tool}`}
      chosen={tool === one.tool}
      glyph={one.glyph}
      key={one.tool}
      label={one.label}
    />
  );
  return (
    <Press.Provider value={pressed}>
      <div aria-label="Tools" className="rail rail-tools" role="toolbar">
        {BEFORE_SHAPES.map(box)}
        <MenuBox
          chosen={SHAPES.some((one) => one.tool === tool)}
          glyph={shape.glyph}
          label="Shapes"
          shape={shape.tool}
        >
          {SHAPES.map((one) => (
            <Item
              action={`tool:${one.tool}`}
              checked={tool === one.tool}
              glyph={one.glyph}
              hint={one.key}
              key={one.tool}
              label={one.label}
              shape={one.tool}
            />
          ))}
        </MenuBox>
        {AFTER_SHAPES.map(box)}
      </div>
      <div aria-label="View" className="rail rail-view" role="toolbar">
        <MenuBox glyph="zoomIn" label="Zoom">
          <Item action="zoom:in" glyph="zoomIn" label="Zoom in" stay />
          <Item action="zoom:out" glyph="zoomOut" label="Zoom out" stay />
          <Item action="zoom:actual" glyph="actualSize" label="Actual size" />
          <Item action="zoom:fit" glyph="fit" label="Zoom to fit" />
        </MenuBox>
        <Box
          action={docked ? "host:undock" : "host:dock"}
          glyph="dock"
          label={docked ? "Undock" : "Dock"}
        />
        <Box action="host:done" glyph="done" label="Done" />
      </div>
    </Press.Provider>
  );
}
