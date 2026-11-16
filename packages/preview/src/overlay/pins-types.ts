/**
 * The page's pin layer as its users hold it (pins.ts `startPins` makes
 * one): apart from pins.ts, so ink.ts, which pins.ts imports, can hold one.
 */
import type { PinnedElement } from "@cawco/core/comments/anchor";
import type { InkGroup } from "@cawco/core/ink";
import type { Box } from "./frames";

/** What a comment being written stands on: an element and the point on it, or an ink group. */
export interface DraftTarget {
  el: Element;
  /** The stroke group whose Comment the person picked. */
  ink?: string;
  /** Its composer is closed with its words kept: the pill holds a draft, and a press opens it again. */
  parked?: boolean;
  /** Where on `el` the press landed: fractions of its box. */
  point?: { x: number; y: number };
}

export interface Pins {
  /**
   * The apps' Comment-mode tap (page.ts `appCommenting`, until tsk-59): a
   * comment pinned on `el` where the viewport's `x`, `y` landed, its thread
   * empty, and its card opened in the app (`cawco:pin-open`, `made`). Its id.
   */
  commentAt: (el: Element, x: number, y: number) => string;
  /** What of the page's viewport the host's chrome covers now (`cawco:covered`, the viewport's px); none when nothing does. */
  cover: (boxes: Box[]) => void;
  /**
   * Where pin `id`'s picture is cropped, the page's px, and what it shows
   * (its look: a new one is drawn again), and the element it is cropped
   * round when it stands on one; null when it is not on the page.
   */
  cropOf: (id: string) => { box: Box; el: Element | null; look: string } | null;
  /** The comment being written stands here (its hollow pill, no number yet), or none. */
  draft: (target: DraftTarget | null) => void;
  /** Pins drawn again where their elements stand now: done once they are painted (Floating UI places them in a promise). */
  /** Drawn where their elements stand now; `following`, a scroller moved them and nothing else changed. */
  draw: (following?: boolean) => Promise<void>;
  /** The layer fixed to the viewport, where pins on the page as a whole stand. */
  fixed: SVGSVGElement;
  /** The pin the host focused (J, K, its row), outlined and brought into view out from under the host's chrome; or none. */
  /**
   * Pin `id` focused, and with `scroll` brought into view: in one step with
   * `instant` (a thread opening, whose card stands where the pill lands),
   * else a glide. `keyed`, it was reached by the keyboard: its pill wears
   * the focus ring until a press.
   */
  focus: (
    id: string | null,
    scroll: boolean,
    instant?: boolean,
    keyed?: boolean
  ) => void;
  /** The pin whose row in the host's list the pointer or the keyboard rests on, its element chosen; none gives the focused pin's back. */
  hover: (id: string | null) => void;
  /** After a re-publish or an HMR update: the open thread's pin, if it now stands under the host's chrome, brought out again. */
  keepClear: () => void;
  layer: SVGSVGElement;
  /** The pins the agent is working on (`live`) and those with an answer the person hasn't read (`unread`), each its dot. */
  marks: (live: Set<string>, unread: Set<string>) => void;
  /** Pin `id`'s thread opened in the host (`cawco:pin-open`) by a press on the page, the pin as this page holds it with it; `made`, for one the apps' tap just made. */
  open: (id: string, made?: boolean) => void;
  /** A comment on an ink group: its composer opens on it. */
  pinInk: (group: InkGroup, elements: PinnedElement[] | string[]) => void;
  /** Pin `id` placed again on `el` at the viewport's `x`, `y`: out of the moved tray. */
  placeAgain: (id: string, el: Element, x: number, y: number) => void;
  /** Where on `el`'s box the viewport's `x`, `y` lands, as fractions. */
  pointOn: (el: Element, x: number, y: number) => { x: number; y: number };
  /** Every pin shown on the page, or hidden (⇧C). */
  show: (shown: boolean) => void;
  /** The elements its pins, and the comment being written, stand on now. */
  standingOn: () => Iterable<Element | null>;
  /** The pin whose thread the host shows, whose place it hears as the page scrolls; or none. */
  track: (id: string | null) => void;
}
