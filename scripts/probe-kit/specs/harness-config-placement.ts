/**
 * One project's harness config reaches that project's sessions on Claude
 * Code, OpenCode and pi, through CawCo's launch config alone, and no other
 * project's session (core harness-config.ts, agent fleet-harness-set.ts). On
 * a scratch fleet (real hub, agent and sessiond; each harness against the
 * mock model), project A and project B each with a git checkout.
 *
 * First a Claude Code delegate of A ("rearm") starts with the fleet's hooks
 * dir gone, so its workspace's boundary holds none of it, runs one command
 * and waits. Then A is given, through the admin tools' own hub routes:
 *
 * - a PreToolUse command hook on Bash whose script refuses a call carrying
 *   HCPROBE-CALL, saying its marker and the `tool_name` it was handed;
 * - a PreToolUse command hook on Write that answers a write carrying
 *   HCPROBE-WRITE with a rewrite of its path to a folder outside every clone,
 *   and words for the model;
 * - a Notification hook, which OpenCode and pi raise no point for;
 * - Claude Code settings setting `env.HCPROBE_SETTING`;
 * - an OpenCode plugin (a module adding the tool `hcprobe_opencode_tool`);
 * - a pi extension (a module registering the tool `hcprobe_pi_tool`);
 * - a skill, fetched from a SKILL.md this spec serves on loopback.
 *
 * - r1. On Linux the rearm delegate's boundary is handed over once the hooks
 *   dir is made (agent boundary.ts `rearmMoved`): srt binds a read path only
 *   when it resolves. On macOS it is kept: Seatbelt grants the dir by path
 *   rule, there or not.
 * - r2. Told to go on, its next call meets the hook placed while it ran
 *   (claude.ts `#takeFleetSettings`), whose script its first boundary never
 *   held: the result carries the marker. It waits again.
 * - r3. The hooks dir is taken away while its boundary runs, and a fleet
 *   change has the sync make it again: on Linux the boundary, whose bind held
 *   the old dir, is handed over (its form names the dir's device and inode);
 *   on macOS it is kept, as in r1.
 * - r4. Told to go on, its next call meets the marker hook again.
 *
 * Then a Claude Code, an OpenCode and a pi delegate work in workspaces of A,
 * and a Claude Code session works in B's checkout: `echo HCPROBE-CALL-<tag>`,
 * a write of HCPROBE-WRITE-<tag>.txt into its clone (A's), then a print of
 * `$HCPROBE_SETTING` and a sleep, during which the spec reads the clone:
 *
 * - p1. The hook ran in each of A's three sessions: the first call's result
 *   carries its marker with `tool=Bash` (OpenCode's `shell` and pi's `bash`
 *   by Claude Code's name, core HOOK_TOOL_NAMES).
 * - p2. The settings reached A's Claude Code session: its print shows the
 *   value.
 * - p3. A's OpenCode session is offered the plugin's tool, A's pi session
 *   the extension's.
 * - p4. Each of A's sessions is offered the skill (its description in the
 *   request).
 * - p5. Nothing reached B's session: its first call ran (no marker), its
 *   setting is empty, and neither the skill nor either tool is in its
 *   requests.
 * - p6. `git status --porcelain` is empty in both checkouts and in each of
 *   A's workspace clones while its delegate runs (the probe's own write
 *   aside), and none holds a `.claude/settings.json` that sets anything: a
 *   Linux clone holds the boundary's `{}` stand-in for that deny path.
 * - p7. The machine's row says the Notification hook unsupported, naming
 *   OpenCode and pi.
 * - p8. In each of A's three sessions the rewrite hook ran (its words reached
 *   the model), the write landed where the model asked, in the clone, and
 *   nothing appeared at the rewritten path: a workspace session takes no
 *   input rewrite (agent fleet-hook-guard.ts, fleet-hook-run.ts).
 *
 * Its delegates cut workspaces, so it runs on the host (README, "A spec that
 * delegates runs on the host").
 *
 *   bun scripts/probe-kit/run.ts harness-config-placement
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { readRecord } from "../../../packages/core/src/state-file";
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
/** What the Bash hook says when it refuses a call. */
const HOOK_MARK = `HCPROBE-HOOK-${RUN}`;
/** What the Write hook says for the model as it asks its rewrite. */
const REWRITE_SEEN = `HCPROBE-REWRITE-SEEN-${RUN}`;
/** The value the settings row sets. */
const SETTING = `HCPROBE-SETTING-${RUN}`;
/** The skill's description, which a session offered it carries. */
const SKILL_MARK = `HCPROBE-SKILL-${RUN}`;
const SKILL = "hcprobe-skill";
const OPENCODE_TOOL = "hcprobe_opencode_tool";
const PI_TOOL = "hcprobe_pi_tool";
/** What tells the rearm delegate to go on, after its first wait and after its second. */
const GO = `HCPROBE-GO-${RUN}`;
const GO_AGAIN = `HCPROBE-GO-AGAIN-${RUN}`;
/** How a delegate's report to its parent opens (core `reportMarker`). */
const REPORT = "[Report from delegate ";
/** The shell as each harness names it. */
const SHELLS = ["Bash", "bash", "shell"];
/** `wait_item` as each harness offers it. */
const WAITS = ["mcp__cawco__wait_item", "cawco_wait_item", "wait_item"];
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
/** How long the setting's call sleeps: the spec reads the clone meanwhile. */
const SLEEP_S = 60;

