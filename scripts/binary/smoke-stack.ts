/** Live integration exercise run by the compiled test binary, never a release. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { keepJoinedHub } from "../../packages/cli/src/joined-hub";
import { readWithin } from "../../packages/core/src/bounded";
import { detach } from "../../packages/core/src/detach";
import { withFetchCap } from "../../packages/core/src/fetch-cap";
import {
  fetchHub,
  type HubRequest,
  hubRequest,
} from "../../packages/core/src/hub-request";
import {
  accountClaudeJson,
  accountConfigDir,
} from "../../packages/core/src/paths";
import { WIRE_PROTOCOL } from "../../packages/core/src/stream";
import { unhandled } from "../../packages/core/src/unhandled";
import { loopWords } from "../../packages/core/src/words/loop";
import { SECTION, SHORT_HOLD_MS } from "./smoke-loop-held";

const home = process.env.HOME ?? "";
if (!home?.includes("binary")) {
  throw new Error("Stack test requires scratch HOME");
}
const children: Bun.Subprocess[] = [];
function spawn(
  verb: string,
  args: string[] = [],
  extra: Record<string, string> = {}
) {
  // A test hub never advertises on the real network: its mDNS would answer
  // for a scratch stack on whatever link the host sits on.
  const child = Bun.spawn([process.execPath, verb, ...args], {
    // Its units' fetch cap (core fetch-cap.ts).
    env: withFetchCap({ ...process.env, CAWCO_NO_MDNS: "1", ...extra }),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  children.push(child);
  detach(
    Bun.write(join(home, `${verb}-${child.pid}.out.log`), child.stdout),
    "write"
  );
  detach(
    Bun.write(join(home, `${verb}-${child.pid}.err.log`), child.stderr),
    "write"
  );
  return child;
}
async function exec(verb: string) {
  const child = spawn(verb);
  if ((await child.exited) !== 0) {
    throw new Error(`${verb} failed; see scratch logs`);
  }
}
/**
 * The loop watch's thread, started from the binary's embedded entry, says a
 * held loop while it lasts, in the section that holds it, and its end
 * (smoke-loop-held.ts, its short hold: the 10 s saying alone).
 */
