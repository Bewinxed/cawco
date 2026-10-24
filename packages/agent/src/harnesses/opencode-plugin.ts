/**
 * CawCo's OpenCode 2.0 plugin: what every OpenCode server CawCo starts loads
 * (named in its launch config's `plugins`), and the source its gate form is
 * computed over ({@link gateForm}).
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
 *   `shell` and the command in its metadata: a lead's call is the hub's
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
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CAWCO_ENV,
  CODE_MODE_TOOL,
  HOOK_EVENTS_ON,
  HOOK_TOOL_NAMES,
} from "@cawco/core";
import {
  fleetHarnessSetFile,
  fleetMcpSetFile,
  SPILLS_DIR_NAME,
  WORKSPACE_POLICY_NAME,
  workspacesDir,
} from "@cawco/core/paths";
import { SESSION_CAWCO_ENV } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { JUDGE_SCRIPT } from "../boundary";
import { CHROME_DEVTOOLS } from "../browser/door";
import { delegationHubUrl, harnessMcpUrl } from "../delegation";
import { GATE_PREFIX } from "../mcp-gate";
import { hostKeyFile } from "../mcp-host";
import { readJson, writeJson } from "./fleet-common";
import { CAWCO_PLUGIN_ID, SEND_NOW_METADATA } from "./opencode-client";
import { opencodeCredentialFile } from "./opencode-credentials";

/**
 * OpenCode's global config dir, the machine profile the fleet sync converges:
 * resolved as OpenCode resolves it (`$XDG_CONFIG_HOME/opencode`).
 */
export const OPENCODE_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "opencode"
);

/**
 * The project MCP servers CawCo places for OpenCode on this machine, by
 * `<name>@<place id>`, each with its place's folder and its OpenCode entry.
 * The agent's own file, outside every folder: the plugin hands a location
 * the servers of the deepest place that holds it as it boots.
 */
export const OPENCODE_PLACED_MCP = join(OPENCODE_DIR, "cawco-placed-mcp.json");

/**
 * The location the agent's own reads of a server go to (its config sources,
 * its models, its integrations): one where the plugin turns every MCP server
 * off. OpenCode 2.0 boots a location on its first request and connects every
 * MCP server it has there (2.0.29: one `GET /api/config` at the server's own
 * directory started the launch config's stdio server, 2026-10-22), so a read
 * left on the server's own directory, the home, started every fleet server
 * there and left them running.
 */
export const OPENCODE_QUIET_DIR = join(homedir(), ".cawco", "opencode-quiet");

/**
 * The data dir every shell and local MCP server of every server reads as
 * `XDG_DATA_HOME`: the machine's own. An account's server runs on the
 * account's (its own database), which is OpenCode's alone.
 */
const machineDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

const BOUNDED_SHELL_DESCRIPTION =
  "Runs a bash command inside this workspace's boundary, in the session's directory unless workdir says otherwise. The command can write only the clone, $TMPDIR (the workspace's own scratch dir: temp files go there, not /tmp) and the workspaces' own package cache; it reads nothing in the home dir outside the clone, toolchains and the user's git config, and none of the credentials CawCo, the harnesses and the machine's tools keep; it reaches any public host but none of the owner's machines (cawco tools reaches the hub's tools); it sees and signals only this workspace's processes, and cannot reach the service manager. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The `shell` a person's session in a place sees: the built-in's, on this machine. */
const HOST_SHELL_DESCRIPTION =
  "Runs a bash command on this machine, in the session's directory unless workdir says otherwise. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The plugin's module source, as every server on this machine loads it. */
