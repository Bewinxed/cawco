/**
 * A delegate with host scope runs on the machine itself, keeps the whole
 * work-item lifecycle, and lands nothing; a workspace delegate beside it is
 * still bounded; and Claude Code as root starts sandbox-declared. On a
 * scratch fleet (real hub, agent and sessiond; each harness against the mock
 * model). Its workspace leg cuts a workspace, whose boundary is user
 * namespaces: it runs on the host, outside every boundary.
 *
 * Each delegate runs one shell command (PROBE) that prints its PID and
 * network namespaces, PID 1's command line, its groups and its listening TCP
 * sockets, and hands that reading back in its finish_item summary; the spec
 * reads it out of the report its parent received.
 *
 * - h1. A host-scope delegate on Claude Code: its session's PID namespace is
 *   this process's (the host's), and PID 1 is the host's own, not bwrap.
 * - h2. Its network namespace is the host's, and its `ss -tln` matches the
 *   host's: every socket listening both before and after its read is in it,
 *   and nothing in it listened at neither.
 * - h3. Its groups are the agent user's (`id -G`), docker and the like.
 * - h4. Its item is done, it lands none, its report reached the parent
 *   carrying that reading, and its row is a host-scope row in the agent
 *   user's home (cwd left out), with no clone and no boundary.
 * - h5. host refuses what needs a clone, each in a line: from, owns and lands
 *   main in one request, nothing filed.
 * - h6/h7. The same reading (h1, h2) from a host-scope delegate on OpenCode
 *   and on pi, each one's report reaching the parent.
 * - w1. A workspace delegate in the same run is bounded: PID 1 is bwrap, its
 *   PID namespace is not the host's.
 * - t1. `delegate` offers `host`, and its description says when to pick it.
 * - r1. Claude Code's spawn environment as root carries IS_SANDBOX=1, on the
 *   host and in a boundary alike; not as root it carries none, even when the
 *   agent's own environment has it (claude.ts `sessionEnv`).
 *
 *   bun scripts/probe-kit/run.ts host-delegates
 */
