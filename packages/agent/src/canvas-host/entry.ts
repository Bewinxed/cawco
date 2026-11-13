/**
 * An element's entry in the canvas doc's `elements` (y-excalidraw's `Y.Map`
 * per element): the element under `el`, its order key under `pos`, and
 * words under `by`, `made` and `at`. Yjs types a map's values as one type,
 * so each read narrows to the key it asks for.
 */
import type { CanvasAuthor } from "@cawco/core/canvas";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Map as YMap } from "yjs";

/** What an element's entry in the doc holds: the element itself, else words (its order key, its author, when it was written). */
export type Entry = YMap<ExcalidrawElement | string>;

/** The element `map` holds; undefined where it holds none. */
export const elementOf = (
  map: Entry | undefined
): ExcalidrawElement | undefined => {
  const el = map?.get("el");
  return typeof el === "object" ? el : undefined;
};

/** The element `map` holds, which every entry of the doc's `elements` does. */
export const theElement = (map: Entry): ExcalidrawElement => {
  const el = elementOf(map);
  if (!el) {
    throw new Error("An entry of the canvas holds no element.");
  }
  return el;
};

/** The author `map` keeps under `key` (`by`, `made`): undefined where it keeps none. */
export const authorOf = (
  map: Entry,
  key: "by" | "made"
): CanvasAuthor | undefined => {
  const author = map.get(key);
  return author === "person" || author === "agent" ? author : undefined;
};

/** The order key `map` keeps. */
export const posOf = (map: Entry): string | undefined => {
  const pos = map.get("pos");
  return typeof pos === "string" ? pos : undefined;
};
