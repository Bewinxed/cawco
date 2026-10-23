/**
 * In a real workspace boundary, a delegate's shell commands meet its
 * repository's own permission rules as the model wrote them, then run inside
 * (agent boundary.ts `claudePrefixScript`, `execScript`'s `--claude`); and
 * every harness's sessions there reach the fleet's chrome-devtools through
 * the workspace's MCP gate on the agent (mcp-gate.ts, mcp-host.ts
 * `fetchGate`), which runs it on the host through the workspace's door.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code, OpenCode and
 * pi against the mock model; the project's browser a local Chromium, the
 * runtime hidden) whose fleet runs chrome-devtools-mcp 1.11.0, a repository's
 * own Claude Code settings deny `git push`, put an ask rule on `echo
 * probe-ask-rule`, and its `.mcp.json` names a stdio server
 * (fixtures/where-mcp-server.ts, in the repository). A parent session in
 * Full Send delegates to Claude Code, OpenCode and pi there (each a
 * workspace of its own), and to Claude Code in a second repository whose
 * settings' `env` empties `CLAUDE_CODE_SHELL_PREFIX`. Each step is the
 * person's words naming it, and the mock's calls:
 *
 * - w1. `git push origin main` is refused by the repository's deny rule.
 * - w2. `echo probe-ask-rule` is asked, Full Send answers it, and it runs.
 * - w3. `touch probe-plain` runs with no ask.
 * - w4. `cd sub` follows into the next call; a failing `cd / && false`
 *   leaves it there.
 * - w5. A command runs inside: another pid namespace than the host's (Linux),
 *   and the workspace its executor names.
 * - w6. The repository's `.mcp.json` server runs inside (its namespace and
 *   workspace as w5's), and cannot reach the machine's browser gate.
 * - w7. chrome-devtools, on Claude Code, OpenCode and pi each: its tools are
 *   listed, and `new_page` then `take_screenshot` into the clone writes the
 *   capture, through the workspace's gate: the agent's process for that
 *   workspace, launched through its door.
 * - w8. The second repository's emptied prefix: the Bash call is refused,
 *   and nothing runs.
 *
 * Run on the host, outside every workspace boundary (it delegates, so its
 * fleet cuts workspaces):
 *
 *   bun scripts/probe-kit/run.ts workspace-bash-rules
 */
import { readlinkSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const MCP_VERSION = "1.11.0";
const ASK_COMMAND = "echo probe-ask-rule";
/** The variable the judge's refusal names when a session's CLI runs under no prefix of its workspace's. */
const SHELL_PREFIX = "CLAUDE_CODE_SHELL_PREFIX";
const FIXTURE = join(import.meta.dir, "..", "fixtures", "where-mcp-server.ts");
/** A step, in the person's words: the session it is for and its number. */
const STEP_TAG = /PROBE-WBR-([a-z]+-\d+)/g;
const WHERE = /PROBE-WHERE (\{.*?\})(?:"|\\n|$)/;
/** The page new_page selected, in its answer as JSON or text. */
const SELECTED = /(\d+): [^\\"\n]*\[selected\]/;
const SHOT_NAME = "take_screenshot";
/** A pid namespace as `readlink /proc/self/ns/pid` names it. */
const NAMESPACE = /pid:\[\d+\]/;
/** The workspace a command's executor named, as the probe's command prints it. */
const WORKSPACE = /ws=(\S+)/;
const PAGE_NAME = "new_page";

/** One step as the mock plays it: each call it made, and what came back. */
interface Step {
  awaiting: boolean;
  done: boolean;
  /** What the step has asked for so far, by name. */
  made: Set<string>;
  /** The step's next reply, given what came back so far; none when it is over. */
  play: (step: Step, request: Seen) => Reply | undefined;
  results: { failed: boolean; text: string }[];
  /** What the step saw offered, for its detail. */
  seen: string[];
}
const steps = new Map<string, Step>();

const words = (said: string): Reply => ({ everyMs: 5, words: [said] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A message part's words: a string, or the text of its blocks. */
const wordsOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[])
        .map((part) => part.text ?? wordsOf(part.content))
        .join("\n")
    : "";
};

/** The words of the request's last tool result (an Anthropic `tool_result`, a chat completion's `tool` message). */
const lastToolResult = (body: string): string => {
  const messages =
    (JSON.parse(body) as { messages?: { content?: unknown; role?: string }[] })
      .messages ?? [];
  for (const message of [...messages].reverse()) {
    if (message.role === "tool") {
      return wordsOf(message.content);
    }
    const block = Array.isArray(message.content)
      ? (message.content as { type?: string; content?: unknown }[]).findLast(
          (part) => part.type === "tool_result"
        )
      : undefined;
    if (block) {
      return wordsOf(block.content);
    }
  }
  return "";
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const key = [...request.all.matchAll(STEP_TAG)].at(-1)?.[1];
  const step = key ? steps.get(key) : undefined;
  if (!step) {
    return words("waiting");
  }
  if (request.afterTool && step.awaiting) {
    step.results.push({
      text: lastToolResult(request.body),
      failed: request.toolFailed,
    });
    step.awaiting = false;
  }
  if (step.done || step.awaiting) {
    return words("done");
  }
  const next = step.play(step, request);
  if (!next) {
    step.done = true;
    return words("done");
  }
  step.awaiting = true;
  return next;
};

/** A step of shell commands, one call each, through the harness's shell tool `tool`. */
const shell =
  (tool: string, commands: string[]) =>
  (step: Step): Reply | undefined => {
    const command = commands[step.results.length];
    return command === undefined
      ? undefined
      : call(tool, { command, description: "Probe step" });
  };

/** Letters and digits alone: each harness writes a server's name into its tools' its own way. */
const bare = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The tool of `server` ending in `ending` that the request offers, however the harness names it. */
const offered = (request: Seen, ending: string, server: string) =>
  request.toolNames.find(
    (name) => name.endsWith(ending) && bare(name).includes(bare(server))
  );

/** `execute`'s one input, as OpenCode's Code Mode names it in the request's tools. */
const programKey = (body: string): string => {
  const tools =
    (
      JSON.parse(body) as {
        tools?: {
          function?: {
            name?: string;
            parameters?: {
              properties?: Record<string, unknown>;
              required?: string[];
            };
          };
        }[];
      }
    ).tools ?? [];
  const execute = tools.find((one) => one.function?.name === "execute")
    ?.function?.parameters;
  return (
    execute?.required?.[0] ??
    Object.keys(execute?.properties ?? {})[0] ??
    "code"
  );
};

/**
 * chrome-devtools' `new_page` then `take_screenshot` into `shot`, as the
 * harness offers them: declared, behind Claude Code's ToolSearch or pi's
 * `tool_search`, or through OpenCode's Code Mode (`execute`), whose program
 * finds the namespace holding take_screenshot by its own keys.
 */
const capture =
  (shot: string) =>
  (step: Step, request: Seen): Reply | undefined => {
    step.seen.push(
      request.toolNames
        .filter(
          (name) =>
            bare(name).includes("devtools") ||
            name === "execute" ||
            name.endsWith("search")
        )
        .join(",")
    );
    const page = offered(request, PAGE_NAME, "chrome-devtools");
    const screenshot = offered(request, SHOT_NAME, "chrome-devtools");
    if (page && screenshot) {
      if (!step.made.has(PAGE_NAME)) {
        step.made.add(PAGE_NAME);
        return call(page, { url: "about:blank" });
      }
      const opened = step.results.findLast((one) => SELECTED.test(one.text));
      if (opened && !step.made.has(SHOT_NAME)) {
        step.made.add(SHOT_NAME);
        return call(screenshot, {
          filePath: shot,
          pageId: Number(SELECTED.exec(opened.text)?.[1]),
        });
      }
      return undefined;
    }
    if (step.made.has("search")) {
      return undefined;
    }
    step.made.add("search");
    if (request.toolNames.includes("execute")) {
      return call("execute", {
        [programKey(request.body)]: [
          `const space = Object.keys(tools).find((name) => tools[name] && typeof tools[name].${SHOT_NAME} === "function");`,
          "if (!space) return { spaces: Object.keys(tools) };",
          `const opened = await tools[space].${PAGE_NAME}({ url: "about:blank" });`,
          String.raw`const pageId = Number(JSON.stringify(opened).match(/(\d+): [^\\"]*\[selected\]/)?.[1]);`,
          `return await tools[space].${SHOT_NAME}({ filePath: ${JSON.stringify(shot)}, pageId });`,
        ].join("\n"),
      });
    }
    if (request.toolNames.includes("ToolSearch")) {
      return call("ToolSearch", {
        query: `select:mcp__chrome-devtools__${PAGE_NAME},mcp__chrome-devtools__${SHOT_NAME}`,
        max_results: 2,
      });
    }
    if (request.toolNames.includes("tool_search")) {
      return call("tool_search", { query: `chrome-devtools ${SHOT_NAME}` });
    }
    return undefined;
  };

/** The repository's `.mcp.json` server's `whereami`, declared or behind ToolSearch. */
const where = (step: Step, request: Seen): Reply | undefined => {
  if (step.results.some((one) => one.text.includes("PROBE-WHERE"))) {
    return undefined;
  }
  const tool = "mcp__probeproject__whereami";
  if (request.toolNames.includes(tool)) {
    return call(tool, {});
  }
  return step.results.length === 0 && request.toolNames.includes("ToolSearch")
    ? call("ToolSearch", { query: `select:${tool}`, max_results: 1 })
    : undefined;
};

const stepOf = (play: Step["play"]): Step => ({
  awaiting: false,
  done: false,
  made: new Set(),
  play,
  results: [],
  seen: [],
});

/** Runs step `key` in `session` and waits for it to end. */
const runStep = async (
  fleet: KitFleet,
  session: string,
  key: string,
  play: Step["play"]
): Promise<Step> => {
  const step = stepOf(play);
  steps.set(key, step);
  await fleet.send(session, `Run step PROBE-WBR-${key}.`);
  await until(
    `step ${key} over`,
    () => step.done || undefined,
    Boolean,
    240_000
  ).catch(() => undefined);
  await until(
    `${key}'s turn over`,
    () => fleet.instance(session),
    (row) => row?.turn_open_at === null,
    120_000
  ).catch(() => undefined);
  return step;
};

/** A repository with `settings` as its own Claude Code settings, the fixture server in `.mcp.json`. */
const repository = async (
  dir: string,
  settings: Record<string, unknown>,
  home: string,
  gate: string
) => {
  await mkdir(projectClaudeDir(dir), { recursive: true });
  await mkdir(join(dir, ".probe"), { recursive: true });
  await copyFile(FIXTURE, join(dir, ".probe", "where-mcp-server.ts"));
  const approved = { enabledMcpjsonServers: ["probeproject"] };
  await writeFile(
    projectClaudeDir(dir, "settings.json"),
    JSON.stringify({ ...settings, ...approved })
  );
  await writeFile(
    projectClaudeDir(dir, "settings.local.json"),
    JSON.stringify(approved)
  );
  await writeFile(
    join(dir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        probeproject: {
          command: "bun",
          args: [".probe/where-mcp-server.ts"],
          env: { PROBE_REACH: gate },
        },
      },
    })
  );
  await Bun.$`git init -q -b main && git add -A -f && git commit -qm 'First commit'`
    .cwd(dir)
    .env({ ...process.env, HOME: home })
    .quiet();
};

type Mark = Awaited<ReturnType<KitFleet["logMark"]>>;
/** A delegate of the parent session: its instance and its clone. */
interface Delegate {
  clone: string;
  id: string;
}

/** This process's pid namespace (Linux), which a command inside a boundary has another of. */
const hostNamespace = (): string => {
  try {
    return readlinkSync("/proc/self/ns/pid");
  } catch {
    return "";
  }
};

/** The agent's `[claude] permission asked: Bash` lines since `mark`. */
const askLines = async (mark: Mark) =>
  (await mark.since())
    .split("\n")
    .filter((line) => line.includes("[claude] permission asked: Bash"));

/** The agent's start of chrome-devtools for a gate since `mark`, launched through a door. */
const gateLine = async (mark: Mark) =>
  (await mark.since())
    .split("\n")
    .find(
      (line) =>
        line.includes("[mcp-host] chrome-devtools: started pid") &&
        line.includes("browser-mcp.json")
    );

const exists = async (path: string) => await Bun.file(path).exists();

/**
 * The fleet, its chrome-devtools synced, the two repositories, and the
 * parent session in Full Send, with what makes its delegates.
 */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  // The project's browser a local Chromium: the runtime hidden.
  fleet.launch("agent", [], {
    DOCKER_HOST: "unix:///nonexistent",
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      join(
        homedir(),
        process.platform === "darwin" ? "Library/Caches" : ".cache",
        "ms-playwright"
      ),
  });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );

  // The fleet's chrome-devtools, as a person adds it.
  const put = await fetch(`${fleet.base}/api/fleet/mcp/chrome-devtools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: "npx",
        args: [
          "-y",
          `chrome-devtools-mcp@${MCP_VERSION}`,
          "--no-usage-statistics",
        ],
      },
      enabled: true,
    }),
  });
  kit.check("the fleet runs chrome-devtools-mcp", put.ok, String(put.status));
  await until(
    "the machine's sync set the fleet's chrome-devtools",
    async () =>
      (
        JSON.parse(
          await readFile(
            join(home, ".local", "share", "cawco", "fleet-mcp-set.json"),
            "utf8"
          ).catch(() => "{}")
        ) as { servers?: Record<string, { command?: string }> }
      ).servers?.["chrome-devtools"]?.command,
    Boolean,
    300_000
  );

  const gateUrl = `http://127.0.0.1:${fleet.env.CAWCO_BROWSER_GATE_PORT ?? "43000"}/`;
  const repo = join(fleet.sandbox, "code");
  await repository(
    repo,
    {
      permissions: {
        deny: ["Bash(git push:*)"],
        ask: [`Bash(${ASK_COMMAND}:*)`],
      },
    },
    home,
    gateUrl
  );
  const emptiedRepo = join(fleet.sandbox, "emptied");
  await repository(
    emptiedRepo,
    { env: { CLAUDE_CODE_SHELL_PREFIX: "" } },
    home,
    gateUrl
  );
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Workspace bash rules",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Full Send parent", repo, {
    projectId: project.id,
    permissionMode: "fullSend",
  });
  /** A delegate of the parent on `harness` in `cwd`, its first turn over. */
  const delegate = async (
    harness: "claude" | "opencode" | "pi",
    cwd: string,
    title: string
  ): Promise<Delegate> => {
    const made = await fleet.api<{ instanceId: string | null }>(
      "/api/work-items",
      {
        parentInstanceId: parent,
        title,
        prompt: `PROBE-WBR-BRIEF ${title}: wait for the person's steps.`,
        harness,
        model: MODEL[harness],
        cwd,
      }
    );
    const id = made.instanceId as string;
    await until(
      `${title}'s first turn over`,
      () => fleet.instance(id),
      (row) => row?.status === "running" && row.turn_open_at === null,
      300_000
    );
    const clone =
      fleet.query<{ cwd: string }>(
        "SELECT cwd FROM instances WHERE id = ?",
        id
      )[0]?.cwd ?? cwd;
    return { id, clone };
  };
  return { fleet, repo, emptiedRepo, delegate };
};

