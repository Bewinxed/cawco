/**
 * Shared elements: what exists on both sides of a change travels to its new
 * place instead of vanishing on one side and appearing on the other. A
 * section row's title and icon become the editor's header when you drill in
 * and go back into the row on the way out; a sidebar row becomes the tab it
 * opens; a fleet row opens into its conversation.
 *
 * A source carries `data-share="<key>"`. It departs — its rect is taken —
 * when it is clicked, and every source on the page departs when a
 * navigation starts (routes/+layout.svelte), so a page going away hands its
 * shared pieces to the page arriving. A destination lands with
 * `{@attach land(() => key)}`: when it mounts, or its key changes, and a
 * fresh departure waits under that key, it flies from the source's rect to
 * its own on the Web Animations API (FLIP, transform only) while the source
 * is hidden, so there is one object, never two. `mode: "clip"` opens a large
 * destination out of a small source by clipping instead of scaling, so a
 * transcript never squashes. `mode: "grow"` is for a destination somewhere
 * else that the source becomes (a field that opens into a palette): it
 * starts moved onto the source, cut to the source's box around its `anchor`
 * (the part of it that is the source), and travels home as the cut opens.
 */
import { CURVE, motionOk } from "./curves.svelte";

interface Departure {
  at: number;
  /** A click on the source took it, or a navigation sweeping the page did. */
  by: "click" | "navigation";
  radius: string;
  rect: DOMRect;
  source: HTMLElement;
  /** The source stays drawn while its content travels (see `departBox`). */
  stays?: boolean;
  ttl: number;
}

const departures = new Map<string, Departure>();

/** A departure waits this long for its destination to mount. */
const TTL = 1200;

export function depart(
  source: HTMLElement,
  by: Departure["by"] = "click"
): void {
  const key = source.dataset.share;
  if (!key) {
    return;
  }
  // A source clicked on its way out was taken where it stood when it was
  // clicked. By the time the navigation it caused starts, it may be inside
  // a surface that has already left (a dialog after its exit): that later,
  // drawn-anywhere box does not replace the one the click took.
  const taken = departures.get(key);
  if (
    by === "navigation" &&
    taken?.by === "click" &&
    performance.now() - taken.at < taken.ttl
  ) {
    return;
  }
  departures.set(key, {
    by,
    rect: source.getBoundingClientRect(),
    radius: getComputedStyle(source).borderRadius,
    source,
    at: performance.now(),
    ttl: Number(source.dataset.shareTtl ?? TTL),
  });
}

/**
 * A source that stays where it is while what it held travels: the
 * composer's field, emptied into a send, stays drawn and ready for the next
 * message while its text flies into the row it became. Its box is taken
 * under `key`, which the destination names, and it is never hidden.
 */
export function departBox(key: string, source: HTMLElement): void {
  departures.set(key, {
    by: "click",
    rect: source.getBoundingClientRect(),
    radius: getComputedStyle(source).borderRadius,
    source,
    stays: true,
    at: performance.now(),
    ttl: TTL,
  });
}

/**
 * Sources the store takes away rather than a click: queued rows whose
 * messages the session just read as one turn. Their box — the one around all
 * of them — is taken where they still stand, before the state change that
 * removes them is drawn, under the `key` their destination lands, so several
 * rows close into the one row they became. Sources not on screen have
 * nothing to hand over.
 */
export function departFrom(selectors: string[], key: string): void {
  const sources = selectors.flatMap(
    (selector) => document.querySelector<HTMLElement>(selector) ?? []
  );
  const [first] = sources;
  if (!first) {
    return;
  }
  const rects = sources.map((source) => source.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  departures.set(key, {
    by: "click",
    rect: new DOMRect(
      left,
      top,
      Math.max(...rects.map((rect) => rect.right)) - left,
      Math.max(...rects.map((rect) => rect.bottom)) - top
    ),
    radius: getComputedStyle(first).borderRadius,
    source: first,
    stays: true,
    at: performance.now(),
    ttl: TTL,
  });
}

/**
 * Whether a fresh departure waits under `key`: a destination deciding how
 * to arrive (out of what was clicked, or on its own) asks before it lands.
 */
export function waiting(key: string): boolean {
  const from = departures.get(key);
  return !!from && performance.now() - from.at < from.ttl;
}

/**
 * A departure handed from one key to another. A Start is pressed before the
 * session it starts has an id, so it departs as `session:new`; once the
 * session exists, its departure becomes that session's, and only that
 * session's tab lands it — not whichever tab happens to mount first.
 */
export function handOver(from: string, to: string): void {
  const taken = departures.get(from);
  if (taken) {
    departures.delete(from);
    departures.set(to, taken);
  }
}

/** Every shared source on the page departs: a navigation is starting. */
export function departAll(): void {
  for (const source of document.querySelectorAll<HTMLElement>("[data-share]")) {
    if (source.offsetParent !== null) {
      depart(source, "navigation");
    }
  }
}

/** A click on a shared source departs it before whatever the click opens. */
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      const source = (event.target as Element | null)?.closest?.<HTMLElement>(
        "[data-share]"
      );
      if (source) {
        depart(source);
      }
    },
    { capture: true }
  );
}

