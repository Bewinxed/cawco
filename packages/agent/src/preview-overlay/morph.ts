/// <reference lib="dom" />

/**
 * A re-published page morphs in place (Projects spec §5.10): the live
 * document becomes the new HTML with idiomorph, keeping every node it can,
 * so focus, scroll, typed values and the overlay itself survive, and
 * nothing reloads. Nothing moves under a hand: a morph waits while any
 * pointer is down, and the focused element is left as it is until it blurs.
 *
 * idiomorph runs no script it inserts (its `head: "morph"` imports nodes
 * from a parsed document), so the scripts the new HTML adds or changes are
 * run here once, after the morph; those it leaves as they were keep running.
 */
import { Idiomorph } from "idiomorph";

const pointers = new Set<number>();
let due: (() => void) | null = null;

const release = () => {
  if (pointers.size === 0 && due) {
    const run = due;
    due = null;
    run();
  }
};

/**
 * Starts counting pointers down. Installed before any listener that stops
 * a press from propagating (the overlay's element picker), so no press is
 * missed.
 */
export function watchPointers() {
  window.addEventListener(
    "pointerdown",
    (event) => {
      pointers.add(event.pointerId);
    },
    true
  );
  for (const type of ["pointerup", "pointercancel"] as const) {
    window.addEventListener(
      type,
      (event) => {
        pointers.delete(event.pointerId);
        release();
      },
      true
    );
  }
  // A press released outside the page is never heard; leaving the page ends it.
  window.addEventListener("blur", () => {
    pointers.clear();
    release();
  });
}

/** Runs `run` now, or once every pointer is up; a later call replaces an earlier one still waiting. */
export function whenPointersUp(run: () => void) {
  if (pointers.size === 0) {
    run();
  } else {
    due = run;
  }
}

/** A script as the page wrote it: what decides whether it is new. */
const signature = (script: HTMLScriptElement): string =>
  `${script.type}\u0000${script.getAttribute("src") ?? ""}\u0000${script.textContent ?? ""}`;

/** Runs a script once more by putting a fresh copy in its place. */
function rerun(script: HTMLScriptElement) {
  const fresh = document.createElement("script");
  for (const attribute of script.attributes) {
    fresh.setAttribute(attribute.name, attribute.value);
  }
  fresh.textContent = script.textContent;
  script.replaceWith(fresh);
}

/**
 * Morphs the document into `html`. `kept` names the nodes the morph leaves
 * exactly as they are (the overlay's host and its own script). Answers the
 * element that held focus and was left unmorphed, to morph again on its blur.
 */
export function morphPage(
  html: string,
  kept: (node: Node) => boolean
): Element | null {
  const active = document.activeElement;
  // With nothing focused the body is the active element, and idiomorph's
  // ignoreActive would leave the whole body unmorphed.
  const holding =
    active && active !== document.body && active !== document.documentElement
      ? active
      : null;
  const before = new Map<string, number>();
  for (const script of document.scripts) {
    if (!kept(script)) {
      const key = signature(script);
      before.set(key, (before.get(key) ?? 0) + 1);
    }
  }
  Idiomorph.morph(document.documentElement, html, {
    morphStyle: "outerHTML",
    head: { style: "morph" },
    restoreFocus: true,
    ignoreActive: holding !== null,
    ignoreActiveValue: true,
    callbacks: {
      beforeNodeMorphed: (node) => !kept(node),
      beforeNodeRemoved: (node) => !kept(node),
    },
  });
  for (const script of [...document.scripts]) {
    if (kept(script)) {
      continue;
    }
    const key = signature(script);
    const left = before.get(key) ?? 0;
    if (left > 0) {
      before.set(key, left - 1);
    } else {
      rerun(script);
    }
  }
  return holding;
}
