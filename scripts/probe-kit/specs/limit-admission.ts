/**
 * Several sessions stopped at once are decided one after another in one
 * look, each seeing the moves before it (hub at-limit.ts `lookAtHolds`,
 * `decideStop`; admission.ts's ledger), and a move whose target's own part
 * fails goes to the next account the same decision weighed. On 2026-10-20
 * 06:10Z about 20 sessions held on full accounts moved onto e8b553ef within
 * 30 s as it reset, the moves claiming 85% of its 5-hour window between
 * them.
 *
 * The hub's own controller (createAtLimit, with its rebalancer) runs here on
 * a real hub database in $TMPDIR, its accounts read by the hub's own reader
 * (at-limit.ts `accountsRead`: placement's rows, the forecast's paces and
 * arrivals, the ledger): the machine side (carrying a conversation, idle
 * receipts, transcript lines) is the hub's ports, answered in-process.
 *
 * - herd (the design's leg 6): five sessions held on FULL, cold, each
 *   burning 11M weighted tokens an hour; two accounts with room, each 10%
 *   used and measured at $2.56 and 1M weighted tokens a percent: ROOM1
 *   resets in 2 h (running at 4% an hour once a session runs there), ROOM2
 *   in 3 h (6.7% an hour). ROOM1 lasts to its reset with three of them,
 *   ROOM2 with two. One look: the person's session moves first, then the
 *   orchestrator with a live child, then the rest by when they were held;
 *   each move's line shows the window filling with the moves before it; three
 *   land on ROOM1, two on ROOM2, and neither runs out before its reset.
 * - affinity: ROOM1's reading climbs to 45% with the sessions it took
 *   running there, cold, and THIRD signs in fresh; the rebalance pass that
 *   follows moves none of them.
 * - fallback (leg 14): a session on SRC at its limit, two fresh accounts T1
 *   and T2. T1's own part fails (its account's dir): the same decision moves
 *   it to T2. Another's copy clashes with a carry of the same conversation:
 *   it is held, never sent to T2, and the next look tries T1 again, its hold
 *   keeping its start.
 *
 *   bun scripts/probe-kit/run.ts limit-admission
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { Account, LimitWindow } from "../../../packages/core/src";
import type { DbShape } from "../../../packages/hub/src/db";
import type { HubLifetimeShape } from "../../../packages/hub/src/lifetime";
import type { Kit, Spec } from "../kit";

/** What the spec uses of the hub's Effect, which resolves only from the hub's own package. */
interface EffectApi {
  Effect: {
    gen: (body: () => Generator<unknown, unknown, never>) => unknown;
    provide: (effect: unknown, layer: unknown) => unknown;
    runPromise: <A>(effect: unknown) => Promise<A>;
  };
  Layer: { provideMerge: (that: unknown) => (self: unknown) => unknown };
}

const CONTEXT = 300_000;
const WINDOW = 1_000_000;
const MODEL = "claude-opus-5-5";
const MACHINE = "machine-admission";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const PER_PCT_USD = 2.56;
/** Weighted tokens a percent of each room account's window takes. */
const PER_PCT_TOKENS = 1_000_000;
/** What a move's journal line says its target's window comes to after it: "(≈1.1% of room1's window, 12% after)". */
const AFTER = /, (\d+)% after\)/;
/** Each held session's burn, weighted tokens an hour: 11% of a room account's window an hour. */
const BURN = 11_000_000;

const window = (percent: number, resetsAt: number): LimitWindow => ({
  group: "session",
  isActive: true,
  kind: "session",
  percent,
  resetsAt: new Date(resetsAt).toISOString(),
  scopeLabel: null,
  severity: percent >= 100 ? "critical" : "normal",
});

