/**
 * CawCo's OpenCode 2.0 plugin: what every OpenCode server CawCo starts loads
 * (named in its launch config's `plugins`), and the source its gate form is
 * computed over ({@link gateForm}). The agent writes it, bundled with the
 * parts of core and of its own it shares (the fleet's hooks, run as pi's
 * are), as `index.js` beside the `settings.json` it reads
 * (opencode-plugin.ts `writePlugin`); it runs in OpenCode's process, so what
 * it takes of the agent's types is only types, and of its machine only the
 * settings.
 *
 * A 2.0 plugin is a directory holding a `package.json` and the module it
 * names, whose default export is `{ id, setup(ctx) }` (a bare file is refused:
 * "configured plugin path must be a directory", observed on 2.0.28). `setup`
 * runs once per location, as the location first boots, with `ctx.location`
 * naming it. It carries every duty 1.x's bridge plugin had, on 2.0's hooks
 * (opencode.ai/v2/docs/build/plugins/migrate-v1):
 *
 * - `ctx.tool.hook("execute.before")`: the workspace judge, the fleet's
 *   PreToolUse command hooks (the agent's fleet-harness-set.ts, run as its
 *   fleet-hook-run.ts runs them for pi), and the session credential stamped
 *   into each `cawco_*` MCP call (`__cawco`). It runs for
 *   every call, the calls a Code Mode program makes through `execute`
 *   included (settled #1: "plugin tool hooks on nested Code Mode calls —
 *   YES, both fire"). A throw refuses the call; assigning `input` replaces
 *   what the tool receives.
 * - `ctx.tool.hook("execute.after")`: the fleet's PostToolUse and
 *   PostToolUseFailure command hooks; each output of a workspace session's
 *   call too long to hand the model, cut as OpenCode cuts it with the full
 *   output saved in the session's own folder (`cutInto`), and what each call
 *   of a Code Mode program answered, written
 *   onto the program's own result as `metadata.calls` (2.0 keeps each call's
 *   name, input and status on the program, `metadata.toolCalls`, never what
 *   it returned). A program that throws still ends `completed`, with
 *   `metadata.error` (observed on 2.0.28), so its calls are written the same
 *   way. A nested call carries the program's own call id, so a program's
 *   calls are kept by tool name in the order they started, each matched to
 *   its answer by the very input object OpenCode hands both hooks.
 * - `ctx.tool.transform`: in a workspace's clone the `shell` that runs every command through the workspace's executor,
 *   inside its boundary, in place of the built-in (2.0's id for the shell
 *   tool is `shell`, settled #2). Each call is asked first as the built-in
 *   asks, through `ctx.permission.assert` (2.0.29, anomalyco/opencode#54930:
 *   "the same permission engine as built-in tools: configured rules, saved
 *   'always allow' decisions, and the native approval prompt"), action
 *   `shell` and the command in its metadata: a conversation's call is the hub's
 *   gate's to decide. The server pins the built-in's description
 *   for the model, so a clone's session context gives it the boundary's. A
 *   location serves every session in its folder, so in a place (core
 *   `isPlace`) the `shell` decides per session (`context.sessionID`): the
 *   place's own sessions, the ones the agent records with that place (opencode-
 *   credentials.ts `workspace`), and any not recorded yet, run inside it;
 *   a person's session there runs through the built-in it replaces, which
 *   asks and runs on the host as it always does, with no judge.
 * - `ctx.tool.transform` again, and `ctx.event.subscribe`: every location's
 *   `shell` wrapped so a send of the person's own words (the agent's
 *   {@link SEND_NOW_METADATA} on its prompt, seen as its
 *   `session.inbox.enqueued`) moves the running command aside: its call
 *   answers at once in words that name no one, the command runs on, and its
 *   output reaches the session as a synthetic message when it ends
 *   (`asideShell`).
 * - `ctx.event.subscribe` and `ctx.session.synthetic`: after each compaction
 *   of a CawCo session in this location (its `session.compaction.ended`),
 *   its open items, word for word, read from the hub's `open_items` tool
 *   with the session's credential, as synthetic input that starts no turn
 *   (`listOpenItems`), as Claude Code's SessionStart hook on `compact` and
 *   pi's `compaction_end` list theirs. OpenCode 2.0.29 has no
 *   `experimental.session.compacting` hook (1.x's); its 2.0 hook on the
 *   summary request, `ctx.session.hook("compaction")`, would hand the
 *   records to the summary model to reword, where this lists them as they
 *   are.
 * - `ctx.shell.hook("create.before")`: every shell a session's `shell` call
 *   opens acts as that session (its instance and credential, for `cawco
 *   tool` and git), and none gets the server's password or CawCo's wiring.
 *   The hook names no session, so the session is the one whose `shell` call
 *   with this very command was just made in this location.
 * - The fleet's OpenCode plugins and its project's placed at the location
 *   (the agent's fleet-harness-config.ts), each module's `setup` handed
 *   this location's `ctx` before CawCo's own hooks register.
 * - `ctx.mcp.transform`: the project MCP servers CawCo placed; in a
 *   workspace's location every fleet server with a command reached through
 *   the workspace's MCP gate on the agent (mcp-gate.ts), which runs it on
 *   the host, chrome-devtools through the workspace's browser door, as the
 *   workspace's Claude Code and pi sessions reach them; and every other
 *   local server started on the machine's own data dir.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CODE_MODE_TOOL } from "@cawco/core/ask-tools";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import type { FleetMcpConfig } from "@cawco/core/fleet";
import {
  type HookEvent,
  type HookVerdict,
  hookToolCall,
  hookToolInputBack,
} from "@cawco/core/hooks";
import { SESSION_CAWCO_ENV } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import type * as Judge from "@cawco/core/workspace-judge";
import { hubClient, refusalText, unwrap } from "@cawco/hub/client";
import type { Plugin } from "@opencode/plugin";
import type { FleetHarnessSet } from "../fleet-harness-set";
import { dueHooks, runFleetHooks } from "../fleet-hook-run";
import type { FleetMcpSet } from "../fleet-mcp-set";
import type { FleetPlaceSet } from "../fleet-place-set";
import type { SetHarnessConfig, SetHook } from "../fleet-set-rows";
import type { HeldCredential } from "./opencode-credentials";

/**
 * Everything the plugin takes of the agent that is not a type: the machine's
 * paths and CawCo's names, written by the agent as `settings.json` beside the
 * module (opencode-plugin.ts `pluginSettings`), so a change to any of them is
 * a new plugin directory and a new gate form.
 */
