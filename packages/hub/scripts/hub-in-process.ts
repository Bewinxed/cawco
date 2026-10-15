/**
 * A hub built in this process on a database file of the caller's: its
 * migrations run as it opens, as a real start's do, and its routes answer
 * through `hub.handle(request)` with no port. HOME and CAWCO_DB_PATH are
 * set before the hub's modules load, since config.ts reads them once, at
 * import; so this is the first thing that imports them.
 */
export async function hubInProcess(dbPath: string, home: string) {
  process.env.CAWCO_DB_PATH = dbPath;
  process.env.HOME = home;
  process.env.CAWCO_NO_MDNS = "1";
  const { Effect, Layer } = await import("effect");
  const { HUB_VERSION } = await import("../src/config");
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
            telegram: undefined,
            lifetime,
          },
          { resumeWorkflows: false }
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
