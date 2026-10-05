/** Private ownership integration proofs: real hub/agent/sessiond, sleeping stand-in children. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const [role, scratch, portText, old] = process.argv.slice(2);
const machine = "ownership-proof";
const pathEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
const CALLBACK_SOURCE = /packages\/agent\/src\/mcp-oauth\.ts$/;
const MAIN_BASE = "cf00ab303c89b2685186083af25f267a23bbd41b";

async function delay(ms: number) {
  await new Promise<void>((done) => setTimeout(done, ms));
}

async function until<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean
): Promise<T> {
  const deadline = Date.now() + 45_000;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each bounded observation follows the private stack's previous state
    const value = await read();
    if (accept(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label}: ${JSON.stringify(value)}`);
    }
    await delay(100);
  }
}

if (role && scratch) {
  assert.equal(
    homedir(),
    join(scratch, "home"),
    "Private HOME must be installed before the child runtime starts."
  );
  Object.assign(process.env, {
    HOME: join(scratch, "home"),
    XDG_CONFIG_HOME: join(scratch, "home", ".config"),
    CAWCO_MACHINE_ID: machine,
    CAWCO_DB_PATH: join(scratch, "hub.db"),
    CAWCO_SESSIOND_ENDPOINT: join(scratch, "sessiond.sock"),
    CAWCO_HUB_URL: `ws://127.0.0.1:${portText}/ws`,
    CAWCO_NO_MDNS: "1",
  });
}

if (role === "migration-main") {
  const require = createRequire(join(root, "packages/hub/package.json"));
  const { drizzle } = await import(require.resolve("drizzle-orm/bun-sqlite"));
  const { migrate } = await import(
    require.resolve("drizzle-orm/bun-sqlite/migrator")
  );
  const { Database } = await import("bun:sqlite");
  migrate(drizzle(join(scratch, "hub.db")), {
    migrationsFolder: join(scratch, "old/packages/hub/drizzle"),
  });
  const db = new Database(join(scratch, "hub.db"));
  const columns = db.query("PRAGMA table_info(instances)").all() as {
    name: string;
  }[];
  assert.ok(columns.some((column) => column.name === "cache_cold"));
  assert.ok(columns.some((column) => column.name === "last_ping_usage"));
  assert.ok(!columns.some((column) => column.name === "keep_alive_misses"));
  assert.ok(!columns.some((column) => column.name === "end_intent"));
  assert.equal(
    (
      db
        .query("SELECT MAX(created_at) AS last FROM __drizzle_migrations")
        .get() as { last: number }
    ).last,
    1_791_060_000_006
  );
  const workColumns = db.query("PRAGMA table_info(work_items)").all() as {
    name: string;
  }[];
  assert.ok(workColumns.some((column) => column.name === "wait_resume_by"));
  assert.ok(workColumns.some((column) => column.name === "wait_history"));
  db.query(
    "INSERT INTO agents(machine_id, hostname, os, created_at) VALUES(?, ?, ?, ?)"
  ).run(machine, machine, "private", Date.now());
  const insert = db.query(
    "INSERT INTO instances(id,machine_id,cwd,status,harness,session_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
  );
  for (const [id, status, harness, key] of [
    ["migrated-stop", "stopped", "opencode", "ses_migrated"],
    ["migrated-discard", "discarded", "claude", "conversation-migrated"],
    ["migrated-legacy", "discarded", "opencode", null],
    ["migrated-kept", "sleeping", "claude", "conversation-kept"],
  ]) {
    insert.run(
      id,
      machine,
      scratch,
      status,
      harness,
      key,
      Date.now(),
      Date.now()
    );
  }
  db.close();
  console.log(`MAIN_SCHEMA_READY ${MAIN_BASE}`);
} else if (role === "sessiond") {
  await import("../packages/sessiond/src/main");
} else if (role === "hub") {
  if (old === "old") {
    Bun.plugin({
      name: "main-hub-protocol",
      setup(build) {
        for (const file of [
          "packages/hub/src/server.ts",
          "packages/hub/src/db/index.ts",
          "packages/hub/src/db/schema.ts",
          "packages/core/src/index.ts",
        ]) {
          build.onLoad(
            {
              filter: new RegExp(
                `${file.replaceAll("/", "\\/").replaceAll(".", "\\.")}$`
              ),
            },
            async () => ({
              contents: await Bun.file(join(scratch, "old", file)).text(),
              loader: "ts",
            })
          );
        }
      },
    });
  }
  const { Effect, Layer } = await import(
    createRequire(join(root, "packages/hub/package.json")).resolve("effect")
  );
  const { Db, DbLayer } = await import("../packages/hub/src/db");
  const { Registry, RegistryLayer } = await import(
    "../packages/hub/src/registry"
  );
  const { Pending, PendingLayer } = await import("../packages/hub/src/pending");
  const { createServer } = await import("../packages/hub/src/server");
  const { Database } = await import("bun:sqlite");
  const app = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const db = yield* Db;
        const registry = yield* Registry;
        const sql = new Database(process.env.CAWCO_DB_PATH);
        const originalEnd = db.endInstance;
        const originalSession = db.noteInstanceSession;
        const faultDb = {
          ...db,
          noteInstanceSession: (
            ...args: Parameters<typeof originalSession>
          ) => {
            if (Bun.file(join(scratch, `pause-address-${args[0]}`)).size > 0) {
              return;
            }
            originalSession(...args);
          },
          endInstance: (...args: Parameters<typeof originalEnd>) => {
            const row = originalEnd(...args);
            if (Bun.file(join(scratch, `crash-${args[0]}`)).size > 0) {
              process.exit(73);
            }
            return row;
          },
        };
        return createServer(
          {
            db: faultDb,
            registry,
            pending: yield* Pending,
            build: { version: "private", startedAt: Date.now() },
          },
          { resumeWorkflows: false }
        )
          .post("/proof/seed", ({ body }) => {
            const data = body as {
              id: string;
              harness?: "claude" | "pi" | "opencode";
              status?: string;
              session?: boolean;
              sessionKey?: string;
              parent?: string;
              error?: string;
              mode?: string;
              workspace?: string;
              directory?: string;
              addressProtocol?: boolean;
              createdAt?: number;
              updatedAt?: number;
            };
            db.upsertAgent({
              machineId: machine,
              hostname: machine,
              os: "private",
              auth: "unauthenticated",
            });
            db.openInstance({
              id: data.id,
              addressProtocol: data.addressProtocol ?? false,
              machineId: machine,
              cwd: data.workspace ?? data.directory ?? scratch,
              sessionId:
                data.sessionKey ??
                (data.session ? `conversation-${data.id}` : undefined),
              harness: data.harness ?? "claude",
              kind: "mainline",
              model: "stand-in",
              permissionMode: data.mode ?? "bypassPermissions",
              parentInstanceId: data.parent,
            });
            sql
              .query(
                "UPDATE instances SET status = ?, last_error = ? WHERE id = ?"
              )
              .run(data.status ?? "sleeping", data.error ?? null, data.id);
            if (data.createdAt && data.updatedAt) {
              sql
                .query(
                  "UPDATE instances SET created_at=?, updated_at=? WHERE id=?"
                )
                .run(data.createdAt, data.updatedAt, data.id);
            }
            if (data.status === "discarded") {
              sql
                .query(
                  "UPDATE instances SET end_intent = 'discard', end_confirmed_at = CASE WHEN harness = 'opencode' AND session_id IS NULL THEN NULL ELSE updated_at END WHERE id = ?"
                )
                .run(data.id);
            }
            if (data.workspace) {
              const workspaceId = `workspace-${data.id}`;
              const itemId = `item-${data.id}`;
              db.createWorkspace({
                id: workspaceId,
                machineId: machine,
                repoRoot: data.workspace,
                path: data.workspace,
                branch: "private",
                base: "main",
                createdByInstanceId: data.parent ?? data.id,
              });
              db.createWorkItem({
                id: itemId,
                workspaceId,
                instanceId: data.id,
                parentInstanceId: data.parent ?? data.id,
                brief: "private",
                title: "Private finished work",
                harness: "claude",
                state: "done",
              });
              db.patchInstance(data.id, { workItemId: itemId });
            }
            return { ok: true };
          })
          .post("/proof/reattach", ({ body }) => {
            const row = db.ownedInstance((body as { id: string }).id);
            assert.ok(row);
            registry.agent(machine)?.send({
              verb: "spawn",
              machineId: machine,
              instanceId: row.id,
              payload: {
                instanceId: row.id,
                cwd: row.cwd,
                harness: row.harness ?? "claude",
                reattachOnly: true,
                processGeneration: JSON.stringify([row.id, row.spawnedAt]),
                ...(row.sessionId
                  ? { resume: { sessionKey: row.sessionId } }
                  : {}),
              },
            });
            return { ok: true };
          })
          .post("/proof/workflow", ({ body }) => {
            const data = body as {
              name: string;
              timeoutMinutes: number;
              prompt: string;
              program?: string;
            };
            const id = crypto.randomUUID();
            db.putWorkflow({
              id,
              name: data.name,
              slug: `private-${id}`,
              description: "Private ownership integration",
              graph: null,
              origin: "code",
              inputs: [],
              program:
                data.program ??
                `import { z } from "zod"; export const inputs = z.object({}); export default async function(w) { return await w.run({ title: ${JSON.stringify(data.name)}, harness: "claude", model: "stand-in", prompt: ${JSON.stringify(data.prompt)}, timeoutMinutes: ${data.timeoutMinutes}, retries: 1, output: z.object({ ok: z.boolean() }) }); }`,
            });
            return { id };
          })
          .get("/proof/rows", () => db.sessionOwnership())
          .get("/proof/schema", () => {
            const database = new Database(process.env.CAWCO_DB_PATH, {
              readonly: true,
            });
            const columns = database
              .query("PRAGMA table_info(instances)")
              .all();
            const migrations = database
              .query("SELECT MAX(created_at) AS last FROM __drizzle_migrations")
              .get();
            database.close();
            return { columns, migrations };
          })
          .post("/proof/owed", ({ body }) => {
            const input = body as {
              id: string;
              intent: "stop" | "delete";
              confirmed?: boolean;
            };
            db.endInstance(input.id, input.intent);
            if (input.confirmed) {
              db.confirmInstanceEnd(input.id);
            }
            return { ok: true };
          })
          .post("/proof/continuation", () => {
            const id = "summary-proof-continuation";
            const source = {
              instanceId: "workflow-supervisor-review",
              machineId: machine,
              cwd: scratch,
              title: "Private continuation",
              model: "stand-in",
              harness: "claude" as const,
            };
            db.insertContinuation({
              id,
              sourceInstanceId: source.instanceId,
              summariserInstanceId: "summary-proof-summariser",
              targetInstanceId: "summary-proof-target",
              stage: "summarising",
              summary: null,
              error: null,
              openingUuid: crypto.randomUUID(),
              request: {
                summarizer: { harness: "claude", model: "stand-in" },
                target: {
                  harness: "claude",
                  model: "stand-in",
                  machineId: machine,
                  cwd: scratch,
                },
              },
              prepared: {
                source,
                prompt: "private-summary-proof",
                extracted: {
                  artifacts: "",
                  middle: ["private history"],
                  tail: "private tail",
                },
                compacted: false,
                entries: { live: 1, whole: 1, scope: 1 },
                liveContextTokens: 100,
                openingTokens: 100,
                summariseInputTokens: 100,
              },
            });
            return { id };
          })
          .get("/proof/continuations", () => db.continuationRows())
          .get("/proof/visible", () => ({
            rows: db.listInstances(),
            byId: db.getInstancesByIds(
              db.sessionOwnership().map((row) => row.id)
            ),
          }));
      }),
      Layer.mergeAll(DbLayer, RegistryLayer, PendingLayer)
    )
  );
  app.listen({ hostname: "127.0.0.1", port: Number(portText) });
  console.log("PRIVATE_READY");
} else if (role === "agent") {
  if (old === "old") {
    Bun.plugin({
      name: "previous-agent-source",
      setup(build) {
        for (const file of [
          "packages/agent/src/daemon.ts",
          "packages/agent/src/session.ts",
          "packages/agent/src/sessiond-custody.ts",
          "packages/core/src/index.ts",
        ]) {
          build.onLoad(
            {
              filter: new RegExp(
                `${file.replaceAll("/", "\\/").replaceAll(".", "\\.")}$`
              ),
            },
            async () => ({
              contents: await Bun.file(join(scratch, "old", file)).text(),
              loader: "ts",
            })
          );
        }
      },
    });
  }
  Bun.plugin({
    name: "private-callback-port",
    setup(build) {
      build.onLoad({ filter: CALLBACK_SOURCE }, async ({ path }) => ({
        contents: (await Bun.file(path).text()).replace(
          "port: CAWCO_MCP_CALLBACK_PORT,",
          "port: 0,"
        ),
        loader: "ts",
      }));
    },
  });
  const { registerHarness } = await import("../packages/agent/src/harnesses");
  const { SessiondClient, endProc } = await import(
    "../packages/agent/src/sessiond-client"
  );
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT
  );
  const attempts = new Map<string, number>();
  const log = (event: string) =>
    writeFile(join(scratch, "events"), `${event}\n`, { flag: "a" });
  const transcript = (key: string) => join(scratch, `${key}.transcript`);
  const procId = (kind: string, id: string) => {
    if (kind === "pi") {
      return `pi:${id}`;
    }
    return kind === "opencode" ? `opencode-server-turn-${id}` : id;
  };
  for (const kind of ["claude", "pi", "opencode"] as const) {
    const session = (
      ctx: import("../packages/agent/src/harness").HarnessContext,
      sessionKey = `conversation-${ctx.instanceId}`
    ) => ({
      harness: kind,
      sessionId: sessionKey,
      attached: () =>
        ctx.frame({
          type: "system",
          subtype: "init",
          session_id: sessionKey,
          cwd: ctx.cwd,
        }),
      control: (method) => {
        if (method === "proofComplete") {
          ctx.frame({
            type: "result",
            subtype: "success",
            is_error: false,
            uuid: crypto.randomUUID(),
            result: "private summary preserved",
          });
        }
        if (method === "proofProviderRetry") {
          ctx.frame({
            type: "system",
            subtype: "provider_retry",
            retry: {
              message: "private delayed provider",
              nextAttemptAt: Date.now() + 86_400_000,
            },
          });
        }
        return Promise.resolve(undefined);
      },
      resolvePermission: () => undefined,
      interrupt: async () => undefined,
      dispose: async () => undefined,
      send: (message) => {
        log(`TURN ${ctx.instanceId}`).catch(console.error);
        const { content } = message.message;
        if (
          typeof content === "string" &&
          content.includes("private-held-midturn")
        ) {
          writeFile(
            join(scratch, `busy-${ctx.instanceId}`),
            "private active turn"
          ).catch(console.error);
          ctx.busy(true);
        }
        if (
          typeof content === "string" &&
          content.includes("Previous attempt:")
        ) {
          log(`RETRY_PROMPT ${ctx.instanceId}`).catch(console.error);
        }
        if (
          typeof content === "string" &&
          content.includes("private-summary-proof")
        ) {
          writeFile(
            transcript(`conversation-${ctx.instanceId}`),
            "private summary"
          )
            .then(() => {
              ctx.frame({
                type: "result",
                subtype: "success",
                is_error: false,
                uuid: crypto.randomUUID(),
                result: "private summary preserved",
              });
            })
            .catch(console.error);
        }
        if (typeof content === "string" && content.includes("[Workflow ")) {
          log(`NOTICE ${ctx.instanceId} ${content}`).catch(console.error);
        }
        if (
          typeof content === "string" &&
          content.includes("private-provider-retry") &&
          !content.includes("Previous attempt:")
        ) {
          ctx.frame({
            type: "system",
            subtype: "provider_retry",
            retry: {
              message: "private provider wait exceeds deadline",
              nextAttemptAt: Date.now() + 120_000,
            },
          });
        }
      },
      stop: async () => {
        while (
          // biome-ignore lint/performance/noAwaitInLoops: private gate makes an actual stop outlast the hub's normal halt window
          await Bun.file(join(scratch, `pause-stop-${ctx.instanceId}`)).exists()
        ) {
          await delay(100);
        }
        await endProc(client, procId(kind, ctx.instanceId));
      },
    });
    const adapter: import("../packages/agent/src/harness").Harness & {
      custodyCandidates: () => ReturnType<typeof client.list>;
      turnRunning: () => Promise<boolean>;
      adopt: (
        id: string,
        ctx: import("../packages/agent/src/harness").HarnessContext
      ) => Promise<ReturnType<typeof session>>;
    } = {
      kind,
      auth: "unauthenticated",
      capabilities: {
        permissionModes: ["bypassPermissions"],
      } as import("@cawco/core").HarnessCapabilities,
      detect: async () => ({
        harness: kind,
        installed: false,
        auth: "unauthenticated",
        capabilities: adapter.capabilities,
      }),
      busyInstances: async () => [],
      listSessions: async () => [],
      getSessionInfo: async (key) =>
        (await Bun.file(transcript(key)).exists())
          ? { sessionId: key, harness: kind, lastModified: Date.now() }
          : undefined,
      getSessionMessages: async (key) =>
        key.includes("summary-proof-summariser")
          ? [
              {
                type: "assistant",
                uuid: "private-summary-entry",
                session_id: key,
                parent_agent_id: null,
                parent_tool_use_id: null,
                turnEnd: true,
                message: {
                  role: "assistant",
                  content: [
                    { type: "text", text: "private summary preserved" },
                  ],
                },
              },
            ]
          : [],
      renameSession: async () => undefined,
      tagSession: async () => undefined,
      deleteSession: async (key) => {
        await log(`TEARDOWN ${key}`);
        // biome-ignore lint/performance/noAwaitInLoops: private fault gate deliberately delays transcript deletion across a hub restart
        while (await Bun.file(join(scratch, "pause-transcript")).exists()) {
          await delay(100);
        }
        await rm(transcript(key), { force: true });
      },
      endSession: async (key, _directory, _instanceId, claimed = []) => {
        if (claimed.includes(key)) {
          await log(`SHARED_NOT_ENDED ${key}`);
          return;
        }
        const id = key.replace("conversation-", "");
        await endProc(client, procId(kind, id));
        await until(
          "stand-in OpenCode exit",
          () => client.list(),
          (listing) =>
            !listing.procs.some(
              (proc) => proc.procId === procId(kind, id) && proc.alive
            )
        );
        await log(`RESOURCES_CLOSED ${key}`);
      },
      sessionAddresses: () => {
        const file = Bun.file(join(scratch, "legacy-live-addresses.json"));
        return file.size > 0 ? JSON.parse(readFileSync(file.name, "utf8")) : [];
      },
      sessionPresent: async (key, directory) => {
        if (
          await Bun.file(join(scratch, "incomplete-server-reading")).exists()
        ) {
          throw new Error("private incomplete server reading");
        }
        await log(`READ_PRESENT ${key} ${directory}`);
        return await Bun.file(transcript(key)).exists();
      },
      unclaimedRunners: async (directory, claimed) => {
        if (
          await Bun.file(join(scratch, "incomplete-server-reading")).exists()
        ) {
          throw new Error("private incomplete server reading");
        }
        await log(`READ_UNCLAIMED ${directory}`);
        const listing = await client.list();
        const count = listing.procs.filter(
          (proc) =>
            proc.alive &&
            proc.procId === "opencode-server-turn-unclaimed" &&
            !claimed.includes("conversation-unclaimed")
        ).length;
        return { count, readStartedAt: Date.now() };
      },
      custodyCandidates: async () => {
        const listing = await client.list();
        return {
          ...listing,
          procs: listing.procs.filter((proc) =>
            kind === "pi"
              ? proc.procId.startsWith("pi:")
              : !(
                  proc.procId.startsWith("pi:") ||
                  proc.procId.startsWith("opencode-server")
                )
          ),
        };
      },
      turnRunning: async (id) => Bun.file(join(scratch, `busy-${id}`)).exists(),
      adopt: async (id, ctx) => {
        const count = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, count);
        await log(`ATTACH ${id} ${count}`);
        if (id === "attach-retry" && count <= 2) {
          throw new Error("private attach refusal");
        }
        return session(ctx);
      },
      reattach: async (_spec, ctx) => {
        if (
          kind === "opencode" &&
          ctx.instanceId === "refused-address-review"
        ) {
          await ctx.recordSessionAddress?.(`conversation-${ctx.instanceId}`);
        }
        return await adapter.adopt(ctx.instanceId, ctx);
      },
      spawn: async (spec, ctx) => {
        await log(`SPAWN_BEGIN ${ctx.instanceId}`);
        if (kind === "opencode") {
          await log(`CREATED_SESSION ${ctx.instanceId}`);
          await ctx.recordSessionAddress?.(
            spec.resume?.sessionKey ?? `conversation-${ctx.instanceId}`
          );
          await log(`SKILL ${ctx.instanceId}`);
        }
        while (
          ctx.instanceId === "late-spawn" &&
          // biome-ignore lint/performance/noAwaitInLoops: private gate holds launch while its owner records end intent
          (await Bun.file(join(scratch, "pause-spawn")).exists())
        ) {
          await delay(100);
        }
        await client.spawnProc(procId(kind, ctx.instanceId), {
          command: "/bin/sleep",
          args: ["600"],
          cwd: ctx.cwd,
          env: pathEnv,
        });
        await log(`SPAWN ${ctx.instanceId}`);
        return session(
          ctx,
          spec.resume?.sessionKey ?? `conversation-${ctx.instanceId}`
        );
      },
    };
    registerHarness(adapter);
  }
  const { runDaemon } = await import("../packages/agent/src/daemon");
  runDaemon("unauthenticated");
} else if (!role) {
  const scratchDir = join(
    root,
    ".context",
    "ownership",
    `stack-${crypto.randomUUID()}`
  );
  await mkdir(join(scratchDir, "home", ".config", "cawco"), {
    recursive: true,
  });
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const { port } = lease;
  await lease.stop(true);
  const base = `http://127.0.0.1:${port}`;
  await writeFile(
    join(scratchDir, "home", ".config", "cawco", "config.json"),
    JSON.stringify({ hubUrl: base })
  );
  await mkdir(join(scratchDir, "old"), { recursive: true });
  const archived = Bun.spawn(
    [
      "git",
      "archive",
      MAIN_BASE,
      "packages/agent/src/daemon.ts",
      "packages/agent/src/session.ts",
      "packages/agent/src/sessiond-custody.ts",
      "packages/core/src/index.ts",
      "packages/hub/src/server.ts",
      "packages/hub/src/db/index.ts",
      "packages/hub/src/db/schema.ts",
      "packages/hub/drizzle",
    ],
    { cwd: root, env: pathEnv, stdout: "pipe", stderr: "pipe" }
  );
  const extracted = Bun.spawn(["tar", "-x", "-C", join(scratchDir, "old")], {
    cwd: root,
    env: pathEnv,
    stdin: archived.stdout,
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(await archived.exited, 0);
  assert.equal(await extracted.exited, 0);
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  const launch = (name: string, previous = false) => {
    const child = Bun.spawn(
      [
        "/usr/bin/env",
        `HOME=${join(scratchDir, "home")}`,
        `XDG_CONFIG_HOME=${join(scratchDir, "home", ".config")}`,
        `XDG_DATA_HOME=${join(scratchDir, "home", ".local", "share")}`,
        process.execPath,
        import.meta.path,
        name,
        scratchDir,
        String(port),
        previous ? "old" : "new",
      ],
      {
        cwd: root,
        env: pathEnv,
        stdout: Bun.file(
          join(scratchDir, `${name}-${previous ? "old" : "new"}.log`)
        ),
        stderr: Bun.file(
          join(scratchDir, `${name}-${previous ? "old" : "new"}.err`)
        ),
      }
    );
    children.add(child);
    return child;
  };
  const stop = async (child: ReturnType<typeof Bun.spawn> | undefined) => {
    if (child?.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([child.exited, delay(5000)]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      await child.exited;
    }
  };
  const api = async (
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST"
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const text = await response.text();
    assert.equal(response.status, 200, `${path}: ${text}`);
    return JSON.parse(text);
  };
  const rows = () =>
    api("/proof/rows") as Promise<
      {
        id: string;
        status: string;
        endIntent: string | null;
        endConfirmedAt: string | null;
      }[]
    >;
  const row = async (id: string) =>
    (await rows()).find((owner) => owner.id === id);
  const seed = (id: string, data: object = {}) =>
    api("/proof/seed", { id, ...data });
  let hub: ReturnType<typeof Bun.spawn> | undefined;
  let agent: ReturnType<typeof Bun.spawn> | undefined;
  let dashboard: WebSocket | undefined;
  let holder:
    | import("../packages/agent/src/sessiond-client").SessiondClient
    | undefined;
  const dashboardFrames: unknown[] = [];
  const readyHub = async () => {
    await until(
      "private hub",
      async () =>
        fetch(`${base}/health`)
          .then((response) => response.ok)
          .catch(() => false),
      Boolean
    );
    dashboard = new WebSocket(`${base.replace("http", "ws")}/ws/dashboard`);
    await new Promise<void>((done, fail) => {
      if (dashboard) {
        dashboard.onopen = () => done();
        dashboard.onerror = () => fail(new Error("private dashboard"));
        dashboard.onmessage = (event) =>
          dashboardFrames.push(JSON.parse(String(event.data)));
      }
    });
  };
  const startHub = async (previous = false) => {
    hub = launch("hub", previous);
    await readyHub();
  };
  const readyAgent = () =>
    until(
      "private agent",
      () => api("/api/agents"),
      (agents) =>
        agents.some(
          (entry: {
            machineId: string;
            status: string;
            custody?: { state: string };
          }) =>
            entry.machineId === machine &&
            entry.status === "online" &&
            entry.custody?.state === "available"
        )
    );
  const startAgent = async (previous = false) => {
    agent = launch("agent", previous);
    await readyAgent();
  };
  const disconnect = async () => {
    await stop(agent);
    agent = undefined;
    await until(
      "disconnected",
      () => api("/api/agents"),
      (agents) =>
        !agents.some((entry: { status: string }) => entry.status === "online")
    );
  };
  const send = (verb: string, id: string, payload: object) =>
    dashboard?.send(
      JSON.stringify(
        verb === "send"
          ? {
              type: "command",
              commandId: crypto.randomUUID(),
              kind: "send",
              machineId: machine,
              sessionId: id,
              payload: { instanceId: id, ...payload },
            }
          : {
              verb,
              machineId: machine,
              instanceId: id,
              payload: { instanceId: id, ...payload },
            }
      )
    );
  const end = (id: string, discard = false) => send("stop", id, { discard });
  const alive = async (id: string) =>
    (await holder?.list())?.procs.some(
      (proc) => proc.procId === id && proc.alive
    ) ?? false;
  const held = async (id: string) => {
    await holder?.spawnProc(id, {
      command: "/bin/sleep",
      args: ["600"],
      cwd: scratchDir,
      env: pathEnv,
    });
    return (await holder?.list())?.procs.find((proc) => proc.procId === id)
      ?.pid;
  };
  const confirmed = (id: string) =>
    until(
      `confirmed ${id}`,
      () => row(id),
      (owner) => owner?.status === "stopped" && !!owner.endConfirmedAt
    );
  const gone = (id: string) =>
    until(
      `row gone ${id}`,
      () => row(id),
      (owner) => !owner
    );
  const events = async () =>
    (await Bun.file(join(scratchDir, "events")).exists())
      ? Bun.file(join(scratchDir, "events")).text()
      : "";
  const pass = (id: number, text: string) => console.log(`PASS ${id} ${text}`);
  try {
    launch("sessiond");
    const { SessiondClient } = await import(
      "../packages/agent/src/sessiond-client"
    );
    holder = await until(
      "private sessiond",
      () =>
        SessiondClient.connect(join(scratchDir, "sessiond.sock"), 200).catch(
          () => undefined
        ),
      (client) => !!client
    );
    const migrated = launch("migration-main");
    assert.equal(await migrated.exited, 0);
    await startHub();
    const migratedSchema = await api("/proof/schema");
    assert.equal(migratedSchema.migrations.last, 1_791_060_000_007);
    assert.ok(
      migratedSchema.columns.some(
        (column: { name: string }) => column.name === "end_intent"
      )
    );
    const migratedRows = await api("/proof/rows");
    assert.ok(
      migratedRows.find((owner: { id: string }) => owner.id === "migrated-stop")
        .endConfirmedAt
    );
    assert.ok(
      migratedRows.find(
        (owner: { id: string }) => owner.id === "migrated-discard"
      ).endConfirmedAt
    );
    assert.equal(
      migratedRows.find(
        (owner: { id: string }) => owner.id === "migrated-legacy"
      ).endConfirmedAt,
      null
    );
    assert.equal(
      migratedRows.find((owner: { id: string }) => owner.id === "migrated-kept")
        .endIntent,
      null
    );
    console.log(
      `SECOND 1 main ${MAIN_BASE} 0071 and 0072 database migrates on branch hub startup to 0073 and backfills correctly`
    );
    await seed("offline-stop");
    await startAgent();
    await disconnect();
    await held("offline-stop");
    end("offline-stop");
    await until(
      "intent written",
      () => row("offline-stop"),
      (owner) => owner?.endIntent === "stop"
    );
    assert.equal((await row("offline-stop"))?.endConfirmedAt, null);
    await startAgent();
    await confirmed("offline-stop");
    assert.equal(await alive("offline-stop"), false);
    pass(1, "disconnected stop is delivered and confirmed on register");

    await disconnect();
    await seed("unknown-delete", { status: "unknown" });
    await held("unknown-delete");
    end("unknown-delete");
    await until(
      "explicit stop before removal",
      () => row("unknown-delete"),
      (owner) => owner?.endIntent === "stop"
    );
    await api("/api/instances/unknown-delete", undefined, "DELETE");
    assert.ok(await row("unknown-delete"));
    const visible = await api("/proof/visible");
    assert.ok(!JSON.stringify(visible).includes("unknown-delete"));
    await startAgent();
    await gone("unknown-delete");
    assert.equal(await alive("unknown-delete"), false);
    pass(
      2,
      "unknown-custody delete hides ownership and waits for exit before dropping it"
    );

    await seed("transcript-delete", { session: true });
    await held("transcript-delete");
    await writeFile(
      join(scratchDir, "conversation-transcript-delete.transcript"),
      "private transcript"
    );
    await writeFile(join(scratchDir, "pause-transcript"), "private gate");
    send("control", "transcript-delete", {
      requestId: "delete-proof",
      method: "deleteSession",
      args: ["conversation-transcript-delete", scratchDir],
    });
    await until(
      "transcript process confirmed",
      () => row("transcript-delete"),
      (owner) =>
        owner?.endIntent === "delete-transcript" && !!owner.endConfirmedAt
    );
    assert.equal(await alive("transcript-delete"), false);
    assert.ok(
      await Bun.file(
        join(scratchDir, "conversation-transcript-delete.transcript")
      ).exists()
    );
    await stop(hub);
    dashboard?.close();
    await rm(join(scratchDir, "pause-transcript"));
    await startHub();
    await readyAgent();
    await gone("transcript-delete");
    assert.equal(
      await Bun.file(
        join(scratchDir, "conversation-transcript-delete.transcript")
      ).exists(),
      false
    );
    pass(
      3,
      "transcript deletion follows exit and survives hub death after confirmation"
    );

    await disconnect();
    await seed("remove-machine-a");
    await seed("remove-machine-b");
    await held("remove-machine-a");
    await seed("removed-code-present", { harness: "opencode", session: true });
    await seed("removed-code-absent", { harness: "opencode", session: true });
    await seed("removed-code-legacy", { harness: "opencode" });
    await writeFile(
      join(scratchDir, "conversation-removed-code-present.transcript"),
      "private retained session"
    );
    await writeFile(
      join(scratchDir, "incomplete-server-reading"),
      "private reading fault"
    );
    await api(`/api/agents/${machine}`, undefined, "DELETE");
    assert.equal((await api("/api/agents")).length, 0);
    assert.ok(
      (await rows())
        .filter((owner) => owner.id.startsWith("remove-machine"))
        .every((owner) => owner.endIntent === null)
    );
    await startAgent();
    await until(
      "removed held row returns",
      () => api("/proof/visible"),
      (snapshot) => JSON.stringify(snapshot).includes("remove-machine-a")
    );
    await gone("remove-machine-b");
    assert.equal(await alive("remove-machine-a"), true);
    const removedRows = await api("/proof/rows");
    for (const id of [
      "removed-code-present",
      "removed-code-absent",
      "removed-code-legacy",
    ]) {
      const owner = removedRows.find((item: { id: string }) => item.id === id);
      assert.equal(owner.machineRemoved, true);
      assert.equal(owner.endIntent, null);
    }
    await rm(join(scratchDir, "incomplete-server-reading"));
    // A normal lifecycle trigger repeats the reading; no bespoke reconciliation loop.
    end("offline-stop");
    await until(
      "present server session returns",
      () => api("/proof/visible"),
      (snapshot) => JSON.stringify(snapshot).includes("removed-code-present")
    );
    await gone("removed-code-absent");
    await gone("removed-code-legacy");
    pass(
      4,
      "removed machine restores exact held children, drops absent children, and never ends either"
    );
    console.log(
      "REVIEW 3-known complete server reading restores present SDK id, drops absent SDK id, and incomplete reading settles neither"
    );
    console.log(
      "REVIEW 3-legacy complete empty-directory reading drops a hidden NULL-id row without an end intent"
    );

    await seed("parent");
    await seed("parent-stop", { parent: "parent" });
    await held("parent-stop");
    await writeFile(join(scratchDir, "crash-parent-stop"), "private crash");
    await api("/api/delegation/call/parent", {
      name: "stop_delegate",
      arguments: { target: "parent-stop" },
    }).catch(() => undefined);
    assert.equal(await hub?.exited, 73);
    assert.equal(await alive("parent-stop"), true);
    await rm(join(scratchDir, "crash-parent-stop"));
    dashboard?.close();
    await startHub();
    await readyAgent();
    await confirmed("parent-stop");
    assert.equal(await alive("parent-stop"), false);
    await seed("late-spawn");
    await writeFile(join(scratchDir, "pause-spawn"), "private spawn gate");
    send("spawn", "late-spawn", {
      cwd: scratchDir,
      harness: "claude",
      model: "stand-in",
      permissionMode: "bypassPermissions",
    });
    await until("spawn pending", events, (text) =>
      text.includes("SPAWN_BEGIN late-spawn")
    );
    const refusedRemove = await fetch(`${base}/api/instances/late-spawn`, {
      method: "DELETE",
    });
    assert.equal(refusedRemove.status, 409);
    assert.equal(
      await refusedRemove.text(),
      "This session is still running. Stop it first"
    );
    console.log(
      "REVIEW 19 removing a starting session refuses with 409 Stop it first"
    );
    end("late-spawn");
    await until(
      "late-spawn end intent",
      () => row("late-spawn"),
      (owner) => owner?.endIntent === "stop"
    );
    await api("/api/instances/late-spawn", undefined, "DELETE");
    await delay(300);
    assert.ok(await row("late-spawn"));
    assert.equal((await row("late-spawn"))?.endConfirmedAt, null);
    await rm(join(scratchDir, "pause-spawn"));
    await gone("late-spawn");
    assert.equal(await alive("late-spawn"), false);
    assert.ok((await events()).includes("SPAWN late-spawn"));
    pass(
      5,
      "parent stop survives hub death; an in-flight spawn is ended before its delete confirms"
    );

    await disconnect();
    await seed("attach-retry");
    const pid = await held("attach-retry");
    await startAgent();
    await until("third attach", events, (text) =>
      text.includes("ATTACH attach-retry 3")
    );
    assert.equal(
      (await holder?.list())?.procs.find(
        (proc) => proc.procId === "attach-retry"
      )?.pid,
      pid
    );
    assert.equal(await alive("attach-retry"), true);
    assert.ok(
      !JSON.stringify(dashboardFrames).includes("private attach refusal")
    );
    assert.equal((await row("attach-retry"))?.endIntent, null);
    pass(
      6,
      "two failed attaches retry to success without stopping or reporting kept work"
    );

    const { CLAUDE_CONVERSATION_GONE } = await import("../packages/core/src");
    await disconnect();
    await seed("conversation-gone", {
      error: CLAUDE_CONVERSATION_GONE,
      status: "error",
    });
    await seed("refused-mode", { mode: "refused", status: "error" });
    await held("conversation-gone");
    await held("refused-mode");
    await startAgent();
    await until(
      "held refusal rows adopted",
      events,
      (text) =>
        text.includes("ATTACH conversation-gone") &&
        text.includes("ATTACH refused-mode")
    );
    assert.equal(await alive("conversation-gone"), true);
    assert.equal(await alive("refused-mode"), true);
    pass(
      7,
      "held conversation-gone and refused-mode rows attach without launch validation"
    );

    const singleAdoption = async (kind: "claude" | "pi") => {
      await disconnect();
      const id = `review-one-adopt-${kind}`;
      await seed(id, { harness: kind });
      await held(kind === "pi" ? `pi:${id}` : id);
      const beforeAttach = (await events()).length;
      await startAgent();
      await until("one reviewed adoption", events, (text) =>
        text.slice(beforeAttach).includes(`ATTACH ${id} 1`)
      );
      await api("/proof/reattach", { id });
      await delay(300);
      assert.equal(
        (await events()).slice(beforeAttach).split(`ATTACH ${id} `).length - 1,
        1
      );
      assert.equal(await alive(kind === "pi" ? `pi:${id}` : id), true);
    };
    for (const kind of ["claude", "pi"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: each restart and duplicate-envelope check owns the same private agent sequentially
      await singleAdoption(kind);
    }
    console.log(
      "REVIEW 1 register restart and a duplicate reattach create exactly one Claude/pi adoption"
    );

    await disconnect();
    await stop(hub);
    dashboard?.close();
    await rm(join(scratchDir, "hub.db"), { force: true });
    await rm(join(scratchDir, "hub.db-wal"), { force: true });
    await rm(join(scratchDir, "hub.db-shm"), { force: true });
    await startHub();
    await startAgent();
    assert.equal(await alive("attach-retry"), true);
    assert.equal(await alive("conversation-gone"), true);
    assert.equal(await alive("refused-mode"), true);
    const agentFields = new Set<string>([
      "auth",
      "browserAvailable",
      "build",
      "createdAt",
      "custody",
      "deploy",
      "fleet",
      "harnesses",
      "hostname",
      "lastSeenAt",
      "machineId",
      "os",
      "restarted",
      "status",
      "tools",
    ] satisfies (
      | keyof import("../packages/core/src").AgentRow
      | "createdAt"
    )[]);
    const extraAgentFields = (await api("/api/agents")).flatMap(
      (entry: object) =>
        Object.keys(entry).filter((field) => !agentFields.has(field))
    );
    assert.deepEqual(extraAgentFields, []);
    assert.ok(
      !JSON.stringify(await api("/api/agents")).includes("attach-retry")
    );
    assert.ok(
      !JSON.stringify(await api("/api/agents")).includes("conversation-gone")
    );
    assert.ok(
      !JSON.stringify(await api("/api/agents")).includes("refused-mode")
    );
    assert.equal((await api("/api/instances")).length, 0);
    pass(
      8,
      "empty database leaves three held children untouched with no unowned field"
    );

    await seed("wake-stop", { session: true });
    await held("wake-stop");
    end("wake-stop");
    await confirmed("wake-stop");
    send("send", "wake-stop", {
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "private wake" },
        origin: { kind: "human" },
      },
    });
    await until("new process", () => alive("wake-stop"), Boolean);
    await delay(32_000);
    assert.equal(await alive("wake-stop"), true);
    assert.equal((await row("wake-stop"))?.endIntent, null);
    pass(
      9,
      "wake clears intent atomically and survives two subsequent reconciliation beats"
    );

    const workspace = join(scratchDir, "archive-checkout");
    await mkdir(workspace);
    await seed("archive-held", { workspace });
    await held("archive-held");
    await api("/api/workspaces/workspace-archive-held/archive", {}, "POST");
    await confirmed("archive-held");
    assert.equal(await alive("archive-held"), false);
    pass(
      10,
      "workspace archive ends held unattached session before removing its checkout"
    );

    await seed("discard-crash", { session: true });
    await held("discard-crash");
    await writeFile(
      join(scratchDir, "conversation-discard-crash.transcript"),
      "private transcript"
    );
    await writeFile(join(scratchDir, "crash-discard-crash"), "private crash");
    end("discard-crash", true);
    assert.equal(await hub?.exited, 73);
    assert.equal(await alive("discard-crash"), true);
    await rm(join(scratchDir, "crash-discard-crash"));
    dashboard?.close();
    await startHub();
    await readyAgent();
    await until(
      "discard confirmed",
      () => row("discard-crash"),
      (owner) => owner?.status === "discarded" && !!owner.endConfirmedAt
    );
    assert.equal(await alive("discard-crash"), false);
    assert.equal(
      await Bun.file(
        join(scratchDir, "conversation-discard-crash.transcript")
      ).exists(),
      false
    );
    await disconnect();
    await seed("discarded-before", { status: "discarded", session: true });
    await held("discarded-before");
    const before = await events();
    await startAgent();
    await until(
      "backfilled discard confirmed",
      () => row("discarded-before"),
      (owner) => !!owner?.endConfirmedAt
    );
    await until(
      "fresh held historical row is ended",
      () => alive("discarded-before"),
      (value) => !value
    );
    assert.equal(await alive("discarded-before"), false);
    assert.equal(
      (await events())
        .slice(before.length)
        .includes("TEARDOWN conversation-discarded-before"),
      false
    );
    pass(
      11,
      "discard survives hub crash; historically confirmed discard sends no stop or repeated teardown"
    );
    console.log(
      "SECOND 7 fresh held custody clears historical confirmation and the owed stop proceeds"
    );

    await disconnect();
    await seed("skew-claude");
    await seed("skew-pi", { harness: "pi" });
    await seed("skew-kept");
    await seed("skew-discard", { session: true });
    await writeFile(
      join(scratchDir, "conversation-skew-discard.transcript"),
      "private transcript"
    );
    await seed("skew-opencode", { harness: "opencode", session: true });
    await held("skew-claude");
    await held("pi:skew-pi");
    await held("skew-kept");
    await held("skew-discard");
    await held("opencode-server-turn-skew-opencode");
    end("skew-claude");
    end("skew-pi");
    end("skew-opencode", true);
    end("skew-discard", true);
    await until(
      "skew intents stored",
      () => row("skew-opencode"),
      (owner) => owner?.endIntent === "discard"
    );
    await startAgent(true);
    await delay(1000);
    assert.equal(await alive("skew-claude"), true);
    assert.equal(await alive("pi:skew-pi"), true);
    end("skew-kept");
    await until(
      "old-agent refusal is immediate",
      async () => JSON.stringify(dashboardFrames),
      (text) => text.includes("has not restarted onto this build yet")
    );
    assert.equal((await row("skew-kept"))?.endIntent, null);
    assert.equal((await row("skew-claude"))?.endConfirmedAt, null);
    assert.equal((await row("skew-pi"))?.endConfirmedAt, null);
    assert.equal((await row("skew-discard"))?.endConfirmedAt, null);
    assert.ok(
      !(await api("/api/instances")).some(
        (owner: { id: string }) => owner.id === "skew-discard"
      )
    );
    assert.ok(
      await Bun.file(
        join(scratchDir, "conversation-skew-discard.transcript")
      ).exists()
    );
    assert.ok(
      (await api("/api/instances")).every(
        (owner: object) => !("endConfirmedAt" in owner || "endIntent" in owner)
      )
    );
    assert.equal((await row("skew-opencode"))?.endConfirmedAt, null);
    assert.equal(await alive("opencode-server-turn-skew-opencode"), true);
    await disconnect();
    await startAgent();
    await confirmed("skew-claude");
    await confirmed("skew-pi");
    await until(
      "discard after agent update",
      () => row("skew-discard"),
      (owner) => !!owner?.endConfirmedAt
    );
    assert.equal(
      await Bun.file(
        join(scratchDir, "conversation-skew-discard.transcript")
      ).exists(),
      false
    );
    await until(
      "new OpenCode receipt",
      () => row("skew-opencode"),
      (owner) => !!owner?.endConfirmedAt
    );
    assert.equal(await alive("opencode-server-turn-skew-opencode"), false);
    pass(
      12,
      "old agent receives no lifecycle stop; confirmation-dependent operations refuse immediately; updated agent confirms pending intent"
    );
    await writeFile(
      join(scratchDir, "pause-address-address-agent-crash"),
      "private address gate"
    );
    send("spawn", "address-agent-crash", {
      cwd: scratchDir,
      harness: "opencode",
      model: "stand-in",
    });
    await until("empty server session created", events, (text) =>
      text.includes("CREATED_SESSION address-agent-crash")
    );
    await disconnect();
    assert.equal(
      (await api("/proof/rows")).find(
        (owner: { id: string }) => owner.id === "address-agent-crash"
      )?.sessionId,
      null
    );
    end("address-agent-crash");
    await confirmed("address-agent-crash");
    assert.equal(
      (await api("/proof/rows")).find(
        (owner: { id: string }) => owner.id === "address-agent-crash"
      )?.endReason,
      "never started"
    );
    await rm(join(scratchDir, "pause-address-address-agent-crash"));
    await startAgent();
    assert.ok(!(await events()).includes("SKILL address-agent-crash"));
    assert.ok(!(await events()).includes("TURN address-agent-crash"));
    pass(
      13,
      "agent death before address ACK dispatches no work; ending confirms never started"
    );

    await writeFile(
      join(scratchDir, "pause-address-address-hub-crash"),
      "private address gate"
    );
    send("spawn", "address-hub-crash", {
      cwd: scratchDir,
      harness: "opencode",
      model: "stand-in",
    });
    send("send", "address-hub-crash", {
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "one private turn" },
        origin: { kind: "human" },
      },
    });
    await until("address awaiting hub", events, (text) =>
      text.includes("CREATED_SESSION address-hub-crash")
    );
    assert.ok(!(await events()).includes("SKILL address-hub-crash"));
    await stop(hub);
    dashboard?.close();
    await rm(join(scratchDir, "pause-address-address-hub-crash"));
    await startHub();
    await readyAgent();
    await until("work after durable address ACK", events, (text) =>
      text.includes("TURN address-hub-crash")
    );
    assert.equal(
      (await events()).split("SKILL address-hub-crash").length - 1,
      1
    );
    assert.equal(
      (await events()).split("TURN address-hub-crash").length - 1,
      1
    );
    assert.equal(
      (await api("/proof/rows")).find(
        (owner: { id: string }) => owner.id === "address-hub-crash"
      )?.sessionId,
      "conversation-address-hub-crash"
    );
    end("address-hub-crash");
    await confirmed("address-hub-crash");
    pass(
      14,
      "hub restart re-acknowledges stored address before one skill and exactly one turn"
    );

    await seed("refused-address-review", {
      harness: "opencode",
      session: true,
    });
    await held("opencode-server-turn-refused-address-review");
    await writeFile(
      join(scratchDir, "pause-address-refused-address-review"),
      "private address gate"
    );
    await api("/proof/reattach", { id: "refused-address-review" });
    await delay(100);
    end("refused-address-review");
    await confirmed("refused-address-review");
    assert.equal(
      await alive("opencode-server-turn-refused-address-review"),
      false
    );
    await rm(join(scratchDir, "pause-address-refused-address-review"));
    send("send", "refused-address-review", {
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: {
          role: "user",
          content: "wake after refused acknowledgement",
        },
        origin: { kind: "human" },
      },
    });
    await until("wake behind refused acknowledgement", events, (text) =>
      text.includes("TURN refused-address-review")
    );
    end("refused-address-review");
    await confirmed("refused-address-review");
    console.log(
      "REVIEW 2 refusal releases the instance queue; queued stop completes and a later wake works without restart"
    );

    await seed("legacy-retry-review", { harness: "opencode", status: "error" });
    await writeFile(
      join(scratchDir, "pause-address-legacy-retry-review"),
      "private address gate"
    );
    send("spawn", "legacy-retry-review", {
      cwd: scratchDir,
      harness: "opencode",
      model: "stand-in",
    });
    await until("legacy retry awaiting acknowledgement", events, (text) =>
      text.includes("CREATED_SESSION legacy-retry-review")
    );
    await disconnect();
    const retried = (await api("/proof/rows")).find(
      (owner: { id: string }) => owner.id === "legacy-retry-review"
    );
    assert.equal(retried.addressProtocol, false);
    assert.equal(retried.addressRequired, false);
    assert.equal(retried.sessionId, null);
    await holder?.spawnProc("opencode-server-turn-unclaimed", {
      command: "/bin/sleep",
      args: ["600"],
      cwd: scratchDir,
      env: pathEnv,
    });
    end("legacy-retry-review");
    await startAgent();
    await until(
      "legacy retry still needs directory reading",
      () => api("/proof/rows"),
      (owners) =>
        owners.some(
          (owner: { id: string; endReason?: string }) =>
            owner.id === "legacy-retry-review" &&
            owner.endReason?.startsWith("waiting: 1 unclaimed runner")
        )
    );
    assert.equal((await row("legacy-retry-review"))?.endConfirmedAt, null);
    assert.equal(await alive("opencode-server-turn-unclaimed"), true);
    const { endProc } = await import("../packages/agent/src/sessiond-client");
    assert.ok(holder);
    await endProc(holder, "opencode-server-turn-unclaimed");
    await rm(join(scratchDir, "pause-address-legacy-retry-review"));
    end("legacy-retry-review");
    await confirmed("legacy-retry-review");
    console.log(
      "REVIEW 4 failed retry leaves a legacy row legacy; an unclaimed runner blocks confirmation"
    );

    await seed("shared-owner-a", { harness: "opencode", session: true });
    await api("/proof/reattach", { id: "shared-owner-a" });
    await until("shared A attached", events, (text) =>
      text.includes("ATTACH shared-owner-a")
    );
    end("shared-owner-a");
    await confirmed("shared-owner-a");
    await seed("shared-owner-b", {
      harness: "opencode",
      sessionKey: "conversation-shared-owner-a",
    });
    send("spawn", "shared-owner-b", {
      cwd: scratchDir,
      harness: "opencode",
      model: "stand-in",
      resume: { sessionKey: "conversation-shared-owner-a" },
    });
    await until("shared B started", events, (text) =>
      text.includes("SPAWN shared-owner-b")
    );
    const beforeShared = (await events()).length;
    end("shared-owner-a", true);
    await until(
      "shared A discard confirmed",
      () => row("shared-owner-a"),
      (owner) => !!owner?.endConfirmedAt
    );
    assert.equal(await alive("opencode-server-turn-shared-owner-b"), true);
    assert.ok(
      !(await events())
        .slice(beforeShared)
        .includes("RESOURCES_CLOSED conversation-shared-owner-a")
    );
    console.log(
      "REVIEW 6 ending a stopped row preserves the other row using its SDK conversation"
    );

    const repository = join(scratchDir, "scratch-review-repository");
    await mkdir(repository);
    const git = async (...args: string[]) => {
      const proc = Bun.spawn(["git", "-C", repository, ...args], {
        env: pathEnv,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stderr).text();
      assert.equal(await proc.exited, 0, output);
    };
    await git("init");
    await writeFile(join(repository, "kept.txt"), "private fixture");
    await git("add", "kept.txt");
    await git(
      "-c",
      "user.name=Private Proof",
      "-c",
      "user.email=proof@example.invalid",
      "commit",
      "-m",
      "Private fixture"
    );
    const manual = join(scratchDir, "manual-review-worktree");
    await git("worktree", "add", "--detach", manual, "HEAD");
    await writeFile(join(manual, "dirty.txt"), "must survive discard");
    await seed("manual-worktree-review", { directory: manual });
    await held("manual-worktree-review");
    end("manual-worktree-review", true);
    await until(
      "manual-directory discard confirmed",
      () => row("manual-worktree-review"),
      (owner) => !!owner?.endConfirmedAt
    );
    assert.equal(
      await Bun.file(join(manual, "dirty.txt")).text(),
      "must survive discard"
    );
    await seed("created-worktree-review", { directory: repository });
    send("spawn", "created-worktree-review", {
      cwd: repository,
      harness: "claude",
      model: "stand-in",
      scratch: { worktree: true },
    });
    const created = await until(
      "durable creation provenance",
      () => api("/proof/rows"),
      (owners) =>
        owners.some(
          (owner: { id: string; scratchWorktree?: object }) =>
            owner.id === "created-worktree-review" && owner.scratchWorktree
        )
    );
    const ownedTree = created.find(
      (owner: { id: string }) => owner.id === "created-worktree-review"
    ).scratchWorktree;
    await disconnect();
    end("created-worktree-review", true);
    await startAgent();
    await until(
      "recorded-tree discard confirmed after restart",
      () => row("created-worktree-review"),
      (owner) => !!owner?.endConfirmedAt
    );
    assert.equal(await Bun.file(join(ownedTree.path, ".git")).exists(), false);
    assert.equal(await Bun.file(join(manual, "dirty.txt")).exists(), true);
    console.log(
      "REVIEW 7 manual worktree and dirty work survive; durable session-created worktree is removed after restart"
    );
    await writeFile(
      join(scratchDir, "pause-address-never-started-tree-review"),
      "private pre-address gate"
    );
    send("spawn", "never-started-tree-review", {
      cwd: repository,
      harness: "opencode",
      model: "stand-in",
      scratch: { worktree: true },
    });
    const prepared = await until(
      "never-started scratch preparation is durable",
      () => api("/proof/rows"),
      (owners) =>
        owners.some(
          (owner: { id: string; scratchWorktree?: object }) =>
            owner.id === "never-started-tree-review" && owner.scratchWorktree
        )
    );
    await until("never-started SDK session awaits address", events, (text) =>
      text.includes("CREATED_SESSION never-started-tree-review")
    );
    const unusedTree = prepared.find(
      (owner: { id: string }) => owner.id === "never-started-tree-review"
    ).scratchWorktree;
    end("never-started-tree-review", true);
    await until(
      "never-started scratch discard confirmed",
      () => row("never-started-tree-review"),
      (owner) => owner?.status === "discarded" && !!owner.endConfirmedAt
    );
    assert.equal(await Bun.file(join(unusedTree.path, ".git")).exists(), false);
    assert.ok(!(await events()).includes("SKILL never-started-tree-review"));
    await rm(join(scratchDir, "pause-address-never-started-tree-review"));
    console.log(
      "REVIEW 16 never-started discard is recorded discarded and removes only its recorded scratch worktree"
    );

    await seed("legacy-empty", { harness: "opencode" });
    const beforeLegacy = (await events()).split("READ_UNCLAIMED").length;
    end("legacy-empty");
    await confirmed("legacy-empty");
    const afterLegacy = (await events()).split("READ_UNCLAIMED").length;
    assert.equal(afterLegacy - beforeLegacy, 1);
    assert.ok(
      (await api("/proof/rows"))
        .find((owner: { id: string }) => owner.id === "legacy-empty")
        ?.endReason.startsWith("no unclaimed runner in ")
    );
    end("legacy-empty");
    await delay(300);
    assert.equal((await events()).split("READ_UNCLAIMED").length, afterLegacy);
    pass(
      15,
      "legacy row with no unclaimed runner confirms once and is never read again"
    );

    await seed("legacy-ambiguous", { harness: "opencode" });
    await holder?.spawnProc("opencode-server-turn-unclaimed", {
      command: "/bin/sleep",
      args: ["3"],
      cwd: scratchDir,
      env: pathEnv,
    });
    end("legacy-ambiguous");
    await until(
      "legacy ambiguity recorded",
      () => api("/proof/rows"),
      (owners) =>
        owners.some(
          (owner: { id: string; endReason?: string }) =>
            owner.id === "legacy-ambiguous" &&
            owner.endReason?.startsWith("waiting: 1 unclaimed runner")
        )
    );
    assert.equal((await row("legacy-ambiguous"))?.endConfirmedAt, null);
    assert.equal(await alive("opencode-server-turn-unclaimed"), true);
    await until(
      "unclaimed runner ends naturally",
      () => alive("opencode-server-turn-unclaimed"),
      (running) => !running
    );
    end("legacy-ambiguous");
    await confirmed("legacy-ambiguous");
    console.log(
      "PASS 15b ambiguous unclaimed runner is left alone; next ordinary trigger confirms after its natural exit"
    );

    await disconnect();
    await seed("legacy-live", { harness: "opencode" });
    await held("opencode-server-turn-legacy-live");
    await writeFile(
      join(scratchDir, "legacy-live-addresses.json"),
      JSON.stringify([
        { instanceId: "legacy-live", sessionId: "conversation-legacy-live" },
      ])
    );
    await startAgent();
    await until(
      "legacy exact address recorded",
      () => api("/proof/rows"),
      (owners) =>
        owners.some(
          (owner: { id: string; sessionId?: string }) =>
            owner.id === "legacy-live" &&
            owner.sessionId === "conversation-legacy-live"
        )
    );
    end("legacy-live");
    await confirmed("legacy-live");
    assert.equal(await alive("opencode-server-turn-legacy-live"), false);
    await rm(join(scratchDir, "legacy-live-addresses.json"));
    pass(
      16,
      "legacy retained runner supplies exact address at register and ends by normal confirmation"
    );

    await seed("workflow-supervisor-review");
    send("spawn", "workflow-supervisor-review", {
      cwd: scratchDir,
      harness: "claude",
      model: "stand-in",
    });
    await until(
      "private workflow supervisor live",
      () => api("/api/instances"),
      (owners) =>
        owners.some(
          (owner: { id: string; status: string }) =>
            owner.id === "workflow-supervisor-review" &&
            owner.status === "running"
        )
    );
    const workflowCase = async (kind: "timeout" | "provider" | "cancel") => {
      await disconnect();
      await startAgent(true);
      send("spawn", "workflow-supervisor-review", {
        cwd: scratchDir,
        harness: "claude",
        model: "stand-in",
      });
      await until(
        "old-agent workflow supervisor live",
        () => api("/api/instances"),
        (owners) =>
          owners.some(
            (owner: { id: string; status: string }) =>
              owner.id === "workflow-supervisor-review" &&
              owner.status === "running"
          )
      );
      const definition = await api("/proof/workflow", {
        name: `Private ${kind} held stop`,
        timeoutMinutes: kind === "cancel" ? 60 : 0.1,
        prompt:
          kind === "provider"
            ? "private-provider-retry"
            : `private-${kind}-halt`,
      });
      const { runId } = await api(`/api/workflows/${definition.id}/runs`, {
        workspace: { machineId: machine, path: scratchDir },
        supervisor: { instanceId: "workflow-supervisor-review" },
      });
      const detail = () => api(`/api/workflow-runs/${runId}`);
      await until(
        "workflow attempt starts",
        detail,
        (run) =>
          run.attempts.length === 1 &&
          run.steps.some(
            (candidate: { status: string }) => candidate.status === "running"
          )
      );
      const started = await detail();
      const [step] = started.steps;
      if (kind === "cancel") {
        await api(`/api/workflow-runs/${runId}/cancel`, {});
        await until(
          "cancel remains held",
          detail,
          (run) => run.status === "waiting" && !!run.state.__ending
        );
        await until(
          "cancel refusal receipt",
          events,
          (text) =>
            text.includes(
              `Session ${step.instanceId} could not be ended because`
            ) && text.includes("has not restarted onto this build yet")
        );
        assert.equal((await detail()).attempts[0].endedAt, null);
      } else {
        await until(
          "halt refusal is held not failed",
          detail,
          (run) =>
            run.steps[0].failure?.includes(
              "has not restarted onto this build yet"
            ) && run.state.__heldStops?.[step.id]
        );
        const heldRun = await detail();
        assert.equal(heldRun.attempts.length, 1);
        assert.equal(heldRun.attempts[0].endedAt, null);
        assert.equal(heldRun.attempts[0].failure, null);
        assert.equal(heldRun.steps[0].status, "running");
        assert.ok(
          heldRun.steps[0].failure.includes(
            kind === "timeout"
              ? "Attempt timed out at"
              : "private provider wait exceeds deadline"
          )
        );
        if (kind === "timeout") {
          await api(`/api/workflow-runs/${runId}/steer`, {
            instanceId: "workflow-supervisor-review",
            action: { type: "retry", stepId: step.id },
          });
          const deferred = await detail();
          assert.equal(deferred.state.__heldStops[step.id].action, "retry");
          assert.equal(deferred.attempts.length, 1);
          assert.equal(deferred.attempts[0].endedAt, null);
        }
      }
      assert.equal(await alive(step.instanceId), true);
      await disconnect();
      await startAgent();
      if (kind === "cancel") {
        const endedRun = await until(
          "cancel waits for positive end",
          detail,
          (run) => run.status === "cancelled"
        );
        assert.equal(endedRun.attempts.length, 1);
        assert.equal(await alive(step.instanceId), false);
        console.log(
          "WORKFLOW cancel refused stop launches nothing further, publishes receipt, and becomes cancelled only after confirmation"
        );
      } else {
        const retryRun = await until(
          "held deadline recovers exactly once",
          detail,
          (run) => run.attempts.length === 2
        );
        assert.ok(retryRun.attempts[0].endedAt);
        assert.ok(
          retryRun.attempts[0].failure.includes(
            kind === "timeout"
              ? "attempt-timeout"
              : "private provider wait exceeds deadline"
          )
        );
        await api(`/api/workflow-runs/${runId}/cancel`, {});
        await until(
          "retry fixture cleanup confirmed",
          detail,
          (run) => run.status === "cancelled"
        );
        assert.equal((await detail()).attempts.length, 2);
        console.log(
          `WORKFLOW ${kind} refused halt keeps its running attempt with receipt; recovery confirms stop and starts exactly one retry`
        );
      }
    };
    for (const kind of ["timeout", "provider", "cancel"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: each full-stack scenario owns the same private agent version cutover sequentially
      await workflowCase(kind);
    }

    await disconnect();
    await startAgent(true);
    send("spawn", "workflow-supervisor-review", {
      cwd: scratchDir,
      harness: "claude",
      model: "stand-in",
    });
    await until(
      "old supervisor for child-outcome proof",
      () => api("/api/instances"),
      (owners) =>
        owners.some(
          (owner: { id: string; status: string }) =>
            owner.id === "workflow-supervisor-review" &&
            owner.status === "running"
        )
    );
    const midDefinition = await api("/proof/workflow", {
      name: "Private held workflow restart",
      timeoutMinutes: 60,
      prompt: "private-held-midturn",
    });
    const midRun = await api(`/api/workflows/${midDefinition.id}/runs`, {
      workspace: { machineId: machine, path: scratchDir },
      supervisor: { instanceId: "workflow-supervisor-review" },
    });
    const midDetail = () => api(`/api/workflow-runs/${midRun.runId}`);
    const midStarted = await until(
      "workflow turn is owned before restart",
      midDetail,
      (run) => run.attempts.length === 1 && run.steps[0].status === "running"
    );
    const [midStep] = midStarted.steps;
    await until(
      "fixture records its active turn",
      () => Bun.file(join(scratchDir, `busy-${midStep.instanceId}`)).exists(),
      Boolean
    );
    const midPid = (await holder?.list())?.procs.find(
      (proc) => proc.procId === midStep.instanceId
    )?.pid;
    await disconnect();
    await startAgent();
    await until("held workflow is reattached", events, (text) =>
      text.includes(`ATTACH ${midStep.instanceId}`)
    );
    await delay(300);
    assert.equal((await midDetail()).attempts.length, 1);
    assert.equal((await midDetail()).attempts[0].endedAt, null);
    assert.equal(
      (await holder?.list())?.procs.find(
        (proc) => proc.procId === midStep.instanceId
      )?.pid,
      midPid
    );
    assert.ok(!(await events()).includes(`RETRY_PROMPT ${midStep.instanceId}`));
    await api(`/api/workflow-runs/${midRun.runId}/cancel`, {});
    await until(
      "mid-turn fixture confirmed end",
      midDetail,
      (run) => run.status === "cancelled"
    );
    console.log(
      "SECOND moving-main custody keeps a workflow mid-turn on attempt one and its original child across restart"
    );
    await disconnect();
    await startAgent(true);
    send("spawn", "workflow-supervisor-review", {
      cwd: scratchDir,
      harness: "claude",
      model: "stand-in",
    });
    await until(
      "old supervisor restored for child outcome",
      () => api("/api/instances"),
      (owners) =>
        owners.some(
          (owner: { id: string; status: string }) =>
            owner.id === "workflow-supervisor-review" &&
            owner.status === "running"
        )
    );
    const childDefinition = await api("/proof/workflow", {
      name: "Private child completion",
      timeoutMinutes: 60,
      prompt: "private-child-completion",
    });
    const parentDefinition = await api("/proof/workflow", {
      name: "Private parent completion",
      timeoutMinutes: 60,
      prompt: "unused",
      program: `import { z } from "zod"; export const inputs = z.object({}); export default async function(w) { return await w.workflow(${JSON.stringify(`private-${childDefinition.id}`)}, {}); }`,
    });
    const parentRun = await api(`/api/workflows/${parentDefinition.id}/runs`, {
      workspace: { machineId: machine, path: scratchDir },
      supervisor: { instanceId: "workflow-supervisor-review" },
    });
    const parentDetail = () => api(`/api/workflow-runs/${parentRun.runId}`);
    const openedParent = await until(
      "child run opens",
      parentDetail,
      (run) => !!run.steps[0]?.childRunId
    );
    const childId = openedParent.steps[0].childRunId;
    const childDetail = () => api(`/api/workflow-runs/${childId}`);
    const openedChild = await until(
      "child owned attempt starts",
      childDetail,
      (run) => run.attempts.length === 1 && run.steps[0].status === "running"
    );
    const [childStep] = openedChild.steps;
    const recordedChild = await fetch(
      `${base}/api/workflow-steps/${childStep.id}/result`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId: childStep.instanceId,
          result: { ok: true },
        }),
      }
    );
    assert.equal(recordedChild.status, 200);
    assert.ok((await recordedChild.text()).includes("Recorded"));
    send("control", childStep.instanceId, {
      requestId: crypto.randomUUID(),
      method: "proofComplete",
      args: [],
    });
    const completedParent = await until(
      "successful child reports while cleanup refuses",
      parentDetail,
      (run) => run.status === "done"
    );
    const completedChild = await childDetail();
    assert.equal(completedChild.status, "done");
    assert.deepEqual(completedParent.result, { ok: true });
    assert.equal(completedChild.state.__ending, undefined);
    assert.equal((await row(childStep.instanceId))?.endIntent, "stop");
    assert.equal((await row(childStep.instanceId))?.endConfirmedAt, null);
    const childEndTime = completedChild.endedAt;
    const beforeLateInit = (await events()).length;
    send("spawn", childStep.instanceId, {
      cwd: scratchDir,
      harness: "claude",
      model: "stand-in",
    });
    await until("ended-run instance comes up", events, (text) =>
      text.slice(beforeLateInit).includes(`SPAWN ${childStep.instanceId}`)
    );
    await delay(100);
    assert.equal((await childDetail()).status, "done");
    assert.equal((await childDetail()).endedAt, childEndTime);
    assert.deepEqual((await parentDetail()).result, { ok: true });
    console.log(
      "SECOND 2 successful child and parent report done immediately despite refused cleanup"
    );
    console.log(
      "SECOND 3 late init halts only its instance and preserves completed result and timestamp"
    );

    await api("/proof/continuation", {});
    await disconnect();
    await startAgent(true);
    const continued = await until(
      "continuation retains summary",
      () => api("/proof/continuations"),
      (jobs) =>
        jobs.some(
          (job: { id: string; stage: string }) =>
            job.id === "summary-proof-continuation" && job.stage === "started"
        )
    );
    const summaryJob = continued.find(
      (job: { id: string }) => job.id === "summary-proof-continuation"
    );
    assert.equal(summaryJob.summary, "private summary preserved");
    assert.equal(summaryJob.error, null);
    assert.equal((await row("summary-proof-summariser"))?.endIntent, "stop");
    console.log(
      "SECOND continuation keeps summary and starts target while summariser stop remains owed"
    );

    await disconnect();
    await startAgent();
    const delayedDefinition = await api("/proof/workflow", {
      name: "Private delayed end",
      timeoutMinutes: 60,
      prompt: "private-delayed-stop",
    });
    const delayedRun = await api(
      `/api/workflows/${delayedDefinition.id}/runs`,
      {
        workspace: { machineId: machine, path: scratchDir },
        supervisor: { instanceId: "workflow-supervisor-review" },
      }
    );
    const delayedDetail = () => api(`/api/workflow-runs/${delayedRun.runId}`);
    const delayedStarted = await until(
      "delayed attempt starts",
      delayedDetail,
      (run) => run.attempts.length === 1 && run.steps[0].status === "running"
    );
    const [delayedStep] = delayedStarted.steps;
    await writeFile(
      join(scratchDir, `pause-stop-${delayedStep.instanceId}`),
      "private slow stop"
    );
    send("control", delayedStep.instanceId, {
      requestId: crypto.randomUUID(),
      method: "proofProviderRetry",
      args: [],
    });
    const heldDelayed = await until(
      "slow stop exceeds halt wait",
      delayedDetail,
      (run) => !!run.state.__heldStops?.[delayedStep.id]?.error
    );
    assert.equal(heldDelayed.attempts.length, 1);
    await rm(join(scratchDir, `pause-stop-${delayedStep.instanceId}`));
    const confirmedLate = await until(
      "late confirmation re-evaluates directly",
      delayedDetail,
      (run) => run.attempts.length === 2
    );
    assert.ok(confirmedLate.attempts[0].endedAt);
    await api(`/api/workflow-runs/${delayedRun.runId}/cancel`, {});
    await until(
      "delayed fixture ends",
      delayedDetail,
      (run) => run.status === "cancelled"
    );
    console.log(
      "SECOND 5 late confirmation starts one retry without reconnect or supervisor action"
    );

    const cancelledDefinition = await api("/proof/workflow", {
      name: "Private cancel before open",
      timeoutMinutes: 60,
      prompt: "private-no-late-spawn",
    });
    const cancelledRun = await api(
      `/api/workflows/${cancelledDefinition.id}/runs`,
      {
        workspace: { machineId: machine, path: scratchDir },
        supervisor: { instanceId: "workflow-supervisor-review" },
      }
    );
    await api(`/api/workflow-runs/${cancelledRun.runId}/cancel`, {});
    await until(
      "cancel wins before later opens",
      () => api(`/api/workflow-runs/${cancelledRun.runId}`),
      (run) => run.status === "cancelled"
    );
    const cancelledBefore = (await events()).length;
    await delay(300);
    assert.ok(!(await events()).slice(cancelledBefore).includes("SPAWN_BEGIN"));
    console.log(
      "SECOND 8 cancelled execution cannot write or spawn a later queued attempt"
    );

    await disconnect();
    const preservedId = "preserved-stopped-sdk";
    await seed(preservedId, { harness: "opencode", session: true });
    await api("/proof/owed", {
      id: preservedId,
      intent: "stop",
      confirmed: true,
    });
    await writeFile(
      join(scratchDir, `conversation-${preservedId}.transcript`),
      "private stored conversation"
    );
    await api(`/api/agents/${machine}`, undefined, "DELETE");
    const hiddenStopped = (await api("/proof/rows")).find(
      (owner: { id: string }) => owner.id === preservedId
    );
    assert.equal(hiddenStopped.endIntent, "stop");
    assert.ok(hiddenStopped.endConfirmedAt);
    const beforeUnhide = (await events()).length;
    await startAgent();
    await until(
      "stopped conversation returns unchanged",
      () => api("/api/instances"),
      (owners) =>
        owners.some(
          (owner: { id: string; status: string }) =>
            owner.id === preservedId && owner.status === "stopped"
        )
    );
    assert.ok(
      !(await events()).slice(beforeUnhide).includes(`ATTACH ${preservedId}`)
    );
    console.log(
      "SECOND 4 removal preserves stopped intent and un-hides without restoration"
    );

    await disconnect();
    await stop(hub);
    dashboard?.close();
    await startHub(true);
    await startAgent();
    send("spawn", "old-hub-new-agent-refusal", {
      cwd: scratchDir,
      harness: "opencode",
      model: "stand-in",
    });
    await until(
      "new agent refuses undeclared hub",
      async () => JSON.stringify(dashboardFrames),
      (text) => text.includes("The hub has not restarted onto this build yet")
    );
    const blockedHub = await api(`/api/agents/${machine}/busy`);
    assert.equal(blockedHub.ready, false);
    assert.ok(
      blockedHub.error.includes("The hub has not restarted onto this build yet")
    );
    assert.ok(!(await events()).includes("SKILL old-hub-new-agent-refusal"));
    await stop(hub);
    dashboard?.close();
    await startHub();
    await readyAgent();
    await until(
      "new hub heals custody automatically",
      () => api(`/api/agents/${machine}/busy`),
      (busy) => busy.ready === true
    );
    console.log(
      "SECOND both directions refuse with words and new hub declaration heals custody"
    );

    const metadataFile = Bun.file(
      join(root, ".context", "ownership", "legacy-null-metadata.json")
    );
    const legacyRows = (await metadataFile.json()) as {
      status: string;
      cwd: string;
      created_at: number;
      updated_at: number;
    }[];
    const classified: Record<string, number> = {};
    for (const [index, copied] of legacyRows.entries()) {
      const id = `legacy-copy-${index}`;
      // biome-ignore lint/performance/noAwaitInLoops: each sanitized copied row is independently classified on the private server
      await seed(id, {
        harness: "opencode",
        status: copied.status,
        directory: copied.cwd,
        createdAt: copied.created_at,
        updatedAt: copied.updated_at,
      });
      end(id);
      // Only positive private-server confirmation counts as a classification.
      await until(
        "legacy copied row confirmed",
        () => row(id),
        (owner) => !!owner?.endConfirmedAt
      );
      classified[`15a ${copied.status}`] =
        (classified[`15a ${copied.status}`] ?? 0) + 1;
    }
    console.log(`PRIVATE_COPY_LEGACY_COUNTS ${JSON.stringify(classified)}`);
    const nativeProof = Bun.spawn(
      [process.execPath, join(root, "scripts/probe-opencode-end-custody.ts")],
      { cwd: root, env: pathEnv, stdout: "pipe", stderr: "pipe" }
    );
    const nativeOutput = await new Response(nativeProof.stdout).text();
    const nativeError = await new Response(nativeProof.stderr).text();
    assert.equal(
      await nativeProof.exited,
      0,
      `${nativeOutput}\n${nativeError}`
    );
    console.log(nativeOutput.trim());
    console.log("ownership-proofs-pass");
  } finally {
    dashboard?.close();
    holder?.close();
    await stop(agent);
    await stop(hub);
    await Promise.all([...children].map(stop));
    console.log(`Private proof evidence: ${scratchDir}`);
  }
}
