/**
 * The address tray's motion, on the house's tokens and curves (DESIGN.md,
 * Motion grammar). The advisor proposed two new tray tokens (270ms on
 * [0.26, 1, 0.5, 1]); the brief takes the nearest house pair instead:
 * --dur-pop on the drawer curve for the height between states (morph), and
 * the One Object Rule's own --dur-panel flight for the open.
 *
 * - `arrive`: a state's content coming in: opacity, from --leave-scale,
 *   out of the skeleton reveal's 2px cross-blur, over --dur-pop on
 *   ease-out; with less motion a fade over --dur-morph.
 * - `depart`: the content it replaces: lifted out of the flow where it
 *   stands (so it never pushes what arrives) and faded over --dur-exit.
 * - `openFrom` / `closeTo`: the source (the Needs you row, Settings' Set up)
 *   becoming the tray and the tray going back into it.
 */
import type { TransitionConfig } from "svelte/transition";
import {
  CURVE,
  dur,
  easeOut,
  lifting,
  motionOk,
  numberOf,
  pinned,
} from "#lib/cawco/motion/curves.svelte.js";

export function arrive(_node: Element): TransitionConfig {
  if (!motionOk.current) {
    return {
      duration: dur("--dur-morph"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  const scale = numberOf("--leave-scale");
  const blur = numberOf("--skeleton-reveal-blur");
  return {
    duration: dur("--dur-pop"),
    easing: easeOut,
    css: (t) =>
      `opacity: ${t}; scale: ${scale + (1 - scale) * t}; filter: blur(${((1 - t) * blur).toFixed(2)}px)`,
  };
}

export function depart(node: HTMLElement): TransitionConfig {
  if (!node.checkVisibility()) {
    return { duration: 0 };
  }
  return lifting(node, pinned(node), {
    duration: dur("--dur-exit"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  });
}

/** Where the tray opens from, in the page: a row in the flow, or a button it floats over. */
export interface Source {
  /** `row`: the tray takes the row's place in the flow; `float`: it floats over the button. */
  kind: "row" | "float";
  rect: DOMRect;
}

/** What fades in as the tray's box grows: everything but the box itself. */
const CONTENT = "[data-tray-content]";
/** Room the tray stands over its box (Caw's, over its top edge): it opens and closes with the box. */
const RISE = "[data-tray-rise]";

/**
 * The source's box opening into the tray (The One Object Rule): a row's
 * height grows to the tray's in the flow, so what is under it slides down
 * with it; a button's box opens by a clip to the tray floating over it.
 * The words fade in as the box grows. With less motion, a fade.
 */
export function openFrom(tray: HTMLElement, source: Source | null): void {
  const content = [...tray.querySelectorAll<HTMLElement>(CONTENT)];
  if (!(source && motionOk.current)) {
    tray.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: CURVE.out,
    });
    return;
  }
  const flight = { duration: dur("--dur-panel"), easing: CURVE.drawer };
  const box = tray.getBoundingClientRect();
  if (source.kind === "row") {
    tray.animate(
      [
        { height: `${source.rect.height}px`, overflow: "clip" },
        { height: `${box.height}px`, overflow: "clip" },
      ],
      flight
    );
    // Caw's room over the box opens with it, so the box starts where the row stood.
    for (const room of tray.querySelectorAll<HTMLElement>(RISE)) {
      room.animate(
        [{ height: "0px" }, { height: `${room.offsetHeight}px` }],
        flight
      );
    }
  } else {
    const radius = getComputedStyle(tray).getPropertyValue("--radius-md");
    const top = source.rect.top - box.top;
    const left = source.rect.left - box.left;
    const right = box.right - source.rect.right;
    const bottom = box.bottom - source.rect.bottom;
    tray.animate(
      [
        {
          clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`,
        },
        { clipPath: "inset(0 round 0)" },
      ],
      flight
    );
  }
  for (const one of content) {
    one.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      delay: dur("--dur-ghost"),
      easing: CURVE.out,
      fill: "backwards",
    });
  }
}

/** The tray going back into its source, faster than it came (The Fast Exit Rule); then `done`. */
export function closeTo(
  tray: HTMLElement,
  source: Source | null,
  done: () => void
): void {
  if (!(source && motionOk.current && tray.checkVisibility())) {
    done();
    return;
  }
  const leave = { duration: dur("--dur-exit"), easing: CURVE.drawer };
  const box = tray.getBoundingClientRect();
  for (const one of tray.querySelectorAll<HTMLElement>(CONTENT)) {
    one.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...leave,
      fill: "forwards",
    });
  }
  if (source.kind === "row") {
    for (const room of tray.querySelectorAll<HTMLElement>(RISE)) {
      room.animate([{ height: `${room.offsetHeight}px` }, { height: "0px" }], {
        ...leave,
        fill: "forwards",
      });
    }
  }
  const run =
    source.kind === "row"
      ? tray.animate(
          [
            { height: `${box.height}px`, overflow: "clip" },
            { height: `${source.rect.height}px`, overflow: "clip" },
          ],
          { ...leave, fill: "forwards" }
        )
      : tray.animate(
          [
            { clipPath: "inset(0 round 0)" },
            {
              clipPath: `inset(${source.rect.top - box.top}px ${box.right - source.rect.right}px ${box.bottom - source.rect.bottom}px ${source.rect.left - box.left}px round ${getComputedStyle(tray).getPropertyValue("--radius-md")})`,
            },
          ],
          { ...leave, fill: "forwards" }
        );
  run.finished.then(done, done);
}

/** The phone's sheet rising from the screen's foot, and its scrim. */
export function sheetIn(sheet: HTMLElement, scrim: HTMLElement | null): void {
  if (!motionOk.current) {
    sheet.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-control"),
      easing: CURVE.out,
    });
    return;
  }
  sheet.animate([{ translate: "0 100%" }, { translate: "0 0" }], {
    duration: dur("--dur-panel"),
    easing: CURVE.drawer,
  });
  scrim?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: dur("--dur-panel"),
    easing: CURVE.out,
  });
}

/** The sheet going back down, faster than it came; then `done`. */
export function sheetOut(
  sheet: HTMLElement,
  scrim: HTMLElement | null,
  done: () => void
): void {
  const leave = { duration: dur("--dur-exit"), easing: CURVE.drawer };
  scrim?.animate([{ opacity: 1 }, { opacity: 0 }], {
    ...leave,
    fill: "forwards",
  });
  const run = motionOk.current
    ? sheet.animate([{ translate: "0 0" }, { translate: "0 100%" }], {
        ...leave,
        fill: "forwards",
      })
    : sheet.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-control"),
        fill: "forwards",
      });
  run.finished.then(done, done);
}
