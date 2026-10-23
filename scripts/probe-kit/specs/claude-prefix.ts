/**
 * A workspace's Claude Code runs every shell command through the
 * workspace's shell prefix, after its own permission rules have judged the
 * command as the model wrote it (agent boundary.ts `claudePrefixScript`,
 * `execScript`'s `--claude`), and reaches the fleet's servers with a command
 * through the workspace's MCP gate (mcp-gate.ts, mcp-host.ts `fetchGate`).
 *
 * The real Claude Code (the `claude` on PATH, against a mock model, driven
 * through the Agent SDK as the agent drives it) runs in a scratch
 * workspace's clone, with the workspace's real executor, runner, prefix,
 * hook and judge as this build writes them, on the host with no sandbox
 * around the runner (`executorUnsandboxed`, as the git-door spec runs it):
 * a command "inside" here is one the runner ran, which names the workspace
 * (`CAWCO_WORKSPACE`, set on every command the executor hands in and on
 * nothing else). The real boundary is the workspace-bash-rules spec's, on
 * the host. The session is launched as claude.ts launches a workspace's:
 * the prefix in `CLAUDE_CODE_SHELL_PREFIX`, the hook from
 * `claudeBoundaryOptions`, in bypass mode (Full Send's).
 *
 * The repository's own settings deny `git push`, put an ask rule on `echo
 * probe-ask-rule`, run a shell-form PostToolUse hook, and its `.mcp.json`
 * names a stdio server (fixtures/where-mcp-server.ts, in the clone). The
 * fleet's `probegate` is the same fixture, a command server.
 *
 * - p1. `git push origin main` is refused by the deny rule, and never reaches
 *   the executor.
 * - p2. `touch` runs with no ask, through the executor.
 * - p3. `echo probe-ask-rule` is asked (`canUseTool`), and runs once allowed.
 * - p4. `mkdir -p sub && cd sub && pwd`, then `pwd`, both name `sub`; `cd /
 *   && false` fails, and the next `pwd` still names `sub` (the CLI's own
 *   tail, unquoted, matched and handed back).
 * - p5. The executor takes the tail quoted as well as unquoted, with a tag,
 *   and writes no directory back for a failing command.
 * - p6. A Monitor's command runs through the executor.
 * - p7. The shell-form hook runs through the executor and reads its call on
 *   its stdin.
 * - p8. The repository's `.mcp.json` server starts through the executor
 *   (its stdin and stdout carry the protocol) and answers `whereami`.
 * - p9. The fleet's `probegate` answers through the gate: its process runs
 *   outside the executor, in the clone; the gate's last session leaving ends
 *   it, and `tools/list` is answered then from the kept listing, starting
 *   nothing.
 * - p10. A settings file whose `env` empties `CLAUDE_CODE_SHELL_PREFIX`: the
 *   judge refuses the Bash call, and nothing runs.
 * - p11. A hook script that is gone: the Bash call is blocked, and nothing
 *   runs.
 * - p12. The prefix hands its stdin to the command whole, and a read at a
 *   time while it stays open (the CLI's stdin is a socket).
 * - p13. A fleet change to `probegate`'s config gives its gate URL a new
 *   mark (so a session's harness dials it anew), and the gate runs the new
 *   config.
 *
 *   bun scripts/probe-kit/run.ts claude-prefix
 */
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { isAlive, listedPid } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = join(import.meta.dir, "..", "fixtures", "where-mcp-server.ts");
const ASK_COMMAND = "echo probe-ask-rule";
const WHERE = /PROBE-WHERE (\{.*\})/;

interface Where {
  cwd: string;
  mark: string;
  ns: string;
  pid: number;
  workspace: string;
}

interface Call {
  input: Record<string, unknown>;
  name: string;
}

/** What one session did: each call's result, in order, what it was asked, and its MCP servers as it started. */
interface Ran {
  asks: string[];
  mcp: string;
  results: { call: Call; error: boolean; text: string }[];
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? content
        .map((block) =>
          typeof (block as { text?: unknown }).text === "string"
            ? (block as { text: string }).text
            : ""
        )
        .join("\n")
    : JSON.stringify(content);
};

