/**
 * Probe: the relay (Projects spec §5.5 Relay, P3) on a scratch fleet (real
 * hub, agent and sessiond on loopback, real Claude Code against a mock
 * model). The invariant: a push-only service delivers through one public
 * path, `/hooks/<id>`, and nothing else of the hub; every delivery is
 * verified before it is stored, and lands once, even when the poller sees
 * the same change.
 *
 * Fakes in this process and the sandbox:
 * - GitHub's REST API (`CAWCO_GITHUB_API`): the lists the poller reads, and
 *   `POST/DELETE /repos/probe/app/hooks`, which records the webhook's URL and
 *   secret and then sends GitHub's signed `ping` to the receiver, as GitHub
 *   does through Funnel.
 * - `tailscale` on the hub's PATH: a script whose mode file answers as
 *   Tailscale 1.98 does: live, "Access denied" (no operator), Funnel not
 *   enabled (prints the approval URL and waits), or a private Serve on port
 *   10000. Every call's argv is logged.
 *
 * 1. GitHub: a signed `pull_request` closed+merged lands once; the same
 *    delivery again adds nothing; the poller seeing that merge adds nothing,
 *    in either order.
 * 2. A bad signature is 401; Stripe with an old timestamp is 401; a fresh
 *    Stripe delivery lands; a generic one with its header lands.
 * 3. 1 MiB + 1 is 413 before the body is whole (a chunked body that never
 *    ends); the 61st request in a minute is 429; an unknown id is 404, the
 *    same as any other path; GET /hooks/<id> is 404; the hub API's routes
 *    aren't on this listener.
 * 4. Funnel: the apply and off command lines; status read back into the
 *    public URL; needs-owner for "no operator" and "Funnel not enabled" with
 *    their remedies; a Serve on 10000 is refused.
 * 5. GitHub registration: the hook made with the secret, the ping lands,
 *    the hook deleted on remove; a refused registration says what to paste.
 * 6. A session's relay_create parks for the owner with what goes public;
 *    approved, it is made; denied, nothing is.
 * 7. No secret or GitHub token in any file under the sandbox and HOME.
 *
 * Run from the repo root:  bun scripts/probe-relay.ts [--keep]
 */
import { createHmac } from "node:crypto";
import { appendFileSync, chmodSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import { RELAY_BODY_MAX } from "../packages/hub/src/relay";
import { MACHINE, type Reply, scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const TOKEN = `ghp_probe_${crypto.randomUUID().replaceAll("-", "")}`;
const STRIPE_SECRET = `whsec_probe_${crypto.randomUUID().replaceAll("-", "")}`;
const GENERIC_SECRET = `generic_probe_${crypto.randomUUID().replaceAll("-", "")}`;
const REPO = "probe/app";
const SOURCE = "github:probe/app";
const TS_HOST = "probe-host.tail-probe.ts.net";
const LOGGED = /relay|error/i;
const CREDENTIAL = /Bearer ([A-Za-z0-9_-]{43})/;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(
      name,
      false,
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    );
  }
};
const hmac = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

const freePort = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const { port } = server;
  server.stop(true);
  return port;
};
const RELAY_PORT = freePort();

// ── The fake GitHub API ─────────────────────────────────────────────────────
const iso = (ms = Date.now()) => new Date(ms).toISOString();
interface Pull {
  closed: string | null;
  created: string;
  merged: string | null;
  number: number;
  updated: string;
}
const gh = {
  pulls: [] as Pull[],
  hooks: [] as { events: string[]; id: number; secret: string; url: string }[],
  deleted: [] as string[],
  refuseHooks: false as boolean,
};
const pullJson = (pr: Pull) => ({
  number: pr.number,
  html_url: `https://github.com/${REPO}/pull/${pr.number}`,
  title: `PR ${pr.number}`,
  body: `Body of PR ${pr.number}`,
  user: { login: "alice" },
  labels: [],
  head: { ref: `feature-${pr.number}` },
  base: { repo: { full_name: REPO } },
  state: pr.closed ? "closed" : "open",
  created_at: pr.created,
  updated_at: pr.updated,
  closed_at: pr.closed,
  merged_at: pr.merged,
});
const signedGitHub = (secret: string, event: string, body: string) => ({
  "content-type": "application/json",
  "x-github-event": event,
  "x-github-delivery": crypto.randomUUID(),
  "x-hub-signature-256": `sha256=${hmac(secret, body)}`,
});
const receiver = (path: string) => `http://127.0.0.1:${RELAY_PORT}${path}`;
let hookIds = 4241;