/** w1–w4: the repository's rules, and the working directory, on the Claude delegate. */
const ruleLegs = async (kit: Kit, fleet: KitFleet, claude: Delegate) => {
  const pushed = await runStep(
    fleet,
    claude.id,
    "claude-1",
    shell("Bash", ["git push origin main"])
  );
  kit.check(
    "w1: the repository's deny rule refuses `git push origin main` in the workspace",
    pushed.results[0]?.failed === true &&
      (pushed.results[0]?.text.includes(
        "Permission to use Bash with command git push origin main has been denied"
      ) ??
        false),
    JSON.stringify(pushed.results)
  );

  const askMark = await fleet.logMark("agent");
  const asked = await runStep(
    fleet,
    claude.id,
    "claude-2",
    shell("Bash", [ASK_COMMAND])
  );
  const askedLines = await askLines(askMark);
  // Answered here, by Full Send: nothing of the delegate's is left with the
  // hub for the person, and the command ran.
  const left = (
    await fleet.api<{ instanceId: string }[]>("/api/pending")
  ).filter((ask) => ask.instanceId === claude.id);
  kit.check(
    "w2: the repository's ask rule asks for `echo probe-ask-rule`, Full Send answers it, and it runs",
    askedLines.length > 0 &&
      left.length === 0 &&
      (asked.results[0]?.text.includes("probe-ask-rule") ?? false) &&
      asked.results[0]?.failed === false,
    `asks ${JSON.stringify(askedLines)}; pending ${left.length}; ${JSON.stringify(asked.results)}`
  );

  const plainMark = await fleet.logMark("agent");
  const plain = await runStep(
    fleet,
    claude.id,
    "claude-3",
    shell("Bash", ["touch probe-plain"])
  );
  const plainAsks = await askLines(plainMark);
  kit.check(
    "w3: `touch probe-plain` runs with no ask",
    plain.results[0]?.failed === false &&
      plainAsks.length === 0 &&
      (await exists(join(claude.clone, "probe-plain"))),
    `asks ${JSON.stringify(plainAsks)}; ${JSON.stringify(plain.results)}`
  );

  const moved = await runStep(
    fleet,
    claude.id,
    "claude-4",
    shell("Bash", [
      "mkdir -p sub && cd sub && pwd",
      "pwd",
      "cd / && false",
      "pwd",
    ])
  );
  const said = moved.results.map((one) => one.text.trim());
  kit.check(
    "w4: the working directory follows `cd sub` into the next call, and a failing `cd / && false` leaves it there",
    said[0]?.endsWith("/sub") === true &&
      said[1] === said[0] &&
      moved.results[2]?.failed === true &&
      said[3] === said[0],
    `${join(claude.clone, "sub")}: ${JSON.stringify(moved.results)}`
  );
};

