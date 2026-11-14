import "@cawco/core/no-huge-pages";
import { rm } from "node:fs/promises";
import { readBuildInfo } from "@cawco/core/build-info";
import { DatabaseHeld, lockDatabase } from "@cawco/core/db-lock";
import { detach } from "@cawco/core/detach";
import { sayFetchCap } from "@cawco/core/fetch-cap";
import { keepFoldersPrivate } from "@cawco/core/folders";
import { newerDatabase } from "@cawco/core/migrations-ahead";
import { hubStoppedPath } from "@cawco/core/paths/hub";
import { writeStateFile } from "@cawco/core/state-file";
import { Effect, Layer } from "effect";
import {
  BIND_HOST,
  DB_PATH,
  HUB_PORT,
  HUB_VERSION,
  MAX_REQUEST_BYTES,
} from "./config";
import { Db, DbLayer } from "./db";
import { loopRecord, watchHubLoop } from "./hub-loop";
import { HubLifetime, HubLifetimeLayer } from "./lifetime";
import { advertise } from "./mdns";
import { Pending, PendingLayer } from "./pending";
import { Registry, RegistryLayer } from "./registry";
import { createServer } from "./server";
import { backfillUsage } from "./usage-count";

const main = Effect.gen(function* () {
  const registry = yield* Registry;
  const db = yield* Db;
  const pending = yield* Pending;
  const lifetime = yield* HubLifetime;
  // `idleTimeout` past Bun's 10s default: a request that waits on a machine
  // (an adopt reads its skill with a 10s timeout of its own) is silent that
  // whole time. A download from the internet is none of these: a skill,
  // plugin or marketplace fetch answers its request with `fetching` at once,
  // and what came of it is a `fleet.fetch` frame; a build's archive, which
  // its route waits on, lifts the timer for its request (binary-updates.ts).
  // Before `listen`: every dashboard's first frame names this commit (see
  // `HubServices.build`), and two git calls are not worth a socket without it.
  // Read once, at boot: a running hub is whatever it started as.
  const build = yield* Effect.promise(() =>
    readBuildInfo(async () => HUB_VERSION)
  );
  const server = createServer({
    build,
    registry,
    db,
    pending,
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
  // HTTPS on the machine's tailnet name, once its preview listeners stand.
  server.tailnet.start();
  yield* Effect.log(`cawco hub ${HUB_VERSION} listening on :${HUB_PORT}`);
  // Its loop watched from here on: a hold that never ends ends the hub, and
  // its service starts it again (hub-loop.ts).
  lifetime.onClose(watchHubLoop(loopRecord(DB_PATH)));
  advertise(HUB_PORT);
  // Off the boot path: a month of transcripts is read once, then never again.
  detach(backfillUsage(db), "usage backfill");
});

/** Boots the hub: what running this file does, and what `cawco hub` calls. */
export const startHub = async (): Promise<void> => {
  // Started without the fetch cap (by hand): the streams it relays can hold
  // its other requests back, and it says so (core fetch-cap.ts).
  sayFetchCap("hub");
  // CawCo's own folders, the hub's data dir among them, are this user's
  // alone, an install made under a looser umask included (core folders.ts).
  keepFoldersPrivate((line) => console.info(line));
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
  // A database a newer build migrated is not opened (core migrations-ahead.ts),
  // and why is kept beside it for `cawco status`; a start that opens it
  // removes that.
  const newer = newerDatabase(DB_PATH);
  if (newer) {
    await writeStateFile(hubStoppedPath(DB_PATH), `${newer}\n`);
    console.error(`[hub] ${newer}`);
    process.exit(1);
  }
  await rm(hubStoppedPath(DB_PATH), { force: true });
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
