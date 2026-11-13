/**
 * Every `cawco:*` message the pages the agent serves exchange with the
 * dashboard frame around them, declared once with its fields. The page side
 * (agent canvas-host, stage-host), the pane's own posts (dashboard) and what
 * each reads are typed by these declarations, so a misspelled name or a
 * missing field fails the type check on either side.
 *
 * Two directions. {@link PageSays}: what a page says to the frame holding
 * it; {@link FrameSays}: what the frame says to the page. Each is a union
 * discriminated by `type`, built from a map of bodies keyed by the message's
 * name, so a reader narrows on `type` and a sender is checked against the
 * name it sends.
 *
 * The component stage's messages (the design graph's seam) are declared in
 * stage-graph.ts, which keeps their names and bodies; this file reuses them.
 * The preview overlay's own messages (pins, comments, the shell's keys: the
 * `packages/preview` overlay and the pane that reads it) are not declared
 * here.
 *
 * A page's message crosses `postMessage` with its body beside `type`. What
 * a frame says is read by {@link frameSaid}; what a page says, by
 * {@link pageSaid}, each checking the fields it hands on; the stage's own
 * bodies are read by stage-graph.ts's readers, as they were.
 */

import type { CommentAttachment, PreviewMode } from "./comments/model";
import { PREVIEW_DOWNS, type PreviewDown } from "./preview/protocol";
import { PREVIEW_LOCKED_MESSAGE } from "./preview/routes";
import {
  CANVAS_AWAY,
  CANVAS_EMBED_FAILED,
  CANVAS_EMBED_FETCHED,
  CANVAS_EMBED_GO,
  CANVAS_EMBED_GRAPH,
  CANVAS_EMBED_READY,
  CANVAS_EMBED_SEEN,
  CANVAS_EMBED_SIZE,
  type Scheme,
  type SheetOnPage,
} from "./stage";
import {
  STAGE_COMPARE,
  STAGE_DIALS,
  STAGE_DIALS_WRITTEN,
  STAGE_DIFFERENCES,
  STAGE_FAULT,
  STAGE_LAID,
  STAGE_LET_GO,
  STAGE_PAUSE,
  STAGE_PLAY,
  STAGE_REACH,
  STAGE_REACHED,
  STAGE_RETIME,
  STAGE_REVEAL,
  STAGE_RING,
  STAGE_ROOM,
  STAGE_SCROLLED,
  STAGE_SEEK,
  STAGE_TIME,
  type StageCompare,
  type StageDials,
  type StageDialsWritten,
  type StageDifferences,
  type StageFault,
  type StageLaid,
  type StageLetGo,
  type StagePause,
  type StagePlay,
  type StageReach,
  type StageReached,
  type StageRetime,
  type StageReveal,
  type StageRing,
  type StageRoom,
  type StageScrolled,
  type StageSeek,
  type StageTime,
} from "./stage-graph";

/** A message whose body is nothing but its name. */
type Bare = object;

/** A message whose fields the one that reads it checks, as the overlay's own are. */
type Fields = Record<string, unknown>;

/** What of a page's edges the host's chrome takes, px (preview overlay `takeInset`). */
export interface FrameInset {
  bottom?: number;
  side?: number;
  top?: number;
}

/** The stage's view as the pane sets it: scheme, the widths picked, motion, fit. */
export interface CanvasView {
  fit: boolean;
  motion: "on" | "reduce";
  scheme: Scheme | "both" | "page";
  /** Null: each story at its own form. */
  widths: number[] | null;
}

/** An element pressed on a canvas (no drag), as its page says it. */
export interface CanvasPress {
  button: number;
  /** The topmost element under the point, a bound label as its container; none on the empty canvas. */
  element: {
    box: { height: number; width: number; x: number; y: number };
    id: string;
    text: string;
    type: string;
  } | null;
  modifiers: { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };
  pointer: string;
  screen: { x: number; y: number };
}

/** The words a canvas page's rail says to the dashboard that holds it. */
export const RAIL_SAYS = [
  "cawco:dock",
  "cawco:undock",
  "cawco:done",
  "cawco:remove",
] as const;

