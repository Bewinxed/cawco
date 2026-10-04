import { createRequire } from "node:module";
const { Effect, Layer } = await import(createRequire(new URL("../../packages/hub/package.json", import.meta.url)).resolve("effect"));

const [path, id, requestAt] = process.argv.slice(2);
if (!path || !id || !requestAt) {
  throw new Error("private-hub requires an owned database, probe id and synthetic request time");
}
process.env.CAWCO_DB_PATH = path;
const { Db, DbLayer } = await import("../../packages/hub/src/db");
const { Registry, RegistryLayer } = await import("../../packages/hub/src/registry");
const { Pending, PendingLayer } = await import("../../packages/hub/src/pending");
const { createServer } = await import("../../packages/hub/src/server");
const app = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
  const db = yield* Db;
  if (!db.getInstancesByIds([id]).length) {
    db.upsertAgent({ machineId: "keepalive-standin", hostname: "keepalive-standin", os: "linux", auth: "authenticated" });
    db.openInstance({ id, machineId: "keepalive-standin", cwd: import.meta.dir, sessionId: `${id}-conversation`, harness: "claude", title: "Private keep-alive fixture", kind: "mainline", permissionMode: "bypassPermissions", model: "claude-opus-5-5" });
    db.updateKeepAlive(id, { cacheTtl: "5m", lastRequestAt: new Date(Number(requestAt)) });
  }
  return createServer({ db, registry: yield* Registry, pending: yield* Pending, build: { version: "private", startedAt: Date.now() } }, { resumeWorkflows: false });
}), Layer.mergeAll(DbLayer, RegistryLayer, PendingLayer)));
app.listen({ hostname: "127.0.0.1", port: 0, idleTimeout: 120 });
console.log(`PRIVATE_READY ${app.server?.port}`);