export interface PluginSettings {
  /** The Chrome DevTools MCP server's name, which a location of no workspace launches none of. */
  chromeDevtools: string;
  /** The file of this agent's OpenCode sessions' credentials, by session. */
  credentialsFile: string;
  /** The fleet's hooks and OpenCode plugins as the agent's last sync wrote them. */
  fleetHarnessSet: string;
  /** The fleet's MCP servers as the agent's last sync wrote them. */
  fleetMcp: string;
  /** Each place's file of the project rows its sessions take. */
  fleetPlaces: string;
  /** The gateway's path to a workspace's MCP gate. */
  gatePrefix: string;
  /** The key the agent's gateway's hosted MCP servers answer to. */
  hostKeyFile: string;
  /** The agent's gateway, where the hub's tools and the MCP gate are reached. */
  hubBase: string;
  /** The workspace judge's file name in a workspace's state dir. */
  judgeScript: string;
  /** The data dir every shell and local MCP server of every server reads as `XDG_DATA_HOME`. */
  machineData: string;
  /** How long an MCP server gets to start and list its tools, ms. */
  mcpConnectMs: number;
  /** The hub's tool that lists a session's open items. */
  openItemsTool: string;
  /** What a workspace's name ends in when it is a place (core `PLACE_SUFFIX`). */
  placeSuffix: string;
  /** The plugin's id. */
  pluginId: string;
  /** The location the agent reads through, where every MCP server is off. */
  quietDir: string;
  /** The metadata the agent puts on a send of the person's own words. */
  sendNowMetadata: string;
  /** The folder of a workspace's state dir that holds a session's saved outputs. */
  spillsDirName: string;
  /** The workspace policy's file name in a workspace's state dir. */
  workspacePolicyName: string;
  /** The records of the workspaces the agent has cut. */
  workspaces: string;
}

/** The `shell` description the model reads in a session a workspace's boundary holds. */
const BOUNDED_SHELL_DESCRIPTION =
  "Runs a bash command inside this workspace's boundary, in the session's directory unless workdir says otherwise. The command can write only the clone, $TMPDIR (the workspace's own scratch dir: temp files go there, not /tmp) and the workspaces' own package cache; it reads nothing in the home dir outside the clone, toolchains and the user's git config, and none of the credentials CawCo, the harnesses and the machine's tools keep; it reaches any public host but none of the owner's machines (cawco tools reaches the hub's tools); it sees and signals only this workspace's processes, and cannot reach the service manager. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The `shell` a person's session in a place sees: the built-in's, on this machine. */
const HOST_SHELL_DESCRIPTION =
  "Runs a bash command on this machine, in the session's directory unless workdir says otherwise. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The `metadata.source` of the synthetic input that lists a session's open items after its compaction. */
const OPEN_ITEMS_SOURCE = "cawco-open-items";

/** A JSON file's parse, as it stands; `unknown` until a check says what it is. */
const parsed = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const settings: PluginSettings = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./settings.json", import.meta.url)),
    "utf8"
  )
);

// This server's password authenticates every request to it: no shell or MCP
// server it starts inherits it.
delete process.env.OPENCODE_SERVER_PASSWORD;

// Where this server saves a tool output it cuts (its own data dir's
// `opencode/tool-output`, observed on 2.0.28): every session's, which the
// judge denies each workspace session.
const toolOutput = join(
  process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
  "opencode",
  "tool-output"
);
const realOf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
// Where every workspace's clone is cut (the agent's createWorkspace).
const worktrees = realOf(join(homedir(), ".worktrees"));

/** A workspace and the clone it holds. */
interface Holding {
  id: string;
  root: string;
}

// The workspace whose clone holds `directory`, by the records the agent keeps
// for it outside the clone: `create.json`, written before the clone is cut and
// removed only with it, and the running boundary's `boundary.json`, the first
// that names a path. The clone itself or any directory inside it, both at
// their real paths, whole path segments only; of clones inside one another,
// the deepest (the agent's workspaceHolding, workspace-records.ts). A
// workspace whose records are damaged, so that none names its clone, still
// holds a directory inside a clone cut for it (`~/.worktrees/<repo>-<id8>`):
// that is refused, never run outside its boundary.
const viewWorkspace = process.env[CAWCO_ENV.viewWorkspace];

/** The folder a workspace's record names; a record that names none is thrown as unreadable. */
const pathIn = (file: string): string => {
  const record = parsed(file);
  if (!(isRecord(record) && typeof record.path === "string")) {
    throw new Error("it names no folder");
  }
  return record.path;
};

const viewHolding = (id: string, directory: string): Holding | undefined => {
  let path: string;
  try {
    path = pathIn(`${settings.workspaces}/${id}/create.json`);
  } catch (error) {
    throw new Error(
      `cawco: workspace ${id}'s record could not be read (${said(error)}), so this did not run.`,
      { cause: error }
    );
  }
  const root = realOf(path);
  const at = realOf(directory);
  if (at === root || at.startsWith(`${root}/`)) {
    return { id, root };
  }
  // The location the agent reads through runs no session's tools.
  if (at === realOf(settings.quietDir)) {
    return undefined;
  }
  throw new Error(
    `cawco: ${directory} is outside ${root}, the folder workspace ${id}'s server serves, so this did not run.`
  );
};

/** The folder `id`'s records name, and what damages them when none does. */
const recordedPath = (
  id: string
): { damage?: string; path: string | undefined } => {
  let damage: string | undefined;
  for (const name of ["create.json", "boundary.json"]) {
    const file = `${settings.workspaces}/${id}/${name}`;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    try {
      const record: unknown = JSON.parse(text);
      if (record === null) {
        throw new TypeError("it is null");
      }
      if (isRecord(record) && typeof record.path === "string") {
        return { path: record.path };
      }
    } catch (error) {
      damage ??= `${file} is damaged (${said(error)})`;
    }
  }
  return { path: undefined, ...(damage ? { damage } : {}) };
};

const workspaceOf = (directory: string): Holding | undefined => {
  // A server a workspace's Linux view runs (the agent's opencode.ts
  // #ensureView), entered into the view: every session of it is that
  // workspace's, in its folder at the folder's own path, where every other
  // view's and the person's own sessions are too, so no path names it. A
  // directory outside that folder is refused, never run outside its boundary.
  if (viewWorkspace) {
    return viewHolding(viewWorkspace, directory);
  }
  let ids: string[] = [];
  try {
    ids = readdirSync(settings.workspaces);
  } catch {
    return undefined;
  }
  const at = realOf(directory);
  let found: Holding | undefined;
  const damaged: { damage: string; id: string }[] = [];
  for (const id of ids) {
    const { path, damage } = recordedPath(id);
    if (path === undefined) {
      if (damage) {
        damaged.push({ id, damage });
      }
      continue;
    }
    // A Linux view of a folder (the agent's layer.ts) is the person's folder
    // at its own path, shared with every other view of it and the person's
    // own sessions: it holds no directory here.
    if (formOf(id) === "overlay") {
      continue;
    }
    const root = realOf(path);
    if (
      (at === root || at.startsWith(`${root}/`)) &&
      !(found && found.root.length >= root.length)
    ) {
      found = { id, root };
    }
  }
  if (found) {
    return found;
  }
  const [top] = (
    at.startsWith(`${worktrees}/`) ? at.slice(worktrees.length + 1) : ""
  ).split("/");
  const hit = damaged.find(({ id }) => top?.endsWith(`-${id.slice(0, 8)}`));
  if (hit) {
    throw new Error(
      `cawco: workspace ${hit.id}'s record is damaged: ${hit.damage}. Archive the workspace to remove it.`
    );
  }
  return undefined;
};