/** w5–w6: a command and the repository's `.mcp.json` server, inside the boundary. */
const insideLegs = async (kit: Kit, fleet: KitFleet, claude: Delegate) => {
  const hostNs = hostNamespace();
  const inside = await runStep(
    fleet,
    claude.id,
    "claude-5",
    shell("Bash", [
      "readlink /proc/self/ns/pid 2>/dev/null; printf 'ws=%s\\n' \"$CAWCO_WORKSPACE\"",
    ])
  );
  const insideText = inside.results[0]?.text ?? "";
  const insideNs = NAMESPACE.exec(insideText)?.[0] ?? "";
  const workspace = WORKSPACE.exec(insideText)?.[1] ?? "";
  kit.check(
    "w5: a Bash command runs inside the workspace's boundary: another pid namespace than the host's, and the workspace its executor names",
    workspace !== "" &&
      (process.platform !== "linux" ||
        (insideNs !== "" && insideNs !== hostNs)),
    `host ${hostNs}; ${insideText}`
  );

  const listed = await runStep(fleet, claude.id, "claude-6", where);
  const whereText =
    listed.results.find((one) => one.text.includes("PROBE-WHERE"))?.text ?? "";
  const found = WHERE.exec(whereText.replaceAll('\\"', '"'))?.[1];
  const placed = found
    ? (JSON.parse(found) as { ns: string; reach: string; workspace: string })
    : undefined;
  kit.check(
    "w6: the repository's `.mcp.json` server runs inside the boundary and cannot reach the machine's browser gate",
    placed !== undefined &&
      placed.workspace === workspace &&
      (process.platform !== "linux" || placed.ns === insideNs) &&
      (placed.reach.startsWith("refused") ||
        placed.reach.startsWith("answered 403")),
    `${JSON.stringify(placed)}; ${JSON.stringify(listed.results).slice(0, 1500)}`
  );
};

