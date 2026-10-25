/**
 * Arm A7d: one summary written by OpenCode on an OpenCode Go account, the way
 * the agent runs an account's OpenCode (agent harnesses/opencode.ts):
 *
 * - its own `opencode serve --hostname=127.0.0.1 --port=<p>` (`serverLaunch`),
 *   here on scratch XDG data, config and state homes, so it holds no sign-in,
 *   no fleet config, no plugin and no MCP server but what this script puts
 *   there; `OPENCODE_CONFIG_CONTENT` denies every tool (the summariser is told
 *   "Use no tools"; here nothing it could run exists);
 * - the account's credential put on that server as `#putCredential` does:
 *   `readHeld(<account>)` and `opencodeCredentialOf(held)` from the agent's
 *   provider-accounts.ts, `POST /api/credential` with `activate`, then
 *   `POST /api/credential/<id>/activate`. A key is not refreshed, so nothing is
 *   ever written back to the account's store;
 * - the prompt sent with `opencode run --server <url> -m <model> --format json`
 *   on stdin (a summariser's input passes the 128 KB an argument may hold),
 *   and the answer read back from `GET /api/session/<id>/message`: its text,
 *   and each assistant message's tokens and cost (one message is one request).
 *
 * `--dry` puts no credential and reads none: the same server and the same
 * `opencode run`, which then stop at "Model unavailable", the plumbing proven
 * without a model call.
 *
 * Usage: bun run opencode_summarize.ts --cockpit-root R --account-dir D
 *        --model M --prompt-file F --scratch S [--opencode-bin opencode] [--dry]
 * Prints one JSON object: { ok, text, requests, error, sessionID, commands }.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--dry") {
    args.set("dry", "1");
  } else {
    args.set(argv[i].replace(/^--/, ""), argv[i + 1]);
    i += 1;
  }
}
const need = (name: string): string => {
  const value = args.get(name);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
};
const root = resolve(need("cockpit-root"));
const accountDir = resolve(need("account-dir"));
const model = need("model");
const promptFile = need("prompt-file");
const scratch = resolve(need("scratch"));
const bin = args.get("opencode-bin") ?? "opencode";
const dry = args.has("dry");

const out = (result: Record<string, unknown>): never => {
  console.log(JSON.stringify(result));
  process.exit(0);
};

const homes = {
  XDG_DATA_HOME: join(scratch, "data"),
  XDG_CONFIG_HOME: join(scratch, "config"),
  XDG_STATE_HOME: join(scratch, "state"),
};
const cwd = join(scratch, "cwd");
for (const dir of [...Object.values(homes), cwd]) {
  mkdirSync(dir, { recursive: true });
}
const password = randomBytes(16).toString("hex");
const port = (() => {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port: free } = probe;
  probe.stop(true);
  return free;
})();
const url = `http://127.0.0.1:${port}`;
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const env = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: process.env.HOME ?? "",
  ...homes,
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_SERVER_PASSWORD: password,
  OPENCODE_CONFIG_CONTENT: JSON.stringify({
    permissions: [{ action: "*", resource: "*", effect: "deny" }],
  }),
};
const commands = [
  `${bin} serve --hostname=127.0.0.1 --port=${port}   # env: XDG_{DATA,CONFIG,STATE}_HOME=${scratch}/{data,config,state} OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_SERVER_PASSWORD=<random> OPENCODE_CONFIG_CONTENT=<deny every tool>`,
  dry
    ? "# --dry: no credential is read or put"
    : `POST ${url}/api/credential  { integrationID, value } = opencodeCredentialOf(readHeld(basename($OPENCODE_ACCOUNT_DIR)))   # read from $OPENCODE_ACCOUNT_DIR/credential.json; then POST /api/credential/<id>/activate`,
  `${bin} run --server ${url} -m ${model} --format json < ${promptFile}   # cwd ${cwd}`,
  `GET ${url}/api/session/<sessionID>/message?order=asc`,
];

let held: { provider: string; credential: unknown } | undefined;
let wanted: { integrationID: string; value: unknown } | undefined;
if (!dry) {
  const { accountsRoot } = await import(`${root}/packages/core/src/paths.ts`);
  if (dirname(accountDir) !== accountsRoot()) {
    out({
      ok: false,
      commands,
      error: `--account-dir ${accountDir} is not in the agent's accounts root ${accountsRoot()}: readHeld reads only there`,
    });
  }
  const { readHeld, opencodeCredentialOf } = await import(
    `${root}/packages/agent/src/provider-accounts.ts`
  );
  held = readHeld(basename(accountDir));
  if (!held) {
    out({ ok: false, commands, error: `account ${basename(accountDir)} holds no credential on this machine` });
  }
  if (held?.provider !== "opencode-go") {
    out({ ok: false, commands, error: `account ${basename(accountDir)} holds ${held?.provider}, not opencode-go` });
  }
  wanted = opencodeCredentialOf(held);
  if (!wanted) {
    out({ ok: false, commands, error: "opencodeCredentialOf gave no credential for the account" });
  }
}

const server = Bun.spawn([bin, "serve", "--hostname=127.0.0.1", `--port=${port}`], {
  cwd,
  env,
  stdout: "pipe",
  stderr: "pipe",
});
const finish = (result: Record<string, unknown>): never => {
  server.kill();
  return out(result);
};
const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
};

try {
  const started = Date.now();
  for (;;) {
    try {
      await api("GET", "/api/credential");
      break;
    } catch (error) {
      if (Date.now() - started > 60_000) {
        throw new Error(`the scratch OpenCode server did not answer within 60 s: ${String(error)}`);
      }
      await Bun.sleep(250);
    }
  }
  if (wanted) {
    const id = `cawco-bench-${createHash("sha256").update(JSON.stringify(wanted)).digest("hex").slice(0, 16)}`;
    await api("POST", "/api/credential", {
      id,
      integrationID: wanted.integrationID,
      label: `CawCo account ${basename(accountDir)} (compaction bench)`,
      value: wanted.value,
      activate: true,
    });
    await api("POST", `/api/credential/${id}/activate`);
  }
  const run = Bun.spawn([bin, "run", "--server", url, "-m", model, "--format", "json"], {
    cwd,
    env,
    stdin: Bun.file(promptFile),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  const events = stdout
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
  const sessionID = events.find((e) => typeof e.sessionID === "string")?.sessionID as
    | string
    | undefined;
  const failed = events.filter((e) => e.type === "error");
  if (!sessionID) {
    finish({ ok: false, commands, error: `opencode run exited ${code} with no session: ${(stderr || stdout).slice(-800)}` });
  }
  const listed = await api("GET", `/api/session/${sessionID}/message?order=asc&limit=200`);
  const assistant = (listed.data as Record<string, any>[]).filter((m) => m.type === "assistant");
  const requests = assistant.map((m) => ({
    model: `${m.model?.providerID}/${m.model?.id}`,
    at: m.time?.created ?? Date.now(),
    input: m.tokens?.input ?? 0,
    output: m.tokens?.output ?? 0,
    reasoning: m.tokens?.reasoning ?? 0,
    cacheRead: m.tokens?.cache?.read ?? 0,
    cacheCreation: m.tokens?.cache?.write ?? 0,
    cacheWrite1h: 0,
    reportedUsd: m.cost ?? null,
    finish: m.finish ?? null,
    error: m.error ?? null,
  }));
  const text = assistant
    .flatMap((m) => (m.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text))
    .join("\n\n")
    .trim();
  // Outside srt only because nothing it can run exists (the config denies every tool): asserted on what it did.
  const tools = assistant.flatMap((m) =>
    (m.content ?? []).filter((c: any) => c.type === "tool").map((c: any) => c.name ?? c.tool ?? "tool")
  );
  const errors = [
    ...(tools.length ? [`a tool-less summariser called tools: ${tools.join(", ")}`] : []),
    ...failed.map((e) => JSON.stringify(e.error ?? e)),
    ...requests.filter((r) => r.error).map((r) => JSON.stringify(r.error)),
  ];
  finish({
    ok: code === 0 && errors.length === 0 && text.length > 0,
    text,
    requests,
    sessionID,
    commands,
    error: errors.length ? errors.join("; ") : code === 0 ? (text ? null : "empty answer") : `opencode run exited ${code}: ${stderr.slice(-400)}`,
  });
} catch (error) {
  finish({ ok: false, commands, error: error instanceof Error ? error.message : String(error) });
}
