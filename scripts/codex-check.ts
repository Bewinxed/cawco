/**
 * `bun scripts/codex-check.ts [--without-boundary]`: the scripted-model check
 * every Codex version bump passes before a session runs on it (core tools.ts
 * `CODEX_VERSION`, beside `bun scripts/codex-protocol.ts --check`). It runs
 * the release CawCo pins (or `CODEX_BIN`) against a scripted model
 * (CopilotKit's aimock, pinned below) on loopback, through the adapter's own
 * code (agent harnesses/codex-home.ts, codex-rpc.ts), each scenario in a
 * scratch `HOME` of its own so nothing of the machine's is read or written:
 *
 * - config: a clone with a planted `.codex/config.toml` whose MCP server
 *   writes a file outside it; marked untrusted as the adapter marks a
 *   workspace's clone, its thread starts nothing (the Codex audit's C-k3).
 * - ask: approval asks for a command and an edit reach the client and,
 *   answered, run (C-b).
 * - restart: a client that goes away with an ask open; a new one on the same
 *   app-server is handed the ask again by `thread/resume` (codex-session.ts
 *   `reopen`).
 * - boundary: a workspace's tools run in the execution environment the
 *   adapter names (`workspaceEnvironment`), its executor stood in for by
 *   bwrap: writes outside the clone fail at the file system, inside they
 *   land (C-a2). It needs namespaces; `--without-boundary` skips it, said.
 *
 * Exits non-zero when any scenario fails.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { readWithin } from "../packages/core/src/bounded";
import { type Pid, signalGroup, spawnedPid } from "../packages/core/src/signal";
import { CODEX_VERSION } from "../packages/core/src/tools";
import { systemProgram } from "../packages/core/src/workspace-needs";

const AIMOCK_VERSION = "1.48.0";
const WITHOUT_BOUNDARY = process.argv.includes("--without-boundary");

// The adapter's paths read the process's home as it started: the check runs
// itself again with a scratch HOME, so every home, store and record the
// adapter writes lands there and the machine's are never touched.
const SCRATCH = "CODEX_CHECK_SCRATCH";
if (!process.env[SCRATCH]) {
  const made = mkdtempSync(
    join(process.env.TMPDIR ?? tmpdir(), "codex-check-")
  );
  const homeDir = join(made, "home");
  mkdirSync(homeDir, { recursive: true });
  const again = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      [SCRATCH]: made,
      HOME: homeDir,
      XDG_DATA_HOME: join(homeDir, ".local/share"),
      XDG_CONFIG_HOME: join(homeDir, ".config"),
    },
  });
  rmSync(made, { recursive: true, force: true });
  process.exit(again.status ?? 1);
}
const scratch = process.env[SCRATCH];

const run = (command: string, args: string[]): void => {
  const done = spawnSync(command, args, { encoding: "utf8" });
  if (done.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}: ${done.stderr}`);
  }
};

/**
 * The packages, installed in one call: an install with `--no-save` prunes
 * from its prefix whatever an earlier one put there, so a second call would
 * remove the first one's package.
 */
const bin = (() => {
  const prefix = join(scratch, "install");
  run("npm", [
    "install",
    "--no-save",
    "--prefix",
    prefix,
    ...(process.env.CODEX_BIN ? [] : [`@openai/codex@${CODEX_VERSION}`]),
    `@copilotkit/aimock@${AIMOCK_VERSION}`,
  ]);
  return join(prefix, "node_modules/.bin");
})();

const codexBin = process.env.CODEX_BIN ?? join(bin, "codex");
/** aimock's server (its `aimock` bin is its fixture tools). */
const llmock = join(bin, "llmock");

/** One scripted `exec` call (Codex's code mode) running `js`, keyed after `after`. */
const execCall = (id: string, js: string) => ({
  toolCalls: [],
  customToolCalls: [{ name: "exec", id, input: js }],
});
const tool = (call: string) =>
  `try { const r = await tools.${call}; text("RESULT " + JSON.stringify(r)); } catch (e) { text("ERROR " + String(e)); }`;

const clone = join(scratch, "clone");
const outside = join(scratch, "outside");
const fixtures = {
  fixtures: [
    { match: { userMessage: "CHECK-HELLO" }, response: { content: "hello" } },
    {
      match: { userMessage: "CHECK-PERM", hasToolResult: false },
      response: execCall(
        "perm_1",
        tool('exec_command({"cmd":"echo p >> perm.txt","yield_time_ms":5000})')
      ),
    },
    {
      match: { toolCallId: "perm_1" },
      response: execCall(
        "perm_2",
        tool(
          'apply_patch("*** Begin Patch\\n*** Add File: perm-patch.txt\\n+p\\n*** End Patch\\n")'
        )
      ),
    },
    { match: { toolCallId: "perm_2" }, response: { content: "PERM-DONE" } },
    {
      match: { userMessage: "CHECK-BOUNDARY", hasToolResult: false },
      response: execCall(
        "b_1",
        tool(
          `exec_command({"cmd":"echo a > ${outside}/shell.txt; echo b > inside.txt","yield_time_ms":5000})`
        )
      ),
    },
    {
      match: { toolCallId: "b_1" },
      response: execCall(
        "b_2",
        tool(
          `apply_patch("*** Begin Patch\\n*** Add File: ${outside}/patch.txt\\n+c\\n*** End Patch\\n")`
        )
      ),
    },
    { match: { toolCallId: "b_2" }, response: { content: "BOUNDARY-DONE" } },
    { match: {}, response: { content: "CATCH-ALL" } },
  ],
};
mkdirSync(join(scratch, "fixtures"), { recursive: true });
writeFileSync(join(scratch, "fixtures/check.json"), JSON.stringify(fixtures));
mkdirSync(outside, { recursive: true });
mkdirSync(join(clone, ".codex"), { recursive: true });
writeFileSync(
  join(clone, ".codex/config.toml"),
  `[mcp_servers.planted]\ncommand = "sh"\nargs = ["-c", "echo ran > ${outside}/planted.txt"]\n`
);
run("git", ["-C", clone, "init", "-q"]);