const githubFetch = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return Response.json({ message: "Bad credentials" }, { status: 401 });
  }
  if (url.pathname === `/repos/${REPO}/hooks` && request.method === "POST") {
    if (gh.refuseHooks) {
      return Response.json(
        { message: "Resource not accessible by personal access token" },
        { status: 403 }
      );
    }
    const asked = (await request.json()) as {
      config: { secret: string; url: string };
      events: string[];
    };
    hookIds += 1;
    const hook = {
      id: hookIds,
      url: asked.config.url,
      secret: asked.config.secret,
      events: asked.events,
    };
    gh.hooks.push(hook);
    // GitHub pings a new webhook: through Funnel, which hands the receiver the same path.
    setTimeout(() => {
      const body = JSON.stringify({
        zen: "Keep it logically awesome.",
        hook_id: hook.id,
      });
      fetch(receiver(new URL(hook.url).pathname), {
        method: "POST",
        headers: signedGitHub(hook.secret, "ping", body),
        body,
      }).catch(() => undefined);
    }, 200);
    return Response.json({ id: hook.id }, { status: 201 });
  }
  if (
    url.pathname.startsWith(`/repos/${REPO}/hooks/`) &&
    request.method === "DELETE"
  ) {
    gh.deleted.push(url.pathname.split("/").at(-1) ?? "");
    return new Response(null, { status: 204 });
  }
  if (url.pathname === `/repos/${REPO}/pulls`) {
    return Response.json(
      [...gh.pulls]
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map(pullJson)
    );
  }
  if (
    [
      `/repos/${REPO}/issues`,
      `/repos/${REPO}/issues/comments`,
      `/repos/${REPO}/issues/events`,
    ].includes(url.pathname)
  ) {
    return Response.json([]);
  }
  return new Response("not found", { status: 404 });
};
const fake = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: githubFetch });
const API = `http://127.0.0.1:${fake.port}`;

// ── The fleet, with a fake `tailscale` on its PATH ───────────────────────────
const fleet = await scratchFleet({
  name: "probe-relay",
  respond: (request): Reply =>
    request.tools
      ? { everyMs: 5, words: ["ok"] }
      : { everyMs: 5, words: ["Relay probe"] },
});
const home = fleet.env.HOME as string;
const tsDir = join(fleet.sandbox, "tailscale");
const bin = join(tsDir, "bin");
await mkdir(bin, { recursive: true });
await writeFile(join(tsDir, "mode"), "ok\n");
const FAKE_TAILSCALE = `#!${process.execPath}
// A fake tailscale 1.98 CLI for probe-relay: its mode file decides what it answers.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const dir = ${JSON.stringify(tsDir)};
const args = process.argv.slice(2);
appendFileSync(dir + "/calls.log", args.join(" ") + "\\n");
const mode = readFileSync(dir + "/mode", "utf8").trim();
const file = dir + "/serve.json";
const HP = ${JSON.stringify(`${TS_HOST}:10000`)};
const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
if (args[0] === "funnel" && args[1] === "status") {
  const served = mode === "serve10000"
    ? { TCP: { "10000": { HTTPS: true } }, Web: { [HP]: { Handlers: { "/": { Proxy: "http://127.0.0.1:9999" } } } } }
    : read();
  console.log(JSON.stringify(served, null, 2));
  process.exit(0);
}
if (args[0] === "funnel" && args.at(-1) === "off") {
  const config = read();
  const mount = config?.Web?.[HP]?.Handlers?.["/hooks/"];
  if (!mount) { console.error("error: failed to remove web serve: handler does not exist"); process.exit(1); }
  delete config.Web[HP].Handlers["/hooks/"];
  if (Object.keys(config.Web[HP].Handlers).length === 0) {
    delete config.Web[HP]; delete config.AllowFunnel[HP]; delete config.TCP["10000"];
  }
  writeFileSync(file, JSON.stringify(config));
  process.exit(0);
}
if (args[0] === "funnel" && args.includes("--bg")) {
  if (mode === "denied") {
    console.error("Access denied: serve config denied\\n\\nUse 'sudo tailscale " + args.join(" ") + "'.\\nTo not require root, use 'sudo tailscale set --operator=$USER' once.");
    process.exit(1);
  }
  if (mode === "not-enabled") {
    await Bun.write(Bun.stdout, "\\nFunnel is not enabled on your tailnet.\\nTo enable, visit:\\n\\n         https://login.tailscale.com/f/funnel?node=nPROBE\\n\\n");
    setInterval(() => {}, 1000);
  } else {
    const target = args.at(-1);
    writeFileSync(file, JSON.stringify({ TCP: { "10000": { HTTPS: true } }, Web: { [HP]: { Handlers: { "/hooks/": { Proxy: target } } } }, AllowFunnel: { [HP]: true } }));
    console.log("Available on the internet:\\n\\nhttps://" + HP + "/hooks/\\n|-- proxy " + target + "\\n\\nFunnel started and running in the background.");
    process.exit(0);
  }
} else {
  console.error("fake tailscale: " + args.join(" ") + " is not faked");
  process.exit(1);
}
`;
await writeFile(join(bin, "tailscale"), FAKE_TAILSCALE);
chmodSync(join(bin, "tailscale"), 0o755);
fleet.env.PATH = `${bin}:${fleet.env.PATH}`;
fleet.env.CAWCO_GITHUB_API = API;
fleet.env.CAWCO_RELAY_PORT = String(RELAY_PORT);

