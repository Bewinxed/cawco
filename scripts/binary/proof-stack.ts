/** Live integration exercise run by the compiled proof binary, never a release. */
// biome-ignore-all lint/performance/noAwaitInLoops: readiness and restart-phase polls observe successive real states.
// biome-ignore-all lint/complexity/noVoid: log writers consume live process pipes concurrently; awaiting them before process exit would deadlock.
import { dlopen, FFIType, ptr } from "bun:ffi";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  accountClaudeJson,
  accountConfigDir,
} from "../../packages/core/src/paths";
import { WIRE_PROTOCOL } from "../../packages/core/src/stream";

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
  // A proof hub never advertises on the real network: its mDNS would answer
  // for a scratch stack on whatever link the host sits on.
  const child = Bun.spawn([process.execPath, verb, ...args], {
    env: { ...process.env, CAWCO_NO_MDNS: "1", ...extra },
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
  predicate: (s: string) => boolean = () => true,
  ms = 10_000
) {
  for (const end = Date.now() + ms; Date.now() < end;) {
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
async function until(what: string, ready: () => boolean, ms = 15_000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (ready()) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Did not happen: ${what}`);
}
/**
 * Every message the hub's dashboard socket sends from its start, as the
 * Apple app reads it: on this hub's wire, named as the app names it, no
 * Origin. Written to frames.jsonl; the release reads each against the
 * schema of every TestFlight build still installable (hub scripts
 * wire-frames.ts).
 */
const captured: string[] = [];
function capture() {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:43456/ws/dashboard?protocol=${WIRE_PROTOCOL}`
    );
    ws.onmessage = (event) => captured.push(String(event.data));
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("Capture websocket failed"));
  });
}
const parsed = () =>
  captured.map(
    (text) =>
      JSON.parse(text) as {
        event?: { frame?: { kind?: string }; sessionId?: string };
        payload?: { kind?: string };
        type?: string;
        verb?: string;
      }
  );
