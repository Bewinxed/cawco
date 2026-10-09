/**
 * A side channel's network failure must never end the hub, and nothing the
 * hub logs may hold a secret. This boots a scratch hub on loopback whose
 * Telegram is a TCP server that reads each request and then resets the
 * connection, then drives every Telegram path through the hub's own agent
 * socket, five times each:
 *
 *   ask        a permission_request frame        → onAsk → sendMessage
 *   settle     an error frame ending an open ask → onSettled → editMessageText
 *   error      an error frame                    → onError → sendMessage
 *   supervisor a turn's result, autopilot armed  → onSupervisor → sendMessage
 *   message    a user_message frame              → onUserMessage → sendMessage
 *
 * The hub's own getUpdates poll is reset the whole time as well. It passes
 * when the hub still answers HTTP afterwards and its stdout and stderr never
 * held the bot token.
 *
 *   bun scripts/probe-hub-side-channel.ts [checkout root, default this one]
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** A dummy in Telegram's token shape. Never a real credential. */
const TOKEN = "123456:PROBE-NOT-A-TOKEN";
const MACHINE = "side-channel-probe";
const CHAT_ID = 4242;
const ROUNDS = 5;
const SPAWNED_AT = 1_790_000_000_000;
const PATHS = ["ask", "settle", "error", "supervisor", "message"] as const;
type Path = (typeof PATHS)[number];
const CONTENT_LENGTH_RE = /content-length:\s*(\d+)/i;
/** The Bot API method off a request line: `POST /bot<token>/<method> HTTP/1.1`. */
const BOT_METHOD_RE = /^\S+ \S*\/bot[^/]+\/(\S+) HTTP/;

const instanceIds = PATHS.flatMap((path) =>
  Array.from({ length: ROUNDS }, (_, index) => `${path}-${index + 1}`)
);

const [role, rootArg, scratchArg, llmUrl] = process.argv.slice(2);

/** Seeds the scratch database through the hub's own Db, in its own process: the Db reads its path at import. */
const seed = async (root: string, scratch: string, supervisorUrl: string) => {
  const hubRequire = createRequire(join(root, "packages/hub/package.json"));
  const { Effect, Layer } = await import(hubRequire.resolve("effect"));
  const { Db, DbLayer } = await import(join(root, "packages/hub/src/db"));
  const { HubLifetimeLayer } = await import(
    join(root, "packages/hub/src/lifetime")
  );
  const { Database } = await import("bun:sqlite");
  await Effect.runPromise(
    Effect.scoped(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Db;
          db.putCredential("telegram", { chatId: CHAT_ID });
          db.upsertAgent({
            machineId: MACHINE,
            hostname: MACHINE,
            os: "linux",
            auth: "unauthenticated",
          });
          for (const id of instanceIds) {
            db.openInstance({
              id,
              machineId: MACHINE,
              cwd: scratch,
              sessionId: `conversation-${id}`,
              harness: "claude",
              kind: "mainline",
              model: "stand-in",
              permissionMode: "default",
            });
          }
          db.putSupervisorConfig({
            enabled: true,
            baseUrl: supervisorUrl,
            model: "probe-model",
          });
          for (let round = 1; round <= ROUNDS; round += 1) {
            db.setInstanceAutopilot(`supervisor-${round}`, {
              enabled: true,
              prompt: "Escalate every turn to the operator.",
              updatedAt: Date.now(),
            });
          }
          const sql = new Database(join(scratch, "hub.db"));
          sql
            .query("UPDATE instances SET status = 'running', spawned_at = ?")
            .run(SPAWNED_AT);
          sql.close();
        }),
        DbLayer.pipe(Layer.provideMerge(HubLifetimeLayer))
      )
    )
  );
};

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

const delay = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms);
  });

/** The hub is gone: what ended the wait, and what the probe was doing then. */
class HubDied extends Error {}

