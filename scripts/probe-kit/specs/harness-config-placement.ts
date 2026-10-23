/**
 * One project's harness config reaches that project's sessions on Claude
 * Code, OpenCode and pi, through CawCo's launch config alone, and no other
 * project's session (core harness-config.ts, agent fleet-harness-set.ts). On
 * a scratch fleet (real hub, agent and sessiond; each harness against the
 * mock model), project A and project B each with a git checkout, A is given
 * through the admin tools' own hub routes:
 *
 * - a PreToolUse command hook on Bash whose script refuses a call carrying
 *   HCPROBE-CALL, saying its marker and the `tool_name` it was handed, and
 *   lets every other call run;
 * - a Notification hook, which OpenCode and pi raise no point for;
 * - Claude Code settings setting `env.HCPROBE_SETTING`;
 * - an OpenCode plugin (a module adding the tool `hcprobe_opencode_tool`);
 * - a pi extension (a module registering the tool `hcprobe_pi_tool`);
 * - a skill, fetched from a SKILL.md this spec serves on loopback.
 *
 * Then a Claude Code, an OpenCode and a pi delegate work in workspaces of A,
 * and a Claude Code session works in B's checkout. Each runs its shell twice:
 * `echo HCPROBE-CALL-<tag>`, then a print of `$HCPROBE_SETTING` and a sleep,
 * during which the spec reads its clone. Read where each harness sent its
 * requests, at the mock model:
 *
 * - p1. The hook ran in each of A's three sessions: the first call's result
 *   carries its marker with `tool=Bash` (OpenCode's `shell` and pi's `bash`
 *   by Claude Code's name, core HOOK_TOOL_NAMES).
 * - p2. The settings reached A's Claude Code session: its second call
 *   printed the value.
 * - p3. A's OpenCode session is offered the plugin's tool, A's pi session
 *   the extension's.
 * - p4. Each of A's sessions is offered the skill (its description in the
 *   request).
 * - p5. Nothing reached B's session: its first call ran (no marker), its
 *   setting is empty, and neither the skill nor either tool is in its
 *   requests.
 * - p6. `git status --porcelain` is empty in both checkouts and in each of
 *   A's workspace clones while its delegate runs, and none holds a
 *   `.claude/settings.json`.
 * - p7. The machine's row says the Notification hook unsupported, naming
 *   OpenCode and pi.
 *
 * Its delegates cut workspaces, so it runs on the host (README, "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts harness-config-placement
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import {
  type Harness,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
/** What the hook says when it refuses a call. */
const HOOK_MARK = `HCPROBE-HOOK-${RUN}`;
/** The value the settings row sets. */
const SETTING = `HCPROBE-SETTING-${RUN}`;
/** The skill's description, which a session offered it carries. */
const SKILL_MARK = `HCPROBE-SKILL-${RUN}`;
const SKILL = "hcprobe-skill";
const OPENCODE_TOOL = "hcprobe_opencode_tool";
const PI_TOOL = "hcprobe_pi_tool";
/** How a delegate's report to its parent opens (core `reportMarker`). */
const REPORT = "[Report from delegate ";
/** The shell as each harness names it. */
const SHELLS = ["Bash", "bash", "shell"];
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
/** How long the second call sleeps: the spec reads the clone meanwhile. */
const SLEEP_S = 60;

/** Each session's tag: its brief or its first message carries it. */
const TAGS = {
  claude: `HCPROBE-claude-${RUN}`,
  opencode: `HCPROBE-opencode-${RUN}`,
  pi: `HCPROBE-pi-${RUN}`,
  other: `HCPROBE-other-${RUN}`,
} as const;
type Leg = keyof typeof TAGS;

/** What one session showed the mock. */
interface Shown {
  /** Every request's body, in order. */
  bodies: string[];
  finished?: boolean;
  /** The first call's result. */
  first?: string;
  searched?: boolean;
  /** The second call's result. */
  second?: string;
  /** 1: the first call went out; 2: the second. */
  step: 0 | 1 | 2;
}
const shown = new Map<Leg, Shown>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

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

