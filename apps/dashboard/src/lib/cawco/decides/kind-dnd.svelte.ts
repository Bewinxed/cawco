/**
 * Dragging a kind's tile from one member's card to another's, on Pragmatic
 * drag and drop as the board's cards are (tasks/board-dnd.svelte.ts): plain
 * attachments, no adapter layer. A drop is the same hand-over a press on the
 * tile and a pick in its list makes (Roster).
 *
 * The page draws the drag itself, in four parts:
 *
 * - Lift: the tile comes off its card as a ghost (a copy of it in the top
 *   layer) a little larger, on the overlay's shadow, and its place on the
 *   card stays as a dashed outline.
 * - Carry: the ghost follows the pointer on a spring and leans with the
 *   pointer's sideways speed, upright again as it slows.
 * - Hover: the card under it is edged, and a slot opens on it where the
 *   tile will stand, the tile's own height, in the kinds' order.
 * - Landing: let go over another card, the ghost settles into that slot and
 *   stays there until the hand-over is answered; taken, the tile stands in
 *   its place without a second flight; refused, or let go anywhere else, the
 *   ghost goes back into its outline on the card it came from.
 *
 * Not offered under a coarse pointer, for the board's reason: a long press
 * there scrolls, and the tile's press does the same job by tap.
 */
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { tick } from "svelte";
import { Spring } from "svelte/motion";
import { motionOk } from "#lib/platform/motion/curves.svelte.js";
import { type DragPoint, internalDraggable } from "../internal-drag";
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

/** How far the ghost leans at most, in degrees, and per px/ms of sideways speed. */
const LEAN_MAX = 9;
const LEAN_PER_SPEED = 5;
/** How much larger the ghost stands while held. */
const LIFT_SCALE = 0.04;
/** A pointer still for this long has stopped: the ghost straightens. */
const STILL_MS = 60;

/**
 * The tile in the hand: a copy of it in the top layer (a manual popover,
 * above every dialog and outside every container that would clip or
 * re-anchor a fixed box), driven by three springs: where it stands, its
 * lean, and its lift.
 */
class Ghost {
  readonly #node: HTMLElement;
  readonly #offset: DragPoint;
  readonly #pos: Spring<{ x: number; y: number; w: number }>;
  readonly #lean = new Spring(0, { stiffness: 0.12, damping: 0.45 });
  readonly #lift = new Spring(0, { stiffness: 0.2, damping: 0.6 });
  #last: { x: number; t: number } | null = null;
  #frame = 0;
  /** Where it is settling: the box it lands in, read every frame, so a slot still opening is followed. */
  #aim: (() => Element | null) | null = null;
  #settled: (() => void) | null = null;