import { readFileSync, readlinkSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionEnv } from "../../../packages/agent/src/harnesses/claude";
import { listRoleTools } from "../../../packages/hub/src/role-budgets";
import {
  type Harness,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** What a host delegate's command prints between its marks. */
const BEGIN = "HOSTPROBE-BEGIN";
const END = "HOSTPROBE-END";
/** How a delegate's report to its parent opens (core `reportMarker`). */
const REPORT = "[Report from delegate ";

/** Runs of whitespace between `ss`'s columns. */
const SPACES = /\s+/;
/** A tool text that names the `host` parameter. */
const NAMES_HOST = /\bhost\b/;
/** Where a summary's reading ends. */
const READ_END = "HOSTPROBE-READ-END";
/** The reading's JSON list, from its tag to {@link READ_END}. */
const READ_JSON = new RegExp(`^(\\[.*?\\]) ${READ_END}`);

/** The reading: namespaces, PID 1, groups, listening sockets, one per line. */
const PROBE = `printf '${BEGIN}\\n'; echo "pidns $(readlink /proc/self/ns/pid)"; echo "netns $(readlink /proc/self/ns/net)"; echo "pid1 $(tr '\\000' '\\n' < /proc/1/cmdline | head -n 1)"; echo "groups $(id -G)"; ss -tlnH | awk '{print "listen " $4}'; printf '${END}\\n'`;

/** Each delegate's brief tag; its summary carries `<tag> READ <json>`. */
const TAGS = {
  claude: "PROBE-HOST-CLAUDE",
  opencode: "PROBE-HOST-OPENCODE",
  pi: "PROBE-HOST-PI",
  workspace: "PROBE-WORKSPACE",
} as const;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The lines between the marks of a tool result, or none. */
const readingIn = (said: string): string[] | undefined => {
  const from = said.indexOf(`${BEGIN}\n`);
  const to = said.indexOf(END, from + 1);
  if (from < 0 || to < 0) {
    return;
  }
  return said
    .slice(from + BEGIN.length + 1, to)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

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

/** The words of the request's last tool result: an Anthropic message's last `tool_result` block, or a chat completion's last `tool` message. */
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

/** Each delegate's reading once its shell answered, and whether it searched for finish_item. */
const probed = new Map<
  string,
  { finished?: boolean; reading?: string[]; searched?: boolean }
>();

/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";

/** The shell as each harness names it: Claude Code's Bash, pi's bash, OpenCode's shell. */
const SHELLS = ["Bash", "bash", "shell"];

/**
 * finish_item as the harness offers it: by its name, in OpenCode's Code
 * Mode, or behind a search the first time.
 */
const finishCall = (
  request: Seen,
  step: { searched?: boolean },
  input: object
): Reply => {
  const named = [
    "mcp__cawco__finish_item",
    "cawco_finish_item",
    "finish_item",
  ].find((name) => request.toolNames.includes(name));
  if (named) {
    return useTool(named, input);
  }
  if (request.toolNames.includes(CODE_MODE)) {
    return useTool(CODE_MODE, {
      code: `return await tools.cawco.finish_item(${JSON.stringify(input)});`,
    });
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return useTool("ToolSearch", {
      query: "select:mcp__cawco__finish_item",
      max_results: 1,
    });
  }
  if (!step.searched && request.toolNames.includes("tool_search")) {
    step.searched = true;
    return useTool("tool_search", { query: "cawco finish_item" });
  }
  return text(`finish_item is not offered: ${request.toolNames.join(", ")}`);
};

/**
 * A delegate whose brief carries `tag`: the shell command, then finish_item
 * with the reading as its summary, by the names its harness offers them
 * under.
 */
const prober = (tag: string, request: Seen): Reply => {
  const step = probed.get(tag) ?? {};
  probed.set(tag, step);
  if (request.afterTool && !step.reading) {
    step.reading = readingIn(lastToolResult(request.body));
  }
  if (step.finished) {
    return text("Done.");
  }
  if (step.reading) {
    const reply = finishCall(request, step, {
      headline: "Read the machine.",
      summary: `${tag} READ ${JSON.stringify(step.reading)} ${READ_END}`,
    });
    step.finished =
      reply.tool !== undefined &&
      !["ToolSearch", "tool_search"].includes(reply.tool.name);
    return reply;
  }
  const shell = SHELLS.find((name) => request.toolNames.includes(name));
  return shell
    ? useTool(shell, { command: PROBE, description: "Read the machine" })
    : text(`no shell is offered: ${request.toolNames.join(", ")}`);
};

/** Every session's answer, by the tag its brief carries; the parent says "ok". */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  const tag = Object.values(TAGS).find(
    (one) =>
      request.all.includes(`${one}: read`) && !request.all.includes(REPORT)
  );
  return tag ? prober(tag, request) : text("ok");
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

/** What one delegate read, parsed out of its parent's report. */
interface Reading {
  groups: string;
  listen: string[];
  netns: string;
  pid1: string;
  pidns: string;
}

const parse = (lines: string[]): Reading => {
  const one = (key: string): string =>
    lines.find((line) => line.startsWith(`${key} `))?.slice(key.length + 1) ??
    "";
  return {
    pidns: one("pidns"),
    netns: one("netns"),
    pid1: one("pid1").trim(),
    groups: one("groups"),
    listen: lines
      .filter((line) => line.startsWith("listen "))
      .map((line) => line.slice("listen ".length))
      .toSorted(),
  };
};

/** The same reading, taken by this process: the host's. */
const hostReading = async (): Promise<Reading> => ({
  pidns: readlinkSync("/proc/self/ns/pid"),
  netns: readlinkSync("/proc/self/ns/net"),
  pid1: readFileSync("/proc/1/cmdline", "utf8").split("\0")[0] ?? "",
  groups: (await Bun.$`id -G`.quiet().text()).trim(),
  listen: (await Bun.$`ss -tlnH`.quiet().text())
    .split("\n")
    .map((line) => line.trim().split(SPACES)[3])
    .filter((at): at is string => Boolean(at))
    .toSorted(),
});

const itemOf = (
  fleet: KitFleet,
  id: string
): { lands: string; state: string } | undefined =>
  fleet.query<{ lands: string; state: string }>(
    "SELECT state, lands FROM work_items WHERE id = ?",
    id
  )[0];

/**
 * Delegates `tag`'s probe (host scope, or a workspace in `cwd`) on
 * `harness`, waits for its item to end, and reads its reading out of the
 * report its parent received.
 */
const probe = async (
  fleet: KitFleet,
  parent: string,
  harness: Harness,
  tag: string,
  how: { host: true } | { cwd: string }
): Promise<{ reading?: Reading; started: Started; state?: string }> => {
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: `${tag.toLowerCase()} probe`,
    prompt: `${tag}: read the machine with one shell command, then finish.`,
    harness,
    model: MODEL[harness],
    ...("host" in how ? { host: true } : { cwd: how.cwd, lands: "none" }),
  });
  const state = await until(
    `${tag}'s item ended`,
    () => itemOf(fleet, started.workItemId)?.state,
    (now) => now === "done" || now === "failed" || now === "cancelled",
    240_000
  ).catch(() => itemOf(fleet, started.workItemId)?.state);
  const marker = `${tag} READ `;
  const report = await until(
    `${tag}'s report at its parent`,
    () =>
      fleet.seen
        .filter((one) => one.all.includes(REPORT))
        .map((one) => one.all)
        .find((all) => all.includes(marker)) ?? null,
    Boolean,
    120_000
  ).catch(() => null);
  const json = report
    ?.slice(report.indexOf(marker) + marker.length)
    .match(READ_JSON)?.[1];
  return {
    started,
    state,
    reading: json ? parse(JSON.parse(json) as string[]) : undefined,
  };
};