export interface LandOptions {
  /** For `grow`: the part of the destination that the source is (a selector inside it). */
  anchor?: string;
  /**
   * `clip` opens the destination out of the source's box instead of scaling
   * it; `grow` also moves it there first (see above).
   */
  mode?: "scale" | "clip" | "grow";
  ms?: number;
  /** Scale both axes by the height ratio, so text keeps its shape. */
  uniform?: boolean;
}

function fly(node: HTMLElement, from: Departure, options: LandOptions) {
  const to = node.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) {
    return;
  }
  const { mode = "scale", uniform = false, ms = 280, anchor } = options;
  if (!from.stays) {
    from.source.style.visibility = "hidden";
  }
  const reveal = () => {
    if (!from.stays && from.source.isConnected) {
      from.source.style.visibility = "";
    }
  };
  let frames: Keyframe[];
  if (mode === "grow") {
    // The source's box laid over the anchor, their starts and middles lined
    // up, in the destination's own coordinates.
    const part = anchor
      ? (node.querySelector(anchor) as HTMLElement).getBoundingClientRect()
      : to;
    const left = part.left - to.left;
    const top = part.top - to.top + (part.height - from.rect.height) / 2;
    const right = to.width - left - from.rect.width;
    const bottom = to.height - top - from.rect.height;
    frames = [
      {
        transform: `translate(${from.rect.left - to.left - left}px, ${from.rect.top - to.top - top}px)`,
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${from.radius})`,
      },
      {
        transform: "none",
        clipPath: `inset(0px 0px 0px 0px round ${getComputedStyle(node).borderRadius})`,
      },
    ];
  } else if (mode === "clip") {
    const top = from.rect.top - to.top;
    const left = from.rect.left - to.left;
    const bottom = to.bottom - from.rect.bottom;
    const right = to.right - from.rect.right;
    frames = [
      {
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${from.radius})`,
        opacity: 0.6,
      },
      { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
    ];
  } else {
    const sy = from.rect.height / to.height;
    const sx = uniform ? sy : from.rect.width / to.width;
    frames = [
      {
        transformOrigin: "0 0",
        transform: `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px) scale(${sx}, ${sy})`,
      },
      { transformOrigin: "0 0", transform: "none" },
    ];
    // Scaled by its height, a destination wider for its height than its
    // source would start out wider than the source; its inline end is cut
    // back to the source's width, so the flight starts on the source's box
    // exactly and opens to its own as it lands.
    const spare = to.width - from.rect.width / sy;
    if (uniform && spare > 0.5) {
      const rtl = getComputedStyle(node).direction === "rtl";
      const cut = rtl ? `0 0 0 ${spare}px` : `0 ${spare}px 0 0`;
      const radius = getComputedStyle(node).borderRadius;
      frames[0].clipPath = `inset(${cut} round ${from.radius})`;
      frames[1].clipPath = `inset(0px 0px 0px 0px round ${radius})`;
    }
  }
  const animation = node.animate(frames, {
    duration: ms,
    easing: CURVE.drawer,
  });
  animation.finished.then(reveal, reveal);
}

/** Land a destination from the departure waiting under its key. */
export function land(key: () => string | undefined, options: LandOptions = {}) {
  return (node: HTMLElement) => {
    $effect(() => {
      const name = key();
      if (!name) {
        return;
      }
      const from = departures.get(name);
      if (!from || from.source === node) {
        return;
      }
      departures.delete(name);
      if (!motionOk.current || performance.now() - from.at > from.ttl) {
        return;
      }
      // The flight starts with the first frame that draws the destination:
      // a destination mounted during a long task (a whole page arriving) would
      // otherwise play its flight out before anything is painted, and first be
      // seen already landed. The callback runs before that frame is painted,
      // so the destination is never drawn at rest before it flies.
      requestAnimationFrame(() => {
        if (node.isConnected) {
          fly(node, from, options);
        }
      });
    });
  };
}

/**
 * The other direction: a floating surface closes into what it just made
 * (a popover's form into the row it added). The surface shrinks onto the
 * made thing's box — its full box, even while that box is still opening —
 * and fades as it goes, on the same curve as a landing; the returned
 * animation finishes when the surface is gone, so the caller closes it
 * then. With reduced motion there is no travel and nothing to wait for.
 */
export function closeInto(
  surface: HTMLElement,
  target: HTMLElement,
  ms = 280
): Animation | undefined {
  if (!motionOk.current) {
    return;
  }
  const from = surface.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || from.height === 0 || to.width === 0) {
    return;
  }
  const height = Math.max(to.height, target.scrollHeight);
  return surface.animate(
    [
      { transformOrigin: "0 0", transform: "none", opacity: 1 },
      {
        transformOrigin: "0 0",
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${height / from.height})`,
        opacity: 0,
      },
    ],
    { duration: ms, easing: CURVE.drawer, fill: "forwards" }
  );
}
