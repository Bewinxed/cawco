/**
 * The opencode adapter.
 *
 * opencode is server-first: one headless server per machine owns every session,
 * and the npm SDK is a type-safe client over its HTTP + SSE surface. This
 * adapter lazily starts that server and keeps one event-stream subscription
 * PER WORKING DIRECTORY — started the first time a session spawns into that
 * directory, kept alive until the harness disposes — because opencode's event
 * stream is scoped per directory. Sessions are addressed by the server's
 * session id; a spawn either creates one, re-opens a stored id (`resume`), or
 * forks (`resume.fork` / `resume.atMessage`).
 *
 * Translation is one-directional: opencode events become {@link NeutralMessage}
 * frames the dashboard already folds. Events route to their session by session
 * id — including part-carrying events, whose id lives on the part itself
 * (`part.sessionID`). Text streams in via `properties.delta` while `part.text`
 * carries the full accumulated text, which is what the closing frame replays;
 * reasoning streams the same way as a live thinking block and settles as a
 * `thinking` block on the closing frame; tool states emit deduped
 * `tool_use`/`tool_result` frames keyed by call id. A turn's `result` frame
 * closes on `session.idle` or on `session.error` (`aborted` /
 * `error_during_execution`), so a busy session is never left hung.
 */

import { createHash } from "node:crypto";
import { readdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  EffortLevel,
  FleetConfig,
  FleetItemState,
  FleetMcpConfig,
  FleetSyncReport,
  HarnessCapabilities,
  HarnessReport,
  McpServerStatus,
  ModelInfo,
  NeutralAssistantBlock,
  NeutralContentBlock,
  NeutralSessionInfo,
  PermissionResult,
  SentMessage,
  SessionMessage,
  SlashCommand,
  SpawnPayload,
  UserAnswers,
  UserQuestion,
  UserQuestionResult,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  CONTROL_CONTEXT_USAGE,
  CONTROL_GET_TODOS,
  CONTROL_INTERRUPT,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_STATUS,
  CONTROL_MCP_TOGGLE,
  CONTROL_MODEL_CATALOG,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  EFFORT_READ,
  IMAGE_GENERATION_TIMEOUT_MS,
  MESSAGES_READ,
  MESSAGES_STORED,
  mcpFleetState,
  PROVIDER_RETRY,
} from "@cawco/core";
// The protocol subpath, never the `@cawco/core` barrel: `sessiond.ts` reaches
// for `node:os` and the barrel is imported by the browser bundle (see f2e1c4c).
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import {
  type AssistantMessage,
  type Command,
  createOpencodeClient,
  type Event,
  type FilePart,
  type McpLocalConfig,
  type McpRemoteConfig,
  type McpStatus,
  type Message,
  type OpencodeClient,
  type Part,
  type PermissionRequest,
  type Project,
  type Provider,
  type Session,
  type TextPart,
  type Todo,
} from "@opencode-ai/sdk/v2";
import { workspacesDir } from "../boundary";
import { delegationHubUrl } from "../delegation";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import { isMachineAgent } from "../machine-agent";
import { ensureSessiond, SessiondClient } from "../sessiond-client";
import { resolveBin } from "../tools";
import {
  readJson,
  readSidecar,
  syncMemory,
  syncSkillFiles,
  writeJson,
} from "./fleet-common";

function withImageAttachments(
  output: string,
  attachments: FilePart[] = []
): string | NeutralContentBlock[] {
  const images: NeutralContentBlock[] = attachments
    .filter(
      (part) => part.mime.startsWith("image/") && part.url.startsWith("data:")
    )
    .map((part) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: part.mime,
        data: part.url.slice(part.url.indexOf(",") + 1),
      },
    }));
  return images.length ? [{ type: "text", text: output }, ...images] : output;
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let lastIdMs = 0;
let idCounter = 0;

/**
 * An opencode message id, minted here so a send can name the message it
 * becomes. opencode refuses a given id without its `msg` prefix, so it is
 * minted the way opencode's own `Identifier.ascending` mints one
 * (packages/opencode/src/id/id.ts): the prefix, the low 6 bytes of
 * `Date.now() * 0x1000 + counter` as hex, then 14 random base62 characters.
 * It lists a session's messages by when it wrote them, the id only breaking
 * ties (message-v2.ts: `.orderBy(desc(MessageTable.time_created),
 * desc(MessageTable.id))`).
 */
export function messageId(): string {
  const now = Date.now();
  if (now !== lastIdMs) {
    lastIdMs = now;
    idCounter = 0;
  }
  idCounter += 1;
  const stamp = (BigInt(now) * 0x10_00n + BigInt(idCounter))
    .toString(16)
    .padStart(12, "0")
    .slice(-12);
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(14)),
    (byte) => BASE62[byte % 62]
  ).join("");
  return `msg_${stamp}${random}`;
}

/**
 * opencode's own config files — the machine profile the fleet sync converges.
 * Resolved the way opencode resolves its global config (`xdg-basedir`'s
 * `xdgConfig`, joined with "opencode") and the way `CONFIG_PATH` (../config)
 * resolves cawco's: an agent run under another `XDG_CONFIG_HOME` joins the hub its own
 * config names, so the opencode config it writes must be that root's too, never
 * the machine's.
 */
const OPENCODE_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "opencode"
);
const OPENCODE_SKILLS = join(OPENCODE_DIR, "skills");
const OPENCODE_MEMORY = join(OPENCODE_DIR, "AGENTS.md");
const OPENCODE_CONFIG = join(OPENCODE_DIR, "opencode.json");
const OPENCODE_SIDECAR = join(OPENCODE_DIR, "cawco-fleet.json");
const OPENCODE_PLUGINS = join(OPENCODE_DIR, "plugins");

/**
 * The static permission/tools policy passed via OPENCODE_CONFIG_CONTENT at
 * server spawn time. Single source of truth shared by {@link #ensure} (which
 * builds the env var) and {@link #hashConfig} (which includes it in the
 * convergence fingerprint). Changes here require a server restart, not just
 * a dispose reload.
 */
const STATIC_POLICY = {
  permission: { bash: "ask", edit: "ask", webfetch: "deny" },
  tools: { websearch: false },
} as const;

/** The hub's MCP server as opencode configures a remote server. */
const cawcoMcp = () => ({
  type: "remote" as const,
  url: `${delegationHubUrl()}/mcp/cawco`,
  timeout: IMAGE_GENERATION_TIMEOUT_MS + 60_000,
  enabled: true,
  oauth: false as const,
});

/**
 * The config keys the convergence system fingerprints and verifies against
 * the server's resolved state. Keyed by the opencode.json field name.
 * `mcp` is excluded — it's verified authoritatively via `mcp.status()`.
 */
const CONTROLLED_CONFIG_FIELDS = [
  "agent",
  "disabled_providers",
  "enabled_providers",
  "model",
  "plugin",
  "provider",
  "small_model",
] as const;

/** Retire the pre-rename generated plugin so OpenCode registers each fleet tool once. */
export async function retireLegacyHandoffPlugin(
  directory = OPENCODE_DIR
): Promise<void> {
  const legacy = join(directory, "plugins", "cockpit-handoff.js");
  if (await Bun.file(legacy).exists()) {
    await rename(legacy, `${legacy}.disabled-${Date.now()}`);
  }
  const configPath = join(directory, "opencode.json");
  const config = await readJson<Record<string, unknown>>(configPath);
  if (Array.isArray(config?.plugin)) {
    const plugins = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !(
          entry === "cockpit-handoff.js" ||
          entry.endsWith("/cockpit-handoff.js")
        )
    );
    if (plugins.length !== config.plugin.length) {
      await writeJson(configPath, { ...config, plugin: plugins });
    }
  }
}

const GENERATED_BRIDGE = /^cawco-(?:handoff|context)(?:-[a-f0-9]+)?\.js$/;

/** A new import URL bypasses Bun's plugin module cache without restarting OpenCode. */
export async function writeHandoffPlugin(
  source: string,
  directory = OPENCODE_DIR
): Promise<string> {
  const plugins = join(directory, "plugins");
  const name = `cawco-context-${Bun.hash(source).toString(16)}.js`;
  const target = join(plugins, name);
  if (!(await Bun.file(target).exists())) {
    await Bun.write(target, source);
  }
  await retireLegacyHandoffPlugin(directory);
  const obsolete = (await readdir(plugins)).filter(
    (file) => file !== name && GENERATED_BRIDGE.test(file)
  );
  await Promise.all(
    obsolete.map((file) =>
      rename(
        join(plugins, file),
        join(plugins, `${file}.disabled-${Date.now()}`)
      )
    )
  );
  const configPath = join(directory, "opencode.json");
  const config = await readJson<Record<string, unknown>>(configPath);
  if (Array.isArray(config?.plugin)) {
    const remaining = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !GENERATED_BRIDGE.test(entry.split("/").pop() ?? "")
    );
    if (remaining.length !== config.plugin.length) {
      await writeJson(configPath, { ...config, plugin: remaining });
    }
  }
  return target;
}

/**
 * The server's identity under sessiond. One headless server per machine owns
 * every session, so one procId per machine — stable across agent restarts,
 * which is exactly what lets a returning agent find the server it left running
 * instead of starting a second one.
 */
export const OPENCODE_SERVER_PROC_ID = "opencode-server";

/**
 * How long the announce line may take to reach the ring. Our choice: the SDK's
 * own `createOpencodeServer` default is 5 s
 * (`@opencode-ai/sdk/dist/server.js`, `timeout: 5000`); we allow more because
 * the child now boots through a daemon on a cold machine rather than as a
 * direct child, and a false timeout here starts a *second* server.
 */
export const SERVER_ANNOUNCE_TIMEOUT_MS = 30_000;
/** Recovery cancels the actual HTTP operation, never races an abandoned promise. */
export const RECOVERY_TIMEOUT_MS = 10_000;

/**
 * How long a turn may go with no server event at all before the wait itself
 * is framed as a `provider_stalled` system note. Our choice: the hangs seen
 * live ran 6+ silent minutes, while first tokens on huge contexts can
 * legitimately take one or two — 3 minutes sits between "slow" and "stuck".
 * Fires at most once per turn; any server event re-arms it.
 */
export const STALLED_TURN_MS = 3 * 60_000;

/**
 * What an opencode session id looks like — the server's own shape (verified
 * live: it answers `Expected a string starting with "ses"` to anything else).
 * Every server call keyed by a caller-supplied session key is guarded by
 * {@link assertOpencodeKey}, so a cawco instance id handed over as a key is
 * refused here, loudly, and never sent: two sessions once went unrevivable
 * because the hub resumed them under their instance uuids.
 */
/**
 * Deterministic JSON serialization: sorts object keys at every level so that
 * logically identical configs always produce the same hash regardless of key
 * insertion order.
 */
const canonicalizeJson = (value: unknown): string => {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Whether every leaf in `desired` is present in `resolved` with the same value.
 * The runtime config is not the desired document read back: the server fills in
 * its own defaults (`agent.*.options`), and the plugin list carries CawCo's
 * own injected `cawco-context-*.js`. It is a superset of the parts CawCo
 * controls, so convergence means containment, not equality.
 *
 * A key the server genuinely lacks is still divergence, and stays divergence —
 * that is the check having teeth. An invalid key in the operator's config (the
 * schema sets `additionalProperties: false` on a model entry, so a typo like
 * `tools` for `tool_call` is dropped on read) will therefore fail convergence
 * and be reported by name. That is correct: the operator's config is wrong and
 * should say so, rather than being silently tolerated here.
 */
const containsJson = (desired: unknown, resolved: unknown): boolean => {
  if (desired === undefined) {
    return true;
  }
  if (Array.isArray(desired)) {
    return (
      Array.isArray(resolved) &&
      desired.every((value) =>
        resolved.some(
          (candidate) => canonicalizeJson(value) === canonicalizeJson(candidate)
        )
      )
    );
  }
  if (desired !== null && typeof desired === "object") {
    return (
      resolved !== null &&
      typeof resolved === "object" &&
      !Array.isArray(resolved) &&
      Object.entries(desired).every(
        ([key, value]) =>
          Object.hasOwn(resolved, key) &&
          containsJson(value, (resolved as Record<string, unknown>)[key])
      )
    );
  }
  return desired === resolved;
};

/**
 * The fingerprint of an opencode.json for the running server: the sections a
 * server reads at startup (plugin, mcp, provider, agent, models) plus the
 * permission/tools policy passed via OPENCODE_CONFIG_CONTENT, which a change
 * also needs a restart for. Theme/keybinds/tui don't affect the backend.
 * Canonical, so key order never moves it.
 */
const configHash = (config: Record<string, unknown>): string =>
  createHash("sha256")
    .update(
      canonicalizeJson({
        agent: config.agent ?? config.mode,
        disabled_providers: config.disabled_providers,
        enabled_providers: config.enabled_providers,
        mcp: config.mcp,
        model: config.model,
        plugin: config.plugin,
        provider: config.provider,
        small_model: config.small_model,
        _policy: STATIC_POLICY,
      })
    )
    .digest("hex");

/**
 * Every write of the machine's opencode.json goes through here and says who
 * wrote it, so a hash change the watcher reports can be matched to its writer
 * — or, with no line before it, to a writer outside this agent.
 */
const writeOpencodeConfig = async (
  writer: string,
  config: Record<string, unknown>
): Promise<void> => {
  await writeJson(OPENCODE_CONFIG, config);
  console.info(
    `[opencode] config written by ${writer} hash=${configHash(config).slice(0, 8)}`
  );
};

const OPENCODE_SESSION_ID = /^ses_/;

const assertOpencodeKey = (key: string, what: string): void => {
  if (!OPENCODE_SESSION_ID.test(key)) {
    throw new Error(
      `${what}: "${key}" is not an opencode session id (they start with "ses_") — this looks like a cawco instance id`
    );
  }
};

/**
 * The port announcement, parsed agent-side. sessiond parses nothing — it hands
 * back the child's stdout lines opaque, and the meaning is decided here.
 *
 * The format is the server's own, and the rule below is byte-for-byte the
 * SDK's (`@opencode-ai/sdk/dist/server.js`: `line.startsWith("opencode server
 * listening")` then `/on\s+(https?:\/\/[^\s]+)/`). Verified against the
 * installed binary (opencode 1.18.19), which prints:
 *
 *   Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.
 *   opencode server listening on http://127.0.0.1:43663
 *
 * — hence a per-line scan rather than a read of the first line.
 */
const SERVER_ANNOUNCEMENT_URL_PATTERN = /on\s+(https?:\/\/[^\s]+)/;

export const parseServerAnnouncement = (line: string): string | undefined => {
  if (!line.startsWith("opencode server listening")) {
    return undefined;
  }
  return line.match(SERVER_ANNOUNCEMENT_URL_PATTERN)?.[1];
};

/**
 * Put `opencode serve` under sessiond — or find the one already there — and
 * return the URL it announced.
 *
 * This is the whole of opencode's sessiond story (design §4.2). opencode is
 * server-first: sessions live in the server's own DB, events are re-subscribable
 * per directory, and the adapter is a plain HTTP + SSE client. The only reason
 * an agent restart used to kill live opencode work was that `createOpencode`
 * spawned the server as the *agent's* child. So opencode gets process keeping
 * and nothing else — no neutral-frame ring, because the server is its own event
 * authority and duplicating its storage would be pure cost.
 *
 * If a live server is already held, its spec is NOT re-applied: keeping the
 * running process is the point, and a config change lands on the next machine
 * boot (or a deliberate `sessiond` stop), never by killing sessions.
 */
export const attachOpencodeServer = async (options: {
  sessiond: SessiondClient;
  spec: ProcSpec;
  procId?: string;
  timeoutMs?: number;
}): Promise<{ url: string; freshlySpawned: boolean }> => {
  const procId = options.procId ?? OPENCODE_SERVER_PROC_ID;
  const timeoutMs = options.timeoutMs ?? SERVER_ANNOUNCE_TIMEOUT_MS;
  const client = options.sessiond;

  // Fresh, not the connect-time welcome: this client is long-lived and the
  // server may have exited since.
  const held = (await client.list()).procs.find(
    (proc) => proc.procId === procId
  );
  const freshlySpawned = !held?.alive;
  if (freshlySpawned) {
    await client.spawnProc(procId, options.spec);
  }

  const url = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.unsubscribe(procId);
      finish();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(
              `[opencode] no "opencode server listening" line from ${procId} within ${timeoutMs}ms`
            )
          )
        ),
      timeoutMs
    );
    // From seq 0: the announce line is printed once, at boot, and a returning
    // agent reads it out of the replay ring long after it was written. That
    // replay IS the port discovery — there is nowhere else the port is written.
    client.subscribe(
      procId,
      {
        line: (event) => {
          const announced = parseServerAnnouncement(event.data);
          if (announced) {
            settle(() => resolve(announced));
          }
        },
        exit: (exitCode) =>
          settle(() =>
            reject(
              new Error(
                `[opencode] serve exited (code ${exitCode}) before announcing a port`
              )
            )
          ),
        // The ring outran the announce line. Honest refusal rather than a guess:
        // the URL is unrecoverable from here, and inventing one would attach the
        // fleet to nothing.
        reset: (nextSeq) =>
          settle(() =>
            reject(
              new Error(
                `[opencode] ${procId}'s replay window lost the port announcement (resumes at ${nextSeq})`
              )
            )
          ),
      },
      0
    );
  });
  return { url, freshlySpawned };
};

/**
 * Supplies MCP caller identity, the workflow-only tool enabled by each
 * session's tool mask, and — in a delegation workspace's clone — the `bash`
 * that runs every command through the workspace's executor, inside its
 * boundary. A plugin tool named like a built-in takes its place
 * (opencode.ai/docs/plugins: "If a plugin tool uses the same name as a
 * built-in tool, the plugin tool takes precedence"); arguments are never
 * rewritten in `tool.execute.before`, which has not reliably taken effect.
 * The plugin is set up once per directory, which is the workspace's clone
 * for every session a work item runs there.
 */
