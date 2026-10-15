import { detach } from "@cawco/core/detach";
import { Effect, Layer } from "effect";
import { buildInfo } from "./build";
import {
  BIND_HOST,
  DB_PATH,
  HUB_PORT,
  HUB_VERSION,
  MAX_REQUEST_BYTES,
} from "./config";
import { Db, DbLayer } from "./db";
import { DatabaseHeld, lockDatabase } from "./db-lock";
import { HubLifetime, HubLifetimeLayer } from "./lifetime";
import { advertise } from "./mdns";
import { migrateLegacyDb } from "./migrate-db";
import { Pending, PendingLayer } from "./pending";
import { Registry, RegistryLayer } from "./registry";
import { createServer } from "./server";
import { createTelegramBridge } from "./telegram";
import { backfillUsage } from "./usage-count";

const main = Effect.gen(function* () {
  const registry = yield* Registry;
  const db = yield* Db;
  const pending = yield* Pending;
  const lifetime = yield* HubLifetime;
  const telegram =
    createTelegramBridge({ registry, db, pending, lifetime }) ?? undefined;
  // `idleTimeout` past Bun's 10s default: a request that waits on a machine
  // (an adopt reads its skill with a 10s timeout of its own) is silent that
  // whole time. No download from the internet is one of these: a skill,
  // plugin or marketplace fetch answers its request with `fetching` at once,
  // and what came of it is a `fleet.fetch` frame.
  // Before `listen`: every dashboard's first frame names this commit (see
  // `HubServices.build`), and two git calls are not worth a socket without it.
  const build = yield* Effect.promise(buildInfo);
  const server = createServer({
    build,
    registry,
    db,
    pending,
    telegram,
    lifetime,
  });
  server.listen({
    hostname: BIND_HOST,
    port: HUB_PORT,
    idleTimeout: 120,
    // A pack to the git remote and a large file to LFS stream through.
    maxRequestBodySize: MAX_REQUEST_BYTES,
  });
  server.previews.start();
  yield* Effect.log(`cawco hub ${HUB_VERSION} listening on :${HUB_PORT}`);
  advertise(HUB_PORT);
  // After `listen`, so the first ask the bridge can be handed is one this hub
  // is already able to receive.
  telegram?.start();
  // Off the boot path: a month of transcripts is read once, then never again.
  detach(backfillUsage(db), "usage backfill");
});

/** Boots the hub: what running this file does, and what `cawco hub` calls. */
export const startHub = async (): Promise<void> => {
  // Before anything opens or moves the database: one hub to it (db-lock.ts).
  try {
    await lockDatabase(DB_PATH);
  } catch (error) {
    if (error instanceof DatabaseHeld) {
      console.error(`[hub] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  migrateLegacyDb(DB_PATH);
  await Effect.runPromise(
    Effect.provide(
      main,
      // The parked asks a restarted hub still holds are read from its
      // database. Never closed here: SIGTERM stays the kernel's (lifetime.ts).
      PendingLayer.pipe(
        Layer.provideMerge(Layer.mergeAll(RegistryLayer, DbLayer)),
        Layer.provideMerge(HubLifetimeLayer)
      )
    )
  );
};

// A checkout's service spec (`packages/cli/src/service.ts`) and `bun --watch`
// run this file directly, where `import.meta.main` is true; the published
// package runs `cawco hub`, which imports it and calls `startHub`.
if (import.meta.main) {
  await startHub();
}