const run = async (root: string) => {
  const scratch = await mkdtemp(join(tmpdir(), "side-channel-"));
  await mkdir(join(scratch, "home", ".config"), { recursive: true });

  // ── Telegram: every request read, then its connection reset ─────────────
  interface Hit {
    answered: boolean;
    body: string;
    method: string;
  }
  const hits: Hit[] = [];
  let resets = 0;
  /** Settle rounds need the ask's message to land, so its edit can fail. */
  let answerAsks = false;
  let nextMessageId = 1;
  const telegram = Bun.listen<{ buffer: string }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.data = { buffer: "" };
      },
      data(socket, chunk) {
        socket.data.buffer += chunk.toString("latin1");
        const end = socket.data.buffer.indexOf("\r\n\r\n");
        if (end < 0) {
          return;
        }
        const head = socket.data.buffer.slice(0, end);
        const length = Number(CONTENT_LENGTH_RE.exec(head)?.[1] ?? 0);
        const raw = socket.data.buffer.slice(end + 4);
        if (raw.length < length) {
          return;
        }
        const body = Buffer.from(raw, "latin1").toString("utf8");
        const method = BOT_METHOD_RE.exec(head)?.[1] ?? "file";
        const answered =
          answerAsks && method === "sendMessage" && body.includes("❓");
        hits.push({ method, body, answered });
        if (answered) {
          const result = JSON.stringify({
            ok: true,
            result: {
              message_id: nextMessageId,
              chat: { id: CHAT_ID },
              date: 0,
            },
          });
          nextMessageId += 1;
          socket.write(
            `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(result)}\r\nconnection: close\r\n\r\n${result}`
          );
          socket.end();
          return;
        }
        resets += 1;
        socket.terminate();
      },
    },
  });

  // ── The supervisor's model: every turn is escalated ─────────────────────
  const llm = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      if (new URL(request.url).pathname.endsWith("/chat/completions")) {
        return Response.json({
          id: "probe",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "probe-model",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  verdict: "escalate",
                  message: "probe escalation",
                  note: "probe",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      return Response.json({ data: [{ id: "probe-model" }] });
    },
  });

  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: join(scratch, "home"),
    XDG_CONFIG_HOME: join(scratch, "home", ".config"),
    XDG_DATA_HOME: join(scratch, "home", ".local", "share"),
    CAWCO_DB_PATH: join(scratch, "hub.db"),
    CAWCO_NO_MDNS: "1",
  };

  const seeded = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      "seed",
      root,
      scratch,
      `http://127.0.0.1:${llm.port}`,
    ],
    { cwd: root, env, stdout: "inherit", stderr: "inherit" }
  );
  if ((await seeded.exited) !== 0) {
    throw new Error("seeding the scratch database failed");
  }

  // ── The hub, booted the way its service runs it ──────────────────────────
  const port = await freePort();
  const previewPort = await freePort();
  const hub = Bun.spawn(
    [process.execPath, join(root, "packages/hub/src/index.ts")],
    {
      cwd: root,
      env: {
        ...env,
        CAWCO_HUB_PORT: String(port),
        CAWCO_PREVIEW_PORT: String(previewPort),
        CAWCO_TELEGRAM_TOKEN: TOKEN,
        CAWCO_TELEGRAM_API: `http://127.0.0.1:${telegram.port}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  let log = "";
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      log += decoder.decode(chunk, { stream: true });
    }
  };
  const collected = Promise.all([collect(hub.stdout), collect(hub.stderr)]);
  let exitCode: number | null = null;
  const exited = hub.exited.then((code) => {
    exitCode = code;
    return code;
  });

  const base = `http://127.0.0.1:${port}`;
  /** Waits for `ready`, failing the moment the hub exits. */
  const until = async (
    label: string,
    ready: () => boolean | Promise<boolean>
  ) => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (exitCode !== null) {
        throw new HubDied(label);
      }
      // biome-ignore lint/performance/noAwaitInLoops: each look follows the hub's previous state
      if (await ready()) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${label}`);
      }
      await delay(50);
    }
  };
  const answers = () =>
    fetch(`${base}/health`)
      .then((response) => response.ok)
      .catch(() => false);

  let stage = "boot";
  let failure: string | undefined;
  let agent: WebSocket | undefined;
  try {
    await until("the hub to listen", answers);

    // ── A machine, as its daemon registers ────────────────────────────────
    stage = "register";
    agent = new WebSocket(`${base.replace("http", "ws")}/ws`);
    await new Promise<void>((done, fail) => {
      if (!agent) {
        return;
      }
      agent.onopen = () => done();
      agent.onerror = () => fail(new Error("agent socket refused"));
    });
    const socket = agent;
    const frame = (instanceId: string, payload: object, requestId?: string) =>
      socket.send(
        JSON.stringify({
          verb: "frames",
          machineId: MACHINE,
          instanceId,
          ...(requestId ? { requestId } : {}),
          payload: { instanceId, ...payload },
        })
      );
    socket.send(
      JSON.stringify({
        verb: "register",
        machineId: MACHINE,
        payload: {
          hostname: MACHINE,
          os: "linux",
          instances: instanceIds,
          custody: { state: "available", instances: instanceIds },
        },
      })
    );
    await until("the machine to come online", async () => {
      const agents = (await fetch(`${base}/api/agents`).then((response) =>
        response.json()
      )) as { machineId: string; status: string }[];
      return agents.some(
        (entry) => entry.machineId === MACHINE && entry.status === "online"
      );
    });

    const { Database } = await import("bun:sqlite");
    /** The launch an ask must name: the row's id and spawn time, as the hub stamps it. */
    const generation = (id: string) => {
      const sql = new Database(join(scratch, "hub.db"), { readonly: true });
      const row = sql
        .query("SELECT spawned_at AS spawnedAt FROM instances WHERE id = ?")
        .get(id) as { spawnedAt: number | null } | null;
      sql.close();
      return JSON.stringify([
        id,
        typeof row?.spawnedAt === "number" ? new Date(row.spawnedAt) : null,
      ]);
    };
    const count = (method: string, mark?: string, answered = false) =>
      hits.filter(
        (hit) =>
          hit.method === method &&
          hit.answered === answered &&
          (mark === undefined || hit.body.includes(mark))
      ).length;
    const ask = (id: string) =>
      frame(
        id,
        {
          kind: "permission_request",
          harness: "claude",
          requestId: `probe-${id}`,
          toolName: "Bash",
          input: { command: `echo ${id}` },
          processGeneration: generation(id),
        },
        `probe-${id}`
      );

    /** A session's process died on its own, as its daemon reports it. */
    const died = (id: string, message: string) =>
      frame(id, {
        kind: "error",
        verb: "spawn",
        processGeneration: generation(id),
        message,
      });

    const drive: Record<Path, (round: number) => Promise<void>> = {
      ask: async (round) => {
        ask(`ask-${round}`);
        await until(
          `ask ${round} to reach Telegram`,
          () => count("sendMessage", "❓") >= round
        );
      },
      settle: async (round) => {
        answerAsks = true;
        ask(`settle-${round}`);
        await until(
          `settle ${round}'s ask to be tracked`,
          () => count("sendMessage", "❓", true) >= round
        );
        answerAsks = false;
        died(`settle-${round}`, "probe process ended");
        await until(
          `settle ${round} to reach Telegram`,
          () => count("editMessageText") >= round
        );
      },
      error: async (round) => {
        died(`error-${round}`, "probe failure");
        await until(
          `error ${round} to reach Telegram`,
          () => count("sendMessage", "probe failure") >= round
        );
      },
      supervisor: async (round) => {
        frame(`supervisor-${round}`, {
          kind: "frame",
          message: {
            type: "result",
            subtype: "success",
            is_error: false,
            uuid: crypto.randomUUID(),
            session_id: `conversation-supervisor-${round}`,
            result: "probe turn done",
          },
        });
        await until(
          `supervisor ${round} to reach Telegram`,
          () => count("sendMessage", "probe escalation") >= round
        );
      },
      message: async (round) => {
        frame(`message-${round}`, {
          kind: "user_message",
          text: `probe message ${round}`,
        });
        await until(
          `message ${round} to reach Telegram`,
          () => count("sendMessage", "probe message") >= round
        );
      },
    };
    for (const path of PATHS) {
      for (let round = 1; round <= ROUNDS; round += 1) {
        stage = `${path} ${round}`;
        // biome-ignore lint/performance/noAwaitInLoops: one failure at a time, so a crash names the path that caused it
        await drive[path](round);
      }
    }
    // The last failures' rejections land after their requests did.
    stage = "settling";
    await delay(1000);
    if (exitCode !== null) {
      throw new HubDied("the last rejections");
    }
    if (!(await answers())) {
      failure = "the hub process is alive but does not answer /health";
    }
  } catch (error) {
    failure =
      error instanceof HubDied
        ? `the hub exited with code ${exitCode} during ${stage}`
        : `${stage}: ${error instanceof Error ? error.message : String(error)}`;
  }

  agent?.close();
  if (exitCode === null) {
    hub.kill("SIGTERM");
  }
  await Promise.race([exited, delay(5000)]);
  if (exitCode === null) {
    hub.kill("SIGKILL");
    await exited;
  }
  await collected;
  telegram.stop(true);
  await llm.stop(true);

  const leaked = log.split("\n").filter((line) => line.includes(TOKEN));
  /** Requests that were reset, by the path that made them. */
  const reset = (method: string, mark: string) =>
    hits.filter(
      (hit) => !hit.answered && hit.method === method && hit.body.includes(mark)
    ).length;
  const reached = PATHS.map(
    (path) =>
      `${path} ${
        {
          ask: reset("sendMessage", "echo ask-"),
          settle: reset("editMessageText", "echo settle-"),
          error: reset("sendMessage", "probe failure"),
          supervisor: reset("sendMessage", "probe escalation"),
          message: reset("sendMessage", "probe message"),
        }[path]
      }`
  ).join(", ");
  const polls = hits.filter((hit) => hit.method === "getUpdates").length;
  console.log(`telegram requests by path: ${reached}; getUpdates ${polls}`);
  await rm(scratch, { recursive: true, force: true });

  if (failure || leaked.length > 0) {
    console.log(
      `side-channel probe FAILED: ${failure ?? `the hub survived ${resets} resets`}; token ${
        leaked.length > 0
          ? `in the log on ${leaked.length} line(s), first: ${leaked[0].trim().slice(0, 200)}`
          : "absent from log"
      }`
    );
    const tail = log.trim().split("\n").slice(-12).join("\n");
    console.log(`hub log, last lines:\n${tail}`);
    process.exit(1);
  }
  console.log(
    `side-channel probe: hub alive after ${resets} resets; token absent from log`
  );
};

if (role === "seed" && rootArg && scratchArg && llmUrl) {
  await seed(rootArg, scratchArg, llmUrl);
} else {
  await run(resolve(role ?? join(import.meta.dir, "..")));
}