const systemd = process.env.CAWCO_PROOF_SYSTEMD === "1";
/** Set by prove-stage1.sh's browser step: the stack stays up until that file exists. */
const browserDone = process.env.CAWCO_PROOF_BROWSER_DONE;
/** The session's stub dev server, and the open that shows it as its preview. */
let devServer: Bun.Server<undefined> | undefined;
let previewShown: Promise<Record<string, unknown>> | undefined;
try {
  mkdirSync(home, { recursive: true });
  await exec("proof-fixture");
  spawn("sessiond");
  spawn("hub");
  console.log(`health ${await wait("http://127.0.0.1:43456/health")}`);
  const captureWs = await capture();
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
  // A CawCo account the machine signs in to as it registers again below, as
  // `claude auth login` leaves one (prove-stage2.sh account-dir.sh): no real
  // credential, only what lets the stub harness start a session.
  const account = (await post("/api/accounts", {
    provider: "anthropic",
    kind: "subscription",
  })) as { id: string };
  const accountDir = accountConfigDir(account.id);
  mkdirSync(accountDir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(accountDir, ".credentials.json"),
    '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-proof-not-a-token","refreshToken":"sk-ant-ort01-proof-not-a-token","expiresAt":4102444800000,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}\n',
    { mode: 0o600 }
  );
  writeFileSync(
    accountClaudeJson(account.id),
    '{"oauthAccount":{"accountUuid":"00000000-0000-4000-8000-000000000001","emailAddress":"proof@cawco.test","organizationUuid":"00000000-0000-4000-8000-000000000002","organizationName":"CawCo proof","organizationRole":"admin"}}\n',
    { mode: 0o600 }
  );
  agent.kill("SIGTERM");
  await agent.exited;
  agent = spawn("up", ["--hub", "http://127.0.0.1:43456"]);
  await wait("http://127.0.0.1:43456/api/agents", (s) =>
    JSON.parse(s).some((a: { status: string }) => a.status === "online")
  );
  await exec("proof-custody-check");
  await wait("http://127.0.0.1:43456/api/accounts", (s) =>
    (
      JSON.parse(s) as { signins: { accountId: string; state: string }[] }
    ).signins.some(
      (row) => row.accountId === account.id && row.state === "signed-in"
    )
  );
  // A session started and spoken to the way the app does it, on the capture
  // socket: the board's deltas for it, and its stream's events.
  const sessionId = crypto.randomUUID();
  captureWs.send(
    JSON.stringify({
      verb: "spawn",
      machineId: machine.machineId,
      instanceId: sessionId,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: sessionId,
        cwd: home,
        harness: "claude",
        model: "stub",
        title: "Binary proof",
      },
    })
  );
  // A first start materializes the harness's runtime: as long as stage 2 gives one.
  await wait(
    "http://127.0.0.1:43456/api/instances",
    (s) =>
      (JSON.parse(s) as { id: string; status: string }[]).some(
        (row) => row.id === sessionId && row.status === "running"
      ),
    60_000
  );
  captureWs.send(JSON.stringify({ type: "stream.subscribe", sessionId }));
  captureWs.send(
    JSON.stringify({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: machine.machineId,
      sessionId,
      payload: {
        instanceId: sessionId,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: "binary proof" },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    })
  );
  await until("the session's stream sends an event", () =>
    parsed().some(
      (frame) =>
        frame.type === "stream.event" && frame.event?.sessionId === sessionId
    )
  );
  // A preview, as a session opens one on its dev server: a stub server here,
  // shown through the hub, so the socket carries a real PreviewFrame. The
  // open waits for a view to say it shows it (the browser step's, or none
  // within the hub's wait), so it is read last, before PASS.
  devServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        "<!doctype html><title>Binary proof preview</title><p>binary proof preview</p>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  previewShown = post(`/api/instances/${sessionId}/artifacts`, {
    kind: "preview",
    name: "binary-proof",
    port: devServer.port,
  });
  let previewAnswer = "no answer yet";
  previewShown.then(
    (answer) => {
      previewAnswer = JSON.stringify(answer);
    },
    (error: unknown) => {
      previewAnswer = String(error);
    }
  );
  await until("the hub's socket sends the session's preview", () =>
    // Sequenced into the session's stream (hub `publishPreview`).
    parsed().some((frame) => frame.event?.frame?.kind === "preview")
  ).catch((error: unknown) => {
    throw new Error(`${String(error)}; the open answered: ${previewAnswer}`);
  });
  const kinds = new Set(
    parsed().flatMap((frame) => [
      frame.payload?.kind ?? frame.type ?? frame.verb,
      ...(frame.event?.frame?.kind ? [frame.event.frame.kind] : []),
    ])
  );
  for (const kind of [
    "instances",
    "instances_delta",
    "stream.event",
    "preview",
  ]) {
    if (!kinds.has(kind)) {
      throw new Error(`The hub's socket sent no ${kind} frame`);
    }
  }
  captureWs.close();
  console.log(
    `captured ${captured.length} socket frames (${[...kinds].sort().join(", ")})`
  );
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
  if (browserDone) {
    // The served dashboard, its machine and session on the board, held for a
    // browser (prove-stage1.sh), which writes the file when it has loaded it.
    writeFileSync(join(dirname(browserDone), "stack-ready"), sessionId);
    await until(
      "the browser step loads the dashboard",
      () => existsSync(browserDone),
      60_000
    );
    console.log("the browser step loaded the served dashboard");
  }
  console.log(`preview opened: ${JSON.stringify(await previewShown)}`);
  console.log("PASS");
} finally {
  // What the socket sent, read by the release, or by whoever reads a failed run's evidence.
  writeFileSync(join(home, "frames.jsonl"), `${captured.join("\n")}\n`);
  devServer?.stop(true);
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
