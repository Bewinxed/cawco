/**
 * A CANVAS'S SKELETON ELEMENTS, AS EXCALIDRAW DRAWS THEM: what an agent's
 * `elements` hold (core canvas.ts {@link SKELETON_TYPES}), read as
 * Excalidraw 0.18.1's own `ExcalidrawElementSkeleton`
 * (`@excalidraw/excalidraw/data/transform`) for each of those types, which
 * its `convertToExcalidrawElements` turns into elements on the canvas's
 * screen (agent canvas-host/scene.ts). The hub reads each as it is sent
 * ({@link sentSkeletonsRefusal}), and the screen again once a skeleton
 * replacing an element was filled from it ({@link filledSkeletonOf}).
 *
 * Where it stands: the conversion places a frame at the origin when it says
 * none (`case "frame": newFrameElement({ x: 0, y: 0, ...element })`), and
 * every other element at the `x` and `y` it carries, with no default
 * (`_newElementBase` takes `x` and `y` as given; an arrow's or a line's
 * ends are placed from its own, `bindLinearElementToElement`'s
 * `start.x || linearElement.x - width`). So a skeleton other than a frame
 * carries both, as Excalidraw's type says (`ElementConstructorOpts`), save
 * one that replaces an element of the canvas by its id, which takes what it
 * leaves out from that element (scene.ts `filled`).
 *
 * Each schema names the fields Excalidraw's type requires; every other
 * field it reads (a stroke, a width, a label's font) is kept whole, for
 * Excalidraw to read. A frame may leave its `children` out, as CawCo's own
 * frame that takes what its box holds (scene.ts `childless`); the screen
 * hands Excalidraw such a frame with none.
 */

import {
  array,
  type BaseIssue,
  getDotPath,
  type InferOutput,
  literal,
  looseObject,
  number,
  optional,
  picklist,
  safeParse,
  string,
  union,
  variant,
} from "valibot";
import { artifactToolWords } from "./words/artifact-tools";

/** The shapes an arrow's or a line's end may make where it stands, as Excalidraw's `ValidLinearElement` names them. */
const END_SHAPE = picklist(["rectangle", "ellipse", "diamond"]);

/**
 * An arrow's or a line's end (`ValidLinearElement` `start`/`end`): an
 * element it binds to by id, or a shape or text it makes there.
 */
const END = union([
  looseObject({ id: string(), type: optional(END_SHAPE) }),
  looseObject({ type: END_SHAPE, id: optional(string()) }),
  looseObject({
    id: string(),
    type: optional(literal("text")),
    text: string(),
  }),
  looseObject({
    type: literal("text"),
    text: string(),
    id: optional(string()),
  }),
]);

/** A container's or a line's label: its text, and its font and alignment for Excalidraw to read. */
const LABEL = looseObject({ text: string() });

/** Each skeleton type an agent writes, in Excalidraw's own shape ({@link SKELETON_TYPES}). */
const SKELETON = variant("type", [
  // ValidContainer
  looseObject({
    type: picklist(["rectangle", "ellipse", "diamond"]),
    id: optional(string()),
    x: number(),
    y: number(),
    label: optional(LABEL),
  }),
  // ValidLinearElement
  looseObject({
    type: picklist(["arrow", "line"]),
    id: optional(string()),
    x: number(),
    y: number(),
    label: optional(LABEL),
    start: optional(END),
    end: optional(END),
  }),
  looseObject({
    type: literal("text"),
    id: optional(string()),
    text: string(),
    x: number(),
    y: number(),
  }),
  looseObject({
    type: literal("frame"),
    id: optional(string()),
    children: optional(array(string())),
    name: optional(string()),
  }),
]);

/** A skeleton element as Excalidraw draws it ({@link SKELETON}). */
export type CanvasSkeleton = InferOutput<typeof SKELETON>;

/** A skeleton as an agent may send it: an object with a type, and an id where it has one. */
const SENT = looseObject({
  type: string(),
  id: optional(string()),
  x: optional(number()),
  y: optional(number()),
});

/** What broke a skeleton, in one line: the first issue its read met, and where. */
const firstIssue = (
  issues: readonly [BaseIssue<unknown>, ...BaseIssue<unknown>[]]
): string => {
  const [first] = issues;
  const at = getDotPath(first);
  return at === null ? first.message : `${first.message} at ${at}`;
};

/** How a refusal names a skeleton: its id, else its place in the list. */
const named = (id: string | undefined, index: number): string =>
  id === undefined ? `#${index + 1}` : `"${id}"`;

/**
 * Why `sent` is no skeleton Excalidraw draws, naming it by `index` or its
 * id; undefined when it is one. A skeleton replacing an element by its id
 * may leave out what it takes from that element; its x and y are read
 * again once it is filled ({@link filledSkeletonOf}).
 */
const sentRefusal = (sent: unknown, index: number): string | undefined => {
  const head = safeParse(SENT, sent);
  if (!head.success) {
    return artifactToolWords.skeletonUnread(
      named(undefined, index),
      firstIssue(head.issues)
    );
  }
  const { id, type, x, y } = head.output;
  if (id !== undefined) {
    return;
  }
  if (type !== "frame" && (x === undefined || y === undefined)) {
    return artifactToolWords.skeletonUnplaced(named(id, index));
  }
  const read = safeParse(SKELETON, sent);
  return read.success
    ? undefined
    : artifactToolWords.skeletonUnread(
        named(id, index),
        firstIssue(read.issues)
      );
};

/** Why the first of `elements` that is no skeleton Excalidraw draws is not ({@link sentRefusal}); undefined when each is one. */
export const sentSkeletonsRefusal = (
  elements: readonly unknown[]
): string | undefined => {
  for (const [index, sent] of elements.entries()) {
    const refusal = sentRefusal(sent, index);
    if (refusal !== undefined) {
      return refusal;
    }
  }
};

/**
 * `skeleton`, filled from the element it replaces where it does, as
 * Excalidraw draws it; one that is not throws, naming it by `index` or its
 * id, with the words the hub refuses it with.
 */
export const filledSkeletonOf = (
  skeleton: { id?: string; type: string; x?: unknown; y?: unknown },
  index: number
): CanvasSkeleton => {
  const name = named(skeleton.id, index);
  if (
    skeleton.type !== "frame" &&
    (skeleton.x === undefined || skeleton.y === undefined)
  ) {
    throw new Error(artifactToolWords.skeletonUnplaced(name));
  }
  const read = safeParse(SKELETON, skeleton);
  if (!read.success) {
    throw new Error(
      artifactToolWords.skeletonUnread(name, firstIssue(read.issues))
    );
  }
  return read.output;
};
