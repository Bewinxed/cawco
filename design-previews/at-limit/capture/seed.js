/**
 * The client's stores, seeded with the hub's real records (records.json:
 * GET /api/accounts, /api/usage/limits, /api/instances and the held
 * session's transcript, read on the owner's hub at 08:16 UTC on
 * 2026-10-25) for one pass of the capture:
 *
 * - `moves`: the hold as it was: "Fix three failing workspace specs" at
 *   bewinxed@gmail.com's limit, moving to bewinxed@petralab.ai (Petralab)
 *   at 08:30 (its `stalled.until`), every other account benched or running
 *   out, as its transcript's account line records them.
 * - `resets`: the same session waiting for its own account's reset: its
 *   5-hour window's `resetsAt` (09:00) in /api/usage/limits, which is the
 *   account's bench `until` too.
 * - `fits`: as `resets`, with the one account that was not benched,
 *   bewinxed@petralab.ai (bewinxed@petralab.ai's Organization), able to
 *   take it with what its line recorded it had left (29%), and so waiting
 *   because its own reset is near (`soon`).
 * - `after`: `moves`, with the clock past its 08:30.
 *
 * Nothing is made up: every name, hue, title, time and percent is the
 * hub's. The clock is the moment the account line was written (its
 * timestamp), set by capture.ts before the page loads.
 *
 * On the design's tree a session's `stalled` carries `held`, as the hub's
 * at-limit controller builds it (hub at-limit.ts `stall`); on today's it
 * is the record as the hub sent it.
 */
import * as core from "../../../packages/core/src/index.ts";
import { cawco } from "../../../apps/dashboard/src/lib/cawco/client.svelte.ts";
import { entered } from "../../../apps/dashboard/src/lib/cawco/transcript/tray.svelte.ts";
import records from "./records.json";

/** The design's core: `stallWords` is new with it. */
export const DESIGNED = typeof core.stallWords === "function";

const GMAIL = "3c788add-0f48-4fe6-8b05-638c18bdc77a";
const ORG = "e8b553ef-e57f-429f-9b48-905760f5b675";

/** The held account's own 5-hour reset, as /api/usage/limits read it. */
const ownReset = () => {
  const usage = records.usage.find((one) => one.accountId === GMAIL);
  const session = usage.limits.windows.find((w) => w.kind === "session");
  return Date.parse(session.resetsAt);
};

/** The transcript's account line for the pass: the real one, or it with its own reset, and one account that fits. */
function moveFor(pass) {
  const real = records.accountRow.metadata.accountMove;
  if (pass === "moves" || pass === "after") {
    return real;
  }
  const { frees: _frees, ...own } = real;
  const resets = { ...own, until: ownReset() };
  if (pass === "resets") {
    return resets;
  }
  // An account could take it, so it waits because its own reset is near
  // (`soon`), never "no other account can take it" beside one that can.
  return {
    ...resets,
    why: "soon",
    accounts: real.accounts.map((one) =>
      one.account.id === ORG
        ? {
            account: one.account,
            reason: {
              kind: "fits",
              carries: false,
              leftPct: one.reason.leftPct,
            },
          }
        : one
    ),
  };
}

/** The held session's `stalled` for the pass, as each tree's hub sends it. */
function stalledFor(move) {
  const real = records.stalled.stalled;
  if (!DESIGNED) {
    return real;
  }
  const accounts = records.accounts.accounts;
  const own = accounts.find((one) => one.id === GMAIL);
  const held = {
    kind: "waiting",
    account: { id: GMAIL, name: core.accountNameAmong(own, accounts) },
    ...(move.frees ? { frees: move.frees } : {}),
    fits: core.fitsOf(move.accounts).map((one) => one.account),
  };
  return {
    words: core.stallWords(held, move.until, records.at),
    until: move.until,
    held,
  };
}

/** A delegate's work item, read off its session's record: what its tray chip stands for. */
const itemOf = (row, stalled) => ({
  id: row.workItemId,
  instanceId: row.id,
  parentInstanceId: row.parentInstanceId,
  leadInstanceId: null,
  machinePaused: null,
  stalled: stalled ? stalled.words : null,
  title: row.title,
  state: "running",
  createdAt: Date.parse(row.createdAt),
  endedAt: null,
  dismissedAt: null,
  dismissReason: null,
  replacedBy: null,
  firstLines: { brief: "", result: "", error: "" },
  queued: null,
  checkQueue: null,
  waitReason: null,
  waitUntil: null,
});

export function seed(pass) {
  const debug = globalThis.__cawcoDebug;
  const move = moveFor(pass);
  const stalled = stalledFor(move);
  // Past its reset the session carried on: the hub holds it no longer.
  const { stalled: _was, ...carried } = records.stalled;
  const held = pass === "after" ? carried : { ...records.stalled, stalled };
  debug.state.accounts = records.accounts;
  debug.adoptInstances([records.parent, held, ...records.neighbours]);
  // The tray lists its children's chips without waiting for their cards to leave view.
  const running = records.neighbours.filter(
    (row) => row.status === "running" && row.workItemId
  );
  for (const [row, stall] of [
    [records.stalled, pass === "after" ? null : stalled],
    ...running.map((row) => [row, null]),
  ]) {
    debug.state.workItems[row.workItemId] = itemOf(row, stall);
    entered.set(row.id, "none");
  }
  return {
    designed: DESIGNED,
    held: cawco.instanceIndex.byId.get(records.stalled.id),
    move,
    message: { ...records.accountRow, metadata: { ...records.accountRow.metadata, accountMove: move } },
    records,
  };
}
