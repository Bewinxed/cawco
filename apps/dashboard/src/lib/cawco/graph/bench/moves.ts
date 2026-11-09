/**
 * What the stage page reads of the routine form's moves (stage-host canvas
 * stage.ts, its clips as `ClipRead`s), for the design graph's bench, whose
 * stand-in page draws the form but reads no animation off it: the moves
 * its states file names (`from`), each as the form plays it. Into Creating
 * and into Hub didn't answer, Create routine's label swaps to "Creating…"
 * on the house's morph; into Hub didn't answer the failure line unfolds
 * under it, and the label swaps back. Into Types read again, the delegate
 * type's line unfolds where the failure stood.
 */
import type { ClipRead, ClipValue } from "@cawco/core/stage-graph";
import { dur, ease } from "#lib/platform/motion/curves.svelte.js";

/** The page's ids for the things the form moves: a row names and rings one. */
const BUTTON = "create-routine";
const FAILURE = "form-failure";
const TYPE_LINE = "delegate-type-line";

let ids = 0;
/** One clip as the page reads it off the engine, on the house's ease-out. */
function clip(
  thing: string,
  element: string,
  property: string,
  start: number,
  token: `--dur-${string}`,
  values: ClipValue[]
): ClipRead {
  ids += 1;
  return {
    id: `${ids}`,
    target: thing,
    thing,
    element,
    property,
    kind: property.includes("height") ? "size" : "fade",
    start,
    delay: 0,
    duration: dur(token),
    easing: ease("--ease-out"),
    direction: "normal",
    iterations: 1,
    legs: [],
    frameCurve: null,
    framed: false,
    group: null,
    values,
  };
}

/** The label's swap: its old words out and its new in, on the morph. */
const swap = (start: number): ClipRead[] => [
  clip(BUTTON, "Button “Create routine”", "--swap-away", start, "--dur-morph", [
    { property: "--swap-away", from: "0", to: "1" },
  ]),
  clip(BUTTON, "Button “Create routine”", "opacity", start, "--dur-morph", [
    { property: "opacity", from: "1", to: "0" },
  ]),
];

/** A line unfolding under its field: its height and its ink, together. */
const unfold = (thing: string, element: string, start: number): ClipRead[] => [
  clip(thing, element, "height, opacity", start, "--dur-pop", [
    { property: "height", from: "0px", to: "20px" },
    { property: "opacity", from: "0", to: "1" },
  ]),
];

/** Each move the form's states file names, by the story it moves into. */
function clipsInto(story: string): ClipRead[] | null {
  switch (story) {
    case "Creating":
      return swap(24);
    case "FailedSave":
      return [
        ...swap(24),
        ...swap(626),
        ...unfold(FAILURE, "Form failure", 626),
      ];
    case "TypesReadAgain":
      return unfold(TYPE_LINE, "Delegate type’s line", 0);
    default:
      return null;
  }
}

/** The move into `to` from `from`, as the page reads it; null where the form plays none. */
export function moveInto(
  from: string,
  to: string
): { clips: ClipRead[]; from: string; length: number; to: string } | null {
  const clips = clipsInto(to);
  if (!clips) {
    return null;
  }
  const length = Math.max(...clips.map((one) => one.start + one.duration));
  return { clips, from, length, to };
}