/** Each session's tag: its brief or its first message carries it. */
const TAGS = {
  claude: `HCPROBE-claude-${RUN}`,
  opencode: `HCPROBE-opencode-${RUN}`,
  pi: `HCPROBE-pi-${RUN}`,
  other: `HCPROBE-other-${RUN}`,
  rearm: `HCPROBE-rearm-${RUN}`,
} as const;
type Leg = keyof typeof TAGS;

/** What a session does, in order: one tool call each, a wait ending its turn until the spec says go. */
type Act =
  | "call"
  | "write"
  | "setting"
  | "warm"
  | "wait"
  | "recall"
  | "waitAgain"
  | "finish";
const PLAN: Record<Leg, readonly Act[]> = {
  claude: ["call", "write", "setting", "finish"],
  opencode: ["call", "write", "setting", "finish"],
  pi: ["call", "write", "setting", "finish"],
  other: ["call", "setting"],
  rearm: ["warm", "wait", "call", "waitAgain", "recall", "finish"],
};
/** What a turn after each wait waits for. */
const GOES: Partial<Record<Act, string>> = { wait: GO, waitAgain: GO_AGAIN };

/** The file each of A's sessions writes into its clone. */
const writeName = (leg: Leg): string => `HCPROBE-WRITE-${TAGS[leg]}.txt`;

/** What one session showed the mock. */
interface Shown {
  /** The next act of its {@link PLAN}. */
  at: number;
  /** Every request's body, in order. */
  bodies: string[];
  /** The act whose call went out and whose result has not come back. */
  pending?: Act | "search";
  /** Each act's call's result. */
  results: Partial<Record<Act, string>>;
  /** The CawCo tools Claude Code's ToolSearch was asked for. */
  searched: Set<string>;
}
const shown = new Map<Leg, Shown>();

/** Each of A's delegates' clone, as the hub files its workspace: set once the fleet stands. */
let cloneOf: (leg: Leg) => string | undefined = () => undefined;

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

/**
 * A CawCo tool as the harness offers it (`finish_item`, `wait_item`): by its
 * name, in OpenCode's Code Mode, or behind a search the first time; none
 * when it is not offered.
 */
const cawcoCall = (
  request: Seen,
  leg: Shown,
  names: readonly string[],
  tool: string,
  input: object
): { call: Reply; searching: boolean } | undefined => {
  const named = names.find((name) => request.toolNames.includes(name));
  if (named) {
    return { call: useTool(named, input), searching: false };
  }
  if (request.toolNames.includes(CODE_MODE)) {
    return {
      call: useTool(CODE_MODE, {
        code: `return await tools.cawco.${tool}(${JSON.stringify(input)});`,
      }),
      searching: false,
    };
  }
  if (!leg.searched.has(tool) && request.toolNames.includes("ToolSearch")) {
    leg.searched.add(tool);
    return {
      call: useTool("ToolSearch", {
        query: `select:mcp__cawco__${tool}`,
        max_results: 1,
      }),
      searching: true,
    };
  }
};