/** The form of a workspace's view of its folder, when its `layer.json` says one. */
const formOf = (id: string): unknown => {
  try {
    const layer = parsed(`${settings.workspaces}/${id}/layer.json`);
    return isRecord(layer) ? layer.form : undefined;
  } catch {
    return undefined;
  }
};

/** A running boundary's record: the executor that runs a command inside it, and the prefix that runs a hook. */
interface HeldBoundary {
  exec: string;
  path: string;
  prefix?: string;
}

// The workspace's boundary as it stands at the call. None means the command
// does not run: never the built-in shell, which would run it outside.
const boundaryOf = (id: string, root: string): HeldBoundary => {
  let held: unknown;
  try {
    held = parsed(`${settings.workspaces}/${id}/boundary.json`);
  } catch (error) {
    throw new Error(
      `cawco: workspace ${id}'s boundary could not be read (${said(error)}), so this command did not run. The workspace's next session starts it again.`,
      { cause: error }
    );
  }
  if (
    !isRecord(held) ||
    typeof held.path !== "string" ||
    realOf(held.path) !== root ||
    typeof held.exec !== "string"
  ) {
    throw new Error(
      `cawco: workspace ${id}'s boundary record does not name this clone, so this command did not run.`
    );
  }
  return {
    exec: held.exec,
    path: held.path,
    ...(typeof held.prefix === "string" ? { prefix: held.prefix } : {}),
  };
};

// Judges a call of workspace `id`'s session by the workspace's policy, and
// throws its refusal. A judge or policy that cannot be read refuses it too.
const judgeIn = async (
  id: string,
  tool: string,
  input: unknown,
  directory: string
): Promise<void> => {
  const state = `${settings.workspaces}/${id}`;
  let judge: typeof Judge;
  let policy: Judge.Policy;
  try {
    judge = await import(`${state}/${settings.judgeScript}`);
    policy = judge.readPolicy(`${state}/${settings.workspacePolicyName}`);
  } catch (error) {
    throw new Error(
      `cawco: ${tool} was refused: workspace ${id}'s file policy could not be read (${said(error)}).`,
      { cause: error }
    );
  }
  const verdict = judge.judgeCall(policy, {
    harness: "opencode",
    tool,
    input,
    cwd: directory,
    toolOutput,
  });
  if (!verdict.ok) {
    throw new Error(verdict.reason);
  }
};

// OpenCode's own cut of a tool output too long to hand the model, as 2.0.29
// runs it (ToolOutput `truncate`: its default 2000 lines and 51200 bytes,
// the lines that fit kept, then "[showing lines 1-N of M; full output saved
// to <file>]"), done here for a workspace session's call so the full output
// is saved in the session's own folder: the server's tool-output dir holds
// every session's, by call id alone, and no workspace reads it. OpenCode cuts
// only after every `execute.after` hook has run, and leaves alone a result
// whose metadata names `truncated` ("if(D.metadata?.truncated!==void 0)
// return D"), so the result this answers is never cut again.
const OUTPUT_LINES = 2000;
const OUTPUT_BYTES = 51_200;

/** What a tool call answers. */
interface ToolResult {
  content?: string | readonly ContentBlock[];
  metadata?: Readonly<Record<string, unknown>>;
  output?: unknown;
}
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "file"; uri: string; mime: string; name?: string };

const contentOf = (result: ToolResult): readonly ContentBlock[] =>
  typeof result.content === "string" || result.content === undefined
    ? [{ type: "text", text: String(result.content ?? "") }]
    : result.content;

const textOfBlocks = (content: readonly ContentBlock[]): string =>
  content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");

// The session's own folder in workspace `id` (the agent's workspaceSpillDir,
// made as the session spawned), which its boundary reads, its shell too (a
// line longer than `read` shows is read by the shell); none for a session
// CawCo did not launch, whose output OpenCode cuts as it always does.
const spillFolder = (id: string, instanceId: string): string | undefined => {
  const folder = `${settings.workspaces}/${id}/${settings.spillsDirName}/${instanceId}`;
  return existsSync(folder) ? folder : undefined;
};

/** The lines of `text` that fit OpenCode's cut, and every line it has. */
const keptLines = (lines: string[]): string[] => {
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines.slice(0, OUTPUT_LINES)) {
    const size = Buffer.byteLength(line, "utf-8") + (kept.length > 0 ? 1 : 0);
    if (bytes + size > OUTPUT_BYTES) {
      break;
    }
    kept.push(line);
    bytes += size;
  }
  return kept;
};

/** `content` cut after `kept` lines' worth of text, with `hint` where the cut falls. */
const cutContent = (
  content: readonly ContentBlock[],
  kept: string[],
  hint: string
): ContentBlock[] => {
  const cut: ContentBlock[] = [];
  let left = kept.join("\n").length;
  let joined = false;
  let hinted = false;
  for (const block of content) {
    if (block.type !== "text") {
      cut.push(block);
      continue;
    }
    if (joined && left > 0) {
      left -= 1;
    }
    joined = true;
    if (left >= block.text.length) {
      cut.push(block);
      left -= block.text.length;
      continue;
    }
    if (left > 0) {
      cut.push({ ...block, text: block.text.slice(0, left) });
    }
    if (!hinted) {
      cut.push({ type: "text", text: hint });
    }
    left = 0;
    hinted = true;
  }
  if (!hinted) {
    cut.push({ type: "text", text: hint });
  }
  return cut;
};