const setMode = (mode: string) => writeFile(join(tsDir, "mode"), `${mode}\n`);
const tsCalls = async () =>
  (await readFile(join(tsDir, "calls.log"), "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean);
appendFileSync(join(tsDir, "calls.log"), "");

interface RelayView {
  hasSecret: boolean;
  id: string;
  inbound: string;
  publicUrl: string | null;
  reason: string | null;
  registered: boolean;
  state: string;
  testedAt: number | null;
}
interface Created {
  relay: RelayView;
  suggestedRoutes: { note: string; routines: unknown[]; source: string };
}
interface EventRow {
  delivery_key: string;
  source: string;
  via: string;
}

const send = async <T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(120_000),
  });
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${said}`);
  }
  return (said ? JSON.parse(said) : undefined) as T;
};
const deliver = async (
  path: string,
  body: string | Uint8Array,
  headers: Record<string, string>,
  method = "POST"
) => {
  const response = await fetch(receiver(path), {
    method,
    headers,
    ...(method === "GET" ? {} : { body }),
  });
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.keys()]
      .filter((key) => key !== "date")
      .sort()
      .join(","),
  };
};
const eventsOf = (source: string) =>
  fleet.query<EventRow>(
    "SELECT delivery_key, source, via FROM inbound_events WHERE source = ? ORDER BY received_at",
    source
  );
let projectId = "";
const pollNow = () =>
  send("POST", `/api/projects/${projectId}/ingress/github/poll`);
const relays = () =>
  send<RelayView[]>("GET", `/api/projects/${projectId}/relays`);
const make = (body: object) =>
  send<Created>("POST", `/api/projects/${projectId}/relays`, body);
const setSecret = (id: string, secret: string) =>
  send<RelayView>("PUT", `/api/relays/${id}/secret`, { secret });

/** A chunked POST whose body passes the cap and never ends: the status line, or what happened. */
const unendingChunked = (path: string) =>
  new Promise<string>((resolve) => {
    const socket = connect(RELAY_PORT, "127.0.0.1");
    let got = "";
    const done = (said: string) => {
      resolve(said);
      socket.destroy();
    };
    const timer = setTimeout(
      () => done(`no answer in 15 s (${got.length} bytes)`),
      15_000
    );
    socket.on("error", () => undefined);
    socket.on("data", (data) => {
      got += data.toString("latin1");
      if (got.includes("\r\n")) {
        clearTimeout(timer);
        done(got.split("\r\n")[0] ?? "");
      }
    });
    socket.on("close", () => {
      clearTimeout(timer);
      done(got.split("\r\n")[0] || "closed with no answer");
    });
    socket.write(
      `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`
    );
    const chunk = Buffer.alloc(64 * 1024, 97);
    for (let sent = 0; sent <= RELAY_BODY_MAX; sent += chunk.length) {
      socket.write(`${chunk.length.toString(16)}\r\n`);
      socket.write(chunk);
      socket.write("\r\n");
    }
    // No terminating 0-length chunk: the body is never whole.
  });

/** A request with a declared length over the cap, and no body sent. */
const declaredOver = (path: string) =>
  new Promise<string>((resolve) => {
    const socket = connect(RELAY_PORT, "127.0.0.1");
    let got = "";
    const timer = setTimeout(() => {
      resolve("no answer in 10 s");
      socket.destroy();
    }, 10_000);
    socket.on("error", () => undefined);
    socket.on("data", (data) => {
      got += data.toString("latin1");
      if (got.includes("\r\n")) {
        clearTimeout(timer);
        resolve(got.split("\r\n")[0] ?? "");
        socket.destroy();
      }
    });
    socket.write(
      `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${RELAY_BODY_MAX + 1}\r\n\r\n`
    );
  });

// ── The run ──────────────────────────────────────────────────────────────────
let stripe = "";
let generic = "";
let githubRelay = "";
let mintedSecret = "";

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo relay > README.md && git add -A && git commit -qm 'First commit' && git remote add origin https://github.com/${REPO}.git`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Relay",
    machineId: MACHINE,
    cwd: src,
    caw: false,
  });
  projectId = project.id;
  await until(
    "the project's remote",
    () =>
      fleet.query<{ remote: string | null }>(
        "SELECT remote FROM projects WHERE id = ?",
        projectId
      )[0]?.remote,
    (remote) => remote === `github.com/${REPO}`,
    60_000
  );
  await fleet.api("/api/connections", {
    name: "gh-probe",
    service: "github",
    account: "probe",
    transport: "http",
    url: `${API}/mcp`,
    auth: "bearer",
  });
  await send("PUT", "/api/connections/gh-probe/key", { key: TOKEN });
  await send("PUT", `/api/projects/${projectId}/ingress/github`, {
    connection: "gh-probe",
  });
  // The poller's first poll only sets its mark.
  await pollNow();

  check(
    "4: with no relay ever made, the hub never runs tailscale",
    (await tsCalls()).length === 0,
    `${(await tsCalls()).length} calls`
  );

  // ── 4: Funnel's states ───────────────────────────────────────────────────
  await section("4: Funnel", async () => {
    await setMode("serve10000");
    const made = await make({ provider: "stripe" });
    stripe = made.relay.id;
    const calls = await tsCalls();
    check(
      "4: a private Serve on port 10000 is refused: needs-owner, and no funnel command runs",
      made.relay.state === "needs-owner" &&
        (made.relay.reason ?? "").includes(
          "served privately with Tailscale Serve"
        ) &&
        !calls.some((call) => call.includes("--bg")),
      `${made.relay.state}: ${made.relay.reason} | calls ${JSON.stringify(calls)}`
    );

    await setMode("denied");
    let view = await setSecret(stripe, STRIPE_SECRET);
    check(
      "4: no operator: needs-owner with the exact command",
      view.state === "needs-owner" &&
        (view.reason ?? "").includes("sudo tailscale set --operator="),
      `${view.state}: ${view.reason}`
    );

    await setMode("not-enabled");
    const before = Date.now();
    view = await setSecret(stripe, STRIPE_SECRET);
    check(
      "4: Funnel not enabled: needs-owner with the approval URL, after the CLI's wait is cut",
      view.state === "needs-owner" &&
        (view.reason ?? "").includes(
          "https://login.tailscale.com/f/funnel?node=nPROBE"
        ),
      `${view.state} after ${Date.now() - before} ms: ${view.reason}`
    );

    await setMode("ok");
    view = await setSecret(stripe, STRIPE_SECRET);
    const applied = (await tsCalls()).filter((call) => call.includes("--bg"));
    const expected = `funnel --bg --https=10000 --set-path=/hooks/ http://127.0.0.1:${RELAY_PORT}/hooks`;
    check(
      "4: applied with the exact command line, and status read back into the public URL",
      applied.at(-1) === expected &&
        view.state === "live" &&
        view.publicUrl === `https://${TS_HOST}:10000/hooks/${stripe}`,
      `last apply “${applied.at(-1)}”; ${view.state} ${view.publicUrl}`
    );
  });

  // ── 5 (part) and 1: GitHub ─────────────────────────────────────────────
  await section("5: GitHub registration", async () => {
    const made = await make({ provider: "github" });
    githubRelay = made.relay.id;
    const hook = gh.hooks.at(-1);
    mintedSecret = hook?.secret ?? "";
    check(
      "5: the webhook is registered through the connection with the minted secret, and GitHub's ping lands as the test delivery",
      hook?.url === `https://${TS_HOST}:10000/hooks/${githubRelay}` &&
        JSON.stringify(hook.events) ===
          JSON.stringify(["pull_request", "issues", "issue_comment"]) &&
        mintedSecret.length === 64 &&
        made.relay.state === "live" &&
        made.relay.registered &&
        made.relay.testedAt !== null &&
        made.suggestedRoutes.source === SOURCE,
      `${made.relay.state}, registered ${made.relay.registered}, tested ${made.relay.testedAt}; hook ${hook?.url}; suggested ${made.suggestedRoutes.source}`
    );
  });

  const merged = (number: number) => {
    const t = iso();
    return { number, created: t, updated: t, closed: t, merged: t };
  };
  const mergeBody = (pr: Pull) =>
    JSON.stringify({
      action: "closed",
      pull_request: pullJson(pr),
      repository: { full_name: REPO },
    });
  const path = (id: string) => `/hooks/${id}`;

  await section("1: GitHub deliveries land once", async () => {
    const pr7 = merged(7);
    const body = mergeBody(pr7);
    const first = await deliver(
      path(githubRelay),
      body,
      signedGitHub(mintedSecret, "pull_request", body)
    );
    const again = await deliver(
      path(githubRelay),
      body,
      signedGitHub(mintedSecret, "pull_request", body)
    );
    const rows = () =>
      eventsOf(SOURCE).filter((row) => row.delivery_key.startsWith("pr:7:"));
    check(
      "1: a signed pull_request closed+merged lands once (202, empty body); the same delivery again adds nothing",
      first.status === 202 &&
        first.body === "" &&
        again.status === 202 &&
        rows().length === 1 &&
        rows()[0]?.delivery_key === "pr:7:merged" &&
        rows()[0]?.via === "webhook",
      `${first.status}/${again.status}; rows ${JSON.stringify(rows())}`
    );
    gh.pulls.push(pr7);
    await pollNow();
    await pollNow();
    check(
      "1: the poller then seeing that merge adds nothing",
      rows().filter((row) => row.delivery_key === "pr:7:merged").length === 1 &&
        rows().every(
          (row) => row.delivery_key !== "pr:7:opened" || row.via === "poll"
        ),
      JSON.stringify(rows())
    );
    const pr8 = merged(8);
    gh.pulls.push(pr8);
    await pollNow();
    const body8 = mergeBody(pr8);
    const late = await deliver(
      path(githubRelay),
      body8,
      signedGitHub(mintedSecret, "pull_request", body8)
    );
    const rows8 = eventsOf(SOURCE).filter(
      (row) => row.delivery_key === "pr:8:merged"
    );
    check(
      "1: the other order: polled first, then the webhook: one row, its via poll",
      late.status === 202 && rows8.length === 1 && rows8[0]?.via === "poll",
      `${late.status}; ${JSON.stringify(rows8)}`
    );
  });

  // ── 2: signatures ─────────────────────────────────────────────────────────
  await section("2: signatures", async () => {
    const pr9 = merged(9);
    const body = mergeBody(pr9);
    const bad = await deliver(
      path(githubRelay),
      body,
      signedGitHub("not-the-secret", "pull_request", body)
    );
    check(
      "2: a bad GitHub signature is 401 with an empty body, and nothing lands",
      bad.status === 401 &&
        bad.body === "" &&
        eventsOf(SOURCE).every((row) => !row.delivery_key.startsWith("pr:9:")),
      `${bad.status} “${bad.body}”`
    );
    const stripeBody = (id: string) =>
      JSON.stringify({
        id,
        object: "event",
        type: "invoice.paid",
        created: Math.floor(Date.now() / 1000),
      });
    const stripeHeaders = (payload: string, stamp: number) => ({
      "content-type": "application/json",
      "stripe-signature": `t=${stamp},v1=${hmac(STRIPE_SECRET, `${stamp}.${payload}`)}`,
    });
    const now = Math.floor(Date.now() / 1000);
    const oldBody = stripeBody("evt_old");
    const old = await deliver(
      path(stripe),
      oldBody,
      stripeHeaders(oldBody, now - 301)
    );
    const freshBody = stripeBody("evt_1");
    const fresh = await deliver(
      path(stripe),
      freshBody,
      stripeHeaders(freshBody, now)
    );
    const repeat = await deliver(
      path(stripe),
      freshBody,
      stripeHeaders(freshBody, now)
    );
    const stripeRows = eventsOf(`hook:${stripe}`);
    check(
      "2: Stripe: correctly signed but 301 s old is 401; a fresh one lands once, keyed by its id",
      old.status === 401 &&
        fresh.status === 202 &&
        repeat.status === 202 &&
        stripeRows.length === 1 &&
        stripeRows[0]?.delivery_key === "evt_1",
      `${old.status}/${fresh.status}/${repeat.status}; ${JSON.stringify(stripeRows)}`
    );

    const made = await make({
      provider: "generic",
      signatureHeader: "X-Probe-Signature",
      timestampHeader: "X-Probe-Time",
      idPath: "event.id",
    });
    generic = made.relay.id;
    const waiting = made.relay;
    const view = await setSecret(generic, GENERIC_SECRET);
    const genericBody = JSON.stringify({
      event: { id: "g-1", what: "deployed" },
    });
    const t = String(Math.floor(Date.now() / 1000));
    const signed = {
      "content-type": "application/json",
      "x-probe-time": t,
      "x-probe-signature": hmac(GENERIC_SECRET, `${t}.${genericBody}`),
    };
    const noHeader = await deliver(path(generic), genericBody, {
      "content-type": "application/json",
      "x-probe-time": t,
    });
    const landed = await deliver(path(generic), genericBody, signed);
    const genericRows = eventsOf(`hook:${generic}`);
    check(
      "2: generic: without its header 401; signed in X-Probe-Signature over <timestamp>.<body> it lands, keyed by event.id",
      waiting.state === "needs-owner" &&
        (waiting.reason ?? "").includes(`cawco relay set-secret ${generic}`) &&
        view.state === "live" &&
        noHeader.status === 401 &&
        landed.status === 202 &&
        genericRows.length === 1 &&
        genericRows[0]?.delivery_key === "g-1",
      `before the secret: ${waiting.state} (${waiting.reason}); ${noHeader.status}/${landed.status}; ${JSON.stringify(genericRows)}`
    );
  });

  // ── 3: the listener's edges ───────────────────────────────────────────────
  await section("3: the receiver answers one path", async () => {
    const unending = await unendingChunked(path(generic));
    const declared = await declaredOver(path(generic));
    check(
      "3: 1 MiB + 1 is 413 while the body is still coming (chunked, never ended), and a declared 1 MiB + 1 is 413 before any byte",
      unending.includes(" 413") && declared.includes(" 413"),
      `chunked: “${unending}”; declared: “${declared}”`
    );
    const unknown = await deliver("/hooks/AAAAAAAAAAAAAAAAAAAAAA", "{}", {
      "content-type": "application/json",
    });
    const other = await deliver("/nothing/here", "{}", {
      "content-type": "application/json",
    });
    const got = await deliver(path(generic), "", {}, "GET");
    const api = await deliver("/api/agents", "", {}, "GET");
    const health = await deliver("/health", "", {}, "GET");
    const hubApi = await fetch(`${fleet.base}/api/agents`);
    const same = [unknown, other, got, api, health].every(
      (one) =>
        one.status === 404 && one.body === "" && one.headers === unknown.headers
    );
    check(
      "3: an unknown id, any other path, GET /hooks/<id> and the hub API's routes are the same empty 404 here",
      same && hubApi.status === 200,
      `${[unknown, other, got, api, health].map((one) => `${one.status} “${one.body}” [${one.headers}]`).join(" | ")}; hub API on its own port ${hubApi.status}`
    );
    const limited = await make({
      provider: "generic",
      signatureHeader: "X-Probe-Signature",
    });
    const statuses: number[] = [];
    for (let at = 0; at < 61; at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one request after another, inside a minute
      const answered = await deliver(path(limited.relay.id), "{}", {
        "content-type": "application/json",
      });
      statuses.push(answered.status);
    }
    check(
      "3: the 61st request to one relay in a minute is 429 (the 60 before it reach the signature check)",
      statuses.slice(0, 60).every((one) => one === 401) && statuses[60] === 429,
      `first 60: ${[...new Set(statuses.slice(0, 60))].join(",")}; 61st ${statuses[60]}`
    );
    await send("DELETE", `/api/relays/${limited.relay.id}`);
  });

  // ── 6: a session's relay_create waits for the owner ──────────────────────
  await section("6: a session asks the owner", async () => {
    const session = await fleet.spawn("claude", "Relay asker", src, {
      projectId,
    });
    const credential = await credentialOf(session);
    const door = (args: object) =>
      fetch(`${fleet.base}/api/delegation/call/${session}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "relay_create", arguments: args }),
        signal: AbortSignal.timeout(180_000),
      }).then(async (response) => ({
        status: response.status,
        text: await response.text(),
      }));
    const asked = door({
      provider: "generic",
      signature_header: "X-Asked-Signature",
    });
    const ask = await until(
      "the relay_create ask",
      () =>
        send<
          {
            requestId: string;
            payload: { input?: Record<string, unknown>; toolName?: string };
          }[]
        >("GET", "/api/pending"),
      (pending) =>
        pending.some(
          (one) => one.payload.toolName === "mcp__cawco__relay_create"
        ),
      60_000
    ).then((pending) =>
      pending.find((one) => one.payload.toolName === "mcp__cawco__relay_create")
    );
    const before = (await relays()).length;
    const shown = String(ask?.payload.input?.public ?? "");
    await fleet.control(session, "resolvePermission", [
      ask?.requestId,
      { behavior: "allow", updatedInput: ask?.payload.input ?? {} },
    ]);
    const approved = await asked;
    const after = await relays();
    check(
      "6: relay_create parks for the owner showing what goes public, nothing made meanwhile; approved, it is made",
      shown.includes("Approving opens one public HTTPS path") &&
        shown.includes("Tailscale Funnel, port 10000") &&
        before === after.length - 1 &&
        approved.status === 200 &&
        approved.text.includes("needs-owner") &&
        !approved.text.includes(GENERIC_SECRET),
      `shown “${shown.slice(0, 160)}…”; ${before} → ${after.length}; ${approved.status} ${approved.text.slice(0, 200)}`
    );
    const second = door({ provider: "generic", signature_header: "X-Denied" });
    const denyAsk = await until(
      "the second ask",
      () =>
        send<{ requestId: string; payload: { toolName?: string } }[]>(
          "GET",
          "/api/pending"
        ),
      (pending) =>
        pending.some(
          (one) => one.payload.toolName === "mcp__cawco__relay_create"
        ),
      60_000
    ).then((pending) =>
      pending.find((one) => one.payload.toolName === "mcp__cawco__relay_create")
    );
    await fleet.control(session, "resolvePermission", [
      denyAsk?.requestId,
      { behavior: "deny", message: "not now" },
    ]);
    const denied = await second;
    check(
      "6: denied, nothing is made and the session hears why",
      (await relays()).length === after.length &&
        denied.text.includes("declined opening this relay") &&
        denied.text.includes("not now"),
      `${denied.status} ${denied.text.slice(0, 200)}`
    );
    const sessionMade = (await relays()).filter(
      (one) =>
        one.state !== "off" &&
        one.id !== stripe &&
        one.id !== generic &&
        one.id !== githubRelay
    );
    await Promise.all(
      sessionMade.map((one) => send("DELETE", `/api/relays/${one.id}`))
    );
  });

  // ── 5: removal deletes the hook; a refused registration says what to paste ──
  await section("5: removal and refusal", async () => {
    const removed = await send<{ github: string; relay: RelayView }>(
      "DELETE",
      `/api/relays/${githubRelay}`
    );
    const hookId = String(gh.hooks.at(-1)?.id);
    const after = await deliver(
      path(githubRelay),
      "{}",
      signedGitHub(mintedSecret, "ping", "{}")
    );
    check(
      "5: removing the relay deletes the GitHub webhook, and its path answers 404",
      gh.deleted.includes(hookId) &&
        removed.relay.state === "off" &&
        after.status === 404,
      `${removed.github}; deleted ${JSON.stringify(gh.deleted)}; then ${after.status}`
    );
    gh.refuseHooks = true;
    const refused = await make({ provider: "github" });
    check(
      "5: a registration GitHub refuses: needs-owner, saying what to paste where",
      refused.relay.state === "needs-owner" &&
        (refused.relay.reason ?? "").includes(
          `https://github.com/${REPO}/settings/hooks/new`
        ) &&
        (refused.relay.reason ?? "").includes(
          `Payload URL https://${TS_HOST}:10000/hooks/${refused.relay.id}`
        ) &&
        (refused.relay.reason ?? "").includes(
          `cawco relay set-secret ${refused.relay.id}`
        ),
      `${refused.relay.state}: ${refused.relay.reason}`
    );
    await send("DELETE", `/api/relays/${refused.relay.id}`);
  });

  // ── 4b: the last relay off takes Funnel's mount down ────────────────────
  await section("4b: off", async () => {
    await send("DELETE", `/api/relays/${stripe}`);
    const middle = (await tsCalls()).filter((call) => call.endsWith(" off"));
    await send("DELETE", `/api/relays/${generic}`);
    const offs = (await tsCalls()).filter((call) => call.endsWith(" off"));
    const served = JSON.parse(
      await readFile(join(tsDir, "serve.json"), "utf8")
    ) as { AllowFunnel?: Record<string, boolean> };
    check(
      "4: the mount stays while a relay wants it; the last one off runs `tailscale funnel --https=10000 --set-path=/hooks/ off` once",
      middle.length === 0 &&
        offs.length === 1 &&
        offs[0] === "funnel --https=10000 --set-path=/hooks/ off" &&
        !served.AllowFunnel?.[`${TS_HOST}:10000`],
      `offs ${JSON.stringify(offs)}; funnel ${JSON.stringify(served.AllowFunnel)}`
    );
  });

  // ── 7: no secret anywhere a session or a log reads ───────────────────────
  await section("7: no secret on disk", async () => {
    const needles = {
      token: TOKEN,
      minted: mintedSecret,
      stripe: STRIPE_SECRET,
      generic: GENERIC_SECRET,
    };
    const found: string[] = [];
    for (const [name, needle] of Object.entries(needles)) {
      if (!needle) {
        found.push(`${name}: never captured`);
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one secret at a time
      const grep = await Bun.$`grep -rlaF -- ${needle} ${fleet.sandbox} ${home}`
        .nothrow()
        .quiet();
      if (grep.exitCode > 1) {
        throw new Error(`grep failed: ${grep.stderr.toString()}`);
      }
      found.push(
        ...grep.stdout
          .toString()
          .split("\n")
          .filter(Boolean)
          .map((file) => `${name}: ${file}`)
      );
    }
    check(
      "7: the GitHub token, the minted webhook secret and the Stripe and generic secrets are in no file under the sandbox and HOME (database, logs, sessions)",
      found.length === 0,
      found.length ? found.join(", ") : `searched ${fleet.sandbox} and ${home}`
    );
  });
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  console.log(`tailscale calls: ${JSON.stringify(await tsCalls())}`);
  console.log(
    `relays: ${JSON.stringify(fleet.query("SELECT id, provider, state, reason, public_url, hook_id FROM relays ORDER BY created_at"), null, 1)}`
  );
  if (failed) {
    const log = await fleet.logs("hub");
    console.log(
      log
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-60)
        .join("\n")
    );
  }
  await fleet.close();
  fake.stop(true);
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);