/** The write each harness's file tool takes: Claude Code's `Write`, OpenCode 2.0.29's and pi's `write` (both `path`). */
const writeCall = (request: Seen, path: string): Reply | undefined => {
  if (request.toolNames.includes("Write")) {
    return useTool("Write", { file_path: path, content: "kept" });
  }
  return request.toolNames.includes("write")
    ? useTool("write", { path, content: "kept" })
    : undefined;
};

/** One act's call, by the tools the session is offered; none when it cannot make it. */
const actCall = (
  request: Seen,
  name: Leg,
  leg: Shown,
  act: Act
): { call: Reply; searching?: boolean } | undefined => {
  const shell = SHELLS.find((one) => request.toolNames.includes(one));
  const tag = TAGS[name];
  switch (act) {
    case "warm":
      return shell
        ? { call: useTool(shell, { command: `echo ${tag} warm` }) }
        : undefined;
    case "call":
    case "recall":
      return shell
        ? {
            call: useTool(shell, {
              command: `echo HCPROBE-CALL-${tag} ${act}`,
              description: "Probe the hook",
            }),
          }
        : undefined;
    case "setting":
      return shell
        ? {
            call: useTool(shell, {
              command: `printf 'SETTING=[%s]\\n' "$HCPROBE_SETTING"${name === "other" ? "" : `; sleep ${SLEEP_S}`}`,
              description: "Print the setting",
              timeout: (SLEEP_S + 60) * 1000,
            }),
          }
        : undefined;
    case "write": {
      const clone = cloneOf(name);
      const call = clone
        ? writeCall(request, join(clone, writeName(name)))
        : undefined;
      return call ? { call } : undefined;
    }
    case "wait":
    case "waitAgain":
      return cawcoCall(request, leg, WAITS, "wait_item", {
        minutes: 60,
        reason: "The probe drives this delegate.",
      });
    case "finish":
      return cawcoCall(
        request,
        leg,
        ["mcp__cawco__finish_item", "cawco_finish_item", "finish_item"],
        "finish_item",
        { headline: "Ran the probe.", summary: "Ran the probe." }
      );
    default: {
      const unhandled: never = act;
      throw new Error(`unhandled act: ${String(unhandled)}`);
    }
  }
};

/** Each session's turn, by its tag: its {@link PLAN}, one call a request. */
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
  const [name] = found;
  const leg = shown.get(name) ?? {
    at: 0,
    bodies: [],
    results: {},
    searched: new Set(),
  };
  shown.set(name, leg);
  leg.bodies.push(request.body);
  if (request.afterTool && leg.pending) {
    if (leg.pending !== "search") {
      leg.results[leg.pending] = lastToolResult(request.body);
    }
    leg.pending = undefined;
  }
  const act = PLAN[name][leg.at];
  // The rearm delegate's turn after a wait ends until it is told to go.
  const go = GOES[PLAN[name][leg.at - 1] as Act];
  if (!act || (go !== undefined && !request.all.includes(go))) {
    return text("Waiting for the probe.");
  }
  const made = actCall(request, name, leg, act);
  if (!made) {
    return text(`No tool for ${act}: ${request.toolNames.join(", ")}`);
  }
  if (made.searching) {
    leg.pending = "search";
  } else {
    leg.pending = act;
    leg.at += 1;
  }
  return made.call;
};

/** The Bash hook's script: a call carrying HCPROBE-CALL is refused with the marker and its `tool_name`. */
const HOOK_SCRIPT = [
  "#!/bin/bash",
  "input=$(cat)",
  'case "$input" in *HCPROBE-CALL*) ;; *) exit 0 ;; esac',
  `tool=$(printf '%s' "$input" | sed -n 's/.*"tool_name" *: *"\\([^"]*\\)".*/\\1/p')`,
  `echo "${HOOK_MARK} tool=$tool" >&2`,
  "exit 2",
].join("\n");