const PORT = 24_000 + Math.floor(Math.random() * 1000);
const mock = spawn(
  llmock,
  [
    "-p",
    String(PORT),
    "-f",
    join(scratch, "fixtures"),
    "--log-level",
    "warn",
    "--responses-tools",
    "extended",
  ],
  { stdio: "ignore" }
);
await Bun.sleep(1500);

// The adapter's code, loaded once the scratch HOME stands.
const home = await import("../packages/agent/src/harnesses/codex-home");
const rpc = await import("../packages/agent/src/harnesses/codex-rpc");

const ACCOUNT = "check-account";
/** The scripted model as the account home's provider. */
const pointAtMock = (homeDir: string): void => {
  const path = join(homeDir, "config.toml");
  const parsed: unknown = Bun.TOML.parse(
    existsSync(path) ? readFileSync(path, "utf8") : ""
  );
  const config = typeof parsed === "object" && parsed !== null ? parsed : {};
  writeFileSync(
    path,
    Bun.TOML.stringify({
      ...config,
      model: "gpt-6.1-sol",
      model_provider: "mock",
      model_providers: {
        mock: {
          name: "Scripted mock",
          base_url: `http://127.0.0.1:${PORT}/v1`,
          wire_api: "responses",
          env_key: "MOCK_API_KEY",
          request_max_retries: 0,
          stream_max_retries: 0,
        },
      },
    })
  );
};

/**
 * Each app-server's process group: what an app-server starts (its plugin
 * marketplace's `git ls-remote`, its exec-servers) outlives a signal to the
 * app-server alone, so the group is ended, after its scenario and, for a
 * scenario that never got there, as the check exits.
 */
const groups = new Set<Pid>();
const endGroup = (pid: Pid | undefined): void => {
  if (pid !== undefined && groups.delete(pid)) {
    signalGroup(pid, "SIGKILL");
  }
};
process.on("exit", () => {
  for (const pid of [...groups]) {
    endGroup(pid);
  }
});