/** One recorded turn of `weighted` weighted tokens (its output, at 5×), costing `usd`. */
const turn = (
  instanceId: string,
  accountId: string,
  weighted: number,
  usd: number,
  at: number
) => ({
  instanceId,
  resultId: `${instanceId}-${at}`,
  model: MODEL,
  accountId,
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cacheWrite1hTokens: 0,
  outputTokens: weighted / 5,
  costUsd: usd,
  keepAlive: false,
  at: new Date(at),
});

const run = async (kit: Kit): Promise<void> => {
  const scratch = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "admission-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  // The hub's own Effect, as its modules resolve it (the kit has none).
  const { Effect, Layer } = (await import(
    Bun.resolveSync("effect", join(import.meta.dir, "../../../packages/hub"))
  )) as EffectApi;
  // The hub reads its database's path once, as its config loads: a spec
  // run beside this one may have loaded it first, on the default path (on
  // the host, the live hub's). Nothing is opened then.
  const { DB_PATH } = await import("../../../packages/hub/src/config");
  if (DB_PATH !== process.env.CAWCO_DB_PATH) {
    kit.check(
      "its hub database is its own scratch one",
      false,
      `the hub's config already read ${DB_PATH}`
    );
    return;
  }
  const { Db, DbLayer } = await import("../../../packages/hub/src/db");
  const { HubLifetime, HubLifetimeLayer } =
    await import("../../../packages/hub/src/lifetime");
  const { accountsRead, createAtLimit } =
    await import("../../../packages/hub/src/at-limit");
  const { createAdmission } =
    await import("../../../packages/hub/src/admission");
  const { runsOutBy } = await import("../../../packages/hub/src/placement");
  const { db, lifetime } = await Effect.runPromise<{
    db: DbShape;
    lifetime: HubLifetimeShape;
  }>(
    Effect.provide(
      Effect.gen(function* () {
        return { db: yield* Db, lifetime: yield* HubLifetime };
      }),
      Layer.provideMerge(HubLifetimeLayer)(DbLayer)
    )
  );
  try {
    const now = Date.now();
    const account = (name: string, order: number): Account => {
      const made = db.accounts.create({
        kind: "subscription",
        provider: "anthropic",
        label: name,
        identity: {
          email: `${name}@example.com`,
          organization: `org-${name}`,
          orgId: `org-${name}`,
        },
      });
      return db.accounts.patch(made.id, { order }) as Account;
    };
    const full = account("full", 0);
    const room1 = account("room1", 10);
    const room2 = account("room2", 11);
    const third = account("third", 12);
    db.accounts.setRouting({
      provider: "anthropic",
      yours: { strategy: "fill-first" },
      delegates: { strategy: "fill-first" },
      atLimit: {
        ...db.accounts.routing("anthropic").atLimit,
        move: true,
        waitMinutes: 15,
        moveWholeUnderK: 600,
      },
    });
    const signIn = (one: Account) =>
      db.accounts.putSignin({
        accountId: one.id,
        machineId: MACHINE,
        state: "signed-in",
      });
    for (const one of [full, room1, room2]) {
      signIn(one);
    }
    db.accounts.putReading(
      full.id,
      { windows: [window(100, now + 4 * HOUR)] },
      now
    );
    db.accounts.putReading(
      third.id,
      { windows: [window(100, now + 2 * HOUR)] },
      now
    );
    // Each room account measured from its own history: 0% → 10% across a
    // turn of $25.60 and 10M weighted tokens; its pace that rise over the
    // span its readings took.
    const measure = (one: Account, reset: number, from: number) => {
      db.accounts.putReading(one.id, { windows: [window(0, reset)] }, from);
      db.turnUsage.put(`${one.id}-history`, [
        turn(
          `${one.id}-history`,
          one.id,
          10 * PER_PCT_TOKENS,
          10 * PER_PCT_USD,
          from + 10 * MINUTE
        ),
      ]);
      db.accounts.putReading(
        one.id,
        { windows: [window(10, reset)] },
        now - 30 * MINUTE
      );
    };
    measure(room1, now + 2 * HOUR, now - 3 * HOUR);
    measure(room2, now + 3 * HOUR, now - 2 * HOUR);

    const open = (id: string, on: Account, parent?: string) => {
      db.openInstance({
        id,
        machineId: MACHINE,
        cwd: "/scratch" as never,
        harness: "claude",
        origin: "person",
        kind: "sdk" as never,
        permissionMode: "default",
        model: MODEL,
        accountId: on.id,
        sessionId: `${id}-session`,
        title: id,
      });
      db.markInstanceLive(id);
      if (parent) {
        db.patchInstance(id, { parentInstanceId: parent });
      }
      // Its cache written two hours ago: cold.
      db.updateKeepAlive(id, {
        cacheTtl: "1h",
        lastRequestAt: new Date(now - 2 * HOUR),
        contextTokens: CONTEXT,
      });
    };
    // Held in this order: the rest first, the person's session last.
    const herd = ["rest-1", "rest-2", "rest-3", "parent", "watched"];
    herd.forEach((id, at) => {
      open(id, full);
      db.turnUsage.put(id, [turn(id, full.id, BURN, 1, now - HOUR)]);
      db.atLimit.putHold({
        instanceId: id,
        accountId: full.id,
        until: now + 4 * HOUR,
        since: now - (50 - 10 * at) * MINUTE,
      });
    });
    // The orchestrator's live child, asleep on FULL: nothing moves it.
    open("child", full, "parent");
    db.sleepInstance("child");

    const moves: { id: string; to: string }[] = [];
    /** How each move answers, by session: kept by the target's own part, or by a clash of carries. */
    const fails = new Map<string, (to: string) => "target" | "clash" | null>();
    const rowOf = (id: string) => db.getInstancesByIds([id])[0];
    /** An account by the label the spec gave it, upper-cased. */
    const nameOf = (id: string): string =>
      db.accounts.get(id)?.label?.toUpperCase() ?? id;
    const admission = createAdmission(db);
    const waited = new Set(["watched"]);
    const atLimit = createAtLimit({
      db,
      lifetime,
      admission,
      accountOf: (row) => row.accountId ?? undefined,
      accountRows: (row, leaving) =>
        accountsRead(db, admission, row, leaving, {
          asks: {
            kind: row.parentInstanceId ? "delegates" : "yours",
            projectAccounts: null,
            taskAccounts: null,
          },
          machineName: "the scratch machine",
          owed: new Map(),
          provenSince: Date.now() - 8 * HOUR,
          window: WINDOW,
        }),
      cacheExpiresAt: (row) => {
        const at = row.lastRequestAt
          ? row.lastRequestAt.getTime() + HOUR
          : null;
        return at !== null && at > Date.now() ? at : null;
      },
      waitedOn: (row) => waited.has(row.id),
      carryHandMove: async () => undefined,
      changed: () => undefined,
      handMove: () => undefined,
      idle: async () => true,
      compactable: () => true,
      machineName: () => "the scratch machine",
      move: (row, accountId) => {
        moves.push({ id: row.id, to: accountId });
        const fail = fails.get(row.id)?.(accountId) ?? null;
        if (fail === "target") {
          return Promise.resolve({
            kept: {
              running: false,
              target: true as const,
              why: "copying its conversation on the scratch machine failed: no space left in its account's dir",
            },
          });
        }
        if (fail === "clash") {
          return Promise.resolve({
            kept: {
              running: false,
              why: "copying its conversation on the scratch machine failed: another move is copying its conversation right now",
            },
          });
        }
        db.patchInstance(row.id, { accountId });
        return Promise.resolve({});
      },
      named: (row) => row.id,
      note: (row, move, id) =>
        db.atLimit.putEvent({
          id: id ?? crypto.randomUUID(),
          instanceId: row.id,
          at: Date.now(),
          move,
        }),
      noticed: () => undefined,
      owe: () => undefined,
      owed: () => new Map(),
      refusedMove: () => undefined,
      resume: () => undefined,
      startedBy: () => undefined,
      unnote: () => undefined,
    } as Parameters<typeof createAtLimit>[0]);

    // Leg herd: one look at the holds, its journal read as it goes.
    const said: string[] = [];
    const { info } = console;
    console.info = (...args: unknown[]) => {
      said.push(args.map(String).join(" "));
      info(...args);
    };
    try {
      await atLimit.look();
    } finally {
      console.info = info;
    }
    const herdMoves = moves.filter((one) => herd.includes(one.id));
    kit.check(
      "herd: one look takes them in admission order: the person's session, then the orchestrator with a live child, then the rest by when they were held",
      JSON.stringify(herdMoves.map((one) => one.id)) ===
        JSON.stringify(["watched", "parent", "rest-1", "rest-2", "rest-3"]),
      herdMoves.map((one) => one.id).join(" > ")
    );
    const onto = (one: Account) =>
      herdMoves.filter((move) => move.to === one.id).map((move) => move.id);
    kit.check(
      "herd: three land on ROOM1, which lasts to its reset with three, and the other two on ROOM2",
      onto(room1).length === 3 && onto(room2).length === 2,
      `ROOM1 ${onto(room1).join(", ")}; ROOM2 ${onto(room2).join(", ")}`
    );
    // Each move's line: "(≈1.1% of room1's window, 12% after)".
    const afterOf = (name: string) =>
      said
        .filter(
          (line) =>
            line.includes(" moves from ") && line.includes(`to ${name}:`)
        )
        .map((line) => Number(line.match(AFTER)?.[1] ?? Number.NaN));
    const rising = (list: number[]) =>
      list.length > 1 &&
      list.every((one, at) => at === 0 || one > (list[at - 1] as number));
    const ledger1 = admission.ledger(room1.id, "nobody", Date.now());
    const ledger2 = admission.ledger(room2.id, "nobody", Date.now());
    kit.check(
      "herd: each later decision sees the earlier charges: the window each move's line says it leaves rises with every move onto it, and the ledger holds every move",
      rising(afterOf("room1")) &&
        rising(afterOf("room2")) &&
        ledger1.pendingMoves === 3 &&
        ledger2.pendingMoves === 2,
      `ROOM1 after each: ${afterOf("room1").join(", ")}% (${ledger1.pendingMoves} pending, ${ledger1.pendingPct?.toFixed(1)}%); ROOM2: ${afterOf("room2").join(", ")}% (${ledger2.pendingMoves} pending, ${ledger2.pendingPct?.toFixed(1)}%)`
    );
    // Both accounts read again as the next decision would: the sessions on
    // them now arriving there, at their burn, with each one's pace.
    const read = accountsRead(db, admission, rowOf("child"), full.id, {
      asks: { kind: "yours", projectAccounts: null, taskAccounts: null },
      machineName: "the scratch machine",
      owed: new Map(),
      provenSince: 0,
      window: WINDOW,
    });
    const outOf = (one: Account, more = 0) => {
      const row = read.accounts.find((each) => each.id === one.id);
      return row
        ? runsOutBy(row.windows, more, row.arrivals, row.id, Date.now())
        : -1;
    };
    kit.check(
      "herd: with every session it took arriving there, neither account runs out before its reset, and one more session would run either out",
      outOf(room1) === null &&
        outOf(room2) === null &&
        typeof outOf(room1, BURN) === "number" &&
        typeof outOf(room2, BURN) === "number",
      `ROOM1 runs out ${outOf(room1)} (with one more at ${outOf(room1, BURN)}), ROOM2 ${outOf(room2)} (with one more at ${outOf(room2, BURN)}); arrivals ${read.accounts.map((one) => `${nameOf(one.id)}:${one.arrivals.length}`).join(" ")}`
    );

    // Leg affinity: ROOM1 runs hot with what it took, THIRD signs in fresh.
    const admitted = new Set(onto(room1));
    db.accounts.putReading(
      room1.id,
      { windows: [window(45, now + 2 * HOUR)] },
      Date.now()
    );
    db.accounts.putReading(
      third.id,
      { windows: [window(0, Date.now() + 5 * HOUR)] },
      Date.now()
    );
    const before = moves.length;
    atLimit.accountsChanged();
    signIn(third);
    atLimit.accountsChanged();
    await atLimit.rebalance("anthropic", MACHINE);
    await atLimit.look();
    // The sign-in's own pass runs detached (rebalance.ts `accountsChanged`):
    // given its moment to end.
    await Bun.sleep(1000);
    const movedAgain = moves
      .slice(before)
      .filter((one) => admitted.has(one.id));
    kit.check(
      "affinity: nothing moved onto ROOM1 moves again when THIRD frees",
      movedAgain.length === 0 &&
        [...admitted].every((id) => rowOf(id)?.accountId === room1.id),
      `${movedAgain.length} of ${admitted.size} moved again: ${movedAgain.map((one) => one.id).join(", ") || "none"}`
    );

    // Leg fallback: T1 and T2 fresh, ahead of every other account in order.
    const src = account("src", 1);
    const t1 = account("t1", 2);
    const t2 = account("t2", 3);
    for (const one of [src, t1, t2]) {
      signIn(one);
    }
    db.accounts.putReading(
      src.id,
      { windows: [window(100, Date.now() + 4 * HOUR)] },
      Date.now()
    );
    db.accounts.putReading(
      t1.id,
      { windows: [window(5, Date.now() + 4 * HOUR)] },
      Date.now()
    );
    db.accounts.putReading(
      t2.id,
      { windows: [window(5, Date.now() + 4 * HOUR)] },
      Date.now()
    );
    open("fallback", src);
    open("clash", src);
    fails.set("fallback", (to) => (to === t1.id ? "target" : null));
    fails.set("clash", (to) => (to === t1.id ? "clash" : null));
    const mark = moves.length;
    await atLimit.turnRefused("fallback");
    const tried = moves.slice(mark).filter((one) => one.id === "fallback");
    kit.check(
      "fallback: T1's own part fails, so the same decision moves it to T2, the next account it weighed",
      JSON.stringify(tried.map((one) => one.to)) ===
        JSON.stringify([t1.id, t2.id]) &&
        rowOf("fallback")?.accountId === t2.id &&
        !db.atLimit.hold("fallback"),
      `tried ${tried.map((one) => nameOf(one.to)).join(" > ")}; on ${nameOf(rowOf("fallback")?.accountId ?? "")}`
    );
    await atLimit.turnRefused("clash");
    const firstTry = moves.slice(mark).filter((one) => one.id === "clash");
    const heldSince = db.atLimit.hold("clash")?.since;
    await Bun.sleep(1100);
    await atLimit.look();
    const tries = moves.slice(mark).filter((one) => one.id === "clash");
    kit.check(
      "fallback: a clash with another carry of the same conversation holds it, never sends it to T2, and the next look tries T1 again, its hold keeping its start",
      firstTry.length === 1 &&
        tries.length === 2 &&
        tries.every((one) => one.to === t1.id) &&
        rowOf("clash")?.accountId === src.id &&
        heldSince !== undefined &&
        db.atLimit.hold("clash")?.since === heldSince,
      `tried ${tries.map((one) => nameOf(one.to)).join(" > ")}; held since ${heldSince} then ${db.atLimit.hold("clash")?.since}`
    );
  } finally {
    await lifetime.close();
  }
};

const spec: Spec = {
  name: "limit-admission",
  // A process of its own, so the hub's config reads its scratch database's
  // path (`CAWCO_DB_PATH`, set before any hub module loads in it), never one
  // another spec of the same run loaded first.
  ownHome:
    "it opens a hub database of its own, whose path the hub's config reads once, as its modules load",
  run,
};
export default spec;