/** The Write hook's script: a write carrying HCPROBE-WRITE is answered with a rewrite to `outside`, and words for the model. */
const rewriteScript = (outside: string): string =>
  [
    "#!/bin/bash",
    "input=$(cat)",
    'case "$input" in *HCPROBE-WRITE*) ;; *) exit 0 ;; esac',
    `printf '%s\\n' '${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: REWRITE_SEEN,
        updatedInput: {
          file_path: join(outside, "rewritten.txt"),
          content: "rewritten",
        },
      },
    })}'`,
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

/** `git status --porcelain` of a folder, the probe's own writes left out: empty when clean. */
const porcelain = async (path: string): Promise<string> =>
  (await Bun.$`git -C ${path} status --porcelain`.quiet().nothrow().text())
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.includes("HCPROBE-WRITE-"))
    .join("\n");

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

/**
 * What a folder's `.claude/settings.json` sets: none when it is absent or
 * an empty object, which a Linux workspace's clone holds while its boundary
 * runs (the stand-in srt binds onto itself for the deny path, `{}`: core
 * workspace-policy.ts `cloneDenies`, agent boundary-host.ts `standIn`).
 */
const settingsAt = (path: string): string | undefined => {
  const file = projectClaudeDir(path, "settings.json");
  if (!existsSync(file)) {
    return;
  }
  const held = readFileSync(file, "utf8");
  try {
    const parsed: unknown = JSON.parse(held);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    ) {
      return;
    }
  } catch {
    // Said below as it stands.
  }
  return held.slice(0, 200);
};

/** Whether a folder is clean and its project settings file sets nothing: `git status --porcelain`'s words, or "clean". */
const cleanAt = async (
  path: string
): Promise<{ clean: boolean; said: string }> => {
  const status = await porcelain(path);
  const settings = settingsAt(path);
  return {
    clean: status === "" && settings === undefined,
    said: `${status || "clean"}${settings === undefined ? "" : `; its project settings file sets ${settings}`}`,
  };
};

/** The ids A's rows went in under. */
interface Placed {
  hookId: string;
  notifyId: string;
  rewriteId: string;
}

/** A's rows, put through the routes the admin tools write by. */
const placeRows = async (
  fleet: KitFleet,
  projectId: string,
  skillSource: string,
  outside: string
): Promise<Placed> => {
  const placed: Placed = {
    hookId: crypto.randomUUID(),
    notifyId: crypto.randomUUID(),
    rewriteId: crypto.randomUUID(),
  };
  const hook = (id: string, fields: object) =>
    hubCall(fleet, "PUT", `/api/fleet/hooks/${id}`, {
      enabled: true,
      handler: { type: "command" },
      scope: "project",
      projectId,
      ...fields,
    });
  await hook(placed.hookId, {
    name: `hcprobe marker ${RUN}`,
    event: "PreToolUse",
    matcher: "Bash",
    script: HOOK_SCRIPT,
  });
  await hook(placed.rewriteId, {
    name: `hcprobe rewrite ${RUN}`,
    event: "PreToolUse",
    matcher: "Write",
    script: rewriteScript(outside),
  });
  await hook(placed.notifyId, {
    name: `hcprobe notify ${RUN}`,
    event: "Notification",
    script: "#!/bin/bash\nexit 0",
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
  return placed;
};

/** 0: the hub fetched the skill, and the machine reports every row of A applied. */
const rowsHeld = async (
  kit: Kit,
  fleet: KitFleet,
  placed: Placed
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
    report.hooks?.[placed.hookId]?.state === "applied" &&
    report.hooks?.[placed.rewriteId]?.state === "applied" &&
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
      hook: converged.hooks?.[placed.hookId],
      rewrite: converged.hooks?.[placed.rewriteId],
      skill: converged.skills?.[SKILL],
    })
  );
};

/** A delegate filed under the parent, on `harness`, in a workspace of A's checkout. */
const delegate = async (
  fleet: KitFleet,
  parent: string,
  name: Leg,
  harness: Harness,
  repo: string
): Promise<string> =>
  (
    await fleet.api<{ workItemId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `harness config ${name}`,
      prompt: `${TAGS[name]}: run the probe's commands, then finish.`,
      harness,
      model: MODEL[harness],
      cwd: repo,
      lands: "none",
    })
  ).workItemId;

/** A work item's workspace: its id, clone and session. */
const workspaceOf = (fleet: KitFleet, item: string) =>
  fleet.query<{ id: string; path: string; instance: string }>(
    "SELECT w.id AS id, w.path AS path, i.instance_id AS instance FROM work_items i JOIN workspaces w ON w.id = i.workspace_id WHERE i.id = ?",
    item
  )[0];