export const buildHandoffPluginSource =
  (): string => `import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { tool } from "@opencode-ai/plugin";
const cawcoBase = ${JSON.stringify(delegationHubUrl())};
const cawcoWorkspaces = ${JSON.stringify(workspacesDir())};
const boundaryOf = (directory) => {
  let ids = [];
  try { ids = readdirSync(cawcoWorkspaces); } catch { return undefined; }
  for (const id of ids) {
    try {
      const held = JSON.parse(readFileSync(cawcoWorkspaces + "/" + id + "/boundary.json", "utf8"));
      if (held.path === directory) return held;
    } catch {}
  }
  return undefined;
};
const OUTPUT_LIMIT = 30000;
const boundedBash = (held) => tool({
  description: "Runs a bash command inside this workspace's boundary, in the workspace's clone unless workdir says otherwise. The command can write only the clone, /tmp (the workspace's own), ~/.cache, ~/.bun and ~/.npm; it sees and signals only this workspace's processes, and cannot reach the service manager. Each call is a fresh shell. The output is stdout and stderr together, cut at 30000 characters.",
  args: {
    command: tool.schema.string().describe("The command to run"),
    timeout: tool.schema.number().optional().describe("Milliseconds before the command is killed: 120000 unless given, at most 600000"),
    workdir: tool.schema.string().optional().describe("The directory to run in; the workspace's clone unless given"),
    description: tool.schema.string().describe("What the command does, in 5-10 words"),
  },
  async execute(args, context) {
    const timeout = Math.min(args.timeout ?? 120000, 600000);
    const child = spawn(held.exec, [args.command], { cwd: args.workdir ?? context.directory, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const take = (chunk) => { output += chunk.toString(); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    context.abort.addEventListener("abort", stop, { once: true });
    const exit = await new Promise((resolve) => {
      child.on("error", (error) => { output += String(error); resolve(127); });
      child.on("close", (code, signal) => resolve(code ?? signal));
    });
    clearTimeout(timer);
    context.abort.removeEventListener("abort", stop);
    const cut = output.length > OUTPUT_LIMIT ? output.slice(0, OUTPUT_LIMIT) + "\\n[output cut at " + OUTPUT_LIMIT + " characters]" : output;
    const notes = (timedOut ? "\\n[killed after " + timeout + "ms]" : "") + (exit === 0 ? "" : "\\n[exit " + exit + "]");
    return { title: args.description, output: cut + notes, metadata: { exit, description: args.description } };
  },
});
export const CawcoContext = async ({ directory }) => {
const bounded = boundaryOf(directory);
const cawcoStep = async (context) => {
  const response = await fetch(cawcoBase + "/api/instances");
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  const actor = rows.find(row => row.sessionId === context.sessionID && row.cwd === directory && row.workflowStepId);
  if (!actor) throw new Error("This tool is available only to workflow steps.");
  return actor;
};
return ({
  tool: {
    cawco_submit_result: tool({
      description: "Call exactly once with an object matching the schema in your instructions, then end your turn. The hub's validation message is returned verbatim on failure.",
      args: { result: tool.schema.record(tool.schema.string(), tool.schema.unknown()) },
      async execute({ result }, context) {
        const actor = await cawcoStep(context);
        const recorded = await fetch(cawcoBase + "/api/workflow-steps/" + encodeURIComponent(actor.workflowStepId) + "/result", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, result })
        });
        return recorded.text();
      }
    }),
    cawco_workflow_state_read: tool({
      description: "Read a named slot of this workflow run's shared state. Only slots the run's program declared with w.state(name, schema) exist.",
      args: { name: tool.schema.string() },
      async execute({ name }, context) {
        const actor = await cawcoStep(context);
        const read = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(name) + "?instanceId=" + encodeURIComponent(actor.id));
        if (!read.ok) throw new Error(await read.text());
        return read.text();
      }
    }),
    cawco_workflow_state_write: tool({
      description: "Write a named slot of this workflow run's shared state. The value is validated against the schema the run's program declared; the validator's message comes back verbatim on failure.",
      args: { name: tool.schema.string(), value: tool.schema.unknown() },
      async execute({ name, value }, context) {
        const actor = await cawcoStep(context);
        const written = await fetch(cawcoBase + "/api/workflow-runs/" + encodeURIComponent(actor.workflowRunId) + "/state/" + encodeURIComponent(name), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instanceId: actor.id, value })
        });
        return written.text();
      }
    }),
    ...(bounded ? { bash: boundedBash(bounded) } : {})
  },
  "tool.execute.before": async (input, output) => {
    if (input.tool.startsWith("cawco_")) {
      output.args.__cawco = { sessionId: input.sessionID, directory };
    }
  },
});
};`;

/**
 * Whether a parked permission should be auto-allowed by the daemon itself.
 *
 * A question always routes — the parent session, or the user, answers it. Only
 * `acceptEdits` is left to the caller: granting edits alone needs the
 * permission's own type, which this decision does not see.
 */
export function autoAllows(
  permissionMode: string | undefined,
  kind: "question" | "tool"
): boolean {
  if (kind === "question") {
    return false;
  }
  return permissionMode === "bypassPermissions";
}

/** opencode's own name for the tool a question rides on. */
const QUESTION_TOOL = "question";

/**
 * What a question part is written down as. opencode calls the tool `question`;
 * the rest of the fleet calls it {@link ASK_USER_QUESTION}, and the renderer
 * keys off that name, so the rename happens here rather than in the dashboard.
 */
const toolNameOf = (tool: string): string =>
  tool === QUESTION_TOOL ? ASK_USER_QUESTION : tool;

/** opencode's question shape, which says `multiple` where the fleet says `multiSelect`. */
const questionsOf = (raw: unknown): UserQuestion[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  const questions: UserQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const q = item as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiple?: unknown;
    };
    if (typeof q.question !== "string" || !Array.isArray(q.options)) {
      return null;
    }
    questions.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : q.question,
      options: q.options as UserQuestion["options"],
      multiSelect: q.multiple === true,
    });
  }
  return questions;
};

/**
 * How a question ended, read off the part opencode already keeps: the asked
 * questions live in `state.input`, and the reader's choices in
 * `state.metadata.answers` as one label array per question, in the order they
 * were asked.
 *
 * Taking it from the part rather than from the `question.*` events is what
 * makes every route agree. The part completes whether the answer came through
 * cawco, through opencode's own TUI, or from any other client on the server —
 * and because opencode stores it, a reloaded transcript replays it too. Events
 * would have covered only the live case, and only the routes we thought of.
 *
 * `null` for any part that is not a question, which is every other tool.
 */
function questionResultOf(part: {
  tool: string;
  state: { status: string; input?: unknown; metadata?: unknown };
}): UserQuestionResult | null {
  if (part.tool !== QUESTION_TOOL) {
    return null;
  }
  const questions = questionsOf(
    (part.state.input as { questions?: unknown } | undefined)?.questions
  );
  if (!questions) {
    return null;
  }
  const raw = (part.state.metadata as { answers?: unknown } | undefined)
    ?.answers;
  // A question that completed carrying no answers is one the reader walked away
  // from; it is not an answered question with an empty map, and saying so is the
  // whole reason the outcome is a union.
  if (!Array.isArray(raw)) {
    return { outcome: "dismissed", questions };
  }
  const answers: UserAnswers = {};
  questions.forEach((question, i) => {
    const picked = Array.isArray(raw[i]) ? (raw[i] as string[]) : [];
    // opencode answers uniformly in arrays. The array is kept only where the
    // question allowed several — a lone choice stored as a one-element array
    // would draw as a list of one.
    answers[question.question] = question.multiSelect
      ? picked
      : (picked[0] ?? "");
  });
  return { outcome: "answered", questions, answers };
}

/** A fleet MCP definition, in opencode's `opencode.json` `mcp` shape. */
const toOpencodeMcp = (
  config: FleetMcpConfig
): McpLocalConfig | McpRemoteConfig => {
  if ("url" in config) {
    return {
      type: "remote",
      url: config.url,
      enabled: true,
      oauth: false,
      ...(config.headers ? { headers: config.headers } : {}),
    };
  }
  return {
    type: "local",
    enabled: true,
    command: [config.command, ...(config.args ?? [])],
    ...(config.env ? { environment: config.env } : {}),
  };
};

/** Merges the fleet's servers into `opencode.json`, preserving every other key. */
const syncOpencodeMcp = async (
  desired: { name: string; config: FleetMcpConfig; enabled: boolean }[],
  managed: string[],
  report: Record<string, FleetItemState>
): Promise<string[]> => {
  const wanted = desired.filter((server) => server.enabled);
  const stored =
    (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
  const mcp = (stored.mcp as Record<string, unknown> | undefined) ?? {};

  for (const server of wanted) {
    mcp[server.name] = toOpencodeMcp(server.config);
  }
  const names = wanted.map((server) => server.name);
  for (const name of managed) {
    if (names.includes(name)) {
      continue;
    }
    delete mcp[name];
    report[name] = { state: "removed" };
  }

  await writeOpencodeConfig("fleet sync", { ...stored, mcp });
  return names;
};

const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

const COMMAND_KINDS: Partial<Record<string, SlashCommand["kind"]>> = {
  skill: "skill",
  mcp: "mcp",
  command: "custom",
};

export const OPENCODE_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
  setModel: true,
  effort: true,
  contextUsage: true,
  supportedModels: true,
  supportedCommands: true,
  reloadSkills: true,
  mcpStatus: true,
  mcpControl: true,
  listSessions: true,
  getSessionMessages: true,
  renameSession: true,
  deleteSession: true,
  fork: true,
  rewind: true,
  tagSession: true,
  skills: true,
  subagents: true,
  tasks: true,
  compaction: true,
  costUsd: true,
  thinking: true,
  images: true,
  handoff: true,
  hooks: false,
  plugins: true,
  fleet: true,
};

/** The scratch tag sidecar — opencode sessions have no tag, so cawco keeps its own. */
const TAGS_PATH = join(homedir(), ".config", "opencode", "cawco-tags.json");

const readTags = async (): Promise<Record<string, string>> => {
  const file = Bun.file(TAGS_PATH);
  if (!(await file.exists())) {
    return {};
  }
  try {
    return (await file.json()) as Record<string, string>;
  } catch {
    return {};
  }
};

const writeTag = async (
  sessionId: string,
  tag: string | null
): Promise<void> => {
  const tags = await readTags();
  if (tag === null) {
    delete tags[sessionId];
  } else {
    tags[sessionId] = tag;
  }
  await Bun.write(TAGS_PATH, JSON.stringify(tags));
};

/**
 * The opencode sessions with a turn this agent opened and has not ended: the
 * hub is waiting on each for its `result`. On disk because an agent restart
 * loses the process that would have sent it; the process that reattaches the
 * session reads it here, and ends that turn from the server's own history if
 * the server finished it meanwhile (see `watchResumedTurn`).
 */
const OPEN_TURNS_PATH = join(OPENCODE_DIR, "cawco-open-turns.json");
let openTurns: Promise<Set<string>> | undefined;
let openTurnsWritten: Promise<void> = Promise.resolve();

const loadOpenTurns = (): Promise<Set<string>> => {
  openTurns ??= Bun.file(OPEN_TURNS_PATH)
    .exists()
    .then(async (exists) =>
      exists
        ? new Set((await Bun.file(OPEN_TURNS_PATH).json()) as string[])
        : new Set<string>()
    );
  return openTurns;
};

/** Records that `sessionId`'s turn is open (the hub is owed its end) or closed. */
const markTurn = (sessionId: string, open: boolean): void => {
  openTurnsWritten = openTurnsWritten
    .then(async () => {
      const ids = await loadOpenTurns();
      if (open === ids.has(sessionId)) {
        return;
      }
      if (open) {
        ids.add(sessionId);
      } else {
        ids.delete(sessionId);
      }
      await Bun.write(OPEN_TURNS_PATH, JSON.stringify([...ids]));
    })
    .catch((error: unknown) =>
      console.warn(`[opencode] open-turn record for ${sessionId}: ${error}`)
    );
};

/** Whether an earlier process left `sessionId` with a turn it never ended. */
const turnWasOpen = async (sessionId: string): Promise<boolean> => {
  await openTurnsWritten;
  return (await loadOpenTurns()).has(sessionId);
};

const sessionToInfo = (session: Session, tag?: string): NeutralSessionInfo => ({
  sessionId: session.id,
  harness: "opencode",
  ...(session.title ? { customTitle: session.title } : {}),
  lastModified: session.time.updated,
  ...(session.time.created ? { createdAt: session.time.created } : {}),
  ...(session.directory ? { cwd: session.directory } : {}),
  ...(tag ? { tag } : {}),
});

/** A provider error's own words, kept whole: name, status and message ride together. */
const errorText = (error: unknown): string => {
  const e = error as
    | { name?: string; data?: { message?: string; statusCode?: number } }
    | undefined;
  const name = e?.name ?? "error";
  const status = e?.data?.statusCode;
  const message = e?.data?.message ?? "opencode session failed";
  return `${name}${status ? ` ${status}` : ""}: ${message}`;
};

/**
 * The SDK answers a request that never reached the server (connection
 * refused, reset, timed out) with `{ error }` and no response, the same shape
 * as the server's own refusal. Here that is an exception: an unreachable
 * server is never "no sessions", "not held" or "no commands". A request the
 * server answered comes back for its own `error` to be read.
 */
async function reached<T extends { response?: Response; error?: unknown }>(
  pending: Promise<T>
): Promise<T> {
  const result = await pending;
  if (!result.response) {
    throw result.error;
  }
  return result;
}

/**
 * The SSE reader owns cancellation once headers arrive. Aborting fetch's body
 * first makes the SDK's unobserved reader.cancel() reject (SDK 1.18.34).
 * Until headers arrive the caller still cancels the actual connection.
 */
export async function fetchOpencode(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input, init);
  if (new URL(request.url).pathname !== "/event") {
    return await fetch(request);
  }
  const { signal } = request;
  signal.throwIfAborted();
  const connecting = new AbortController();
  const stop = () => connecting.abort(signal.reason);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const response = await fetch(
      new Request(request, { signal: connecting.signal })
    );
    signal.throwIfAborted();
    return response;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

/** `provider/model` or a bare model id, into opencode's two-part model reference. */
const splitModel = (
  model: string
): { providerID?: string; modelID?: string } => {
  const slash = model.indexOf("/");
  if (slash < 0) {
    return { modelID: model };
  }
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
};

/** `/name rest` → its parts; undefined for anything that is not a slash command. */
const parseCommand = (
  text: string
): { name: string; args: string } | undefined => {
  if (!text.startsWith("/") || text.length === 1) {
    return undefined;
  }
  const rest = text.slice(1);
  const sp = rest.indexOf(" ");
  if (sp === -1) {
    return { name: rest, args: "" };
  }
  return { name: rest.slice(0, sp), args: rest.slice(sp + 1) };
};

/** A message's final content, keyed by part id in arrival order, for its closing frame. */
interface PendingMessage {
  /**
   * The message's text, reasoning and tool parts, in the order they appeared —
   * the order {@link toTranscript} lists them in, so a block's place here is
   * the index its row is keyed by live and after a reload alike.
   */
  blocks: string[];
  parts: Map<string, { kind: "text" | "thinking"; text: string }>;
  /** The parts already published as a block; each is published once. */
  published: Set<string>;
}

const pendingMessage = (): PendingMessage => ({
  blocks: [],
  parts: new Map(),
  published: new Set(),
});

/** A part's place among its message's blocks, taken on first sight. */
const blockIndex = (pending: PendingMessage, partID: string): number => {
  const at = pending.blocks.indexOf(partID);
  return at === -1 ? pending.blocks.push(partID) - 1 : at;
};

/**
 * The live thinking stream, in the partial-event shape the dashboard's stream
 * reader already folds — the same events the claude adapter forwards from the
 * SDK verbatim. `NeutralStreamMessage` names only the text delta the adapters
 * emitted until now, so these three are typed here and widened once at the sink
 * rather than sent loosely.
 */
interface ThinkingStreamFrame {
  event:
    | {
        type: "content_block_start";
        content_block: { type: "thinking"; thinking: string };
      }
    | {
        type: "content_block_delta";
        delta: { type: "thinking_delta"; thinking: string };
      }
    | { type: "content_block_stop" };
  session_id?: string;
  type: "stream_event";
}

/** A child (subagent) session's own pipeline state, kept apart from the parent's. */
interface ChildState {
  pending: Map<string, PendingMessage>;
  roles: Map<string, "user" | "assistant">;
  toolsEmitted: Map<string, "called" | "resolved">;
}

const EMPTY_TOKENS = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

/** Providers an OpenCode account can actually use, including OAuth. */
async function connectedProviders(
  client: OpencodeClient,
  directory?: string
): Promise<Pick<Provider, "id" | "models">[]> {
  const result = await client.provider.list(directory ? { directory } : {});
  if (result.error) {
    throw new Error(errorText(result.error));
  }
  const data = result.data as unknown as {
    all?: Pick<Provider, "id" | "models">[];
    connected?: string[];
  };
  const connected = new Set(data.connected ?? []);
  return (data.all ?? []).filter((provider) => connected.has(provider.id));
}

/**
 * Every model the connected providers offer, plus a `default` row naming the
 * model this opencode server itself runs when a session names none — so a
 * spawn that picks no model still names one. Opencode's own rule
 * (`Provider.defaultModel`, packages/opencode/src/provider/provider.ts
 * 2030–2062): the config's `model`; else the first provider (among the
 * configured ones, when the config names any) and that provider's top model,
 * which is what the server's `default` map holds for it (`defaultModelIDs`,
 * same file 1188, the same `sort()[0]`). Its recent-model step reads a local
 * state file the server does not expose, so it is not followed. A default
 * the catalog does not list gets no row: nothing would run it.
 */
export async function opencodeCatalog(
  client: OpencodeClient,
  directory?: string
): Promise<ModelInfo[]> {
  const scope = directory ? { directory } : {};
  const [listed, configured] = await Promise.all([
    client.provider.list(scope),
    client.config.get(scope),
  ]);
  if (listed.error) {
    throw new Error(errorText(listed.error));
  }
  if (configured.error) {
    throw new Error(errorText(configured.error));
  }
  const data = listed.data as unknown as {
    all?: Pick<Provider, "id" | "models">[];
    connected?: string[];
    default?: Record<string, string>;
  };
  const connected = new Set(data.connected ?? []);
  const providers = (data.all ?? []).filter((p) => connected.has(p.id));
  const models = modelCatalog(providers);
  const config = configured.data as { model?: string; provider?: object };
  const named = Object.keys(config.provider ?? {});
  const first = providers.find(
    (p) => named.length === 0 || named.includes(p.id)
  );
  const id =
    config.model ??
    (first && data.default?.[first.id]
      ? `${first.id}/${data.default[first.id]}`
      : undefined);
  const resolved = id ? models.find((row) => row.value === id) : undefined;
  return resolved
    ? [
        ...models,
        { ...resolved, value: "default", resolvedModel: resolved.value },
      ]
    : models;
}

/** Every model the connected providers offer, with its effort scale and context window. */
function modelCatalog(
  providers: Pick<Provider, "id" | "models">[]
): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const provider of providers) {
    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      const { variants } = model as unknown as {
        variants?: Record<
          string,
          { reasoningEffort?: string; disabled?: boolean }
        >;
      };
      const supportedEffortLevels = EFFORT_LEVELS.filter(
        (level) =>
          variants?.[level]?.reasoningEffort === level &&
          !variants[level].disabled
      );
      models.push({
        value: `${provider.id}/${modelID}`,
        displayName: `${model.name ?? modelID}`,
        ...(supportedEffortLevels.length
          ? { supportsEffort: true, supportedEffortLevels }
          : {}),
        ...(model.limit?.context ? { contextWindow: model.limit.context } : {}),
      });
    }
  }
  return models;
}