export const buildPluginSource =
  (): string => `// CawCo's OpenCode 2.0 plugin, written by the CawCo agent. Do not edit.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// This server's password authenticates every request to it: no shell or MCP
// server it starts inherits it.
delete process.env.OPENCODE_SERVER_PASSWORD;

const cawcoBase = ${JSON.stringify(harnessMcpUrl(""))};
const cawcoWorkspaces = ${JSON.stringify(workspacesDir())};
const cawcoCredentials = ${JSON.stringify(opencodeCredentialFile())};
const cawcoPlacedMcp = ${JSON.stringify(OPENCODE_PLACED_MCP)};
const cawcoQuiet = ${JSON.stringify(OPENCODE_QUIET_DIR)};
const machineData = ${JSON.stringify(machineDataHome())};
const sessionNames = ${JSON.stringify(SESSION_CAWCO_ENV)};
// The fleet's servers as the agent's last sync wrote them (its fleet-mcp-set.ts),
// and the host key its gateway's hosted servers answer to (its mcp-host.ts).
const cawcoFleetMcp = ${JSON.stringify(fleetMcpSetFile())};
const cawcoHostKey = ${JSON.stringify(hostKeyFile())};
// The fleet's hooks as the agent's last sync wrote them (its
// fleet-harness-set.ts), the events this plugin runs them on and OpenCode's
// tools by Claude Code's names (core HOOK_EVENTS_ON, HOOK_TOOL_NAMES).
const cawcoHarnessSet = ${JSON.stringify(fleetHarnessSetFile())};
const hookEvents = ${JSON.stringify(HOOK_EVENTS_ON.opencode)};
const hookTools = ${JSON.stringify(HOOK_TOOL_NAMES.opencode)};
const gatePrefix = ${JSON.stringify(GATE_PREFIX)};
// Where this server saves a tool output it cuts (its own data dir's
// \`opencode/tool-output\`, observed on 2.0.28): every session's, which the
// judge denies each workspace session.
const toolOutput = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "tool-output");
const realOf = (path) => { try { return realpathSync(path); } catch { return path; } };
const said = (error) => (error instanceof Error ? error.message : String(error));
// Where every workspace's clone is cut (the agent's createWorkspace).
const worktrees = realOf(join(homedir(), ".worktrees"));

// The workspace whose clone holds \`directory\`, by the records the agent keeps
// for it outside the clone: \`create.json\`, written before the clone is cut and
// removed only with it, and the running boundary's \`boundary.json\`, the first
// that names a path. The clone itself or any directory inside it, both at
// their real paths, whole path segments only; of clones inside one another,
// the deepest (the agent's workspaceHolding, workspace-records.ts). A
// workspace whose records are damaged, so that none names its clone, still
// holds a directory inside a clone cut for it (\`~/.worktrees/<repo>-<id8>\`):
// that is refused, never run outside its boundary.
const workspaceOf = (directory) => {
  let ids = [];
  try { ids = readdirSync(cawcoWorkspaces); } catch { return undefined; }
  const at = realOf(directory);
  let found;
  const damaged = [];
  for (const id of ids) {
    let path;
    let damage;
    for (const name of ["create.json", "boundary.json"]) {
      const file = cawcoWorkspaces + "/" + id + "/" + name;
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      try { path = JSON.parse(text).path; } catch (error) { damage ??= file + " is damaged (" + said(error) + ")"; }
      if (typeof path === "string") break;
    }
    if (typeof path !== "string") {
      if (damage) damaged.push({ id, damage });
      continue;
    }
    // A Linux view of a folder (the agent's layer.ts) is the person's folder
    // at its own path, shared with every other view of it and the person's
    // own sessions: it holds no directory here.
    let form;
    try { form = JSON.parse(readFileSync(cawcoWorkspaces + "/" + id + "/layer.json", "utf8")).form; } catch { form = undefined; }
    if (form === "overlay") continue;
    const root = realOf(path);
    if ((at === root || at.startsWith(root + "/")) && !(found && found.root.length >= root.length)) found = { id, root };
  }
  if (found) return found;
  const top = (at.startsWith(worktrees + "/") ? at.slice(worktrees.length + 1) : "").split("/")[0];
  const hit = damaged.find(({ id }) => top && top.endsWith("-" + id.slice(0, 8)));
  if (hit) throw new Error("cawco: workspace " + hit.id + "'s record is damaged: " + hit.damage + ". Archive the workspace to remove it.");
  return undefined;
};

// The workspace's boundary as it stands at the call. None means the command
// does not run: never the built-in shell, which would run it outside.
const boundaryOf = (id, root) => {
  let held;
  try { held = JSON.parse(readFileSync(cawcoWorkspaces + "/" + id + "/boundary.json", "utf8")); } catch (error) {
    throw new Error("cawco: workspace " + id + "'s boundary could not be read (" + said(error) + "), so this command did not run. The workspace's next session starts it again.");
  }
  if (typeof held.path !== "string" || realOf(held.path) !== root || typeof held.exec !== "string") {
    throw new Error("cawco: workspace " + id + "'s boundary record does not name this clone, so this command did not run.");
  }
  return held;
};

// Judges a call of workspace \`id\`'s session by the workspace's policy, and
// throws its refusal. A judge or policy that cannot be read refuses it too.
const judgeIn = async (id, tool, input, directory) => {
  const state = cawcoWorkspaces + "/" + id;
  let judge;
  let policy;
  try {
    judge = await import(state + "/" + ${JSON.stringify(JUDGE_SCRIPT)});
    policy = judge.readPolicy(state + "/" + ${JSON.stringify(WORKSPACE_POLICY_NAME)});
  } catch (error) {
    throw new Error("cawco: " + tool + " was refused: workspace " + id + "'s file policy could not be read (" + said(error) + ").");
  }
  const verdict = judge.judgeCall(policy, { harness: "opencode", tool, input, cwd: directory, toolOutput });
  if (!verdict.ok) throw new Error(verdict.reason);
};

// OpenCode's own cut of a tool output too long to hand the model, as 2.0.29
// runs it (ToolOutput \`truncate\`: its default 2000 lines and 51200 bytes,
// the lines that fit kept, then "[showing lines 1-N of M; full output saved
// to <file>]"), done here for a workspace session's call so the full output
// is saved in the session's own folder: the server's tool-output dir holds
// every session's, by call id alone, and no workspace reads it. OpenCode cuts
// only after every \`execute.after\` hook has run, and leaves alone a result
// whose metadata names \`truncated\` ("if(D.metadata?.truncated!==void 0)
// return D"), so the result this answers is never cut again.
const OUTPUT_LINES = 2000;
const OUTPUT_BYTES = 51200;
const contentOf = (result) => (Array.isArray(result.content) ? result.content : [{ type: "text", text: String(result.content ?? "") }]);
// The session's own folder in workspace \`id\` (the agent's workspaceSpillDir,
// made as the session spawned), which its boundary reads, its shell too (a
// line longer than \`read\` shows is read by the shell); none for a session
// CawCo did not launch, whose output OpenCode cuts as it always does.
const spillFolder = (id, instanceId) => {
  const folder = cawcoWorkspaces + "/" + id + "/" + ${JSON.stringify(SPILLS_DIR_NAME)} + "/" + instanceId;
  return existsSync(folder) ? folder : undefined;
};
// \`result\` cut as OpenCode cuts it, its full output saved as \`name\` in the
// folder \`folderOf\` answers (asked only for a result to cut); as it is, its
// metadata marked, when nothing needs cutting or the session has no folder.
const cutInto = async (result, name, folderOf) => {
  if (result?.metadata?.truncated !== undefined) return result;
  const content = contentOf(result);
  const text = content.flatMap((block) => (block?.type === "text" ? [block.text] : [])).join("\\n");
  const lines = text.split("\\n");
  if (text.endsWith("\\n")) lines.pop();
  if (lines.length <= OUTPUT_LINES && Buffer.byteLength(text, "utf-8") <= OUTPUT_BYTES) {
    return { ...result, metadata: { ...result.metadata, truncated: false } };
  }
  const folder = await folderOf();
  if (!folder) return result;
  const kept = [];
  let bytes = 0;
  for (const line of lines.slice(0, OUTPUT_LINES)) {
    const size = Buffer.byteLength(line, "utf-8") + (kept.length > 0 ? 1 : 0);
    if (bytes + size > OUTPUT_BYTES) break;
    kept.push(line);
    bytes += size;
  }
  const file = folder + "/tool_" + name.replace(/[^A-Za-z0-9_-]/g, "_");
  writeFileSync(file, text);
  const hint = "[showing " + (kept.length > 0 ? "lines 1-" + kept.length : "0 lines") + " of " + lines.length + "; full output saved to " + file + "]";
  const cut = [];
  let left = kept.join("\\n").length;
  let joined = false;
  let hinted = false;
  for (const block of content) {
    if (block?.type !== "text") {
      cut.push(block);
      continue;
    }
    if (joined && left > 0) left--;
    joined = true;
    if (left >= block.text.length) {
      cut.push(block);
      left -= block.text.length;
      continue;
    }
    if (left > 0) cut.push({ ...block, text: block.text.slice(0, left) });
    if (!hinted) cut.push({ type: "text", text: hint });
    left = 0;
    hinted = true;
  }
  if (!hinted) cut.push({ type: "text", text: hint });
  return { ...result, content: cut, metadata: { ...result.metadata, truncated: true, outputPath: file } };
};

// Each session's CawCo identity, by OpenCode session id, as the agent records
// it when the session opens, with its doors to the container runtimes
// (DOCKER_HOST, CONTAINER_HOST: agent session-containers.ts).
const sessionHeld = (sessionID) => {
  try { return JSON.parse(readFileSync(cawcoCredentials, "utf8"))[sessionID]; } catch { return undefined; }
};
const sessionEnv = (sessionID) => {
  const held = sessionHeld(sessionID);
  return held ? { ...held.containerEnv, ${JSON.stringify(CAWCO_ENV.instanceId)}: held.instanceId, ${JSON.stringify(CAWCO_ENV.sessionCredential)}: held.credential } : {};
};
// What every shell and local MCP server gets: the machine's own data dir, no
// password, and none of CawCo's wiring but what the session's own tools read.
const cleanEnv = (env) => {
  delete env.OPENCODE_SERVER_PASSWORD;
  for (const name of Object.keys(env)) {
    if (name.startsWith("CAWCO_") && !sessionNames.includes(name)) delete env[name];
  }
  env.XDG_DATA_HOME = machineData;
  return env;
};
const withoutSecret = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const { __cawco, ...rest } = input;
  return rest;
};

// A place (the agent's isPlace): a person's own folder, bounded only for
// the sessions the agent put there.
const placeSuffix = ${JSON.stringify(PLACE_SUFFIX)};

const OUTPUT_LIMIT = 30000;
// Runs \`file args\` as one \`shell\` call of the session: its env, its
// timeout and abort, its output cut at OUTPUT_LIMIT.
const runShell = async (file, args, input, context, directory) => {
  const timeout = Math.min(input.timeout ?? 120000, 600000);
  const env = { ...cleanEnv({ ...process.env }), ...sessionEnv(context.sessionID) };
  const child = spawn(file, args, { cwd: input.workdir ?? directory, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const take = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  // Its own group (\`detached\`), by a pid its spawn made: core's signal wall
  // (signal.ts) cannot be imported here, so its rule is kept by hand.
  const stop = () => { const pid = child.pid; if (!Number.isInteger(pid) || pid <= 1) return; try { process.kill(-pid, "SIGKILL"); } catch {} };
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
  context.signal.addEventListener("abort", stop, { once: true });
  const exit = await new Promise((resolve) => {
    child.on("error", (error) => { output += String(error); resolve(127); });
    child.on("close", (code, signal) => resolve(code ?? signal));
  });
  clearTimeout(timer);
  context.signal.removeEventListener("abort", stop);
  const cut = output.length > OUTPUT_LIMIT ? output.slice(0, OUTPUT_LIMIT) + "\\n[output cut at " + OUTPUT_LIMIT + " characters]" : output;
  const notes = (timedOut ? "\\n[killed after " + timeout + "ms]" : "") + (exit === 0 ? "" : "\\n[exit " + exit + "]");
  return { content: cut + notes, metadata: { exit, description: input.description ?? "" } };
};

// The \`shell\` of a location a workspace holds. A session \`bounded\` there is
// asked as the built-in asks (\`shell\`, the command its resource and in its
// metadata, for CawCo's ask and a lead's gate), then runs the command inside
// the workspace's boundary; any other (a person's session in a place)
// runs it through \`host\`, the built-in this replaces, which asks and runs as
// it always does on the host. No call runs without its ask.
const boundedShell = (id, root, directory, bounded, host, permission) => ({
  name: "shell",
  description: ${JSON.stringify(BOUNDED_SHELL_DESCRIPTION)},
  input: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to run" },
      timeout: { type: "number", description: "Milliseconds before the command is killed: 120000 unless given, at most 600000" },
      workdir: { type: "string", description: "The directory to run in; the session's directory unless given" },
      description: { type: "string", description: "What the command does, in 5-10 words" },
    },
    required: ["command"],
  },
  options: { codemode: false },
  async execute(input, context) {
    if (bounded(context.sessionID)) {
      // A deny or a rejection throws, and the command does not run.
      await permission.assert({
        sessionID: context.sessionID,
        agent: context.agent,
        source: { type: "tool", messageID: context.messageID, id: context.id },
        action: "shell",
        resources: [input.command],
        save: [input.command],
        metadata: { command: input.command, ...(input.description ? { description: input.description } : {}), ...(input.workdir ? { workdir: input.workdir } : {}) },
      });
      const held = boundaryOf(id, root);
      // A session's command: it shows the workspace's notice first.
      return runShell(held.exec, ["--session", input.command], input, context, directory);
    }
    if (!host) throw new Error("cawco: this location has no built-in shell to run a command outside workspace " + id + "'s boundary, so it did not run.");
    // Its words and metadata; not its structured \`output\`, which this tool
    // declares no schema for (the server refuses such a result).
    const { output: _output, ...result } = await host(input, context);
    return result;
  },
});

// Each session's running \`shell\` calls a send of the person's own words
// moves aside, by OpenCode session id: each call's move.
const asideShells = new Map();
const moveAside = (sessionID) => {
  for (const move of [...(asideShells.get(sessionID) ?? [])]) move();
};
const textOf = (result) => contentOf(result ?? {}).flatMap((block) => (block?.type === "text" ? [block.text] : [])).join("\\n");
let asideCount = 0;
// The \`shell\` \`base\` is, which a send of the person's own words moves aside
// (marked ${JSON.stringify(SEND_NOW_METADATA)} by the agent): its call answers at once, in words
// that name no one, while the command runs on, its own abort no longer the
// call's; its end reaches the session as a message of its own carrying its
// output (\`session\`: the location's ctx.session), which starts a turn when
// none runs. Only the \`shell\`: an MCP server's tools are called from Code
// Mode programs (\`execute\`, no tool a plugin's transform is handed, 2.0.29),
// whose program reads each call's answer. OpenCode's own move
// (\`session.background\`) tells the model "User requested that active
// blocking work be moved to the background", which no one did, so CawCo
// never asks it.
const asideShell = (base, session) => ({
  name: "shell",
  description: base.description,
  input: base.input,
  ...(base.options ? { options: base.options } : {}),
  async execute(input, context) {
    const own = new AbortController();
    const forward = () => own.abort(context.signal.reason);
    if (context.signal.aborted) own.abort(context.signal.reason);
    else context.signal.addEventListener("abort", forward, { once: true });
    let moved = false;
    const call = { ...context, signal: own.signal, progress: (...args) => (moved ? undefined : context.progress?.(...args)) };
    const running = Promise.resolve().then(() => base.execute(input, call));
    const moves = asideShells.get(context.sessionID) ?? new Set();
    asideShells.set(context.sessionID, moves);
    return await new Promise((resolve, reject) => {
      const settle = () => {
        moves.delete(move);
        if (moves.size === 0) asideShells.delete(context.sessionID);
        context.signal.removeEventListener("abort", forward);
      };
      const move = () => {
        if (moved) return;
        moved = true;
        settle();
        const id = "cawco-shell-" + Date.now().toString(36) + "-" + (++asideCount);
        const named = "Background command " + id + " (" + JSON.stringify(input.command) + ")";
        resolve({ content: "Command moved to the background (ID: " + id + ") so that a message that arrived while it was running can reach you; it was not interrupted. Its result is delivered to you automatically when it finishes; carry on without waiting for it.", metadata: { background: id, ...(typeof input.description === "string" ? { description: input.description } : {}) } });
        const tell = (text) => session.synthetic({ sessionID: context.sessionID, text, description: named, metadata: { source: "cawco-shell", id }, resume: true }).catch((error) => console.error("cawco: telling session " + context.sessionID + " that " + named + " ended failed: " + said(error)));
        running.then(
          (result) => tell(named + " finished. Its output:\\n" + textOf(result)),
          (error) => tell(named + " failed: " + said(error)),
        );
      };
      moves.add(move);
      running.then(
        (result) => {
          if (moved) return;
          settle();
          // Its words and metadata; not a structured \`output\`, which this
          // tool declares no schema for (the server refuses such a result).
          const { output: _output, ...answer } = result ?? {};
          resolve(answer);
        },
        (error) => {
          if (moved) return;
          settle();
          reject(error);
        },
      );
    });
  },
});

// The names of the fleet's servers, its own and every project's placed copy:
// in a workspace's location each one with a command goes through the
// workspace's MCP gate. None when the set cannot be read.
const fleetNames = () => {
  let set = {};
  try { set = JSON.parse(readFileSync(cawcoFleetMcp, "utf8")); } catch { return new Set(); }
  return new Set([...Object.keys(set.servers ?? {}), ...Object.values(set.placed ?? {}).map((row) => row.name)]);
};
// The host key, or none when the agent has made none yet: then no fleet
// server with a command is reached in a workspace's location.
const hostKey = () => { try { return readFileSync(cawcoHostKey, "utf8").trim() || undefined; } catch { return undefined; } };

// The fleet's hooks (the agent's fleet-harness-set.ts): the fleet's own and
// those of the project placed at the deepest place holding \`directory\`,
// real paths on whole path segments, read at each call so a change reaches
// a running session. None when the set cannot be read.
const fleetHooks = (directory) => {
  let set = {};
  try { set = JSON.parse(readFileSync(cawcoHarnessSet, "utf8")); } catch { return []; }
  const placed = Object.values(set.placedHooks ?? {});
  const here = realOf(directory);
  let place;
  for (const { cwd } of placed) {
    const root = realOf(cwd);
    if ((here === root || here.startsWith(root + "/")) && !(place && place.length >= root.length)) place = root;
  }
  return [...Object.values(set.hooks ?? {}), ...placed.filter((hook) => place && realOf(hook.cwd) === place)];
};
// The fleet's OpenCode plugins for \`directory\` (the agent's
// fleet-harness-set.ts configAt): the fleet's own, then those of the
// project placed at the deepest place holding it, each a module file the
// agent's sync made ready (its fleet-harness-config.ts).
const fleetPlugins = (directory) => {
  let set = {};
  try { set = JSON.parse(readFileSync(cawcoHarnessSet, "utf8")); } catch { return []; }
  const rows = Object.values(set.config ?? {}).filter((row) => row.kind === "opencodePlugins" && typeof row.entry === "string");
  const here = realOf(directory);
  let place;
  for (const { cwd } of rows) {
    if (!cwd) continue;
    const root = realOf(cwd);
    if ((here === root || here.startsWith(root + "/")) && !(place && place.length >= root.length)) place = root;
  }
  return rows.filter((row) => !row.cwd || (place && realOf(row.cwd) === place));
};
// Whether this harness runs a hook (core hookUnsupported): an event it
// raises, a command, no condition.
const runsHook = (hook) => hookEvents.includes(hook.event) && hook.handler?.type === "command" && !hook.handler.if?.trim();
// A matcher's test passed (core hookTestPasses).
const passes = (test, value) => {
  if (test.all) return true;
  if (test.exact) return test.exact.includes(value);
  try { return new RegExp(test.regex).test(value); } catch { return false; }
};
// A call in Claude Code's words (core hookToolCall): its name, its input's keys.
const claudeCall = (tool, input) => {
  const known = hookTools[tool];
  if (!known) return { name: tool, input };
  const keys = known.input;
  return { name: known.name, input: keys && input && typeof input === "object" && !Array.isArray(input) ? Object.fromEntries(Object.entries(input).map(([key, value]) => [keys[key] ?? key, value])) : input };
};
const shellWord = (word) => "'" + String(word).replaceAll("'", "'\\\\''") + "'";
// One command hook run the way Claude Code does it (the agent's fleet-hook-run.ts):
// the event's JSON on stdin, CLAUDE_PROJECT_DIR the location's folder, its
// timeout or ten minutes, its own process group. A bounded session's runs
// inside the workspace's boundary, through its shell prefix.
const runHook = (handler, stdin, directory, prefix, env) => new Promise((resolve) => {
  const line = handler.args?.length ? [handler.command ?? "", ...handler.args].map(shellWord).join(" ") : (handler.command ?? "");
  const [file, ...args] = prefix ? [prefix, line] : ["bash", "-c", line];
  const child = spawn(file, args, { cwd: directory, env: { ...env, CLAUDE_PROJECT_DIR: directory }, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const stop = () => { const pid = child.pid; if (!Number.isInteger(pid) || pid <= 1) return; try { process.kill(-pid, "SIGKILL"); } catch {} };
  const timer = setTimeout(stop, (handler.timeout ?? 600) * 1000);
  child.on("error", (error) => { stderr += String(error); });
  child.on("close", (code) => { clearTimeout(timer); resolve({ exit: code, stdout, stderr }); });
  child.stdin.on("error", () => {});
  child.stdin.end(stdin);
});
// A run read as Claude Code reads it (core hookVerdict): exit 2 blocks with
// its stderr; exit 0 with JSON blocks on decision "block", a deny or
// continue false, and says its additionalContext; any other exit blocks
// nothing.
const verdictOf = (ran) => {
  if (ran.exit === 2) return { block: ran.stderr.trim() || "A fleet hook refused it (exit 2)." };
  if (ran.exit !== 0) return {};
  let parsed;
  try { parsed = ran.stdout.trim().startsWith("{") ? JSON.parse(ran.stdout) : undefined; } catch {}
  if (!parsed || typeof parsed !== "object") return {};
  const specific = parsed.hookSpecificOutput ?? {};
  const said = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const block = parsed.decision === "block" ? said(parsed.reason) ?? "A fleet hook refused it."
    : specific.permissionDecision === "deny" ? said(specific.permissionDecisionReason) ?? "A fleet hook refused it."
    : parsed.continue === false ? said(parsed.stopReason) ?? "A fleet hook stopped it." : undefined;
  const context = said(specific.additionalContext);
  const updated = specific.updatedInput;
  const rewrite = updated && typeof updated === "object" && !Array.isArray(updated) ? updated : undefined;
  return { ...(block ? { block } : {}), ...(context ? { context } : {}), ...(rewrite ? { updatedInput: rewrite } : {}) };
};
// A rewrite in Claude Code's keys back in OpenCode's (core hookToolInputBack).
const ownInput = (tool, input) => {
  const keys = hookTools[tool]?.input;
  if (!keys) return input;
  const back = Object.fromEntries(Object.entries(keys).map(([own, claude]) => [claude, own]));
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [back[key] ?? key, value]));
};

// The project MCP servers CawCo placed at the deepest place holding
// \`directory\`, real paths on whole path segments, set where the location's
// config names no server by that name.
const placeMcp = (editor, directory) => {
  let placed = {};
  try { placed = JSON.parse(readFileSync(cawcoPlacedMcp, "utf8")); } catch { return; }
  const here = realOf(directory);
  let place;
  for (const { cwd } of Object.values(placed)) {
    const root = realOf(cwd);
    if ((here === root || here.startsWith(root + "/")) && !(place && place.length >= root.length)) place = root;
  }
  if (!place) return;
  for (const { cwd, name, entry } of Object.values(placed)) {
    if (realOf(cwd) === place && !editor.get(name)) editor.set(name, entry);
  }
};

export default {
  id: ${JSON.stringify(CAWCO_PLUGIN_ID)},
  async setup(ctx) {
    const directory = ctx.location.directory;
    // A session anywhere inside a workspace's clone is that workspace's.
    const holding = workspaceOf(directory);
    const workspace = holding?.id;
    // In a place, a session is bounded by it only when the agent put it
    // there (its spawn named the place: the workspace its record names), or
    // before the agent has recorded it at all, never unbounded on a guess.
    // Every session in a clone is the clone's.
    const inPlace = workspace?.endsWith(placeSuffix) === true;
    const bounded = (sessionID) => {
      if (!holding) return false;
      if (!inPlace) return true;
      const held = sessionHeld(sessionID);
      return !held || held.workspace === workspace;
    };

    // The fleet's OpenCode plugins and its project's, each set up first, with
    // this location's ctx: a plugin handed another's ctx registers its hooks
    // and tools as that one does (observed on 2.0.29: a plugin's
    // \`ctx.shell.hook("create.before")\`, registered through CawCo's ctx,
    // fired for the location's shell). CawCo's own register after them. One
    // that fails to load or set up is said on the server's log, and CawCo's
    // plugin goes on. The location the agent reads through runs none.
    //
    // Each is handed this ctx with one change: in a bounded session its
    // execute.before hooks get a copy of the call, so an input they change
    // is dropped (the workspace's judge judged the call as asked, below); a
    // refusal they throw still refuses.
    const placedCtx = {
      ...ctx,
      tool: {
        ...ctx.tool,
        hook: (name, fn) => ctx.tool.hook(name, name !== "execute.before" ? fn : async (event) => {
          if (!bounded(event.sessionID)) return fn(event);
          let input;
          try { input = structuredClone(event.input); } catch { input = JSON.parse(JSON.stringify(event.input ?? null)); }
          await fn({ ...event, input });
        }),
      },
    };
    if (realOf(directory) !== realOf(cawcoQuiet)) {
      for (const row of fleetPlugins(directory)) {
        try {
          const loaded = await import(row.entry);
          const plugin = loaded.default ?? loaded;
          if (typeof plugin?.setup !== "function") throw new Error("its module exports no { setup }");
          await plugin.setup(placedCtx);
        } catch (error) {
          console.error("cawco: the fleet's OpenCode plugin " + row.name + " (" + row.entry + ") did not load: " + said(error));
        }
      }
    }
    // Each session's parent, as its server keeps it: a subagent's outputs are
    // the CawCo session's that started it. A session's parent never changes.
    const parents = new Map();
    const parentOf = async (sessionID) => {
      if (parents.has(sessionID)) return parents.get(sessionID);
      const session = await ctx.session.get({ sessionID });
      parents.set(sessionID, typeof session.parentID === "string" ? session.parentID : undefined);
      return parents.get(sessionID);
    };
    // The CawCo session a session is, or a subagent of: the first of its
    // lineage the agent recorded.
    const instanceOf = async (sessionID) => {
      const seen = [];
      for (let at = sessionID; at && !seen.includes(at); at = await parentOf(at)) {
        const held = sessionHeld(at);
        if (typeof held?.instanceId === "string") return held.instanceId;
        seen.push(at);
      }
      return undefined;
    };
    await ctx.tool.transform((editor) => {
      // In a place, the built-in runs a person's session's commands: taken
      // from the editor before it is replaced, each time it replays. Every
      // location's \`shell\` is one a send of the person's own words moves aside.
      const host = editor.get("shell");
      const shell = holding ? boundedShell(holding.id, holding.root, directory, bounded, inPlace ? host?.execute : undefined, ctx.permission) : host;
      if (shell?.execute) editor.add(asideShell(shell, ctx.session));
    });
    // A send of the person's own words admitted to a session's inbox moves its
    // running shell commands aside, so the turn's next step reads it.
    const events = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: events.signal })) {
          if (event.type === "session.inbox.enqueued" && event.data?.item?.type === "user" && event.data.item.payload?.metadata?.[${JSON.stringify(SEND_NOW_METADATA)}] === true) {
            moveAside(event.data.sessionID);
          }
        }
      } catch (error) {
        if (!events.signal.aborted) console.error("cawco: the server's events stopped reaching the plugin, so a send no longer moves a running command aside: " + said(error));
      }
    })();

    await ctx.mcp.transform((editor) => {
      // Servers kept from a location are removed: 2.0.29 starts one set
      // \`enabled = false\` (2026-10-22, a stdio fixture writing its pid; v2's
      // field is \`disabled\`, opencode.ai/v2/docs/mcp-servers), and keeps a
      // \`disabled\` one listed, which a status read would take for a verdict.
      // The agent's reads of this server run here, and need no MCP server.
      if (realOf(directory) === realOf(cawcoQuiet)) {
        for (const [name] of [...editor.list()]) {
          editor.remove(name);
        }
        return;
      }
      placeMcp(editor, directory);
      // In a workspace's location the agent runs each fleet server with a
      // command, on the host, one process for the workspace, chrome-devtools
      // through its browser door (the agent's mcp-host.ts): the location
      // dials its gate, and starts none of them itself. A location in no
      // workspace has no door, so it launches no browser tool.
      const gated = workspace ? fleetNames() : new Set();
      const key = workspace ? hostKey() : undefined;
      for (const [name, config] of [...editor.list()]) {
        if (config.type !== "local") continue;
        if (gated.has(name)) {
          editor.remove(name);
          if (key) {
            editor.set(name, {
              type: "remote",
              url: cawcoBase + gatePrefix + encodeURIComponent(workspace) + "/" + encodeURIComponent(name),
              oauth: false,
              ...(config.timeout ? { timeout: config.timeout } : {}),
              headers: { Authorization: "Bearer " + key },
            });
          }
          continue;
        }
        if (name === ${JSON.stringify(CHROME_DEVTOOLS)}) {
          editor.remove(name);
          continue;
        }
        editor.update(name, (server) => {
          server.environment = { ...(server.environment ?? {}), XDG_DATA_HOME: machineData };
        });
      }
    });

    // Each Code Mode program's calls, by session and the program's own call id
    // (which each call it makes carries too), in the order they started.
    const programs = new Map();
    // The \`shell\` calls made in this location whose shell has yet to open.
    const shells = [];
    // What the fleet's PreToolUse hooks said of each call, by session and
    // call id, for its result.
    const saidBefore = new Map();

    // The fleet's hooks of \`event\` that match a call (the agent's
    // fleet-hook-run.ts), its input in Claude Code's words without the
    // credential stamp, run at once; their verdicts joined, any block
    // blocking with every reason.
    const fleetHooksOn = async (event, sessionID, tool, input, extra) => {
      const call = claudeCall(tool, withoutSecret(input));
      const due = fleetHooks(directory).filter((hook) => hook.event === event && runsHook(hook) && passes(hook.test ?? { all: true }, call.name));
      if (due.length === 0) return {};
      const stdin = JSON.stringify({ session_id: sessionID, transcript_path: "", cwd: directory, hook_event_name: event, tool_name: call.name, tool_input: call.input, ...extra });
      const prefix = holding && bounded(sessionID) ? boundaryOf(holding.id, holding.root).prefix : undefined;
      const env = { ...cleanEnv({ ...process.env }), ...sessionEnv(sessionID) };
      // In the order each finished: the last rewrite to finish is the one
      // taken, as Claude Code takes it, and a bounded session takes none.
      const finished = [];
      await Promise.all(due.map(async (hook) => {
        const running = runHook(hook.handler, stdin, directory, prefix, env);
        if (hook.handler.async) {
          running.catch(() => {});
          return;
        }
        finished.push(verdictOf(await running));
      }));
      const blocks = finished.flatMap((one) => (one.block ? [one.block] : []));
      const contexts = finished.flatMap((one) => (one.context ? [one.context] : []));
      const rewrite = prefix ? undefined : finished.findLast((one) => one.updatedInput)?.updatedInput;
      return { ...(blocks.length > 0 ? { block: blocks.join("\\n") } : {}), ...(contexts.length > 0 ? { context: contexts.join("\\n\\n") } : {}), ...(rewrite ? { updatedInput: rewrite } : {}) };
    };

    // Judges the call and stamps a CawCo call with its session's credential.
    const admit = async (event) => {
      if (workspace && bounded(event.sessionID)) {
        await judgeIn(workspace, event.tool, event.input, directory);
      }
      if (event.tool.startsWith("cawco_")) {
        const credential = sessionHeld(event.sessionID)?.credential;
        if (typeof credential !== "string" || !credential) {
          throw new Error("This OpenCode session holds no CawCo session credential, so it cannot call CawCo tools.");
        }
        // And the call's own id, which OpenCode's tools/call names nowhere:
        // a machine_pause of its own machine cuts its turn once this call
        // is answered (hub machine-pause.ts \`PauseCaller\`).
        event.input = { ...(event.input ?? {}), __cawco: { credential, call: event.id } };
      }
    };

    await ctx.tool.hook("execute.before", async (event) => {
      const key = event.sessionID + " " + event.id;
      const program = event.tool === ${JSON.stringify(CODE_MODE_TOOL)} ? undefined : programs.get(key);
      // A call a program makes takes its place first: one refused here is a
      // call the program made, and answered with its refusal.
      const slot = program ? program.calls.push({ tool: event.tool, input: withoutSecret(event.input) }) - 1 : -1;
      try {
        await admit(event);
        // The fleet's PreToolUse hooks, on a call the judge let through: a
        // block refuses it.
        const verdict = await fleetHooksOn("PreToolUse", event.sessionID, event.tool, event.input, { tool_use_id: event.id });
        if (verdict.block) throw new Error(verdict.block);
        // Its words go with the call's result (execute.after), as Claude
        // Code adds a PreToolUse hook's additionalContext for the model.
        if (verdict.context) saidBefore.set(key, verdict.context);
        // A rewrite, outside a bounded session only, in OpenCode's keys, the
        // credential stamp kept.
        if (verdict.updatedInput) {
          const stamp = event.input?.__cawco;
          event.input = { ...ownInput(event.tool, verdict.updatedInput), ...(stamp ? { __cawco: stamp } : {}) };
        }
      } catch (error) {
        if (program) program.calls[slot] = { ...program.calls[slot], content: [{ type: "text", text: said(error) }], isError: true };
        throw error;
      }
      if (event.tool === ${JSON.stringify(CODE_MODE_TOOL)}) {
        programs.set(key, { calls: [], slots: new WeakMap() });
      } else if (program && event.input && typeof event.input === "object") {
        program.slots.set(event.input, slot);
      }
      if (event.tool === "shell" && !bounded(event.sessionID) && typeof event.input?.command === "string") {
        shells.push({ command: event.input.command, sessionID: event.sessionID });
      }
    });

    await ctx.tool.hook("execute.after", async (event) => {
      if (workspace && bounded(event.sessionID) && event.status === "completed") {
        event.result = await cutInto(event.result, event.id, async () => {
          const instanceId = await instanceOf(event.sessionID);
          return instanceId ? spillFolder(workspace, instanceId) : undefined;
        });
      }
      // The fleet's PostToolUse or PostToolUseFailure hooks: what they say
      // goes onto a completed call's result, which the model reads, as
      // Claude Code shows the model a PostToolUse hook's stderr.
      const completed = event.status === "completed";
      const after = await fleetHooksOn(completed ? "PostToolUse" : "PostToolUseFailure", event.sessionID, event.tool, event.input, { tool_use_id: event.id, ...(completed ? { tool_response: event.result } : { error: said(event.error) }) });
      const told = [saidBefore.get(event.sessionID + " " + event.id), after.block, after.context].filter(Boolean).join("\\n");
      saidBefore.delete(event.sessionID + " " + event.id);
      if (told && completed) {
        event.result = { ...event.result, content: [...contentOf(event.result), { type: "text", text: told }] };
      }
      if (event.tool === "shell") {
        const left = shells.findIndex((one) => one.sessionID === event.sessionID && one.command === event.input?.command);
        if (left >= 0) shells.splice(left, 1);
      }
      const key = event.sessionID + " " + event.id;
      const program = programs.get(key);
      if (!program) return;
      if (event.tool === ${JSON.stringify(CODE_MODE_TOOL)}) {
        programs.delete(key);
        if (event.status === "completed") {
          event.result = { ...event.result, metadata: { ...(event.result.metadata ?? {}), calls: program.calls } };
        }
        return;
      }
      const at = program.slots.get(event.input);
      if (at === undefined) return;
      program.calls[at] = event.status === "completed"
        ? { ...program.calls[at], content: event.result.content ?? [], ...(event.result.metadata && Object.keys(event.result.metadata).length ? { structuredContent: event.result.metadata } : {}) }
        : { ...program.calls[at], content: [{ type: "text", text: said(event.error) }], isError: true };
    });

    await ctx.shell.hook("create.before", (event) => {
      cleanEnv(event.env);
      const at = shells.findIndex((one) => one.command === event.command);
      if (at < 0) return;
      const [made] = shells.splice(at, 1);
      if (shells.some((one) => one.command === event.command && one.sessionID !== made.sessionID)) {
        shells.push(made);
        throw new Error("cawco: two sessions here ran this same command at the same moment, so it did not run: run it again.");
      }
      Object.assign(event.env, sessionEnv(made.sessionID));
    });

    if (holding) {
      await ctx.session.hook("context", (event) => {
        if (event.tools.shell) {
          event.tools.shell.description = bounded(event.sessionID) ? ${JSON.stringify(BOUNDED_SHELL_DESCRIPTION)} : ${JSON.stringify(HOST_SHELL_DESCRIPTION)};
        }
      });
    }
    return () => events.abort();
  },
};
`;

