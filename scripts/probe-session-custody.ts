/** Five real private-stack custody proofs. Children only sleep; no credentials or model turns. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

const root = resolvePath(import.meta.dir, "..");
const [, , role] = process.argv;
const CALLBACK_SOURCE = /packages\/agent\/src\/mcp-oauth\.ts$/;

if (role === "agent") {
  // A private agent needs its own callback listener, not the machine agent's fixed port.
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
  const { runDaemon } = await import("../packages/agent/src/daemon");
  runDaemon("unauthenticated");
} else if (role === "seed") {
  const { Effect } = await import(
    createRequire(join(root, "packages/hub/package.json")).resolve("effect")
  );
  const { Db, DbLayer } = await import("../packages/hub/src/db");
  const rows = JSON.parse(process.argv[3]) as { id: string; status: string }[];
  await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const db = yield* Db;
        db.upsertAgent({
          machineId: "custody-proof",
          hostname: "custody-proof",
          os: "private",
          auth: "unauthenticated",
        });
        for (const row of rows) {
          db.openInstance({
            id: row.id,
            machineId: "custody-proof",
            cwd: root,
            harness: "claude",
            kind: "mainline",
            permissionMode: null,
          });
        }
      }),
      DbLayer
    )
  );
  const { Database } = await import("bun:sqlite");
  const db = new Database(process.env.CAWCO_DB_PATH);
  for (const row of rows) {
    db.query("UPDATE instances SET status = ? WHERE id = ?").run(
      row.status,
      row.id
    );
  }
  db.close();
  process.exit(0);
} else if (!role) {
  const scratch = await mkdtemp(join(tmpdir(), "cawco-custody-proof-"));
  const home = join(scratch, "home");
  const endpoint = join(scratch, "sessiond.sock");
  await mkdir(join(home, ".config", "cawco"), { recursive: true });
  const portLease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("lease"),
  });
  const { port } = portLease;
  await portLease.stop(true);
  const base = `http://127.0.0.1:${port}`;
  await Bun.write(
    join(home, ".config", "cawco", "config.json"),
    JSON.stringify({ hubUrl: base, updatedAt: new Date().toISOString() })
  );
  // Whitelist only non-secret settings. Never inherit the owner's environment or stores.
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    CAWCO_MACHINE_ID: "custody-proof",
    CAWCO_SESSIOND_ENDPOINT: endpoint,
    CAWCO_HUB_URL: `${base}/ws`,
    CAWCO_HUB_PORT: String(port),
    CAWCO_PREVIEW_PORT: "0",
    CAWCO_NO_MDNS: "1",
    HOST: "127.0.0.1",
  };
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  let dbPath = join(scratch, "first.db");
  const launch = (name: string, args: string[]) => {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: root,
      env: { ...env, CAWCO_DB_PATH: dbPath },
      stdout: Bun.file(join(scratch, `${name}.log`)),
      stderr: Bun.file(join(scratch, `${name}.err`)),
    });
    children.add(child);
    return child;
  };
  const stop = async (child: ReturnType<typeof Bun.spawn>) => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        child.exited,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
    await child.exited;
  };
  const wait = async <T>(
    label: string,
    read: () => Promise<T>,
    accepts: (value: T) => boolean
  ): Promise<T> => {
    const limit = Date.now() + 45_000;
    let value: T | undefined;
    while (Date.now() < limit) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: bounded polling observes this private stack's asynchronous state
        value = await read();
        if (accepts(value)) {
          return value;
        }
      } catch {
        /* the private service is still booting */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${label} timed out: ${JSON.stringify(value)}`);
  };
  const seed = async (rows: { id: string; status: string }[]) => {
    const child = launch("seed", [
      import.meta.path,
      "seed",
      JSON.stringify(rows),
    ]);
    if (await child.exited) {
      throw new Error(await Bun.file(join(scratch, "seed.err")).text());
    }
  };
  const api = async (path: string) => {
    const response = await fetch(`${base}${path}`);
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${await response.text()}`);
    }
    return response.json();
  };
  const report = () =>
    api("/api/agents").then((rows) =>
      rows.find(
        (row: { machineId: string }) => row.machineId === "custody-proof"
      )
    );
  const ready = () =>
    wait(
      "custody report",
      report,
      (row) => row?.status === "online" && Array.isArray(row.unownedProcesses)
    );
  let holder:
    | import("../packages/agent/src/sessiond-client").SessiondClient
    | undefined;
  let hub: ReturnType<typeof Bun.spawn> | undefined;
  let agent: ReturnType<typeof Bun.spawn> | undefined;
  try {
    launch("sessiond", [join(root, "packages/sessiond/src/main.ts")]);
    const { SessiondClient } = await import(
      "../packages/agent/src/sessiond-client"
    );
    holder = await wait(
      "private sessiond",
      () => SessiondClient.connect(endpoint, 250),
      () => true
    );
    const client = holder;
    const spawn = async (id: string) => {
      await client.spawnProc(id, {
        command: "/bin/sleep",
        args: ["600"],
        cwd: root,
        env,
      });
      const proc = (await client.list()).procs.find(
        (one) => one.procId === id && one.alive
      );
      if (!proc) {
        throw new Error(`No sleeping child ${id}`);
      }
      return proc.pid;
    };
    const alive = async () =>
      (await client.list()).procs.filter((proc) => proc.alive);
    const ids = ["custody-a", "custody-b"];
    const pids = await Promise.all(ids.map(spawn));
    await seed(ids.map((id) => ({ id, status: "sleeping" })));
    hub = launch("hub", [join(root, "packages/hub/src/index.ts")]);
    await wait(
      "hub health",
      () => api("/health"),
      () => true
    );
    agent = launch("agent", [import.meta.path, "agent"]);
    await ready();
    await stop(agent);
    agent = launch("agent-restarted", [import.meta.path, "agent"]);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await stop(hub);
    hub = launch("hub-restarted", [join(root, "packages/hub/src/index.ts")]);
    const first = await ready();
    const attachedRows = await wait(
      "all held children attached",
      () => api("/api/instances"),
      (rows) =>
        ids.every((id) =>
          rows.some(
            (row: { id: string; status: string }) =>
              row.id === id && row.status === "running"
          )
        )
    );
    const held = await alive();
    if (
      first.unownedProcesses.length ||
      !pids.every((pid) => held.some((proc) => proc.pid === pid))
    ) {
      throw new Error("Restart cut custody or hid a held child");
    }
    console.log(
      `PASS 1 agent restart, hub 5 seconds later: attached=${attachedRows.filter((row: { id: string }) => ids.includes(row.id)).length}, stopped=0, unowned=0, same PIDs=${pids.join(",")}`
    );

    await stop(hub);
    dbPath = join(scratch, "empty.db");
    hub = launch("hub-empty", [join(root, "packages/hub/src/index.ts")]);
    const empty = await wait(
      "every child listed on empty hub",
      report,
      (row) => row?.unownedProcesses?.length === ids.length
    );
    if (
      !(
        (await alive()).some((proc) => proc.pid === pids[0]) &&
        (await alive()).some((proc) => proc.pid === pids[1])
      )
    ) {
      throw new Error("Empty hub stopped a child");
    }
    console.log(
      `PASS 2 empty database: stopped=0, listed=${empty.unownedProcesses.length}, details=${JSON.stringify(empty.unownedProcesses)}`
    );

    const stoppedPid = await spawn("custody-stopped");
    await seed([{ id: "custody-stopped", status: "stopped" }]);
    await stop(agent);
    agent = launch("agent-stopped-row", [import.meta.path, "agent"]);
    await wait(
      "stopped row ends held process",
      alive,
      (procs) => !procs.some((proc) => proc.pid === stoppedPid)
    );
    await ready();
    console.log(
      `PASS 3 stopped row: held PID=${stoppedPid} ended on register, row=${JSON.stringify((await api("/api/instances")).find((row: { id: string }) => row.id === "custody-stopped")?.status)}`
    );

    const dashboard = new WebSocket(
      `${base.replace("http", "ws")}/ws/dashboard`
    );
    await new Promise<void>((resolve, reject) => {
      dashboard.onopen = () => resolve();
      dashboard.onerror = () =>
        reject(new Error("Private dashboard socket failed"));
    });
    const frames: unknown[] = [];
    dashboard.onmessage = (event) =>
      frames.push(JSON.parse(String(event.data)));
    dashboard.send(
      JSON.stringify({
        verb: "stop",
        machineId: "custody-proof",
        instanceId: "custody-b",
        payload: { instanceId: "custody-b", requestId: "proof-stop" },
      })
    );
    await wait(
      "held uncarried stop",
      alive,
      (procs) => !procs.some((proc) => proc.pid === pids[1])
    );
    dashboard.close();
    console.log(
      `PASS 4 held uncarried process: PID=${pids[1]} ended after explicit stop, carried=0`
    );

    await seed([{ id: "custody-a", status: "sleeping" }]);
    const deleted = await fetch(`${base}/api/instances/custody-a`, {
      method: "DELETE",
    });
    const body = await deleted.text();
    if (!deleted.ok) {
      throw new Error(`DELETE sleeping row: ${deleted.status} ${body}`);
    }
    await wait(
      "delete ends held process",
      alive,
      (procs) => !procs.some((proc) => proc.pid === pids[0])
    );
    console.log(
      `PASS 5 delete sleeping row: HTTP=${deleted.status}, body=${body}, held PID=${pids[0]} ended`
    );
  } catch (error) {
    for (const name of [
      "agent",
      "agent-restarted",
      "agent-stopped-row",
      "hub",
      "hub-restarted",
      "hub-empty",
    ]) {
      for (const extension of ["log", "err"]) {
        const file = Bun.file(join(scratch, `${name}.${extension}`));
        // biome-ignore lint/performance/noAwaitInLoops: deterministic failure diagnostics from only the private stack
        if (await file.exists()) {
          console.error(`${name}.${extension}:\n${await file.text()}`);
        }
      }
    }
    throw error;
  } finally {
    // Only our processes, by their own handles/PIDs; sessiond drains our sleeping children.
    if (agent) {
      await stop(agent);
    }
    if (hub) {
      await stop(hub);
    }
    holder?.close();
    await Promise.all([...children].map(stop));
    await rm(scratch, { recursive: true, force: true });
    console.log("Private stack stopped; scratch state removed.");
  }
}
