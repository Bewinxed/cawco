/**
 * What the person kept on a component canvas, held in the browser by its
 * artifact (PreviewPane's `memory` key), so a reload of the panel stands
 * where he left it: the component in front, and the state kept on each,
 * by its states file. It holds for the ask it was kept under: a new ask
 * opens on the state it names.
 */
import { GraphKeptSchema } from "#lib/cawco/stored-shapes.js";
import { readJson, writeJson } from "#lib/platform/storage.js";

/** One component's kept state: a state of its states file, and one of its variants (null: the state as written). */
export interface KeptState {
  state: string;
  variant: string | null;
}

export interface GraphKept {
  /** The ask they were kept under. */
  ask: string;
  /** The states file in front; null while he has picked none. */
  front: string | null;
  /** Each component's kept state, by its states file. */
  kept: Record<string, KeptState>;
}

/** What `key` holds for `ask`: nothing kept under another ask, or none. */
export const keptUnder = (key: string, ask: string): GraphKept | null => {
  const read = readJson(key, GraphKeptSchema.nullable(), null);
  return read && read.ask === ask ? read : null;
};

/** Keeps `kept` under `key`. */
export const keepUnder = (key: string, kept: GraphKept): void =>
  writeJson(key, kept);