/** The dir every version of the plugin is written into, one per hub this agent serves. */
const pluginsDir = (): string =>
  join(
    homedir(),
    ".cawco",
    "hub-opencode",
    new URL(delegationHubUrl()).host.replaceAll(":", "_"),
    "plugin"
  );

const PLUGIN_VERSION_DIR = /^cawco-context-[0-9a-f]{16}$/;

/**
 * The plugin written as a directory named for its source, and its path: a
 * server is launched on one version and keeps it (a later version is a new
 * directory, so a running server's files never change under it).
 */
export const writePlugin = async (source: string): Promise<string> => {
  const target = join(
    pluginsDir(),
    `cawco-context-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`
  );
  // `index.js` last, each whole: one there means the plugin is whole.
  if (!existsSync(join(target, "index.js"))) {
    await writeStateFile(
      join(target, "package.json"),
      JSON.stringify({
        name: "cawco-context",
        private: true,
        type: "module",
        main: "./index.js",
      })
    );
    await writeStateFile(join(target, "index.js"), source);
  }
  return target;
};

/** Every plugin version but those `kept` names (the current one and those live servers run), removed. */
export const prunePlugins = async (
  kept: ReadonlySet<string>
): Promise<void> => {
  const dir = pluginsDir();
  const versions = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) => PLUGIN_VERSION_DIR.test(name) && !kept.has(join(dir, name))
  );
  await Promise.all(
    versions.map((name) =>
      rm(join(dir, name), { recursive: true, force: true })
    )
  );
};