/** h2's rule: what listened both before and after is in the delegate's list, and nothing at neither. */
const matchesListen = (
  seen: string[],
  before: string[],
  after: string[]
): { ok: boolean; why: string } => {
  const both = before.filter((at) => after.includes(at));
  const missing = both.filter((at) => !seen.includes(at));
  const stray = seen.filter(
    (at) => !(before.includes(at) || after.includes(at))
  );
  return {
    ok: seen.length > 0 && missing.length === 0 && stray.length === 0,
    why: `delegate ${seen.join(" ")}; missing ${missing.join(" ") || "none"}; stray ${stray.join(" ") || "none"}`,
  };
};

const sameMachine = (
  kit: Kit,
  leg: string,
  harness: string,
  read: { reading?: Reading; state?: string },
  host: Reading,
  before: string[],
  after: string[]
): void => {
  const { reading } = read;
  kit.check(
    `${leg}: a host-scope delegate on ${harness} runs in the host's PID namespace, PID 1 the host's own and not bwrap`,
    reading !== undefined &&
      reading.pidns === host.pidns &&
      reading.pid1 === host.pid1 &&
      !reading.pid1.includes("bwrap"),
    `${read.state}; delegate ${JSON.stringify(reading)}; host pidns ${host.pidns}, pid1 ${host.pid1}`
  );
  const listen = matchesListen(reading?.listen ?? [], before, after);
  kit.check(
    `${leg}: its network namespace is the host's and its ss -tln matches the host's`,
    reading?.netns === host.netns && listen.ok,
    `netns ${reading?.netns} vs ${host.netns}; ${listen.why}`
  );
};