  constructor(source: HTMLElement, at: DragPoint) {
    const box = source.getBoundingClientRect();
    this.#offset = { x: at.x - box.left, y: at.y - box.top };
    this.#pos = new Spring(
      { x: box.left, y: box.top, w: box.width },
      { stiffness: 0.24, damping: 0.74 }
    );
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
      transformOrigin: `${this.#offset.x}px ${this.#offset.y}px`,
      willChange: "transform",
    });
    node.append(copy);
    document.body.append(node);
    node.showPopover();
    this.#node = node;
    this.#draw();
    requestAnimationFrame(() => {
      node.style.boxShadow = "var(--shadow-overlay)";
    });
    this.#to(this.#lift, 1);
    this.#frame = requestAnimationFrame(this.#loop);
  }

  /** The pointer moved to `at`. */
  move(at: DragPoint) {
    if (this.#aim) {
      return;
    }
    const now = performance.now();
    if (this.#last && motionOk.current) {
      const speed = (at.x - this.#last.x) / Math.max(1, now - this.#last.t);
      this.#lean.target = Math.max(
        -LEAN_MAX,
        Math.min(LEAN_MAX, speed * LEAN_PER_SPEED)
      );
    }
    this.#last = { x: at.x, t: now };
    this.#to(this.#pos, {
      x: at.x - this.#offset.x,
      y: at.y - this.#offset.y,
      w: this.#pos.target.w,
    });
  }

  /** Settles into the box `aim` finds: upright, at rest, its shadow down. Answers once it is still there. */
  settle(aim: () => Element | null): Promise<void> {
    this.#aim = aim;
    this.#to(this.#lean, 0);
    this.#to(this.#lift, 0);
    this.#node.style.boxShadow = "none";
    return new Promise((done) => {
      this.#settled = done;
    });
  }

  remove() {
    cancelAnimationFrame(this.#frame);
    this.#node.remove();
  }

  #to<T>(spring: Spring<T>, value: T) {
    // A set that a later one supersedes settles as aborted, which Spring
    // itself takes (svelte/motion spring.js `d.promise.catch(noop)`).
    spring.set(value, { instant: !motionOk.current });
  }

  readonly #loop = () => {
    if (this.#aim) {
      const box = this.#aim()?.getBoundingClientRect();
      if (box) {
        const { x, y, w } = this.#pos.target;
        if (x !== box.left || y !== box.top || w !== box.width) {
          this.#to(this.#pos, { x: box.left, y: box.top, w: box.width });
        }
      }
      const { current, target } = this.#pos;
      if (
        Math.abs(current.x - target.x) < 0.5 &&
        Math.abs(current.y - target.y) < 0.5 &&
        Math.abs(current.w - target.w) < 0.5 &&
        this.#lift.current < 0.02 &&
        Math.abs(this.#lean.current) < 0.2
      ) {
        this.#settled?.();
        this.#settled = null;
      }
    } else if (
      this.#last &&
      performance.now() - this.#last.t > STILL_MS &&
      this.#lean.target !== 0
    ) {
      this.#lean.target = 0;
    }
    this.#draw();
    this.#frame = requestAnimationFrame(this.#loop);
  };

  #draw() {
    const { x, y, w } = this.#pos.current;
    this.#node.style.width = `${w}px`;
    this.#node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${this.#lean.current}deg) scale(${1 + LIFT_SCALE * this.#lift.current})`;
  }
}

/** The tile in the hand now; one at a time. */
let ghost: Ghost | null = null;

/** `kind`'s tile on `member`'s card, or the slot opened for it there. */
const tileOn = (member: string, kind: string) => () =>
  document.querySelector(
    `[data-member="${CSS.escape(member)}"] [data-kind="${CSS.escape(kind)}"], [data-member="${CSS.escape(member)}"] [data-slot-for="${CSS.escape(kind)}"]`
  );

/** Puts the ghost down in `aim`'s box, then takes it away. */
async function setDown(aim: () => Element | null) {
  const held = ghost;
  if (held === null) {
    return;
  }
  await held.settle(aim);
  held.remove();
  ghost = null;
}

/** Let go over `card`: the ghost settles into its slot while `card` hears the kind; refused, it goes home. */
async function land(
  drag: Aloft,
  to: string,
  take: (kind: string) => Promise<boolean>
) {
  hint.aloft = { ...drag, to };
  hint.over = null;
  const went = take(drag.kind);
  await tick();
  const [taken] = await Promise.all([
    went,
    ghost?.settle(tileOn(to, drag.kind)),
  ]);
  if (taken) {
    await tick();
    ghost?.remove();
    ghost = null;
    hint.aloft = null;
    return;
  }
  hint.aloft = { ...drag, to: null };
  await tick();
  await setDown(tileOn(drag.from, drag.kind));
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
      onMove: (at) => ghost?.move(at),
      onEnd: ({ targets }) => {
        const drag = hint.aloft;
        hint.over = null;
        if (drag === null) {
          return;
        }
        const card = targets.find((one) => asCard(one.data) !== null);
        const to = card ? asCard(card.data) : null;
        const take = card ? takers.get(card.element) : undefined;
        if (to !== null && take && to !== drag.from) {
          land(drag, to, take);
          return;
        }
        setDown(tileOn(drag.from, drag.kind)).then(() => {
          hint.aloft = null;
        });
      },
    });
  };
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
