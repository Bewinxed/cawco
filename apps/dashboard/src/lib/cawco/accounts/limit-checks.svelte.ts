/**
 * A pick on a row CawCo believes is at its limit (accounts/room.ts): the
 * limit is asked of the provider again before the pick goes. While it is
 * asked the row shows its live dot; the limit gone, the pick goes as any
 * other (the reading the hub then sends says the room); the limit still there, or the
 * provider not reachable, the row holds the pick and offers the force past
 * it (Move anyway, Pick anyway). A stored limit never refuses a pick.
 *
 * What answers is the hub's, set by `answerLimitChecksWith`: the hub has no
 * live check yet, so until one answers every limit reads as not checkable
 * and the force stands at once.
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** What a check of a limit found. */
export type LimitAnswer =
  | { kind: "cleared" }
  | { kind: "still" }
  /** The provider could not be asked; `host`: the machine holding the account is offline. */
  | { kind: "unasked"; host?: string };

/** Asks the provider about `accountId`'s limit, for `model` or the account itself (null). */
export type LimitAsker = (
  accountId: string,
  model: string | null
) => Promise<LimitAnswer>;

/** No live check is built on the hub yet: nothing can be asked. */
const unasked: LimitAsker = () => Promise.resolve({ kind: "unasked" });

let asker: LimitAsker = unasked;

/** What answers each check from now on: the hub's live check, once it has one. */
export const answerLimitChecksWith = (next: LimitAsker): void => {
  asker = next;
};

/** Rows being checked now, by key. */
const checking = new SvelteSet<string>();
/** Rows whose pick is held, by key: why. */
const held = new SvelteMap<string, LimitAnswer>();

/** Every check and hold forgotten: the readings start afresh. */
export function forgetLimitChecks(): void {
  checking.clear();
  held.clear();
}

export const limitChecks = {
  /** Whether the row `key` is being checked. */
  checking: (key: string): boolean => checking.has(key),
  /** Why the row `key` holds its pick, when it does. */
  held: (key: string): LimitAnswer | undefined => held.get(key),
  /** Whether any row is being checked: no other pick goes meanwhile. */
  get busy(): boolean {
    return checking.size > 0;
  },
};

/**
 * Picks the row `key`, at its limit as last read: asks again first, and
 * runs `go` once the limit has gone; else holds it with why.
 */
export async function pickPastLimit(
  key: string,
  accountId: string,
  model: string | null,
  go: () => void
): Promise<void> {
  if (checking.size > 0) {
    return;
  }
  held.delete(key);
  checking.add(key);
  const answer = await asker(accountId, model).catch((): LimitAnswer => ({
    kind: "unasked",
  }));
  checking.delete(key);
  if (answer.kind === "cleared") {
    go();
    return;
  }
  held.set(key, answer);
}

/** Move anyway, Pick anyway: the held pick goes as it stands. */
export function forcePast(key: string, go: () => void): void {
  held.delete(key);
  go();
}