export class OpencodeSession implements HarnessSession {
  attached?: () => void;
  readonly harness = "opencode" as const;
  sessionId: string | null;
  /**
   * Whether this session is mid-turn or awaiting an answer — the harness's own
   * knowledge, not the server's (the server may have gone away already). Used by
   * the config convergence gate so a reload never interrupts active work.
   */
  get active(): boolean {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #busy is reassigned elsewhere in the class; biome's per-method inference doesn't see that
    return this.#busy || this.#questions.size > 0;
  }
  readonly #ctx: HarnessContext;
  #client: OpencodeClient;
  readonly #directory: string;
  #model: string | undefined;
  #effort: EffortLevel | undefined;
  #lastTokens = EMPTY_TOKENS;
  readonly #roles = new Map<string, "user" | "assistant">();
  readonly #costs = new Map<string, number>();
  #costBase = 0;
  readonly #pending = new Map<string, PendingMessage>();
  /** The reasoning part whose live block is open, so it is closed exactly once. */
  #openThinking: string | null = null;
  readonly #toolsEmitted = new Map<string, "called" | "resolved">();
  #busy = false;
  /**
   * Busy since {@link reattachedMidTurn}, on the server's word alone, until
   * {@link watchResumedTurn} has read the turn again.
   */
  #reattachedBusy = false;
  /** The last provider-retry note surfaced, so a repeating retry says it once. */
  #lastRetryNote = "";
  /** The message id of the prompt this process sent that the open turn answers. */
  #turnPrompt: string | undefined;
  #open = false;
  /**
   * A turn is open: the hub is owed its end (a `result` frame). Recorded on
   * disk as well, so an agent restart that loses this process does not lose
   * the debt — the process that reattaches the session reads it back.
   */
  get #turnOpen(): boolean {
    return this.#open;
  }
  set #turnOpen(open: boolean) {
    if (!open) {
      this.#turnPrompt = undefined;
    }
    if (open !== this.#open) {
      this.#open = open;
      if (this.sessionId) {
        markTurn(this.sessionId, open);
      }
    }
  }
  /** Armed while a turn is open without any server event; see STALLED_TURN_MS. */
  #stallTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Sends held while the config gate is up, and any that arrive while they
   * are delivered, each under the message id it will become.
   */
  readonly #queue: {
    parts: unknown[];
    model?: { providerID?: string; modelID?: string };
    messageID: string;
    uuid: string;
  }[] = [];
  /** The held send delivered last, until opencode has written it. */
  #draining: string | undefined;
  /** The assistant message opencode is writing, until it is complete. */
  #answering: string | undefined;
  /** User messages opencode has written that the session has yet to be given. */
  readonly #readAfter: string[] = [];
  /**
   * When opencode created each message it has said this session (or one of
   * its subagents) has, by message id — the clock a history read dates its
   * entries by, so the live frames carry it too.
   */
  readonly #created = new Map<string, string>();
  /** Every user message already counted into {@link #readAfter}, so none is read twice. */
  readonly #written = new Set<string>();
  #permissionMode: string | undefined;
  #providersCache: Promise<Pick<Provider, "id" | "models">[]> | undefined;
  #commandNames: Promise<Set<string>> | null = null;
  readonly #questions = new Set<string>();
  readonly #seenGates = new Set<string>();
  readonly #resolvedGates = new Set<string>();
  readonly #gateFailures = new Set<string>();
  #reconciling: Promise<void> | undefined;
  readonly #lifetime = new AbortController();
  readonly #questionData = new Map<string, UserQuestion[]>();
  readonly #childInfo = new Map<string, { agent?: string; title?: string }>();
  readonly #childState = new Map<string, ChildState>();
  readonly #boundCalls = new Set<string>();
  readonly #registerChild: (childId: string, callID: string) => void;
  readonly #onRelease: () => void;
  readonly instanceId: string;
  /**
   * Returns true when the harness's config gate is held. Injected by the
   * harness so sessions can queue dispatches without a back-reference.
   */
  readonly #isConfigGateHeld: () => boolean;
  readonly #workflowStepId?: string;
  readonly #canDelegate?: boolean;

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    client: OpencodeClient,
    sessionId: string,
    directory: string,
    model: string | undefined,
    permissionMode: string | undefined,
    registerChild: (childId: string, callID: string) => void,
    onRelease: () => void,
    isConfigGateHeld: () => boolean,
    effort?: EffortLevel,
    workflowStepId?: string,
    canDelegate?: boolean
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    this.#client = client;
    this.sessionId = sessionId;
    this.#directory = directory;
    this.#model = model;
    this.#effort = effort;
    this.#permissionMode = permissionMode;
    this.#registerChild = registerChild;
    this.#onRelease = onRelease;
    this.#isConfigGateHeld = isConfigGateHeld;
    this.#workflowStepId = workflowStepId;
    this.#canDelegate = canDelegate;
  }

  /**
   * Says the effort this session sends ({@link EFFORT_READ}): the variant every
   * prompt and command carries, or null when it carries none and the server
   * answers on the model's own default.
   */
  sayEffort(): void {
    this.#ctx.frame({
      type: "system",
      subtype: EFFORT_READ,
      effort: this.#effort ?? null,
    });
  }

  /**
   * Called by the harness after a config reload completes. Drains any messages
   * that were queued because the config gate was held.
   */
  configGateLifted(): void {
    this.#drainQueue();
  }

  /**
   * Rebind this session to a new server after the old one went away — a
   * config restart, or a crash the harness respawned it from. The session
   * keeps its id and history; only the client changes.
   */
  rebindClient(client: OpencodeClient): void {
    this.#client = client;
  }

  /** Routes one opencode event into neutral frames for this session. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the opencode event union's per-type routing switch; not refactored in this pass
  handle(event: Event): void {
    const p = event.properties as Record<string, unknown> & {
      sessionID?: string;
    };
    const sid = p.sessionID;
    if (sid !== undefined && sid !== this.sessionId) {
      return;
    }
    // Any event off the wire is a sign of life: a turn that keeps emitting
    // can never trip the stall notice, only a truly silent one does.
    this.#noteServerActivity();

    // `message.part.delta` is a real event the SDK's generated union omits, so
    // switch on the string form rather than the nominal `Event` union.
    const type = event.type as string;
    if (
      sid === this.sessionId &&
      (type === "permission.updated" ||
        type === "permission.asked" ||
        type === "question.asked" ||
        type === "question.v2.asked")
    ) {
      const id = p.id as string;
      if (this.#seenGates.has(id) || this.#resolvedGates.has(id)) {
        return;
      }
      this.#seenGates.add(id);
    }
    if (type === "permission.replied") {
      const id = p.requestID as string;
      this.#resolvedGates.add(id);
      this.#ctx.permissionResolved?.(id);
      return;
    }
    switch (type) {
      case "message.updated": {
        const { info } = p as { info?: Message };
        if (!info) {
          return;
        }
        this.#roles.set(info.id, info.role);
        this.#noteCreated(info);
        if (info.role === "assistant") {
          this.#costs.set(info.id, info.cost);
          this.#lastTokens = info.tokens;
          if (!info.time.completed) {
            this.#answering = info.id;
          } else if (this.#answering === info.id) {
            // The answer is whole: its blocks go on screen, then the sends
            // written while it was being written — the order opencode keeps.
            this.#answering = undefined;
            this.#flushMessages(this.#pending, this.#roles);
            this.#releaseReads();
          }
        }
        // A user message written into the session: read, by the id the hub
        // was told at dispatch (`MESSAGES_STORED`). Written while an answer is
        // still being written, it is read after that answer: where opencode
        // stores it, and when the model is given it. One the hub never sent
        // (typed in opencode itself) is an id it has no send under.
        if (info.role === "user" && !this.#written.has(info.id)) {
          this.#written.add(info.id);
          this.#readAfter.push(info.id);
          if (!this.#answering) {
            this.#releaseReads();
          }
        }
        this.#drained(info.id);
        break;
      }
      case "message.part.updated": {
        const { part } = p as { part?: Part };
        if (!part) {
          return;
        }
        const { messageID } = part;
        if (
          messageID !== undefined &&
          part.sessionID !== undefined &&
          part.sessionID !== this.sessionId
        ) {
          return;
        }
        this.#part(part);
        break;
      }
      case "message.part.delta": {
        const props = event.properties as unknown as {
          sessionID?: string;
          messageID?: string;
          partID?: string;
          field?: string;
          delta?: string;
        };
        if (props.field !== "text") {
          break;
        }
        if (this.#roles.get(props.messageID ?? "") !== "assistant") {
          break;
        }
        if (!props.delta) {
          break;
        }
        // A delta event carries no part type, so the kind is whatever the
        // part's `message.part.updated` already established — opencode opens a
        // reasoning part with an empty-text update and then streams its trace
        // over these `field: "text"` deltas. Routing them blindly as prose is
        // what made a reasoning trace appear as message text while streaming.
        const pending = this.#pendingOf(props.messageID ?? "");
        const existing = props.partID
          ? pending.parts.get(props.partID)
          : undefined;
        const held = existing?.kind === "thinking" ? "thinking" : "text";
        if (props.partID) {
          blockIndex(pending, props.partID);
        }
        if (held === "thinking" && props.partID) {
          if (this.#openThinking !== props.partID) {
            this.#closeThinking();
            this.#openThinking = props.partID;
            this.#thinkingFrame({
              type: "content_block_start",
              content_block: { type: "thinking", thinking: "" },
            });
          }
          this.#thinkingFrame({
            type: "content_block_delta",
            delta: { type: "thinking_delta", thinking: props.delta },
          });
        } else {
          this.#closeThinking();
          this.#ctx.frame({
            type: "stream_event",
            session_id: this.sessionId ?? undefined,
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: props.delta },
            },
          });
        }
        // `message.part.delta` is the streaming chunks, and the full stream they
        // carry is the authoritative text — `part.text` on `message.part.updated`
        // is capped at 4000 chars, and a part longer than the transport's buffer
        // never lands at all. The accumulated deltas are the truth either way.
        if (props.partID) {
          const acc = (existing?.text ?? "") + props.delta;
          pending.parts.set(props.partID, { kind: held, text: acc });
        }
        break;
      }
      case "permission.asked": {
        if (sid !== this.sessionId) {
          return;
        }
        const asked = event.properties as unknown as PermissionRequest;
        // opencode's permission system publishes events and never consults a
        // plugin, so the daemon is where a session's mode is enforced.
        if (
          autoAllows(this.#permissionMode, "tool") ||
          (this.#permissionMode === "acceptEdits" &&
            asked.permission === "edit")
        ) {
          this.#replyPermission(asked.id, "once");
          break;
        }
        this.#ctx.permission({
          requestId: asked.id,
          toolName: asked.permission,
          input: asked.metadata ?? {},
          requestKind: "tool",
          ...(asked.tool ? { toolUseId: asked.tool.callID } : {}),
        });
        break;
      }
      // opencode carries two generations of this event with byte-identical
      // payloads, and the server's own spec publishes both. Naming only the
      // older one is a silent failure waiting for the day it stops firing:
      // questions would simply stop appearing, with nothing raised anywhere.
      case "question.asked":
      case "question.v2.asked": {
        if (sid !== this.sessionId) {
          return;
        }
        const asked = event.properties as unknown as {
          id: string;
          sessionID: string;
          questions: {
            question: string;
            header: string;
            options: { label: string; description: string }[];
            multiple?: boolean;
          }[];
          tool?: { messageID: string; callID: string };
        };
        this.#questions.add(asked.id);
        const questions: UserQuestion[] = asked.questions.map((q) => ({
          question: q.question,
          header: q.header,
          options: q.options,
          multiSelect: q.multiple === true,
        }));
        this.#questionData.set(asked.id, questions);
        // Only the parked permission is raised here. The transcript row comes
        // from the `question` tool part this ask rides on, which opencode emits
        // and stores like any other tool — writing a second row from this event
        // would draw the same question twice, under two different ids.
        this.#ctx.permission({
          requestId: asked.id,
          toolName: ASK_USER_QUESTION,
          input: { questions },
          requestKind: "question",
          ...(asked.tool ? { toolUseId: asked.tool.callID } : {}),
        });
        break;
      }
      // A question can also be settled where cawco cannot see it — in
      // opencode's own TUI, or by any other client on the same server. Without
      // these the `tool_use` the ask emitted never closes, and the row sits on
      // "waiting for your answer" for the rest of the session while the model
      // has long since moved on.
      //
      // `#questionData` is the guard against answering twice: `resolvePermission`
      // clears the entry before it replies, so the echo of cawco's own reply
      // finds nothing here and falls through. Only a settlement cawco did not
      // make still has its questions on hand.
      // A settlement cawco did not make — opencode's own TUI, or any other
      // client on the server. The transcript needs nothing here, because the
      // `question` tool part completes on every route and carries the answers
      // with it; this only lets go of the parked request so a later
      // `resolvePermission` for the same id cannot reply to a closed question.
      case "question.replied":
      case "question.v2.replied":
      case "question.rejected":
      case "question.v2.rejected": {
        if (sid !== this.sessionId) {
          return;
        }
        const settled = event.properties as unknown as { requestID: string };
        this.#resolvedGates.add(settled.requestID);
        this.#ctx.permissionResolved?.(settled.requestID);
        this.#questions.delete(settled.requestID);
        this.#questionData.delete(settled.requestID);
        break;
      }
      case "session.status": {
        if (sid !== this.sessionId) {
          return;
        }
        this.#applyStatus(
          p.status as { type?: string; message?: string; next?: number }
        );
        break;
      }
      case "session.idle": {
        if (sid !== this.sessionId) {
          return;
        }
        this.#ctx.busy(false);
        this.#busy = false;
        this.#flushResult();
        // Anything the config gate held while this turn ran goes now.
        this.#drainQueue();
        break;
      }
      case "session.error": {
        if (sid !== undefined && sid !== this.sessionId) {
          return;
        }
        // One failure, one result. opencode reports a prompt that dies before
        // the model is reached (an unknown model) twice — its message, then the
        // same error again with a stack — and the first already closed the turn.
        if (!this.#turnOpen) {
          return;
        }
        const error = p.error as { name?: string; data?: { message?: string } };
        this.#ctx.busy(false);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: `as` is an unchecked cast; p.error can still be undefined at runtime even though the cast type says otherwise
        if (error?.name === "MessageAbortedError") {
          this.#flushResult({ subtype: "aborted", is_error: false });
        } else {
          this.#flushResult({
            subtype: "error_during_execution",
            is_error: true,
            errors: [errorText(error)],
          });
        }
        // The turn is over either way: whatever the config gate held runs
        // now, same as the idle path.
        this.#drainQueue();
        break;
      }
      default:
        break;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes every opencode part kind (text, tool, reasoning, …) into neutral frames; not refactored in this pass
  #part(part: Part): void {
    const role = this.#roles.get(part.messageID);
    switch (part.type) {
      case "text": {
        if (part.synthetic || part.ignored) {
          return;
        }
        // Captured even before the message's role is known — a part can arrive
        // ahead of its `message.updated`, and dropping it is what left a
        // delegate's report empty. `#flushResult` filters by role at flush time,
        // when the role is settled. `part.text` is capped at 4000 chars (and a
        // part longer than the transport's buffer never lands at all), so the
        // `message.part.delta` text already accumulated here is the truth.
        this.#closeThinking();
        const pending = this.#pendingOf(part.messageID);
        blockIndex(pending, part.id);
        const existing = pending.parts.get(part.id);
        const acc = existing?.kind === "text" ? existing.text : "";
        const text = acc.length >= part.text.length ? acc : part.text;
        pending.parts.set(part.id, { kind: "text", text });
        break;
      }
      case "reasoning": {
        // Its place is taken even before the role is known, as a stored
        // message lists it.
        const pending = this.#pendingOf(part.messageID);
        blockIndex(pending, part.id);
        if (role !== "assistant") {
          return;
        }
        const stored = pending.parts.get(part.id);
        // A reasoning update carries the whole text again, so what streams is
        // what grew past the last one. A rewrite that does not extend it says
        // nothing rather than replaying the block.
        const sent = stored?.kind === "thinking" ? stored.text : "";
        // `part.text` is capped at 4000 chars, so an update that arrives
        // shorter than what the deltas already accumulated is the capped view
        // of the same trace, not a rewrite: the longer one wins.
        const settled =
          stored?.kind === "thinking" && stored.text.length >= part.text.length
            ? stored.text
            : part.text;
        if (settled.length > sent.length && settled.startsWith(sent)) {
          if (this.#openThinking !== part.id) {
            this.#closeThinking();
            this.#openThinking = part.id;
            this.#thinkingFrame({
              type: "content_block_start",
              content_block: { type: "thinking", thinking: "" },
            });
          }
          this.#thinkingFrame({
            type: "content_block_delta",
            delta: {
              type: "thinking_delta",
              thinking: settled.slice(sent.length),
            },
          });
        }
        pending.parts.set(part.id, { kind: "thinking", text: settled });
        break;
      }
      case "tool": {
        this.#closeThinking();
        // A `task` tool spawns a child session; its metadata carries the child id
        // (verified: `state.metadata.sessionId`), so bind it to this callID.
        if (part.tool === "task") {
          const meta = part.state as {
            metadata?: { sessionId?: string };
            input?: { subagent_type?: string };
            title?: string;
          };
          if (typeof meta.metadata?.sessionId === "string") {
            this.#bindChild(
              part.callID,
              meta.metadata.sessionId,
              meta.input?.subagent_type,
              meta.title
            );
          }
        }
        const { status } = part.state;
        const emitted = this.#toolsEmitted.get(part.callID);
        // One tool_use per call, on the first part that carries usable input.
        if (
          !emitted &&
          (status === "running" || status === "completed" || status === "error")
        ) {
          this.#flushMessages(this.#pending, this.#roles);
          this.#ctx.frame({
            type: "assistant",
            uuid: part.messageID,
            ...this.#createdOf(part.messageID),
            contentOffset: blockIndex(this.#pendingOf(part.messageID), part.id),
            message: {
              content: [
                {
                  type: "tool_use",
                  id: part.callID,
                  name: toolNameOf(part.tool),
                  input: part.state.input,
                },
              ],
            },
          });
          this.#toolsEmitted.set(part.callID, "called");
        }
        // One tool_result per call, once it completes or errors.
        if (
          (status === "completed" || status === "error") &&
          emitted !== "resolved"
        ) {
          const output =
            status === "completed" ? part.state.output : part.state.error;
          const metadata =
            status === "completed"
              ? (part.state as { metadata?: Record<string, unknown> }).metadata
              : undefined;
          const structuredContent =
            metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
          const questionResult = questionResultOf(part);
          this.#ctx.frame({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: part.callID,
                  content:
                    part.state.status === "completed"
                      ? withImageAttachments(output, part.state.attachments)
                      : output,
                  is_error: status === "error",
                  ...(structuredContent ? { structuredContent } : {}),
                  ...(questionResult ? { questionResult } : {}),
                },
              ],
            },
          });
          this.#toolsEmitted.set(part.callID, "resolved");
        }
        break;
      }
      default:
        break;
    }
  }

  /** Keeps when opencode created a message, as {@link toTranscript} dates it. */
  #noteCreated(info: Message): void {
    this.#created.set(info.id, new Date(info.time.created).toISOString());
  }

  /** The stored time a frame of message `messageID` carries, once known. */
  #createdOf(messageID: string): { timestamp?: string } {
    const created = this.#created.get(messageID);
    return created ? { timestamp: created } : {};
  }

  #pendingOf(messageID: string): PendingMessage {
    let pending = this.#pending.get(messageID);
    if (!pending) {
      pending = pendingMessage();
      this.#pending.set(messageID, pending);
    }
    return pending;
  }

  /**
   * Ships one live thinking frame. The neutral stream union carries the
   * thinking events itself (harness.ts widened 2026-08-16), so this is a plain
   * frame — no widening, the literals stay checked end to end.
   */
  #thinkingFrame(event: ThinkingStreamFrame["event"]): void {
    const frame: ThinkingStreamFrame = {
      type: "stream_event",
      session_id: this.sessionId ?? undefined,
      event,
    };
    this.#ctx.frame(frame);
  }

  /** Closes the live thinking block, if one is open. */
  #closeThinking(): void {
    if (this.#openThinking === null) {
      return;
    }
    this.#openThinking = null;
    this.#thinkingFrame({ type: "content_block_stop" });
  }

  /** A `session.created` event named a child; remember its info for the bind. */
  handleChildCreated(
    childId: string,
    agent: string | undefined,
    title: string | undefined
  ): void {
    this.#childInfo.set(childId, { agent, title });
  }

  /** Links a task call to its child session; emits the branch-opening frame once. */
  #bindChild(
    callID: string,
    childId: string,
    fallbackAgent: string | undefined,
    fallbackTitle: string | undefined
  ): void {
    if (this.#boundCalls.has(callID)) {
      return;
    }
    this.#boundCalls.add(callID);
    const info = this.#childInfo.get(childId);
    this.#ctx.frame({
      type: "system",
      subtype: "task_started",
      session_id: this.sessionId ?? undefined,
      tool_use_id: callID,
      task_id: childId,
      subagent_type: info?.agent ?? fallbackAgent ?? "subagent",
      description: info?.title ?? fallbackTitle ?? "",
    });
    this.#registerChild(childId, callID);
  }

  /** Routes a child-session event through the parent's frame stream under `callID`. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the child event union's per-type routing switch; not refactored in this pass
  handleChild(event: Event, callID: string): void {
    const state = this.#childStateOf(callID);
    const type = event.type as string;
    const p = event.properties as Record<string, unknown>;
    switch (type) {
      case "message.updated": {
        const { info } = p as { info?: Message };
        if (!info) {
          return;
        }
        state.roles.set(info.id, info.role);
        this.#noteCreated(info);
        break;
      }
      case "message.part.updated": {
        const { part } = p as { part?: Part };
        if (!part) {
          return;
        }
        this.#partChild(state, part, undefined, callID);
        break;
      }
      case "message.part.delta": {
        const props = event.properties as unknown as {
          field?: string;
          messageID?: string;
          partID?: string;
          delta?: string;
        };
        if (props.field !== "text") {
          break;
        }
        if (state.roles.get(props.messageID ?? "") !== "assistant") {
          break;
        }
        if (!props.delta) {
          break;
        }
        // Same untyped delta event as the parent path: the kind is whatever the
        // part's `message.part.updated` established. A child's reasoning is
        // buffered and settled at flush — it has no live thinking block — so a
        // thinking part accumulates without streaming as prose.
        const pending = this.#pendingChild(state, props.messageID ?? "");
        const existing = props.partID
          ? pending.parts.get(props.partID)
          : undefined;
        const held = existing?.kind === "thinking" ? "thinking" : "text";
        if (props.partID) {
          blockIndex(pending, props.partID);
          pending.parts.set(props.partID, {
            kind: held,
            text: (existing?.text ?? "") + props.delta,
          });
        }
        if (held === "thinking") {
          break;
        }
        this.#ctx.frame({
          type: "stream_event",
          session_id: this.sessionId ?? undefined,
          parent_tool_use_id: callID,
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: props.delta },
          },
        });
        break;
      }
      case "session.idle":
      case "session.error":
        // The child's turn ended; replay its accumulated blocks as its branch's
        // final frames. No result frame — the parent's task tool_result closes it.
        this.#flushChild(state, callID);
        break;
      default:
        break;
    }
  }

  #childStateOf(callID: string): ChildState {
    let state = this.#childState.get(callID);
    if (!state) {
      state = { roles: new Map(), pending: new Map(), toolsEmitted: new Map() };
      this.#childState.set(callID, state);
    }
    return state;
  }

  #pendingChild(state: ChildState, messageID: string): PendingMessage {
    let pending = state.pending.get(messageID);
    if (!pending) {
      pending = pendingMessage();
      state.pending.set(messageID, pending);
    }
    return pending;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes a subagent's part kinds into the parent session's neutral frames; not refactored in this pass
  #partChild(
    state: ChildState,
    part: Part,
    delta: string | undefined,
    callID: string
  ): void {
    const role = state.roles.get(part.messageID);
    // Every block takes its place on first sight, whatever is shown of it.
    if (
      part.type === "reasoning" ||
      part.type === "tool" ||
      (part.type === "text" && !(part.synthetic || part.ignored))
    ) {
      blockIndex(this.#pendingChild(state, part.messageID), part.id);
    }
    switch (part.type) {
      case "text": {
        if (part.synthetic || part.ignored) {
          return;
        }
        if (role !== "assistant") {
          return;
        }
        if (delta) {
          this.#ctx.frame({
            type: "stream_event",
            session_id: this.sessionId ?? undefined,
            parent_tool_use_id: callID,
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: delta },
            },
          });
        }
        const pending = this.#pendingChild(state, part.messageID);
        const existing = pending.parts.get(part.id);
        const accumulated = existing?.kind === "text" ? existing.text : "";
        pending.parts.set(part.id, {
          kind: "text",
          text:
            accumulated.length >= part.text.length ? accumulated : part.text,
        });
        break;
      }
      case "reasoning":
        if (role !== "assistant") {
          return;
        }
        {
          const pending = this.#pendingChild(state, part.messageID);
          const stored = pending.parts.get(part.id);
          // `part.text` is capped at 4000 chars; the accumulated deltas win
          // when they are longer.
          const settled =
            stored?.kind === "thinking" &&
            stored.text.length >= part.text.length
              ? stored.text
              : part.text;
          pending.parts.set(part.id, { kind: "thinking", text: settled });
        }
        break;
      case "tool": {
        const { status } = part.state;
        const emitted = state.toolsEmitted.get(part.callID);
        if (
          !emitted &&
          (status === "running" || status === "completed" || status === "error")
        ) {
          this.#flushMessages(state.pending, state.roles, callID);
          this.#ctx.frame({
            type: "assistant",
            uuid: part.messageID,
            ...this.#createdOf(part.messageID),
            contentOffset: blockIndex(
              this.#pendingChild(state, part.messageID),
              part.id
            ),
            parent_tool_use_id: callID,
            message: {
              content: [
                {
                  type: "tool_use",
                  id: part.callID,
                  name: part.tool,
                  input: part.state.input,
                },
              ],
            },
          });
          state.toolsEmitted.set(part.callID, "called");
        }
        if (
          (status === "completed" || status === "error") &&
          emitted !== "resolved"
        ) {
          this.#ctx.frame({
            type: "user",
            parent_tool_use_id: callID,
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: part.callID,
                  content:
                    status === "completed"
                      ? part.state.output
                      : part.state.error,
                  is_error: status === "error",
                },
              ],
            },
          });
          state.toolsEmitted.set(part.callID, "resolved");
        }
        break;
      }
      default:
        break;
    }
  }

  #flushChild(state: ChildState, callID: string): void {
    this.#flushMessages(state.pending, state.roles, callID);
    state.pending.clear();
  }

  /**
   * Publish buffered prose before a tool frame clears the dashboard's live
   * text. Each part goes once, whole, keyed by its message and its place in it
   * — the key a history read gives the same block. opencode finishes a part
   * before it starts the next, so a part is done by the time a later one's
   * tool call or the turn's end flushes it.
   */
  #flushMessages(
    messages: Map<string, PendingMessage>,
    roles: Map<string, "user" | "assistant">,
    parentToolUseId?: string
  ): void {
    for (const [messageID, pending] of messages) {
      if (roles.get(messageID) !== "assistant") {
        continue;
      }
      for (const [partID, part] of pending.parts) {
        if (!part.text || pending.published.has(partID)) {
          continue;
        }
        pending.published.add(partID);
        this.#ctx.frame({
          type: "assistant",
          uuid: messageID,
          ...this.#createdOf(messageID),
          contentOffset: blockIndex(pending, partID),
          ...(parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {}),
          message: {
            content: [
              part.kind === "text"
                ? { type: "text", text: part.text }
                : { type: "thinking", thinking: part.text },
            ],
          },
        });
      }
    }
  }

  /**
   * Closes the turn: replays each assistant message's accumulated blocks as a
   * final frame, then a result. `result` overrides the default `success` result
   * for the abort/error paths, which also close a turn.
   */
  #flushResult(result?: {
    subtype: string;
    is_error: boolean;
    errors?: string[];
  }): void {
    // The live trace ends before the settled blocks replace it.
    this.#closeThinking();
    this.#flushMessages(this.#pending, this.#roles);
    // Whatever was written behind an answer that never completed is read now.
    this.#answering = undefined;
    this.#releaseReads();
    const flushed = [...this.#pending.keys()];
    this.#pending.clear();
    // A ghost idle (e.g. the idle that trails an abort) has no open turn and must
    // not emit a result frame; only a real turn close or an explicit abort/error
    // does. Assistant-block replay above is unaffected.
    if (!(this.#turnOpen || result)) {
      return;
    }
    const turnCost = [...this.#costs.values()].reduce((a, b) => a + b, 0);
    this.#ctx.frame({
      type: "result",
      subtype: result?.subtype ?? "success",
      is_error: result?.is_error ?? false,
      ...(result?.errors ? { errors: result.errors } : {}),
      total_cost_usd: this.#costBase + turnCost,
      cache: {
        read: this.#lastTokens.cache.read,
        write: this.#lastTokens.cache.write,
      },
    });
    this.#costBase += turnCost;
    this.#costs.clear();
    for (const messageID of flushed) {
      this.#roles.delete(messageID);
    }
    for (const [callID, state] of this.#toolsEmitted) {
      if (state === "resolved") {
        this.#toolsEmitted.delete(callID);
      }
    }
    this.#turnOpen = false;
    this.#clearStallTimer();
  }

  /**
   * The server's word on whether this session is mid-turn, whether it arrived
   * as a `session.status` event or was read back on a resume.
   */
  #applyStatus(status: {
    type?: string;
    message?: string;
    next?: number;
  }): void {
    // A retrying turn is still a turn in flight — and the provider's own
    // words go straight to the transcript. A quota notice that only ever
    // lived in this event once hid as a silent hang for an hour.
    this.#busy = status.type === "busy" || status.type === "retry";
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #busy was just assigned a live boolean; biome's field-declaration inference doesn't see it
    if (this.#busy) {
      this.#turnOpen = true;
    }
    if (status.type === "retry" && status.message) {
      const wait = status.next
        ? ` — next attempt in ${Math.max(0, Math.round((status.next - Date.now()) / 1000))}s`
        : "";
      const note = `${status.message}${wait}`;
      if (note !== this.#lastRetryNote) {
        this.#lastRetryNote = note;
        this.#ctx.frame({
          type: "system",
          subtype: PROVIDER_RETRY,
          session_id: this.sessionId ?? undefined,
          content: note,
          retry: {
            message: status.message,
            ...(status.next ? { nextAttemptAt: status.next } : {}),
          },
        });
      }
    }
    this.#ctx.busy(this.#busy);
  }

  /**
   * A session reattached while its turn was already open on the server. That
   * turn was started by a process that no longer exists, so no `session.status`
   * event will ever open it here, nothing arms the stall notice, and the
   * operator's sends queue silently behind it — for hours, once. Ask the server
   * once: a busy or retrying answer opens the turn exactly as the event would,
   * arms the stall notice, and says so in the transcript. Fails soft: a status
   * read that errors leaves the session as it is; the spawn already succeeded.
   */
  async watchResumedTurn(): Promise<void> {
    if (this.sessionId === null) {
      return;
    }
    try {
      const result = await reached(
        this.#client.session.status(
          { directory: this.#directory },
          {
            signal: AbortSignal.any([
              this.#lifetime.signal,
              AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
            ]),
          }
        )
      );
      if (this.#lifetime.signal.aborted) {
        return;
      }
      const status = result.data?.[this.sessionId];
      const reattachedBusy = this.#reattachedBusy;
      this.#reattachedBusy = false;
      if (!status || (status.type !== "busy" && status.type !== "retry")) {
        // Idle on the server, yet the hub is still owed this turn's end: it
        // ended while nothing here was subscribed.
        if (this.#turnOpen) {
          await this.#endMissedTurn();
        }
        // The turn the reattach found running ended before this session was
        // subscribed: no idle event is coming for it. A prompt this process
        // has sent since is a turn of its own, and keeps the session busy.
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #reattachedBusy is set true by reattachedMidTurn() elsewhere in the class; the checker sees only its initializer
        if (reattachedBusy && this.#busy && this.#turnPrompt === undefined) {
          this.#busy = false;
          this.#ctx.busy(false);
        }
        return;
      }
      await this.#resumeReads();
      this.#applyStatus(status);
      this.#noteServerActivity();
      this.#ctx.frame({
        type: "system",
        subtype: "resumed_mid_turn",
        session_id: this.sessionId,
        content:
          "Resumed mid-turn: the provider was still working when this session was reattached. If nothing arrives, interrupt and retry.",
      });
    } catch (error) {
      if (this.#lifetime.signal.aborted) {
        return;
      }
      console.warn(
        `[opencode] could not read the status of resumed session ${this.sessionId}: ${errorText(error)}`
      );
    }
  }

  /**
   * A turn the hub is owed ended on the server while nothing was subscribed —
   * the agent restarted, the server was respawned, or the subscription was
   * down. Its replies are replayed from the server's history through the path
   * live events take, and the turn ends as it ended there: done, failed, or —
   * a reply the idle server never finished — cut off with its server.
   *
   * Only the replies to the prompt this turn is for: a prompt this process
   * has just sent and the server has not stored yet is not answered by the
   * replies to the one before it, and is left to its own events.
   */
  async #endMissedTurn(): Promise<void> {
    const listed = await reached(
      this.#client.session.messages(
        // biome-ignore lint/style/noNonNullAssertion: invariant: watchResumedTurn returns before this when sessionId is null
        { sessionID: this.sessionId!, directory: this.#directory },
        {
          signal: AbortSignal.any([
            this.#lifetime.signal,
            AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
          ]),
        }
      )
    );
    if (listed.error || !listed.data) {
      throw new Error(
        `could not list the messages of session ${this.sessionId}: ${errorText(listed.error)}`
      );
    }
    const rows = listed.data as { info: Message; parts: Part[] }[];
    const prompt = rows.findLast((row) => row.info.role === "user")?.info;
    if (!prompt || (this.#turnPrompt && prompt.id !== this.#turnPrompt)) {
      return;
    }
    const replies = rows.filter(
      (row) => row.info.role === "assistant" && row.info.parentID === prompt.id
    );
    const last = replies.at(-1)?.info as AssistantMessage | undefined;
    if (!last) {
      return;
    }
    const replay = (type: string, properties: object) =>
      this.handle({ type, properties } as unknown as Event);
    for (const { info, parts } of replies) {
      replay("message.updated", {
        info: { ...info, time: { ...info.time, completed: undefined } },
      });
      for (const part of parts) {
        replay("message.part.updated", { part });
      }
      replay("message.updated", { info });
    }
    if (last.error) {
      replay("session.error", { sessionID: this.sessionId, error: last.error });
    } else if (last.time.completed) {
      replay("session.idle", { sessionID: this.sessionId });
    } else {
      this.#ctx.busy(false);
      this.#busy = false;
      this.#flushResult({
        subtype: "error_during_execution",
        is_error: true,
        errors: [
          "The opencode server stopped before this turn finished; its reply is incomplete.",
        ],
      });
      this.#drainQueue();
    }
  }

  /**
   * Reattached while the server still runs this session's turn: busy from
   * the moment it is handed back, as a turn started here would be. The
   * reconcile after its subscription comes up ({@link watchResumedTurn})
   * reads the turn again and takes it from there — on to its end, or to the
   * end it reached before anything here was subscribed.
   */
  reattachedMidTurn(): void {
    this.#reattachedBusy = true;
    this.#busy = true;
    this.#ctx.busy(true);
  }

  /**
   * A turn an earlier agent process opened on this session and never ended:
   * the hub is still owed its end, and the reconcile after this session's
   * subscription comes up pays it (see {@link watchResumedTurn}).
   */
  inheritOpenTurn(): void {
    this.#open = true;
  }

  /**
   * A turn this process did not start: which of its messages are sends still
   * waiting behind the answer being written, as the stored session says
   * ({@link queuedMessages}). They are read when that answer completes — the
   * word this process would have given had it written them itself — and every
   * message already there is one it will not count as new.
   */
  async #resumeReads(): Promise<void> {
    const listed = await this.#client.session.messages(
      // biome-ignore lint/style/noNonNullAssertion: invariant: watchResumedTurn returns before this when sessionId is null
      { sessionID: this.sessionId!, directory: this.#directory },
      {
        signal: AbortSignal.any([
          this.#lifetime.signal,
          AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
        ]),
      }
    );
    if (listed.error || !listed.data) {
      throw new Error(
        `could not list the messages of resumed session ${this.sessionId}: ${errorText(listed.error)}`
      );
    }
    const rows = listed.data as { info: Message; parts: Part[] }[];
    for (const { info } of rows) {
      this.#noteCreated(info);
      if (info.role === "user") {
        this.#written.add(info.id);
      }
    }
    const { ids, answering } = queuedMessages(rows);
    this.#readAfter.push(...ids);
    this.#answering = answering;
  }

  get directory(): string {
    return this.#directory;
  }

  /** Called only after SSE readiness, including every reconnect. */
  reconcileGates(): Promise<void> {
    if (this.#reconciling) {
      return this.#reconciling;
    }
    this.#reconciling = Promise.all(
      (
        [
          ["permission", "permission.asked"],
          ["question", "question.asked"],
        ] as const
      )
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: independent bounded retry with cancellation and one warning per endpoint failure
        .map(async ([path, type]) => {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              console.info(`[opencode] ${this.instanceId}: ${path} snapshot`);
              const options = {
                signal: AbortSignal.any([
                  this.#lifetime.signal,
                  AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
                ]),
              };
              const query = { directory: this.#directory };
              const listed =
                path === "permission"
                  ? // biome-ignore lint/performance/noAwaitInLoops: bounded retry of this endpoint, independently of the other gate endpoint
                    await this.#client.permission.list(query, options)
                  : await this.#client.question.list(query, options);
              if (listed.error || !listed.data) {
                throw new Error(errorText(listed.error));
              }
              const pending: { sessionID: string }[] = listed.data;
              if (this.#lifetime.signal.aborted) {
                return;
              }
              for (const ask of pending) {
                if (ask.sessionID === this.sessionId) {
                  this.handle({ type, properties: ask } as unknown as Event);
                }
              }
              this.#gateFailures.delete(path);
              return;
            } catch (error) {
              if (this.#lifetime.signal.aborted) {
                return;
              }
              if (!this.#gateFailures.has(path)) {
                this.#gateFailures.add(path);
                console.warn(
                  `[opencode] ${this.instanceId}: ${path} snapshot failed: ${String(error)}`
                );
              }
              if (attempt < 2) {
                await Bun.sleep(250 * 2 ** attempt);
              }
            }
          }
        })
    )
      .then(() => undefined)
      .finally(() => {
        this.#reconciling = undefined;
      });
    return this.#reconciling;
  }

  /** Any server event is progress: re-arm the stall notice while a turn is open. */
  #noteServerActivity(): void {
    if (!this.#turnOpen) {
      return;
    }
    this.#clearStallTimer();
    this.#stallTimer = setTimeout(() => {
      this.#stallTimer = undefined;
      if (!this.#turnOpen) {
        return;
      }
      this.#ctx.frame({
        type: "system",
        subtype: "provider_stalled",
        session_id: this.sessionId ?? undefined,
        content:
          "Still waiting on the provider with no output — the turn is open and may yet complete. If this persists, interrupt and retry.",
      });
    }, STALLED_TURN_MS);
  }

  #clearStallTimer(): void {
    if (this.#stallTimer !== undefined) {
      clearTimeout(this.#stallTimer);
      this.#stallTimer = undefined;
    }
  }

  send(
    message: SentMessage,
    extras: {
      attachments?: { name: string; content: string }[];
      images?: { mediaType: string; data: string }[];
      urgent?: boolean;
    }
  ): void {
    const { content } = message.message;
    let text =
      typeof content === "string"
        ? content
        : content
            .filter(
              (block): block is { type: "text"; text: string } =>
                block.type === "text"
            )
            .map((block) => block.text)
            .join("\n");

    // Urgent delivery: start a turn NOW, busy or not. Busy: interrupt the
    // running turn first, with a factual note. Idle: prompt directly — urgent
    // to an idle session degrading to a silent append left delegates holding
    // unread briefs forever, since drained appends never wake a session.
    const urgent = Boolean(extras.urgent);
    if (urgent && this.#busy) {
      text = `[Urgent — your previous turn was interrupted to deliver this]\n\n${text}`;
    }

    const parts: (
      | { type: "text"; text: string }
      | { type: "file"; mime: string; filename: string; url: string }
    )[] = [];
    if (text) {
      parts.push({ type: "text", text });
    }
    for (const image of extras.images ?? []) {
      parts.push({
        type: "file",
        mime: image.mediaType,
        filename: "image",
        url: `data:${image.mediaType};base64,${image.data}`,
      });
    }
    for (const attachment of extras.attachments ?? []) {
      parts.push({
        type: "text",
        text: `\n\n<pasted-text name="${attachment.name}">\n${attachment.content}\n</pasted-text>`,
      });
    }

    const model = this.#model ? splitModel(this.#model) : undefined;
    // The message it becomes is named up front, and the hub told at once, so
    // opencode's word that the message exists says which send it was — even
    // to a hub hearing it from an agent that has since restarted.
    const messageID = messageId();
    const { uuid } = message;
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_STORED,
      storedAs: { [uuid]: messageID },
      session_id: this.sessionId ?? undefined,
    });

    // Config convergence gate: queue everything while a reload is in progress.
    // Active turns are allowed to finish (events still route), but no NEW work
    // may start — the server is being stopped and restarted. A send that
    // arrives while the held ones are still going in waits behind them.
    if (this.#isConfigGateHeld() || this.#draining || this.#queue.length > 0) {
      this.#queue.push({ parts, ...(model ? { model } : {}), messageID, uuid });
      this.#drainQueue();
      return;
    }

    if (urgent) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget: send() itself is not awaited by its callers
      void this.#client.session
        .abort({
          // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
          sessionID: this.sessionId!,
          directory: this.#directory,
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: the abort's own failure is not actionable; the prompt below runs regardless
        .catch(() => {})
        .then(() => this.#prompt(parts, messageID, uuid, model));
      return;
    }
    // Idle or busy, every send is prompted at once: opencode writes it into
    // the session as a message straight away and the running loop takes it
    // up, which is the moment it is read.
    this.#ctx.busy(true);
    const command = parseCommand(text);
    if (command) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget: send() itself is not awaited by its callers
      void this.#commandOrPrompt(
        command.name,
        command.args,
        parts,
        messageID,
        uuid,
        model
      );
    } else {
      this.#prompt(parts, messageID, uuid, model);
    }
  }

  /**
   * Starts one prompt turn with the given parts, as message `messageID`, for
   * the send `uuid`. A prompt opencode refuses is that send's failure; the
   * session goes on.
   */
  #prompt(
    parts: unknown[],
    messageID: string,
    uuid: string,
    model?: { providerID?: string; modelID?: string }
  ): void {
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    this.#noteServerActivity();
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #prompt itself is not awaited by its callers
    void reached(
      this.#client.session.promptAsync({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
        messageID,
        parts: parts as never,
        tools: {
          cawco_submit_result: !!this.#workflowStepId,
          cawco_workflow_state_read: !!this.#workflowStepId,
          cawco_workflow_state_write: !!this.#workflowStepId,
          ...Object.fromEntries(
            [
              "start_session",
              "continue_session",
              "delegate",
              "stop_delegate",
              "interrupt_delegate",
              "answer_delegate",
              "set_item_checks",
              "run_workflow",
              "steer_workflow",
              "workflow_read",
              "list_workflows",
            ].map((name) => [`cawco_${name}`, this.#canDelegate !== false])
          ),
        },
        ...(this.#effort ? { variant: this.#effort } : {}),
        // A bare model id (no provider) is left to opencode's default; never send `providerID: ''`.
        ...(model?.providerID && model.modelID
          ? {
              model: { providerID: model.providerID, modelID: model.modelID },
            }
          : {}),
        ...(this.#permissionMode === "plan" ? { agent: "plan" } : {}),
      })
    )
      .then((res) => {
        if (res.error) {
          this.#ctx.rejected(uuid, new Error(errorText(res.error)));
          this.#drained(messageID);
        }
      })
      .catch((error: unknown) => {
        // A prompt that never reached the server never opens a turn there, so
        // no pump event will ever settle it: say so and leave busy clear here,
        // or the session strands busy with every later message queuing behind
        // nothing.
        this.#turnOpen = false;
        this.#clearStallTimer();
        this.#busy = false;
        this.#ctx.busy(false);
        this.#ctx.rejected(uuid, error);
        this.#drained(messageID);
      });
  }

  /**
   * Delivers what the config gate held, in arrival order, each as the message
   * it was named — so each is read as itself.
   */
  #drainQueue(): void {
    // Do not start new work while the config gate is held — the server is
    // mid-dispose. The queue stays intact; configGateLifted() will call us
    // again once the gate drops.
    //
    // One at a time: opencode lists a session's messages in the order it
    // writes them, and `promptAsync` answers before the message is written
    // (it forks the prompt and returns), so two held sends asked for at once
    // were stored the wrong way round. The next goes when opencode says the
    // last one is a message (`message.updated`), or that it failed.
    if (this.#draining || this.#isConfigGateHeld()) {
      return;
    }
    const next = this.#queue.shift();
    if (!next) {
      return;
    }
    this.#ctx.busy(true);
    this.#draining = next.messageID;
    this.#prompt(next.parts, next.messageID, next.uuid, next.model);
  }

  /** The sends waiting on an answer, read. */
  #releaseReads(): void {
    if (this.#readAfter.length === 0) {
      return;
    }
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: this.#readAfter.splice(0),
      session_id: this.sessionId ?? undefined,
    });
  }

  /** A held send is in, one way or the other: the next may go. */
  #drained(messageID: string): void {
    if (messageID === this.#draining) {
      this.#draining = undefined;
      this.#drainQueue();
    }
  }

  /** The command names this session can answer, fetched once and cached. */
  #commandNamesOf(): Promise<Set<string>> {
    if (!this.#commandNames) {
      this.#commandNames = reached(
        this.#client.command.list({ directory: this.#directory })
      ).then(
        (res) =>
          new Set(
            (res.error ? [] : (res.data as Command[])).map(
              (command) => command.name
            )
          )
      );
    }
    return this.#commandNames;
  }

  /** A `/name` turned: run it as a command, or send it as a plain prompt. */
  async #commandOrPrompt(
    name: string,
    args: string,
    parts: unknown[],
    messageID: string,
    uuid: string,
    model?: { providerID?: string; modelID?: string }
  ): Promise<void> {
    const names = await this.#commandNamesOf();
    if (!names.has(name)) {
      this.#prompt(parts, messageID, uuid, model);
      return;
    }
    this.#turnOpen = true;
    this.#turnPrompt = messageID;
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #commandOrPrompt itself is not awaited by its callers
    void this.#client.session
      .command({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
        messageID,
        command: name,
        arguments: args,
        ...(this.#effort ? { variant: this.#effort } : {}),
        ...(this.#model ? { model: this.#model } : {}),
        ...(this.#permissionMode === "plan" ? { agent: "plan" } : {}),
      })
      .then((res) => {
        if (res.error) {
          this.#ctx.rejected(uuid, new Error(errorText(res.error)));
        }
      });
  }

  /** Providers the current OpenCode account can actually use, including OAuth. */
  #connectedProviders(): Promise<Pick<Provider, "id" | "models">[]> {
    return connectedProviders(this.#client, this.#directory);
  }

  /** The current model's context window, from a lazily-cached provider list. */
  async #contextLimit(): Promise<number> {
    if (!this.#model) {
      return 200_000;
    }
    this.#providersCache ??= this.#connectedProviders();
    const providers = await this.#providersCache;
    const ref = splitModel(this.#model);
    for (const provider of providers) {
      if (ref.providerID && provider.id !== ref.providerID) {
        continue;
      }
      const model = ref.modelID ? provider.models?.[ref.modelID] : undefined;
      if (model) {
        return model.limit.context;
      }
    }
    return 200_000;
  }

  /** The server's command list as neutral commands, tagged with what opencode says each one is. */
  async #commands(): Promise<SlashCommand[]> {
    const result = await reached(
      this.#client.command.list({ directory: this.#directory })
    );
    if (result.error) {
      return [];
    }
    // The server supplies source; the installed SDK's Command type omits it.
    return (result.data as (Command & { source?: string })[]).map(
      (command): SlashCommand => ({
        name: command.name,
        description: command.description ?? "",
        argumentHint: "",
        kind: COMMAND_KINDS[command.source ?? ""] ?? "custom",
      })
    );
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    // Config convergence gate: MCP mutations must not race with a dispose
    // cycle. Reads, interrupt, and local-only setters are always allowed.
    if (
      this.#isConfigGateHeld() &&
      (method === CONTROL_MCP_RECONNECT || method === CONTROL_MCP_TOGGLE)
    ) {
      throw new Error(`${method} blocked: config reload in progress`);
    }
    switch (method) {
      case CONTROL_INTERRUPT:
        await this.interrupt();
        return undefined;
      case CONTROL_SET_MODEL:
        this.#model = args[0] as string;
        return undefined;
      case CONTROL_SET_EFFORT:
        if (!EFFORT_LEVELS.includes(args[0] as EffortLevel)) {
          throw new Error(`Unsupported OpenCode effort: ${String(args[0])}`);
        }
        this.#effort = args[0] as EffortLevel;
        this.sayEffort();
        return undefined;
      case CONTROL_SET_PERMISSION_MODE:
        this.#permissionMode = args[0] as string;
        return undefined;
      case CONTROL_CONTEXT_USAGE: {
        const tokens = this.#lastTokens;
        const total =
          tokens.input +
          tokens.output +
          tokens.reasoning +
          tokens.cache.read +
          tokens.cache.write;
        const maxTokens = await this.#contextLimit();
        return {
          totalTokens: total,
          maxTokens,
          percentage: Math.min(100, Math.round((total / maxTokens) * 100)),
          categories: [
            {
              name: "Input",
              tokens: tokens.input,
              color: "var(--flexoki-blue)",
            },
            {
              name: "Output",
              tokens: tokens.output,
              color: "var(--flexoki-green)",
            },
            {
              name: "Reasoning",
              tokens: tokens.reasoning,
              color: "var(--flexoki-orange)",
            },
          ],
        };
      }
      case CONTROL_SUPPORTED_MODELS:
        return await opencodeCatalog(this.#client, this.#directory);
      case CONTROL_SUPPORTED_COMMANDS:
        return await this.#commands();
      case CONTROL_RELOAD_SKILLS:
        // The server caches commands and skills at startup: this answers what
        // the server knows. Disk additions appear only after a server restart.
        return {
          skills: (await this.#commands()).filter(
            (command) => command.kind === "skill"
          ),
        };
      case CONTROL_MCP_STATUS: {
        const result = await reached(
          this.#client.mcp.status({ directory: this.#directory })
        );
        if (result.error) {
          return [];
        }
        const statuses = (result.data ?? {}) as Record<string, McpStatus>;
        return Object.entries(statuses).map(
          ([name, status]): McpServerStatus => ({
            name,
            status:
              status.status === "needs_auth" ||
              status.status === "needs_client_registration"
                ? "needs-auth"
                : status.status,
            ...("error" in status ? { error: status.error } : {}),
          })
        );
      }
      case CONTROL_MCP_RECONNECT:
        await reached(
          this.#client.mcp.connect({
            name: args[0] as string,
            directory: this.#directory,
          })
        );
        return undefined;
      case CONTROL_MCP_TOGGLE: {
        const name = args[0] as string;
        const enabled = args[1] as boolean;
        const target = { name, directory: this.#directory };
        await reached(
          enabled
            ? this.#client.mcp.connect(target)
            : this.#client.mcp.disconnect(target)
        );
        return undefined;
      }
      default:
        // An unsupported control verb is a silent no-op, never a user-facing
        // failure: the hub may send a reload this harness has no verb for, and a
        // session must not answer that with an error the reader sees.
        console.warn(`[opencode] no control verb ${method} — ignored`);
        return undefined;
    }
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    if (this.#questions.has(requestId)) {
      this.#resolvedGates.add(requestId);
      this.#ctx.permissionResolved?.(requestId);
      this.#questions.delete(requestId);
      const questions = this.#questionData.get(requestId) ?? [];
      this.#questionData.delete(requestId);
      // Nothing is framed on either branch: replying settles the `question`
      // tool part, and that part is what writes the row. Framing here as well
      // drew the answer twice, once under the request id and once under the
      // tool's own call id.
      if (result.behavior === "deny") {
        // biome-ignore lint/complexity/noVoid: fire-and-forget: resolvePermission itself is not awaited by its callers
        void this.#rejectQuestion(requestId);
        return;
      }
      // The reader's choices arrive keyed by question text (QuestionCard builds
      // `UserAnswers` that way); opencode's reply API wants one label array per
      // question, in the order `question.asked` published them — so the join is
      // the question text on both sides.
      const answersByQuestion =
        (result as { updatedInput?: { answers?: UserAnswers } }).updatedInput
          ?.answers ?? {};
      const answers = questions.map((q) => {
        const raw = answersByQuestion[q.question];
        if (Array.isArray(raw)) {
          return raw;
        }
        if (typeof raw === "string") {
          return [raw];
        }
        return [] as string[];
      });
      // biome-ignore lint/complexity/noVoid: fire-and-forget: resolvePermission itself is not awaited by its callers
      void this.#replyQuestion(requestId, answers);
      return;
    }
    let response: "once" | "always" | "reject";
    if (result.behavior === "deny") {
      response = "reject";
    } else if (result.remember) {
      response = "always";
    } else {
      response = "once";
    }
    this.#replyPermission(requestId, response);
  }

  /** The one answer path for a tool permission — the auto-allow shares it. */
  #replyPermission(
    requestId: string,
    response: "once" | "always" | "reject"
  ): void {
    if (this.#resolvedGates.has(requestId)) {
      return;
    }
    this.#resolvedGates.add(requestId);
    this.#ctx.permissionResolved?.(requestId);
    // biome-ignore lint/complexity/noVoid: fire-and-forget: #replyPermission itself is not awaited by its callers
    void reached(
      this.#client.permission.reply(
        { requestID: requestId, directory: this.#directory, reply: response },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      )
    ).catch((error: unknown) =>
      console.warn(`[opencode] permission reply failed: ${String(error)}`)
    );
  }

  #replyQuestion(id: string, answers: string[][]): Promise<void> {
    return (
      reached(
        this.#client.question.reply(
          { requestID: id, directory: this.#directory, answers },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      )
        .then((res) => {
          if (res.error) {
            this.#ctx.failed(
              new Error(
                `opencode question reply failed: ${errorText(res.error)}`
              )
            );
          }
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: a request that never reached the server is not the session's failure; nothing further to report here
        .catch(() => {})
    );
  }

  #rejectQuestion(id: string): Promise<void> {
    return (
      reached(
        this.#client.question.reject(
          { requestID: id, directory: this.#directory },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      )
        .then((res) => {
          if (res.error) {
            this.#ctx.failed(
              new Error(
                `opencode question reject failed: ${errorText(res.error)}`
              )
            );
          }
        })
        // biome-ignore lint/suspicious/noEmptyBlockStatements: a request that never reached the server is not the session's failure; nothing further to report here
        .catch(() => {})
    );
  }

  async interrupt(): Promise<void> {
    await reached(
      this.#client.session.abort({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
      })
    );
  }

  async stop(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
    this.#turnOpen = false;
    this.#clearStallTimer();
    await this.#client.session
      .abort({
        // biome-ignore lint/style/noNonNullAssertion: invariant: sessionId is set once in the constructor and never nulled; the interface types it nullable for other harnesses
        sessionID: this.sessionId!,
        directory: this.#directory,
      })
      // biome-ignore lint/suspicious/noEmptyBlockStatements: stop() is tearing down regardless; the abort's own failure is not actionable
      .catch(() => {});
  }

  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this session's teardown is synchronous
  async dispose(): Promise<void> {
    this.#lifetime.abort();
    this.#onRelease();
  }
}

export class OpencodeHarness implements Harness {
  readonly kind = "opencode" as const;
  readonly capabilities = OPENCODE_CAPABILITIES;
  auth: import("@cawco/core").AuthState = "authenticated";

  #client: OpencodeClient | null = null;
  #sessiond: Promise<SessiondClient> | undefined;
  #ready: Promise<OpencodeClient> | null = null;
  // Keyed by instanceId, not opencode's own session id: a resume reuses the
  // same sessionKey (opencode.ts:spawn), so multiple live instances can share
  // one opencode session id, and a map keyed by THAT would silently overwrite
  // an earlier instance's entry with a later one's on every such resume.
  // Event routing, which only has opencode's own id off the wire, falls back
  // to {@link OpencodeHarness.#sessionForSid}.
  readonly #sessions = new Map<string, OpencodeSession>();
  readonly #children = new Map<
    string,
    { parent: OpencodeSession; callID: string }
  >();
  #disposed = false;
  /**
   * The one subscription loop each directory has, by the controller that ends
   * it. A loop runs only while it is the one on record here: stopping it
   * (a config restart, dispose) aborts that controller, and the loop ends
   * rather than reconnecting beside its replacement. opencode binds 4096
   * again after a restart, so an old loop's client reaches the new server,
   * and every event of that directory arrived twice — a turn's second
   * `session.idle` then closed the turn the next prompt had just opened.
   */
  readonly #pumps = new Map<string, AbortController>();
  readonly #pumpReady = new Map<string, Promise<void>>();
  /** Directories whose subscription is up right now. */
  readonly #pumpConnected = new Set<string>();
  #recovering = 0;
  #recoveryHighWater = 0;
  readonly #recoveryWaiters: (() => void)[] = [];
  readonly #reconcileJobs = new Map<OpencodeSession, Promise<void>>();
  readonly #reconcileAgain = new Set<OpencodeSession>();

  // ---------------------------------------------------- config convergence

  /**
   * State of the config convergence subsystem:
   *
   * - `desiredHash`: hash of the relevant opencode.json on disk, last read.
   * - `appliedHash`: hash that the running server was last started with. `null`
   *   when the server was adopted (not started by us) and the baseline is unknown.
   * - `configState`: observable via fleetStatus / logs.
   * - `configError`: what went wrong, when state is "error".
   *
   * Only the LATEST desired revision matters — earlier ones are coalesced away.
   */
  #desiredHash: string | null = null;
  #appliedHash: string | null = null;
  #desiredVersion: string | null = null;
  #appliedVersion: string | null = null;
  #versionProbe: Promise<string> | null = null;
  #versionProbedAt = 0;
  #configState: "idle" | "pending" | "applying" | "applied" | "error" = "idle";
  #configError: string | null = null;
  #configWatchTimer: ReturnType<typeof setInterval> | null = null;
  /** Whether this agent keeps the server converged; see {@link #readsThisConfig}. */
  #converging = false;

  /**
   * Whether the server reads the opencode config this agent writes, in the
   * server's own words: `/path` reports the global config directory it loaded.
   */
  async #readsThisConfig(client: OpencodeClient): Promise<boolean> {
    const paths = await reached(
      client.path.get({}, { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) })
    );
    const reads = (paths.data as { config?: string } | undefined)?.config;
    if (reads === OPENCODE_DIR) {
      return true;
    }
    console.log(
      JSON.stringify({
        type: "config-convergence",
        state: "idle",
        detail: `server reads ${reads ?? "an unreported config"}, this agent writes ${OPENCODE_DIR}; not converging it`,
        at: Date.now(),
      })
    );
    return false;
  }

  /**
   * Lock held while a config change is being applied. When non-null, spawn and
   * send must queue their work until the lock resolves.
   */
  #applyGate: { promise: Promise<void>; resolve: () => void } | null = null;
  readonly #pendingSpawns: {
    resolve: (session: HarnessSession) => void;
    reject: (error: Error) => void;
    spec: SpawnPayload;
    ctx: HarnessContext;
  }[] = [];

  // ---------------------------------------------- config convergence methods

  /**
   * {@link configHash} of opencode.json as it is on disk now.
   * Returns null if the file is missing or malformed.
   */
  async #hashConfig(): Promise<string | null> {
    const config = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    return config ? configHash(config) : null;
  }

  /** Poll the installed CLI every 30s; upgrading it does not replace sessiond's server. */
  #installedVersion(): Promise<string> {
    if (!this.#versionProbe || Date.now() - this.#versionProbedAt >= 30_000) {
      this.#versionProbedAt = Date.now();
      this.#versionProbe = (async () => {
        const binary = resolveBin("opencode");
        if (!binary) {
          throw new Error("opencode binary not found");
        }
        const ran = await Bun.$`${binary} --version`.quiet().nothrow();
        const version = ran.stdout.toString().trim();
        if (ran.exitCode !== 0 || !version) {
          throw new Error(
            `opencode version probe failed: ${ran.stderr.toString()}`
          );
        }
        return version;
      })();
    }
    return this.#versionProbe;
  }

  /**
   * Watch config every 2s and the installed binary every 30s. An adopted server
   * must match both before convergence considers it current.
   */
  #startConfigWatcher(): void {
    if (this.#configWatchTimer) {
      return;
    }
    this.#configWatchTimer = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget tick; errors logged, not thrown
      void this.#configTick().catch((error: unknown) =>
        console.warn(`[opencode] convergence probe failed: ${error}`)
      );
    }, 2000);
  }

  #stopConfigWatcher(): void {
    if (this.#configWatchTimer) {
      clearInterval(this.#configWatchTimer);
      this.#configWatchTimer = null;
    }
  }

  /**
   * One tick of the config watcher. Reads the hash, compares to applied,
   * and if different, records the desired revision and attempts to apply.
   */
  async #configTick(): Promise<void> {
    // A fleet sync pokes this directly; only a converging agent acts on it.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #converging is set in #ensure, a different method biome's per-method inference doesn't see
    if (!this.#converging) {
      return;
    }
    const hash = await this.#hashConfig();
    const version = await this.#installedVersion();
    const versionChanged = version !== this.#desiredVersion;
    this.#desiredVersion = version;
    if (hash === null) {
      // Malformed or missing config — surface the error but don't stop the
      // healthy backend.
      if (
        this.#configState !== "error" ||
        this.#configError !== "malformed config"
      ) {
        this.#configState = "error";
        this.#configError = "malformed config";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "error",
            detail: "malformed or missing opencode.json",
            at: Date.now(),
          })
        );
      }
      return;
    }
    if (hash === this.#desiredHash && !versionChanged) {
      // No change since last read. But if we're pending (a prior attempt was
      // blocked by busy sessions), retry the apply — the sessions may be idle now.
      if (this.#configState === "pending") {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
        void this.#attemptConfigApply();
      }
      return;
    }
    this.#desiredHash = hash;
    if (hash === this.#appliedHash && version === this.#appliedVersion) {
      // Desired matches what's running; clear any pending state.
      if (this.#configState === "pending") {
        this.#configState = "applied";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "applied",
            detail: "desired matches running revision",
            at: Date.now(),
          })
        );
      }
      return;
    }
    // New desired revision differs from applied: coalesce and attempt.
    this.#configState = "pending";
    this.#configError = null;
    console.log(
      JSON.stringify({
        type: "config-convergence",
        state: "pending",
        detail: `new revision ${hash.slice(0, 8)}… vs applied ${this.#appliedHash?.slice(0, 8) ?? "unknown"}; binary ${version} vs running ${this.#appliedVersion ?? "unknown"}`,
        at: Date.now(),
      })
    );
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the attempt manages its own errors
    void this.#attemptConfigApply();
  }

  /**
   * Whether anything would be cut off by stopping the server: a session this
   * harness owns mid-turn, a recovery reading or reattaching a session (or
   * queued to), or a session the server itself reports busy.
   *
   * The server's answer is asked per directory. opencode keeps session status
   * per instance (`session/status.ts`: `InstanceState.make(...)`), and an
   * instance is a directory, so a query with no directory answers only for the
   * server's own cwd. Every directory this harness subscribes to or holds a
   * session in is asked, plus the server's cwd for sessions other clients
   * started there.
   */
  async #isOpencodeBusy(): Promise<boolean> {
    if (this.#recovering > 0 || this.#recoveryWaiters.length > 0) {
      return true;
    }
    const dirs = new Set<string>(this.#pumps.keys());
    for (const session of this.#sessions.values()) {
      if (session.active) {
        return true;
      }
      dirs.add(session.directory);
    }
    const client = this.#client;
    if (!client) {
      return false;
    }
    try {
      const answers = await Promise.all(
        [undefined, ...dirs].map((directory) =>
          client.session.status(directory ? { directory } : {}, {
            signal: AbortSignal.timeout(5000),
          })
        )
      );
      return answers.some(
        (status) =>
          status.error ||
          !status.data ||
          Object.values(status.data as Record<string, { type: string }>).some(
            (state) => state.type === "busy" || state.type === "retry"
          )
      );
    } catch {
      // A server that cannot say whether it is busy is not stopped.
      return true;
    }
  }

  /**
   * Attempt to apply the latest desired config revision. Waits for all
   * opencode sessions to be idle, then SIGTERM's the server process via
   * sessiond, waits for exit, respawns via {@link attachOpencodeServer},
   * rebinds retained sessions to the new client, reconnects SSE pumps,
   * and verifies the runtime config matches the desired revision.
   *
   * Global config (~/.config/opencode/opencode.json) is only read at
   * server startup — `instance.dispose()` re-reads project config but
   * NOT global. A full process restart is the only reliable path.
   *
   * Only one apply attempt runs at a time. New changes arriving mid-apply
   * remain as the next desired revision — the watcher will trigger another
   * attempt after the current one completes.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential idle-wait → SIGTERM → respawn → rebind → verify lifecycle with structured error recovery; splitting loses the gate/finally invariant
  async #attemptConfigApply(): Promise<void> {
    if (this.#applyGate) {
      return;
    }
    if (!this.#client) {
      return;
    }
    if (
      this.#desiredHash === this.#appliedHash &&
      this.#desiredVersion === this.#appliedVersion
    ) {
      this.#configState = "applied";
      return;
    }

    // Validate config before killing a working server.
    const preCheck = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    if (!preCheck) {
      this.#configState = "error";
      this.#configError = "malformed config — will not stop working server";
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "error",
          detail: "malformed or missing opencode.json — refusing restart",
          at: Date.now(),
        })
      );
      return;
    }

    let gateResolve!: () => void;
    const gatePromise = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });
    this.#applyGate = { promise: gatePromise, resolve: gateResolve };

    try {
      // 1. Wait for idle: active turns finish, gate blocks new dispatches.
      const maxWaitMs = 300_000;
      const started = Date.now();
      // biome-ignore lint/performance/noAwaitInLoops: sequential polling for busy→idle transition; must check and sleep in order
      while (await this.#isOpencodeBusy()) {
        if (Date.now() - started > maxWaitMs) {
          this.#configState = "error";
          this.#configError = "timed out waiting for idle sessions";
          console.log(
            JSON.stringify({
              type: "config-convergence",
              state: "error",
              detail: "timed out waiting for idle sessions",
              at: Date.now(),
            })
          );
          return;
        }
        await Bun.sleep(500);
      }

      if (
        this.#desiredHash === this.#appliedHash &&
        this.#desiredVersion === this.#appliedVersion
      ) {
        this.#configState = "applied";
        return;
      }
      const targetHash = this.#desiredHash;
      const targetVersion = this.#desiredVersion;

      this.#configState = "applying";
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "applying",
          detail: `target ${targetHash?.slice(0, 8)}…, binary ${targetVersion}, restarting server`,
          at: Date.now(),
        })
      );

      // Re-read config: it may have changed during idle wait.
      const diskHash = await this.#hashConfig();
      if (targetHash && diskHash !== targetHash) {
        // Config changed during idle wait — coalesce to latest.
        this.#desiredHash = diskHash;
        this.#configState = "pending";
        return;
      }

      // 2. Collect active directories before killing the server.
      const dirs = new Set<string>(this.#pumps.keys());
      for (const session of this.#sessions.values()) {
        dirs.add(session.directory);
      }

      // 3. End all SSE pumps (the server we're about to kill owns them).
      this.#stopPumps();

      // 4. SIGTERM the server via sessiond and wait for exit.
      const sessiond = await this.sessiond();
      try {
        await sessiond.signal(OPENCODE_SERVER_PROC_ID, "SIGTERM");
      } catch {
        // Already dead — that's fine, we're respawning.
      }
      const exitDeadline = Date.now() + 15_000;
      while (Date.now() < exitDeadline) {
        // biome-ignore lint/performance/noAwaitInLoops: polling for process exit after SIGTERM
        const procs = await sessiond.list();
        const held = procs.procs.find(
          (p) => p.procId === OPENCODE_SERVER_PROC_ID
        );
        if (!held?.alive) {
          break;
        }
        await Bun.sleep(200);
      }
      // Verify exit — if still alive after 15s, error out (no SIGKILL).
      const finalCheck = await sessiond.list();
      const stillAlive = finalCheck.procs.find(
        (p) => p.procId === OPENCODE_SERVER_PROC_ID && p.alive
      );
      if (stillAlive) {
        throw new Error(
          "server did not exit within 15s after SIGTERM — refusing SIGKILL"
        );
      }

      // 5. Clear old client state.
      this.#client = null;
      this.#ready = null;

      // 6. Respawn via the existing attach helper. This reads global config
      //    at startup — the whole point of a process restart.
      const config = this.#serverConfig;
      const { url: newUrl } = await attachOpencodeServer({
        sessiond,
        spec: {
          command: resolveBin("opencode") ?? "opencode",
          args: ["serve", "--hostname=127.0.0.1", "--port=0"],
          env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
        },
      });
      // 7. The new client, with every retained session rebound to it.
      const newClient = this.#adopt(newUrl);

      // 8. Reconnect SSE pumps for all active directories.
      for (const dir of dirs) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget pump restart
        void this.#ensurePump(dir).catch(console.warn);
      }

      // 9. Verify: runtime config matches desired.
      await this.#verifyApply(newClient, targetHash, targetVersion);

      // 10. Mark applied — only after verification passes.
      this.#appliedHash = targetHash;
      this.#appliedVersion = targetVersion;
      this.#configError = null;

      if (
        this.#desiredHash === targetHash &&
        this.#desiredVersion === targetVersion
      ) {
        this.#configState = "applied";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "applied",
            detail: `revision ${targetHash?.slice(0, 8)}… applied via process restart`,
            at: Date.now(),
          })
        );
      } else {
        this.#configState = "pending";
        console.log(
          JSON.stringify({
            type: "config-convergence",
            state: "pending",
            detail: `desired changed during restart (${this.#desiredHash?.slice(0, 8)}… vs applied ${targetHash?.slice(0, 8)}…)`,
            at: Date.now(),
          })
        );
      }
    } catch (error) {
      this.#configState = "error";
      this.#configError = String(error);
      console.error(
        `[opencode] config convergence: apply failed: ${String(error)}`
      );
      console.log(
        JSON.stringify({
          type: "config-convergence",
          state: "error",
          detail: String(error),
          at: Date.now(),
        })
      );
    } finally {
      this.#applyGate = null;
      gateResolve();
      for (const session of this.#sessions.values()) {
        session.configGateLifted();
      }
      this.#drainPendingSpawns();
    }
  }

  /**
   * Drain queued spawn requests that accumulated while the config gate was held.
   */
  #drainPendingSpawns(): void {
    const pending = this.#pendingSpawns.splice(0);
    for (const { resolve, reject, spec, ctx } of pending) {
      this.spawn(spec, ctx).then(resolve, reject);
    }
  }

  /**
   * Verify the server's resolved state for a specific directory matches
   * the desired config after a dispose or fresh spawn. Two authoritative
   * checks:
   *
   * 1. **Runtime leaf comparison** — read the server's resolved config via
   *    `config.get()` for this directory, extract controlled fields, and
   * Verify the running server's config matches the desired global config.
   *
   * After a process restart, the new server reads global config at startup.
   * This method confirms that the runtime config.get() reflects the desired
   * controlled fields, and that MCP servers match expected state.
   *
   * Does NOT check per-directory project configs — project overlays are the
   * user's business. Only verifies controlled fields from global config.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: disk provenance + runtime leaf + MCP status verification; each layer independent with own logging
  async #verifyApply(
    client: OpencodeClient,
    targetHash: string | null,
    targetVersion: string | null
  ): Promise<void> {
    const health = await reached(
      client.global.health({ signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) })
    );
    const runningVersion = health.data?.version;
    if (!targetVersion || runningVersion !== targetVersion) {
      throw new Error(
        `binary verification failed: running ${runningVersion ?? "unknown"}, installed ${targetVersion ?? "unknown"}`
      );
    }
    // ---- 1. Disk provenance (concurrent-edit detection) --------------------
    const diskHash = await this.#hashConfig();
    if (targetHash && diskHash !== targetHash) {
      throw new Error(
        `config verification failed: disk hash ${diskHash?.slice(0, 8) ?? "null"}… differs from target ${targetHash.slice(0, 8)}… — concurrent modification`
      );
    }

    // ---- 2. Runtime leaf comparison ----------------------------------------
    const desiredRaw = await readJson<Record<string, unknown>>(OPENCODE_CONFIG);
    const liveResult = await client.config.get(
      {},
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!liveResult.data) {
      throw new Error(
        "config verification failed: config.get() returned no data"
      );
    }
    const liveConfig = liveResult.data as Record<string, unknown>;
    const fieldProblems: string[] = [];
    // The launch-time half: the policy the server was started with, and the
    // bridge plugin this agent wrote. A server launched by an older agent
    // under another policy or bridge fails here, not only one whose file
    // config drifted.
    if (!containsJson(STATIC_POLICY.permission, liveConfig.permission)) {
      fieldProblems.push("permission");
    }
    if (!containsJson(STATIC_POLICY.tools, liveConfig.tools)) {
      fieldProblems.push("tools");
    }
    if (
      this.#bridgePlugin &&
      !containsJson([`file://${this.#bridgePlugin}`], liveConfig.plugin)
    ) {
      fieldProblems.push("bridge plugin");
    }
    if (desiredRaw) {
      for (const field of CONTROLLED_CONFIG_FIELDS) {
        const desired = desiredRaw[field];
        if (desired === undefined) {
          continue;
        }
        const resolved =
          field === "agent"
            ? (liveConfig.agent ?? liveConfig.mode)
            : liveConfig[field];
        if (!containsJson(desired, resolved)) {
          fieldProblems.push(field);
        }
      }
    }
    console.log(
      JSON.stringify({
        type: "config-convergence",
        event: "runtime-verify",
        fields: CONTROLLED_CONFIG_FIELDS,
        mismatched: fieldProblems,
        at: Date.now(),
      })
    );
    if (fieldProblems.length > 0) {
      throw new Error(
        `config verification failed: runtime config diverges on: ${fieldProblems.join(", ")}`
      );
    }

    // ---- 3. MCP status (authoritative runtime check) -----------------------
    const expectedMcp = new Set(
      desiredRaw?.mcp
        ? Object.keys(desiredRaw.mcp as Record<string, unknown>)
        : []
    );
    const mcpStatus = await reached(
      client.mcp.status({}, { signal: AbortSignal.timeout(10_000) })
    );
    if (mcpStatus.data) {
      const statuses = mcpStatus.data as Record<string, { status: string }>;
      const statusMap = Object.fromEntries(
        Object.entries(statuses).map(([n, s]) => [n, s.status])
      );
      const mcpProblems: string[] = [];
      for (const name of expectedMcp) {
        const expected = (
          desiredRaw?.mcp as Record<string, { enabled?: boolean }> | undefined
        )?.[name];
        const actual = statuses[name];
        const expectedStatus =
          expected?.enabled === false ? "disabled" : "connected";
        if (actual?.status !== expectedStatus) {
          mcpProblems.push(`${name}=${actual?.status ?? "missing"}`);
        }
      }
      for (const name of Object.keys(statusMap)) {
        if (!expectedMcp.has(name)) {
          mcpProblems.push(`${name}=unexpected`);
        }
      }
      console.log(
        JSON.stringify({
          type: "config-convergence",
          event: "mcp-status",
          servers: statusMap,
          expected: [...expectedMcp],
          problems: mcpProblems,
          at: Date.now(),
        })
      );
      if (mcpProblems.length > 0) {
        throw new Error(
          `config verification failed: MCP state mismatch: ${mcpProblems.join(", ")}`
        );
      }
    } else if (expectedMcp.size > 0) {
      throw new Error(
        `config verification failed: MCP status returned no data; expected ${expectedMcp.size} server(s)`
      );
    }
  }

  async detect(): Promise<HarnessReport> {
    const installed = resolveBin("opencode") !== undefined;
    let version: string | undefined;
    if (installed) {
      const ran = await Bun.$`opencode --version`.quiet().nothrow();
      const said = ran.stdout.toString().trim();
      if (ran.exitCode === 0 && said) {
        version = said;
      }
    }
    // The catalog the machine reports, so a picker lists opencode's models
    // with no opencode session running. A server that cannot answer leaves
    // the report without one, as claude's does when its probe fails.
    const models = installed
      ? await this.#ensure()
          .then((client) => opencodeCatalog(client))
          .catch((error: unknown) => {
            console.warn(`[opencode] model catalog unavailable: ${error}`);
          })
      : undefined;
    return {
      harness: "opencode",
      installed,
      ...(version ? { version } : {}),
      auth: installed ? "authenticated" : "unauthenticated",
      capabilities: OPENCODE_CAPABILITIES,
      ...(models ? { models } : {}),
    };
  }

  /**
   * The machine's one sessiond connection for this harness, dialled lazily.
   * A dropped socket is re-dialled and the SERVER is untouched by that — the
   * property the whole leaf exists for.
   */
  async sessiond(
    // `CAWCO_SESSIOND_ENDPOINT` is sessiond's own override
    // (`sessiond/src/main.ts`), honoured here too so a dev run — or a test —
    // points both halves at a scratch socket instead of the real one.
    endpoint: string = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  ): Promise<SessiondClient> {
    const existing = await this.#sessiond?.catch(() => undefined);
    if (existing && !existing.closed) {
      return existing;
    }
    this.#sessiond = (async () => {
      await ensureSessiond(endpoint);
      return SessiondClient.connect(endpoint);
    })();
    return this.#sessiond;
  }

  /**
   * Makes the server at `url` the one this adapter talks to: one client for
   * it, cached, with every retained session moved onto it — a server that
   * replaced a restarted or dead one serves the same stored sessions. Every
   * request the SDK makes goes through the client's fetch, the event
   * subscriptions included.
   *
   * A connection failure there means the server this client was built for is
   * gone — crashed, OOM-killed, or stopped out from under sessiond — and
   * nothing else ever notices: `#ensure()` returns `#client` straight from
   * cache, so every later call kept re-throwing the same dead connection
   * forever (the live symptom: `listSessions on opencode failed: TypeError:
   * Unable to connect`, repeating with no recovery). This fetch is the one
   * place that sees the raw failure, so it is the one place that clears the
   * cache — the NEXT call then goes through `attachOpencodeServer` again,
   * which finds the proc dead via sessiond and respawns it. An abort this
   * process asked for (a request's own timeout, a subscription it ended) is
   * not the server going away, and leaves the client as it is.
   */
  #adopt(url: string): OpencodeClient {
    const dropWhenGone = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      try {
        return await fetchOpencode(input, init);
      } catch (error) {
        const signal = input instanceof Request ? input.signal : init?.signal;
        if (!signal?.aborted && this.#client === client) {
          this.#client = null;
          this.#ready = null;
        }
        throw error;
      }
    };
    const client = createOpencodeClient({
      baseUrl: url,
      fetch: Object.assign(dropWhenGone, { preconnect: fetch.preconnect }),
    });
    this.#client = client;
    for (const session of this.#sessions.values()) {
      session.rebindClient(client);
    }
    return client;
  }

  #ensure(): Promise<OpencodeClient> {
    if (this.#client) {
      return Promise.resolve(this.#client);
    }
    if (!this.#ready) {
      // A spawn after a dispose is a revival, not a leak: the adapter is a
      // module singleton, the server it attaches to outlived the teardown, and
      // the pumps must be allowed to re-subscribe. Cleared here rather than in
      // `dispose` so an in-flight teardown still stops its own pumps.
      this.#disposed = false;
      this.#ready = (async () => {
        await this.installDelegationTools();
        // Ask on everything the dashboard can surface. Questions default to
        // allow and are answered through the session's `question.asked` round
        // trip, so no permission key is set for them here. `webfetch` is the
        // exception: fleet policy is the firecrawl MCP, and a `deny` publishes
        // no permission event at all, so it never reaches {@link autoAllows}.
        // Fleet policy: search is the Exa MCP. `webfetch: 'deny'` above
        // removes the fetch built-in; `websearch` has no permission key,
        // so the tool itself is switched off.
        const config = this.#serverConfig;
        // Not `createOpencode`: that spawns the server as THIS process's child,
        // so every agent restart took the machine's opencode sessions with it.
        // The server goes under sessiond instead and we attach as a client —
        // the same client the bundled pair would have handed us.
        const sessiond = await this.sessiond();
        const { url, freshlySpawned } = await attachOpencodeServer({
          sessiond,
          spec: {
            // The SDK builds this exact command line
            // (`@opencode-ai/sdk/dist/server.js`); we build it here because the
            // spawn is sessiond's now, not `cross-spawn`'s.
            command: resolveBin("opencode") ?? "opencode",
            args: ["serve", "--hostname=127.0.0.1", "--port=0"],
            env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
          },
        });
        const client = this.#adopt(url);

        // Convergence keeps the server matching the machine's global config;
        // that is the machine agent's to do. Another agent's server runs on
        // the config it was launched with and is not reconciled with a file
        // it must not write. And only a server that reads the config this
        // agent writes is its to restart: an agent under another config root
        // shares the machine's sessiond, and so the machine's server.
        if ((await isMachineAgent()) && (await this.#readsThisConfig(client))) {
          this.#converging = true;
          // The baseline is whatever the running server verifiably loaded.
          // A server this agent just spawned and one it adopted from an
          // earlier agent are checked the same way: the adopted one keeps
          // its sessions running when it already matches, and is restarted
          // by the watcher only when it does not.
          const origin = freshlySpawned ? "freshly spawned" : "adopted server";
          const initialHash = await this.#hashConfig();
          const initialVersion = await this.#installedVersion();
          this.#desiredHash = initialHash;
          this.#desiredVersion = initialVersion;
          this.#appliedHash = null;
          this.#appliedVersion = null;
          this.#configState = "pending";
          if (initialHash) {
            try {
              // No directory is initialized yet; this verifies the global
              // resolved config (no directory query).
              await this.#verifyApply(client, initialHash, initialVersion);
              this.#appliedHash = initialHash;
              this.#appliedVersion = initialVersion;
              this.#configState = "applied";
              console.log(
                JSON.stringify({
                  type: "config-convergence",
                  state: "applied",
                  detail: `${origin}, verified baseline ${initialHash.slice(0, 8)}…`,
                  at: Date.now(),
                })
              );
            } catch (error) {
              console.log(
                JSON.stringify({
                  type: "config-convergence",
                  state: "pending",
                  detail: `${origin} failed verification, convergence scheduled: ${String(error)}`,
                  at: Date.now(),
                })
              );
            }
          }
          this.#startConfigWatcher();
        }

        return client;
      })().catch((error) => {
        this.#ready = null;
        throw error;
      });
    }
    return this.#ready;
  }

  /**
   * Connects opencode to this agent's hub: the MCP server and the
   * identity-only bridge plugin. The machine's own agent writes them into
   * opencode's global config, where every opencode on the machine finds them.
   * Any other agent (a worktree's, against a test hub) must not: it hands them
   * to its own server alone, through the config it launches that server with,
   * and keeps the plugin in a cawco-owned directory named for its hub.
   */
  async installDelegationTools(): Promise<void> {
    const source = buildHandoffPluginSource();
    if (await isMachineAgent()) {
      await retireLegacyHandoffPlugin();
      await Bun.$`mkdir -p ${OPENCODE_PLUGINS}`.quiet();
      const config =
        (await readJson<Record<string, unknown>>(OPENCODE_CONFIG)) ?? {};
      await writeOpencodeConfig("delegation tools", {
        ...config,
        mcp: {
          ...(config.mcp as Record<string, unknown> | undefined),
          cawco: cawcoMcp(),
        },
      });
      this.#bridgePlugin = await writeHandoffPlugin(source);
      this.#serverConfig = STATIC_POLICY;
      return;
    }
    const own = join(
      homedir(),
      ".cawco",
      "hub-opencode",
      new URL(delegationHubUrl()).host.replaceAll(":", "_")
    );
    await Bun.$`mkdir -p ${join(own, "plugins")}`.quiet();
    const plugin = await writeHandoffPlugin(source, own);
    this.#bridgePlugin = plugin;
    this.#serverConfig = {
      ...STATIC_POLICY,
      mcp: { cawco: cawcoMcp() },
      plugin: [`file://${plugin}`],
    };
  }

  /**
   * What this agent's opencode server launches with: the fleet's static
   * policy, plus — for an agent that is not the machine's — its own hub.
   */
  #serverConfig: Record<string, unknown> = STATIC_POLICY;

  /** The bridge plugin file this agent wrote; a server that loaded another is stale. */
  #bridgePlugin: string | undefined;

  /** Starts the directory-scoped subscription for a directory, once per unique cwd. */
  #ensurePump(directory: string): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #disposed is set true by dispose(), a different method biome's per-method inference doesn't see
    if (this.#disposed) {
      return Promise.reject(new Error("OpenCode adapter disposed"));
    }
    if (!this.#pumps.has(directory)) {
      const owner = new AbortController();
      this.#pumps.set(directory, owner);
      // biome-ignore lint/complexity/noVoid: the pump owns reconnection; callers await only readiness
      void this.#pumpDirectory(directory, owner.signal).catch(console.warn);
    }
    // biome-ignore lint/style/noNonNullAssertion: pumpDirectory installs readiness before its first await
    return this.#pumpReady.get(directory)!;
  }

  /** Ends every directory's subscription loop; none reconnects. */
  #stopPumps(): void {
    for (const owner of this.#pumps.values()) {
      owner.abort();
    }
    this.#pumps.clear();
    this.#pumpReady.clear();
    this.#pumpConnected.clear();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes every subscribed event to its owning session or child; not refactored in this pass
  async #pumpDirectory(directory: string, stopped: AbortSignal): Promise<void> {
    let delay = 1000;
    while (!stopped.aborted) {
      const ready = Promise.withResolvers<void>();
      this.#pumpReady.set(directory, ready.promise);
      // biome-ignore lint/complexity/noVoid: a reconnect need not have a caller waiting for readiness
      void ready.promise.catch(() => undefined);
      // One connection: its deadline drops it for a reconnect, the owner's
      // stop ends the loop.
      const connection = new AbortController();
      const deadline = setTimeout(
        () => connection.abort(),
        RECOVERY_TIMEOUT_MS
      );
      let connected = false;
      try {
        // Each connection is made on the adapter's current client. A server
        // that died fails this subscription's fetch, the client's fetch drops
        // it (see #connect), and the next attempt's #ensure attaches — and
        // if need be respawns — the server that replaces it.
        // biome-ignore lint/performance/noAwaitInLoops: reconnects the SSE stream after a drop; must retry sequentially with backoff
        const client = await this.#ensure();
        const { stream } = await client.event.subscribe(
          { directory },
          {
            signal: AbortSignal.any([stopped, connection.signal]),
            sseMaxRetryAttempts: 1,
          }
        );
        for await (const event of stream) {
          // A stopped loop routes nothing more, even what was already read.
          if (stopped.aborted) {
            break;
          }
          if (!connected) {
            connected = true;
            clearTimeout(deadline);
            console.info(`[opencode] ${directory}: subscribe ready`);
            ready.resolve();
            // Every session already attached here gets its snapshot now; one
            // that attaches while this holds takes its own (see `attached`).
            this.#pumpConnected.add(directory);
            for (const session of this.#sessions.values()) {
              if (session.directory === directory) {
                // biome-ignore lint/complexity/noVoid: snapshots must not block consumption of live gate events
                void this.#reconcile(session);
              }
            }
          }
          delay = 1000;
          if (event.type === "session.created") {
            this.#routeChildCreated(event);
            continue;
          }
          const sid = this.#eventSession(event);
          const session = sid ? this.#sessionForSid(sid) : undefined;
          if (session) {
            session.handle(event);
          } else if (sid) {
            const child = this.#children.get(sid);
            if (child) {
              child.parent.handleChild(event, child.callID);
            }
          }
        }
      } catch {
        // The stream ended or dropped; reconnect below unless stopped.
      } finally {
        // A stopped loop's flag was cleared with it, and the directory may
        // already be a newer loop's.
        if (connected && !stopped.aborted) {
          this.#pumpConnected.delete(directory);
        }
        clearTimeout(deadline);
        connection.abort();
        ready.reject(
          new Error(`OpenCode subscription unavailable: ${directory}`)
        );
      }
      if (stopped.aborted) {
        break;
      }
      await Bun.sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
  }

  /** A child session was created; hand its info to the named parent for binding. */
  #routeChildCreated(event: Event): void {
    const props = event.properties as unknown as {
      sessionID?: string;
      info?: { id?: string; parentID?: string; agent?: string; title?: string };
    };
    const childId = props.info?.id ?? props.sessionID;
    const parentId = props.info?.parentID;
    if (!(childId && parentId)) {
      return;
    }
    const parent = this.#sessionForSid(parentId);
    if (parent) {
      parent.handleChildCreated(childId, props.info?.agent, props.info?.title);
    }
  }

  #eventSession(event: Event): string | undefined {
    const p = event.properties as Record<string, unknown> & {
      sessionID?: string;
      info?: { sessionID?: string };
      part?: { sessionID?: string };
    };
    return p.sessionID ?? p.info?.sessionID ?? p.part?.sessionID;
  }

  /**
   * Resolves opencode's own session id, off an event, back to one of ours.
   * `#sessions` is keyed by instanceId now, so this is the lookup that used to
   * be free with a `sessionId`-keyed map. When more than one of our sessions
   * shares that opencode id (the resume collision the rekey exists for), the
   * most recently spawned one wins — Map iteration is insertion order, so the
   * last match is the newest — on the theory that a live event is more likely
   * meant for whichever instance most recently took that session over.
   */
  #sessionForSid(sid: string): OpencodeSession | undefined {
    let found: OpencodeSession | undefined;
    for (const session of this.#sessions.values()) {
      if (session.sessionId === sid) {
        found = session;
      }
    }
    return found;
  }

  async #withRecovery<T>(work: () => Promise<T>): Promise<T> {
    // Transfer a released slot directly to its waiter, so newcomers cannot
    // race a woken recovery into a fifth concurrent operation.
    if (this.#recovering === 4) {
      await new Promise<void>((resolve) => this.#recoveryWaiters.push(resolve));
    } else {
      this.#recovering += 1;
    }
    if (this.#recovering > this.#recoveryHighWater) {
      this.#recoveryHighWater = this.#recovering;
      console.info(
        `[opencode] recovery concurrency high-water ${this.#recoveryHighWater}`
      );
    }
    try {
      return await work();
    } finally {
      const next = this.#recoveryWaiters.shift();
      if (next) {
        next();
      } else {
        this.#recovering -= 1;
      }
    }
  }

  #reconcile(session: OpencodeSession): Promise<void> {
    const existing = this.#reconcileJobs.get(session);
    if (existing) {
      this.#reconcileAgain.add(session);
      return existing;
    }
    const job = this.#withRecovery(async () => {
      if (this.#sessions.get(session.instanceId) !== session) {
        return;
      }
      await Promise.all([session.watchResumedTurn(), session.reconcileGates()]);
    }).finally(() => {
      this.#reconcileJobs.delete(session);
      if (
        this.#reconcileAgain.delete(session) &&
        this.#sessions.get(session.instanceId) === session
      ) {
        // biome-ignore lint/complexity/noVoid: a reconnect during a snapshot needs a fresh snapshot after it
        void this.#reconcile(session);
      }
    });
    this.#reconcileJobs.set(session, job);
    return job;
  }

  async abortSession(sessionKey: string, dir: string): Promise<boolean> {
    // Never start a server to discard a turn that might already be gone.
    const client = this.#client;
    if (!client) {
      return false;
    }
    const status = await client.session.status(
      { directory: dir },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (status.error || !status.data) {
      throw new Error(`Could not read OpenCode session status in ${dir}`);
    }
    const state = status.data[sessionKey]?.type;
    if (state !== "busy" && state !== "retry") {
      return false;
    }
    const aborted = await client.session.abort(
      { sessionID: sessionKey, directory: dir },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (aborted.error || aborted.data !== true) {
      throw new Error(`Could not abort OpenCode session ${sessionKey}`);
    }
    const after = await client.session.status(
      { directory: dir },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (after.error || !after.data) {
      throw new Error(
        `Could not verify OpenCode session ${sessionKey} stopped`
      );
    }
    const remaining = after.data[sessionKey]?.type;
    if (remaining === "busy" || remaining === "retry") {
      throw new Error(`OpenCode session ${sessionKey} is still ${remaining}`);
    }
    return true;
  }

  /** A register may recover every held session, but must never spawn new work. */
  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    // A config apply in progress is about to stop the server this reads.
    // Waited out before taking a recovery slot, not inside one: a held slot
    // counts as busy, and the apply waits for busy to clear before it stops
    // the server — waiting inside would hold both sides for its whole timeout.
    // Rechecked after each wake, because another apply may have started, and
    // nothing awaits between the last check and the slot being taken.
    while (this.#applyGate) {
      // biome-ignore lint/performance/noAwaitInLoops: each apply must finish before the next check
      await this.#applyGate.promise;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: custody check, inspection-only policy and cancellation belong to one recovery transaction
    return this.#withRecovery(async () => {
      try {
        const client = await SessiondClient.connect(
          process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
        );
        const held = client.procs.some(
          (proc) => proc.procId === OPENCODE_SERVER_PROC_ID && proc.alive
        );
        client.close();
        // Register reads the catalog first, which connects the adapter. Do not
        // call #ensure here: custody disappearing must never start a new server.
        const server = this.#client;
        if (!(held && spec.resume && server)) {
          return;
        }
        const session = await server.session.get(
          { sessionID: spec.resume.sessionKey, directory: ctx.cwd },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
        if (session.response?.status === 404) {
          return;
        }
        if (session.error || !session.data) {
          throw new Error(
            `Could not reattach OpenCode session ${spec.resume.sessionKey}`
          );
        }
        // Whether this session's turn is still running is the server's word,
        // asked before the session is handed back: a reattached session is
        // busy from that moment, not from the reconcile that follows its
        // subscription (`watchResumedTurn`), which a busy question after an
        // agent restart did not wait for.
        const status = await server.session.status(
          { directory: ctx.cwd },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
        if (status.error) {
          throw new Error(
            `Could not read OpenCode session status in ${ctx.cwd}`
          );
        }
        const state = status.data?.[spec.resume.sessionKey]?.type;
        const running = state === "busy" || state === "retry";
        if (spec.reattachOnly === "busy" || spec.reattachOnly === "inspect") {
          if (!running) {
            return;
          }
          if (spec.reattachOnly === "inspect") {
            // Not a session frame through ctx.frame: that folds a pulse and would
            // turn this safety inspection into fresh activity on the old row.
            ctx.emit({
              verb: "frames",
              machineId: "",
              instanceId: ctx.instanceId,
              payload: {
                kind: "frame",
                harness: "opencode",
                message: { type: "system", subtype: "custody_held" },
              },
            });
            return;
          }
        }
        // Not `spawn`: that queues behind an apply gate, and an apply that
        // started while this recovery held its slot waits for the slot —
        // queueing here would hold both. The apply stops nothing while a
        // recovery is running, so the server this opens against stays up.
        const opened = await this.#open(spec, ctx);
        if (running) {
          opened.reattachedMidTurn();
        }
        return opened;
      } catch (error) {
        console.warn(
          `[opencode] recovery ${ctx.instanceId} left sleeping: ${String(error)}`
        );
      }
    });
  }

  spawn(spec: SpawnPayload, ctx: HarnessContext): Promise<HarnessSession> {
    // Config convergence gate: if a reload is in progress, queue this spawn
    // and deliver it when the gate lifts.
    if (this.#applyGate) {
      return new Promise<HarnessSession>((resolve, reject) => {
        this.#pendingSpawns.push({ resolve, reject, spec, ctx });
      });
    }
    return this.#open(spec, ctx);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: creates/resumes/forks a session across three branches, then wires the session up; not refactored in this pass
  async #open(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<OpencodeSession> {
    const client = await this.#ensure();
    const mcp = await client.mcp.status(
      { directory: ctx.cwd },
      { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
    );
    if (mcp.error) {
      throw new Error(
        `Could not read OpenCode MCP status: ${errorText(mcp.error)}`
      );
    }
    // An agent that is not the machine's always points the server at its own
    // hub: a `cawco` server read from the global config is the machine's.
    if (mcp.data?.cawco?.status !== "connected" || !(await isMachineAgent())) {
      const connected = await client.mcp.add(
        { directory: ctx.cwd, name: "cawco", config: cawcoMcp() },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (connected.error || connected.data?.cawco?.status !== "connected") {
        throw new Error(
          `Could not connect CawCo MCP: ${errorText(connected.error ?? connected.data?.cawco)}`
        );
      }
    }
    let sessionId: string;

    if (spec.resume?.fork) {
      assertOpencodeKey(spec.resume.sessionKey, "fork");
      const fork = await client.session.fork(
        {
          sessionID: spec.resume.sessionKey,
          directory: ctx.cwd,
          ...(spec.resume.atMessage
            ? { messageID: spec.resume.atMessage }
            : {}),
        },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (fork.error || !fork.data) {
        throw new Error("opencode could not fork the session");
      }
      sessionId = (fork.data as Session).id;
    } else if (spec.resume) {
      // Re-open: opencode sessions persist in the server's DB, so resuming is
      // just addressing the id again — but only an id the server actually
      // holds. A key nobody holds is refused loudly here rather than addressed
      // blindly: a blind address becomes a live handle whose every prompt
      // fails, plus an init frame that cements the bogus key into the hub row
      // (noteInstanceSession trusts it), poisoning the session permanently.
      assertOpencodeKey(spec.resume.sessionKey, "resume");
      const held = await client.session.get(
        { sessionID: spec.resume.sessionKey, directory: ctx.cwd },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (held.error || !held.data) {
        throw new Error(
          `opencode has no session ${spec.resume.sessionKey} to resume in ${ctx.cwd}`
        );
      }
      sessionId = spec.resume.sessionKey;
      if (spec.resume.atMessage) {
        assertOpencodeKey(spec.resume.sessionKey, "revert");
        const reverted = await client.session.revert(
          {
            sessionID: spec.resume.sessionKey,
            directory: ctx.cwd,
            messageID: spec.resume.atMessage,
          },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        );
        if (reverted.error) {
          throw new Error("opencode could not rewind to that message");
        }
      }
    } else {
      const created = await client.session.create(
        { directory: ctx.cwd },
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      );
      if (created.error || !created.data) {
        throw new Error("opencode could not create the session");
      }
      sessionId = (created.data as Session).id;
    }

    let session!: OpencodeSession;
    session = new OpencodeSession(
      ctx.instanceId,
      ctx,
      client,
      sessionId,
      ctx.cwd,
      spec.model,
      spec.permissionMode,
      (childId, callID) =>
        this.#children.set(childId, { parent: session, callID }),
      () => {
        this.#sessions.delete(ctx.instanceId);
        for (const [childId, entry] of this.#children) {
          if (entry.parent === session) {
            this.#children.delete(childId);
          }
        }
      },
      () => this.#applyGate !== null,
      spec.effort,
      spec.workflowStepId,
      spec.canDelegate
    );
    // A session an earlier agent left mid-turn: the hub still waits on that
    // turn's end, which the reconcile after its subscription comes up pays.
    if (spec.resume && !spec.resume.fork && (await turnWasOpen(sessionId))) {
      session.inheritOpenTurn();
    }
    session.attached = () => {
      this.#sessions.set(ctx.instanceId, session);
      ctx.session(sessionId);
      // The init frame the dashboard reads the model / cwd / commands off.
      ctx.frame({
        type: "system",
        subtype: "init",
        session_id: sessionId,
        cwd: ctx.cwd,
        ...(spec.model ? { model: spec.model } : {}),
        ...(spec.permissionMode ? { permissionMode: spec.permissionMode } : {}),
      });
      session.sayEffort();

      // biome-ignore lint/complexity/noVoid: the command prefill must not block attachment
      void session
        .control(CONTROL_SUPPORTED_COMMANDS, [])
        .then((answer) => {
          const commands = answer as SlashCommand[];
          if (commands.length) {
            ctx.frame({
              type: "system",
              subtype: "commands_changed",
              session_id: sessionId,
              commands,
            });
          }
        })
        .catch((error: unknown) =>
          console.warn(`[opencode] command list: ${String(error)}`)
        );

      // A resumed session may already be mid-turn on the server, or holding an
      // open permission or question; nothing else would ever tell this
      // process so (see `watchResumedTurn`, `reconcileGates`). One snapshot
      // per session, taken after its directory is subscribed so no live gate
      // event is missed: a directory that connects after this line reconciles
      // every session it holds, this one included, so only a directory whose
      // subscription is already up reconciles here. Both checks run without
      // an await between them and the connection's, so exactly one fires.
      // biome-ignore lint/complexity/noVoid: attached handles remain operable while the subscription starts
      void this.#ensurePump(ctx.cwd).catch((error: unknown) =>
        console.warn(String(error))
      );
      if (this.#pumpConnected.has(ctx.cwd)) {
        // biome-ignore lint/complexity/noVoid: attached handles remain operable while reconciliation runs
        void this.#reconcile(session);
      }
    };

    // Load skills natively: send each as a /command before the first prompt.
    // The opencode server queues them in order, so skills load before work.
    if (spec.skills?.length) {
      for (const skill of spec.skills) {
        // biome-ignore lint/performance/noAwaitInLoops: skills must load in order, before the first prompt
        await reached(
          client.session.command(
            {
              sessionID: sessionId,
              directory: ctx.cwd,
              command: skill,
              arguments: "",
              ...(spec.model ? { model: spec.model } : {}),
              ...(spec.effort ? { variant: spec.effort } : {}),
            },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
        );
      }
    }

    return session;
  }

  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    if (resolveBin("opencode") === undefined) {
      return [];
    }
    const client = await this.#ensure();
    const tags = await readTags();

    if (dir) {
      const result = await reached(
        client.session.list(
          { directory: dir },
          { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
        )
      );
      if (result.error || !result.data) {
        return [];
      }
      // Subagent children do not belong in the rail.
      return (result.data as Session[])
        .filter((session) => !session.parentID)
        .map((session) => sessionToInfo(session, tags[session.id]));
    }

    // Machine catalog: every session on the server, merged and deduped by id.
    // Asked per project worktree AND once unscoped: a scoped list only matches
    // its exact directory, so a session living directly under a parent dir
    // (e.g. /home/o with only / as a project worktree) appears in neither —
    // verified live at 1.18.19, where `?directory=/` answers []. The unscoped
    // list covers those; the per-worktree queries stay so an opencode whose
    // unscoped list is project-scoped still reports the whole machine.
    const projects = await reached(
      client.project.list(
        {},
        { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
      )
    );
    if (projects.error || !projects.data) {
      return [];
    }
    const lists = await Promise.all([
      client.session
        .list({}, { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) })
        .then((res) => (res.error || !res.data ? [] : (res.data as Session[])))
        .catch(() => [] as Session[]),
      ...(projects.data as Project[]).map((project) =>
        client.session
          .list(
            { directory: project.worktree },
            { signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS) }
          )
          .then((res) =>
            res.error || !res.data ? [] : (res.data as Session[])
          )
          .catch(() => [] as Session[])
      ),
    ]);
    const seen = new Set<string>();
    const merged: Session[] = [];
    for (const list of lists) {
      for (const session of list) {
        if (session.parentID || seen.has(session.id)) {
          continue;
        }
        seen.add(session.id);
        merged.push(session);
      }
    }
    return merged.map((session) => sessionToInfo(session, tags[session.id]));
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    if (resolveBin("opencode") === undefined) {
      return undefined;
    }
    // A read-only lookup: a key that cannot be an opencode session answers
    // "not held" rather than being sent, keeping this method's contract.
    if (!OPENCODE_SESSION_ID.test(sessionKey)) {
      return undefined;
    }
    const client = await this.#ensure();
    const result = await reached(
      client.session.get({ sessionID: sessionKey, directory: dir })
    );
    if (result.error || !result.data) {
      return undefined;
    }
    const tags = await readTags();
    return sessionToInfo(result.data as Session, tags[sessionKey]);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reads the session, its revert point, and its subagent children in one pass; not refactored in this pass
  async getSessionMessages(
    sessionKey: string,
    dir?: string
  ): Promise<SessionMessage[]> {
    if (resolveBin("opencode") === undefined) {
      return [];
    }
    assertOpencodeKey(sessionKey, "getSessionMessages");
    const client = await this.#ensure();
    const result = await reached(
      client.session.messages({ sessionID: sessionKey, directory: dir })
    );
    if (result.error || !result.data) {
      return [];
    }
    let rows = result.data as { info: Message; parts: Part[] }[];

    // opencode keeps the full history even after a rewind; reflect the session's
    // `revert` point by dropping it and everything after.
    const sessionRes = await reached(
      client.session.get({ sessionID: sessionKey, directory: dir })
    );
    const revertID = (sessionRes.data as Session).revert?.messageID;
    if (revertID) {
      const idx = rows.findIndex((row) => row.info.id === revertID);
      if (idx >= 0) {
        rows = rows.slice(0, idx);
      }
    }

    const entries = toTranscript(sessionKey, rows);

    // Subagents: children of this session, linked to their parent's task tool
    // call by the task ToolPart's `state.metadata.sessionId` (verified capture).
    const childrenRes = await reached(
      client.session.children({ sessionID: sessionKey })
    );
    if (childrenRes.error || !childrenRes.data) {
      return entries;
    }

    const callByChild = new Map<string, string>();
    for (const row of rows) {
      for (const part of row.parts) {
        if (part.type !== "tool" || part.tool !== "task") {
          continue;
        }
        const childId = (part.state as { metadata?: { sessionId?: string } })
          .metadata?.sessionId;
        if (typeof childId === "string") {
          callByChild.set(childId, part.callID);
        }
      }
    }

    for (const child of childrenRes.data as Session[]) {
      const callID = callByChild.get(child.id);
      if (!callID) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: children are appended to the transcript in this order; parallel fetches would reorder subagents
      const childRes = await reached(
        client.session.messages({ sessionID: child.id, directory: dir })
      );
      if (childRes.error || !childRes.data) {
        continue;
      }
      const childEntries = toTranscript(
        child.id,
        childRes.data as { info: Message; parts: Part[] }[]
      );
      for (const entry of childEntries) {
        entry.parent_tool_use_id = callID;
      }
      entries.push(...childEntries);
    }

    return entries;
  }

  renameSession(
    sessionKey: string,
    title: string,
    dir?: string
  ): Promise<void> {
    if (resolveBin("opencode") === undefined) {
      return Promise.resolve(undefined);
    }
    assertOpencodeKey(sessionKey, "renameSession");
    return this.#ensure()
      .then((client) =>
        reached(
          client.session.update({
            sessionID: sessionKey,
            directory: dir,
            title,
          })
        )
      )
      .then(() => undefined);
  }

  async tagSession(
    sessionKey: string,
    tag: string | null,
    _dir?: string
  ): Promise<void> {
    assertOpencodeKey(sessionKey, "tagSession");
    await writeTag(sessionKey, tag);
  }

  deleteSession(sessionKey: string, dir?: string): Promise<void> {
    if (resolveBin("opencode") === undefined) {
      return Promise.resolve(undefined);
    }
    assertOpencodeKey(sessionKey, "deleteSession");
    return this.#ensure()
      .then((client) =>
        reached(
          client.session.delete({ sessionID: sessionKey, directory: dir })
        )
      )
      .then(() => undefined);
  }

  async machine(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case CONTROL_MODEL_CATALOG:
        return await opencodeCatalog(await this.#ensure());
      case CONTROL_GET_TODOS: {
        assertOpencodeKey(args[0] as string, CONTROL_GET_TODOS);
        const client = await this.#ensure();
        const result = await reached(
          client.session.todo({
            sessionID: args[0] as string,
            ...(args[1] ? { directory: args[1] as string } : {}),
          })
        );
        if (result.error || !result.data) {
          return [];
        }
        // opencode's todos carry no id: the list is ordered and replaced
        // whole on every write, so a todo's place in it is its identity,
        // counted before the cancelled ones drop out.
        return (result.data as Todo[])
          .map((todo, index) => ({ todo, id: String(index + 1) }))
          .filter(({ todo }) => todo.status !== "cancelled")
          .map(({ todo, id }): import("@cawco/core").NeutralTask => ({
            id,
            subject: todo.content,
            status:
              todo.status === "in_progress" || todo.status === "completed"
                ? todo.status
                : "pending",
            blocks: [],
            blockedBy: [],
          }));
      }
      default:
        return undefined;
    }
  }

  /**
   * Tear down the AGENT SIDE. The server is deliberately left running: it is
   * sessiond's child now, it owns the machine's live sessions, and killing it
   * here would re-create exactly the death this leaf removes. A rebuilt
   * supervisor calls {@link OpencodeHarness.spawn} again, {@link #ensure}
   * re-reads the announced port from the ring, and the per-directory SSE pumps
   * re-subscribe against the same still-running server.
   */
  // biome-ignore lint/suspicious/useAwait: implements Harness.dispose's Promise<void> contract; this teardown is synchronous
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#stopConfigWatcher();
    this.#stopPumps();
    // The socket, not the child: a closed sessiond connection is re-dialled by
    // `sessiond()` and the held server never notices.
    // biome-ignore lint/complexity/noVoid: fire-and-forget close; dispose() must not block on the socket teardown
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best-effort close, a failed close here is not actionable
    void this.#sessiond?.then((client) => client.close()).catch(() => {});
    this.#sessiond = undefined;
    this.#client = null;
    this.#ready = null;
  }

  async syncFleet(config: FleetConfig): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };

    const mcp = await syncOpencodeMcp(
      config.mcp,
      sidecar.mcp ?? [],
      report.mcp
    );
    // Remove the skills/memory the pre-2026-08-14 sync wrote; opencode reads
    // ~/.claude/skills/ and its own memory file, so cawco no longer owns these.
    if (Object.keys(sidecar.skills).length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: invariant: report.skills is initialized to {} a few lines above; TS drops the narrowing across the earlier await
      await syncSkillFiles(OPENCODE_SKILLS, [], sidecar.skills, report.skills!);
    }
    if (sidecar.memory !== undefined) {
      await syncMemory(OPENCODE_MEMORY, null, sidecar.memory, report);
    }
    await writeJson(OPENCODE_SIDECAR, { mcp });

    // Poke the config watcher: syncFleet just wrote opencode.json, so the disk
    // hash will have changed. An immediate tick avoids the up-to-2s polling
    // delay before the convergence system notices.
    await this.#configTick();
    const client = await this.#ensure();
    for (const server of config.mcp.filter(
      (row) => row.proxied && row.enabled
    )) {
      const directories = new Set([
        undefined,
        ...this.#pumps.keys(),
        ...[...this.#sessions.values()].map((session) => session.directory),
      ]);
      for (const directory of directories) {
        // biome-ignore lint/performance/noAwaitInLoops: replace each directory's connection before reporting runtime state
        const connected = await client.mcp.add({
          name: server.name,
          config: toOpencodeMcp(server.config),
          directory,
        });
        if (connected.error) {
          throw new Error(errorText(connected.error));
        }
        const removed = await client.mcp.auth.remove({
          name: server.name,
          directory,
        });
        if (removed.error) {
          throw new Error(errorText(removed.error));
        }
        const reconnected = await client.mcp.connect({
          name: server.name,
          directory,
        });
        if (reconnected.error) {
          throw new Error(errorText(reconnected.error));
        }
      }
    }
    Object.assign(report.mcp, await this.#readFleetMcp(mcp));

    return report;
  }

  async fleetStatus(): Promise<FleetSyncReport> {
    const sidecar = await readSidecar(OPENCODE_SIDECAR);
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      at: Date.now(),
    };

    report.mcp = await this.#readFleetMcp(sidecar.mcp ?? []);
    return report;
  }

  async #readFleetMcp(names: string[]): Promise<FleetSyncReport["mcp"]> {
    if (names.length === 0) {
      return {};
    }
    try {
      const client = await this.#ensure();
      const result = await reached(
        client.mcp.status({}, { signal: AbortSignal.timeout(10_000) })
      );
      if (result.error || !result.data) {
        throw new Error(errorText(result.error));
      }
      return Object.fromEntries(
        names.map((name) => [name, mcpFleetState(result.data[name])])
      );
    } catch (error) {
      return Object.fromEntries(
        names.map((name) => [name, { state: "failed", detail: String(error) }])
      );
    }
  }
}

/**
 * Whether an assistant message is the one its model ended the turn with: it
 * has completed, without an error, and finished on `stop` (not `tool-calls`,
 * `length` or `unknown`).
 */
const endsTurn = (info: AssistantMessage): boolean =>
  Boolean(info.time.completed) && !info.error && info.finish === "stop";

/**
 * The user messages opencode has written and not yet given the model: those
 * written behind an assistant message still being written. opencode stores a
 * send the moment it is dispatched and takes it up when the step in flight
 * ends — the same rule the live stream reads by (`#readAfter`, released when
 * that answer completes). The one still being written, when there is one, is
 * `answering`.
 */
function queuedMessages(rows: { info: Message }[]): {
  answering?: string;
  ids: Set<string>;
} {
  const ids = new Set<string>();
  let answering: string | undefined;
  for (const { info } of rows) {
    if (info.role === "assistant") {
      answering = (info as AssistantMessage).time.completed
        ? undefined
        : info.id;
      ids.clear();
    } else if (answering) {
      ids.add(info.id);
    }
  }
  return { ids, ...(answering ? { answering } : {}) };
}

/** opencode `{info, parts}` → the neutral transcript entries the folder reads. */
/**
 * Exported for its own sake as well as the session's: this is the whole of what
 * a reopened transcript is, so it is the one place a reload's fidelity can be
 * checked against parts a real server stored.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: replays every part kind opencode stores; not refactored in this pass
export function toTranscript(
  sessionKey: string,
  rows: { info: Message; parts: Part[] }[]
): SessionMessage[] {
  const entries: SessionMessage[] = [];
  const unread = queuedMessages(rows).ids;
  for (const { info, parts } of rows) {
    // opencode records when each message was created (`time.created`, epoch
    // ms, on UserMessage and AssistantMessage in @opencode-ai/sdk
    // types.gen.d.ts): every entry of the message carries it, a tool result
    // the moment its call ended.
    const timestamp = new Date(info.time.created).toISOString();
    if (info.role === "user") {
      const text = parts
        .filter((part): part is TextPart => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      const content = withImageAttachments(
        text,
        parts.filter((part): part is FilePart => part.type === "file")
      );
      if (content) {
        // A sent message is keyed back to its send's uuid by the hub, which
        // was told this message id when the send was dispatched (`storedAs`).
        // Why a send failed is its record's to say, not the transcript's.
        entries.push({
          type: "user",
          uuid: info.id,
          session_id: sessionKey,
          message: { role: "user", content },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp,
          ...(unread.has(info.id) ? { queued: true as const } : {}),
        });
      }
      continue;
    }

    // An assistant message: its text/reasoning become one entry; its tool parts
    // become a tool_use entry, and each tool result a user entry.
    const blocks: NeutralAssistantBlock[] = [];
    for (const part of parts) {
      if (part.type === "text" && !part.synthetic && !part.ignored) {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "reasoning") {
        blocks.push({ type: "thinking", thinking: part.text });
      } else if (part.type === "tool") {
        blocks.push({
          type: "tool_use",
          id: part.callID,
          name: toolNameOf(part.tool),
          input: part.state.input,
        });
      }
    }
    if (blocks.length) {
      entries.push({
        type: "assistant",
        uuid: info.id,
        session_id: sessionKey,
        message: {
          role: "assistant",
          model: `${(info as AssistantMessage).providerID}/${(info as AssistantMessage).modelID}`,
          content: blocks,
        },
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp,
        // A compaction's summary: opencode's context restarts from here.
        ...((info as AssistantMessage).summary
          ? { compactSummary: true as const }
          : {}),
        ...(endsTurn(info as AssistantMessage)
          ? { turnEnd: true as const }
          : {}),
      });
    }
    for (const part of parts) {
      if (part.type !== "tool") {
        continue;
      }
      if (part.state.status === "completed" || part.state.status === "error") {
        const output =
          part.state.status === "completed"
            ? part.state.output
            : part.state.error;
        const metadata =
          part.state.status === "completed"
            ? (part.state as { metadata?: Record<string, unknown> }).metadata
            : undefined;
        const structuredContent =
          metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
        entries.push({
          type: "user",
          uuid: `${info.id}:${part.id}`,
          session_id: sessionKey,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: part.callID,
                content:
                  part.state.status === "completed"
                    ? withImageAttachments(output, part.state.attachments)
                    : output,
                is_error: part.state.status === "error",
                ...(structuredContent ? { structuredContent } : {}),
                // Replay says what the live stream said: opencode keeps the
                // asked questions and the chosen answers on the part itself, so
                // a reopened transcript draws the answered card rather than
                // losing the exchange.
                ...(questionResultOf(part)
                  ? { questionResult: questionResultOf(part) }
                  : {}),
              },
            ],
          },
          parent_tool_use_id: null,
          parent_agent_id: null,
          timestamp: new Date(part.state.time.end).toISOString(),
        });
      }
    }
    // A turn that failed keeps its error on the assistant message opencode
    // stored for it. Read back as the result frame the live stream closed that
    // turn with, a reload draws the same failure line instead of a question
    // that was never answered. An abort is the reader's own stop, not a failure.
    const failure = (info as AssistantMessage).error;
    if (failure && failure.name !== "MessageAbortedError") {
      entries.push({
        type: "system",
        uuid: `${info.id}:error`,
        session_id: sessionKey,
        message: {
          type: "result",
          uuid: `${info.id}:error`,
          session_id: sessionKey,
          subtype: "error_during_execution",
          is_error: true,
          errors: [errorText(failure)],
        },
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp,
      });
    }
  }
  return entries;
}

export const opencodeHarness: Harness = new OpencodeHarness();
