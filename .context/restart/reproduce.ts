/** Private restart reproduction. No owner environment, credentials or real harnesses. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const role = process.argv[2];
const key = "ses_restart_proof";
const id = "restart-proof";
const cwd = process.env.PROOF_CWD ?? root;
const fixed = process.argv.includes("--fixed");
const baseline = process.argv.includes("--baseline");

if (role && baseline) {
  Bun.plugin({ name: "pinned-before-fix", setup(build) {
    build.onLoad({ filter: /packages\/(?:agent\/src\/(?:harness\.ts|session\.ts|harnesses\/opencode\.ts)|hub\/src\/db\/index\.ts)$/ }, async ({ path }) => {
      const git = Bun.spawn(["git", "show", `8c4f810b:${path.slice(root.length + 1)}`], { cwd: root, stdout: "pipe", stderr: "pipe" });
      const contents = await new Response(git.stdout).text();
      if (await git.exited) { throw new Error("Pinned baseline source unavailable"); }
      return { contents, loader: "ts" };
    });
  } });
}

if (role === "hub") {
  const { startHub } = await import("../../packages/hub/src/index");
  await startHub();
} else if (role === "stub") {
  let busy = true;
  let omit = false;
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const session = { id: key, directory: cwd, title: "Private proof", time: { created: Date.now(), updated: Date.now() } };
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/proof/omit") { omit = true; return Response.json(true); }
      if (url.pathname === "/session/status") { return Response.json(busy ? { [key]: { type: "busy" } } : {}); }
      if (url.pathname === `/session/${key}/abort`) {
        busy = false;
        for (const stream of streams) { stream.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "session.idle", properties: { sessionID: key } })}\n\n`)); }
        return Response.json(true);
      }
      if (url.pathname === `/session/${key}`) { return Response.json(session); }
      if (url.pathname === `/session/${key}/message`) { return Response.json([{ info: { id: "msg_preserved", role: "user", sessionID: key, time: { created: 1 } }, parts: [{ id: "prt_preserved", type: "text", sessionID: key, messageID: "msg_preserved", text: "Preserve this conversation." }] }]); }
      if (url.pathname === "/session") {
        return omit ? (process.env.PROOF_CATALOG_EMPTY === "1" ? Response.json([]) : Response.json({ message: "Injected catalog read failure" }, { status: 503 })) : Response.json([session]);
      }
      if (url.pathname === "/experimental/session") { return Response.json([session]); }
      if (url.pathname === "/project") { return Response.json([{ id: "proof", worktree: cwd, time: { created: 1, updated: 1 } }]); }
      if (url.pathname === "/path") { return Response.json({ config: join(process.env.XDG_CONFIG_HOME ?? "", "opencode") }); }
      if (url.pathname === "/global/health") { return Response.json({ healthy: true, version: "proof" }); }
      if (["/permission", "/question", "/command"].includes(url.pathname)) { return Response.json([]); }
      if (url.pathname === "/mcp") { return Response.json({}); }
      if (url.pathname === "/config") {
        const directory = join(process.env.XDG_CONFIG_HOME ?? "", "opencode");
        const { readdir } = await import("node:fs/promises");
        const plugins = (await readdir(join(directory, "plugins")).catch(() => [])).filter((name) => name.endsWith(".js")).map((name) => `file://${join(directory, "plugins", name)}`);
        const stored = await Bun.file(join(directory, "opencode.json")).json();
        return Response.json({ ...stored, plugin: plugins, permission: { bash: "ask", edit: "ask", skill: { "wf-*": "deny" }, webfetch: "deny" }, tools: { websearch: false } });
      }
      if (url.pathname === "/event") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) { streams.add(controller); controller.enqueue(encoder.encode('data: {"type":"server.connected","properties":{}}\n\n')); },
          cancel(controller) { streams.delete(controller); },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      if (url.pathname === "/instance/dispose") { return Response.json(true); }
      return Response.json({ path: url.pathname }, { status: 404 });
    },
  });
  console.log(`opencode server listening on ${server.url.origin}`);
} else if (role === "agent") {
  Bun.plugin({ name: "private-callback", setup(build) {
    build.onLoad({ filter: /packages\/agent\/src\/mcp-oauth\.ts$/ }, async ({ path }) => ({ contents: (await Bun.file(path).text()).replace("port: CAWCO_MCP_CALLBACK_PORT,", "port: 0,"), loader: "ts" }));
  } });
  const { registerHarness } = await import("../../packages/agent/src/harnesses");
  for (const kind of ["claude", "pi"] as const) {
    registerHarness({ kind, capabilities: {}, auth: "unauthenticated", detect: async () => ({ harness: kind, installed: false, auth: "unauthenticated", capabilities: {} }), listSessions: async () => [], getSessionInfo: async () => undefined, getSessionMessages: async () => [], spawn: async () => { throw new Error("Real harnesses forbidden in this proof"); }, dispose: async () => undefined } as unknown as import("../../packages/agent/src/harness").Harness);
  }
  const { runDaemon } = await import("../../packages/agent/src/daemon");
  runDaemon("unauthenticated");
} else if (role === "seed") {
  const { Effect } = await import(createRequire(join(root, "packages/hub/package.json")).resolve("effect"));
  const { Db, DbLayer } = await import("../../packages/hub/src/db");
  await Effect.runPromise(Effect.provide(Effect.gen(function* () {
    const db = yield* Db;
    db.upsertAgent({ machineId: "restart-private", hostname: "restart-private", os: "private", auth: "unauthenticated" });
    db.openInstance({ id, machineId: "restart-private", cwd, harness: "opencode", model: "proof/stub", permissionMode: "bypassPermissions", sessionId: key, kind: "mainline" });
    db.markInstanceLive(id);
  }), DbLayer));
  process.exit(0);
} else {
  const scratch = await mkdtemp(join(root, ".restart-proof-"));
  const home = join(scratch, "home");
  const bin = join(scratch, "bin");
  const endpoint = join(scratch, "sessiond.sock");
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("lease") });
  const port = reservation.port;
  reservation.stop(true);
  const base = `http://127.0.0.1:${port}`;
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_CACHE_HOME: join(home, ".cache"), CAWCO_MACHINE_ID: "restart-private", CAWCO_SESSIOND_ENDPOINT: endpoint, CAWCO_HUB_URL: `${base.replace("http", "ws")}/ws`, CAWCO_HUB_PORT: String(port), CAWCO_PREVIEW_PORT: "0", CAWCO_NO_MDNS: "1", HOST: "127.0.0.1", CAWCO_DB_PATH: join(scratch, "hub.db"), PROOF_CWD: scratch, PROOF_CATALOG_EMPTY: process.argv.includes("--catalog-empty") ? "1" : "0" };
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  const launch = (name: string, args: string[]) => {
    const child = Bun.spawn([process.execPath, ...args, ...(baseline ? ["--baseline"] : [])], { cwd: root, env, stdout: Bun.file(join(scratch, `${name}.log`)), stderr: Bun.file(join(scratch, `${name}.err`)) });
    children.add(child); return child;
  };
  const stop = async (child: ReturnType<typeof Bun.spawn>) => { if (child.exitCode === null) { child.kill("SIGKILL"); } await child.exited; };
  const wait = async <T>(label: string, read: () => Promise<T>, accepts: (value: T) => boolean): Promise<T> => {
    const until = Date.now() + 35000;
    while (Date.now() < until) {
      try { const value = await read(); if (accepts(value)) { return value; } } catch { /* only private startup */ }
      await Bun.sleep(100);
    }
    throw new Error(`${label} did not settle`);
  };
  let holder: import("../../packages/agent/src/sessiond-client").SessiondClient | undefined;
  let hub: ReturnType<typeof Bun.spawn> | undefined;
  let agent: ReturnType<typeof Bun.spawn> | undefined;
  try {
    await mkdir(join(home, ".config/cawco"), { recursive: true });
    await mkdir(join(home, ".cawco"), { recursive: true });
    await mkdir(bin, { recursive: true });
    await Bun.write(join(home, ".config/cawco/config.json"), JSON.stringify({ hubUrl: base }));
    await Bun.write(join(bin, "opencode"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo proof; exit 0; fi\nexit 99\n');
    const { chmod } = await import("node:fs/promises");
    await chmod(join(bin, "opencode"), 0o755);
    launch("sessiond", [join(root, "packages/sessiond/src/main.ts")]);
    const { SessiondClient } = await import("../../packages/agent/src/sessiond-client");
    holder = await wait("sessiond", () => SessiondClient.connect(endpoint, 250), () => true);
    const identities = [];
    for (const procId of ["opencode-server-proof-active", "opencode-server-proof-retired"]) {
      await holder.spawnProc(procId, { command: process.execPath, args: [import.meta.path, "stub"], cwd: scratch, env });
      const url = await new Promise<string>((resolve) => holder?.subscribe(procId, { line: (line) => { const announced = line.data.match(/listening on (.*)/)?.[1]; if (announced) { resolve(announced); } } }, 0));
      const welcome = await holder.list();
      const proc = welcome.procs.find((one) => one.procId === procId && one.alive);
      if (!proc) { throw new Error("Private generation missing"); }
      const stat = await Bun.file(`/proc/${proc.pid}/stat`).text();
      identities.push({ procId, pid: proc.pid, epoch: welcome.epoch, startedAt: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19], url });
    }
    const [active, retired] = identities;
    const record = join(home, ".cawco", `opencode-server-${createHash("sha256").update(endpoint).digest("hex").slice(0, 16)}.json`);
    await Bun.write(record, JSON.stringify({ active, retired: [retired] }));
    const seed = launch("seed", [import.meta.path, "seed"]);
    if (await seed.exited) { throw new Error(await Bun.file(join(scratch, "seed.err")).text()); }
    hub = launch("hub", [import.meta.path, "hub"]);
    await wait("hub", () => fetch(`${base}/health`), (response) => response.ok);
    agent = launch("agent", [import.meta.path, "agent"]);
    const agentLog = async () => `${await Bun.file(join(scratch, "agent.log")).text()}\n${await Bun.file(join(scratch, "agent.err")).text()}`;
    await wait("two-generation conflict", agentLog, (text) => text.includes("multiple generations"));
    const { Database } = await import("bun:sqlite");
    const db = new Database(env.CAWCO_DB_PATH);
    const row = () => db.query("SELECT status,last_error AS error,session_id AS sessionId FROM instances WHERE id = ?").get(id) as { status: string; error: string | null; sessionId: string };
    // A failed catalog read is injected while both actual runner processes live.
    await fetch(`${active.url}/proof/omit`, { method: "POST" });
    const live = launch("live-before-restart", [import.meta.path, "seed"]);
    if (await live.exited) { throw new Error("Could not file private live row"); }
    console.log(`BEFORE hub restart: ${JSON.stringify(row())}`);
    await Bun.sleep(2100);
    await stop(hub);
    hub = launch("hub-restarted", [import.meta.path, "hub"]);
    const recoveredRow = await wait("re-registration", async () => {
      const rows = await (await fetch(`${base}/api/agents`)).json();
      return rows.some((one: { machineId: string; status: string }) => one.machineId === "restart-private" && one.status === "online") ? row() : null;
    }, (value) => value !== null);
    await Bun.sleep(1200);
    const retries = (await agentLog()).split("\n").filter((line) => line.includes("multiple generations")).length;
    console.log(`AFTER hub restart: ${JSON.stringify(recoveredRow)}; conflict reports=${retries}; generations alive=${(await holder.list()).procs.filter((one) => one.alive).length}`);
    if (fixed && (await agentLog()).includes("waiting; retry")) { throw new Error("Confirmed conflict was retried"); }
    const busyReport = await (await fetch(`${base}/api/agents/restart-private/busy`)).json();
    console.log(`CUSTODY: ${JSON.stringify(busyReport)}`);
    if (fixed && (!busyReport.ready || busyReport.instances.includes("opencode:pending-operations"))) { throw new Error("Conflict left retirement permanently vetoed"); }
    if (fixed && recoveredRow?.status === "error") { throw new Error("Live conversation misclassified error"); }
    if (!fixed && recoveredRow?.error !== "The agent restarted, and this session left nothing to resume from.") { throw new Error("Baseline lost transition not reproduced"); }
    // Exactly the one-conversation operation proposed for owner recovery.
    const aborted = await (await fetch(`${retired.url}/session/${key}/abort?directory=${encodeURIComponent(scratch)}`, { method: "POST" })).json();
    if (aborted !== true) { throw new Error("Scoped abort refused"); }
    if (fixed) {
      await stop(agent);
      agent = launch("agent-recovered", [import.meta.path, "agent"]);
    }
    await wait("conversation recovered", async () => {
      const rows = await (await fetch(`${base}/api/instances`)).json();
      return rows.find((one: { id: string }) => one.id === id);
    }, (value) => value?.status === "running");
    console.log(`RECOVERY: retired scoped abort=true; ${JSON.stringify(row())}; active runner=${JSON.stringify(await (await fetch(`${active.url}/session/status`)).json())}`);
    for (const identity of identities) {
      const history = await (await fetch(`${identity.url}/session/${key}/message`)).json();
      if (history[0]?.parts[0]?.text !== "Preserve this conversation.") { throw new Error("Scoped abort changed conversation history"); }
    }
    console.log("HISTORY: original message preserved on both generations; conversation key unchanged.");
    await wait("retired generation exited", async () => (await holder!.list()).procs, (procs) => !procs.some((one) => one.procId === retired.procId && one.alive));
    console.log("RETIREMENT: older generation exited after its only runner went idle; active generation still alive.");
    db.close();
  } catch (error) {
    for (const name of ["agent", "hub", "hub-restarted", "agent-recovered"]) {
      for (const suffix of ["log", "err"]) {
        const file = Bun.file(join(scratch, `${name}.${suffix}`));
        if (await file.exists()) { console.error(`${name}.${suffix}\n${await file.text()}`); }
      }
    }
    throw error;
  } finally {
    if (agent) { await stop(agent); }
    if (hub) { await stop(hub); }
    if (holder) {
      for (const proc of (await holder.list()).procs.filter((one) => one.alive)) { await holder.signal(proc.procId, "SIGKILL"); }
      holder.close();
    }
    for (const child of children) { await stop(child); }
    await rm(scratch, { recursive: true, force: true });
    console.log("Private hub, agent, sessiond and stub generations ended by PID; scratch removed.");
  }
}