/** h1–h5: the Claude Code host delegate, and host's refusals. */
const claudeHost = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  home: string
): Promise<void> => {
  const before = (await hostReading()).listen;
  const read = await probe(fleet, parent, "claude", TAGS.claude, {
    host: true,
  });
  const host = await hostReading();
  sameMachine(kit, "h1/h2", "claude", read, host, before, host.listen);
  kit.check(
    "h3: its groups are the agent user's",
    read.reading?.groups === host.groups,
    `delegate ${read.reading?.groups}; host ${host.groups}`
  );
  const item = itemOf(fleet, read.started.workItemId);
  const [row] = fleet.query<{
    boundary_pid: number | null;
    branch: string;
    host: number;
    path: string;
  }>(
    "SELECT host, path, branch, boundary_pid FROM workspaces WHERE id = ?",
    read.started.workspaceId
  );
  kit.check(
    "h4: its item is done and lands none, its report reached the parent with its reading, and its row is a host-scope row in the agent user's home, no clone, no boundary",
    item?.state === "done" &&
      item.lands === "none" &&
      read.reading !== undefined &&
      row?.host === 1 &&
      row.path === home &&
      row.branch === "" &&
      row.boundary_pid === null,
    `item ${JSON.stringify(item)}; row ${JSON.stringify(row)}; home ${home}`
  );
  const refused = await fleet
    .api("/api/work-items", {
      parentInstanceId: parent,
      title: "Refused host probe",
      prompt: "never runs",
      harness: "claude",
      model: MODEL.claude,
      host: true,
      from: read.started.workspaceId,
      owns: ["src/**"],
      lands: "main",
    })
    .then(
      () => "filed",
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
  kit.check(
    "h5: host refuses from, owns and lands main, one line each, and files nothing",
    refused.includes("400") &&
      refused.includes("Host scope refuses these:") &&
      refused.includes("- from:") &&
      refused.includes("- owns:") &&
      refused.includes("- lands main:") &&
      fleet.query(
        "SELECT id FROM work_items WHERE title = ?",
        "Refused host probe"
      ).length === 0,
    refused
  );
};

/** t1: the tool surface. */
const toolLeg = (kit: Kit): void => {
  const delegate = listRoleTools()
    .flatMap(({ tools }) => tools)
    .find((tool) => tool.name === "delegate") as
    | {
        description?: string;
        inputSchema: { properties?: Record<string, { description?: string }> };
        name: string;
      }
    | undefined;
  const host = delegate?.inputSchema.properties?.host;
  kit.check(
    "t1: delegate offers host, and its description and its lands text name it",
    host !== undefined &&
      NAMES_HOST.test(delegate?.description ?? "") &&
      NAMES_HOST.test(
        delegate?.inputSchema.properties?.lands?.description ?? ""
      ),
    JSON.stringify(host)
  );
};

/** r1: the spawn environment as root and not. */
const rootLeg = (kit: Kit): void => {
  const bounded = {
    instanceId: "probe-root",
    boundary: {} as NonNullable<Parameters<typeof sessionEnv>[1]["boundary"]>,
  };
  const onHost = { instanceId: "probe-root", boundary: undefined };
  const had = process.env.IS_SANDBOX;
  process.env.IS_SANDBOX = "1";
  try {
    const read = {
      rootHost: sessionEnv(undefined, onHost, true).IS_SANDBOX,
      rootBounded: sessionEnv(undefined, bounded, true).IS_SANDBOX,
      userHost: sessionEnv(undefined, onHost, false).IS_SANDBOX,
      userSpec: sessionEnv({ IS_SANDBOX: "1" }, onHost, false).IS_SANDBOX,
    };
    kit.check(
      "r1: as root Claude Code's spawn env carries IS_SANDBOX=1 on the host and in a boundary; not as root none, whatever the agent's or the spec's env says",
      read.rootHost === "1" &&
        read.rootBounded === "1" &&
        read.userHost === undefined &&
        read.userSpec === undefined,
      JSON.stringify(read)
    );
  } finally {
    if (had === undefined) {
      delete process.env.IS_SANDBOX;
    } else {
      process.env.IS_SANDBOX = had;
    }
  }
};

const spec: Spec = {
  name: "host-delegates",
  host: "its workspace leg cuts a workspace, whose boundary is user namespaces",
  run: async (kit: Kit) => {
    toolLeg(kit);
    rootLeg(kit);
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
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
    await Bun.$`sh -c ${"git init -q -b main && echo host > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Host delegates",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    await claudeHost(kit, fleet, parent, home);
    for (const [leg, harness] of [
      ["h6", "opencode"],
      ["h7", "pi"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, each read against the host as it stands then
      const before = (await hostReading()).listen;
      const read = await probe(fleet, parent, harness, TAGS[harness], {
        host: true,
      });
      const host = await hostReading();
      sameMachine(kit, leg, harness, read, host, before, host.listen);
    }
    const bounded = await probe(fleet, parent, "claude", TAGS.workspace, {
      cwd: src,
    });
    const host = await hostReading();
    kit.check(
      "w1: a workspace delegate in the same run is bounded: PID 1 is bwrap and its PID namespace is not the host's",
      bounded.reading?.pid1.includes("bwrap") === true &&
        bounded.reading.pidns !== host.pidns,
      `${bounded.state}; delegate ${JSON.stringify(bounded.reading)}; host pidns ${host.pidns}`
    );
  },
};

export default spec;
