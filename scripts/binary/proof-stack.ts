/** Live integration exercise run by the compiled proof binary, never a release. */
// biome-ignore-all lint/performance/noAwaitInLoops: readiness and restart-phase polls observe successive real states.
// biome-ignore-all lint/complexity/noVoid: log writers consume live process pipes concurrently; awaiting them before process exit would deadlock.
import { dlopen, FFIType, ptr } from "bun:ffi";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.HOME ?? "";
if (!home?.includes("binary")) {
  throw new Error("Stack proof requires scratch HOME");
}
const children: Bun.Subprocess[] = [];
const libc = dlopen("libc.so.6", {
  socket: {
    args: [FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  bind: { args: [FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  listen: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  close: { args: [FFIType.i32], returns: FFIType.i32 },
});
let listener = -1;
function spawn(
  verb: string,
  args: string[] = [],
  extra: Record<string, string> = {}
) {
  const child = Bun.spawn([process.execPath, verb, ...args], {
    env: { ...process.env, ...extra },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  children.push(child);
  void Bun.write(join(home, `${verb}-${child.pid}.out.log`), child.stdout);
  void Bun.write(join(home, `${verb}-${child.pid}.err.log`), child.stderr);
  return child;
}
async function exec(verb: string) {
  const child = spawn(verb);
  if ((await child.exited) !== 0) {
    throw new Error(`${verb} failed; see scratch logs`);
  }
}
async function command(args: string[]) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) {
    throw new Error(
      `${args.join(" ")}: ${await new Response(child.stderr).text()}`
    );
  }
  return text.trim();
}
async function wait(
  url: string,
  predicate: (s: string) => boolean = () => true
) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (res.ok && predicate(body)) {
        return body;
      }
    } catch {
      /* The service has not answered yet; the bounded poll continues. */
    }
    await Bun.sleep(100);
  }
  throw new Error(`Did not become ready: ${url}`);
}
function dashboard() {
  const child = Bun.spawn([process.execPath, "dashboard"], {
    env: { ...process.env, LISTEN_FDS: "1", CAWCO_PROOF_ACTIVATED_FD: "3" },
    stdio: ["ignore", "pipe", "pipe", listener],
  });
  children.push(child);
  void Bun.write(join(home, `dashboard-${child.pid}.out.log`), child.stdout);
  void Bun.write(join(home, `dashboard-${child.pid}.err.log`), child.stderr);
  return child;
}
function openDashboard() {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:43458/ws/dashboard");
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Dashboard websocket timeout"));
    }, 5000);
    ws.onmessage = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Dashboard websocket failed"));
    };
  });
}
const systemd = process.env.CAWCO_PROOF_SYSTEMD === "1";
try {
  mkdirSync(home, { recursive: true });
  await exec("proof-fixture");
  spawn("sessiond");
  spawn("hub");
  console.log(`health ${await wait("http://127.0.0.1:43456/health")}`);
  let agent = spawn("up", ["--hub", "http://127.0.0.1:43456"]);
  const registered = await wait("http://127.0.0.1:43456/api/agents", (s) =>
    JSON.parse(s).some((a: { status: string }) => a.status === "online")
  );
  writeFileSync(join(home, "registered.json"), registered);
  console.log(`machine registered with capabilities ${registered}`);
  const machine = (
    JSON.parse(registered) as { machineId: string; status: string }[]
  ).find((row) => row.status === "online");
  if (!machine) {
    throw new Error("No online proof machine");
  }
  async function post(path: string, body: unknown) {
    const response = await fetch(`http://127.0.0.1:43456${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Workflow API ${path}: ${response.status} ${text}`);
    }
    return JSON.parse(text) as Record<string, unknown>;
  }
  const workflow = await post("/api/workflows", {
    name: "Binary Proof",
    program:
      'import { z } from "zod"; export const inputs=z.object({name:z.string()}); export default async function(w:Workflow<typeof inputs>){await w.checkpoint("binary",w.inputs);return {name:w.inputs.name};}',
  });
  const launched = await post(`/api/workflows/${workflow.id}/runs`, {
    inputs: { name: "standalone" },
    workspace: { path: home, machineId: machine.machineId },
    supervisor: null,
  });
  const done = await wait(
    `http://127.0.0.1:43456/api/workflow-runs/${launched.runId}`,
    (text) => JSON.parse(text).status === "done"
  );
  if (JSON.parse(done).result?.name !== "standalone") {
    throw new Error("Real hub workflow returned wrong result");
  }
  writeFileSync(join(home, "workflow-result.json"), done);
  console.log(
    "real hub workflow API run completed and persisted its checkpoint/result"
  );
  if (systemd) {
    await command(["systemctl", "start", "cawco-binary-dashboard.socket"]);
  } else {
    listener = libc.symbols.socket(2, 1, 0);
    if (listener < 0) {
      throw new Error("socket failed");
    }
    const sockaddr = Buffer.alloc(16);
    sockaddr.writeUInt16LE(2);
    sockaddr.writeUInt16BE(43_458, 2);
    sockaddr.set([127, 0, 0, 1], 4);
    if (
      libc.symbols.bind(listener, ptr(sockaddr), 16) !== 0 ||
      libc.symbols.listen(listener, 128) !== 0
    ) {
      throw new Error("Isolated dashboard socket bind/listen failed");
    }
  }
  let worker = systemd ? undefined : dashboard();
  const page = await wait("http://127.0.0.1:43458/", (s) =>
    s.includes("_app/immutable")
  );
  console.log(`embedded dashboard served ${page.length} characters`);
  const ws = await openDashboard();
  console.log("dashboard websocket is held open before worker restart");
  const crossOrigin = await fetch("http://127.0.0.1:43458/api/agents", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://untrusted.invalid",
    },
    body: "x=1",
  });
  if (crossOrigin.status !== 403) {
    throw new Error(`CSRF check was lost: ${crossOrigin.status}`);
  }
  console.log("cross-origin form refused with 403");
  await exec("proof-worker");
  await exec("proof-migration-check");
  await exec("proof-custody-start");
  agent.kill("SIGTERM");
  await agent.exited;
  agent = spawn("up", ["--hub", "http://127.0.0.1:43456"]);
  await wait("http://127.0.0.1:43456/api/agents", (s) =>
    JSON.parse(s).some((a: { status: string }) => a.status === "online")
  );
  await exec("proof-custody-check");
  const closed = new Promise<void>((resolve) => {
    ws.onclose = () => resolve();
  });
  if (systemd) {
    const restarting = Bun.spawn(
      ["systemctl", "restart", "cawco-binary-dashboard.service"],
      { stdout: "pipe", stderr: "pipe" }
    );
    for (let i = 0; i < 50; i += 1) {
      if (
        (await command([
          "systemctl",
          "show",
          "-p",
          "MainPID",
          "--value",
          "cawco-binary-dashboard.service",
        ])) === "0"
      ) {
        break;
      }
      await Bun.sleep(20);
    }
    const response = fetch("http://127.0.0.1:43458/_app/running-version.json", {
      signal: AbortSignal.timeout(10_000),
    });
    if ((await restarting.exited) !== 0) {
      throw new Error(await new Response(restarting.stderr).text());
    }
    const res = await response;
    if (!res.ok) {
      throw new Error(
        `Request during real service restart failed ${res.status}`
      );
    }
    console.log(
      `real systemd socket activation: request during restart answered ${await res.text()}`
    );
  } else {
    worker?.kill("SIGTERM");
    await worker?.exited;
    const response = fetch("http://127.0.0.1:43458/_app/running-version.json", {
      signal: AbortSignal.timeout(5000),
    });
    await Bun.sleep(100);
    worker = dashboard();
    const res = await response;
    if (!res.ok) {
      throw new Error("Queued restart request failed");
    }
    console.log(
      "held supervisor socket: queued request answered after worker replacement"
    );
  }
  await Promise.race([
    closed,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Old worker websocket did not drain")),
        5000
      )
    ),
  ]);
  const replacement = await openDashboard();
  replacement.close();
  console.log("old websocket drained; replacement websocket delivers a frame");
  console.log("PASS");
} finally {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* A previously exited child is already cleaned up. */
    }
  }
  await Promise.all(
    children.map((child) =>
      Promise.race([
        child.exited,
        Bun.sleep(5000).then(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* The child exited during the grace period. */
          }
        }),
      ])
    )
  );
  if (listener >= 0) {
    libc.symbols.close(listener);
  }
  libc.close();
}
