/**
 * The task-links-migration spec's hub (scripts/probe-kit/specs): this checkout's hub opened on a copy
 * of the live database (its migrations run, drizzle 0323 among them), its
 * boot work run as a serving hub's is, so `tasks.syncAll` rewrites every
 * project folder the copy holds (tasks.ts `migrateLinks`). Once each
 * folder named on the command line has its links commit (two minutes at
 * most), every project's board is read once, so its index has caught up,
 * and it exits. HOME and CAWCO_DB_PATH are set before the hub's modules load.
 *
 *   bun task-links-migration-hub.ts <db> <home> <projects dir> <folder>…
 */
import { readdirSync } from "node:fs";

const [db, home, projects, ...folders] = process.argv.slice(2);
process.env.CAWCO_DB_PATH = db;
process.env.HOME = home;
process.env.CAWCO_NO_MDNS = "1";
const { Effect, Layer } = await import("effect");
const { HUB_VERSION } = await import("../src/config");
const { Db, DbLayer } = await import("../src/db");
const { HubLifetime, HubLifetimeLayer } = await import("../src/lifetime");
const { Pending, PendingLayer } = await import("../src/pending");
const { Registry, RegistryLayer } = await import("../src/registry");
const { createServer } = await import("../src/server");
const app = await Effect.runPromise(
  Effect.provide(
    Effect.gen(function* () {
      return createServer(
        {
          build: { version: HUB_VERSION, startedAt: 0 },
          registry: yield* Registry,
          db: yield* Db,
          pending: yield* Pending,
          lifetime: yield* HubLifetime,
        },
        { background: true }
      );
    }),
    PendingLayer.pipe(
      Layer.provideMerge(Layer.mergeAll(RegistryLayer, DbLayer)),
      Layer.provideMerge(HubLifetimeLayer)
    )
  )
);
const migrated = (folder: string): boolean =>
  Bun.spawnSync(["git", "-C", folder, "log", "-1", "--format=%s"])
    .stdout.toString()
    .includes("links:");
const deadline = Date.now() + 120_000;
while (Date.now() < deadline && !folders.every(migrated)) {
  // biome-ignore lint/performance/noAwaitInLoops: a poll, once a second until the commits land
  await Bun.sleep(1000);
}
// Each project's board read once more: its index caught up with its files.
for (const id of readdirSync(projects)) {
  // biome-ignore lint/performance/noAwaitInLoops: one project's folder at a time, as the hub catches them up
  await app.handle(new Request(`http://127.0.0.1/api/projects/${id}/tasks`));
}
process.exit(0);