// `result` cut as OpenCode cuts it, its full output saved as `name` in the
// folder `folderOf` answers (asked only for a result to cut); as it is, its
// metadata marked, when nothing needs cutting or the session has no folder.
const cutInto = async (
  result: ToolResult,
  name: string,
  folderOf: () => Promise<string | undefined>
): Promise<ToolResult> => {
  if (result.metadata?.truncated !== undefined) {
    return result;
  }
  const content = contentOf(result);
  const text = textOfBlocks(content);
  const lines = text.split("\n");
  if (text.endsWith("\n")) {
    lines.pop();
  }
  if (
    lines.length <= OUTPUT_LINES &&
    Buffer.byteLength(text, "utf-8") <= OUTPUT_BYTES
  ) {
    return { ...result, metadata: { ...result.metadata, truncated: false } };
  }
  const folder = await folderOf();
  if (!folder) {
    return result;
  }
  const kept = keptLines(lines);
  const file = `${folder}/tool_${name.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  writeFileSync(file, text);
  const hint = `[showing ${kept.length > 0 ? `lines 1-${kept.length}` : "0 lines"} of ${lines.length}; full output saved to ${file}]`;
  return {
    ...result,
    content: cutContent(content, kept, hint),
    metadata: { ...result.metadata, truncated: true, outputPath: file },
  };
};

// Each session's CawCo identity, by OpenCode session id, as the agent records
// it when the session opens, with its doors to the container runtimes
// (DOCKER_HOST, CONTAINER_HOST: agent session-containers.ts) and a host-scope
// delegate's scratch dir, its TMPDIR (agent host-scratch.ts).
const sessionHeld = (
  sessionID: string
): Partial<HeldCredential> | undefined => {
  try {
    const stored: Record<string, HeldCredential | undefined> = JSON.parse(
      readFileSync(settings.credentialsFile, "utf8")
    );
    return stored[sessionID];
  } catch {
    return undefined;
  }
};
const sessionEnv = (sessionID: string): Record<string, string> => {
  const held = sessionHeld(sessionID);
  return held
    ? {
        ...held.containerEnv,
        ...(held.tmp ? { TMPDIR: held.tmp } : {}),
        ...(held.instanceId ? { [CAWCO_ENV.instanceId]: held.instanceId } : {}),
        ...(held.credential
          ? { [CAWCO_ENV.sessionCredential]: held.credential }
          : {}),
      }
    : {};
};
// What every shell and local MCP server gets: the machine's own data dir, no
// password, and none of CawCo's wiring but what the session's own tools read.
const cleanEnv = (
  env: Record<string, string | undefined>
): Record<string, string | undefined> => {
  Reflect.deleteProperty(env, "OPENCODE_SERVER_PASSWORD");
  for (const name of Object.keys(env)) {
    if (name.startsWith("CAWCO_") && !SESSION_CAWCO_ENV.includes(name)) {
      Reflect.deleteProperty(env, name);
    }
  }
  env.XDG_DATA_HOME = settings.machineData;
  return env;
};
const withoutSecret = (input: unknown): unknown => {
  if (!isRecord(input)) {
    return input;
  }
  const { __cawco, ...rest } = input;
  return rest;
};

const OUTPUT_LIMIT = 30_000;

/** What `shell` is called with. */
interface ShellInput {
  command: string;
  description?: string;
  timeout?: number;
  workdir?: string;
}

/** A tool call's context, as far as the shell reads it. */
interface CallContext {
  readonly agent: string;
  readonly id: string;
  readonly messageID: string;
  readonly progress: (update: Record<string, unknown>) => Promise<void>;
  readonly sessionID: string;
  readonly signal: AbortSignal;
}

// Runs `file args` as one `shell` call of the session: its env, its
// timeout and abort, its output cut at OUTPUT_LIMIT.
const runShell = async (
  file: string,
  args: string[],
  input: ShellInput,
  context: CallContext,
  directory: string
): Promise<ToolResult> => {
  const timeout = Math.min(input.timeout ?? 120_000, 600_000);
  const env = {
    ...cleanEnv({ ...process.env }),
    ...sessionEnv(context.sessionID),
  };
  const child = spawn(file, args, {
    cwd: input.workdir ?? directory,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const take = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  // Its own group (`detached`), by a pid its spawn made: core's signal wall
  // (signal.ts) cannot be imported here, so its rule is kept by hand.
  const stop = (): void => {
    const leader = spawnedPid(child);
    if (leader !== undefined) {
      signalGroup(leader, "SIGKILL");
    }
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeout);
  context.signal.addEventListener("abort", stop, { once: true });
  const exit = await new Promise<number | NodeJS.Signals | null>((resolve) => {
    child.on("error", (error) => {
      output += String(error);
      resolve(127);
    });
    child.on("close", (code, signal) => resolve(code ?? signal));
  });
  clearTimeout(timer);
  context.signal.removeEventListener("abort", stop);
  const cut =
    output.length > OUTPUT_LIMIT
      ? `${output.slice(0, OUTPUT_LIMIT)}\n[output cut at ${OUTPUT_LIMIT} characters]`
      : output;
  const notes =
    (timedOut ? `\n[killed after ${timeout}ms]` : "") +
    (exit === 0 ? "" : `\n[exit ${exit}]`);
  return {
    content: cut + notes,
    metadata: { exit, description: input.description ?? "" },
  };
};

// The file of the deepest place at or above `directory` (the agent's
// fleet-place-set.ts placeSetAt), by the folder as named and as its real
// path: none when no place holds it, or its file cannot be read.
const placeAt = (directory: string): FleetPlaceSet | undefined => {
  const ups = (path: string): string[] => {
    const all: string[] = [];
    for (let at = path; ; at = dirname(at)) {
      all.push(at);
      if (dirname(at) === at) {
        return all;
      }
    }
  };
  for (const folder of new Set([
    ...ups(directory),
    ...ups(realOf(directory)),
  ])) {
    let text: string;
    try {
      text = readFileSync(
        join(settings.fleetPlaces, `${encodeURIComponent(folder)}.json`),
        "utf8"
      );
    } catch {
      continue;
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  return undefined;
};
// The names of the fleet's servers for `directory`, its own and its
// place's copies: in a workspace's location each one with a command goes
// through the workspace's MCP gate. None when the set cannot be read.
const fleetNames = (directory: string): Set<string> => {
  let set: Partial<FleetMcpSet>;
  try {
    set = JSON.parse(readFileSync(settings.fleetMcp, "utf8"));
  } catch {
    return new Set();
  }
  return new Set([
    ...Object.keys(set.servers ?? {}),
    ...Object.keys(placeAt(directory)?.mcp ?? {}),
  ]);
};
// The host key, or none when the agent has made none yet: then no fleet
// server with a command is reached in a workspace's location.
const hostKey = (): string | undefined => {
  try {
    return readFileSync(settings.hostKeyFile, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
};

/** The fleet's own hooks and OpenCode plugins, or none when the set cannot be read. */
const harnessSet = (): Partial<FleetHarnessSet> => {
  try {
    return JSON.parse(readFileSync(settings.fleetHarnessSet, "utf8"));
  } catch {
    return {};
  }
};

// The fleet's hooks (the agent's fleet-harness-set.ts hooksAt): the fleet's
// own and those of the place holding `directory`, read at each call so a
// change reaches a running session. None when the set cannot be read.
const fleetHooks = (directory: string): SetHook[] => {
  const set = harnessSet();
  if (!set.hooks) {
    return [];
  }
  return [
    ...Object.values(set.hooks),
    ...Object.values(placeAt(directory)?.hooks ?? {}),
  ];
};
// The fleet's OpenCode plugins for `directory` (the agent's
// fleet-harness-set.ts configAt): the fleet's own, then those of the place
// holding it, each a module file the agent's sync made ready (its
// fleet-harness-config.ts).
const fleetPlugins = (
  directory: string
): (SetHarnessConfig & { entry: string })[] => {
  const set = harnessSet();
  if (!set.config) {
    return [];
  }
  return [
    ...Object.values(set.config),
    ...Object.values(placeAt(directory)?.config ?? {}),
  ].flatMap((row) =>
    row.kind === "opencodePlugins" && typeof row.entry === "string"
      ? [{ ...row, entry: row.entry }]
      : []
  );
};
// One placed server as OpenCode takes it (the agent's opencode.ts toOpencodeMcp).
const opencodeMcp = (config: FleetMcpConfig) => {
  const timeout = {
    startup: settings.mcpConnectMs,
    catalog: settings.mcpConnectMs,
  };
  return "url" in config
    ? {
        type: "remote" as const,
        url: config.url,
        oauth: false as const,
        timeout,
        ...(config.headers ? { headers: config.headers } : {}),
      }
    : {
        type: "local" as const,
        command: [config.command, ...(config.args ?? [])],
        timeout,
        ...(config.env ? { environment: config.env } : {}),
      };
};

type Context = Plugin.Context;
type ToolEditor = Parameters<Parameters<Context["tool"]["transform"]>[0]>[0];
type ToolInfo = Parameters<ToolEditor["add"]>[0];

/** `input` as a `shell` call's, which its schema holds to an object with a command. */
const shellInputOf = (input: unknown): ShellInput => {
  if (!(isRecord(input) && typeof input.command === "string")) {
    throw new Error("cawco: a shell call named no command, so it did not run.");
  }
  return {
    command: input.command,
    ...(typeof input.description === "string"
      ? { description: input.description }
      : {}),
    ...(typeof input.timeout === "number" ? { timeout: input.timeout } : {}),
    ...(typeof input.workdir === "string" ? { workdir: input.workdir } : {}),
  };
};

// The `shell` of a location a workspace holds. A session `bounded` there is
// asked as the built-in asks (`shell`, the command its resource and in its
// metadata, for CawCo's ask and a conversation's gate), then runs the command inside
// the workspace's boundary; any other (a person's session in a place)
// runs it through `host`, the built-in this replaces, which asks and runs as
// it always does on the host. No call runs without its ask.
const boundedShell = (
  id: string,
  root: string,
  directory: string,
  bounded: (sessionID: string) => boolean,
  host: ToolInfo["execute"] | undefined,
  permission: Context["permission"]
): ToolInfo => ({
  name: "shell",
  description: BOUNDED_SHELL_DESCRIPTION,
  input: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to run" },
      timeout: {
        type: "number",
        description:
          "Milliseconds before the command is killed: 120000 unless given, at most 600000",
      },
      workdir: {
        type: "string",
        description:
          "The directory to run in; the session's directory unless given",
      },
      description: {
        type: "string",
        description: "What the command does, in 5-10 words",
      },
    },
    required: ["command"],
  },
  options: { codemode: false },
  async execute(call, context) {
    const input = shellInputOf(call);
    if (bounded(context.sessionID)) {
      // A deny or a rejection throws, and the command does not run.
      await permission.assert({
        sessionID: context.sessionID,
        agent: context.agent,
        source: {
          type: "tool",
          messageID: context.messageID,
          id: context.id,
        },
        action: "shell",
        resources: [input.command],
        save: [input.command],
        metadata: {
          command: input.command,
          ...(input.description ? { description: input.description } : {}),
          ...(input.workdir ? { workdir: input.workdir } : {}),
        },
      });
      const held = boundaryOf(id, root);
      // A session's command: it shows the workspace's notice first.
      return await runShell(
        held.exec,
        ["--session", input.command],
        input,
        context,
        directory
      );
    }
    if (!host) {
      throw new Error(
        `cawco: this location has no built-in shell to run a command outside workspace ${id}'s boundary, so it did not run.`
      );
    }
    // Its words and metadata; not its structured `output`, which this tool
    // declares no schema for (the server refuses such a result).
    const { output: _output, ...result } = await host(call, context);
    return result;
  },
});

