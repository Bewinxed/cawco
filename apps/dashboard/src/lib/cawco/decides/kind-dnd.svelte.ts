/**
 * Dragging a kind's tile from one member's card to another's, on Pragmatic
 * drag and drop as the board's cards are (tasks/board-dnd.svelte.ts): plain
 * attachments, no adapter layer. A drop is the same hand-over a press on the
 * tile and a pick in its list makes (Roster).
 *
 * The page draws the drag itself, in four parts:
 *
 * - Lift: the tile comes off its card as a ghost (a copy of it in the top
 *   layer) on the overlay's shadow, and its place on the card stays as a
 *   dashed outline.
 * - Carry: the ghost tracks the pointer 1:1, as every hand-driven surface
 *   does (motion/drag.svelte.ts).
 * - Hover: the card under it is edged, and a slot opens on it where the
 *   tile will stand, the tile's own height, in the kinds' order.
 * - Landing: let go over another card, the ghost settles into that slot on
 *   the house's settle (motion/spring.ts), from the hand's speed, and
 *   stays there until the hand-over is answered; taken, the tile stands in
 *   its place without a second flight; refused, or let go anywhere else, the
 *   ghost goes back into its outline on the card it came from.
 *
 * Not offered under a coarse pointer, for the board's reason: a long press
 * there scrolls, and the tile's press does the same job by tap.
 */
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { tick } from "svelte";
import { motionOk } from "#lib/platform/motion/curves.svelte.js";
import { integrate, Release, spring } from "#lib/platform/motion/spring.js";
import {
  type DragEnd,
  type DragPoint,
  endOf,
  internalDraggable,
  pointOf,
} from "../internal-drag";
import { coarse } from "../workspace/dnd.svelte";

interface KindDrag {
  from: string;
  kind: string;
  type: "cawco/kind";
}

const asDrag = (data: Record<string | symbol, unknown>): KindDrag | null =>
  data.type === "cawco/kind" &&
  typeof data.kind === "string" &&
  typeof data.from === "string"
    ? { type: "cawco/kind", kind: data.kind, from: data.from }
    : null;

/** A member's card as a drop target says whose it is. */
const asCard = (data: Record<string | symbol, unknown>): string | null =>
  data.type === "cawco/kind-card" && typeof data.member === "string"
    ? data.member
    : null;

/** How each card on the page takes a kind, while it is a drop target. */
const takers = new WeakMap<Element, (kind: string) => Promise<boolean>>();

/** The tile off its card, from its lift until it has landed or gone home. */
interface Aloft {
  from: string;
  /** The outline's height, which a slot opens to. */
  height: number;
  kind: string;
  /** The card it is settling into, once let go over one. */
  to: string | null;
}

/** What the cards read while a tile is off its card. */
const hint = $state<{ aloft: Aloft | null; over: string | null }>({
  aloft: null,
  over: null,
});

export const kindDrag = {
  /** The member whose card the ghost is over, from another card. */
  get over() {
    return hint.over;
  },
  /** Whether `member`'s tile for `kind` is the one off its card: drawn as its outline. */
  lifted: (kind: string, member: string): boolean =>
    hint.aloft?.kind === kind && hint.aloft.from === member,
  /** The tile a slot on `member`'s card opens for: hovered over it, or settling into it. */
  slotIn: (member: string): Aloft | null => {
    const { aloft, over } = hint;
    if (aloft === null || aloft.from === member) {
      return null;
    }
    return aloft.to === member || (aloft.to === null && over === member)
      ? aloft
      : null;
  },
  /** Whether `kind`'s tile moves cards under the ghost: no flight of its own, and hidden on its new card until the ghost is down. */
  carried: (kind: string): boolean =>
    hint.aloft?.kind === kind && hint.aloft.to !== null,
};

/**
 * The tile in the hand: a copy of it in the top layer (a manual popover,
 * above every dialog and outside every container that would clip or
 * re-anchor a fixed box), on the overlay's shadow. It tracks the pointer
 * 1:1, as every hand-driven surface does (motion/drag.svelte.ts), and where
 * it is put down it settles on the house's settle (motion/spring.ts),
 * leaving the hand at the hand's own velocity: the settle is a linear
 * spring, so across and down are two settles of the house's, each from its
 * own distance and speed, played on two boxes (the ghost across, its lane
 * inside it down), whose sum is the one 2D settle.
 */
