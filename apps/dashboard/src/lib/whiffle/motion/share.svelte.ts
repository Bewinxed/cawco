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
 * transcript never squashes.
 */
import { CURVE, motionOk } from "./curves.svelte";

interface Departure {
  at: number;
  radius: string;
  rect: DOMRect;
  source: HTMLElement;
  ttl: number;
}

const departures = new Map<string, Departure>();

/** A departure waits this long for its destination to mount. */
const TTL = 1200;

export function depart(source: HTMLElement): void {
  const key = source.dataset.share;
  if (!key) {
    return;
  }
  departures.set(key, {
    rect: source.getBoundingClientRect(),
    radius: getComputedStyle(source).borderRadius,
    source,
    at: performance.now(),
    ttl: Number(source.dataset.shareTtl ?? TTL),
  });
}

/** Every shared source on the page departs: a navigation is starting. */
export function departAll(): void {
  for (const source of document.querySelectorAll<HTMLElement>("[data-share]")) {
    if (source.offsetParent !== null) {
      depart(source);
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
  /** `clip` opens the destination out of the source's box instead of scaling it. */
  mode?: "scale" | "clip";
  ms?: number;
  /** Scale both axes by the height ratio, so text keeps its shape. */
  uniform?: boolean;
}

function fly(node: HTMLElement, from: Departure, options: LandOptions) {
  const to = node.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) {
    return;
  }
  const { mode = "scale", uniform = false, ms = 280 } = options;
  from.source.style.visibility = "hidden";
  const reveal = () => {
    if (from.source.isConnected) {
      from.source.style.visibility = "";
    }
  };
  let frames: Keyframe[];
  if (mode === "clip") {
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
      fly(node, from, options);
    });
  };
}
