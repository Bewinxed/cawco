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

if (role === "sessiond") {
  await import("../packages/sessiond/src/main");
} else if (role === "hub") {
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
            registry: yield* Registry,
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
              sessionId: data.session ? `conversation-${data.id}` : undefined,
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
                  "UPDATE instances SET end_intent = 'discard' WHERE id = ?"
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
          .get("/proof/rows", () => db.sessionOwnership())
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
      ctx: import("../packages/agent/src/harness").HarnessContext
    ) => ({
      harness: kind,
      sessionId: `conversation-${ctx.instanceId}`,
      attached: () =>
        ctx.frame({
          type: "system",
          subtype: "init",
          session_id: `conversation-${ctx.instanceId}`,
          cwd: ctx.cwd,
        }),
      control: async () => undefined,
      resolvePermission: () => undefined,
      interrupt: async () => undefined,
      dispose: async () => undefined,
      send: () => {
        log(`TURN ${ctx.instanceId}`).catch(console.error);
      },
      stop: async () => {
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
      getSessionMessages: async () => [],
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
      endSession: async (key) => {
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
      unclaimedRunners: async (directory, claimed) => {
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
      turnRunning: async () => false,
      adopt: async (id, ctx) => {
        const count = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, count);
        await log(`ATTACH ${id} ${count}`);
        if (id === "attach-retry" && count <= 2) {
          throw new Error("private attach refusal");
        }
        return session(ctx);
      },
      reattach: async (_spec, ctx) => adapter.adopt(ctx.instanceId, ctx),
      spawn: async (_spec, ctx) => {
        await log(`SPAWN_BEGIN ${ctx.instanceId}`);
        if (kind === "opencode") {
          await log(`CREATED_SESSION ${ctx.instanceId}`);
          await ctx.recordSessionAddress?.(`conversation-${ctx.instanceId}`);
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
        return session(ctx);
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
      "ef6be1f9",
      "packages/agent/src/daemon.ts",
      "packages/agent/src/session.ts",
      "packages/agent/src/sessiond-custody.ts",
      "packages/core/src/index.ts",
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
  const startHub = async () => {
    hub = launch("hub");
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
    await startHub();
    await seed("offline-stop");
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
    await held("remove-machine-b");
    await api(`/api/agents/${machine}`, undefined, "DELETE");
    assert.equal((await api("/api/agents")).length, 0);
    assert.ok(
      (await rows())
        .filter((owner) => owner.id.startsWith("remove-machine"))
        .every((owner) => owner.endIntent === "delete")
    );
    await startAgent();
    await gone("remove-machine-a");
    await gone("remove-machine-b");
    assert.equal(await alive("remove-machine-a"), false);
    assert.equal(await alive("remove-machine-b"), false);
    pass(
      4,
      "offline machine removal retains hidden ownership until both processes exit"
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
    assert.equal(await alive("discarded-before"), false);
    assert.equal(
      (await events())
        .slice(before.length)
        .includes("TEARDOWN conversation-discarded-before"),
      false
    );
    pass(
      11,
      "discard survives hub crash; pre-existing discarded row ends without repeated teardown"
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
    await until(
      "old Claude physically stopped",
      () => alive("skew-claude"),
      (running) => !running
    );
    await until(
      "old pi physically stopped",
      () => alive("pi:skew-pi"),
      (running) => !running
    );
    await until("old agent attached", events, (text) =>
      text.includes("ATTACH skew-kept")
    );
    await delay(1000);
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
      "old agent stops and attaches; discarded row hides immediately; only new-agent evidence confirms and tears down"
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

    const legacyFile = Bun.file(
      join(root, ".context", "ownership", "legacy-null-metadata.json")
    );
    const legacyRows = (await legacyFile.json()) as {
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