/** finish_item as the harness offers it: by its name, in OpenCode's Code Mode, or behind a search the first time. */
const finishCall = (request: Seen, leg: Shown): Reply => {
  const input = { headline: "Ran the probe.", summary: "Ran the probe." };
  const named = [
    "mcp__cawco__finish_item",
    "cawco_finish_item",
    "finish_item",
  ].find((name) => request.toolNames.includes(name));
  if (named) {
    leg.finished = true;
    return useTool(named, input);
  }
  if (request.toolNames.includes(CODE_MODE)) {
    leg.finished = true;
    return useTool(CODE_MODE, {
      code: `return await tools.cawco.finish_item(${JSON.stringify(input)});`,
    });
  }
  if (!leg.searched && request.toolNames.includes("ToolSearch")) {
    leg.searched = true;
    return useTool("ToolSearch", {
      query: "select:mcp__cawco__finish_item",
      max_results: 1,
    });
  }
  return text("Done.");
};

/** Each session's turn, by its tag: two shell calls, then finish_item for a delegate. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  const found = (Object.entries(TAGS) as [Leg, string][]).find(
    ([, one]) => request.all.includes(one) && !request.all.includes(REPORT)
  );
  if (!found) {
    return text("ok");
  }
  const [name, tag] = found;
  const leg = shown.get(name) ?? { bodies: [], step: 0 };
  shown.set(name, leg);
  leg.bodies.push(request.body);
  if (request.afterTool && leg.step === 1 && leg.first === undefined) {
    leg.first = lastToolResult(request.body);
  }
  if (request.afterTool && leg.step === 2 && leg.second === undefined) {
    leg.second = lastToolResult(request.body);
  }
  const shell = SHELLS.find((one) => request.toolNames.includes(one));
  if (leg.step === 0 && shell) {
    leg.step = 1;
    return useTool(shell, {
      command: `echo HCPROBE-CALL-${tag}`,
      description: "Probe the hook",
    });
  }
  if (leg.step === 1 && leg.first !== undefined && shell) {
    leg.step = 2;
    return useTool(shell, {
      command: `printf 'SETTING=[%s]\\n' "$HCPROBE_SETTING"; sleep ${SLEEP_S}`,
      description: "Print the setting",
      timeout: (SLEEP_S + 60) * 1000,
    });
  }
  if (leg.step === 2 && leg.second !== undefined && name !== "other") {
    return leg.finished ? text("Done.") : finishCall(request, leg);
  }
  return text("Done.");
};

/** The hook's script: a call carrying HCPROBE-CALL is refused with the marker and its `tool_name`. */
const HOOK_SCRIPT = [
  "#!/bin/bash",
  "input=$(cat)",
  'case "$input" in *HCPROBE-CALL*) ;; *) exit 0 ;; esac',
  `tool=$(printf '%s' "$input" | sed -n 's/.*"tool_name" *: *"\\([^"]*\\)".*/\\1/p')`,
  `echo "${HOOK_MARK} tool=$tool" >&2`,
  "exit 2",
].join("\n");

const OPENCODE_PLUGIN = `export default {
  id: "hcprobe.plugin",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: ${JSON.stringify(OPENCODE_TOOL)},
        description: "The harness config probe's OpenCode tool.",
        input: { type: "object", properties: {} },
        options: { codemode: false },
        async execute() { return { content: "ok" }; },
      });
    });
  },
};
`;

const PI_EXTENSION = `export default function (pi) {
  pi.registerTool({
    name: ${JSON.stringify(PI_TOOL)},
    label: ${JSON.stringify(PI_TOOL)},
    description: "The harness config probe's pi tool.",
    parameters: { type: "object", properties: {} },
    async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; },
  });
}
`;

/** The hub's own routes, which the admin tools call (admin-tools.ts). */
const hubCall = async (
  fleet: KitFleet,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  const read = await readWithin(30_000, async (signal) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    return { status: response.status, text: await response.text() };
  });
  if (read.kind === "unanswered") {
    throw new Error(`${method} ${path}: no answer within ${read.after} ms`);
  }
  if (read.value.status >= 400) {
    throw new Error(
      `${method} ${path}: ${read.value.status} ${read.value.text}`
    );
  }
  return JSON.parse(read.value.text || "null") as unknown;
};