// Each session's running `shell` calls a send of the person's own words
// moves aside, by OpenCode session id: each call's move.
const asideShells = new Map<string, Set<() => void>>();
const moveAside = (sessionID: string): void => {
  for (const move of [...(asideShells.get(sessionID) ?? [])]) {
    move();
  }
};
const textOf = (result: ToolResult | undefined): string =>
  textOfBlocks(contentOf(result ?? {}));
let asideCount = 0;
// The `shell` `base` is, which a send of the person's own words moves aside
// (marked by the agent's `sendNowMetadata`): its call answers at once, in words
// that name no one, while the command runs on, its own abort no longer the
// call's; its end reaches the session as a message of its own carrying its
// output (`session`: the location's ctx.session), which starts a turn when
// none runs. Only the `shell`: an MCP server's tools are called from Code
// Mode programs (`execute`, no tool a plugin's transform is handed, 2.0.29),
// whose program reads each call's answer. OpenCode's own move
// (`session.background`) tells the model "User requested that active
// blocking work be moved to the background", which no one did, so CawCo
// never asks it.
const asideShell = (base: ToolInfo, session: Context["session"]): ToolInfo => ({
  name: "shell",
  description: base.description,
  input: base.input,
  ...(base.options ? { options: base.options } : {}),
  async execute(call, context) {
    const input = shellInputOf(call);
    const own = new AbortController();
    const forward = (): void => own.abort(context.signal.reason);
    if (context.signal.aborted) {
      own.abort(context.signal.reason);
    } else {
      context.signal.addEventListener("abort", forward, { once: true });
    }
    let moved = false;
    const running = Promise.resolve().then(() =>
      base.execute(call, {
        ...context,
        signal: own.signal,
        progress: (update) =>
          moved ? Promise.resolve() : context.progress(update),
      })
    );
    const moves = asideShells.get(context.sessionID) ?? new Set<() => void>();
    asideShells.set(context.sessionID, moves);
    return await new Promise((resolve, reject) => {
      const settle = (): void => {
        moves.delete(move);
        if (moves.size === 0) {
          asideShells.delete(context.sessionID);
        }
        context.signal.removeEventListener("abort", forward);
      };
      const move = (): void => {
        if (moved) {
          return;
        }
        moved = true;
        settle();
        asideCount += 1;
        const id = `cawco-shell-${Date.now().toString(36)}-${asideCount}`;
        const named = `Background command ${id} (${JSON.stringify(input.command)})`;
        resolve({
          content: `Command moved to the background (ID: ${id}) so that a message that arrived while it was running can reach you; it was not interrupted. Its result is delivered to you automatically when it finishes; carry on without waiting for it.`,
          metadata: {
            background: id,
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
          },
        });
        const tell = (text: string): Promise<unknown> =>
          session
            .synthetic({
              sessionID: context.sessionID,
              text,
              description: named,
              metadata: { source: "cawco-shell", id },
              resume: true,
            })
            .catch((error: unknown) => {
              console.error(
                `cawco: telling session ${context.sessionID} that ${named} ended failed: ${said(error)}`
              );
            });
        running.then(
          (result) => tell(`${named} finished. Its output:\n${textOf(result)}`),
          (error: unknown) => tell(`${named} failed: ${said(error)}`)
        );
      };
      moves.add(move);
      running.then(
        (result) => {
          if (moved) {
            return;
          }
          settle();
          // Its words and metadata; not a structured `output`, which this
          // tool declares no schema for (the server refuses such a result).
          const { output: _output, ...answer } = result;
          resolve(answer);
        },
        (error: unknown) => {
          if (moved) {
            return;
          }
          settle();
          reject(error);
        }
      );
    });
  },
});

/** The location a plugin is set up for, and which of its sessions a workspace's boundary holds. */
interface Here {
  bounded: (sessionID: string) => boolean;
  directory: string;
  holding: Holding | undefined;
  inPlace: boolean;
  workspace: string | undefined;
}