/** A process and everything under it, from /proc (as probe-connections reads a session's tree). */
async function treeOf(pid: number): Promise<number[]> {
  const children = new Map<number, number[]>();
  for (const entry of await readdir("/proc")) {
    const id = Number(entry);
    if (!Number.isInteger(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
    const stat = await readFile(`/proc/${id}/stat`, "utf8").catch(() => "");
    const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    children.set(parent, [...(children.get(parent) ?? []), id]);
  }
  const out = [pid];
  // An array's iterator reads its length each step, so the children pushed are walked too.
  for (const at of out) {
    out.push(...(children.get(at) ?? []));
  }
  return out;
}

/** A running session's credential, from the MCP config its process was started with. */
async function credentialOf(instanceId: string): Promise<string> {
  return await until(
    "the session's credential",
    async () => {
      const roots = await fleet.heldProcs();
      const pids = (
        await Promise.all(roots.map((root) => treeOf(root.pid)))
      ).flat();
      const cmdlines = await Promise.all(
        pids.map((pid) =>
          readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
        )
      );
      const files = cmdlines
        .filter((cmdline) => cmdline.includes(instanceId))
        .map((cmdline) => {
          const args = cmdline.split("\0");
          return args[args.indexOf("--mcp-config") + 1];
        })
        .filter((file): file is string => Boolean(file));
      const texts = await Promise.all(
        files.map((file) => readFile(file, "utf8").catch(() => ""))
      );
      return (
        texts.map((text) => CREDENTIAL.exec(text)?.[1]).find(Boolean) ?? ""
      );
    },
    Boolean,
    60_000
  );
}
