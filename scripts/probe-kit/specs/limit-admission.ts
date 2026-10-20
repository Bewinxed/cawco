/**
 * A reset never takes the herd (hub admission.ts, at-limit.ts `tryOnce`,
 * rebalance.ts `candidate`). On 2026-10-20 06:10Z about 20 sessions held on
 * full accounts moved onto e8b553ef within 30 s as it reset, each writing
 * its whole transcript into the new account's cold cache: the moves claimed
 * 85% of its 5-hour window between them.
 *
 * The hub's own controller (createAtLimit, with its rebalancer) runs here
 * on a real hub database in $TMPDIR, seeded as the fleet stood: the machine
 * side (carrying a conversation, idle receipts, transcript lines) is the
 * hub's ports, answered in-process. Three Claude accounts of three
 * organizations, and one more:
 *
 * - FULL at 100% of its 5-hour window for 4 hours, holding {@link HERD}
 *   sessions of 900k tokens whose 1-hour cache lapsed two hours ago;
 * - SOON at 100% for 30 minutes, holding one session W of 900k whose cache
 *   was written 10 minutes ago and lasts past SOON's reset;
 * - ROOM at 10%, its window measured at $2.56 a percent from its own
 *   history ($25.60 of turns while it went 0% → 10%);
 * - THIRD at 100%, signed in on the machine only in the last leg.
 *
 * Legs:
 * - herd: one look at the holds. Every session admitted onto ROOM fits: its
 *   reading plus the admitted sessions' projected re-reads and next-turn
 *   allowances stay under the 50% ceiling; at least one stays held; W waits
 *   on SOON, its own reset inside its cache's life.
 * - affinity: ROOM's reading climbs to 45% with the admitted sessions
 *   running there, cold, and THIRD signs in fresh; the rebalance pass that
 *   follows moves none of them.
 *
 *   bun scripts/probe-kit/run.ts limit-admission
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { Account, LimitWindow } from "../../../packages/core/src";
import { costForUsage } from "../../../packages/core/src";
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

const HERD = 18;
const CONTEXT = 900_000;
const MODEL = "claude-opus-5-5";
const MACHINE = "machine-admission";
const HOUR = 3_600_000;
/** admission.ts: the ceiling and the next-turn allowance, as the brief and its rows set them. */
const CEILING_PCT = 50;
const ALLOWANCE_USD = 0.42;
const PER_PCT_USD = 2.56;

const window = (percent: number, resetsAt: number): LimitWindow => ({
  group: "session",
  isActive: true,
  kind: "session",
  percent,
  resetsAt: new Date(resetsAt).toISOString(),
  scopeLabel: null,
  severity: percent >= 100 ? "critical" : "normal",
});