/** Each message a page says to the frame holding it: its body (the fields beside `type`), by the message's name. */
export interface PageSaysBodies {
  /** The overlay's, on a Comment standing on a canvas's ink: the comment's page-side result (`ok` with its `pin`, or the words it was refused in); the composer reads each field. */
  "cawco:comment-result": Fields;
  /** The overlay's: a press (or a radial's Comment) on a canvas's ink opened a composer; the chain of what it may stand on, read by the pane's `previewCompose`. */
  "cawco:compose": Fields;
  /** The overlay's: where on the canvas the composer's target stands, read by the pane's `previewPinAt`. */
  "cawco:compose-at": Fields;
  "cawco:dock": Bare;
  "cawco:done": Bare;
  /** The proxy's page: the hop that didn't answer, and the machine's words for it. */
  "cawco:down": { down: PreviewDown; why: string | null };
  /** Elements the page's doc holds, drawn and not deleted. */
  "cawco:drawn": { count: number };
  "cawco:element-press": CanvasPress;
  "cawco:pictured": Bare;
  "cawco:remove": Bare;
  /** A sheet's page: its stories and props, for the pane's inspector. */
  "cawco:sheet": { sheet: SheetOnPage };
  /** A held stroke snapped to the shape `id`. */
  "cawco:snap": { id: string };
  "cawco:undock": Bare;
  [CANVAS_EMBED_FAILED]: { why: string };
  [CANVAS_EMBED_FETCHED]: Bare;
  [CANVAS_EMBED_GRAPH]: { urls: string[] };
  /** A canvas embed's shape; `margin` is a drawn canvas's, `rest` a component canvas's. */
  [CANVAS_EMBED_SIZE]: {
    height: number;
    margin?: number;
    rest?: boolean;
    width: number | null;
  };
  [PREVIEW_LOCKED_MESSAGE]: Bare;
  [STAGE_DIALS_WRITTEN]: StageDialsWritten;
  [STAGE_DIFFERENCES]: StageDifferences;
  [STAGE_FAULT]: StageFault;
  [STAGE_LAID]: StageLaid;
  [STAGE_REACHED]: StageReached;
  [STAGE_SCROLLED]: StageScrolled;
  [STAGE_TIME]: StageTime;
}

/** Each message a frame says to the page it holds: its body, by the message's name. */
export interface FrameSaysBodies {
  "cawco:canvas-view": { view: CanvasView };
  /** The composer's words: the comment written, its files by reference, `held` to send with the others. */
  "cawco:comment": {
    attachments: CommentAttachment[];
    held: boolean;
    text: string;
  };
  /** The composer closed with nothing said: its pill goes. */
  "cawco:compose-cancel": Bare;
  /** The composer closed with its words kept: its pill stays, saying it holds a draft. */
  "cawco:compose-park": Bare;
  /** The composer's target chip chose another of the press's chain. */
  "cawco:compose-target": { index: number };
  "cawco:hello": {
    artifact?: { id: string; kind: string; name: string; title?: string };
    bareScroll?: boolean;
    headRoom?: number;
    headed?: boolean;
    inset?: FrameInset;
    sync?: string;
    theme: Scheme;
  };
  /** The page's first word from its host: who it is, where its doc is synced, the theme, where it stands. */
  /** The overlay's: the canvas is held while its panel is off screen, and let go. */
  "cawco:hold": Bare;
  /** The pane's mode; `place` is the moved pin the next tap in Comment places again. */
  "cawco:mode": { mode: PreviewMode; place: string | null };
  "cawco:pencil-double-tap": Bare;
  /** The page draws its picture now and posts it. */
  "cawco:picture": Bare;
  /** Where the host stands the canvas: docked in the artifact panel or not. */
  "cawco:place": { docked?: boolean; inset?: FrameInset };
  "cawco:release": Bare;
  "cawco:story-args": { args: Record<string, unknown> | null; story: string };
  "cawco:story-select": { story: string | null };
  "cawco:theme": { theme: Scheme };
  /** The pane's pane is away, or back: a canvas holds its animation frames while away. */
  [CANVAS_AWAY]: { away: boolean };
  /** A canvas embed's share of its graph, the modules it fetches now. */
  [CANVAS_EMBED_GO]: { urls: string[] };
  /** The rest of an embed's graph, once every module of it is in. */
  [CANVAS_EMBED_READY]: { urls: string[] };
  /** An embed's box has stood in the page's view. */
  [CANVAS_EMBED_SEEN]: Bare;
  [STAGE_COMPARE]: StageCompare;
  [STAGE_DIALS]: StageDials;
  [STAGE_LET_GO]: StageLetGo;
  [STAGE_PAUSE]: StagePause;
  [STAGE_PLAY]: StagePlay;
  [STAGE_REACH]: StageReach;
  [STAGE_RETIME]: StageRetime;
  [STAGE_REVEAL]: StageReveal;
  [STAGE_RING]: StageRing;
  [STAGE_ROOM]: StageRoom;
  [STAGE_SEEK]: StageSeek;
}

/** The message each key of `bodies` is: its `type` and its body. */
type Said<Bodies> = {
  [Type in keyof Bodies]: { type: Type } & Bodies[Type];
}[keyof Bodies];

/** What a page says to the frame holding it. */
export type PageSays = Said<PageSaysBodies>;
/** What a frame says to the page it holds. */
export type FrameSays = Said<FrameSaysBodies>;