/** A git checkout with one commit. */
const checkout = async (path: string): Promise<void> => {
  await Bun.$`mkdir -p ${path} && cd ${path} && git init -q -b main && printf 'probe\\n' > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit'`.quiet();
};

/** `git status --porcelain` of a folder: empty when clean. */
const porcelain = async (path: string): Promise<string> =>
  (
    await Bun.$`git -C ${path} status --porcelain`.quiet().nothrow().text()
  ).trim();

/** The machine's fleet report, as the hub keeps it. */
const reportOf = (fleet: KitFleet) =>
  JSON.parse(
    fleet.query<{ fleet: string | null }>(
      "SELECT fleet FROM agents WHERE machine_id = ?",
      MACHINE
    )[0]?.fleet ?? "{}"
  ) as {
    harnessConfig?: Record<string, { state: string; detail?: string }>;
    hooks?: Record<string, { state: string; detail?: string }>;
    skills?: Record<string, { state: string; detail?: string }>;
  };

/** Whether a folder is clean and holds no project settings file: `git status --porcelain`'s words, or "clean". */
const cleanAt = async (
  path: string
): Promise<{ clean: boolean; said: string }> => {
  const status = await porcelain(path);
  const settings = existsSync(projectClaudeDir(path, "settings.json"));
  return {
    clean: status === "" && !settings,
    said: `${status || "clean"}${settings ? "; holds a project settings file" : ""}`,
  };
};

/** A's rows, put through the routes the admin tools write by; the hook ids. */
const placeRows = async (
  fleet: KitFleet,
  projectId: string,
  skillSource: string
): Promise<{ hookId: string; notifyId: string }> => {
  const hookId = crypto.randomUUID();
  const notifyId = crypto.randomUUID();
  await hubCall(fleet, "PUT", `/api/fleet/hooks/${hookId}`, {
    name: `hcprobe marker ${RUN}`,
    enabled: true,
    event: "PreToolUse",
    matcher: "Bash",
    handler: { type: "command" },
    script: HOOK_SCRIPT,
    scope: "project",
    projectId,
  });
  await hubCall(fleet, "PUT", `/api/fleet/hooks/${notifyId}`, {
    name: `hcprobe notify ${RUN}`,
    enabled: true,
    event: "Notification",
    handler: { type: "command" },
    script: "#!/bin/bash\nexit 0",
    scope: "project",
    projectId,
  });
  await hubCall(fleet, "PUT", "/api/fleet/claude-settings/hcprobe", {
    settings: { env: { HCPROBE_SETTING: SETTING } },
    projectId,
  });
  await hubCall(fleet, "PUT", "/api/fleet/opencode-plugins/hcprobe", {
    module: OPENCODE_PLUGIN,
    projectId,
  });
  await hubCall(fleet, "PUT", "/api/fleet/pi-extensions/hcprobe", {
    module: PI_EXTENSION,
    projectId,
  });
  await hubCall(fleet, "PUT", `/api/fleet/skills/${SKILL}`, {
    source: skillSource,
    enabled: true,
    projectId,
  });
  return { hookId, notifyId };
};

