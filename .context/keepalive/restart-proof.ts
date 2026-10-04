import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const root = new URL("./private-stack/", import.meta.url);
await mkdir(root, { recursive: true });
const child = Bun.fileURLToPath(new URL("./private-hub.ts", import.meta.url));
const evidence: unknown[] = [];

export async function stack(name: string, due: number, busy = false) {
  const id = `keepalive-${name}-${crypto.randomUUID()}`;
  const db = Bun.fileURLToPath(new URL(`${id}.db`, root));
  const sends: { at: number; uuid: string }[] = [];
  let process: ReturnType<typeof Bun.spawn> | undefined;
  let socket: WebSocket | undefined;
  let url = "";
  let running = busy;
  const sent = Promise.withResolvers<{ at: number; uuid: string }>();
  let registrationAt = 0;
  const logs: string[] = [];
  const send = (payload: unknown, requestId?: string) => socket?.send(JSON.stringify({ verb: "frames", machineId: "keepalive-standin", instanceId: id, requestId, payload }));
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, body === undefined ? {} : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text);
  };
  const connect = async () => {
    const registered = Promise.withResolvers<void>();
    const deadline = setTimeout(() => registered.reject(new Error(`Private register timeout ${url}: ${logs.join("\n")}`)), 5000);
    socket = new WebSocket(url.replace("http:", "ws:") + "/ws");
    socket.addEventListener("open", () => {
      logs.push(`STANDIN_OPEN ${url}`);
      registrationAt = Date.now();
      socket?.send(JSON.stringify({ verb: "register", machineId: "keepalive-standin", payload: { hostname: "keepalive-standin", os: "linux", auth: "authenticated", instances: [id], resumable: [`${id}-conversation`], custody: { state: "available", instances: [id], opencode: false } } }));
    });
    socket.addEventListener("message", (event) => {
      logs.push(`STANDIN_FRAME ${String(event.data).slice(0,160)}`);
      const envelope = JSON.parse(String(event.data));
      if (envelope.verb === "register") {
        registered.resolve();
      } else if (envelope.verb === "control") {
        const { requestId, method } = envelope.payload;
        const result = method === "agentBusy" ? { ready: true, recovery: "ready", busy: Number(running), instances: running ? [id] : [] } : method === "getSessionMessages" || method === "listSessions" ? [] : undefined;
        send({ kind: "control_result", requestId, ok: true, result }, requestId);
      } else if (envelope.verb === "send") {
        const record = { at: Date.now(), uuid: envelope.payload.message.uuid };
        send({ kind: "frame", instanceId: id, harness: "claude", message: { type: "system", subtype: "read", read: [record.uuid] } });
        sends.push(record);
        sent.resolve(record);
      }
    });
    socket.addEventListener("error", (event) => registered.reject(new Error(`Private socket error ${url}: ${String((event as ErrorEvent).message)}; ${logs.join("\n")}`)));
    try { await registered.promise; } finally { clearTimeout(deadline); }
  };
  const start = async () => {
    process = Bun.spawn([processExec(), child, db, id, String(due - 240_000)], {
      cwd: Bun.fileURLToPath(new URL("../../", import.meta.url)),
      env: { PATH: globalThis.process.env.PATH },
      stdout: "pipe", stderr: "pipe",
    });
    const ready = Promise.withResolvers<number>();
    const reader = async (stream: ReadableStream<Uint8Array>, stdout: boolean) => {
      let partial = "";
      for await (const bytes of stream) {
        partial += new TextDecoder().decode(bytes);
        const lines = partial.split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) {
          logs.push(line);
          if (stdout && line.startsWith("PRIVATE_READY ")) ready.resolve(Number(line.slice(14)));
        }
      }
    };
    void reader(process.stdout, true);
    void reader(process.stderr, false);
    const exit = process.exited.then((code) => { throw new Error(`private hub exited ${code}: ${logs.join("\n")}`); });
    exit.catch(() => undefined);
    const port = await Promise.race([ready.promise, exit]);
    url = `http://127.0.0.1:${port}`;
    await request("/health");
    await connect();
  };
  const stop = async () => {
    socket?.close();
    if (process) {
      process.kill("SIGTERM");
      await process.exited;
      process = undefined;
    }
  };
  return {
    id, sends, logs, start, stop, request,
    emit: (payload: unknown) => send(payload),
    row: async () => (await request("/api/instances")).find((row: { id: string }) => row.id === id),
    arm: () => request(`/api/instances/${id}`, { keepAlive: true }),
    connect,
    disconnect: () => socket?.close(),
    registrationAt: () => registrationAt,
    endTurn: () => {
      running = false;
      send({ kind: "frame", instanceId: id, harness: "claude", message: { type: "result", uuid: crypto.randomUUID(), is_error: false, subtype: "success", result: "stand-in turn ended" } });
    },
    waitSend: async () => {
      const timeout = setTimeout(() => sent.reject(new Error(`No private ping for ${name}: ${logs.join("\n")}`)), 12_000);
      try { return await sent.promise; } finally { clearTimeout(timeout); }
    },
  };
}
const processExec = () => globalThis.process.execPath;
const until = (at: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, at - Date.now())));

async function prove(name: string, run: (s: Awaited<ReturnType<typeof stack>>, due: number) => Promise<void>, remaining = 8_000, busy = false) {
  const due = Date.now() + remaining;
  const s = await stack(name, due, busy);
  try {
    await s.start();
    await s.arm();
    await run(s, due);
    evidence.push({ name, due, sends: s.sends, logs: s.logs });
    console.log(`PASS ${name}`);
  } finally {
    await s.stop();
  }
}

if (import.meta.main) {
await prove("hub restart inside window preserves original deadline", async (s, due) => {
  await s.stop();
  await s.start();
  assert.equal((await s.row()).keepAlive.nextAt, due);
  const ping = await s.waitSend();
  assert.ok(ping.at >= due && ping.at - due < 1_000, JSON.stringify({ due, ping }));
  assert.equal(s.sends.length, 1);
});
await prove("hub returns overdue but warm and pings immediately", async (s, due) => {
  await s.stop();
  await until(due + 250);
  await s.start();
  const ping = await s.waitSend();
  assert.ok(ping.at - s.registrationAt() < 1_000);
  assert.equal(s.sends.length, 1);
}, 3_000);
await prove("hub returns past TTL and stays cold without ping", async (s, due) => {
  await s.stop();
  await until(due + 60_250);
  await s.start();
  assert.equal((await s.row()).keepAlive.state, "cold");
  await until(Date.now() + 1_000);
  assert.equal(s.sends.length, 0);
}, -56_000, true);
await prove("busy due time waits for turn end without firing into it", async (s, due) => {
  await until(due + 250);
  assert.equal(s.sends.length, 0);
  assert.equal((await s.row()).keepAlive.state, "waiting");
  const endedAt = Date.now();
  s.endTurn();
  const ping = await s.waitSend();
  assert.ok(ping.at >= endedAt && ping.at - endedAt < 1_000);
  assert.equal(s.sends.length, 1);
}, 3_000, true);
await prove("agent reconnect after hub restart fires with no pulse replay", async (s, due) => {
  s.disconnect();
  await s.stop();
  await until(due + 250);
  await s.start();
  const ping = await s.waitSend();
  assert.ok(ping.at - s.registrationAt() < 1_000);
  assert.equal(s.sends.length, 1);
}, 3_000);
await Bun.write(new URL("./private-proof.json", import.meta.url), JSON.stringify(evidence, null, 2));
}