/** The body of the page's message `Type`: the fields beside its `type`. */
export type PageBody<Type extends keyof PageSaysBodies> = PageSaysBodies[Type];
/** The body of the frame's message `Type`: the fields beside its `type`. */
export type FrameBody<Type extends keyof FrameSaysBodies> =
  FrameSaysBodies[Type];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const SCHEMES = ["light", "dark"] as const;
const schemeOf = (value: unknown): Scheme | null =>
  SCHEMES.find((one) => one === value) ?? null;

const urlsOf = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.map(String) : null;

/** The frame's messages a canvas page reads off `postMessage` itself, the rest reaching it through the overlay. */
export type FrameHeard = Extract<
  FrameSays,
  {
    type:
      | typeof CANVAS_AWAY
      | typeof CANVAS_EMBED_SEEN
      | "cawco:hello"
      | "cawco:pencil-double-tap"
      | "cawco:picture"
      | "cawco:place"
      | "cawco:theme";
  }
>;

/**
 * What a frame said, read: the message and the fields of it that are read,
 * or null for any other value. A hello or a place is read to its theme or
 * docked flag: the rest of either is the overlay's.
 */
export function frameSaid(value: unknown): FrameHeard | null {
  if (!isRecord(value)) {
    return null;
  }
  switch (value.type) {
    case CANVAS_AWAY:
      return { type: CANVAS_AWAY, away: value.away === true };
    case CANVAS_EMBED_SEEN:
      return { type: CANVAS_EMBED_SEEN };
    case "cawco:hello": {
      const theme = schemeOf(value.theme);
      return theme ? { type: "cawco:hello", theme } : null;
    }
    case "cawco:theme": {
      const theme = schemeOf(value.theme);
      return theme ? { type: "cawco:theme", theme } : null;
    }
    case "cawco:place":
      return { type: "cawco:place", docked: value.docked === true };
    case "cawco:picture":
      return { type: "cawco:picture" };
    case "cawco:pencil-double-tap":
      return { type: "cawco:pencil-double-tap" };
    default:
      return null;
  }
}

/** Whether a frame's message says its pane is away ({@link CANVAS_AWAY}); undefined for any other message. */
export const awaySaid = (data: unknown): boolean | undefined => {
  const said = frameSaid(data);
  return said?.type === CANVAS_AWAY ? said.away : undefined;
};

/** The page's messages the pane reads off `postMessage` itself, by the fields they carry; the stage's and the sheet's are read where they are. */
export type PageHeard = Extract<
  PageSays,
  {
    type:
      | typeof CANVAS_EMBED_FAILED
      | typeof CANVAS_EMBED_FETCHED
      | typeof CANVAS_EMBED_GRAPH
      | typeof CANVAS_EMBED_SIZE
      | typeof PREVIEW_LOCKED_MESSAGE
      | (typeof RAIL_SAYS)[number]
      | "cawco:down"
      | "cawco:drawn"
      | "cawco:pictured"
      | "cawco:snap";
  }
>;

/** What a page said, read: the message with its fields checked, or null for any other value. */
export function pageSaid(value: unknown): PageHeard | null {
  if (!isRecord(value)) {
    return null;
  }
  switch (value.type) {
    case CANVAS_EMBED_FAILED:
      return typeof value.why === "string"
        ? { type: CANVAS_EMBED_FAILED, why: value.why }
        : null;
    case CANVAS_EMBED_FETCHED:
      return { type: CANVAS_EMBED_FETCHED };
    case CANVAS_EMBED_GRAPH: {
      const urls = urlsOf(value.urls);
      return urls ? { type: CANVAS_EMBED_GRAPH, urls } : null;
    }
    case CANVAS_EMBED_SIZE:
      return typeof value.height === "number"
        ? {
            type: CANVAS_EMBED_SIZE,
            height: value.height,
            width: typeof value.width === "number" ? value.width : null,
            rest: value.rest === true,
          }
        : null;
    case PREVIEW_LOCKED_MESSAGE:
      return { type: PREVIEW_LOCKED_MESSAGE };
    case "cawco:down": {
      const down = PREVIEW_DOWNS.find((hop) => hop === value.down);
      return down
        ? {
            type: "cawco:down",
            down,
            why: typeof value.why === "string" ? value.why : null,
          }
        : null;
    }
    case "cawco:drawn":
      return typeof value.count === "number"
        ? { type: "cawco:drawn", count: value.count }
        : null;
    case "cawco:snap":
      return typeof value.id === "string"
        ? { type: "cawco:snap", id: value.id }
        : null;
    case "cawco:dock":
    case "cawco:undock":
    case "cawco:done":
    case "cawco:remove":
    case "cawco:pictured":
      return { type: value.type };
    default:
      return null;
  }
}