const hereOf = (directory: string): Here => {
  // A session anywhere inside a workspace's clone is that workspace's.
  const holding = workspaceOf(directory);
  const workspace = holding?.id;
  // In a place, a session is bounded by it only when the agent put it
  // there (its spawn named the place: the workspace its record names), or
  // before the agent has recorded it at all, never unbounded on a guess.
  // Every session in a clone is the clone's.
  const inPlace = workspace?.endsWith(settings.placeSuffix) === true;
  const bounded = (sessionID: string): boolean => {
    if (!holding) {
      return false;
    }
    if (!inPlace) {
      return true;
    }
    const held = sessionHeld(sessionID);
    return !held || held.workspace === workspace;
  };
  return { bounded, directory, holding, inPlace, workspace };
};

// The fleet's OpenCode plugins and its project's, each set up first, with
// this location's ctx: a plugin handed another's ctx registers its hooks
// and tools as that one does (observed on 2.0.29: a plugin's
// `ctx.shell.hook("create.before")`, registered through CawCo's ctx,
// fired for the location's shell). CawCo's own register after them. One
// that fails to load or set up is said on the server's log, and CawCo's
// plugin goes on. The location the agent reads through runs none.
//
// Each is handed this ctx with one change: in a bounded session its
// execute.before hooks get a copy of the call, so an input they change
// is dropped (the workspace's judge judged the call as asked, below); a
// refusal they throw still refuses.
const placedCtxOf = (ctx: Context, here: Here): Context => ({
  ...ctx,
  tool: {
    ...ctx.tool,
    hook: (name, fn) =>
      ctx.tool.hook(name, (event) => {
        if (name !== "execute.before" || !here.bounded(event.sessionID)) {
          return fn(event);
        }
        let input: unknown;
        try {
          input = structuredClone(event.input);
        } catch {
          input = JSON.parse(JSON.stringify(event.input ?? null));
        }
        return fn({ ...event, input });
      }),
  },
});

const setUpFleetPlugins = async (ctx: Context, here: Here): Promise<void> => {
  if (realOf(here.directory) === realOf(settings.quietDir)) {
    return;
  }
  const placed = placedCtxOf(ctx, here);
  for (const row of fleetPlugins(here.directory)) {
    try {
      // One after another: each registers its hooks before the next sets up.
      const loaded: unknown = await import(row.entry);
      const plugin = isRecord(loaded) ? (loaded.default ?? loaded) : loaded;
      if (!(isRecord(plugin) && typeof plugin.setup === "function")) {
        throw new Error("its module exports no { setup }");
      }
      await plugin.setup(placed);
    } catch (error) {
      console.error(
        `cawco: the fleet's OpenCode plugin ${row.name} (${row.entry}) did not load: ${said(error)}`
      );
    }
  }
};

/** What a session's parentage answers: the CawCo session a session is, or a subagent of. */
const lineageOf = (
  ctx: Context
): ((sessionID: string) => Promise<string | undefined>) => {
  // Each session's parent, as its server keeps it: a subagent's outputs are
  // the CawCo session's that started it. A session's parent never changes.
  const parents = new Map<string, string | undefined>();
  const parentOf = async (sessionID: string): Promise<string | undefined> => {
    if (parents.has(sessionID)) {
      return parents.get(sessionID);
    }
    const session = await ctx.session.get({ sessionID });
    parents.set(
      sessionID,
      typeof session.parentID === "string" ? session.parentID : undefined
    );
    return parents.get(sessionID);
  };
  // The CawCo session a session is, or a subagent of: the first of its
  // lineage the agent recorded.
  return async (sessionID) => {
    const seen: string[] = [];
    for (
      let at: string | undefined = sessionID;
      at && !seen.includes(at);
      at = await parentOf(at)
    ) {
      const held = sessionHeld(at);
      if (typeof held?.instanceId === "string") {
        return held.instanceId;
      }
      seen.push(at);
    }
  };
};

const wrapShells = async (ctx: Context, here: Here): Promise<void> => {
  await ctx.tool.transform((editor) => {
    // In a place, the built-in runs a person's session's commands: taken
    // from the editor before it is replaced, each time it replays. Every
    // location's `shell` is one a send of the person's own words moves aside.
    const host = editor.get("shell");
    const shell = here.holding
      ? boundedShell(
          here.holding.id,
          here.holding.root,
          here.directory,
          here.bounded,
          here.inPlace ? host?.execute : undefined,
          ctx.permission
        )
      : host;
    if (shell?.execute) {
      editor.add(asideShell(shell, ctx.session));
    }
  });
};

// A CawCo session's open items, word for word, after each of its
// compactions: what the hub's open_items tool answers, read with the
// session's own credential (the agent's delegation.ts callDelegationTool),
// written as synthetic input that starts no turn and reaches the model
// with its next step. A session of another location, or one the agent
// holds no credential for (a person's own, a subagent's), is not this
// location's to list.
const listOpenItems = async (
  ctx: Context,
  directory: string,
  sessionID: string
): Promise<void> => {
  const held = sessionHeld(sessionID);
  if (
    typeof held?.instanceId !== "string" ||
    typeof held.credential !== "string" ||
    !held.credential
  ) {
    return;
  }
  const session = await ctx.session.get({ sessionID });
  if (realOf(session.location?.directory ?? "") !== realOf(directory)) {
    return;
  }
  const answer = unwrap(
    await hubClient(settings.hubBase, fetch, {
      headers: { Authorization: `Bearer ${held.credential}` },
    })
      .api.delegation.call({ instanceId: held.instanceId })
      .post({ name: settings.openItemsTool, arguments: {} }),
    // A refusal is the hub's problem: its sentence is its `detail`.
    (refusal) =>
      new Error(`the hub answered ${refusal.status}: ${refusalText(refusal)}`)
  );
  const text = answer.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  if (answer.isError) {
    throw new Error(text);
  }
  await ctx.session.synthetic({
    sessionID,
    text,
    description: "Open items",
    metadata: { source: OPEN_ITEMS_SOURCE },
    resume: false,
  });
};

// A send of the person's own words admitted to a session's inbox moves its
// running shell commands aside, so the turn's next step reads it; a
// compaction's end lists the session's open items.
const watchEvents = (ctx: Context, directory: string): AbortController => {
  const events = new AbortController();
  const watch = async (): Promise<void> => {
    try {
      for await (const event of ctx.event.subscribe({
        signal: events.signal,
      })) {
        if (
          event.type === "session.inbox.enqueued" &&
          event.data?.item?.type === "user" &&
          event.data.item.payload?.metadata?.[settings.sendNowMetadata] === true
        ) {
          moveAside(event.data.sessionID);
        }
        if (
          event.type === "session.compaction.ended" &&
          typeof event.data?.sessionID === "string"
        ) {
          const { sessionID } = event.data;
          listOpenItems(ctx, directory, sessionID).catch((error: unknown) => {
            console.error(
              `cawco: session ${sessionID}'s open items could not be listed after its compaction: ${said(error)}`
            );
          });
        }
      }
    } catch (error) {
      if (!events.signal.aborted) {
        console.error(
          `cawco: the server's events stopped reaching the plugin, so a send no longer moves a running command aside: ${said(error)}`
        );
      }
    }
  };
  watch().catch((error: unknown) => {
    console.error(`cawco: watching the server's events failed: ${said(error)}`);
  });
  return events;
};

