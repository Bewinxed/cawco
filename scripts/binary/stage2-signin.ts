/**
 * What the hub says of one machine's sign-in to one CawCo account, asked once
 * a second until the stop file is there: each ask a fetch of the hub's
 * /api/accounts, started on the second whether or not the asks before it have
 * answered, so a hub slow to answer (a loaded host, its restart in an update)
 * leaves the cadence at a second. Run inside the hub's container by the
 * installed binary acting as bun (BUN_BE_BUN=1), as stage2-sends.ts is.
 *
 *   cawco stage2-signin.ts <hub http url> <accountId> <machineId> <stop file>
 *
 * One line per ask, written as its answer comes, so lines may come out of
 * order: `<epoch ms> <word>`, the time the hub was asked (Date.now() at the
 * ask), the word the sign-in's `state` (`none` when the hub lists no such
 * sign-in), or `hub-away` when the hub did not answer it with a 2xx in
 * {@link ANSWER_MS}. Nothing else is written to stdout: every line is a sample.
 */
import { existsSync } from "node:fs";
import { readWithin } from "../../packages/core/src/bounded";

const [, , hub, accountId, machineId, stop] = Bun.argv;
if (!(hub && accountId && machineId && stop)) {
  throw new Error("usage: stage2-signin.ts HUB ACCOUNT MACHINE STOP_FILE");
}
const EVERY_MS = 1000;
const ANSWER_MS = 30_000;

interface Accounts {
  signins?: { accountId?: string; machineId?: string; state?: string }[];
}

/** The hub's word on the sign-in, or `hub-away` (no answer in time, refused, not a 2xx, not its JSON). */
const ask = async (): Promise<string> => {
  try {
    const read = await readWithin(ANSWER_MS, async (signal) => {
      const res = await fetch(`${hub}/api/accounts`, { signal });
      return res.ok ? ((await res.json()) as Accounts) : undefined;
    });
    if (read.kind === "unanswered" || !read.value) {
      return "hub-away";
    }
    const signin = read.value.signins?.find(
      (s) => s.accountId === accountId && s.machineId === machineId
    );
    return signin?.state || "none";
  } catch {
    return "hub-away";
  }
};

const pending = new Set<Promise<void>>();
let next = Date.now();
while (!existsSync(stop)) {
  const asked = Date.now();
  const sample = ask().then((word) => {
    console.log(`${asked} ${word}`);
  });
  pending.add(sample);
  sample.finally(() => pending.delete(sample));
  // The next ask on the next second of this one's schedule; a loop that woke
  // late skips the seconds it missed rather than asking for each at once.
  next += EVERY_MS;
  if (next < Date.now()) {
    next = Date.now() + EVERY_MS;
  }
  // biome-ignore lint/performance/noAwaitInLoops: the clock between asks, not the asks
  await Bun.sleep(next - Date.now());
}
await Promise.all(pending);