/** The generation a workspace's running boundary is of, from its record. */
const generationOf = async (
  fleet: KitFleet,
  workspace: string
): Promise<string | undefined> =>
  (
    await readRecord<{ gen: string }>(
      join(
        fleet.env.HOME as string,
        ".cawco",
        "workspaces",
        workspace,
        "boundary.json"
      )
    ).catch(() => undefined)
  )?.gen;

/** The fleet's hooks dir on the scratch machine (core `fleetHooksDir`). */
const hooksDirOf = (fleet: KitFleet): string =>
  join(fleet.env.XDG_DATA_HOME as string, "cawco", "fleet-hooks");

/** What a bind of the hooks dir holds: its device and inode, or none. */
const heldBy = (path: string): string | undefined => {
  const held = statSync(path, { throwIfNoEntry: false });
  return held ? `${held.dev}:${held.ino}` : undefined;
};

/** macOS's boundary is Seatbelt's: it grants a read path by rule, there or not. */
const SEATBELT = process.platform === "darwin";

/**
 * Whether a running boundary took the hooks dir once it moved, and the
 * generation it is of: on Linux a later one, srt's bind holding the dir as
 * it stood when the sandbox started (agent boundary.ts `syncedPresence`); on
 * macOS the same one, Seatbelt granting the dir by its path rule
 * (`(allow file-read* (subpath …))`, agent boundary-policy.ts
 * `seatbeltProfile`), so it is never handed over for it.
 */
const tookMove = async (
  fleet: KitFleet,
  workspace: string,
  before: string | undefined
): Promise<{ gen: string | undefined; took: boolean }> => {
  if (SEATBELT) {
    const gen = await generationOf(fleet, workspace);
    return { gen, took: gen !== undefined && gen === before };
  }
  const gen = await until(
    "the boundary handed over",
    () => generationOf(fleet, workspace),
    (now) => now !== undefined && now !== before,
    120_000
  ).catch(() => undefined);
  return { gen, took: gen !== undefined && gen !== before };
};

/** What {@link tookMove} asks of this OS's boundary, for a check's name. */
const TOOK = SEATBELT
  ? "kept, Seatbelt granting the dir by path"
  : "handed over, srt binding the dir as it stood";

/**
 * r0: the rearm delegate, started with the fleet's hooks dir gone: its
 * workspace and the generation its boundary started as, once it waits.
 */
const startRearm = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  repo: string
): Promise<{ gen: string | undefined; item: string; workspace: string }> => {
  const hooksDir = hooksDirOf(fleet);
  await rm(hooksDir, { recursive: true, force: true });
  const item = await delegate(fleet, parent, "rearm", "claude", repo);
  await until(
    "the rearm delegate waits",
    () => shown.get("rearm"),
    (leg) => (leg?.at ?? 0) >= 2 && leg?.pending === undefined,
    300_000
  ).catch(() => undefined);
  const workspace = workspaceOf(fleet, item)?.id ?? "";
  kit.check(
    "r0: the rearm delegate's boundary started with no fleet hooks dir",
    workspace !== "" && !existsSync(hooksDir),
    existsSync(hooksDir)
      ? `${hooksDir} was made before the place's rows`
      : workspace || "no workspace row"
  );
  return { gen: await generationOf(fleet, workspace), item, workspace };
};

/** r1, r2: once the rows are placed, the rearm delegate's boundary is handed over, and its next call meets the hook. */
const readRearm = async (
  kit: Kit,
  fleet: KitFleet,
  started: { gen: string | undefined; item: string; workspace: string }
): Promise<void> => {
  const { gen, took } = await tookMove(fleet, started.workspace, started.gen);
  kit.check(
    `r1: the rearm delegate's boundary, once the hooks dir was made: ${TOOK}`,
    took,
    `started as ${started.gen ?? "none"}, now ${gen ?? "none"}`
  );
  const instance = workspaceOf(fleet, started.item)?.instance;
  if (instance) {
    await fleet.send(instance, `${GO}: go on.`);
  }
  const leg = await until(
    "the rearm delegate's call after the hook was placed",
    () => shown.get("rearm"),
    (one) => one?.results.call !== undefined,
    180_000
  ).catch(() => shown.get("rearm"));
  kit.check(
    "r2: a hook placed while a Claude Code session ran fired on its next call, from a script its first boundary never held",
    leg?.results.call?.includes(`${HOOK_MARK} tool=Bash`) === true,
    leg?.results.call?.slice(0, 400) ?? "no call answered"
  );
};

