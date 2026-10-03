/** Real isolated OpenCode/sessiond recovery probe; never targets fleet services. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessContext } from "../packages/agent/src/harness";
import type { ServerIdentity } from "../packages/agent/src/harnesses/opencode-server";
import type { SpawnPayload } from "../packages/core/src/index";

const root = resolve(import.meta.dir, "..");
const BASELINE_SOURCE =
  /packages\/agent\/src\/harnesses\/opencode(?:-activity|-server)?\.ts$/;
const baseline = process.argv.includes("--baseline");
const sandbox =
  process.env.CUSTODY_PROBE_SANDBOX ??
  (await mkdtemp(join(root, ".custody-probe-")));
const home = join(sandbox, "home");
const endpoint = join(sandbox, "sessiond.sock");
if (!process.env.CUSTODY_PROBE_SANDBOX) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CUSTODY_PROBE_SANDBOX: sandbox,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    CAWCO_SESSIOND_ENDPOINT: endpoint,
  };
  childEnv.INVOCATION_ID = undefined;
  childEnv.CAWCO_SERVICE_MODE = undefined;
  childEnv.XPC_SERVICE_NAME = undefined;
  const child = Bun.spawn(
    [process.execPath, import.meta.path, ...process.argv.slice(2)],
    { cwd: root, env: childEnv, stdout: "inherit", stderr: "inherit" }
  );
  const code = await child.exited;
  await rm(sandbox, { recursive: true, force: true });
  process.exit(code);
}
if (homedir() !== home) {
  throw new Error("Probe HOME isolation did not take effect.");
}
const binary = Bun.which("opencode");
if (!binary) {
  throw new Error("The real OpenCode binary is required.");
}
await mkdir(home, { recursive: true });
process.env.HOME = home;
process.env.XDG_CONFIG_HOME = join(home, ".config");
process.env.XDG_DATA_HOME = join(home, ".local", "share");
process.env.XDG_CACHE_HOME = join(home, ".cache");
process.env.CAWCO_SESSIOND_ENDPOINT = endpoint;
delete process.env.INVOCATION_ID;
delete process.env.CAWCO_SERVICE_MODE;
delete process.env.XPC_SERVICE_NAME;

const diagnostics = { stale: 0, unavailable: 0, timedOut: 0 };
const diagnosticGlobal = globalThis as typeof globalThis & {
  __custodyProbe?: { note: (kind: string, aborted?: boolean) => void };
};
diagnosticGlobal.__custodyProbe = {
  note: (kind, aborted) => {
    if (kind === "stale") {
      diagnostics.stale += 1;
    }
    if (kind === "unavailable") {
      diagnostics.unavailable += 1;
    }
    if (aborted) {
      diagnostics.timedOut += 1;
    }
  },
};

if (baseline) {
  Bun.plugin({
    name: "baseline-custody-diagnostics",
    setup(build) {
      build.onLoad(
        {
          filter: BASELINE_SOURCE,
        },
        async ({ path }) => {
          const relative = path.slice(root.length + 1);
          const proc = Bun.spawn(["git", "show", `e9d93055:${relative}`], {
            cwd: root,
            stdout: "pipe",
            stderr: "pipe",
          });
          let contents = await new Response(proc.stdout).text();
          if (await proc.exited) {
            throw new Error(`Cannot load baseline ${relative}.`);
          }
          if (relative.endsWith("opencode-activity.ts")) {
            const diagnostic =
              "(globalThis as typeof globalThis & { __custodyProbe?: { note: (kind: string, aborted?: boolean) => void } }).__custodyProbe";
            contents = contents.replace(
              'if (revision !== this.#revision) {\n      return "unknown";',
              `if (revision !== this.#revision) {\n      ${diagnostic}?.note("stale");\n      return "unknown";`
            );
            contents = contents.replace(
              'const state = data ? statusState(data[sessionId]) : "unknown";',
              `if (!data) ${diagnostic}?.note("unavailable", signal.aborted);\n    const state = data ? statusState(data[sessionId]) : "unknown";`
            );
          }
          return { contents, loader: "ts" };
        }
      );
    },
  });
}

const hub = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/delegation/tools") {
      return Response.json({ tools: [] });
    }
    if (url.pathname !== "/mcp/cawco") {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const rpc = (await request.json()) as { id?: number; method: string };
    if (rpc.id === undefined) {
      return new Response(null, { status: 202 });
    }
    let result: unknown = {};
    if (rpc.method === "initialize") {
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "custody-probe", version: "1" },
      };
    } else if (rpc.method === "tools/list") {
      result = { tools: [] };
    }
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  },
});
process.env.CAWCO_HUB_URL = `${hub.url.origin}/ws`;

const { IMAGE_GENERATION_TIMEOUT_MS } = await import(
  "../packages/core/src/index"
);
const { SessiondServer } = await import("../packages/sessiond/src/server");
const { SessiondClient } = await import(
  "../packages/agent/src/sessiond-client"
);
const { OpencodeHarness, attachOpencodeServer } = await import(
  "../packages/agent/src/harnesses/opencode"
);
const { createOpencodeClient } = await import(
  "../packages/agent/node_modules/@opencode-ai/sdk/dist/v2/index.js"
);
const sessiond = new SessiondServer();
await sessiond.listen(endpoint);
const holder = await SessiondClient.connect(endpoint);
const procId = "opencode-server-custody-probe";
const config = {
  plugin: [],
  mcp: {
    cawco: {
      type: "remote",
      url: `${hub.url.origin}/mcp/cawco`,
      timeout: IMAGE_GENERATION_TIMEOUT_MS + 60_000,
      enabled: true,
      oauth: false,
    },
  },
};
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
);
const attached = await attachOpencodeServer({
  sessiond: holder,
  procId,
  spec: {
    command: binary,
    args: ["serve", "--hostname=127.0.0.1", "--port=0"],
    cwd: sandbox,
    env: { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
  },
  signal: AbortSignal.timeout(30_000),
});
const raw = createOpencodeClient({ baseUrl: attached.url });
const seeds = new Map<string, string>();
const interleave = new Set<string>();
const requests = new Map<string, number>();
let armed = false;
let killOnStatus = false;
let failedGenerationReads = 0;
const killedRead = Promise.withResolvers<void>();
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/session/status" && killOnStatus) {
      killOnStatus = false;
      const exited = Promise.withResolvers<void>();
      holder.subscribe(procId, { exit: () => exited.resolve() });
      await holder.signal(procId, "SIGKILL");
      await exited.promise;
      failedGenerationReads += 1;
      killedRead.resolve();
      return Response.json(
        {
          message: "probe generation was killed while its status was requested",
        },
        { status: 503 }
      );
    }
    const target = new URL(`${url.pathname}${url.search}`, attached.url);
    let response: Response;
    try {
      response = await fetch(target, {
        method: request.method,
        headers: request.headers,
        ...(request.method === "GET" || request.method === "HEAD"
          ? {}
          : { body: await request.arrayBuffer() }),
        signal: request.signal,
      });
    } catch (error) {
      if (failedGenerationReads && url.pathname === "/session/status") {
        failedGenerationReads += 1;
        return Response.json({ message: String(error) }, { status: 503 });
      }
      throw error;
    }
    if (url.pathname === "/session/status") {
      const directory = url.searchParams.get("directory") ?? "";
      requests.set(directory, (requests.get(directory) ?? 0) + 1);
      if (armed && interleave.delete(directory)) {
        const seed = seeds.get(directory);
        if (seed) {
          await raw.session.abort({ sessionID: seed, directory });
        }
      }
      if (armed) {
        await Bun.sleep(40 + ((requests.get(directory) ?? 0) % 4) * 40);
      }
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(response.body, { status: response.status, headers });
  },
});
const listed = await holder.list();
const own = listed.procs.find((proc) => proc.procId === procId);
if (!own) {
  throw new Error("Probe server did not register in its private sessiond.");
}
const stat = await Bun.file(`/proc/${own.pid}/stat`).text();
const identity: ServerIdentity = {
  epoch: listed.epoch,
  pid: own.pid,
  procId,
  startedAt: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
  url: proxy.url.origin,
};
const record = join(
  home,
  ".cawco",
  `opencode-server-${createHash("sha256").update(endpoint).digest("hex").slice(0, 16)}.json`
);
await mkdir(join(home, ".cawco"), { recursive: true });
await Bun.write(record, JSON.stringify({ active: identity, retired: [] }));
let harness = new OpencodeHarness();
const contexts = new Map<string, HarnessContext>();
const context = (id: string, cwd: string): HarnessContext => {
  const ctx: HarnessContext = {
    instanceId: id,
    cwd,
    busy: () => undefined,
    session: () => undefined,
    frame: () => undefined,
    permission: () => undefined,
    failed: (error) => {
      console.warn(String(error));
    },
    rejected: (_id, error) => {
      console.warn(String(error));
    },
    emit: () => undefined,
  };
  contexts.set(id, ctx);
  return ctx;
};

try {
  const directories = Array.from({ length: 8 }, (_, index) =>
    join(sandbox, `directory-${index}`)
  );
  const rows: { spec: SpawnPayload; ctx: HarnessContext }[] = [];
  for (const [index, directory] of directories.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: each real directory is primed before its concurrent recovery cohort
    await mkdir(directory, { recursive: true });
    const seeded = await raw.session.create({ directory });
    if (!seeded.data) {
      throw new Error("Probe seed creation failed.");
    }
    seeds.set(directory, seeded.data.id);
    const id = `seed-${index}`;
    const session = await harness.reattach(
      {
        instanceId: id,
        cwd: directory,
        resume: { sessionKey: seeded.data.id },
      },
      context(id, directory)
    );
    session?.attached?.();
    for (let n = 0; n < 5; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixture creation is deliberately separate from the concurrent recovery under test
      const created = await raw.session.create({ directory });
      if (!created.data) {
        throw new Error("Probe session creation failed.");
      }
      const instanceId = `probe-${index}-${n}`;
      rows.push({
        spec: {
          instanceId,
          cwd: directory,
          resume: { sessionKey: created.data.id },
        },
        ctx: context(instanceId, directory),
      });
    }
  }
  for (const directory of directories) {
    interleave.add(directory);
  }
  requests.clear();
  armed = true;
  const started = performance.now();
  const outcomes = await Promise.allSettled(
    rows.map(async ({ spec, ctx }) => {
      const session = await harness.reattach(spec, ctx);
      if (!session) {
        throw new Error(`No attachment for ${spec.instanceId}.`);
      }
      session.attached?.();
    })
  );
  armed = false;
  const failures = outcomes.filter((outcome) => outcome.status === "rejected");
  console.log(
    JSON.stringify({
      case: "concurrent-recovery",
      baseline,
      sessions: rows.length,
      directories: directories.length,
      failures: failures.length,
      diagnostics,
      statusRequests: Object.fromEntries(requests),
      elapsedMs: performance.now() - started,
    })
  );
  for (const failed of failures.slice(0, 3)) {
    if (failed.status === "rejected") {
      console.log(String(failed.reason));
    }
  }
  if (failures.length) {
    throw new Error(
      `Concurrent custody failed for ${failures.length} of ${rows.length} sessions.`
    );
  }
  await harness.dispose();
  const secondId = "opencode-server-custody-probe-second";
  const second = await attachOpencodeServer({
    sessiond: holder,
    procId: secondId,
    spec: {
      command: binary,
      args: ["serve", "--hostname=127.0.0.1", "--port=0"],
      cwd: sandbox,
      env: { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
    },
    signal: AbortSignal.timeout(30_000),
  });
  const secondList = await holder.list();
  const secondProc = secondList.procs.find((proc) => proc.procId === secondId);
  if (!secondProc) {
    throw new Error("Second probe generation was not registered.");
  }
  const secondStat = await Bun.file(`/proc/${secondProc.pid}/stat`).text();
  const secondIdentity: ServerIdentity = {
    epoch: secondList.epoch,
    pid: secondProc.pid,
    procId: secondId,
    startedAt: secondStat.slice(secondStat.lastIndexOf(")") + 2).split(" ")[19],
    url: second.url,
  };
  await Bun.write(
    record,
    JSON.stringify({ active: secondIdentity, retired: [identity] })
  );
  harness = new OpencodeHarness();
  killOnStatus = true;
  let completed = 0;
  let recoveryRetries = 0;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      String(args[0]).includes("recovery killed-probe-") &&
      String(args[0]).includes("waiting; retry")
    ) {
      recoveryRetries += 1;
    }
    originalWarn(...args);
  };
  const recovering = Promise.allSettled(
    rows.map(async ({ spec, ctx }) => {
      const next = { ...spec, instanceId: `killed-${spec.instanceId}` };
      const session = await harness.reattach(
        next,
        context(next.instanceId, ctx.cwd)
      );
      if (!session) {
        throw new Error("Killed-generation recovery returned no handle.");
      }
      completed += 1;
      session.attached?.();
    })
  );
  await killedRead.promise;
  const earlyBindings = completed;
  const retried = await recovering;
  console.warn = originalWarn;
  const failed = retried.filter((outcome) => outcome.status === "rejected");
  console.log(
    JSON.stringify({
      case: "killed-generation",
      liveAtStart: 2,
      killedPid: own.pid,
      failedGenerationReads,
      earlyBindings,
      recoveryRetries,
      failures: failed.length,
      recoveredAfterConfirmedExit: completed,
    })
  );
  if (
    earlyBindings ||
    recoveryRetries === 0 ||
    failed.length ||
    completed !== rows.length
  ) {
    throw new Error(
      "Killed-generation custody did not fail closed and then resolve after a fresh live-generation lookup."
    );
  }
} finally {
  await harness.dispose();
  await sessiond.drain(2000);
  holder.close();
  await sessiond.close();
  await proxy.stop(true);
  await hub.stop(true);
  await rm(sandbox, { recursive: true, force: true });
}
