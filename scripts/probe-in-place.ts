/**
 * In-place continuation proof on a private stack: the real hub (scratch
 * database, free port), the real agent daemon and a private sessiond, two
 * fake Claude accounts (A and B, no credentials anywhere) and a stand-in
 * `claude` harness whose sessions are `/bin/sleep` children held by
 * sessiond. The stand-in plays the account's API: a turn on an account
 * marked at its limit ends the way Claude Code ends one its usage limit
 * refused (an assistant entry with `error: "rate_limit"`, then the result);
 * any other turn is answered, and a summariser's slowly when asked to be.
 *
 *   unshare -rn sh -c 'ip link set lo up && bun scripts/probe-in-place.ts'
 *   bun scripts/probe-in-place.ts --hold   (a session to watch in a browser;
 *     touching <scratch>/go continues it at A's limit, its summary slow)
 *
 * Proves, one run each:
 *   (d) chains a hub before this one split at the limit, seeded at migration
 *       0127 (two steps; and one source continued twice), fold into one row
 *       each under the id that runs: children under it, conversations read
 *       through behind "Continued on" lines, the openings folded under them,
 *       the sends a process lost owed to it again and read;
 *   (a) a session at A's limit goes on on B in place: same id, row, parent,
 *       work item and child; "Summarising for B…" first, then the
 *       "Continued on B" line under the same id; its new conversation opens
 *       on the summary; the send its refused turn read stays read;
 *   (c) a person's send to it while it is at its limit is held, then read by
 *       the new conversation, after the opening;
 *   (b) an agent restart while a session's turn is parked on a question:
 *       what was queued for it is read by the restored process, nothing is
 *       failed as ended, and the turn handed back asks the question again.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const hold = process.argv.includes("--hold");
const [role, scratch, portText] = process.argv
  .slice(2)
  .filter((one) => one !== "--hold");
const machine = "in-place-proof";
const pathEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
const hubRequire = createRequire(join(root, "packages/hub/package.json"));

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
/** The seeded chains' ids, kept by the seed in the scratch folder. */
const seedFile = (dir: string) => join(dir, "seed.json");

/** One stored transcript entry, as the stand-in and the seed write them. */
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

