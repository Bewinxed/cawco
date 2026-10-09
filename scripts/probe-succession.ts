/**
 * Succession proof on a private stack: the real hub (scratch database, free
 * port), the real agent daemon and a private sessiond, two fake Claude
 * accounts (A and B, no credentials anywhere) and a stand-in `claude` harness
 * whose sessions are `/bin/sleep` children held by sessiond. The stand-in
 * plays the account's API: a turn on an account marked at its limit ends
 * the way Claude Code ends one its usage limit refused (an assistant entry
 * with `error: "rate_limit"`, then the result); any other turn is answered.
 * Each stand-in process opens its session's CawCo MCP stream as Claude Code
 * does, so the hub's `stream open -> <id>` line marks every process start.
 *
 *   bun scripts/probe-succession.ts
 *
 * Proves:
 *   1. a delegate S0 on A, refused at A's limit, is continued onto B as S1;
 *      hand-offs to S0's id (three) reach S1, name S1 "(continues S0)", and
 *      S0's stream never opens again; one live session in the workspace;
 *   2. delegate_list and list_sessions show S1, never S0;
 *   3. interrupt_delegate and answer_delegate with S0's id act on S1;
 *   4. a hub notice (a hand-off that failed) to a stopped session is kept
 *      and does not wake it; a person's send wakes it and it reads both;
 *   5. a stopped session on A (at its limit) is never continued by a notice;
 *      a turn a hub notice started in a running session on A is refused and
 *      left alone, never continued;
 *   6. a delegate's report to its stopped parent waits; the parent is not woken.
 */
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const [role, scratch, portText] = process.argv.slice(2);
const machine = "succession-proof";
const pathEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin" };

