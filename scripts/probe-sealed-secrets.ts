/**
 * Probe: every secret the hub keeps is sealed at rest (secret-box.ts), the
 * plain values an older hub left are sealed in place at start
 * (db/seal-at-rest.ts), every feature that reads one still works, and a
 * connection's key reaches the hub from the owner's terminal only
 * (`cawco connections set-key`). On a scratch hub (scratch-fleet.ts).
 *
 * 1. A hub that has run once is stopped, and plain secrets are written into
 *    its database as a hub before sealing kept them: the OpenRouter key, the
 *    supervisor's key, a phone's pairing secret and push key, and a fleet MCP
 *    server whose config carries a header key and whose OAuth row holds
 *    tokens issued by this probe's own authorization server.
 * 2. First restart: the hub logs what it sealed, and the database file holds
 *    none of the values as plain text.
 *    - OpenRouter reads connected (its suggest setting takes a write only
 *      when the key opens), and its sealed value opens to the original.
 *    - The supervisor's config, saved without a key, keeps the stored one:
 *      the hub read it and wrote it back sealed, and it opens to the
 *      original.
 *    - A test push reaches Cawrier (a stand-in here) with the pairing
 *      secret, and its alert opens under the device's key.
 *    - The fleet MCP server's access token is revoked; a request through
 *      the hub's forwarder refreshes it in the hub and arrives with the
 *      header from the sealed config.
 * 3. Second restart: nothing is sealed again (every sealed value the same
 *    bytes) and every feature still works.
 * 4. The key file replaced: each sealed value reads as no secret (OpenRouter
 *    not connected, no phone, the fleet server gone), and the hub runs.
 * 5. `cawco connections set-key`: piped and at a terminal (a pty), the key
 *    reaches the hub, the connection reads signed in, the key is sealed,
 *    the terminal never shows it; inside a session it refuses.
 *
 * Run from the repo root:
 *   bun scripts/probe-sealed-secrets.ts [--keep]
 */
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeSecretBox } from "../packages/hub/src/secret-box";
import { type Reply, scratchFleet } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

const token = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const OPENROUTER_KEY = token("sk-or-v1-probe");
const SUPERVISOR_KEY = token("sup-probe");
const PUSH_SECRET = randomBytes(32).toString("base64url");
const PUSH_KEY = randomBytes(32).toString("base64");
const HEADER_KEY = token("hdr-probe");
const CLIENT_SECRET = token("cs-probe");
const CLI_KEYS = { piped: token("cli-piped"), typed: token("cli-typed") };
const PAIRING = crypto.randomUUID();
const BEARER = /^Bearer /;
const TRAILING = /\r?\n$/;
const LOGGED = /seal|secret|error|push|fleet-mcp/i;

// ── A stand-in for Cawrier, and an MCP server with its OAuth server ────────
const pushes: { secret: string; alert: string }[] = [];
const issued = { access: new Set<string>(), refresh: new Set<string>() };
let refreshes = 0;
const headersSeen: string[] = [];
const bearersSeen = new Map<string, string>([
  [CLI_KEYS.piped, "piped"],
  [CLI_KEYS.typed, "typed"],
]);

/** The `e` field anywhere in a push body: its sealed alert. */
const sealedAlert = (node: unknown): string | undefined => {
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "e" && typeof value === "string") {
        return value;
      }
      const found = sealedAlert(value);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};

/** An alert sealed under the device's key (push.ts `seal`): IV ‖ ciphertext ‖ tag, base64. */
const openAlert = async (sealed: string): Promise<string> => {
  const raw = Buffer.from(sealed, "base64");
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(PUSH_KEY, "base64"),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.subarray(0, 12), tagLength: 128 },
    key,
    raw.subarray(12)
  );
  return new TextDecoder().decode(plain);
};

const rpc = (id: unknown, result: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result });