/**
 * r3, r4: with the rearm delegate waiting again, the hooks dir taken away
 * under its running boundary and made again by the sync a fleet change
 * brings: the boundary is handed over, and its next call meets the hook.
 */
const readRecreated = async (
  kit: Kit,
  fleet: KitFleet,
  started: { item: string; workspace: string },
  notifyId: string
): Promise<void> => {
  await until(
    "the rearm delegate waits again",
    () => shown.get("rearm"),
    (waiting) =>
      (waiting?.at ?? 0) >= PLAN.rearm.indexOf("recall") &&
      waiting?.pending === undefined,
    180_000
  ).catch(() => undefined);
  const hooksDir = hooksDirOf(fleet);
  const before = {
    gen: await generationOf(fleet, started.workspace),
    dir: heldBy(hooksDir),
  };
  await rm(hooksDir, { recursive: true, force: true });
  // A fleet change: the machine's next sync makes the dir and its scripts
  // again (agent fleet.ts `syncHooks`).
  await hubCall(fleet, "PUT", `/api/fleet/hooks/${notifyId}`, {
    name: `hcprobe notify ${RUN} again`,
  });
  const after = await until(
    "the hooks dir made again",
    () => heldBy(hooksDir),
    (held) => held !== undefined,
    120_000
  ).catch(() => undefined);
  const { gen, took } = await tookMove(fleet, started.workspace, before.gen);
  kit.check(
    `r3: the rearm delegate's boundary, the hooks dir made again under it: ${TOOK}`,
    took && after !== undefined && after !== before.dir,
    JSON.stringify({ gen: [before.gen, gen], dir: [before.dir, after] })
  );
  const instance = workspaceOf(fleet, started.item)?.instance;
  if (instance) {
    await fleet.send(instance, `${GO_AGAIN}: go on.`);
  }
  const leg = await until(
    "the rearm delegate's call after the dir was made again",
    () => shown.get("rearm"),
    (one) => one?.results.recall !== undefined,
    180_000
  ).catch(() => shown.get("rearm"));
  kit.check(
    "r4: its next call meets the marker hook from the dir made again",
    leg?.results.recall?.includes(`${HOOK_MARK} tool=Bash`) === true,
    leg?.results.recall?.slice(0, 400) ?? "no call answered"
  );
};

/** p1, p3, p4, p6, p8: one of A's delegates, read while its setting's call sleeps. */
const readDelegate = async (
  kit: Kit,
  harness: Harness,
  outside: string
): Promise<void> => {
  const leg = await until(
    `${harness}'s setting call`,
    () => shown.get(harness),
    (one) => one?.pending === "setting",
    300_000
  ).catch(() => shown.get(harness));
  const clone = cloneOf(harness);
  const held = clone ? await cleanAt(clone) : undefined;
  kit.check(
    `p6: ${harness}'s workspace clone is clean while it runs, with no project settings file`,
    held?.clean === true,
    held?.said ?? "no workspace row"
  );
  kit.check(
    `p1: the hook ran in A's ${harness} session, on Claude Code's name for its shell`,
    leg?.results.call?.includes(`${HOOK_MARK} tool=Bash`) === true,
    leg?.results.call?.slice(0, 400) ?? "no call answered"
  );
  const bodies = leg?.bodies.join("\n") ?? "";
  const landed = clone ? existsSync(join(clone, writeName(harness))) : false;
  const escaped = readdirSync(outside);
  kit.check(
    `p8: in A's ${harness} session the rewrite hook ran, the write landed where asked, and nothing at the rewritten path`,
    bodies.includes(REWRITE_SEEN) && landed && escaped.length === 0,
    JSON.stringify({
      hookSaid: bodies.includes(REWRITE_SEEN),
      landedInClone: landed,
      outside: escaped,
      write: leg?.results.write?.slice(0, 200),
    })
  );
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
    "A's Claude Code setting call answered",
    () => shown.get("claude"),
    (one) => one?.results.setting !== undefined,
    (SLEEP_S + 60) * 1000
  ).catch(() => shown.get("claude"));
  kit.check(
    "p2: the settings reached A's Claude Code session",
    leg?.results.setting?.includes(`SETTING=[${SETTING}]`) === true,
    leg?.results.setting?.slice(0, 300) ?? "no setting call answered"
  );
};

