/**
 * The order this page hears the hub's frames in, by the piece of state each
 * one writes, so a read's answer never lands over a frame newer than it.
 *
 * Every key here names state the hub frames to every dashboard on each change
 * of it (an act's own change included). A read's answer is taken somewhere
 * between the moment its request left and the moment it lands; a frame heard
 * in that span may have been taken after it. So an answer writes a piece of
 * state only when no frame for that piece was heard since its request left.
 * When one was, the frame stands: it is as new as the answer, or older with
 * the change between them still to come as a later frame. Kept by arrival
 * rather than a revision the hub stamps, since the socket delivers frames in
 * the order the hub sent them and a request leaves before the hub reads it.
 */
let order = 0;
const lastHeard = new Map<string, number>();

/** A frame for `key` was heard now. */
export function heardFrame(key: string): void {
  order += 1;
  lastHeard.set(key, order);
}

/** The moment a read leaves: what its answer is held against ({@link heardSince}). */
export function readLeaves(): number {
  return order;
}

/** Whether a frame for `key` was heard after the read that left at `mark`. */
export function heardSince(key: string, mark: number): boolean {
  return (lastHeard.get(key) ?? 0) > mark;
}