/** The tiny MCP server: initialize, and tools/list with one tool. */
const mcp = (message: { id?: unknown; method?: string }) => {
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  if (message.method === "initialize") {
    return rpc(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "probe", version: "1" },
    });
  }
  return rpc(message.id, {
    tools: [
      {
        name: "echo",
        description: "Echo.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  });
};

const tokens = () => {
  const access = token("at");
  const refresh = token("rt");
  issued.access.add(access);
  issued.refresh.add(refresh);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh,
  };
};

const services = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const base = url.origin;
    const bearer = (request.headers.get("authorization") ?? "").replace(
      BEARER,
      ""
    );
    switch (url.pathname) {
      case "/v1/push": {
        const body = await request.json();
        const alert = sealedAlert(body);
        pushes.push({
          secret: bearer,
          alert: alert ? await openAlert(alert).catch(() => "") : "",
        });
        return Response.json({ ok: true });
      }
      case "/.well-known/oauth-protected-resource/mcp/oauth":
      case "/.well-known/oauth-protected-resource":
        return Response.json({
          resource: `${base}/mcp/oauth`,
          authorization_servers: [base],
        });
      case "/.well-known/oauth-authorization-server":
        return Response.json(serverMetadata(base));
      case "/token": {
        const form = new URLSearchParams(await request.text());
        if (
          form.get("grant_type") !== "refresh_token" ||
          !issued.refresh.has(form.get("refresh_token") ?? "")
        ) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        refreshes += 1;
        return Response.json(tokens());
      }
      case "/mcp/oauth": {
        if (!issued.access.has(bearer)) {
          return new Response("sign in", {
            status: 401,
            headers: {
              "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp/oauth"`,
            },
          });
        }
        headersSeen.push(request.headers.get("x-probe") ?? "");
        return mcp(await request.json());
      }
      case "/mcp/key": {
        if (!bearersSeen.has(bearer)) {
          return new Response("no key", { status: 401 });
        }
        return mcp(await request.json());
      }
      default:
        return new Response("not found", { status: 404 });
    }
  },
});
const SERVICES = `http://127.0.0.1:${services.port}`;
const serverMetadata = (base: string) => ({
  issuer: base,
  authorization_endpoint: `${base}/authorize`,
  token_endpoint: `${base}/token`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
});

// ── The scratch hub ────────────────────────────────────────────────────────
const fleet = await scratchFleet({
  name: "probe-sealed-secrets",
  respond: (): Reply => ({ everyMs: 5, words: ["ok"] }),
});
fleet.env.CAWCO_CAWRIER_ORIGIN = SERVICES;
const dbPath = join(fleet.sandbox, "hub", "hub.db");
const keyPath = join(fleet.sandbox, "hub", "secrets.key");
const PLAIN = [
  OPENROUTER_KEY,
  SUPERVISOR_KEY,
  PUSH_SECRET,
  PUSH_KEY,
  HEADER_KEY,
  CLIENT_SECRET,
];
/** Every plain secret the database file holds, read as bytes with its WAL. */
const plainInDb = async (): Promise<string[]> => {
  const bytes = Buffer.concat(
    await Promise.all(
      ["", "-wal"].map((suffix) =>
        readFile(`${dbPath}${suffix}`).catch(() => Buffer.from(""))
      )
    )
  );
  return [
    ...PLAIN,
    ...issued.access,
    ...issued.refresh,
    ...Object.values(CLI_KEYS),
  ].filter((secret) => bytes.includes(secret));
};
/**
 * The stored value of each secret column nothing writes at start, as the
 * database holds it. Not `fleet_mcp_oauth`: the hub looks at each fleet MCP
 * server as it starts and saves its OAuth row again (fleet-mcp.ts `probe`),
 * sealed afresh, which is the feature writing, not the migration.
 */
const stored = () =>
  fleet
    .query<{ v: string | null }>(
      `SELECT api_key AS v FROM openrouter_connection
     UNION ALL SELECT api_key FROM supervisor_config
     UNION ALL SELECT secret FROM push_devices
     UNION ALL SELECT key FROM push_devices
     UNION ALL SELECT config FROM mcp_servers`
    )
    .map((row) => row.v ?? "");
/** `fleet_mcp_oauth`'s secret columns as stored: each must carry the box's mark. */
const oauthStored = () =>
  fleet
    .query<{ v: string | null }>(
      `SELECT tokens AS v FROM fleet_mcp_oauth
     UNION ALL SELECT token_client FROM fleet_mcp_oauth
     UNION ALL SELECT client FROM fleet_mcp_oauth`
    )
    .map((row) => row.v ?? "");
const opened = (sealed: string | undefined) =>
  sealed ? makeSecretBox(keyPath).open(sealed) : "";
const hubLog = () => fleet.logs("hub");
/** A hub route's answer: its status and its body's text. */
const json = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, body: await response.text() };
};

/** The plain rows an older hub kept, written beside a stopped hub. */
const writePlain = () => {
  const sqlite = new Database(dbPath);
  const now = Date.now();
  sqlite
    .query(
      "INSERT INTO openrouter_connection (id, api_key, connected_at) VALUES ('openrouter', ?, ?)"
    )
    .run(OPENROUTER_KEY, now);
  sqlite
    .query(
      "INSERT INTO supervisor_config (id, enabled, base_url, model, api_key, cawco_todos, updated_at) VALUES ('supervisor', 0, ?, 'probe-model', ?, 0, ?) ON CONFLICT(id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model, api_key = excluded.api_key"
    )
    .run(SERVICES, SUPERVISOR_KEY, now);
  sqlite
    .query(
      "INSERT INTO push_devices (pairing_id, secret, key, name, platform, quiet, created_at, updated_at) VALUES (?, ?, ?, 'Probe phone', 'ios', 0, ?, ?)"
    )
    .run(PAIRING, PUSH_SECRET, PUSH_KEY, now, now);
  const config = {
    type: "http",
    url: `${SERVICES}/mcp/oauth`,
    headers: { "X-Probe": HEADER_KEY },
  };
  sqlite
    .query(
      "INSERT INTO mcp_servers (name, config, auth_mode, enabled, created_at) VALUES ('probe-oauth', ?, 'oauth', 1, ?)"
    )
    .run(JSON.stringify(config), now);
  const client = {
    client_id: "probe-client",
    client_secret: CLIENT_SECRET,
    redirect_uris: [`${fleet.base}/oauth/mcp`],
  };
  sqlite
    .query(
      "INSERT INTO fleet_mcp_oauth (name, generation, upstream, resource, issuer, metadata, client, tokens, token_client) VALUES ('probe-oauth', ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      crypto.randomUUID(),
      config.url,
      JSON.stringify({
        resource: `${SERVICES}/mcp/oauth`,
        authorization_servers: [SERVICES],
      }),
      SERVICES,
      JSON.stringify(serverMetadata(SERVICES)),
      JSON.stringify(client),
      JSON.stringify(tokens()),
      JSON.stringify(client)
    );
  sqlite.close();
};

/** Each feature that reads a sealed secret, used once. */
const features = async (round: string) => {
  const suggest = await json("PUT", "/api/jev/suggest", {
    enabled: true,
  });
  const status = JSON.parse((await json("GET", "/api/openrouter")).body) as {
    connected: boolean;
  };
  check(
    `${round}: OpenRouter reads connected, and its key opens to the original`,
    status.connected &&
      suggest.status === 200 &&
      opened(
        fleet.query<{ api_key: string }>(
          "SELECT api_key FROM openrouter_connection"
        )[0]?.api_key
      ) === OPENROUTER_KEY,
    `connected ${status.connected}, suggest ${suggest.status}`
  );
  const before = fleet.query<{ api_key: string }>(
    "SELECT api_key FROM supervisor_config"
  )[0]?.api_key;
  const saved = await json("PUT", "/api/supervisor/config", {
    enabled: false,
    baseUrl: SERVICES,
    model: "probe-model",
  });
  const after = fleet.query<{ api_key: string }>(
    "SELECT api_key FROM supervisor_config"
  )[0]?.api_key;
  check(
    `${round}: the supervisor's key, read and written back by the hub, opens to the original`,
    saved.status === 200 &&
      after !== undefined &&
      after !== before &&
      opened(after) === SUPERVISOR_KEY,
    `saved ${saved.status}; the row was ${after === before ? "not " : ""}rewritten`
  );
  const pushed = pushes.length;
  const test = await json("POST", "/api/push/test", { pairingId: PAIRING });
  const last = pushes.at(-1);
  check(
    `${round}: a test push reaches Cawrier with the pairing secret, sealed under the device's key`,
    test.status === 200 &&
      pushes.length === pushed + 1 &&
      last?.secret === PUSH_SECRET &&
      Boolean(last?.alert.includes("end to end encrypted")),
    `${test.status} ${test.body.slice(0, 160)}`
  );
  issued.access.clear();
  const refreshed = refreshes;
  const seen = headersSeen.length;
  const forwarded = await fetch(`${fleet.base}/mcp/fleet/probe-oauth`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "probe", version: "1" },
      },
    }),
  });
  await forwarded.text();
  check(
    `${round}: a revoked fleet MCP token is refreshed in the hub, and the call carries the sealed config's header`,
    forwarded.status === 200 &&
      refreshes === refreshed + 1 &&
      headersSeen.slice(seen).includes(HEADER_KEY),
    `${forwarded.status}; refreshes ${refreshed} → ${refreshes}; header ${headersSeen.at(-1) === HEADER_KEY ? "arrived" : "missing"}`
  );
};

/** `cawco connections set-key <name>`, piped, at a terminal, or as a session would run it. */
const cli = async (
  name: string,
  how: "piped" | "typed" | "in-session"
): Promise<{ code: number; out: string }> => {
  // The owner's own terminal: none of a session's identity in it.
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          entry[0] !== "CAWCO_INSTANCE_ID" &&
          entry[0] !== "CAWCO_SESSION_CREDENTIAL"
      )
    ),
    CAWCO_HUB_URL: fleet.base,
  };
  const command = [
    process.execPath,
    "packages/cli/src/cli.ts",
    "connections",
    "set-key",
    name,
    "--hub",
    fleet.base,
  ];
  if (how === "typed") {
    // A pty: the CLI reads with nothing echoed; the probe types once it asks.
    const helper = join(fleet.sandbox, "pty.py");
    await writeFile(
      helper,
      [
        "import os, pty, sys, time",
        "key = sys.argv[1]; argv = sys.argv[2:]",
        "pid, fd = pty.fork()",
        "if pid == 0:",
        "    os.execvp(argv[0], argv)",
        "out = b''",
        "typed = False",
        "while True:",
        "    try:",
        "        chunk = os.read(fd, 4096)",
        "    except OSError:",
        "        break",
        "    if not chunk:",
        "        break",
        "    out += chunk",
        "    if not typed and b'(not shown): ' in out:",
        "        typed = True",
        "        for c in key:",
        "            os.write(fd, c.encode()); time.sleep(0.005)",
        "        os.write(fd, b'\\r')",
        "_, status = os.waitpid(pid, 0)",
        "sys.stdout.write(out.decode(errors='replace'))",
        "sys.exit(os.waitstatus_to_exitcode(status))",
      ].join("\n")
    );
    const run = Bun.spawn(
      ["python3", "-I", helper, CLI_KEYS.typed, ...command],
      {
        env,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const out =
      (await new Response(run.stdout).text()) +
      (await new Response(run.stderr).text());
    return { code: await run.exited, out };
  }
  const run = Bun.spawn(command, {
    env:
      how === "in-session"
        ? { ...env, CAWCO_INSTANCE_ID: crypto.randomUUID() }
        : env,
    stdin: new Blob([`${CLI_KEYS.piped}\n`]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out =
    (await new Response(run.stdout).text()) +
    (await new Response(run.stderr).text());
  return { code: await run.exited, out };
};

try {
  // ── 1: a hub that has run once, its database given plain secrets ──────
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.stop("hub");
  writePlain();
  check(
    "1: the stopped hub's database holds the plain secrets an older hub kept",
    (await plainInDb()).length >= PLAIN.length,
    `${(await plainInDb()).length} plain values in the file`
  );

  // ── 2: the first restart seals them in place ──────────────────────────
  fleet.launch("hub");
  await fleet.hubUp();
  const sealedLine = (await hubLog())
    .split("\n")
    .filter((line) => line.includes("[seal-at-rest]"))
    .at(-1);
  check(
    "2: the first restart seals every plain secret in place",
    Boolean(
      sealedLine?.includes("sealed in place") &&
        [
          "openrouter_connection.api_key 1",
          "supervisor_config.api_key 1",
          "push_devices.secret 1",
          "push_devices.key 1",
          "mcp_servers.config 1",
          "fleet_mcp_oauth.tokens 1",
          "fleet_mcp_oauth.client 1",
          "fleet_mcp_oauth.token_client 1",
        ].every((part) => sealedLine.includes(part))
    ),
    sealedLine ?? "(no line)"
  );
  await features("2");
  check(
    "2: the database file holds no secret in plain text",
    (await plainInDb()).length === 0,
    `holding: ${(await plainInDb()).join(", ") || "none"}`
  );

  // ── 3: the second restart seals nothing again ─────────────────────────
  const firstSealed = stored();
  await fleet.stop("hub");
  const atRest = stored();
  fleet.launch("hub");
  await fleet.hubUp();
  const againLine = (await hubLog())
    .split("\n")
    .filter((line) => line.includes("[seal-at-rest]"))
    .at(-1);
  check(
    "3: the second restart seals nothing: every secret already carries the mark, and the columns nothing rewrites at start keep their bytes",
    againLine === "[seal-at-rest] every secret is sealed already" &&
      JSON.stringify(stored()) === JSON.stringify(atRest) &&
      [...firstSealed, ...oauthStored()].every((value) =>
        value.startsWith("v1:")
      ),
    `${againLine}; ${atRest.length} values the same before and after, ${oauthStored().length} OAuth values sealed`
  );
  await features("3");
  check(
    "3: the database file still holds no secret in plain text",
    (await plainInDb()).length === 0,
    `holding: ${(await plainInDb()).join(", ") || "none"}`
  );

  // ── 5: the CLI gives a connection its key ─────────────────────────────
  for (const [name, how] of [
    ["probe-piped", "piped"],
    ["probe-typed", "typed"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one connection at a time
    await json("POST", "/api/connections", {
      name,
      service: "probe",
      account: how,
      transport: "http",
      url: `${SERVICES}/mcp/key`,
      auth: "bearer",
    });
    const ran = await cli(name, how);
    const view = (
      JSON.parse((await json("GET", "/api/connections")).body) as {
        connections: { name: string; state: string }[];
      }
    ).connections.find((one) => one.name === name);
    const secret = fleet.query<{ sealed: string }>(
      "SELECT sealed FROM connections WHERE name = ?",
      name
    )[0]?.sealed;
    check(
      `5: set-key ${how} sets the key, the connection reads signed in, and the key is sealed`,
      ran.code === 0 &&
        ran.out.includes(
          `Key set for ${name} (${CLI_KEYS[how].length} characters)`
        ) &&
        ran.out.includes("State: signed-in") &&
        !ran.out.includes(CLI_KEYS[how]) &&
        view?.state === "signed-in" &&
        Boolean(secret?.startsWith("v1:")) &&
        (JSON.parse(opened(secret)) as { key?: string }).key === CLI_KEYS[how],
      `exit ${ran.code}: ${ran.out.replace(TRAILING, "").replaceAll("\n", " | ").slice(0, 200)}`
    );
  }
  const inSession = await cli("probe-piped", "in-session");
  check(
    "5: set-key refuses to run inside a session",
    inSession.code !== 0 &&
      inSession.out.includes("never inside a CawCo session"),
    inSession.out.trim().slice(0, 200)
  );
  check(
    "5: the database file holds neither key the CLI set in plain text",
    (await plainInDb()).length === 0,
    `holding: ${(await plainInDb()).join(", ") || "none"}`
  );

  // ── 4: a key that does not open its values ────────────────────────────
  await fleet.stop("hub");
  await rm(keyPath);
  await writeFile(keyPath, randomBytes(32), { mode: 0o600 });
  fleet.launch("hub");
  await fleet.hubUp();
  const openrouter = JSON.parse(
    (await json("GET", "/api/openrouter")).body
  ) as {
    connected: boolean;
  };
  const phones = JSON.parse((await json("GET", "/api/push")).body) as {
    devices: unknown[];
  };
  const fleetConfig = JSON.parse((await json("GET", "/api/fleet")).body) as {
    config: { mcp: { name: string }[] };
  };
  const { connections } = JSON.parse(
    (await json("GET", "/api/connections")).body
  ) as { connections: { name: string; hasSecret: boolean }[] };
  check(
    "4: under another key every sealed value reads as no secret, and the hub runs",
    !openrouter.connected &&
      phones.devices.length === 0 &&
      !fleetConfig.config.mcp.some((one) => one.name === "probe-oauth") &&
      connections.every((one) => !one.hasSecret),
    `openrouter connected ${openrouter.connected}, phones ${phones.devices.length}, fleet servers ${fleetConfig.config.mcp.map((one) => one.name).join(", ") || "none"}, connections with a secret ${connections.filter((one) => one.hasSecret).length}`
  );
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  if (failed) {
    console.log(
      (await hubLog())
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-40)
        .join("\n")
    );
  }
  await fleet.close();
  await services.stop(true);
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);