const sse = (events: [string, object][]): Response =>
  new Response(
    events
      .map(
        ([type, data]) =>
          `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } }
  );

const started: [string, object] = [
  "message_start",
  {
    message: {
      id: "msg_probe",
      type: "message",
      role: "assistant",
      model: "claude-probe",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  },
];

const said = (text: string): Response =>
  sse([
    started,
    [
      "content_block_start",
      { index: 0, content_block: { type: "text", text: "" } },
    ],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { index: 0 }],
    [
      "message_delta",
      {
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ["message_stop", {}],
  ]);

const calls = (call: Call): Response =>
  sse([
    started,
    [
      "content_block_start",
      {
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().replaceAll("-", "")}`,
          name: call.name,
          input: {},
        },
      },
    ],
    [
      "content_block_delta",
      {
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(call.input),
        },
      },
    ],
    ["content_block_stop", { index: 0 }],
    [
      "message_delta",
      {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", {}],
  ]);

const bash = (command: string): Call => ({
  name: "Bash",
  input: { command, description: "Probe step" },
});

const run = async (kit: Kit) => {
  const { check } = kit;
  const home = process.env.HOME as string;
  // Every dir CawCo's paths read, under this run's own HOME: the enclosing
  // workspace's are not this one's.
  Object.assign(process.env, {
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: join(home, "run"),
    CAWCO_SESSIOND_ENDPOINT: join(home, "run", "sessiond.sock"),
  });
  delete process.env.CAWCO_WORKSPACE;
  await mkdir(join(home, "run"), { recursive: true, mode: 0o700 });
  const gatewayLease = Bun.serve({ port: 0, fetch: () => new Response() });
  process.env.CAWCO_MCP_PORT = String(gatewayLease.port);
  await gatewayLease.stop(true);

  const boundaryModule = await import("../../../packages/agent/src/boundary");
  const { claudeBoundaryOptions, executorUnsandboxed } = boundaryModule;
  const paths = await import("../../../packages/core/src/paths");
  const { workspacePolicy } =
    await import("../../../packages/core/src/workspace-policy");
  const { writeFleetMcpSet } =
    await import("../../../packages/agent/src/fleet-mcp-set");
  const { mcpGateOf, mcpHost } =
    await import("../../../packages/agent/src/mcp-host");
  const { throughMcpGate } =
    await import("../../../packages/agent/src/mcp-gate");
  const { startMcpGateway } =
    await import("../../../packages/agent/src/mcp-oauth");
  // The Agent SDK the agent itself runs Claude Code through: its dependency.
  const { query } = (await import(
    createRequire(join(ROOT, "packages", "agent", "package.json")).resolve(
      "@anthropic-ai/claude-agent-sdk"
    )
  )) as typeof import("../../../packages/agent/node_modules/@anthropic-ai/claude-agent-sdk");
  const bun = Bun.which("bun") ?? process.execPath;
  const claude = Bun.which("claude");
  if (!claude) {
    check("a claude CLI is on PATH", false, "none");
    return;
  }

  // ── The workspace: its clone, records, executor, prefix, judge, hook ───
  const id = crypto.randomUUID();
  const clone = join(home, "clone");
  const pids = join(home, "pids");
  await mkdir(projectClaudeDir(clone), { recursive: true });
  await mkdir(join(clone, ".probe"), { recursive: true });
  await copyFile(FIXTURE, join(clone, ".probe", "where-mcp-server.ts"));
  const hookSaw = join(clone, "hook-saw.txt");
  await writeFile(
    projectClaudeDir(clone, "settings.json"),
    JSON.stringify({
      permissions: {
        deny: ["Bash(git push:*)"],
        ask: [`Bash(${ASK_COMMAND}:*)`],
      },
      hooks: {
        PostToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: `{ printf '%s ' "$CAWCO_WORKSPACE"; head -c 200; echo; } >> ${hookSaw}`,
              },
            ],
          },
        ],
      },
    })
  );
  await writeFile(
    join(clone, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        probeproject: {
          command: "bun",
          args: [".probe/where-mcp-server.ts"],
        },
      },
    })
  );
  const local = projectClaudeDir(clone, "settings.local.json");
  await writeFile(
    local,
    JSON.stringify({ enabledMcpjsonServers: ["probeproject"] })
  );
  await Bun.$`git init -q -b main && git add -A && git -c user.name=Probe -c user.email=probe@probe.test commit -qm 'First commit'`
    .cwd(clone)
    .quiet();
  const state = paths.workspaceStateDir(id);
  await mkdir(state, { recursive: true });
  await writeFile(
    join(state, "create.json"),
    `${JSON.stringify({ path: clone })}\n`
  );
  const ref = { id, path: clone };
  const gen = "probe";
  const first = await executorUnsandboxed(ref, gen, listedPid(process.pid));
  await mkdir(join(first.fifo, ".."), { recursive: true });
  await mkdir(join(first.place, ".."), { recursive: true });
  await mkdir(first.scratch, { recursive: true });
  await mkdir(first.claudeTmp, { recursive: true, mode: 0o700 });
  await Bun.$`rm -f ${first.fifo} && mkfifo ${first.fifo}`.quiet();
  const runner = Bun.spawn(
    ["/bin/bash", "-c", first.runner, "cawco", first.fifo],
    { stdout: "pipe", stderr: "inherit" }
  );
  const reader = runner.stdout.getReader();
  await reader.read();
  reader.releaseLock();
  const parts = await executorUnsandboxed(ref, gen, listedPid(runner.pid));
  await writeFile(parts.place, `${runner.pid} ${runner.pid}\n`);
  await writeFile(parts.guarded, "");
  await writeFile(parts.execAt, parts.exec);
  await chmod(parts.execAt, 0o755);
  await writeFile(parts.prefixAt, parts.prefix);
  await chmod(parts.prefixAt, 0o755);
  const policy = paths.workspacePolicyFile(id);
  await writeFile(
    policy,
    `${JSON.stringify(await workspacePolicy(ref), null, 2)}\n`
  );
  // The judge, as armHook writes and starts it: its two scripts in the state
  // dir, on bun, listening on a socket of its own.
  await copyFile(
    join(ROOT, "packages", "agent", "src", "boundary-judge.ts"),
    join(state, "boundary-judge.ts")
  );
  await copyFile(
    join(ROOT, "packages", "core", "src", "workspace-judge.ts"),
    join(state, "workspace-judge.ts")
  );
  const socket = join(
    process.env.TMPDIR ?? "/tmp",
    `cpj-${crypto.randomUUID().slice(0, 8)}.sock`
  );
  const judge = Bun.spawn(
    [
      bun,
      join(state, "boundary-judge.ts"),
      socket,
      parts.hookAt,
      "90",
      parts.execAt,
      parts.prefixAt,
      policy,
      "probe-build",
    ],
    { cwd: state, stdout: "pipe", stderr: "inherit" }
  );
  const judgeSays = judge.stdout.getReader();
  await judgeSays.read();
  judgeSays.releaseLock();
  await writeFile(parts.hookAt, await parts.hook(socket));
  await chmod(parts.hookAt, 0o755);
  const boundary = {
    claudeTmp: parts.claudeTmp,
    exec: parts.execAt,
    hook: parts.hookAt,
    pid: runner.pid,
    policy,
    prefix: parts.prefixAt,
    scratch: parts.scratch,
  };

  // ── The fleet's `probegate`, through the gateway ──────────────────────
  const probegate: {
    args: string[];
    command: string;
    env: Record<string, string>;
  } = {
    command: bun,
    args: [FIXTURE],
    env: { PROBE_MCP_PIDS: pids },
  };
  await writeFleetMcpSet({
    servers: { probegate },
    placed: {},
    signedOut: [],
  });
  const gateway = await startMcpGateway(() => "ws://127.0.0.1:9/ws");
  const gate = mcpGateOf(id);
  mcpHost.joinGate(id, "probe:1");

  // ── One session, as claude.ts launches a workspace's ──────────────────
  const configDir = join(home, ".claude-probe");
  await mkdir(configDir, { recursive: true });
  // Monitor is behind a flag the CLI reads from its cached features.
  await writeFile(
    join(configDir, CLAUDE_JSON_NAME),
    JSON.stringify({
      cachedGrowthBookFeatures: { tengu_amber_sentinel: true },
    })
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !(name.startsWith("CLAUDE") || name.startsWith("ANTHROPIC"))
    )
  );
  const session = async (
    plan: Call[],
    hooked: typeof boundary
  ): Promise<Ran> => {
    const ran: Ran = { asks: [], mcp: "", results: [] };
    const mock = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (!(request.method === "POST" && url.pathname === "/v1/messages")) {
          return url.pathname.endsWith("/count_tokens")
            ? Response.json({ input_tokens: 10 })
            : new Response("{}", { status: 404 });
        }
        const body = (await request.json()) as {
          messages: { content: unknown; role: string }[];
          tools?: { name: string }[];
        };
        if (!body.tools?.some((tool) => tool.name === "Bash")) {
          return said("Probe title");
        }
        const results = body.messages.flatMap((message) =>
          message.role === "user" && Array.isArray(message.content)
            ? (
                message.content as {
                  content?: unknown;
                  is_error?: boolean;
                  type: string;
                }[]
              ).filter((block) => block.type === "tool_result")
            : []
        );
        while (ran.results.length < results.length) {
          const at = ran.results.length;
          const block = results[at] as {
            content?: unknown;
            is_error?: boolean;
          };
          ran.results.push({
            call: plan[at] as Call,
            error: block.is_error === true,
            text: textOf(block.content),
          });
        }
        const next = plan[results.length];
        return next ? calls(next) : said("done");
      },
    });
    const bounded = claudeBoundaryOptions(hooked);
    try {
      const handle = query({
        prompt: "Run the probe's steps.",
        options: {
          pathToClaudeCodeExecutable: claude,
          cwd: clone,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          settingSources: ["project", "local"],
          mcpServers: throughMcpGate({ probegate }, gate),
          ...bounded,
          env: {
            ...env,
            CLAUDE_CONFIG_DIR: configDir,
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.port}`,
            ANTHROPIC_API_KEY: "sk-probe",
            CLAUDE_CODE_TMPDIR: hooked.claudeTmp,
            CLAUDE_CODE_SHELL_PREFIX: hooked.prefix,
          },
          canUseTool: (toolName, input) => {
            ran.asks.push(`${toolName} ${JSON.stringify(input)}`);
            return Promise.resolve({ behavior: "allow", updatedInput: input });
          },
        },
      });
      const deadline = setTimeout(() => handle.interrupt(), 180_000);
      for await (const message of handle) {
        if (message.type === "system" && message.subtype === "init") {
          ran.mcp = JSON.stringify(message.mcp_servers);
        }
        if (message.type === "result") {
          break;
        }
      }
      clearTimeout(deadline);
    } finally {
      await mock.stop(true);
    }
    return ran;
  };

  const monitorRan = join(clone, "monitor-ran.txt");
  try {
    const main = await session(
      [
        bash("git push origin main"),
        bash("touch probe-touched"),
        bash(ASK_COMMAND),
        bash("mkdir -p sub && cd sub && pwd"),
        bash("pwd"),
        bash("cd / && false"),
        bash("pwd"),
        {
          name: "Monitor",
          input: {
            command: `printf '%s' "$CAWCO_WORKSPACE" > ${monitorRan}`,
            description: "Probe monitor",
          },
        },
        { name: "mcp__probeproject__whereami", input: {} },
        { name: "mcp__probegate__whereami", input: {} },
      ],
      boundary
    );
    const result = (at: number) => main.results[at];
    const all = JSON.stringify(main.results).slice(0, 4000);

    const pushed = result(0);
    check(
      "p1: the repository's deny rule refuses `git push origin main`, which never reaches the executor",
      pushed?.error === true &&
        pushed.text.includes(
          "Permission to use Bash with command git push origin main has been denied"
        ),
      JSON.stringify(pushed)
    );
    const touched = await Bun.file(join(clone, "probe-touched")).exists();
    check(
      "p2: `touch` runs with no ask, through the executor",
      result(1)?.error === false &&
        touched &&
        !main.asks.some((ask) => ask.includes("touch")),
      `${JSON.stringify(result(1))}; touched ${touched}; asks ${JSON.stringify(main.asks)}`
    );
    check(
      "p3: the repository's ask rule asks for `echo probe-ask-rule`, and it runs once allowed",
      main.asks.some((ask) => ask.includes(ASK_COMMAND)) &&
        result(2)?.error === false &&
        result(2)?.text.includes("probe-ask-rule") === true,
      `asks ${JSON.stringify(main.asks)}; ${JSON.stringify(result(2))}`
    );
    const sub = join(clone, "sub");
    check(
      "p4: the working directory follows `cd sub` into the next call, and a failing `cd / && false` leaves it there",
      result(3)?.text.trim() === sub &&
        result(4)?.text.trim() === sub &&
        result(5)?.error === true &&
        result(6)?.text.trim() === sub,
      all
    );
    const monitored = await until(
      "the Monitor's command",
      () => readFile(monitorRan, "utf8"),
      Boolean,
      30_000
    ).catch(() => "");
    check(
      "p6: a Monitor's command runs through the executor",
      monitored === id,
      `monitor-ran.txt: ${JSON.stringify(monitored)}; ${JSON.stringify(result(7))}`
    );
    const hookLines = await readFile(hookSaw, "utf8").catch(() => "");
    check(
      "p7: the repository's shell-form hook runs through the executor and reads its call on its stdin",
      hookLines
        .split("\n")
        .some((line) => line.startsWith(`${id} {"session_id":`)),
      hookLines.slice(0, 600)
    );
    const whereOf = (at: number): Where | undefined => {
      const found = WHERE.exec(result(at)?.text ?? "")?.[1];
      return found ? (JSON.parse(found) as Where) : undefined;
    };
    const project = whereOf(8);
    check(
      "p8: the repository's `.mcp.json` server starts through the executor and answers over it",
      project?.workspace === id,
      `${JSON.stringify(result(8))}; servers at its start ${main.mcp}`
    );
    const gated = whereOf(9);
    check(
      "p9: the fleet's `probegate` answers through the workspace's gate, its process outside the executor, in the clone",
      gated !== undefined && gated.workspace !== id && gated.cwd === clone,
      JSON.stringify(result(9))
    );

    // ── The tail, quoted and not, straight through the prefix ──────────
    await mkdir(join(clone, "sub2"), { recursive: true });
    const tail = async (command: string, file: string, inQuotes: boolean) => {
      const cwdFile = join(parts.claudeTmp, file);
      const ran =
        await Bun.$`${parts.prefixAt} ${`eval ${JSON.stringify(command)} < /dev/null && pwd -P >| ${inQuotes ? `'${cwdFile}'` : cwdFile}`}`
          .cwd(clone)
          .quiet()
          .nothrow();
      const written = await readFile(cwdFile, "utf8").catch(() => undefined);
      return { status: ran.exitCode, written: written?.trim() };
    };
    const quoted = await tail("cd sub2", "claude-ab12-cwd", true);
    const tagged = await tail("cd sub2", "claude-cd34-x1-cwd", false);
    const failing = await tail("cd sub2 && false", "claude-ef56-cwd", true);
    check(
      "p5: the executor takes the CLI's tail quoted and unquoted, with a tag, and writes back no directory for a failing command",
      quoted.status === 0 &&
        quoted.written === join(clone, "sub2") &&
        tagged.status === 0 &&
        tagged.written === join(clone, "sub2") &&
        failing.status === 1 &&
        failing.written === undefined,
      JSON.stringify({ quoted, tagged, failing })
    );

    // ── Stdin, straight through the prefix ─────────────────────────────
    const whole = await Bun.$`echo probe-stdin | ${parts.prefixAt} cat`
      .cwd(clone)
      .quiet()
      .nothrow();
    const open = Bun.spawn([parts.prefixAt, "head -n1"], {
      cwd: clone,
      stdin: "pipe",
      stdout: "pipe",
    });
    open.stdin.write("probe-line\n");
    open.stdin.flush();
    const read = await readWithin(10_000, () =>
      new Response(open.stdout).text()
    );
    const streamed =
      read.kind === "answered" ? read.value : "(nothing in 10 s)";
    open.stdin.end();
    open.kill();
    check(
      "p12: the prefix hands its stdin to the command, a read at a time while it stays open",
      whole.stdout.toString().trim() === "probe-stdin" &&
        streamed.trim() === "probe-line",
      JSON.stringify({ whole: whole.stdout.toString(), streamed })
    );

    // ── The gate's last session leaves ─────────────────────────────────
    mcpHost.leaveGate(id, "probe:1");
    const ended = gated
      ? await until(
          "the gate's process ending",
          () => !isAlive(listedPid(gated.pid)),
          Boolean,
          15_000
        ).catch(() => false)
      : false;
    const before = (await Bun.$`ls ${pids}`.quiet().nothrow()).stdout
      .toString()
      .trim();
    const listed = await fetch(`${gate.base}probegate`, {
      method: "POST",
      headers: { ...gate.headers, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    }).then((answered) => answered.text());
    const after = (await Bun.$`ls ${pids}`.quiet().nothrow()).stdout
      .toString()
      .trim();
    check(
      "p9: the gate's last session leaving ends its process, and `tools/list` is answered from the kept listing, starting none",
      ended && listed.includes('"whereami"') && before === after,
      `ended ${ended}; listed ${listed.slice(0, 300)}; pids before ${before} after ${after}`
    );

    // ── The fleet changes the gate's server ────────────────────────────
    const changed = {
      ...probegate,
      env: { ...probegate.env, PROBE_MARK: "changed" },
    };
    await writeFleetMcpSet({
      servers: { probegate: changed },
      placed: {},
      signedOut: [],
    });
    const urlOf = (config: typeof probegate) =>
      (throughMcpGate({ probegate: config }, gate).probegate as { url: string })
        .url;
    const called = await fetch(urlOf(changed), {
      method: "POST",
      headers: { ...gate.headers, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "whereami", arguments: {} },
      }),
    }).then((answered) => answered.text());
    const answer = (
      JSON.parse(called) as { result?: { content?: { text?: string }[] } }
    ).result?.content?.[0]?.text;
    const changedFound = WHERE.exec(answer ?? "")?.[1];
    const changedWhere = changedFound
      ? (JSON.parse(changedFound) as Where)
      : undefined;
    check(
      "p13: a changed fleet config gives its gate URL a new mark, so a session dials it anew, and the gate runs the new config",
      urlOf(probegate) !== urlOf(changed) &&
        changedWhere?.mark === "changed" &&
        changedWhere.pid !== gated?.pid,
      `${urlOf(probegate)} → ${urlOf(changed)}; ${called.slice(0, 400)}`
    );

    // ── An emptied prefix ──────────────────────────────────────────────
    await writeFile(
      local,
      JSON.stringify({
        enabledMcpjsonServers: ["probeproject"],
        env: { CLAUDE_CODE_SHELL_PREFIX: "" },
      })
    );
    const emptied = await session([bash("touch probe-emptied")], boundary);
    await writeFile(
      local,
      JSON.stringify({ enabledMcpjsonServers: ["probeproject"] })
    );
    check(
      "p10: a settings file that empties CLAUDE_CODE_SHELL_PREFIX: the judge refuses the Bash call, and nothing runs",
      emptied.results[0]?.error === true &&
        emptied.results[0].text.includes("CLAUDE_CODE_SHELL_PREFIX") &&
        !(await Bun.file(join(clone, "probe-emptied")).exists()),
      JSON.stringify(emptied.results)
    );

    // ── A hook that is gone ────────────────────────────────────────────
    const gone = await session([bash("touch probe-hookless")], {
      ...boundary,
      hook: join(state, "gone-hook"),
    });
    check(
      "p11: a hook script that is gone blocks the Bash call, and nothing runs",
      gone.results[0]?.error === true &&
        gone.results[0].text.includes("Can't open perl script") &&
        !(await Bun.file(join(clone, "probe-hookless")).exists()),
      JSON.stringify(gone.results)
    );
  } finally {
    await gateway.stop(true);
    mcpHost.stopAll();
    judge.kill();
    runner.kill();
    // The judge's socket is in the run's temp dir, outside its HOME.
    await rm(socket, { force: true });
  }
};

const spec: Spec = {
  name: "claude-prefix",
  ownHome:
    "it stands up a workspace's executor, judge and MCP gate under its own HOME, and runs the real Claude Code in its clone",
  run,
};
export default spec;