/** 0: the hub fetched the skill, and the machine reports every row of A applied at A's checkout. */
const rowsHeld = async (
  kit: Kit,
  fleet: KitFleet,
  hookId: string
): Promise<void> => {
  const skillFetched = await until(
    "the skill fetched at the hub",
    async () =>
      (
        (await hubCall(fleet, "GET", "/api/fleet")) as {
          skills?: { name: string; hash?: string; error?: string }[];
        }
      ).skills?.find((one) => one.name === SKILL),
    (row) => Boolean(row?.hash || row?.error),
    60_000
  ).catch(() => undefined);
  kit.check(
    "0: the hub fetched the skill",
    Boolean(skillFetched?.hash),
    JSON.stringify(skillFetched ?? "no row")
  );
  const kinds = [
    "claudeSettings:hcprobe",
    "opencodePlugins:hcprobe",
    "piExtensions:hcprobe",
  ];
  const held = (report: ReturnType<typeof reportOf>): boolean =>
    kinds.every((key) => report.harnessConfig?.[key]?.state === "applied") &&
    report.hooks?.[hookId]?.state === "applied" &&
    report.skills?.[SKILL]?.state === "applied";
  const converged = await until(
    "A's checkout holds every row",
    () => reportOf(fleet),
    held,
    120_000
  ).catch(() => reportOf(fleet));
  kit.check(
    "0: the machine reports every row of A applied",
    held(converged),
    JSON.stringify({
      harnessConfig: converged.harnessConfig,
      hook: converged.hooks?.[hookId],
      skill: converged.skills?.[SKILL],
    })
  );
};

/** p1, p3, p4, p6: one of A's delegates, read while its second command sleeps. */
const readDelegate = async (
  kit: Kit,
  fleet: KitFleet,
  harness: Harness,
  item: string
): Promise<void> => {
  const leg = await until(
    `${harness}'s second call`,
    () => shown.get(harness),
    (one) => one?.step === 2,
    300_000
  ).catch(() => shown.get(harness));
  const workspace = fleet.query<{ path: string }>(
    "SELECT w.path FROM work_items i JOIN workspaces w ON w.id = i.workspace_id WHERE i.id = ?",
    item
  )[0]?.path;
  const clone = workspace ? await cleanAt(workspace) : undefined;
  kit.check(
    `p6: ${harness}'s workspace clone is clean while it runs, with no project settings file`,
    clone?.clean === true,
    clone?.said ?? "no workspace row"
  );
  kit.check(
    `p1: the hook ran in A's ${harness} session, on Claude Code's name for its shell`,
    leg?.first?.includes(`${HOOK_MARK} tool=Bash`) === true,
    leg?.first?.slice(0, 400) ?? "no first call answered"
  );
  const bodies = leg?.bodies.join("\n") ?? "";
  kit.check(
    `p4: A's ${harness} session is offered the skill`,
    bodies.includes(SKILL_MARK),
    bodies.includes(SKILL) ? "named, without its description" : "absent"
  );
  const tool = { opencode: OPENCODE_TOOL, pi: PI_TOOL, claude: undefined }[
    harness
  ];
  if (tool) {
    kit.check(
      `p3: A's ${harness} session is offered the ${harness === "pi" ? "extension's" : "plugin's"} tool`,
      bodies.includes(tool),
      "absent from its requests"
    );
  }
};

/** p2: A's Claude Code session printed the setting. */
const readSetting = async (kit: Kit): Promise<void> => {
  const leg = await until(
    "A's Claude Code second call answered",
    () => shown.get("claude"),
    (one) => one?.second !== undefined,
    (SLEEP_S + 60) * 1000
  ).catch(() => shown.get("claude"));
  kit.check(
    "p2: the settings reached A's Claude Code session",
    leg?.second?.includes(`SETTING=[${SETTING}]`) === true,
    leg?.second?.slice(0, 300) ?? "no second call answered"
  );
};