// The project MCP servers CawCo placed at the deepest place holding
// `directory` (its place's file), set where the location's config names
// no server by that name.
const placeMcp = (
  editor: Parameters<Parameters<Context["mcp"]["transform"]>[0]>[0],
  directory: string
): void => {
  for (const [name, config] of Object.entries(placeAt(directory)?.mcp ?? {})) {
    if (!editor.get(name)) {
      editor.set(name, opencodeMcp(config));
    }
  }
};

type McpEditor = Parameters<Parameters<Context["mcp"]["transform"]>[0]>[0];
type McpServer = ReturnType<McpEditor["list"]>[number][1];

/** What a location of a workspace reaches its local servers by. */
interface McpGate {
  /** The fleet's servers a workspace's gate runs on the host. */
  gated: Set<string>;
  /** The key the gate answers to, once the agent has made one. */
  key: string | undefined;
  workspace: string | undefined;
}

// One local server of a location: through the workspace's gate when the gate
// runs it, off when it is a browser tool, else on the machine's data dir.
const settleLocal = (
  editor: McpEditor,
  gate: McpGate,
  name: string,
  timeout: McpServer["timeout"]
): void => {
  if (gate.gated.has(name)) {
    editor.remove(name);
    if (gate.key && gate.workspace) {
      editor.set(name, {
        type: "remote",
        url: `${settings.hubBase}${settings.gatePrefix}${encodeURIComponent(gate.workspace)}/${encodeURIComponent(name)}`,
        oauth: false,
        ...(timeout ? { timeout } : {}),
        headers: { Authorization: `Bearer ${gate.key}` },
      });
    }
    return;
  }
  if (name === settings.chromeDevtools) {
    editor.remove(name);
    return;
  }
  editor.update(name, (server) => {
    if (server.type === "local") {
      server.environment = {
        ...server.environment,
        XDG_DATA_HOME: settings.machineData,
      };
    }
  });
};

const transformMcp = async (ctx: Context, here: Here): Promise<void> => {
  await ctx.mcp.transform((editor) => {
    // Servers kept from a location are removed: 2.0.29 starts one set
    // `enabled = false` (2026-10-22, a stdio fixture writing its pid; v2's
    // field is `disabled`, opencode.ai/v2/docs/mcp-servers), and keeps a
    // `disabled` one listed, which a status read would take for a verdict.
    // The agent's reads of this server run here, and need no MCP server.
    if (realOf(here.directory) === realOf(settings.quietDir)) {
      for (const [name] of [...editor.list()]) {
        editor.remove(name);
      }
      return;
    }
    placeMcp(editor, here.directory);
    // In a workspace's location the agent runs each fleet server with a
    // command, on the host, one process for the workspace, chrome-devtools
    // through its browser door (the agent's mcp-host.ts): the location
    // dials its gate, and starts none of them itself. A location in no
    // workspace has no door, so it launches no browser tool.
    const gate: McpGate = {
      gated: here.workspace ? fleetNames(here.directory) : new Set<string>(),
      key: here.workspace ? hostKey() : undefined,
      workspace: here.workspace,
    };
    for (const [name, config] of [...editor.list()]) {
      if (config.type === "local") {
        settleLocal(editor, gate, name, config.timeout);
      }
    }
  });
};

/** One Code Mode program's calls, in the order they started. */
interface ProgramCall {
  content?: unknown;
  input: unknown;
  isError?: true;
  structuredContent?: unknown;
  tool: string;
}
interface Program {
  calls: ProgramCall[];
  slots: WeakMap<object, number>;
}

/** A shell call made in this location whose shell has yet to open. */
interface PendingShell {
  command: string;
  sessionID: string;
}

// The fleet's hooks of `event` that match a call (the agent's
// fleet-hook-run.ts), its input in Claude Code's words without the
// credential stamp, run at once; their verdicts joined, any block
// blocking with every reason.
const fleetHooksOn = async (
  here: Here,
  event: HookEvent,
  sessionID: string,
  tool: string,
  input: unknown,
  extra: Record<string, unknown>
): Promise<HookVerdict> => {
  const call = hookToolCall("opencode", tool, withoutSecret(input));
  const hooks = fleetHooks(here.directory);
  if (dueHooks("opencode", hooks, event, call.name).length === 0) {
    return {};
  }
  const prefix =
    here.holding && here.bounded(sessionID)
      ? boundaryOf(here.holding.id, here.holding.root).prefix
      : undefined;
  return await runFleetHooks(
    "opencode",
    hooks,
    event,
    call.name,
    { tool_name: call.name, tool_input: call.input, ...extra },
    {
      cwd: here.directory,
      env: { ...cleanEnv({ ...process.env }), ...sessionEnv(sessionID) },
      sessionId: sessionID,
      ...(prefix ? { boundary: { prefix } } : {}),
    }
  );
};

// Judges the call and stamps a CawCo call with its session's credential.
const admit = async (
  here: Here,
  event: { id: string; input: unknown; sessionID: string; tool: string }
): Promise<unknown> => {
  if (here.workspace && here.bounded(event.sessionID)) {
    await judgeIn(here.workspace, event.tool, event.input, here.directory);
  }
  if (!event.tool.startsWith("cawco_")) {
    return event.input;
  }
  const credential = sessionHeld(event.sessionID)?.credential;
  if (typeof credential !== "string" || !credential) {
    throw new Error(
      "This OpenCode session holds no CawCo session credential, so it cannot call CawCo tools."
    );
  }
  // And the call's own id, which OpenCode's tools/call names nowhere:
  // a machine_pause of its own machine cuts its turn once this call
  // is answered (hub machine-pause.ts `PauseCaller`).
  return {
    ...(isRecord(event.input) ? event.input : {}),
    __cawco: { credential, call: event.id },
  };
};

/** What the tool hooks keep between a call's two hooks. */
interface CallState {
  /** Each Code Mode program's calls, by session and the program's own call id (which each call it makes carries too), in the order they started. */
  programs: Map<string, Program>;
  /** What the fleet's PreToolUse hooks said of each call, by session and call id, for its result. */
  saidBefore: Map<string, string>;
  /** The `shell` calls made in this location whose shell has yet to open. */
  shells: PendingShell[];
}

/** The hooks' view of a call before it runs. */
interface BeforeEvent {
  id: string;
  input: unknown;
  readonly sessionID: string;
  readonly tool: string;
}

const refused = (error: unknown): { content: unknown; isError: true } => ({
  content: [{ type: "text", text: said(error) }],
  isError: true,
});