/** A held app-server, as the keeper holds a session's: its stdio kept while clients come and go. */
const holdAppServer = (env: Record<string, string>) => {
  const child = spawn(codexBin, ["app-server"], {
    cwd: clone,
    detached: true,
    // The scripted model is on loopback, past any proxy the machine names.
    env: {
      ...env,
      MOCK_API_KEY: "scripted",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pid = spawnedPid(child);
  if (pid !== undefined) {
    groups.add(pid);
  }
  let receive: (line: string) => void = () => undefined;
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (process.env.CODEX_CHECK_TRACE) {
      console.error(`<< ${line.slice(0, 300)}`);
    }
    receive(line);
  });
  const client = (handlers: ConstructorParameters<typeof rpc.CodexPeer>[1]) => {
    const peer = new rpc.CodexPeer(
      (line) =>
        new Promise<void>((resolve, reject) =>
          child.stdin.write(line, (error) =>
            error ? reject(error) : resolve()
          )
        ),
      handlers
    );
    receive = (line) => peer.receive(line);
    return peer;
  };
  return { client, end: () => endGroup(pid) };
};

interface Outcome {
  detail: string;
  name: string;
  ok: boolean;
}
const outcomes: Outcome[] = [];
/** How long one scenario may take: a turn of the scripted model takes well under a second. */
const SCENARIO_MS = 60_000;
const scenario = async (name: string, body: () => Promise<string>) => {
  try {
    const read = await readWithin(SCENARIO_MS, body);
    if (read.kind === "unanswered") {
      throw new Error(`no end within ${SCENARIO_MS / 1000} s`);
    }
    outcomes.push({ name, ok: true, detail: read.value });
  } catch (error) {
    outcomes.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

const turnEnds = () => {
  let ended: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    ended = resolve;
  });
  return { done, ended };
};

await scenario("config", async () => {
  const dir = await home.prepareHome(ACCOUNT, { untrust: [clone] });
  pointAtMock(dir);
  const held = holdAppServer(home.codexEnv(ACCOUNT));
  const turn = turnEnds();
  const peer = held.client({
    notification: (m) => m.method === "turn/completed" && turn.ended(),
    request: (m) => {
      peer.refuse(m.id, "check").catch(() => undefined);
    },
  });
  await peer.handshake();
  const { thread } = await peer.request("thread/start", {
    cwd: clone,
    approvalPolicy: "never",
    sandbox: "danger-full-access",
  });
  await peer.request("turn/start", {
    threadId: thread.id,
    input: [{ type: "text", text: "CHECK-HELLO", text_elements: [] }],
  });
  await turn.done;
  await Bun.sleep(1000);
  held.end();
  if (existsSync(join(outside, "planted.txt"))) {
    throw new Error(
      "the clone's planted .codex/config.toml ran its MCP server on the host"
    );
  }
  return "the planted MCP server did not run";
});

let parked: { id: number | string; method: string } | undefined;
await scenario("ask and restart", async () => {
  const held = holdAppServer(home.codexEnv(ACCOUNT));
  const asked = turnEnds();
  const first = held.client({
    notification: () => undefined,
    request: (m) => {
      parked = { id: m.id, method: m.method };
      asked.ended();
    },
  });
  await first.handshake();
  const { thread } = await first.request("thread/start", {
    cwd: clone,
    approvalPolicy: "untrusted",
    sandbox: "danger-full-access",
  });
  await first.request("turn/start", {
    threadId: thread.id,
    input: [{ type: "text", text: "CHECK-PERM", text_elements: [] }],
  });
  await asked.done;
  // The agent goes away with the ask open; another takes the app-server back.
  const before = parked;
  parked = undefined;
  const turn = turnEnds();
  const asks: string[] = [];
  const second = held.client({
    notification: (m) => m.method === "turn/completed" && turn.ended(),
    request: (m) => {
      asks.push(m.method);
      second.answer(m.id, { decision: "accept" }).catch(() => undefined);
    },
  });
  const loaded = await second.request("thread/loaded/list", {});
  if (!loaded.data.includes(thread.id)) {
    throw new Error("thread/loaded/list did not name the session's thread");
  }
  await second.request("thread/resume", {
    threadId: thread.id,
    excludeTurns: true,
  });
  await turn.done;
  held.end();
  if (!(before && asks[0] === before.method)) {
    throw new Error(
      `thread/resume did not hand the open ask over again (asks: ${asks.join(", ") || "none"})`
    );
  }
  if (!(
    existsSync(join(clone, "perm.txt")) &&
    existsSync(join(clone, "perm-patch.txt"))
  )) {
    throw new Error("the answered command and edit did not run");
  }
  return `the open ${before.method} was handed over again; ${asks.length} ask(s) answered, both writes landed`;
});

await scenario("boundary", async () => {
  if (WITHOUT_BOUNDARY) {
    return "skipped (--without-boundary)";
  }
  const accountHome = join(
    process.env.HOME ?? "",
    ".cawco/accounts",
    ACCOUNT,
    "codex"
  );
  // The workspace executor's `exec --claude COMMAND`, stood in for by bwrap:
  // the clone writable, the rest read-only, the account's home out of sight.
  const exec = join(scratch, "exec");
  writeFileSync(
    exec,
    `#!${systemProgram("sh")}\n[ "$1" = --claude ] && shift\nexec bwrap --ro-bind / / --bind ${clone} ${clone} --tmpfs ${accountHome} --dev /dev --proc /proc --unshare-pid --die-with-parent -- sh -c "$1"\n`
  );
  chmodSync(exec, 0o755);
  const environment = home.workspaceEnvironment("check", exec, codexBin);
  await home.prepareHome(ACCOUNT, {
    untrust: [clone],
    environments: [environment],
  });
  const held = holdAppServer(home.codexEnv(ACCOUNT));
  const turn = turnEnds();
  const peer = held.client({
    notification: (m) => m.method === "turn/completed" && turn.ended(),
    request: (m) => {
      peer.refuse(m.id, "check").catch(() => undefined);
    },
  });
  await peer.handshake();
  const { thread } = await peer.request("thread/start", {
    cwd: clone,
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    environments: [{ environmentId: environment.id, cwd: clone }],
  });
  await peer.request("turn/start", {
    threadId: thread.id,
    input: [{ type: "text", text: "CHECK-BOUNDARY", text_elements: [] }],
  });
  await turn.done;
  held.end();
  const escaped = ["shell.txt", "patch.txt"].filter((name) =>
    existsSync(join(outside, name))
  );
  if (escaped.length > 0) {
    throw new Error(`written outside the clone: ${escaped.join(", ")}`);
  }
  if (!existsSync(join(clone, "inside.txt"))) {
    throw new Error("the command inside the environment did not run");
  }
  return "nothing written outside the clone; the write inside landed";
});

mock.kill();
for (const { name, ok, detail } of outcomes) {
  console.log(`${ok ? "pass" : "FAIL"} ${name}: ${detail}`);
}
const failed = outcomes.filter((one) => !one.ok);
console.log(
  failed.length === 0
    ? `codex-check: Codex ${CODEX_VERSION} passes`
    : `codex-check: Codex ${CODEX_VERSION} fails ${failed.length} scenario(s)`
);
process.exit(failed.length === 0 ? 0 : 1);
