import { resolve } from "node:path";

/**
 * A hub built in this process on a database file of the caller's: its
 * migrations run as it opens, as a real start's do, and its routes answer
 * through `hub.handle(request)` with no port. HOME and CAWCO_DB_PATH are
 * set before the hub's modules load, since config.ts reads them once, at
 * import; so this is the first thing that imports them, and it throws when
 * something in this process loaded them before on another database (a probe
 * spec that calls it runs in a process of its own: probe kit `ownProcess`).
 * It is a hub built only to be read (server.ts `serves: false`): it opens
 * no port, dials no machine or server and starts no poller, so a check on a
 * copy of the live database, run on the live hub's machine and network,
 * leaves the live hub's ports and machines alone.
 */
export async function hubInProcess(dbPath: string, home: string) {
  process.env.CAWCO_DB_PATH = dbPath;
  process.env.HOME = home;
  process.env.CAWCO_NO_MDNS = "1";
  const { Effect, Layer } = await import("effect");
  const { DB_PATH, HUB_VERSION } = await import("../src/config");
  if (DB_PATH !== resolve(dbPath)) {
    throw new Error(
      `the hub's modules were loaded in this process before hubInProcess(${dbPath}): their database is ${DB_PATH}. Call it before anything imports packages/hub/src, in a process of its own.`
    );
  }
  const { Db, DbLayer } = await import("../src/db");
  const { HubLifetime, HubLifetimeLayer } = await import("../src/lifetime");
  const { Pending, PendingLayer } = await import("../src/pending");
  const { Registry, RegistryLayer } = await import("../src/registry");
  const { createServer } = await import("../src/server");
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const db = yield* Db;
        const lifetime = yield* HubLifetime;
        const hub = createServer(
          {
            build: { version: HUB_VERSION, startedAt: 0 },
            registry: yield* Registry,
            db,
            pending: yield* Pending,
            lifetime,
          },
          { serves: false }
        );
        return { db, hub, lifetime };
      }),
      PendingLayer.pipe(
        Layer.provideMerge(Layer.mergeAll(RegistryLayer, DbLayer)),
        Layer.provideMerge(HubLifetimeLayer)
      )
    )
  );
}
