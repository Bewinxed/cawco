/**
 * Fleet watch never calls a designed wait a loop, and its notices go once
 * there is nothing left to act on (hub fleet-watch.ts `designedWait`,
 * `itemEnded`, `forget`, and its start-up sweep). On 2026-10-20 two notices
 * stood on the owner's phone for sessions whose work had ended the day
 * before: 5fe1ed1b's "Same mcp__cawco__wait_item call 3 times in a row"
 * (its item landed) and 1a6976e4's machine disconnect three times (its
 * item failed). The only path that ever dropped a notice was a person's
 * send to the session.
 *
 * The hub's own fleet watch (createFleetWatch) runs here on a real hub
 * database in $TMPDIR, with no Jev route, so triage starts once two
 * signal kinds are open; the machine side (spawning triage, sends, lines)
 * is its deps, answered in-process.
 *
 * - waits: a session calls `mcp__cawco__wait_item` three times with the
 *   same input, each answered by the same tool error. Only the error kind
 *   opens, so no triage starts (on main the repeat opens too, and triage
 *   starts).
 * - item: a notice clears when its session's work item ends.
 * - forget: a notice clears when its session never runs again.
 * - start-up: a notice whose session has ended clears when the hub's fleet
 *   watch starts.
 *
 *   bun scripts/probe-kit/run.ts fleet-watch-clears
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { FleetWatchNotice } from "../../../packages/core/src";
import type { DbShape } from "../../../packages/hub/src/db";
import type { FleetWatchDeps } from "../../../packages/hub/src/fleet-watch";
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

const MACHINE = "machine-fleet-watch";

const run = async (kit: Kit): Promise<void> => {
  const scratch = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "watch-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  // The hub's own Effect, as its modules resolve it (the kit has none).
  const { Effect, Layer } = (await import(
    Bun.resolveSync("effect", join(import.meta.dir, "../../../packages/hub"))
  )) as EffectApi;
  const { Db, DbLayer } = await import("../../../packages/hub/src/db");
  const { HubLifetime, HubLifetimeLayer } =
    await import("../../../packages/hub/src/lifetime");
  const { createFleetWatch } =
    await import("../../../packages/hub/src/fleet-watch");
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
    const open = (id: string) => {
      db.openInstance({
        id,
        machineId: MACHINE,
        cwd: "/scratch" as never,
        harness: "claude",
        kind: "sdk" as never,
        permissionMode: "default",
        sessionId: `${id}-session`,
        title: id,
      });
      db.markInstanceLive(id);
    };
    const notice = (instanceId: string): FleetWatchNotice => ({
      id: crypto.randomUUID(),
      instanceId,
      machineId: MACHINE,
      projectId: null,
      title: "Same mcp__cawco__wait_item call 3 times in a row",
      body: "seeded",
      at: Date.now(),
    });
    const held = (instanceId: string) =>
      db.watchNotices().some((one) => one.instanceId === instanceId);
    const triages: string[] = [];
    const deps: FleetWatchDeps = {
      asking: () => false,
      db,
      end: () => undefined,
      interrupt: () => undefined,
      lifetime,
      line: () => undefined,
      name: (row) => row.id,
      notices: () => undefined,
      online: () => true,
      push: () => undefined,
      send: () => undefined,
      spawn: (_machine, payload) => {
        triages.push(payload.instanceId);
        return Promise.resolve();
      },
      stop: () => undefined,
      wakeCaw: () => Promise.resolve(false),
    };
    // Leg start-up: an ended session's notice, stored before the hub starts.
    open("ended");
    db.putWatchNotice(notice("ended"));
    db.endInstance("ended", "stop");
    db.confirmInstanceEnd("ended");
    const watch = createFleetWatch(deps) as ReturnType<
      typeof createFleetWatch
    > & {
      itemEnded?: (item: { instanceId: string | null }) => void;
    };
    kit.check(
      "start-up: a stored notice whose session has ended clears as fleet watch starts",
      !held("ended"),
      `notice for the ended session ${held("ended") ? "still stands" : "is gone"}`
    );

    // Leg waits: the same wait_item three times, each met by the same error.
    open("waiter");
    for (let i = 0; i < 3; i += 1) {
      watch.observe("waiter", {
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_use",
              id: `wait-${i}`,
              name: "mcp__cawco__wait_item",
              input: { minutes: 30, reason: "the host run of fe254744" },
            },
          ],
        },
      } as never);
      watch.observe("waiter", {
        type: "user",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: `wait-${i}`,
              is_error: true,
              content: "The machine disconnected during this request",
            },
          ],
        },
      } as never);
    }
    await Bun.sleep(50);
    kit.check(
      "waits: three wait_item calls in a row open no repeat, so one signal kind starts no triage",
      triages.length === 0,
      `triage runs started: ${triages.length}`
    );

    // Leg item: a notice clears when its session's work item ends.
    open("worker");
    db.putWatchNotice(notice("worker"));
    watch.itemEnded?.({ instanceId: "worker" });
    kit.check(
      "item: a notice clears when its session's work item ends",
      !held("worker"),
      `notice ${held("worker") ? "still stands" : "is gone"} after the item ended`
    );

    // Leg forget: a notice clears when its session never runs again.
    open("gone");
    db.putWatchNotice(notice("gone"));
    watch.forget("gone");
    kit.check(
      "forget: a notice clears when its session never runs again",
      !held("gone"),
      `notice ${held("gone") ? "still stands" : "is gone"} after forget`
    );
  } finally {
    await lifetime.close();
  }
};

const spec: Spec = { name: "fleet-watch-clears", run };
export default spec;