const run = async (kit: Kit): Promise<void> => {
  const scratch = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "admission-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  // The hub's own Effect, as its modules resolve it (the kit has none).
  const { Effect, Layer } = (await import(
    Bun.resolveSync("effect", join(import.meta.dir, "../../../packages/hub"))
  )) as EffectApi;
  const { Db, DbLayer } = await import("../../../packages/hub/src/db");
  const { HubLifetime, HubLifetimeLayer } =
    await import("../../../packages/hub/src/lifetime");
  const { createAtLimit } = await import("../../../packages/hub/src/at-limit");
  // On main there is no admission: the controller there is given none.
  const admissionModule =
    await import("../../../packages/hub/src/admission").catch(() => null);
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
    const account = (name: string): Account =>
      db.accounts.create({
        kind: "subscription",
        provider: "claude",
        label: name,
        identity: {
          email: `${name}@example.com`,
          organization: `org-${name}`,
          orgId: `org-${name}`,
        },
      });
    const full = account("full");
    const soon = account("soon");
    const room = account("room");
    const third = account("third");
    const signIn = (one: Account) =>
      db.accounts.putSignin({
        accountId: one.id,
        machineId: MACHINE,
        state: "signed-in",
      });
    for (const one of [full, soon, room]) {
      signIn(one);
    }
    db.accounts.putReading(
      full.id,
      { windows: [window(100, now + 4 * HOUR)] },
      now
    );
    db.accounts.putReading(
      soon.id,
      { windows: [window(100, now + 30 * 60_000)] },
      now
    );
    db.accounts.putReading(
      third.id,
      { windows: [window(100, now + 2 * HOUR)] },
      now
    );
    // ROOM's window measured from its own history: 0% → 10% over $25.60.
    const roomReset = now + 3 * HOUR;
    db.accounts.putReading(
      room.id,
      { windows: [window(0, roomReset)] },
      now - 2 * HOUR
    );
    db.turnUsage.put("history-turns", [
      {
        instanceId: "history-turns",
        resultId: "r1",
        model: MODEL,
        accountId: room.id,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
        costUsd: PER_PCT_USD * 10,
        keepAlive: false,
        at: new Date(now - 1.5 * HOUR),
      },
    ]);
    db.accounts.putReading(
      room.id,
      { windows: [window(10, roomReset)] },
      now - HOUR
    );

    const open = (id: string, on: Account, lastRequestAt: number) => {
      db.openInstance({
        id,
        machineId: MACHINE,
        cwd: "/scratch" as never,
        harness: "claude",
        kind: "sdk" as never,
        permissionMode: "default",
        model: MODEL,
        accountId: on.id,
        sessionId: `${id}-session`,
        title: id,
      });
      db.markInstanceLive(id);
      db.updateKeepAlive(id, {
        cacheTtl: "1h",
        lastRequestAt: new Date(lastRequestAt),
        contextTokens: CONTEXT,
      });
    };
    const herd = Array.from({ length: HERD }, (_, i) => `herd-${i}`);
    for (const id of herd) {
      open(id, full, now - 2 * HOUR);
      db.atLimit.putHold({
        instanceId: id,
        accountId: full.id,
        until: now + 4 * HOUR,
      });
    }
    open("warm-w", soon, now - 10 * 60_000);
    db.atLimit.putHold({
      instanceId: "warm-w",
      accountId: soon.id,
      until: now + 30 * 60_000,
    });

    const moves: { id: string; from: string; to: string; at: number }[] = [];
    const rowOf = (id: string) => db.getInstancesByIds([id])[0];
    const sessionPct = (id: string) =>
      db.accounts
        .readings()
        .find((one) => one.accountId === id)
        ?.windows.find((w) => w.kind === "session")?.percent ?? 0;
    const admission = admissionModule?.createAdmission(db);
    const atLimit = createAtLimit({
      db,
      lifetime,
      ...(admission ? { admission } : {}),
      accountOf: (row) => row.accountId ?? undefined,
      cacheExpiresAt: (row) => {
        const at = row.lastRequestAt
          ? row.lastRequestAt.getTime() + HOUR
          : null;
        return at !== null && at > Date.now() ? at : null;
      },
      waitedOn: () => false,
      carryHandMove: async () => undefined,
      changed: () => undefined,
      handMove: () => undefined,
      idle: async () => true,
      laterSince: () => undefined,
      machineName: () => "the scratch machine",
      move: (row, accountId) => {
        moves.push({
          id: row.id,
          from: row.accountId ?? "",
          to: accountId,
          at: Date.now(),
        });
        db.patchInstance(row.id, { accountId });
        return Promise.resolve(undefined);
      },
      named: (row) => row.id,
      nextFree: () => undefined,
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
      proven: () => new Set([full.id, soon.id, room.id, third.id]),
      refusedMove: () => undefined,
      resume: () => undefined,
      startedBy: () => undefined,
      // Placement for the spec: the first signed-in account read under 100%.
      target: (row, accountId, among) => {
        const signed = new Set(
          db.accounts
            .signins()
            .filter(
              (one) =>
                one.machineId === row.machineId && one.state === "signed-in"
            )
            .map((one) => one.accountId)
        );
        return (
          db.accounts
            .list()
            .find(
              (one) =>
                one.id !== accountId &&
                signed.has(one.id) &&
                sessionPct(one.id) < 100 &&
                (!among || among(one))
            )?.id ?? null
        );
      },
      unnote: () => undefined,
      warm: (row) =>
        !!row.lastRequestAt && row.lastRequestAt.getTime() + HOUR > Date.now(),
    } as Parameters<typeof createAtLimit>[0]);

    // Leg herd: one look at the holds, as a reset's look runs it.
    await atLimit.look();
    const ontoRoom = moves.filter((one) => one.to === room.id);
    const perSession =
      (costForUsage(
        MODEL,
        {
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheCreation: CONTEXT,
          cacheCreation1h: CONTEXT,
        },
        now
      ) ?? 0) + ALLOWANCE_USD;
    const projectedPct = 10 + (ontoRoom.length * perSession) / PER_PCT_USD;
    kit.check(
      `herd: the sessions admitted onto ROOM fit under the ${CEILING_PCT}% ceiling (10% read + projected re-reads and allowances)`,
      ontoRoom.length > 0 && projectedPct <= CEILING_PCT,
      `${ontoRoom.length} admitted at $${perSession.toFixed(2)} each, projected ${projectedPct.toFixed(1)}% of ROOM's window`
    );
    const stillHeld = herd.filter((id) => db.atLimit.hold(id));
    kit.check(
      "herd: the sessions that don't fit stay held on FULL",
      stillHeld.length > 0 &&
        stillHeld.length +
          ontoRoom.filter((one) => one.id !== "warm-w").length ===
          HERD,
      `${stillHeld.length} of ${HERD} still held`
    );
    kit.check(
      "herd: W, whose own account resets inside its cache's life, waits",
      !moves.some((one) => one.id === "warm-w") &&
        !!db.atLimit.hold("warm-w") &&
        rowOf("warm-w")?.accountId === soon.id,
      `moves of W: ${moves.filter((one) => one.id === "warm-w").length}; on ${rowOf("warm-w")?.accountId === soon.id ? "SOON" : "another account"}`
    );

    // Leg affinity: ROOM runs hot with what it took, THIRD signs in fresh.
    const admitted = new Set(ontoRoom.map((one) => one.id));
    db.accounts.putReading(
      room.id,
      { windows: [window(45, roomReset)] },
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
    await atLimit.rebalance("claude", MACHINE);
    await atLimit.look();
    // The sign-in's own pass runs detached (rebalance.ts `accountsChanged`):
    // given its moment to end.
    await Bun.sleep(1000);
    const movedAgain = moves
      .slice(before)
      .filter((one) => admitted.has(one.id));
    kit.check(
      "affinity: nothing admitted onto ROOM moves again when THIRD frees",
      movedAgain.length === 0 &&
        [...admitted].every((id) => rowOf(id)?.accountId === room.id),
      `${movedAgain.length} of ${admitted.size} moved again: ${movedAgain.map((one) => one.id).join(", ") || "none"}`
    );
  } finally {
    await lifetime.close();
  }
};

const spec: Spec = { name: "limit-admission", run };
export default spec;
