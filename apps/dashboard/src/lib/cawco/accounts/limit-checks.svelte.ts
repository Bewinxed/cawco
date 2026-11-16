/**
 * A pick on a row CawCo believes is at its limit (accounts/room.ts): the
 * limit is asked of the provider again before the pick goes. While it is
 * asked the row shows its live dot; the limit gone, the pick goes as any
 * other (the reading the hub then sends says the room); the limit still
 * there, or nothing could read it, the row holds the pick and offers the
 * force past it (Move anyway, Pick anyway). A stored limit never refuses a
 * pick, here or at the hub (limit-moves `landingRefusal`).
 *
 * The hub answers: it reads the account's windows now from its provider's
 * usage endpoint, on a machine it is signed in on (`POST
 * /api/accounts/:id/usage-read`, hub account-probes `readAccountUsageNow`),
 * and the room in that reading for the model picked says whether the limit
 * stands. A bench answers in its place (`answerLimitChecksWith`).
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { readUsageNow } from "../stores/accounts.svelte";
import { roomOf } from "./room-of";

/** What a check of a limit found. */
export type LimitAnswer =
  | { kind: "cleared" }
  | { kind: "still" }
  /** Nothing read the account's windows: `why`, in the hub's words. */
  | { kind: "unread"; why: string };

/** Asks the provider about `accountId`'s limit, for `model` or the account itself (null). */
export type LimitAsker = (
  accountId: string,
  model: string | null
) => Promise<LimitAnswer>;

/** The hub's read of the account now, and the room it has for `model` in it. */
const askHub: LimitAsker = async (accountId, model) => {
  const answer = await readUsageNow(accountId);
  if (answer.kind === "unread") {
    return answer;
  }
  const { reading } = answer;
  const room = roomOf(
    { fetchedAt: reading.readAt, stale: false, windows: reading.windows },
    model,
    Date.now()
  );
  return room?.kind === "limit" ? { kind: "still" } : { kind: "cleared" };
};

let asker: LimitAsker = askHub;

/** What answers each check from now on: a bench's stand-in for the hub. Returns its release: the hub answers again. */
export const answerLimitChecksWith = (next: LimitAsker): (() => void) => {
  asker = next;
  return () => {
    if (asker === next) {
      asker = askHub;
    }
  };
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
  const answer = await asker(accountId, model).catch(
    (error: unknown): LimitAnswer => ({
      kind: "unread",
      why: error instanceof Error ? error.message : String(error),
    })
  );
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
