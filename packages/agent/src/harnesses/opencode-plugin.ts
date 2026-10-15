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
 * - `ctx.tool.hook("execute.before")`: the workspace judge, and the session
 *   credential stamped into each `cawco_*` MCP call (`__cawco`). It runs for
 *   every call, the calls a Code Mode program makes through `execute`
 *   included (settled #1: "plugin tool hooks on nested Code Mode calls —
 *   YES, both fire"). A throw refuses the call; assigning `input` replaces
 *   what the tool receives.
 * - `ctx.tool.hook("execute.after")`: the outputs a workspace session was told
 *   it saved, and what each call of a Code Mode program answered, written
 *   onto the program's own result as `metadata.calls` (2.0 keeps each call's
 *   name, input and status on the program, `metadata.toolCalls`, never what
 *   it returned). A program that throws still ends `completed`, with
 *   `metadata.error` (observed on 2.0.28), so its calls are written the same
 *   way. A nested call carries the program's own call id, so a program's
 *   calls are kept by tool name in the order they started, each matched to
 *   its answer by the very input object OpenCode hands both hooks.
 * - `ctx.tool.transform`: the workflow-step tools, and in a workspace's clone
 *   the `shell` that runs every command through the workspace's executor,
 *   inside its boundary, in place of the built-in (2.0's id for the shell
 *   tool is `shell`, settled #2). The server pins the built-in's description
 *   for the model, so a clone's session context gives it the boundary's. A
 *   location serves every session in its folder, so in a project lead's
 *   place the `shell` decides per session (`context.sessionID`): the lead's
 *   own sessions, the ones the agent records with that place (opencode-
 *   credentials.ts `workspace`), and any not recorded yet, run inside it;
 *   a person's session there runs through the built-in it replaces, which
 *   asks and runs on the host as it always does, with no judge.
 * - `ctx.shell.hook("create.before")`: every shell a session's `shell` call
 *   opens acts as that session (its instance and credential, for `cawco
 *   tool` and git), and none gets the server's password or CawCo's wiring.
 *   The hook names no session, so the session is the one whose `shell` call
 *   with this very command was just made in this location.
 * - `ctx.mcp.transform`: the project MCP servers CawCo placed, the
 *   workspace's scratch as a root of its chrome-devtools, and every local
 *   server started on the machine's own data dir.
 * - `ctx.agent.transform`: OpenCode's `plan` agent off for a workspace whose
 *   delegate type turns CawCo's to-dos on.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CAWCO_ENV } from "@cawco/core";
import { WORKSPACE_POLICY_NAME, workspacesDir } from "@cawco/core/paths";
import { SESSION_CAWCO_ENV } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { LEAD_PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { JUDGE_SCRIPT } from "../boundary";
import { delegationHubUrl, harnessMcpUrl } from "../delegation";
import { readJson, writeJson } from "./fleet-common";
import { CAWCO_PLUGIN_ID } from "./opencode-client";
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
 * The fleet's Chrome DevTools MCP server, by its fleet name. A workspace
 * session's captures go to the workspace's scratch as well as its clone; it
 * writes a `filePath` only inside its roots: those its client answers
 * `roots/list` with, those named by `--filesystem-root`, and its own temp dir.
 */
export const CHROME_DEVTOOLS = "chrome-devtools";

/** The mark in a workspace's state dir that turns OpenCode's plan agent off in its clone. */
export const PLAN_AGENT_OFF = "opencode-plan-agent-off";

/** The dir in a workspace's state dir where the plugin records each session's saved outputs, a file per session. */
export const SAVED_OUTPUTS = "opencode-saved-outputs";

/** OpenCode's Code Mode tool: MCP tools are reached through the programs it runs. */
export const CODE_MODE_TOOL = "execute";

/** The plugin's own tools, which take no session credential: they ask the hub as the session's step. */
const WORKFLOW_TOOLS = [
  "cawco_submit_result",
  "cawco_workflow_state_read",
  "cawco_workflow_state_write",
];

/**
 * The data dir every shell and local MCP server of every server reads as
 * `XDG_DATA_HOME`: the machine's own. An account's server runs on the
 * account's (its own database), which is OpenCode's alone.
 */
const machineDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

const BOUNDED_SHELL_DESCRIPTION =
  "Runs a bash command inside this workspace's boundary, in the session's directory unless workdir says otherwise. The command can write only the clone, $TMPDIR (the workspace's own scratch dir: temp files go there, not /tmp) and the workspaces' own package cache; it reads nothing in the home dir outside the clone, toolchains and the user's git config, and none of the credentials CawCo, the harnesses and the machine's tools keep; it reaches any public host but none of the owner's machines (cawco tools reaches the hub's tools); it sees and signals only this workspace's processes, and cannot reach the service manager. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The `shell` a person's session in a project lead's place sees: the built-in's, on this machine. */
const HOST_SHELL_DESCRIPTION =
  "Runs a bash command on this machine, in the session's directory unless workdir says otherwise. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.";

/** The plugin's module source, as every server on this machine loads it. */
export const buildPluginSource =
  (): string => `// CawCo's OpenCode 2.0 plugin, written by the CawCo agent. Do not edit.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// This server's password authenticates every request to it: no shell or MCP
// server it starts inherits it.
delete process.env.OPENCODE_SERVER_PASSWORD;

const cawcoBase = ${JSON.stringify(harnessMcpUrl(""))};
const cawcoWorkspaces = ${JSON.stringify(workspacesDir())};
const cawcoCredentials = ${JSON.stringify(opencodeCredentialFile())};
const cawcoPlacedMcp = ${JSON.stringify(OPENCODE_PLACED_MCP)};
const machineData = ${JSON.stringify(machineDataHome())};
const sessionNames = ${JSON.stringify(SESSION_CAWCO_ENV)};
const workflowTools = ${JSON.stringify(WORKFLOW_TOOLS)};
// Where this server saves a truncated tool output (its own data dir's
// \`opencode/tool-output\`, observed on 2.0.28).
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
// \`saved\` is every output the session may read back.
const judgeIn = async (id, tool, input, directory, saved) => {
  const state = cawcoWorkspaces + "/" + id;
  let judge;
  let policy;
  try {
    judge = await import(state + "/" + ${JSON.stringify(JUDGE_SCRIPT)});
    policy = judge.readPolicy(state + "/" + ${JSON.stringify(WORKSPACE_POLICY_NAME)});
  } catch (error) {
    throw new Error("cawco: " + tool + " was refused: workspace " + id + "'s file policy could not be read (" + said(error) + ").");
  }
  const verdict = judge.judgeCall(policy, { harness: "opencode", tool, input, cwd: directory, toolOutput, savedOutputs: saved });
  if (!verdict.ok) throw new Error(verdict.reason);
};

// The outputs this server saved for each session of workspace \`id\`, one file
// per session in the workspace's state dir, which the session's tools never
// write: the server's tool-output dir holds every session's, by call id
// alone, so a session reads back only what it was told it saved.
const SESSION_ID = /^[A-Za-z0-9_-]+$/;
const savedFile = (id, sessionID) => {
  if (!SESSION_ID.test(sessionID)) throw new Error("session id " + JSON.stringify(sessionID) + " names no file");
  return cawcoWorkspaces + "/" + id + "/" + ${JSON.stringify(SAVED_OUTPUTS)} + "/" + sessionID;
};
// The file a call's result says this server saved: its metadata names it
// (\`truncated\`, \`outputPath\`) and its content's hint names it again
// ("full output saved to <file>"), in this server's tool-output dir.
const savedOutputOf = (result) => {
  const file = result?.metadata?.outputPath;
  if (result?.metadata?.truncated !== true || typeof file !== "string" || dirname(file) !== toolOutput) return undefined;
  const content = Array.isArray(result.content) ? result.content : [{ type: "text", text: String(result.content ?? "") }];
  return content.some((block) => block?.type === "text" && block.text.includes("full output saved to " + file)) ? file : undefined;
};
const recordSaved = (id, sessionID, file) => {
  const record = savedFile(id, sessionID);
  mkdirSync(dirname(record), { recursive: true });
  appendFileSync(record, file + "\\n");
};
const savedBy = (id, sessionID) => {
  try {
    return readFileSync(savedFile(id, sessionID), "utf8").split("\\n").filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

// Each session's CawCo identity, by OpenCode session id, as the agent records
// it when the session opens.
const sessionHeld = (sessionID) => {
  try { return JSON.parse(readFileSync(cawcoCredentials, "utf8"))[sessionID]; } catch { return undefined; }
};
const sessionEnv = (sessionID) => {
  const held = sessionHeld(sessionID);
  return held ? { ${JSON.stringify(CAWCO_ENV.instanceId)}: held.instanceId, ${JSON.stringify(CAWCO_ENV.sessionCredential)}: held.credential } : {};
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

// A project lead's place (the agent's isLeadPlace): a person's own folder,
// bounded only for the lead's own sessions there.
const leadPlaceSuffix = ${JSON.stringify(LEAD_PLACE_SUFFIX)};

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
  const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
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

// The \`shell\` of a location a workspace holds. A session \`bounded\` there runs
// every command inside the workspace's boundary; any other (a person's
// session in a lead's place) runs it through \`host\`, the built-in this
// replaces, which asks and runs as it always does on the host.
const boundedShell = (id, root, directory, bounded, host) => ({
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
      const held = boundaryOf(id, root);
      return runShell(held.exec, [input.command], input, context, directory);
    }
    if (!host) throw new Error("cawco: this location has no built-in shell to run a command outside workspace " + id + "'s boundary, so it did not run.");
    // Its words and metadata; not its structured \`output\`, which this tool
    // declares no schema for (the server refuses such a result).
    const { output: _output, ...result } = await host(input, context);
    return result;
  },
});

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
    const state = workspace ? cawcoWorkspaces + "/" + workspace : undefined;
    // In a lead's place, a session is bounded by it only when the agent put
    // it there (its spawn named the place: the workspace its record names),
    // or before the agent has recorded it at all, never unbounded on a
    // guess. Every session in a clone is the clone's.
    const leadPlace = workspace?.endsWith(leadPlaceSuffix) === true;
    const bounded = (sessionID) => {
      if (!holding) return false;
      if (!leadPlace) return true;
      const held = sessionHeld(sessionID);
      return !held || held.workspace === workspace;
    };

    // Each session's parent, as its server keeps it: a subagent reads back
    // what its parents saved too. A session's parent never changes.
    const parents = new Map();
    const parentOf = async (sessionID) => {
      if (parents.has(sessionID)) return parents.get(sessionID);
      const session = await ctx.session.get({ sessionID });
      parents.set(sessionID, typeof session.parentID === "string" ? session.parentID : undefined);
      return parents.get(sessionID);
    };
    const savedFor = async (id, sessionID) => {
      const lineage = [];
      for (let at = sessionID; at && !lineage.includes(at); at = await parentOf(at)) lineage.push(at);
      return lineage.flatMap((one) => savedBy(id, one));
    };
    const cawcoStep = async (sessionID) => {
      const response = await fetch(cawcoBase + "/api/instances");
      if (!response.ok) throw new Error(await response.text());
      const rows = await response.json();
      const actor = rows.find((row) => row.sessionId === sessionID && row.cwd === directory && row.workflowStepId);
      if (!actor) throw new Error("This tool is available only to workflow steps.");
      return actor;
    };

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "cawco_submit_result",
        description: "Call exactly once with an object matching the schema in your instructions, then end your turn. The hub's validation message is returned verbatim on failure.",
        input: { type: "object", properties: { result: { type: "object" } }, required: ["result"] },
        options: { codemode: false },
        async execute(input, context) {
          const actor = await cawcoStep(context.sessionID);
          const recorded = await fetch(cawcoBase + "/api/workflow-steps/" + encodeURIComponent(actor.workflowStepId) + "/result", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, result: input.result }),
          });
          return { content: await recorded.text() };
        },
      });
      editor.add({
        name: "cawco_workflow_state_read",
        description: "Read a named slot of this workflow run's shared state. Only slots the run's program declared with w.state(name, schema) exist.",
        input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        options: { codemode: false },
        async execute(input, context) {
          const actor = await cawcoStep(context.sessionID);
          const read = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(input.name) + "?instanceId=" + encodeURIComponent(actor.id));
          if (!read.ok) throw new Error(await read.text());
          return { content: await read.text() };
        },
      });
      editor.add({
        name: "cawco_workflow_state_write",
        description: "Write a named slot of this workflow run's shared state. The value is validated against the schema the run's program declared; the validator's message comes back verbatim on failure.",
        input: { type: "object", properties: { name: { type: "string" }, value: {} }, required: ["name"] },
        options: { codemode: false },
        async execute(input, context) {
          const actor = await cawcoStep(context.sessionID);
          const written = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(input.name), {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, value: input.value }),
          });
          return { content: await written.text() };
        },
      });
      // In a lead's place, the built-in runs a person's session's commands:
      // taken from the editor before it is replaced, each time it replays.
      if (holding) editor.add(boundedShell(holding.id, holding.root, directory, bounded, leadPlace ? editor.get("shell")?.execute : undefined));
    });

    // The workspace's scratch is a root of its chrome-devtools (and its clone:
    // in a directory inside it, roots/list names that directory alone).
    const roots = state ? JSON.parse(readFileSync(state + "/" + ${JSON.stringify(WORKSPACE_POLICY_NAME)}, "utf8")) : undefined;
    await ctx.mcp.transform((editor) => {
      placeMcp(editor, directory);
      for (const [name, config] of editor.list()) {
        if (config.type !== "local") continue;
        editor.update(name, (server) => {
          server.environment = { ...(server.environment ?? {}), XDG_DATA_HOME: machineData };
          if (name === ${JSON.stringify(CHROME_DEVTOOLS)} && typeof roots?.scratch === "string" && typeof roots?.clone === "string") {
            server.command = [...server.command, "--filesystem-root=" + roots.scratch, "--filesystem-root=" + roots.clone];
          }
        });
      }
    });

    if (state && existsSync(state + "/" + ${JSON.stringify(PLAN_AGENT_OFF)})) {
      await ctx.agent.transform((editor) => editor.remove("plan"));
    }

    // Each Code Mode program's calls, by session and the program's own call id
    // (which each call it makes carries too), in the order they started.
    const programs = new Map();
    // The \`shell\` calls made in this location whose shell has yet to open.
    const shells = [];

    // Judges the call and stamps a CawCo call with its session's credential.
    const admit = async (event) => {
      if (workspace && bounded(event.sessionID)) {
        let saved;
        try {
          saved = await savedFor(workspace, event.sessionID);
        } catch (error) {
          throw new Error("cawco: " + event.tool + " was refused: the outputs this session saved could not be read (" + said(error) + ").");
        }
        await judgeIn(workspace, event.tool, event.input, directory, saved);
      }
      if (event.tool.startsWith("cawco_") && !workflowTools.includes(event.tool)) {
        const credential = sessionHeld(event.sessionID)?.credential;
        if (typeof credential !== "string" || !credential) {
          throw new Error("This OpenCode session holds no CawCo session credential, so it cannot call CawCo tools.");
        }
        event.input = { ...(event.input ?? {}), __cawco: { credential } };
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
        const saved = savedOutputOf(event.result);
        if (saved) recordSaved(workspace, event.sessionID, saved);
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