/** w7 on one harness's delegate: its capture into its clone, through its workspace's gate. */
const browserLeg = async (
  kit: Kit,
  fleet: KitFleet,
  harness: string,
  session: Delegate,
  key: string
) => {
  const shot = join(session.clone, `wbr-${harness}.png`);
  const mark = await fleet.logMark("agent");
  const step = await runStep(fleet, session.id, key, capture(shot));
  const line = await gateLine(mark);
  const captured = await exists(shot);
  kit.check(
    `w7: ${harness}: chrome-devtools in a workspace lists its tools and takes a screenshot through the workspace's gate`,
    captured && line !== undefined,
    `shot ${captured}; gate ${line ?? "none"}; offered ${JSON.stringify(step.seen)}; ${JSON.stringify(step.results).slice(0, 1500)}`
  );
};

const run = async (kit: Kit) => {
  const { fleet, repo, emptiedRepo, delegate } = await standUp(kit);
  const claude = await delegate("claude", repo, "Claude delegate");
  await ruleLegs(kit, fleet, claude);
  await insideLegs(kit, fleet, claude);
  await browserLeg(kit, fleet, "claude", claude, "claude-7");
  await browserLeg(
    kit,
    fleet,
    "opencode",
    await delegate("opencode", repo, "OpenCode delegate"),
    "opencode-1"
  );
  await browserLeg(
    kit,
    fleet,
    "pi",
    await delegate("pi", repo, "pi delegate"),
    "pi-1"
  );

  // ── An emptied prefix ────────────────────────────────────────────────
  const emptied = await delegate("claude", emptiedRepo, "Emptied delegate");
  const refused = await runStep(
    fleet,
    emptied.id,
    "emptied-1",
    shell("Bash", ["touch probe-emptied"])
  );
  kit.check(
    "w8: a repository whose settings empty CLAUDE_CODE_SHELL_PREFIX: the judge refuses the Bash call, and nothing runs",
    refused.results[0]?.failed === true &&
      (refused.results[0]?.text.includes(SHELL_PREFIX) ?? false) &&
      !(await exists(join(emptied.clone, "probe-emptied"))),
    JSON.stringify(refused.results)
  );
};

const spec: Spec = {
  name: "workspace-bash-rules",
  host: "it delegates, so its fleet cuts workspaces whose boundaries it runs commands in",
  run,
};
export default spec;
