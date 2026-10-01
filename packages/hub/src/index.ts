import { Effect, Layer } from "effect";
import { buildInfo } from "./build";
import { DB_PATH, HUB_PORT, HUB_VERSION } from "./config";
import { Db, DbLayer } from "./db";
import { advertise } from "./mdns";
// The move itself lives in its own module so `cawco deploy init` can run it
// from the checkout that actually holds the legacy file. See migrate-db.ts.
import { migrateLegacyDb } from "./migrate-db";
import { Pending, PendingLayer } from "./pending";
import { startPreviewListener } from "./preview";
import { Registry, RegistryLayer } from "./registry";
import { createServer } from "./server";
import { createTelegramBridge } from "./telegram";
import { backfillUsage } from "./usage-count";

// biome-ignore lint/performance/noBarrelFile: re-exporting one already-imported name is not a barrel; `cawco deploy init` (see migrate-db.ts) needs migrateLegacyDb importable from this entrypoint.
export { migrateLegacyDb } from "./migrate-db";

const main = Effect.gen(function* () {
  const registry = yield* Registry;
  const db = yield* Db;
  const pending = yield* Pending;
  const telegram = createTelegramBridge({ registry, db, pending }) ?? undefined;
  // `idleTimeout` past Bun's 10s default: a skill refresh re-downloads and
  // hashes the whole skill before it says anything (impeccable is 3.2MB /
  // 147 files), and the socket is silent that whole time. 120s clears the
  // resolver's own 60s fetch timeout with room for the hash.
  const hostname = process.env.HOST ?? "0.0.0.0";
  // Before `listen`: every dashboard's first frame names this commit (see
  // `HubServices.build`), and two git calls are not worth a socket without it.
  const build = yield* Effect.promise(buildInfo);
  createServer({ build, registry, db, pending, telegram }).listen({
    hostname,
    port: HUB_PORT,
    idleTimeout: 120,
  });
  startPreviewListener(hostname);
  yield* Effect.log(`cawco hub ${HUB_VERSION} listening on :${HUB_PORT}`);
  advertise(HUB_PORT);
  // After `listen`, so the first ask the bridge can be handed is one this hub
  // is already able to receive.
  telegram?.start();
  // Off the boot path: a month of transcripts is read once, then never again.
  // biome-ignore lint/complexity/noVoid: fire-and-forget; the backfill logs its own outcome
  void backfillUsage(db);
});

/** Boots the hub: what running this file does, and what `cawco hub` calls. */
export const startHub = async (): Promise<void> => {
  migrateLegacyDb(DB_PATH);
  await Effect.runPromise(
    Effect.provide(main, Layer.mergeAll(RegistryLayer, DbLayer, PendingLayer))
  );
};

// A checkout's service spec (`packages/cli/src/service.ts`) and `bun --watch`
// run this file directly, where `import.meta.main` is true; the published
// package runs `cawco hub`, which imports it and calls `startHub`.
if (import.meta.main) {
  await startHub();
}