/** p5: nothing of A's reached B's session. */
const readOther = async (kit: Kit): Promise<void> => {
  const leg = await until(
    "B's second call answered",
    () => shown.get("other"),
    (one) => one?.second !== undefined,
    (SLEEP_S + 240) * 1000
  ).catch(() => shown.get("other"));
  const bodies = leg?.bodies.join("\n") ?? "";
  kit.check(
    "p5: B's first call ran, no hook refused it",
    leg?.first?.includes(`HCPROBE-CALL-${TAGS.other}`) === true &&
      !leg.first.includes(HOOK_MARK),
    leg?.first?.slice(0, 300) ?? "no first call answered"
  );
  kit.check(
    "p5: B's session has no setting of A's",
    leg?.second?.includes("SETTING=[]") === true,
    leg?.second?.slice(0, 300) ?? "no second call answered"
  );
  kit.check(
    "p5: B's requests carry neither A's skill nor its plugin's or extension's tool",
    bodies !== "" &&
      !(
        bodies.includes(SKILL_MARK) ||
        bodies.includes(OPENCODE_TOOL) ||
        bodies.includes(PI_TOOL)
      ),
    bodies ? "read" : "no request read"
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const repoA = join(fleet.sandbox, "code-a");
  const repoB = join(fleet.sandbox, "code-b");
  await checkout(repoA);
  await checkout(repoB);
  const projectA = await fleet.api<{ id: string }>("/api/projects", {
    name: "Harness config A",
    machineId: MACHINE,
    cwd: repoA,
  });
  const projectB = await fleet.api<{ id: string }>("/api/projects", {
    name: "Harness config B",
    machineId: MACHINE,
    cwd: repoB,
  });

  // The skill's source: a SKILL.md on loopback, which the hub fetches once.
  const source = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `---\nname: ${SKILL}\ndescription: ${SKILL_MARK} a probe skill placed for one project.\n---\n\nSay ok.\n`
      ),
  });
  let ids: { hookId: string; notifyId: string };
  try {
    ids = await placeRows(
      fleet,
      projectA.id,
      `http://127.0.0.1:${source.port}/SKILL.md`
    );
    await rowsHeld(kit, fleet, ids.hookId);
  } catch (error) {
    kit.check(
      "0: each row is placed through the hub's routes",
      false,
      error instanceof Error ? error.message : String(error)
    );
    return;
  } finally {
    source.stop(true);
  }

  // A's delegates, one per harness, each in a workspace of A; B's session
  // in its checkout.
  const parent = await fleet.spawn("claude", "Harness config parent", repoA, {
    projectId: projectA.id,
  });
  const harnesses: Harness[] = ["claude", "opencode", "pi"];
  const items = new Map<Harness, string>();
  for (const harness of harnesses) {
    // biome-ignore lint/performance/noAwaitInLoops: one delegate filed at a time
    const started = await fleet.api<{ workItemId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `harness config ${harness}`,
      prompt: `${TAGS[harness]}: run the probe's two commands, then finish.`,
      harness,
      model: MODEL[harness],
      cwd: repoA,
      lands: "none",
    });
    items.set(harness, started.workItemId);
  }
  const other = await fleet.spawn("claude", "Harness config B", repoB, {
    projectId: projectB.id,
  });
  await fleet.send(other, `${TAGS.other}: run the probe's two commands.`);

  for (const harness of harnesses) {
    // biome-ignore lint/performance/noAwaitInLoops: each delegate read while its second command sleeps
    await readDelegate(kit, fleet, harness, items.get(harness) ?? "");
  }
  await readSetting(kit);
  await readOther(kit);
  for (const [name, path] of [
    ["A", repoA],
    ["B", repoB],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one checkout at a time
    const held = await cleanAt(path);
    kit.check(
      `p6: ${name}'s checkout is clean, with no project settings file`,
      held.clean,
      held.said
    );
  }
  const notify = reportOf(fleet).hooks?.[ids.notifyId];
  kit.check(
    "p7: the machine's row says the Notification hook unsupported, for OpenCode and for pi",
    notify?.state === "unsupported" &&
      notify.detail?.includes("opencode: unsupported") === true &&
      notify.detail.includes("pi: unsupported"),
    JSON.stringify(notify ?? "no row")
  );

  for (const harness of harnesses) {
    // biome-ignore lint/performance/noAwaitInLoops: each item's end, in turn
    await until(
      `${harness}'s item ended`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE id = ?",
          items.get(harness) ?? ""
        )[0]?.state,
      (state) =>
        state === "done" || state === "failed" || state === "cancelled",
      (SLEEP_S + 120) * 1000
    ).catch(() => undefined);
  }
  await fleet.stopSession(other);
  await fleet.stopSession(parent);
};

const spec: Spec = {
  name: "harness-config-placement",
  host: "its delegates cut workspaces",
  run,
};

export default spec;