/** 1.x's generated bridge plugin files (`cawco-context-<hash>.js`, `cockpit-handoff.js`). */
const V1_BRIDGE =
  /^(?:cawco-(?:handoff|context)(?:-[a-f0-9]+)?|cockpit-handoff)\.js(?:\.disabled-\d+)?$/;

/**
 * What 1.x's bridge left in OpenCode's global config dir, gone: its plugin
 * files in `plugins/`, and the entries naming them in `opencode.json`'s
 * `plugin` list. 2.0 reads that list too, and would try each and warn.
 */
export const retireV1Plugins = async (
  directory = OPENCODE_DIR
): Promise<void> => {
  const plugins = join(directory, "plugins");
  const files = (await readdir(plugins).catch(() => [] as string[])).filter(
    (file) => V1_BRIDGE.test(file)
  );
  await Promise.all(
    files.map((file) => rm(join(plugins, file), { force: true }))
  );
  const configPath = join(directory, "opencode.json");
  const config = await readJson<Record<string, unknown>>(configPath);
  if (Array.isArray(config?.plugin)) {
    const kept = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !V1_BRIDGE.test(entry.split("/").pop() ?? "")
    );
    if (kept.length !== config.plugin.length) {
      const { plugin: _plugin, ...rest } = config;
      await writeJson(
        configPath,
        kept.length > 0 ? { ...rest, plugin: kept } : rest
      );
    }
  }
};