class Ghost {
  readonly #node: HTMLElement;
  /** The box inside it that carries the settle's vertical half. */
  readonly #lane: HTMLElement;
  readonly #offset: DragPoint;
  /** Where it is drawn: its box's top-left corner in the viewport. */
  #at: DragPoint;
  readonly #handX = new Release();
  readonly #handY = new Release();

  constructor(source: HTMLElement, at: DragPoint) {
    const box = source.getBoundingClientRect();
    this.#offset = { x: at.x - box.left, y: at.y - box.top };
    this.#at = { x: box.left, y: box.top };
    const copy = source.cloneNode(true);
    if (!(copy instanceof HTMLElement)) {
      throw new TypeError("A tile's copy is an element");
    }
    for (const named of copy.querySelectorAll("[id]")) {
      named.removeAttribute("id");
    }
    for (const mark of ["data-kind", "data-dragging", "data-lifted"]) {
      copy.removeAttribute(mark);
    }
    const node = document.createElement("div");
    node.popover = "manual";
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    Object.assign(node.style, {
      position: "fixed",
      inset: "auto",
      left: "0",
      top: "0",
      margin: "0",
      padding: "0",
      border: "0",
      background: "transparent",
      overflow: "visible",
      pointerEvents: "none",
      width: `${box.width}px`,
      borderRadius: "var(--radius-well)",
      boxShadow: "none",
      transition: motionOk.current
        ? "box-shadow var(--duration-control) var(--ease-out)"
        : "none",
      willChange: "transform",
    });
    const lane = document.createElement("div");
    lane.append(copy);
    node.append(lane);
    document.body.append(node);
    node.showPopover();
    this.#node = node;
    this.#lane = lane;
    this.#draw();
    requestAnimationFrame(() => {
      node.style.boxShadow = "var(--shadow-overlay)";
    });
  }

  /** The pointer moved to `at`. */
  move(at: DragPoint) {
    this.#at = { x: at.x - this.#offset.x, y: at.y - this.#offset.y };
    const now = performance.now();
    this.#handX.push(this.#at.x, now);
    this.#handY.push(this.#at.y, now);
    this.#draw();
  }

  /**
   * Settles into the box `aim` finds (once the page has drawn it, for a slot
   * still opening), its shadow down, starting at the hand's velocity at
   * `now`. Answers once it is at rest.
   */
  async settle(aim: () => Element | null, now: number): Promise<void> {
    this.#node.style.boxShadow = "none";
    const vx = this.#handX.velocity(now);
    const vy = this.#handY.velocity(now);
    this.#handX.clear();
    this.#handY.clear();
    let target = aim();
    if (!target) {
      await tick();
      target = aim();
    }
    const box = target?.getBoundingClientRect();
    if (!box) {
      return;
    }
    const from = this.#at;
    this.#at = { x: box.left, y: box.top };
    this.#node.style.width = `${box.width}px`;
    if (!motionOk.current) {
      this.#draw();
      return;
    }
    const flights = [
      ...spring(integrate(from.x - box.left, vx * 1000), [
        {
          el: this.#node,
          frame: (x) => ({ transform: place(box.left + x, box.top) }),
        },
      ]),
      ...spring(integrate(from.y - box.top, vy * 1000), [
        { el: this.#lane, frame: (y) => ({ transform: place(0, y) }) },
      ]),
    ];
    // Both halves start on this frame, at the moment the hand let go: an
    // animation left pending starts on the frame after, the ghost standing
    // still for it however fast the hand was going.
    const start = document.timeline.currentTime;
    for (const flight of flights) {
      flight.startTime = start;
    }
    await Promise.all(flights.map((flight) => flight.finished));
    this.#draw();
    for (const flight of flights) {
      flight.cancel();
    }
  }

  remove() {
    this.#node.remove();
  }

  #draw() {
    this.#node.style.transform = place(this.#at.x, this.#at.y);
  }
}