async function loopHeldSaid() {
  const child = Bun.spawn([process.execPath, "smoke-loop-held", "short"], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  children.push(child);
  const [err, out, code] = await Promise.all([
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
    child.exited,
  ]);
  await Promise.all([
    Bun.write(join(home, `smoke-loop-held-${child.pid}.out.log`), out),
    Bun.write(join(home, `smoke-loop-held-${child.pid}.err.log`), err),
  ]);
  const lines = `${err}${out}`
    .split("\n")
    .filter((line) => line.includes("[loop]"));
  const held = lines.filter((line) =>
    [10, 30].some((at) => line.includes(loopWords.heldNow("agent", at)))
  );
  const atTen = held.find((line) =>
    line.includes(loopWords.heldNow("agent", 10))
  );
  const seconds = SHORT_HOLD_MS / 1000;
  const again = lines.find((line) =>
    [seconds - 1, seconds, seconds + 1, seconds + 2].some((at) =>
      line.includes(loopWords.answersAgain("agent", at))
    )
  );
  if (
    code !== 0 ||
    held.length !== 1 ||
    !atTen?.includes(loopWords.lastSection(SECTION, false)) ||
    !again
  ) {
    throw new Error(
      `The loop watch did not say the binary's ${seconds} s hold (exit ${code}): ${JSON.stringify(lines)}\n${err}`
    );
  }
  console.log(atTen);
  console.log(again);
}
/**
 * The agent's stores thread, started from the binary's embedded entry,
 * answers its reads, and the transcript index it holds parses on threads
 * it starts itself (smoke-stores.ts).
 */
async function storesAnswer() {
  const child = Bun.spawn([process.execPath, "smoke-stores"], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  children.push(child);
  const [err, out, code] = await Promise.all([
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `The binary's stores thread did not answer (exit ${code}): ${out}\n${err}`
    );
  }
  console.log(out.trim().split("\n").at(-1));
}
async function command(args: string[]) {
  const child = Bun.spawn(args, {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) {
    throw new Error(
      `${args.join(" ")}: ${await new Response(child.stderr).text()}`
    );
  }
  return text.trim();
}
/** What a readiness wait waits on: whether it has exited, and its stderr's tail. */
interface Watched {
  /** The exit code (or signal) once it has exited; undefined while it runs. */
  exited: () => Promise<string | undefined>;
  name: string;
  stderrTail: () => Promise<string>;
}
async function tail(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return "";
  }
  return (await file.text()).trimEnd().split("\n").slice(-20).join("\n");
}
function watchChild(name: string, verb: string, child: Bun.Subprocess) {
  return {
    name,
    exited: () => {
      if (child.exitCode !== null) {
        return Promise.resolve(`code ${child.exitCode}`);
      }
      return Promise.resolve(
        child.signalCode ? `signal ${child.signalCode}` : undefined
      );
    },
    stderrTail: () => tail(join(home, `${verb}-${child.pid}.err.log`)),
  } satisfies Watched;
}
const dashboardUnit = "cawco-binary-dashboard.service";
const dashboardSocket = "cawco-binary-dashboard.socket";
/**
 * The socket-activated dashboard: its service is `inactive` until the first
 * connection starts it, and a clean exit leaves it `inactive` with the socket
 * still listening to start it again, so neither is an end. The dashboard is
 * gone when its service has failed (a non-zero exit, a kill, a start that
 * failed) or its socket no longer listens.
 */
const watchUnit: Watched = {
  name: dashboardUnit,
  exited: async () => {
    const show = (unit: string, property: string) =>
      command(["systemctl", "show", "-p", property, "--value", unit]);
    if ((await show(dashboardUnit, "ActiveState")) === "failed") {
      return `${dashboardUnit} failed, ExecMainStatus ${await show(dashboardUnit, "ExecMainStatus")}`;
    }
    const socket = await show(dashboardSocket, "ActiveState");
    if (socket !== "active") {
      return `${dashboardSocket} is ${socket}`;
    }
  },
  stderrTail: () =>
    command([
      "journalctl",
      "-u",
      dashboardUnit,
      "-n",
      "20",
      "-o",
      "cat",
      "--no-pager",
    ]).catch((error: unknown) => String(error)),
};
/** The safety deadline: a busy machine is slow, never wrong (nightly e83078b6d). */
const READY_DEADLINE_MS = 120_000;
/** The test's hub, on its own port. */
const HUB = "http://127.0.0.1:43456";
/**
 * Polls `url` every 100 ms until it answers OK with `predicate` true, the
 * process it waits on exits, or the safety deadline passes.
 */
async function wait(
  url: string,
  on: Watched,
  predicate: (s: string) => boolean = () => true
) {
  for (const end = Date.now() + READY_DEADLINE_MS; Date.now() < end;) {
    const exited = await on.exited();
    if (exited !== undefined) {
      throw new Error(
        `${on.name} exited (${exited}) before ${url} was ready; its last stderr lines:\n${await on.stderrTail()}`
      );
    }
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
  throw new Error(
    `Did not become ready within 120 s: ${url}; ${on.name}'s last stderr lines:\n${await on.stderrTail()}`
  );
}
async function openDashboard() {
  const opened = await readWithin(
    5000,
    (signal) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket("ws://127.0.0.1:43458/ws/dashboard");
        signal.addEventListener("abort", () => ws.close(), { once: true });
        ws.onmessage = () => resolve(ws);
        ws.onerror = () => reject(new Error("Dashboard websocket failed"));
      })
  );
  switch (opened.kind) {
    case "answered":
      return opened.value;
    case "unanswered":
      throw new Error(
        `Dashboard websocket did not answer within ${opened.after} ms (${opened.reason})`
      );
    default:
      unhandled("read", opened);
  }
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
        instanceId?: string;
        payload?: { kind?: string; message?: string };
        type?: string;
        verb?: string;
      }
  );
/** Set by smoke-test.sh's browser step: the stack stays up until that file exists. */
const browserDone = process.env.CAWCO_TEST_BROWSER_DONE;
/** The session's stub dev server, and the open that shows it as its preview. */
let devServer: Bun.Server<undefined> | undefined;
let previewShown: Promise<Record<string, unknown>> | undefined;
/**
 * The test's session once it is asked for: stopped through the hub as the
 * run ends, so its held process ends with it rather than outliving a run
 * made outside a container.
 */
let started: { machineId: string; sessionId: string } | undefined;
/**
 * Asks the hub to stop the test's session as the dashboard does, a `stop`
 * frame on a dashboard socket of its own (e2e-stop-session.ts; the
 * capture socket is closed by then), and waits until the hub no longer has
 * it running. Undefined when it ended or none started; what was left
 * otherwise.
 */