const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function until<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  ms = 45_000
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each bounded look follows the stack's previous state
    const value = await read();
    if (accept(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label}: ${JSON.stringify(value)}`);
    }
    await delay(150);
  }
}

if (role && scratch) {
  assert.equal(homedir(), join(scratch, "home"), "private HOME first");
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

/** The two fake accounts' ids, kept by the hub process in the scratch folder. */
const accountsFile = (dir: string) => join(dir, "accounts.json");

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
  const { HubLifetime, HubLifetimeLayer } = await import(
    "../packages/hub/src/lifetime"
  );
  const { createServer } = await import("../packages/hub/src/server");
  const { CLAUDE_PROVIDER } = await import("../packages/core/src/accounts");
  const { Database } = await import("bun:sqlite");
  const app = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const db = yield* Db;
        const sql = new Database(process.env.CAWCO_DB_PATH);
        db.upsertAgent({
          machineId: machine,
          hostname: machine,
          os: "private",
          auth: "unauthenticated",
        });
        // Fake accounts: no credential exists anywhere. Their sign-ins on
        // this machine are pinned, as a machine's report would keep them.
        const a = db.accounts.create({
          kind: "subscription",
          provider: CLAUDE_PROVIDER,
          label: "A",
          identity: { email: "a@fake.invalid", organization: "org-a" },
        });
        const b = db.accounts.create({
          kind: "subscription",
          provider: CLAUDE_PROVIDER,
          label: "B",
          identity: { email: "b@fake.invalid", organization: "org-b" },
        });
        const routing = db.accounts.routing(CLAUDE_PROVIDER);
        // Any reported context counts as large: a refused turn continues
        // from a summary rather than moving whole.
        db.accounts.setRouting({
          ...routing,
          atLimit: { ...routing.atLimit, move: true, moveWholeUnderK: 1 },
        });
        writeFileSync(
          accountsFile(scratch),
          JSON.stringify({ a: a.id, b: b.id })
        );
        const pinned = [a.id, b.id];
        const accounts = {
          ...db.accounts,
          signins: () => [
            ...db.accounts
              .signins()
              .filter((one) => !pinned.includes(one.accountId)),
            ...pinned.map((accountId) => ({
              accountId,
              machineId: machine,
              state: "signed-in" as const,
              checkedAt: Date.now(),
              movedAt: null,
              movedFrom: null,
            })),
          ],
        };
        return createServer(
          {
            // The seeded workspaces exist as rows only: a boundary cannot
            // start inside the sandbox this proof runs in, so no launch is
            // sent one. Items, parents and listings read them as they are.
            db: {
              ...db,
              accounts,
              workspacesNamed: (needle: string) =>
                db
                  .workspacesNamed(needle)
                  .filter((one) => !one.id.startsWith("workspace-")),
            },
            registry: yield* Registry,
            pending: yield* Pending,
            lifetime: yield* HubLifetime,
            build: { version: "private", startedAt: Date.now() },
          },
          { resumeWorkflows: false }
        )
          .post("/proof/limit", ({ body }) => {
            // A's limit as the hub learns it: benched until four hours on.
            const { account } = body as { account: string };
            db.accounts.setBench(account, null, Date.now() + 4 * 3_600_000);
            return { ok: true };
          })
          .post("/proof/context", ({ body }) => {
            const { id, tokens } = body as { id: string; tokens: number };
            sql
              .query("UPDATE instances SET context_tokens = ? WHERE id = ?")
              .run(tokens, id);
            return { ok: true };
          })
          .post("/proof/item", ({ body }) => {
            const { id, parent } = body as { id: string; parent: string };
            const workspaceId = `workspace-${id.slice(0, 8)}`;
            const itemId = `item-${id.slice(0, 8)}`;
            db.createWorkspace({
              id: workspaceId,
              machineId: machine,
              repoRoot: scratch,
              path: join(scratch, workspaceId),
              branch: "private",
              base: "main",
              createdByInstanceId: parent,
            });
            db.createWorkItem({
              id: itemId,
              workspaceId,
              instanceId: id,
              parentInstanceId: parent,
              brief: "private",
              title: `Private item ${id.slice(0, 8)}`,
              harness: "claude",
              state: "running",
            });
            db.patchInstance(id, { workItemId: itemId });
            return { itemId, workspaceId };
          })
          .get("/proof/rows", () =>
            sql
              .query(
                "SELECT id, status, end_intent AS endIntent, continued_into AS continuedInto, work_item_id AS workItemId, parent_instance_id AS parent, account_id AS account FROM instances"
              )
              .all()
          )
          .get("/proof/items", () =>
            sql
              .query(
                "SELECT id, instance_id AS instanceId, workspace_id AS workspaceId, state FROM work_items"
              )
              .all()
          )
          .get("/proof/sends", ({ query }) =>
            sql
              .query(
                "SELECT uuid, state, owed IS NOT NULL AS owed, json_extract(body, '$.origin.kind') AS kind, json_extract(body, '$.origin.name') AS name, substr(json_extract(body, '$.message.content'), 1, 120) AS words FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at"
              )
              .all(String(query.id))
          );
      }),
      PendingLayer.pipe(
        Layer.provideMerge(Layer.mergeAll(RegistryLayer, DbLayer)),
        Layer.provideMerge(HubLifetimeLayer)
      )
    )
  );
  app.listen({ hostname: "127.0.0.1", port: Number(portText) });
  console.log("PRIVATE_READY");
} else if (role === "agent") {
  const { registerHarness } = await import("../packages/agent/src/harnesses");
  const { SessiondClient, endProc } = await import(
    "../packages/agent/src/sessiond-client"
  );
  const { MESSAGES_READ } = await import("../packages/core/src/harness");
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT
  );
  const hubHttp = `http://127.0.0.1:${portText}`;
  const events = join(scratch, "events");
  const log = (event: string) => appendFile(events, `${event}\n`);
  const transcript = (key: string) => join(scratch, `${key}.jsonl`);
  const streams = new Map<string, AbortController>();
  /** The session's CawCo stream, opened as Claude Code opens it at launch. */
  const openStream = (id: string, credential: string | undefined) => {
    if (!credential) {
      return;
    }
    const abort = new AbortController();
    streams.set(id, abort);
    fetch(`${hubHttp}/mcp/cawco?instanceId=${id}`, {
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "text/event-stream",
      },
      signal: abort.signal,
    })
      .then(async (response) => {
        const reader = response.body?.getReader();
        // biome-ignore lint/performance/noAwaitInLoops: one read after another, until the hub or the process ends the stream
        while (reader && !(await reader.read()).done) {
          // held open until the process ends
        }
      })
      .catch(() => undefined);
  };
  const closeStream = (id: string) => {
    streams.get(id)?.abort();
    streams.delete(id);
  };
  const limited = async (account: string | undefined) =>
    !!account && (await Bun.file(join(scratch, `limit-${account}`)).exists());
  const entry = (
    key: string,
    kind: "user" | "assistant",
    text: string,
    extra: object = {}
  ) => ({
    type: kind,
    uuid: crypto.randomUUID(),
    session_id: key,
    parent_tool_use_id: null,
    message: { role: kind, content: [{ type: "text", text }] },
    ...extra,
  });
  const session = (
    ctx: import("../packages/agent/src/harness").HarnessContext,
    key: string,
    account: string | undefined
  ) => ({
    harness: "claude" as const,
    sessionId: key,
    attached: () =>
      ctx.frame({
        type: "system",
        subtype: "init",
        session_id: key,
        cwd: ctx.cwd,
      } as never),
    // What Claude Code's context read answers: a context past any account's
    // move-whole bound, so a refused turn continues from a summary.
    control: async (method: string) => {
      if (method === "interrupt") {
        await log(`INTERRUPTED ${ctx.instanceId}`);
        ctx.busy(false);
        return;
      }
      return method === "getContextUsage" ? { totalTokens: 50_000 } : undefined;
    },
    resolvePermission: (requestId: string) => {
      log(`ANSWERED ${ctx.instanceId} ${requestId}`).catch(console.error);
      ctx.permissionResolved?.(requestId, "answered");
    },
    interrupt: async () => {
      await log(`INTERRUPTED ${ctx.instanceId}`);
      ctx.busy(false);
    },
    dispose: async () => closeStream(ctx.instanceId),
    send: (message: { uuid: string; message: { content: unknown } }) => {
      const { content } = message.message;
      const text =
        typeof content === "string"
          ? content
          : (content as { type: string; text?: string }[])
              .map((block) => block.text ?? "")
              .join("");
      (async () => {
        await log(
          `TURN ${ctx.instanceId} ${text.replaceAll("\n", " ").slice(0, 100)}`
        );
        // A session told to leave its sends unread never reads them.
        if (
          await Bun.file(join(scratch, `unread-${ctx.instanceId}`)).exists()
        ) {
          return;
        }
        ctx.frame({
          type: "system",
          subtype: MESSAGES_READ,
          read: [message.uuid],
          storedAs: {},
        } as never);
        await appendFile(
          transcript(key),
          `${JSON.stringify(entry(key, "user", text))}\n`
        );
        if (text.includes("ask-me")) {
          // Its turn is open until it is interrupted, as a real one is.
          ctx.busy(true);
          ctx.permission({
            requestId: `ask-${ctx.instanceId.slice(0, 8)}`,
            toolName: "Bash",
            input: { command: "true" },
          });
          return;
        }
        if (await limited(account)) {
          await log(`REFUSED ${ctx.instanceId} on ${account}`);
          ctx.frame({
            ...entry(key, "assistant", "You've hit your limit"),
            error: "rate_limit",
          } as never);
          ctx.frame({
            type: "result",
            subtype: "success",
            is_error: true,
            uuid: crypto.randomUUID(),
            result: "You've hit your limit",
          } as never);
          return;
        }
        const answer = entry(key, "assistant", `done: ${text.slice(0, 40)}`, {
          turnEnd: true,
        });
        await appendFile(transcript(key), `${JSON.stringify(answer)}\n`);
        ctx.frame(answer as never);
        ctx.frame({
          type: "result",
          subtype: "success",
          is_error: false,
          uuid: crypto.randomUUID(),
          result: `done: ${text.slice(0, 40)}`,
        } as never);
      })().catch(console.error);
    },
    stop: async () => {
      closeStream(ctx.instanceId);
      await log(`STOP ${ctx.instanceId}`);
      await endProc(client, ctx.instanceId);
    },
  });
  const read = async (key: string) =>
    (await Bun.file(transcript(key)).exists())
      ? (await readFile(transcript(key), "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const adapter = {
    kind: "claude" as const,
    auth: "unauthenticated" as const,
    capabilities: {
      permissionModes: ["bypassPermissions"],
    } as import("@cawco/core").HarnessCapabilities,
    detect: async () => ({
      harness: "claude" as const,
      installed: false,
      auth: "unauthenticated" as const,
      capabilities: adapter.capabilities,
    }),
    busyInstances: async () => [],
    listSessions: async () => [],
    getSessionInfo: async (key: string) =>
      (await Bun.file(transcript(key)).exists())
        ? {
            sessionId: key,
            harness: "claude",
            createdAt: Date.now() - 600_000,
            lastModified: Date.now(),
          }
        : undefined,
    getSessionMessages: (key: string) => read(key),
    renameSession: async () => undefined,
    tagSession: async () => undefined,
    deleteSession: async (key: string) => {
      await rm(transcript(key), { force: true });
    },
    endSession: async (_key: string, _dir: string, instanceId?: string) => {
      if (instanceId) {
        closeStream(instanceId);
        await endProc(client, instanceId);
      }
    },
    sessionAddresses: () => [],
    sessionPresent: async (key: string) =>
      await Bun.file(transcript(key)).exists(),
    unclaimedRunners: async () => ({ count: 0, readStartedAt: Date.now() }),
    custodyCandidates: async () => await client.list(),
    turnRunning: async () => false,
    adopt: async (
      id: string,
      ctx: import("../packages/agent/src/harness").HarnessContext
    ) => session(ctx, `conversation-${id}`, undefined),
    reattach: async (
      spec: import("@cawco/core").SpawnPayload,
      ctx: import("../packages/agent/src/harness").HarnessContext
    ) =>
      session(
        ctx,
        spec.resume?.sessionKey ?? `conversation-${ctx.instanceId}`,
        spec.accountDir?.accountId
      ),
    spawn: async (
      spec: import("@cawco/core").SpawnPayload,
      ctx: import("../packages/agent/src/harness").HarnessContext
    ) => {
      const key = spec.resume?.sessionKey ?? `conversation-${ctx.instanceId}`;
      await client.spawnProc(ctx.instanceId, {
        command: "/bin/sleep",
        args: ["600"],
        cwd: ctx.cwd,
        env: pathEnv,
      });
      if (ctx.sessionCredential) {
        await writeFile(
          join(scratch, `cred-${ctx.instanceId}`),
          ctx.sessionCredential
        );
      }
      await appendFile(transcript(key), "");
      openStream(ctx.instanceId, ctx.sessionCredential);
      await log(
        `SPAWN ${ctx.instanceId} account=${spec.accountDir?.accountId ?? "none"}`
      );
      return session(ctx, key, spec.accountDir?.accountId);
    },
  };
  registerHarness(
    adapter as unknown as import("../packages/agent/src/harness").Harness
  );
  const { runDaemon } = await import("../packages/agent/src/daemon");
  runDaemon("unauthenticated");
} else if (!role) {
  const dir = join(
    root,
    ".context",
    `succession-${crypto.randomUUID().slice(0, 8)}`
  );
  await mkdir(join(dir, "home", ".config", "cawco"), { recursive: true });
  const freePort = async (): Promise<number> => {
    const lease = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null),
    });
    const leased = lease.port as number;
    await lease.stop(true);
    return leased;
  };
  const port = await freePort();
  assert.notEqual(port, 3456);
  const gatewayPort = await freePort();
  const base = `http://127.0.0.1:${port}`;
  await writeFile(
    join(dir, "home", ".config", "cawco", "config.json"),
    JSON.stringify({ hubUrl: base })
  );
  const children: ReturnType<typeof Bun.spawn>[] = [];
  const launch = (name: string) => {
    const child = Bun.spawn(
      [
        "/usr/bin/env",
        `HOME=${join(dir, "home")}`,
        `XDG_CONFIG_HOME=${join(dir, "home", ".config")}`,
        `XDG_DATA_HOME=${join(dir, "home", ".local", "share")}`,
        `CAWCO_MCP_PORT=${gatewayPort}`,
        process.execPath,
        import.meta.path,
        name,
        dir,
        String(port),
      ],
      {
        cwd: root,
        env: pathEnv,
        stdout: Bun.file(join(dir, `${name}.log`)),
        stderr: Bun.file(join(dir, `${name}.err`)),
      }
    );
    children.push(child);
    console.log(`started ${name} pid ${child.pid}`);
    return child;
  };
  const api = async (path: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
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
  interface Row {
    account: string | null;
    continuedInto: string | null;
    endIntent: string | null;
    id: string;
    parent: string | null;
    status: string;
    workItemId: string | null;
  }
  const rows = () => api("/proof/rows") as Promise<Row[]>;
  const row = async (id: string) => (await rows()).find((one) => one.id === id);
  const hubLog = () => readFile(join(dir, "hub.log"), "utf8");
  const eventLog = async () =>
    (await Bun.file(join(dir, "events")).exists())
      ? await readFile(join(dir, "events"), "utf8")
      : "";
  const lines = (text: string, needle: string) =>
    text.split("\n").filter((line) => line.includes(needle));
  const quote = (label: string, quoted: string[]) => {
    console.log(`\n── ${label}`);
    for (const line of quoted) {
      console.log(`   ${line}`);
    }
  };
  const short = (id: string) => id.slice(0, 8);
  let dashboard: WebSocket | undefined;
  const dash = (frame: object) => dashboard?.send(JSON.stringify(frame));
  const spawn = (id: string, account: string, parent?: string) =>
    dash({
      verb: "spawn",
      machineId: machine,
      instanceId: id,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: id,
        cwd: dir,
        harness: "claude",
        model: "stand-in",
        title: `Private ${short(id)}`,
        account,
        ...(parent ? { parent: { instanceId: parent } } : {}),
      },
    });
  const personSays = (id: string, text: string) =>
    dash({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: machine,
      sessionId: id,
      payload: {
        instanceId: id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
  const stopSession = (id: string) =>
    dash({
      verb: "stop",
      machineId: machine,
      instanceId: id,
      requestId: crypto.randomUUID(),
      payload: { instanceId: id },
    });
  /** One CawCo tool call as session `id`, with its own credential. */
  const tool = async (
    id: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<{ text: string; isError: boolean }> => {
    const credential = await readFile(join(dir, `cred-${id}`), "utf8");
    const response = await fetch(`${base}/mcp/cawco?instanceId=${id}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const raw = await response.text();
    const data = raw.includes("data:")
      ? raw
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => JSON.parse(line.slice(5)))
          .find((message) => message.id === 1)
      : JSON.parse(raw);
    const result = data?.result ?? {};
    return {
      text: (result.content ?? [])
        .map((block: { text?: string }) => block.text ?? "")
        .join("\n"),
      isError: !!result.isError || !!data?.error,
    };
  };
  const running = (id: string) =>
    until(
      `${short(id)} running`,
      () => row(id),
      (one) => one?.status === "running"
    );
  const procs = async () => {
    const { SessiondClient } = await import(
      "../packages/agent/src/sessiond-client"
    );
    const client = await SessiondClient.connect(join(dir, "sessiond.sock"));
    const listing = await client.list();
    client.close?.();
    return listing.procs
      .filter((proc: { alive: boolean }) => proc.alive)
      .map((proc: { procId: string }) => proc.procId);
  };
  let failed: unknown;
  try {
    launch("sessiond");
    await until(
      "sessiond socket",
      () => Promise.resolve(existsSync(join(dir, "sessiond.sock"))),
      Boolean
    );
    launch("hub");
    await until(
      "hub",
      () =>
        fetch(`${base}/health`)
          .then((response) => response.ok)
          .catch(() => false),
      Boolean
    );
    dashboard = new WebSocket(`${base.replace("http", "ws")}/ws/dashboard`);
    await new Promise<void>((done, fail) => {
      if (dashboard) {
        dashboard.onopen = () => done();
        dashboard.onerror = () => fail(new Error("dashboard socket"));
      }
    });
    launch("agent");
    await until(
      "agent",
      () => api("/api/agents"),
      (
        agents: {
          machineId: string;
          status: string;
          custody?: { state: string };
        }[]
      ) =>
        agents.some(
          (one) =>
            one.machineId === machine &&
            one.status === "online" &&
            one.custody?.state === "available"
        )
    );
    const { a, b } = JSON.parse(await readFile(accountsFile(dir), "utf8")) as {
      a: string;
      b: string;
    };

    // ── 1. S0 on A continued onto B; hand-offs to S0 reach S1 ────────────
    const parent = crypto.randomUUID();
    const s0 = crypto.randomUUID();
    spawn(parent, b);
    await running(parent);
    spawn(s0, a, parent);
    await running(s0);
    const { workspaceId } = await api("/proof/item", { id: s0, parent });
    await api("/proof/context", { id: s0, tokens: 50_000 });
    await writeFile(join(dir, `limit-${a}`), "at its limit");
    await api("/proof/limit", { account: a });
    const brief = await tool(parent, "handoff", {
      target: s0,
      message: "Do the private work.",
    });
    console.log(`parent's brief to S0: ${brief.text}`);
    const continued = await until(
      "S0 continued",
      () => row(s0),
      (one) => !!one?.continuedInto
    );
    const s1 = continued.continuedInto as string;
    await until(
      "S1 took the item",
      () => api("/proof/items"),
      (items: { instanceId: string; workspaceId: string }[]) =>
        items.some(
          (item) => item.workspaceId === workspaceId && item.instanceId === s1
        )
    );
    quote(
      "the continuation (hub log)",
      lines(await hubLog(), "[at-limit]").filter(
        (line) => line.includes(s0) || line.includes(s1)
      )
    );
    const opensBefore = lines(await hubLog(), `stream open -> ${s0}`).length;
    const handoffs: string[] = [];
    for (const n of [1, 2, 3]) {
      // biome-ignore lint/performance/noAwaitInLoops: each hand-off after the last
      const handed = await tool(parent, "handoff", {
        target: s0,
        message: `Follow-up ${n} to the original id.`,
      });
      assert.ok(!handed.isError, handed.text);
      assert.ok(handed.text.includes(`(continues ${short(s0)})`), handed.text);
      handoffs.push(handed.text);
    }
    quote("handoff to S0's id, three times", handoffs);
    await until(
      "S1 read all three",
      eventLog,
      (text) =>
        lines(text, `TURN ${s1}`).filter((line) => line.includes("Follow-up"))
          .length === 3
    );
    await delay(1500);
    const opensAfter = lines(await hubLog(), `stream open -> ${s0}`).length;
    assert.equal(opensAfter, opensBefore, "S0's stream opened again");
    assert.equal(
      lines(await eventLog(), `TURN ${s0}`).filter((line) =>
        line.includes("Follow-up")
      ).length,
      0
    );
    const alive = await procs();
    assert.ok(!alive.includes(s0), `S0 process alive: ${alive}`);
    // S1 runs, or the agent put it to sleep at rest; S0 is ended for good.
    const pair = (await rows()).filter((one) => [s0, s1].includes(one.id));
    const ended = pair.filter((one) => one.status === "stopped");
    assert.deepEqual(
      ended.map((one) => one.id),
      [s0]
    );
    quote(
      "S0 and S1 rows",
      pair.map(
        (one) =>
          `${short(one.id)} status=${one.status} endIntent=${one.endIntent} continuedInto=${one.continuedInto ? short(one.continuedInto) : null} item=${one.workItemId}`
      )
    );
    quote("stream opens for S0, before and after the three hand-offs", [
      `before: ${opensBefore}, after: ${opensAfter}`,
      ...lines(await hubLog(), `stream open -> ${s0}`),
    ]);
    quote("the workspace's live sessions (sessiond processes)", [
      `alive: ${alive.filter((id) => [s0, s1].includes(id)).join(", ")}`,
    ]);
    // The dashboard: a person's send from S0's old tab, and its resume.
    personSays(s0, "Written in S0's old tab.");
    await until(
      "S1 read the old tab's send",
      eventLog,
      (text) => lines(text, `TURN ${s1} Written in S0's old tab.`).length === 1
    );
    spawn(s0, a, parent);
    await until("the resume went to S1", hubLog, (text) =>
      text.includes(`${s0} was continued as ${s1}: its resume goes there`)
    );
    await delay(1500);
    assert.equal(
      lines(await hubLog(), `stream open -> ${s0}`).length,
      opensBefore,
      "S0's stream opened for the dashboard"
    );
    assert.equal((await row(s0))?.status, "stopped");
    quote("the dashboard's send and resume of S0 (hub log)", [
      ...lines(await hubLog(), `${s0} was continued as`),
      ...lines(await hubLog(), "[hub] send ->").slice(-1),
    ]);

    // ── 2. Listings ──────────────────────────────────────────────────────
    const list = await tool(parent, "delegate_list", {});
    assert.ok(list.text.includes(s1) && !list.text.includes(s0), list.text);
    const sessions = await tool(parent, "list_sessions", {});
    assert.ok(!sessions.text.includes(short(s0)), sessions.text);
    quote("delegate_list", [list.text]);
    quote("list_sessions (S1 asleep at rest)", [sessions.text]);

    // ── 3. answer_delegate and interrupt_delegate by S0's id ─────────────
    // The ask wakes S1 and keeps its turn open: it runs while it waits.
    await tool(parent, "handoff", { target: s0, message: "ask-me please" });
    const requestId = `ask-${short(s1)}`;
    await running(s1);
    await delay(1000);
    const runningList = await tool(parent, "list_sessions", {});
    assert.ok(
      runningList.text.includes(short(s1)) &&
        !runningList.text.includes(short(s0)),
      runningList.text
    );
    quote("list_sessions (S1 running)", [runningList.text]);
    const answered = await tool(parent, "answer_delegate", {
      target: s0,
      requestId,
    });
    await until("S1 answered", eventLog, (text) =>
      text.includes(`ANSWERED ${s1} ${requestId}`)
    );
    const interrupted = await tool(parent, "interrupt_delegate", {
      target: s0,
    });
    console.log(
      `interrupt_delegate(S0) answered: ${interrupted.text} (S1 ${(await row(s1))?.status})`
    );
    await until("S1 interrupted", eventLog, (text) =>
      text.includes(`INTERRUPTED ${s1}`)
    );
    assert.ok(!(await eventLog()).includes(`INTERRUPTED ${s0}`));
    quote("interrupt_delegate(S0)", [interrupted.text]);
    quote("answer_delegate(S0)", [answered.text]);
    quote(
      "the stand-in harness (what each process was handed)",
      lines(await eventLog(), "INTERRUPTED").concat(
        lines(await eventLog(), "ANSWERED")
      )
    );

    // ── 4/5. A notice to a stopped session on A: kept, never woken, ─────
    //         never continued; a person's send wakes it.
    const t = crypto.randomUUID();
    const x = crypto.randomUUID();
    spawn(t, a);
    await running(t);
    spawn(x, b);
    await running(x);
    await writeFile(join(dir, `unread-${x}`), "never reads");
    await tool(t, "handoff", { target: x, message: "unread hand-off" });
    stopSession(t);
    await until(
      "T stopped",
      () => row(t),
      (one) => one?.status === "stopped"
    );
    const tOpens = lines(await hubLog(), `stream open -> ${t}`).length;
    stopSession(x);
    await until(
      "X stopped",
      () => row(x),
      (one) => one?.status === "stopped"
    );
    const kept = await until(
      "notice to T kept",
      () => api(`/proof/sends?id=${t}`),
      (sends: { name: string; owed: number }[]) =>
        sends.some((send) => send.name === "undelivered" && send.owed === 1)
    );
    await delay(2000);
    assert.equal((await row(t))?.status, "stopped");
    assert.equal(lines(await hubLog(), `stream open -> ${t}`).length, tOpens);
    assert.ok(!(await row(t))?.continuedInto);
    const keptNow = (await api(`/proof/sends?id=${t}`)) as {
      state: string;
      owed: number;
      name: string;
    }[];
    assert.ok(
      keptNow.some(
        (send) =>
          send.name === "undelivered" &&
          send.owed === 1 &&
          send.state === "pending"
      ),
      JSON.stringify(keptNow)
    );
    quote("the notice to stopped T (its send records)", [JSON.stringify(kept)]);
    quote(
      "the hub on it",
      lines(await hubLog(), `to ${t} queued`).concat(
        lines(await hubLog(), `not waking ${t}`)
      )
    );
    await rm(join(dir, `limit-${a}`));
    personSays(t, "A person writes to T.");
    await until(
      "T read the notice, then the person",
      eventLog,
      (text) =>
        lines(text, `TURN ${t}`).some((line) =>
          line.includes("not delivered")
        ) && lines(text, `TURN ${t} A person writes`).length === 1
    );
    quote(
      "T woken by the person: what it read, in order",
      lines(await eventLog(), `TURN ${t}`)
    );

    // A turn a hub notice started in a running session on A: left alone.
    await writeFile(join(dir, `limit-${a}`), "at its limit");
    const v = crypto.randomUUID();
    const x2 = crypto.randomUUID();
    spawn(v, a);
    await running(v);
    spawn(x2, b);
    await running(x2);
    await writeFile(join(dir, `unread-${x2}`), "never reads");
    await tool(v, "handoff", { target: x2, message: "unread hand-off" });
    stopSession(x2);
    await until("V refused", eventLog, (text) => text.includes(`REFUSED ${v}`));
    await delay(3000);
    assert.ok(!(await row(v))?.continuedInto, "V was continued");
    const vLines = lines(await hubLog(), `[at-limit] ${v}`);
    assert.ok(
      vLines.some((line) => line.includes("left for a person or its parent")),
      vLines.join("\n")
    );
    assert.ok(
      !vLines.some((line) => line.includes("continue on")),
      vLines.join("\n")
    );
    quote(
      "a notice-started turn refused on A (hub log)",
      lines(await hubLog(), `[at-limit] ${v}`)
    );

    // ── 6. A delegate's report to its stopped parent waits ───────────────
    const q = crypto.randomUUID();
    const d = crypto.randomUUID();
    spawn(q, b);
    await running(q);
    spawn(d, b, q);
    await running(d);
    await api("/proof/item", { id: d, parent: q });
    stopSession(q);
    await until(
      "Q stopped",
      () => row(q),
      (one) => one?.status === "stopped"
    );
    const qOpens = lines(await hubLog(), `stream open -> ${q}`).length;
    personSays(d, "A person asks D for its report.");
    const report = await until(
      "D's report to Q kept",
      () => api(`/proof/sends?id=${q}`),
      (sends: { kind: string; owed: number; words: string }[]) =>
        sends.some(
          (send) =>
            send.kind === "peer" &&
            send.owed === 1 &&
            send.words.includes("Report")
        )
    );
    await delay(2000);
    assert.equal((await row(q))?.status, "stopped");
    assert.equal(lines(await hubLog(), `stream open -> ${q}`).length, qOpens);
    const reportNow = (await api(`/proof/sends?id=${q}`)) as {
      state: string;
      owed: number;
      kind: string;
    }[];
    assert.ok(
      reportNow.some(
        (send) =>
          send.kind === "peer" && send.owed === 1 && send.state === "pending"
      ),
      JSON.stringify(reportNow)
    );
    quote("D's report to stopped Q, as accepted", [JSON.stringify(report)]);
    quote("and two seconds later", [JSON.stringify(reportNow)]);

    console.log("\nPROOF PASSED");
  } catch (error) {
    failed = error;
    console.error(error);
  } finally {
    dashboard?.close();
    for (const child of children.reverse()) {
      child.kill("SIGTERM");
      // biome-ignore lint/performance/noAwaitInLoops: one at a time, by recorded pid
      await Promise.race([child.exited, delay(5000)]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
    console.log(`scratch: ${dir}`);
  }
  process.exit(failed ? 1 : 0);
}