// The judge, the stamp and the fleet's PreToolUse hooks on a call: what it is
// to run with. A throw refuses it.
const checkCall = async (
  here: Here,
  state: CallState,
  event: BeforeEvent,
  key: string
): Promise<unknown> => {
  const stamped = await admit(here, event);
  // The fleet's PreToolUse hooks, on a call the judge let through: a
  // block refuses it.
  const verdict = await fleetHooksOn(
    here,
    "PreToolUse",
    event.sessionID,
    event.tool,
    stamped,
    { tool_use_id: event.id }
  );
  if (verdict.block) {
    throw new Error(verdict.block);
  }
  // Its words go with the call's result (execute.after), as Claude
  // Code adds a PreToolUse hook's additionalContext for the model.
  if (verdict.context) {
    state.saidBefore.set(key, verdict.context);
  }
  // A rewrite, outside a bounded session only, in OpenCode's keys, the
  // credential stamp kept.
  if (!verdict.updatedInput) {
    return stamped;
  }
  const stamp = isRecord(stamped) ? stamped.__cawco : undefined;
  return {
    ...hookToolInputBack("opencode", event.tool, verdict.updatedInput),
    ...(stamp ? { __cawco: stamp } : {}),
  };
};

const beforeCall = async (
  here: Here,
  state: CallState,
  event: BeforeEvent
): Promise<void> => {
  const key = `${event.sessionID} ${event.id}`;
  const program =
    event.tool === CODE_MODE_TOOL ? undefined : state.programs.get(key);
  // A call a program makes takes its place first: one refused here is a
  // call the program made, and answered with its refusal.
  const slot = program
    ? program.calls.push({
        tool: event.tool,
        input: withoutSecret(event.input),
      }) - 1
    : -1;
  try {
    event.input = await checkCall(here, state, event, key);
  } catch (error) {
    if (program) {
      program.calls[slot] = { ...program.calls[slot], ...refused(error) };
    }
    throw error;
  }
  if (event.tool === CODE_MODE_TOOL) {
    state.programs.set(key, { calls: [], slots: new WeakMap() });
  } else if (program && isRecord(event.input)) {
    program.slots.set(event.input, slot);
  }
  if (
    event.tool === "shell" &&
    !here.bounded(event.sessionID) &&
    isRecord(event.input) &&
    typeof event.input.command === "string"
  ) {
    state.shells.push({
      command: event.input.command,
      sessionID: event.sessionID,
    });
  }
};

/** A finished call, as the `execute.after` hook is handed it. */
type AfterEvent = {
  readonly id: string;
  readonly input: unknown;
  readonly sessionID: string;
  readonly tool: string;
} & (
  | { readonly status: "completed"; result: ToolResult }
  | { readonly error: unknown; readonly status: "error" }
);

// The fleet's PostToolUse or PostToolUseFailure hooks: what they say
// goes onto a completed call's result, which the model reads, as
// Claude Code shows the model a PostToolUse hook's stderr.
const afterHooks = async (
  here: Here,
  state: CallState,
  event: AfterEvent,
  key: string
): Promise<void> => {
  const after = await fleetHooksOn(
    here,
    event.status === "completed" ? "PostToolUse" : "PostToolUseFailure",
    event.sessionID,
    event.tool,
    event.input,
    {
      tool_use_id: event.id,
      ...(event.status === "completed"
        ? { tool_response: event.result }
        : { error: said(event.error) }),
    }
  );
  const told = [state.saidBefore.get(key), after.block, after.context]
    .filter(Boolean)
    .join("\n");
  state.saidBefore.delete(key);
  if (told && event.status === "completed") {
    event.result = {
      ...event.result,
      content: [...contentOf(event.result), { type: "text", text: told }],
    };
  }
};

// What a Code Mode program's call answered, written onto the program's own
// result as `metadata.calls`, or onto its slot until then.
const recordCall = (state: CallState, event: AfterEvent, key: string): void => {
  const program = state.programs.get(key);
  if (!program) {
    return;
  }
  if (event.tool === CODE_MODE_TOOL) {
    state.programs.delete(key);
    if (event.status === "completed") {
      event.result = {
        ...event.result,
        metadata: { ...event.result.metadata, calls: program.calls },
      };
    }
    return;
  }
  const at = isRecord(event.input) ? program.slots.get(event.input) : undefined;
  if (at === undefined) {
    return;
  }
  program.calls[at] =
    event.status === "completed"
      ? {
          ...program.calls[at],
          content: event.result.content ?? [],
          ...(event.result.metadata &&
          Object.keys(event.result.metadata).length > 0
            ? { structuredContent: event.result.metadata }
            : {}),
        }
      : { ...program.calls[at], ...refused(event.error) };
};

const afterCall = async (
  here: Here,
  state: CallState,
  event: AfterEvent,
  instanceOf: (sessionID: string) => Promise<string | undefined>
): Promise<void> => {
  const { workspace } = here;
  if (
    workspace &&
    here.bounded(event.sessionID) &&
    event.status === "completed"
  ) {
    event.result = await cutInto(event.result, event.id, async () => {
      const instanceId = await instanceOf(event.sessionID);
      return instanceId ? spillFolder(workspace, instanceId) : undefined;
    });
  }
  const key = `${event.sessionID} ${event.id}`;
  await afterHooks(here, state, event, key);
  if (event.tool === "shell") {
    const left = state.shells.findIndex(
      (one) =>
        one.sessionID === event.sessionID &&
        isRecord(event.input) &&
        one.command === event.input.command
    );
    if (left >= 0) {
      state.shells.splice(left, 1);
    }
  }
  recordCall(state, event, key);
};

const hookTools = async (
  ctx: Context,
  here: Here,
  instanceOf: (sessionID: string) => Promise<string | undefined>
): Promise<void> => {
  const state: CallState = {
    programs: new Map(),
    saidBefore: new Map(),
    shells: [],
  };
  await ctx.tool.hook("execute.before", (event) =>
    beforeCall(here, state, event)
  );
  await ctx.tool.hook("execute.after", (event) =>
    afterCall(here, state, event, instanceOf)
  );
  await ctx.shell.hook("create.before", (event) => {
    cleanEnv(event.env);
    const at = state.shells.findIndex((one) => one.command === event.command);
    if (at < 0) {
      return;
    }
    const [made] = state.shells.splice(at, 1);
    if (
      state.shells.some(
        (one) =>
          one.command === event.command && one.sessionID !== made.sessionID
      )
    ) {
      state.shells.push(made);
      throw new Error(
        "cawco: two sessions here ran this same command at the same moment, so it did not run: run it again."
      );
    }
    Object.assign(event.env, sessionEnv(made.sessionID));
  });
};

const plugin: Plugin.Plugin = {
  id: settings.pluginId,
  async setup(ctx) {
    const here = hereOf(ctx.location.directory);
    await setUpFleetPlugins(ctx, here);
    const instanceOf = lineageOf(ctx);
    await wrapShells(ctx, here);
    const events = watchEvents(ctx, here.directory);
    await transformMcp(ctx, here);
    await hookTools(ctx, here, instanceOf);
    if (here.holding) {
      await ctx.session.hook("context", (event) => {
        if (event.tools.shell) {
          event.tools.shell.description = here.bounded(event.sessionID)
            ? BOUNDED_SHELL_DESCRIPTION
            : HOST_SHELL_DESCRIPTION;
        }
      });
    }
    return () => events.abort();
  },
};

/** @public The module OpenCode loads: the plugin's id and its setup, run once per location. */
export default plugin;