const place = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`;

/** The tile in the hand now; one at a time. */
let ghost: Ghost | null = null;

/** `kind`'s tile on `member`'s card, or the slot opened for it there. */
const tileOn = (member: string, kind: string) => () =>
  document.querySelector(
    `[data-member="${CSS.escape(member)}"] [data-kind="${CSS.escape(kind)}"], [data-member="${CSS.escape(member)}"] [data-slot-for="${CSS.escape(kind)}"]`
  );

/** Puts the ghost down in `aim`'s box, let go at `now`, then takes it away. */
async function setDown(aim: () => Element | null, now: number) {
  const held = ghost;
  if (held === null) {
    return;
  }
  await held.settle(aim, now);
  held.remove();
  ghost = null;
}

/** Let go over `card`: the ghost settles into its slot while `card` hears the kind; refused, it goes home. */
async function land(
  drag: Aloft,
  to: string,
  take: (kind: string) => Promise<boolean>,
  now: number
) {
  hint.aloft = { ...drag, to };
  hint.over = null;
  // The settle leaves the hand on the frame it lets go: the slot it aims
  // at stands open from the hover.
  const settled = ghost?.settle(tileOn(to, drag.kind), now);
  const [taken] = await Promise.all([take(drag.kind), settled]);
  if (taken) {
    await tick();
    ghost?.remove();
    ghost = null;
    hint.aloft = null;
    return;
  }
  hint.aloft = { ...drag, to: null };
  await tick();
  await setDown(tileOn(drag.from, drag.kind), performance.now());
  hint.aloft = null;
}

/** A kind's tile that can be dragged: `kind`, held by `from`; none while `held` is false (a write in flight). */
export function dragKind(
  params: () => { kind: string; from: string; held: boolean }
) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    monitorKinds();
    return internalDraggable(node, {
      ghost: true,
      canDrag: () => params().held && hint.aloft === null,
      data: () => {
        const { kind, from } = params();
        return { type: "cawco/kind", kind, from };
      },
      onStart: (at) => {
        const { kind, from } = params();
        ghost = new Ghost(node, at);
        hint.aloft = {
          kind,
          from,
          to: null,
          height: node.getBoundingClientRect().height,
        };
      },
    });
  };
}

/**
 * Where a drag ends, however it ends: let go over a card, over nothing,
 * outside the window, or cancelled (Escape, the window losing the drag).
 * Pragmatic always ends a drag with `onDrop`; a monitor hears it even when
 * the tile it started from was drawn again mid-drag, which the tile's own
 * `onDrop` would not (adapter/element-adapter `dispatchEventToSource` reads
 * the source from its registry at the drop).
 */
function end({ targets }: DragEnd) {
  // It leaves from where it is drawn, the hand's last step: put first where
  // the drop says the pointer was, it would jump the frame it is behind.
  const now = performance.now();
  const drag = hint.aloft;
  hint.over = null;
  if (drag === null) {
    ghost?.remove();
    ghost = null;
    return;
  }
  const card = targets.find((one) => asCard(one.data) !== null);
  const to = card ? asCard(card.data) : null;
  const take = card ? takers.get(card.element) : undefined;
  if (to !== null && take && to !== drag.from) {
    land(drag, to, take, now);
    return;
  }
  setDown(tileOn(drag.from, drag.kind), now).then(() => {
    hint.aloft = null;
  });
}

/** The one monitor of kind drags, from the first tile that can be dragged on. */
let monitoring = false;
function monitorKinds() {
  if (monitoring) {
    return;
  }
  monitoring = true;
  monitorForElements({
    canMonitor: ({ source }) => asDrag(source.data) !== null,
    onDrag: ({ location }) => ghost?.move(pointOf(location.current.input)),
    onDrop: ({ location }) => end(endOf(location)),
  });
}

/**
 * A member's card as a drop target. A drop on the card the tile came from
 * is no hand-over; on any other, `onhand` hears the kind and answers
 * whether it went, the ghost holding the card's slot until it answers.
 */
export function memberDropTarget(
  member: () => string,
  onhand: (kind: string) => Promise<boolean>
) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    takers.set(node, onhand);
    const stop = dropTargetForElements({
      element: node,
      canDrop: ({ source }) => asDrag(source.data) !== null,
      getData: () => ({ type: "cawco/kind-card", member: member() }),
      onDragEnter: () => {
        hint.over = member();
      },
      onDragLeave: () => {
        if (hint.over === member()) {
          hint.over = null;
        }
      },
    });
    return () => {
      stop();
      takers.delete(node);
    };
  };
}