/** p5: nothing of A's reached B's session. */
const readOther = async (kit: Kit): Promise<void> => {
  const leg = await until(
    "B's setting call answered",
    () => shown.get("other"),
    (one) => one?.results.setting !== undefined,
    240_000
  ).catch(() => shown.get("other"));
  const bodies = leg?.bodies.join("\n") ?? "";
  kit.check(
    "p5: B's first call ran, no hook refused it",
    leg?.results.call?.includes(`HCPROBE-CALL-${TAGS.other}`) === true &&
      !leg.results.call.includes(HOOK_MARK),
    leg?.results.call?.slice(0, 300) ?? "no call answered"
  );
  kit.check(
    "p5: B's session has no setting of A's",
    leg?.results.setting?.includes("SETTING=[]") === true,
    leg?.results.setting?.slice(0, 300) ?? "no setting call answered"
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
  // The agent's welcome converge is done before the hooks dir is taken away.
  await until(
    "the machine's first fleet report",
    () => reportOf(fleet).hooks,
    Boolean,
    120_000
  ).catch(() => undefined);

  const repoA = join(fleet.sandbox, "code-a");
  const repoB = join(fleet.sandbox, "code-b");
  const outside = join(fleet.sandbox, "hcprobe-outside");
  await checkout(repoA);
  await checkout(repoB);
  await mkdir(outside, { recursive: true });
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
  const parent = await fleet.spawn("claude", "Harness config parent", repoA, {
    projectId: projectA.id,
  });
  const items = new Map<Leg, string>();
  cloneOf = (leg) => {
    const item = items.get(leg);
    return item ? workspaceOf(fleet, item)?.path : undefined;
  };
  const rearm = await startRearm(kit, fleet, parent, repoA);
  items.set("rearm", rearm.item);

  // The skill's source: a SKILL.md on loopback, which the hub fetches once.
  const source = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `---\nname: ${SKILL}\ndescription: ${SKILL_MARK} a probe skill placed for one project.\n---\n\nSay ok.\n`
      ),
  });
  let placed: Placed;
  try {
    placed = await placeRows(
      fleet,
      projectA.id,
      `http://127.0.0.1:${source.port}/SKILL.md`,
      outside
    );
    await rowsHeld(kit, fleet, placed);
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
  await readRearm(kit, fleet, rearm);
  await readRecreated(kit, fleet, rearm, placed.notifyId);

  // A's delegates, one per harness, each in a workspace of A; B's session
  // in its checkout.
  const harnesses: Harness[] = ["claude", "opencode", "pi"];
  for (const harness of harnesses) {
    // biome-ignore lint/performance/noAwaitInLoops: one delegate filed at a time
    items.set(harness, await delegate(fleet, parent, harness, harness, repoA));
  }
  const other = await fleet.spawn("claude", "Harness config B", repoB, {
    projectId: projectB.id,
  });
  await fleet.send(other, `${TAGS.other}: run the probe's commands.`);

  for (const harness of harnesses) {
    // biome-ignore lint/performance/noAwaitInLoops: each delegate read while its setting's call sleeps
    await readDelegate(kit, harness, outside);
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
  const notify = reportOf(fleet).hooks?.[placed.notifyId];
  kit.check(
    "p7: the machine's row says the Notification hook unsupported, for OpenCode and for pi",
    notify?.state === "unsupported" &&
      notify.detail?.includes("opencode: unsupported") === true &&
      notify.detail.includes("pi: unsupported"),
    JSON.stringify(notify ?? "no row")
  );

  for (const [name, item] of items) {
    // biome-ignore lint/performance/noAwaitInLoops: each item's end, in turn
    await until(
      `${name}'s item ended`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE id = ?",
          item
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