async function stopStarted(): Promise<string | undefined> {
  if (!started) {
    return;
  }
  const { machineId, sessionId } = started;
  const opened = await readWithin(
    5000,
    (signal) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket("ws://127.0.0.1:43456/ws/dashboard");
        signal.addEventListener("abort", () => ws.close(), { once: true });
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error("the hub's socket did not open"));
      })
  ).catch((error: unknown) => ({ kind: "failed" as const, error }));
  if (opened.kind !== "answered") {
    return `the hub's socket did not open (${opened.kind})`;
  }
  const socket = opened.value;
  socket.send(
    JSON.stringify({
      verb: "stop",
      machineId,
      instanceId: sessionId,
      payload: { instanceId: sessionId, harness: "claude" },
    })
  );
  try {
    for (const end = Date.now() + 10_000; Date.now() < end;) {
      const rows = (await (
        await fetch(`${HUB}${hubRequest("GET /api/instances").path}`)
      ).json()) as { id: string; status: string }[];
      if (
        !rows.some((row) => row.id === sessionId && row.status === "running")
      ) {
        return;
      }
      await Bun.sleep(100);
    }
    return "it was still running 10 s after the stop";
  } catch {
    return "the hub stopped answering";
  } finally {
    socket.close();
  }
}
try {
  mkdirSync(home, { recursive: true });
  await exec("smoke-fixture");
  spawn("sessiond");
  const hub = watchChild("the hub", "hub", spawn("hub"));
  console.log(
    `health ${await wait(`${HUB}${hubRequest("GET /health").path}`, hub)}`
  );
  // The machine joined this hub as an install joins it (cli joined-hub.ts,
  // binary-install's own step): `up --hub` names a hub for its run and saves
  // none (discover.ts `settle`), so without this the agent is not the
  // machine's own, refuses every fleet sync, and starts no session ("Not
  // started: this machine has not had its first fleet sync …, and this agent
  // refused the hub's sync", nightly 515796316).
  await keepJoinedHub("http://127.0.0.1:43456");
  const captureWs = await capture();
  let agent = spawn("up", ["--hub", "http://127.0.0.1:43456"]);
  const registered = await wait(
    `${HUB}${hubRequest("GET /api/agents").path}`,
    watchChild("the agent", "up", agent),
    (s) => JSON.parse(s).some((a: { status: string }) => a.status === "online")
  );
  writeFileSync(join(home, "registered.json"), registered);
  console.log(`machine registered with capabilities ${registered}`);
  const machine = (
    JSON.parse(registered) as { machineId: string; status: string }[]
  ).find((row) => row.status === "online");
  if (!machine) {
    throw new Error("No online test machine");
  }
  async function post(request: HubRequest) {
    const response = await fetchHub(fetch, HUB, request);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Hub API ${request.path}: ${response.status} ${text}`);
    }
    return JSON.parse(text) as Record<string, unknown>;
  }
  await command(["systemctl", "start", "cawco-binary-dashboard.socket"]);
  const page = await wait("http://127.0.0.1:43458/", watchUnit, (s) =>
    s.includes("_app/immutable")
  );
  console.log(`embedded dashboard served ${page.length} characters`);
  const ws = await openDashboard();
  console.log("dashboard websocket is held open before worker restart");
  // A form's POST from another site to the hub's agents path through the
  // dashboard: refused by the origin check before any route is read.
  const crossOrigin = await fetch(
    `http://127.0.0.1:43458${hubRequest("GET /api/agents").path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://untrusted.invalid",
      },
      body: "x=1",
    }
  );
  if (crossOrigin.status !== 403) {
    throw new Error(`CSRF check was lost: ${crossOrigin.status}`);
  }
  console.log("cross-origin form refused with 403");
  await exec("smoke-worker");
  await loopHeldSaid();
  await storesAnswer();
  // The packages the binary runs from their published trees, and pi's
  // workers by the names pi gives them (smoke-runtime.ts).
  await exec("smoke-playwright");
  await exec("smoke-pi");
  // pi-tui loads its clipboard helper only when DISPLAY is set, and the
  // helper reads the X display: the leg needs one, which a test container
  // has none of (smoke-test.sh's images carry no X server).
  if (process.env.DISPLAY) {
    await exec("smoke-pi-clipboard");
  } else {
    console.log("pi-tui clipboard leg skipped: no DISPLAY on this machine");
  }
  console.log("playwright-core, photon-node and pi ran from the binary");
  await exec("smoke-migration-check");
  await exec("smoke-custody-start");
  // A CawCo account the machine signs in to as it registers again below, as
  // `claude auth login` leaves one (e2e-test.sh account-dir.sh): no real
  // credential, only what lets the stub harness start a session.
  const account = (await post(
    hubRequest("POST /api/accounts", {
      body: { provider: "anthropic", kind: "subscription" },
    })
  )) as { id: string };
  const accountDir = accountConfigDir(account.id);
  mkdirSync(accountDir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(accountDir, ".credentials.json"),
    '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-test-not-a-token","refreshToken":"sk-ant-ort01-test-not-a-token","expiresAt":4102444800000,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}\n',
    { mode: 0o600 }
  );
  writeFileSync(
    accountClaudeJson(account.id),
    '{"oauthAccount":{"accountUuid":"00000000-0000-4000-8000-000000000001","emailAddress":"test@cawco.test","organizationUuid":"00000000-0000-4000-8000-000000000002","organizationName":"CawCo test","organizationRole":"admin"}}\n',
    { mode: 0o600 }
  );
  agent.kill("SIGTERM");
  await agent.exited;
  agent = spawn("up", ["--hub", "http://127.0.0.1:43456"]);
  const restarted = watchChild("the agent", "up", agent);
  await wait(`${HUB}${hubRequest("GET /api/agents").path}`, restarted, (s) =>
    JSON.parse(s).some((a: { status: string }) => a.status === "online")
  );
  await exec("smoke-custody-check");
  await wait(`${HUB}${hubRequest("GET /api/accounts").path}`, restarted, (s) =>
    (
      JSON.parse(s) as { signins: { accountId: string; state: string }[] }
    ).signins.some(
      (row) => row.accountId === account.id && row.state === "signed-in"
    )
  );
  // Started at once, not after the machine's tools read: the restarted
  // agent's Claude report says Claude Code is installed (test-harnesses.ts
  // `detected`), which is what the hub admits a start by.
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
        // The test harness runs a held process whatever the model; the
        // harness's default is one the hub admits on any listing (core
        // model-names.ts `modelAdmitted`).
        model: "default",
        title: "Binary test",
      },
    })
  );
  started = { machineId: machine.machineId, sessionId };
  // The hub's refusal of the start, the frame it answers a refused spawn
  // with (registry.ts `refusalFrame`): the test fails in its words rather
  // than waiting out the deadline for a session that never comes.
  const refusal = () =>
    parsed().find(
      (frame) =>
        frame.instanceId === sessionId && frame.payload?.kind === "error"
    );
  // A first start materializes the harness's runtime: as long as end-to-end test gives one.
  await wait(
    `${HUB}${hubRequest("GET /api/instances").path}`,
    restarted,
    (s) =>
      refusal() !== undefined ||
      (JSON.parse(s) as { id: string; status: string }[]).some(
        (row) => row.id === sessionId && row.status === "running"
      )
  );
  const refused = refusal();
  if (refused) {
    throw new Error(
      `The hub refused the test's session: ${refused.payload?.message}`
    );
  }
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
          message: { role: "user", content: "binary test" },
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
        "<!doctype html><title>Binary test preview</title><p>binary test preview</p>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  previewShown = post(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: sessionId },
      body: {
        kind: "preview",
        does: "try",
        title: "Probe try artifact",
        ask: "Try this page and say whether it works",
        name: "binary-test",
        port: devServer.port,
      },
    })
  );
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
  const restarting = Bun.spawn(
    ["systemctl", "restart", "cawco-binary-dashboard.service"],
    { env: process.env, stdout: "pipe", stderr: "pipe" }
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
  const response = readWithin(10_000, async (signal) => {
    const res = await fetch(
      "http://127.0.0.1:43458/_app/running-version.json",
      { signal }
    );
    return { ok: res.ok, status: res.status, text: await res.text() };
  });
  if ((await restarting.exited) !== 0) {
    throw new Error(await new Response(restarting.stderr).text());
  }
  const res = await response;
  switch (res.kind) {
    case "answered":
      break;
    case "unanswered":
      throw new Error(
        `Request during real service restart did not answer within ${res.after} ms (${res.reason})`
      );
    default:
      unhandled("read", res);
  }
  if (!res.value.ok) {
    throw new Error(
      `Request during real service restart failed ${res.value.status}`
    );
  }
  console.log(
    `real systemd socket activation: request during restart answered ${res.value.text}`
  );
  const drained = await readWithin(5000, () => closed);
  switch (drained.kind) {
    case "answered":
      break;
    case "unanswered":
      throw new Error(
        `Old worker websocket did not drain within ${drained.after} ms`
      );
    default:
      unhandled("read", drained);
  }
  const replacement = await openDashboard();
  replacement.close();
  console.log("old websocket drained; replacement websocket delivers a frame");
  if (browserDone) {
    // The served dashboard, its machine and session on the board, held for a
    // browser (smoke-test.sh), which writes the file when it has loaded it.
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
  const left = await stopStarted();
  if (left) {
    console.error(
      `the test's session ${started?.sessionId} may outlive the run: ${left}`
    );
  }
  devServer?.stop(true);
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* A previously exited child is already cleaned up. */
    }
  }
  await Promise.all(
    children.map(async (child) => {
      const exited = await readWithin(5000, () => child.exited);
      switch (exited.kind) {
        case "answered":
          break;
        case "unanswered":
          try {
            child.kill("SIGKILL");
          } catch {
            /* The child exited during the grace period. */
          }
          break;
        default:
          unhandled("read", exited);
      }
    })
  );
}
