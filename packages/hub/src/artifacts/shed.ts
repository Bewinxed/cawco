/**
 * An artifact's doc shed of its deleted history: a new doc built from its
 * live values (core doc-swap.ts `rebuilt`) in place of its log, with the
 * record of what it let go (`retire`), which tells a device holding the old
 * doc to take the new one (artifacts/sync.ts).
 *
 * The hub sheds a doc when its history outweighs its content: when the
 * whole doc, encoded, is at least {@link SHED_WHEN} times what its live
 * content alone encodes to. A shed costs every device that holds the doc
 * one download of the live content (each takes the new doc whole), and
 * history costs every open of the doc its whole size, so it pays once the
 * history is as large as the content. The design-system board held 4.2 MB
 * for some 350 KB of live JSON (2026-11-26): 396,996 of its 397,460 items
 * were deleted overwrites of its pins' places.
 */
import { rebuilt, retire } from "@cawco/core/doc-swap";
import { type Doc, encodeStateAsUpdate } from "yjs";

/** How many times its live content's size a doc's whole is when its history is shed: history at least as large as the content. */
const SHED_WHEN = 2;

/** A shed's outcome: the new doc's whole state, the record to keep, and the sizes it went between. */
export interface Shed {
  /** The new doc, encoded: the log's one snapshot. */
  live: Uint8Array;
  /** The record of what was let go, every earlier shed's within it (core doc-swap.ts `retire`). */
  retired: Uint8Array;
  /** What the old doc encoded to, bytes. */
  was: number;
}

/**
 * `doc` shed, when its history outweighs its content ({@link SHED_WHEN});
 * `whole` is `encodeStateAsUpdate(doc)`, and `before` the artifact's record
 * of the sheds before. Null when it is kept as it is: its history is
 * smaller, or it holds a type a new doc can't be built from.
 */
export const shedOf = (
  doc: Doc,
  whole: Uint8Array,
  before: Uint8Array | null
): Shed | null => {
  const fresh = rebuilt(doc);
  if (!fresh) {
    return null;
  }
  const live = encodeStateAsUpdate(fresh);
  const founder = fresh.clientID;
  fresh.destroy();
  if (whole.length < SHED_WHEN * live.length) {
    return null;
  }
  return { live, retired: retire(doc, founder, before), was: whole.length };
};

/** A shed said in the hub's log: whose doc, from what size to what. */
export const shedLine = (id: string, shed: Shed): string =>
  `[artifacts] ${id}: its doc shed its deleted history, ${shed.was.toLocaleString("en")} bytes to ${shed.live.length.toLocaleString("en")}`;