if (role === "sessiond") {
  await import("../packages/sessiond/src/main");
} else if (role === "seed") {
  // A database as a hub before this one left it (migration 0127), holding
  // the chains it made of sessions continued at an account's limit.
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import(
    hubRequire.resolve("drizzle-orm/bun-sqlite")
  );
  const { migrate } = await import(
    hubRequire.resolve("drizzle-orm/bun-sqlite/migrator")
  );
  const folder = join(scratch, "migrations-0127");
  cpSync(join(root, "packages/hub/drizzle"), folder, { recursive: true });
  const journal = JSON.parse(
    await readFile(join(folder, "meta", "_journal.json"), "utf8")
  ) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((one) => one.idx <= 127);
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify(journal)
  );
  const sqlite = new Database(process.env.CAWCO_DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: folder });
  const t0 = Date.now() - 6 * 3_600_000;
  const at = (minutes: number) => t0 + minutes * 60_000;
  const ids = {
    r: crypto.randomUUID(),
    m: crypto.randomUUID(),
    s: crypto.randomUUID(),
    d1: crypto.randomUUID(),
    d2: crypto.randomUUID(),
    p: crypto.randomUUID(),
    f: crypto.randomUUID(),
    g: crypto.randomUUID(),
  };
  const insert = sqlite.prepare(
    "INSERT INTO instances (id, machine_id, cwd, harness, session_id, status, end_intent, end_confirmed_at, end_reason, continued_into, parent_instance_id, title, title_source, created_at, updated_at, spawned_at, launch_dir) VALUES (?, ?, ?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'known')"
  );
  const row = (
    id: string,
    minutes: number,
    status: string,
    options: {
      ended?: string;
      into?: string;
      parent?: string;
      title?: string;
    } = {}
  ) =>
    insert.run(
      id,
      machine,
      scratch,
      `conv-${id.slice(0, 8)}`,
      status,
      options.ended ? "stop" : null,
      options.ended ? at(minutes + 30) : null,
      options.ended ?? null,
      options.into ?? null,
      options.parent ?? null,
      options.title ?? null,
      options.title ? "owner" : null,
      at(minutes),
      at(minutes + 30),
      at(minutes)
    );
  const line = (id: string, minutes: number, move: object) =>
    sqlite
      .prepare(
        "INSERT INTO limit_events (id, instance_id, at, move) VALUES (?, ?, ?, ?)"
      )
      .run(crypto.randomUUID(), id, at(minutes), JSON.stringify(move));
  const named = (name: string) => ({ id: name, name, hue: "teal" });
  const continued = {
    kind: "continued",
    from: named("a"),
    to: named("b"),
    writtenOn: named("b"),
    tokens: 180_000,
    preparedAtPct: null,
  };
  /** What each conversation opened on, stored first in it: its send's uuid and words. */
  const openings = new Map<string, { uuid: string; text: string }>();
  const send = (
    to: string,
    minutes: number,
    text: string,
    origin: object,
    state: "read" | "failed",
    reason: string | null = null
  ) => {
    const uuid = crypto.randomUUID();
    if (text.startsWith("Continuing session")) {
      openings.set(to, { uuid, text });
    }
    return sqlite
      .prepare(
        "INSERT INTO sent_messages (uuid, instance_id, accepted_at, body, mode, state, reason) VALUES (?, ?, ?, ?, 'turn', ?, ?)"
      )
      .run(
        uuid,
        to,
        at(minutes),
        JSON.stringify({
          type: "user",
          uuid,
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin,
        }),
        state,
        reason
      );
  };
  const ended = "The session ended before it read this.";
  // Two steps: R → M → S, S the one that runs. Delegates under R and M.
  row(ids.r, 0, "stopped", {
    ended: "continued on b",
    into: ids.m,
    title: "Seeded orchestrator",
  });
  row(ids.m, 60, "stopped", { ended: "continued on b", into: ids.s });
  row(ids.s, 120, "sleeping");
  row(ids.d1, 10, "stopped", { parent: ids.r });
  row(ids.d2, 70, "sleeping", { parent: ids.m });
  line(ids.m, 60, continued);
  line(ids.r, 60, continued);
  line(ids.s, 120, continued);
  line(ids.m, 120, continued);
  send(
    ids.m,
    60,
    "Continuing session R.",
    { kind: "peer", fromSession: ids.r },
    "read"
  );
  send(
    ids.s,
    120,
    "Continuing session M.",
    { kind: "peer", fromSession: ids.m },
    "read"
  );
  // Failed before any continuation: history, never owed again.
  send(
    ids.r,
    5,
    "An old report, failed long ago.",
    { kind: "peer", fromSession: ids.d1 },
    "failed",
    ended
  );
  // Failed as "ended" after it: the session's still, owed and read now.
  send(
    ids.m,
    90,
    "Report one, never read.",
    { kind: "peer", fromSession: ids.d2 },
    "failed",
    ended
  );
  send(
    ids.m,
    91,
    "Report two, never read.",
    { kind: "peer", fromSession: ids.d2 },
    "failed",
    ended
  );
  // One source continued twice: P → F (first, runs) and P → G (second).
  row(ids.p, 0, "stopped", { ended: "continued on b", into: ids.f });
  row(ids.f, 30, "sleeping");
  row(ids.g, 44, "running");
  line(ids.f, 30, continued);
  line(ids.p, 30, continued);
  line(ids.g, 44, continued);
  line(ids.p, 44, continued);
  send(
    ids.f,
    30,
    "Continuing session P.",
    { kind: "peer", fromSession: ids.p },
    "read"
  );
  send(
    ids.g,
    44,
    "Continuing session P again.",
    { kind: "peer", fromSession: ids.p },
    "read"
  );
  // Each conversation as the stand-in stores it, dated.
  for (const [id, minutes] of [
    [ids.r, 0],
    [ids.m, 60],
    [ids.s, 120],
    [ids.p, 0],
    [ids.f, 30],
    [ids.g, 44],
  ] as const) {
    const key = `conv-${id.slice(0, 8)}`;
    const stamp = (plus: number) => ({
      timestamp: new Date(at(minutes + plus)).toISOString(),
    });
    const opening = openings.get(id);
    // biome-ignore lint/performance/noAwaitInLoops: six small files, one after another
    await writeFile(
      join(scratch, `${key}.jsonl`),
      [
        ...(opening
          ? [
              entry(key, "user", opening.text, {
                uuid: opening.uuid,
                ...stamp(0),
              }),
            ]
          : []),
        entry(key, "user", `words in ${key}`, stamp(1)),
        entry(key, "assistant", `answer in ${key}`, {
          ...stamp(2),
          turnEnd: true,
        }),
      ]
        .map((one) => JSON.stringify(one))
        .join("\n")
        .concat("\n")
    );
  }
  writeFileSync(seedFile(scratch), JSON.stringify(ids));
  sqlite.close();
  console.log("SEEDED");
} else if (role === "hub") {
  const { Effect, Layer } = await import(hubRequire.resolve("effect"));
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
                "SELECT id, kind, status, end_intent AS endIntent, session_id AS sessionId, conversations, work_item_id AS workItemId, parent_instance_id AS parent, account_id AS account, title FROM instances"
              )
              .all()
          )
          .get("/proof/aliases", () =>
            sql
              .query(
                "SELECT id, instance_id AS now, folded FROM instance_aliases"
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
          .get("/proof/events", ({ query }) =>
            sql
              .query(
                "SELECT id, at, json_extract(move, '$.kind') AS kind FROM limit_events WHERE instance_id = ? ORDER BY at"
              )
              .all(String(query.id))
          )
          .get("/proof/sends", ({ query }) =>
            sql
              .query(
                "SELECT uuid, state, reason, owed IS NOT NULL AS owed, json_extract(body, '$.origin.kind') AS kind, json_extract(body, '$.origin.name') AS name, substr(json_extract(body, '$.message.content'), 1, 120) AS words FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at"
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
  const stamped = (
    key: string,
    kind: "user" | "assistant",
    text: string,
    extra: object = {}
  ) =>
    entry(key, kind, text, { timestamp: new Date().toISOString(), ...extra });
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
        // A session told to leave its sends unread never reads them.
        if (
          await Bun.file(join(scratch, `unread-${ctx.instanceId}`)).exists()
        ) {
          await log(`UNREAD ${ctx.instanceId} ${text.slice(0, 60)}`);
          return;
        }
        await log(
          `TURN ${ctx.instanceId} ${key} ${text.replaceAll("\n", " ").slice(0, 400)}`
        );
        ctx.frame({
          type: "system",
          subtype: MESSAGES_READ,
          read: [message.uuid],
          storedAs: {},
        } as never);
        // Stored under the uuid it was sent with, as Claude Code stores it.
        await appendFile(
          transcript(key),
          `${JSON.stringify(stamped(key, "user", text, { uuid: message.uuid }))}\n`
        );
        if (text.includes("ask-question")) {
          // Its turn is open on a question to the person, as a real one is.
          ctx.busy(true);
          ctx.permission({
            requestId: `ask-${ctx.instanceId.slice(0, 8)}`,
            toolName: "AskUserQuestion",
            input: {
              questions: [
                {
                  question: "Which colour should the button be?",
                  header: "Colour",
                  multiSelect: false,
                  options: [
                    { label: "Red", description: "red" },
                    { label: "Blue", description: "blue" },
                  ],
                },
              ],
            },
          });
          return;
        }
        if (await limited(account)) {
          await log(`REFUSED ${ctx.instanceId} on ${account}`);
          ctx.frame({
            ...stamped(key, "assistant", "You've hit your limit"),
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
        // A summariser asked to take its time does, so its live row is seen.
        if (
          text.startsWith("Below is the transcript") &&
          (await Bun.file(join(scratch, "slow-summary")).exists())
        ) {
          await delay(
            Number(await readFile(join(scratch, "slow-summary"), "utf8"))
          );
        }
        const answer = stamped(key, "assistant", `done: ${text.slice(0, 40)}`, {
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
    // Every conversation the stand-in stores is one its machine can resume.
    listSessions: async () =>
      readdirSync(scratch)
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => ({
          sessionId: name.slice(0, -".jsonl".length),
          harness: "claude",
          createdAt: Date.now() - 600_000,
          lastModified: Date.now(),
        })),
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
      // A start with nothing to resume begins a conversation of its own, as
      // Claude Code mints a new session id.
      const key =
        spec.resume?.sessionKey ??
        `conversation-${ctx.instanceId.slice(0, 8)}-${crypto.randomUUID().slice(0, 4)}`;
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
        `SPAWN ${ctx.instanceId} ${key} account=${spec.accountDir?.accountId ?? "none"}${spec.resume ? " resume" : " fresh"}`
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
    `in-place-${crypto.randomUUID().slice(0, 8)}`
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
  const children = new Map<string, ReturnType<typeof Bun.spawn>>();
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
    children.set(name, child);
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
    conversations: string;
    endIntent: string | null;
    id: string;
    kind: string;
    parent: string | null;
    sessionId: string | null;
    status: string;
    title: string | null;
    workItemId: string | null;
  }
  interface Send {
    kind: string;
    name: string | null;
    owed: number;
    reason: string | null;
    state: string;
    uuid: string;
    words: string;
  }
  const rows = () => api("/proof/rows") as Promise<Row[]>;
  const row = async (id: string) => (await rows()).find((one) => one.id === id);
  const sends = (id: string) => api(`/proof/sends?id=${id}`) as Promise<Send[]>;
  const limitLines = (id: string) =>
    api(`/proof/events?id=${id}`) as Promise<
      { id: string; at: number; kind: string }[]
    >;
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
  const startAgent = async () => {
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
  };
  const startSessiond = async () => {
    await rm(join(dir, "sessiond.sock"), { force: true });
    launch("sessiond");
    await until(
      "sessiond socket",
      () => Promise.resolve(existsSync(join(dir, "sessiond.sock"))),
      Boolean
    );
  };
  const killed = async (name: string) => {
    const child = children.get(name);
    child?.kill("SIGKILL");
    await child?.exited;
    children.delete(name);
  };
  /** A session on `account` with eight turns behind it: enough that its summary has a middle to read. */
  const withHistory = async (id: string, account: string, parent?: string) => {
    spawn(id, account, parent);
    await running(id);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      personSays(id, `Turn ${n}: a long enough piece of work to summarise.`);
      // biome-ignore lint/performance/noAwaitInLoops: each turn after the last
      await until(
        `${short(id)} turn ${n}`,
        eventLog,
        (text) => text.includes(`TURN ${id}`) && text.includes(`Turn ${n}:`)
      );
    }
    await api("/proof/context", { id, tokens: 50_000 });
  };
  let failed: unknown;
  try {
    // ── The database a hub before this one left: its split chains ───────
    const seeded = launch("seed");
    await seeded.exited;
    assert.equal(
      seeded.exitCode,
      0,
      await readFile(join(dir, "seed.err"), "utf8")
    );
    const ids = JSON.parse(await readFile(seedFile(dir), "utf8")) as Record<
      string,
      string
    >;
    await startSessiond();
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
    const formerIds = new Promise<Record<string, string>>((done, fail) => {
      if (dashboard) {
        dashboard.onerror = () => fail(new Error("dashboard socket"));
        dashboard.onmessage = (event) => {
          const frame = JSON.parse(String(event.data));
          if (frame.payload?.kind === "instances") {
            done(frame.payload.formerIds);
          }
        };
      }
    });
    await new Promise<void>((done, fail) => {
      if (dashboard) {
        dashboard.onopen = () => done();
        dashboard.onerror = () => fail(new Error("dashboard socket"));
      }
    });
    const { a, b } = JSON.parse(await readFile(accountsFile(dir), "utf8")) as {
      a: string;
      b: string;
    };
    // Each account's Claude dir, as its sign-in makes it on a machine.
    for (const account of [a, b]) {
      // biome-ignore lint/performance/noAwaitInLoops: two dirs
      await mkdir(join(dir, "home", ".cawco", "accounts", account, "claude"), {
        recursive: true,
      });
    }
    await startAgent();

    // ── (d) the fold ─────────────────────────────────────────────────────
    quote("the fold (hub log)", lines(await hubLog(), "[hub] folded"));
    const after = await rows();
    const ids8 = (list: string[]) => list.map(short);
    assert.deepEqual(
      ids8(
        [ids.r, ids.m, ids.p].filter((id) => after.some((one) => one.id === id))
      ),
      [],
      "former rows left"
    );
    const s = after.find((one) => one.id === ids.s) as Row;
    const sConversations = JSON.parse(s.conversations) as {
      sessionId: string;
      next: string | null;
    }[];
    assert.deepEqual(
      sConversations.map((one) => one.sessionId),
      [`conv-${short(ids.r)}`, `conv-${short(ids.m)}`]
    );
    assert.ok(
      sConversations.every((one) => one.next),
      s.conversations
    );
    assert.equal(s.title, "Seeded orchestrator", "the identity's own name");
    for (const child of [ids.d1, ids.d2]) {
      assert.equal(
        after.find((one) => one.id === child)?.parent,
        ids.s,
        `child ${short(child)} under S`
      );
    }
    const f = after.find((one) => one.id === ids.f) as Row;
    assert.deepEqual(
      (JSON.parse(f.conversations) as { sessionId: string }[]).map(
        (one) => one.sessionId
      ),
      [`conv-${short(ids.p)}`, `conv-${short(ids.g)}`]
    );
    await until(
      "G (the second successor) ended at its machine and gone",
      rows,
      (now) => !now.some((one) => one.id === ids.g)
    );
    const aliases = await api("/proof/aliases");
    const framed = await formerIds;
    for (const former of [ids.r, ids.m]) {
      assert.equal(framed[former], ids.s, `${short(former)} → S on the frame`);
    }
    for (const former of [ids.p, ids.g]) {
      assert.equal(framed[former], ids.f, `${short(former)} → F on the frame`);
    }
    quote("instance_aliases", [JSON.stringify(aliases)]);
    quote(
      "S and F as rows",
      [s, f].map(
        (one) =>
          `${short(one.id)} status=${one.status} title=${one.title} conversations=${one.conversations}`
      )
    );
    // S's transcript reads through: R's conversation, a line, M's, a line, its own.
    const page = (await api(
      `/api/instances/${ids.s}/transcript?limit=200`
    )) as {
      blocks: {
        type: string;
        content: string;
        metadata?: { continuation?: boolean; accountMove?: { kind: string } };
      }[];
    };
    const told = page.blocks
      .filter(
        (block) =>
          block.type === "system.account_move" ||
          block.content.startsWith("words in") ||
          block.metadata?.continuation
      )
      .map((block) => {
        if (block.type === "system.account_move") {
          return `── ${block.metadata?.accountMove?.kind}`;
        }
        return block.metadata?.continuation
          ? `(opening, folded) ${block.content}`
          : block.content;
      });
    quote("S's transcript, read through (what matters of it)", told);
    assert.deepEqual(told, [
      `words in conv-${short(ids.r)}`,
      "── continued",
      "(opening, folded) Continuing session R.",
      `words in conv-${short(ids.m)}`,
      "── continued",
      "(opening, folded) Continuing session M.",
      `words in conv-${short(ids.s)}`,
    ]);
    // The same transcript by a former id: one session.
    const byFormer = (await api(
      `/api/instances/${ids.r}/transcript?limit=200`
    )) as { blocks: unknown[] };
    assert.equal(byFormer.blocks.length, page.blocks.length);
    // What a process lost after the first continuation is S's, and read now.
    await until("S read both reports", eventLog, (text) =>
      ["Report one, never read.", "Report two, never read."].every((words) =>
        lines(text, `TURN ${ids.s}`).some((one) => one.includes(words))
      )
    );
    const sSends = await sends(ids.s);
    quote(
      "S's sends after the fold",
      sSends.map(
        (one) =>
          `${one.state} ${one.reason ?? ""} ${one.name ?? one.kind} ${one.words}`
      )
    );
    assert.ok(
      sSends.some(
        (one) => one.words.startsWith("An old report") && one.state === "failed"
      ),
      "a failure from before the chain stays history"
    );
    assert.ok(
      sSends
        .filter((one) => one.words.startsWith("Report"))
        .every((one) => one.state === "read"),
      JSON.stringify(sSends)
    );

    // ── (a) + (c) a session at A's limit goes on on B, in place ──────────
    const parent = crypto.randomUUID();
    const s0 = crypto.randomUUID();
    spawn(parent, b);
    await running(parent);
    await withHistory(s0, a, parent);
    const { workspaceId, itemId } = await api("/proof/item", {
      id: s0,
      parent,
    });
    const child = crypto.randomUUID();
    spawn(child, b, s0);
    await running(child);
    const before = await row(s0);
    const sessionBefore = before?.sessionId;
    const countBefore = (await rows()).filter(
      (one) => one.kind !== "summariser"
    ).length;
    await writeFile(join(dir, "slow-summary"), "6000");
    await writeFile(join(dir, `limit-${a}`), "at its limit");
    await api("/proof/limit", { account: a });
    const brief = await tool(parent, "handoff", {
      target: s0,
      message: "Do the private work.",
    });
    console.log(`parent's brief to S0: ${brief.text}`);
    const summarising = await until(
      "S0's live line",
      () => limitLines(s0),
      (seen) => seen.some((one) => one.kind === "continuing")
    );
    const live = summarising.find((one) => one.kind === "continuing");
    // (c) a person writes to it while the summary is being written.
    personSays(s0, "A late word from the person.");
    const held = await until(
      "the late word held",
      () => sends(s0),
      (now) =>
        now.some(
          (one) =>
            one.words.startsWith("A late word") &&
            one.owed === 1 &&
            one.state === "pending"
        )
    );
    quote("while summarising: S0's line and the late word", [
      JSON.stringify(summarising),
      JSON.stringify(held.filter((one) => one.words.startsWith("A late word"))),
    ]);
    await until(
      "S0's line became the divider, under the same id",
      () => limitLines(s0),
      (now) =>
        now.some((one) => one.id === live?.id && one.kind === "continued")
    );
    await until(
      "the new conversation read the opening, then the late word",
      eventLog,
      (text) => {
        const turns = lines(text, `TURN ${s0}`);
        const opening = turns.findIndex((one) =>
          one.includes("Continuing session")
        );
        const late = turns.findIndex((one) => one.includes("A late word"));
        return opening >= 0 && late > opening;
      }
    );
    const s0After = (await row(s0)) as Row;
    const s0Conversations = JSON.parse(s0After.conversations) as {
      sessionId: string;
      accountId: string;
      next: string;
    }[];
    assert.equal(s0After.account, b, "S0 runs on B now");
    assert.equal(s0Conversations.length, 1);
    assert.equal(s0Conversations[0].sessionId, sessionBefore);
    assert.equal(s0Conversations[0].accountId, a);
    assert.equal(s0Conversations[0].next, live?.id);
    assert.notEqual(s0After.sessionId, sessionBefore);
    assert.equal(s0After.parent, parent, "same parent");
    assert.equal(s0After.workItemId, itemId, "same work item");
    assert.equal((await row(child))?.parent, s0, "its child still under it");
    const items = (await api("/proof/items")) as {
      instanceId: string;
      workspaceId: string;
    }[];
    assert.ok(
      items.some(
        (one) => one.workspaceId === workspaceId && one.instanceId === s0
      )
    );
    assert.equal(
      (await rows()).filter((one) => one.kind !== "summariser").length,
      countBefore,
      "no session row was added"
    );
    const s0Sends = await sends(s0);
    const handed = s0Sends.find((one) =>
      one.words.includes("Do the private work.")
    );
    assert.equal(
      handed?.state,
      "read",
      "the send the refused turn read stays read"
    );
    assert.ok(
      s0Sends.every((one) => one.state !== "failed"),
      JSON.stringify(s0Sends)
    );
    const late = s0Sends.find((one) => one.words.startsWith("A late word"));
    assert.equal(late?.state, "read");
    const s0Page = (await api(`/api/instances/${s0}/transcript?limit=400`)) as {
      blocks: {
        id: string;
        type: string;
        content: string;
        metadata?: { continuation?: boolean; accountMove?: { kind: string } };
      }[];
    };
    const divider = s0Page.blocks.findIndex(
      (block) => block.metadata?.accountMove?.kind === "continued"
    );
    assert.ok(divider > 0, "the divider is in S0's transcript");
    assert.ok(
      s0Page.blocks[divider + 1]?.metadata?.continuation,
      "the opening right under it, marked to fold"
    );
    assert.ok(
      s0Page.blocks
        .slice(0, divider)
        .some((block) => block.content.includes("Turn 1:")),
      "the old conversation reads above it"
    );
    quote("the continuation (hub log)", [
      ...lines(await hubLog(), `[at-limit] ${s0}`),
      ...lines(await hubLog(), `[continuation] ${s0}`),
    ]);
    quote(
      "the stand-in: what S0's processes did",
      lines(await eventLog(), s0).filter((one) => !one.includes("Turn "))
    );
    quote("S0 as a row", [
      `${short(s0)} account=${s0After.account === b ? "B" : s0After.account} session=${s0After.sessionId} parent=${short(s0After.parent ?? "")} item=${s0After.workItemId} conversations=${s0After.conversations}`,
    ]);
    quote(
      "S0's sends",
      s0Sends.map(
        (one) =>
          `${one.state} owed=${one.owed} ${one.name ?? one.kind} ${one.words.slice(0, 60)}`
      )
    );
    await rm(join(dir, `limit-${a}`));
    await rm(join(dir, "slow-summary"));

    // ── (b) an agent restart while a turn waits on a question ───────────
    // An orchestrator, as the session the restart cut was.
    const q = crypto.randomUUID();
    spawn(q, b);
    await running(q);
    personSays(q, "ask-question about the button");
    await until(
      "Q asked",
      hubLog,
      (text) =>
        text.includes(`ask-${short(q)}`) || text.includes("AskUserQuestion"),
      10_000
    ).catch(() => undefined);
    await delay(1000);
    await writeFile(join(dir, `unread-${q}`), "holds what it is sent");
    for (const n of [1, 2]) {
      // biome-ignore lint/performance/noAwaitInLoops: one hand-off after the other
      await tool(parent, "handoff", {
        target: q,
        message: `Queued hand-off ${n} while it asks.`,
      });
    }
    await until(
      "both handed and unread",
      eventLog,
      (text) => lines(text, `UNREAD ${q}`).length >= 2
    );
    // The agent and sessiond go down together: the process with them.
    await killed("agent");
    await killed("sessiond");
    await rm(join(dir, `unread-${q}`));
    await startSessiond();
    await startAgent();
    await until("the restored Q read both hand-offs", eventLog, (text) =>
      [1, 2].every((n) =>
        lines(text, `TURN ${q}`).some((one) =>
          one.includes(`Queued hand-off ${n}`)
        )
      )
    );
    const asked = await until(
      "Q was asked its question again",
      eventLog,
      (text) =>
        lines(text, `TURN ${q}`).some(
          (one) => one.includes("restarted") && one.includes("Which colour")
        )
    ).then((text) => lines(text, `TURN ${q}`));
    const qSends = await sends(q);
    quote("Q after the restart: what its new process read", asked);
    quote(
      "Q's sends",
      qSends.map(
        (one) => `${one.state} ${one.reason ?? ""} ${one.words.slice(0, 70)}`
      )
    );
    assert.ok(
      qSends.every((one) => !(one.reason ?? "").includes("ended")),
      JSON.stringify(qSends)
    );
    assert.ok(
      qSends
        .filter((one) => one.words.startsWith("Queued hand-off"))
        .every((one) => one.state === "read"),
      JSON.stringify(qSends)
    );
    quote("the restore (hub log)", lines(await hubLog(), q).slice(-8));

    if (hold) {
      // ── A session to watch in a browser ───────────────────────────────
      const w = crypto.randomUUID();
      await withHistory(w, a);
      await writeFile(join(dir, "slow-summary"), "20000");
      console.log(`\nHOLD hub ${base} session ${w}`);
      console.log(`touch ${join(dir, "go")} to continue it at A's limit`);
      await until(
        "go",
        () => Promise.resolve(existsSync(join(dir, "go"))),
        Boolean,
        3_600_000
      );
      await writeFile(join(dir, `limit-${a}`), "at its limit");
      await api("/proof/limit", { account: a });
      personSays(w, "Carry on with the work.");
      await until(
        "W continued",
        () => limitLines(w),
        (now) => now.some((one) => one.kind === "continued"),
        120_000
      );
      console.log("CONTINUED; touch stop to end");
      await until(
        "stop",
        () => Promise.resolve(existsSync(join(dir, "stop"))),
        Boolean,
        3_600_000
      );
    }
    console.log("\nPROOF PASSED");
  } catch (error) {
    failed = error;
    console.error(error);
  } finally {
    dashboard?.close();
    for (const child of [...children.values()].reverse()) {
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
