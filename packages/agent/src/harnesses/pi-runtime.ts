/** Host-only pi turns. This module is absent from the agent process graph. */

import { readFile } from "node:fs/promises";
import {
  atProviderLimit,
  modelNotEnabled,
  outOfCredit,
  type ProviderRefusal,
  providerErrorOf,
} from "@cawco/core/accounts";
import type { RestartHold } from "@cawco/core/binary-updates";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import type { StartingSet } from "@cawco/core/delegate-types";
import { deniedToolsOn, inStartingSet } from "@cawco/core/delegate-types";
import {
  CONTROL_REFRESH_CAWCO_TOOLS,
  EFFORT_READ,
  type SessionCredentialInstall,
  SPENT_READ,
} from "@cawco/core/harness";
import { type EffortLevel, isEffortLevel } from "@cawco/core/harness/kinds";
import { PI } from "@cawco/core/harness/pi";
import type { HookEvent } from "@cawco/core/hooks";
import { hookToolCall, hookToolInputBack } from "@cawco/core/hooks";
import { isRecord } from "@cawco/core/is-record";
import { piFleetSkillsDir } from "@cawco/core/paths/harnesses";
import type { SpawnPayload } from "@cawco/core/protocol";
import { conversationGone } from "@cawco/core/relaunch";
import type {
  FleetMcpChange,
  FleetMcpTakeAnswer,
} from "@cawco/core/session/controls";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_TOGGLE,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
} from "@cawco/core/session/controls";
import { sessionEnvironment } from "@cawco/core/session-env";
import type {
  ModelTurnUsage,
  SentMessage,
  SlashCommand,
} from "@cawco/core/session-messages";
import { MESSAGES_READ, usageByModel } from "@cawco/core/session-messages";
import { skillsNamed } from "@cawco/core/skill-words";
import { withPastedText } from "@cawco/core/transcript-rules";
import { unhandled } from "@cawco/core/unhandled";
import { pricedRequest } from "@cawco/core/usage/pricing";
import { harnessRefusedWords } from "@cawco/core/words/harness";
import { newTail, saidTail, writeTail } from "@cawco/core/words/helpers";
import {
  judgeCall,
  readPolicy,
  type Verdict,
} from "@cawco/core/workspace-judge";
import type { Usage } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionEvent,
  type BashOperations,
  createAgentSession,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLocalBashOperations,
  createLsToolDefinition,
  createMcpExtension,
  createReadToolDefinition,
  createToolSearchExtension,
  createWriteToolDefinition,
  DefaultResourceLoader,
  defineTool,
  type ExtensionAPI,
  type ExtensionFactory,
  getAgentDir,
  type LoadExtensionsResult,
  type McpServerConfig,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  stripFrontmatter,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Boundary, boundaryCommand } from "../boundary/state";
import {
  callDelegationTool,
  delegationTools,
  openItemsText,
} from "../delegation";
import { configAt, hooksAt, readFleetHarnessSet } from "../fleet-harness-set";
import { type HookPlace, runFleetHooks } from "../fleet-hook-run";
import { fleetMcpAt } from "../fleet-mcp-set";
import { placeSetAt } from "../fleet-place-set";
import type {
  HarnessContext,
  HarnessSession,
  SessionControls,
  TurnExtras,
} from "../harness";
import { cannot } from "../harness";
import type { McpGate } from "../mcp-gate";
import { acknowledgeSessionCredential } from "../session-identity";
import { piCompactsAt } from "./compaction-points";
import { credentialControls } from "./credential-controls";
import { accountRuntime } from "./pi-accounts";
import { piMcpServers } from "./pi-mcp";
import {
  BACKGROUND_SHELL,
  type BackgroundShellEnd,
  compactBoundaryId,
  contentOf,
  LOADED_SKILL,
  modelCatalog,
  piFileUnder,
  piModelValue,
  piSessionPath,
  resolvePiModel,
  textOf,
  toBlocks,
} from "./pi-services";
import { PI_ASKS_NOTHING, piOpenTurns } from "./pi-sessiond";
import { sessionMemory } from "./session-memory";

type BashExec = BashOperations["exec"];

/** How a moved command ended, as its notice says it. */
const shellEnd = (
  taskId: string,
  command: string,
  end: { exitCode: number | null } | { error: unknown }
): BackgroundShellEnd => {
  let how: string;
  let failed: boolean;
  if ("error" in end) {
    failed = true;
    how = end.error instanceof Error ? end.error.message : String(end.error);
  } else {
    failed = end.exitCode !== 0;
    how = `exit code ${end.exitCode ?? "none"}`;
  }
  const status = failed ? "failed" : "completed";
  return {
    taskId,
    status,
    summary: `Background command "${command}" ${status} (${how})`,
  };
};

/** How much of a moved command's output its end reports: its last characters. */
const MOVED_OUTPUT_TAIL = 8000;

/**
 * The session's shell commands, which a send moves to the background. pi has
 * no way to: a send steered into a turn is "Delivered after the current
 * assistant turn finishes executing its tool calls" (agent-session.d.ts
 * `steer`), and its abort kills a running command's whole process tree
 * (tools/bash.js: "Handle abort signal by killing the entire process tree").
 * Each command runs on a signal of its own, which pi's abort reaches until
 * the command is moved: then its call returns at once with what it wrote so
 * far, the command runs on, and its end is said to the session
 * ({@link PiSession}). The session's stop ends the moved ones.
 */
class PiShells {
  /** The commands pi's bash waits on, by task id: each one's move. */
  readonly #foreground = new Map<string, () => void>();
  /** The moved commands still running, by task id. */
  readonly #background = new Map<string, AbortController>();
  /** The moved commands {@link stopAll} ended, until each one's end is said. */
  readonly #stopped = new Set<string>();
  /** Said when a command is moved, and when a moved one ends. */
  report: {
    moved: (taskId: string, command: string) => void;
    /** `stopped`: the session's own interrupt ended it ({@link stopAll}), so its end wakes nothing. */
    ended: (end: BackgroundShellEnd, output: string, stopped: boolean) => void;
  } = {
    moved: () => undefined,
    ended: () => undefined,
  };

  get running(): number {
    return this.#foreground.size;
  }

  /** Moves every command pi's bash waits on to the background; how many. */
  moveAll(): number {
    const moves = [...this.#foreground.values()];
    for (const move of moves) {
      move();
    }
    return moves.length;
  }

  /** Ends the moved commands still running; each one's end is said as stopped. */
  stopAll(): void {
    for (const [taskId, own] of this.#background) {
      this.#stopped.add(taskId);
      own.abort();
    }
  }

  /** `exec` run so a send can move what it runs ({@link moveAll}). */
  exec(exec: BashExec): BashExec {
    return (command, cwd, options) => {
      const taskId = `pi-shell-${crypto.randomUUID().slice(0, 8)}`;
      const own = new AbortController();
      const parent = options.signal;
      let moved = false;
      const tail = newTail();
      const abort = () => own.abort();
      if (parent?.aborted) {
        own.abort();
      }
      parent?.addEventListener("abort", abort, { once: true });
      const running = exec(command, cwd, {
        ...options,
        signal: own.signal,
        onData: (data) => {
          if (moved) {
            writeTail(tail, data.toString(), MOVED_OUTPUT_TAIL);
          } else {
            options.onData(data);
          }
        },
      });
      return new Promise((resolve, reject) => {
        this.#foreground.set(taskId, () => {
          moved = true;
          this.#foreground.delete(taskId);
          this.#background.set(taskId, own);
          parent?.removeEventListener("abort", abort);
          options.onData(
            Buffer.from(
              `\n\nCommand moved to the background (ID: ${taskId}) so that a message that arrived while it was running can reach you; it was not interrupted. Its result is delivered to you automatically when it finishes; carry on without waiting for it.\n`
            )
          );
          this.report.moved(taskId, command);
          resolve({ exitCode: 0 });
        });
        const settled = () => {
          this.#foreground.delete(taskId);
          this.#background.delete(taskId);
          parent?.removeEventListener("abort", abort);
        };
        running.then(
          ({ exitCode }) => {
            settled();
            if (moved) {
              this.report.ended(
                shellEnd(taskId, command, { exitCode }),
                saidTail(tail),
                this.#stopped.delete(taskId)
              );
            } else {
              resolve({ exitCode });
            }
          },
          (error: unknown) => {
            settled();
            if (moved) {
              this.report.ended(
                shellEnd(taskId, command, { error }),
                saidTail(tail),
                this.#stopped.delete(taskId)
              );
            } else {
              reject(error);
            }
          }
        );
      });
    };
  }
}

/**
 * pi's bash, in place of its built-in: every shell gets this host's
 * environment as a session gets it (core `sessionEnvironment`), never the
 * embedded pi's package dir this host runs on or the gateway port it was
 * told. In a workspace, each command runs inside its boundary. Each runs
 * through `shells`, which a send moves to the background.
 */
const sessionBash = (
  cwd: string,
  boundary: Boundary | undefined,
  shells: PiShells
): ToolDefinition => {
  const local = createLocalBashOperations();
  const bash = createBashToolDefinition(cwd, {
    spawnHook: (context) => ({
      ...context,
      env: sessionEnvironment(context.env),
    }),
    operations: {
      exec: shells.exec(
        boundary
          ? (command, dir, options) =>
              local.exec(boundaryCommand(boundary, command), dir, options)
          : local.exec
      ),
    },
  });
  // pi's own way to pass a typed tool where any tool goes ("Use this when
  // assigning a tool to a variable or passing it through arrays such as
  // `customTools`", extensions/types.d.ts `defineTool`).
  return defineTool(bash);
};

/**
 * pi's file tools, each judged by the workspace's policy before it runs: pi
 * runs them in this process, on the host, outside the boundary. A call the
 * policy refuses throws its reason, which pi hands the model as the tool's
 * error; a policy that cannot be read refuses it too. Each replaces the
 * built-in of its name (a custom tool takes a built-in's place in pi's
 * registry, agent-session.js `_refreshToolRegistry`) and leaves which tools
 * are active as it was. The judge runs on the call's own arguments, before
 * pi resolves anything: `find` runs `fd` on the host without its
 * operations, so arguments are the one place all six can be judged.
 */
const boundedFileTools = (
  cwd: string,
  boundary: Boundary
): ToolDefinition[] => {
  const judged = <P extends ToolDefinition["parameters"], D, S>(
    definition: ToolDefinition<P, D, S>
  ) =>
    defineTool<P, D, S>({
      ...definition,
      execute: (id, params, signal, onUpdate, ctx) => {
        let verdict: Verdict;
        try {
          verdict = judgeCall(readPolicy(boundary.policy), {
            harness: "pi",
            tool: definition.name,
            input: params,
            cwd: ctx?.cwd || cwd,
          });
        } catch (error) {
          verdict = {
            ok: false,
            reason: `cawco: ${definition.name} was refused: the workspace's file policy could not be read (${error instanceof Error ? error.message : String(error)}).`,
          };
        }
        if (!verdict.ok) {
          throw new Error(verdict.reason);
        }
        return definition.execute(id, params, signal, onUpdate, ctx);
      },
    });
  return [
    judged(createReadToolDefinition(cwd)),
    judged(createWriteToolDefinition(cwd)),
    judged(createEditToolDefinition(cwd)),
    judged(createLsToolDefinition(cwd)),
    judged(createFindToolDefinition(cwd)),
    judged(createGrepToolDefinition(cwd)),
  ];
};

const piHandoffTools = async (
  instanceId: string,
  credential: { value?: string }
): Promise<ToolDefinition[]> =>
  (await delegationTools(instanceId, "pi")).map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      // pi's own id for the call: the key the hub runs a delegate, a
      // handoff or a page under once (hub call-keys.ts).
      execute: async (id, params) =>
        callDelegationTool(instanceId, tool.name, params, credential.value, id),
    })
  );

/**
 * The session's CawCo tools, registered through pi's own extension API so
 * they can be replaced on the live session: `pi.registerTool` stores a tool
 * by name and refreshes the session's registry (`runtime.refreshTools()`,
 * extensions/loader.js), and pi "appends tool and prompt changes before the
 * next model request" (docs/extensions.md). A tool the hub no longer lists is
 * re-registered hidden, pi's way to withdraw one: "tools cannot be
 * unregistered".
 */
class CawcoTools {
  #api: ExtensionAPI | undefined;
  readonly #registered = new Map<string, ToolDefinition>();
  readonly #instanceId: string;
  readonly #credential: { value?: string };

  constructor(instanceId: string, credential: { value?: string }) {
    this.#instanceId = instanceId;
    this.#credential = credential;
  }

  /**
   * The inline extension: holds pi's API and registers the first list. pi
   * runs it again on each reload of the session's runtime (`AgentSession.reload`,
   * {@link CONTROL_RELOAD_SKILLS}) with a fresh API that holds no tool of
   * CawCo's, so a reload registers the list the session last had.
   */
  extension(first: ToolDefinition[]): ExtensionFactory {
    return (pi) => {
      this.#api = pi;
      const listed =
        this.#registered.size > 0 ? [...this.#registered.values()] : first;
      this.#registered.clear();
      this.#register(listed);
    };
  }

  #register(tools: ToolDefinition[]): void {
    const api = this.#api;
    if (!api) {
      throw new Error("pi has not loaded the CawCo tools extension.");
    }
    const listed = new Set(tools.map((tool) => tool.name));
    for (const tool of tools) {
      api.registerTool(tool);
      this.#registered.set(tool.name, tool);
    }
    for (const [name, tool] of this.#registered) {
      if (!listed.has(name)) {
        api.registerTool({ ...tool, exposure: "hidden" });
        this.#registered.delete(name);
      }
    }
  }

  /** Lists the session's CawCo tools again and replaces them for its next turn. */
  async refresh(): Promise<number> {
    const tools = await piHandoffTools(this.#instanceId, this.#credential);
    this.#register(tools);
    return tools.length;
  }
}

/**
 * pi's MCP extension for one session (`createMcpExtension`, "Connects the
 * servers from `mcp.json` and the servers extensions register with
 * `pi.registerMcpServer()`", pi 1.4.0 extensions/mcp/index.d.ts). With a
 * starting set ({@link SpawnPayload.startingSet}) it connects the set's
 * servers alone, as Claude Code's `strictMcpConfig` does: it reads no
 * `mcp.json` (`loadConfig`, "Defaults to reading `mcp.json` from the agent
 * directory and the trusted project"), since a set names fleet servers, and
 * of the servers extensions register (the fleet's, `FleetMcp`, and any of the
 * person's own pi extensions) it sees only the set's: it reads them through
 * `pi.getMcpServers()` alone, at `session_start` and on every
 * `mcp_servers_change` (index.js `registeredServers`).
 */
const piMcpExtension = (set: StartingSet | undefined): ExtensionFactory => {
  if (!set) {
    return createMcpExtension();
  }
  const mcp = createMcpExtension({
    loadConfig: () => ({ servers: [], errors: [] }),
  });
  return (pi) =>
    mcp(
      // pi's API is a plain object of closures over its extension
      // (extensions/loader.js `createExtensionAPI`), so a copy holds what it holds.
      {
        ...pi,
        getMcpServers: () =>
          pi
            .getMcpServers()
            .filter((server) => set.servers.includes(server.name)),
      }
    );
};

/**
 * The fleet's MCP servers for one session, registered through pi's own
 * extension API (`pi.registerMcpServer`, pi.dev/docs/latest/extensions:
 * "Servers registered while the extension loads connect when the session
 * starts, together with the `mcp.json` servers; servers registered later
 * connect right away, and `pi.unregisterMcpServer()` closes the connection
 * and makes the server's tools unreachable. Registrations are not saved").
 * pi's MCP extension connects them beside the person's own `mcp.json`
 * servers; a server of his under the same name takes precedence.
 */
class FleetMcp {
  #api: ExtensionAPI | undefined;
  /** Each registered server's entry, as registered. */
  readonly #held = new Map<string, string>();
  readonly #cwd: string;
  /** The session's MCP gate, which its servers with a command go through ({@link piMcpServers}). */
  readonly #gate: McpGate;
  /** The servers it started with ({@link SpawnPayload.startingSet}): it takes no fleet server outside them. */
  readonly #set: StartingSet | undefined;

  constructor(cwd: string, gate: McpGate, set: StartingSet | undefined) {
    this.#cwd = cwd;
    this.#gate = gate;
    this.#set = set;
  }

  /** The servers last applied ({@link #apply}): what a reload registers again. */
  #servers: Record<string, McpServerConfig> | undefined;
  /** The fleet's servers switched off in this session ({@link toggle}): registered with `enabled: false`. */
  readonly #off = new Set<string>();

  /** `config` as this session registers it: switched off when {@link toggle} turned it off. */
  #registered(name: string, config: McpServerConfig): McpServerConfig {
    return this.#off.has(name) ? { ...config, enabled: false } : config;
  }

  /**
   * The inline extension: holds pi's API and registers the session's first
   * set. pi runs it again on each reload of the session's runtime
   * (`AgentSession.reload`, {@link CONTROL_RELOAD_SKILLS}) with a fresh API
   * whose registrations are empty ("Registrations are not saved: register
   * again on every load", pi docs/extensions.md), so a reload registers the
   * set last applied anew.
   */
  extension(first: Record<string, McpServerConfig>): ExtensionFactory {
    return (pi) => {
      this.#api = pi;
      this.#held.clear();
      this.#apply(this.#servers ?? first, new Set());
    };
  }

  /**
   * The fleet's servers for this session's folder now ({@link piMcpServers}),
   * held to its starting set, and why any is not taken.
   */
  async read(): Promise<{
    servers: Record<string, McpServerConfig>;
    skipped: Record<string, string>;
  }> {
    return piMcpServers(
      inStartingSet(await fleetMcpAt(this.#cwd), this.#set),
      this.#gate
    );
  }

  /**
   * `servers` registered: a server the set no longer names unregistered, and
   * one new, changed, or in `again` (a sign-in or sign-out at the hub)
   * unregistered when held and registered anew, so pi dials it on the config
   * it has now. Answers what became of each name it touched.
   */
  #apply(
    servers: Record<string, McpServerConfig>,
    again: ReadonlySet<string>
  ): Record<string, string> {
    const api = this.#api;
    if (!api) {
      throw new Error("pi has not loaded the CawCo fleet MCP extension.");
    }
    this.#servers = servers;
    const done: Record<string, string> = {};
    for (const name of this.#held.keys()) {
      if (!(name in servers)) {
        api.unregisterMcpServer(name);
        this.#held.delete(name);
        done[name] = "gone";
      }
    }
    for (const [name, config] of Object.entries(servers)) {
      const entry = JSON.stringify(config);
      if (this.#held.get(name) === entry && !again.has(name)) {
        continue;
      }
      try {
        // Its connection closed first: registering the name again replaces
        // the registration, and a server on a new config or after a sign-in
        // is dialled anew only once its old connection is gone.
        if (this.#held.has(name)) {
          api.unregisterMcpServer(name);
        }
        api.registerMcpServer(name, this.#registered(name, config));
        this.#held.set(name, entry);
        done[name] = "registered";
      } catch (error) {
        done[name] =
          `refused: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return done;
  }

  /**
   * Each of `names` as the session holds it, one it does not hold taken as a
   * sign-in takes it ({@link take}): pi's registrations are all it shows of
   * a server, and its `tool_search` and codemode wait on one connecting.
   */
  async heal(names: readonly string[]): Promise<FleetMcpTakeAnswer> {
    const missing = names.filter((name) => !this.#held.has(name));
    const taken =
      missing.length === 0
        ? []
        : (
            await this.take(
              missing.map((name) => ({ name, kind: "signed-in" }))
            )
          ).servers;
    return {
      servers: names.map(
        (name) =>
          taken.find((server) => server.name === name) ?? {
            name,
            kind: "signed-in",
            status: "kept",
            holds: true,
          }
      ),
    };
  }

  /**
   * One of the fleet's servers switched on or off in this session alone, as
   * pi's own manager switches a registered one ("apply to the current
   * session for registered servers", pi extensions/mcp/index.d.ts):
   * registered again with `enabled` (pi docs/extensions.md: "`config` has
   * the shape of an `mcpServers` entry … plus `exposure`, `toolExposure`,
   * `description`, `enabled`"), on which pi's MCP extension closes it and
   * hides its tools, or connects it. A server this session did not register
   * (one of the person's own `mcp.json`, another extension's) is refused:
   * pi switches those only by writing their file.
   */
  toggle(name: string, enabled: boolean): void {
    const api = this.#api;
    const config = this.#servers?.[name];
    if (!(api && config && this.#held.has(name))) {
      throw new Error(harnessRefusedWords.mcpNotOurs(name));
    }
    if (enabled) {
      this.#off.delete(name);
    } else {
      this.#off.add(name);
    }
    api.unregisterMcpServer(name);
    api.registerMcpServer(name, this.#registered(name, config));
  }

  /** A fleet change taken in place: the set read again and applied ({@link #apply}). */
  async take(changes: readonly FleetMcpChange[]): Promise<FleetMcpTakeAnswer> {
    // A sign-in or sign-out at the hub, and a server switched back on, are
    // dialled anew: pi holds a server switched off on its config as it was,
    // and the hub folds a sign-in that lands with the switch into
    // `enabled` (hub fleet-mcp-changes.ts `merged`), so a held registration
    // that met the sign-in's absence never hears of it otherwise.
    const again = new Set(
      changes.filter(({ kind }) => AGAIN.has(kind)).map(({ name }) => name)
    );
    const { servers, skipped } = await this.read();
    const done = this.#apply(servers, again);
    return {
      servers: changes.map(({ name, kind }) => ({
        name,
        kind,
        status:
          done[name] ??
          (skipped[name] ? `not taken: ${skipped[name]}` : undefined) ??
          (this.#held.has(name) ? "kept" : "not taken"),
        // Registered with pi: its `tool_search` and codemode wait for a
        // server still connecting (pi's mcp extension, index.ts head).
        holds: this.#held.has(name),
      })),
    };
  }
}

/** The changes a held server is dialled anew for ({@link FleetMcp.take}). */
const AGAIN: ReadonlySet<FleetMcpChange["kind"]> = new Set([
  "signed-in",
  "signed-out",
  "enabled",
]);

/** What CawCo's fleet hooks put in a pi session's conversation, by this custom type. */
const FLEET_HOOK_MESSAGE = "cawco-fleet-hook";

/**
 * The custom type of the message that lists a session's open items after a
 * compaction (`PiSession` `#listOpenItems`): it reaches the model as the
 * user's words, and no transcript draws it.
 */
const OPEN_ITEMS_MESSAGE = "cawco-open-items";

/** A tool result's text, for a PostToolUseFailure hook's `error`. */
const resultText = (content: readonly { type: string; text?: string }[]) =>
  content.flatMap((block) => (block.text ? [block.text] : [])).join("\n");

/**
 * The fleet's hooks on pi (core `HOOK_EVENTS_ON.pi`), as an inline
 * extension: the fleet's own and those of the project placed at the
 * session's folder (fleet-harness-set.ts `hooksAt`), read again at each
 * event, so a change reaches a running session. Each command hook runs as
 * Claude Code runs it (fleet-hook-run.ts), in a workspace inside its
 * boundary:
 *
 * - PreToolUse on `tool_call`: a block refuses the call, its reason pi's
 *   error for it ("`tool_call` can mutate input or block execution", pi
 *   docs/extensions.md); what it says goes with the call's result; a
 *   rewrite is taken outside a workspace only;
 * - PostToolUse and PostToolUseFailure on `tool_result`, by its `isError`:
 *   what a hook says (a block's reason, `additionalContext`) is added to the
 *   result the model reads, as Claude Code shows the model a PostToolUse
 *   hook's stderr;
 * - SessionStart on `session_start`, its reason the matcher's value (a
 *   reload of the session's runtime is none): what it says goes with the
 *   session's first prompt;
 * - UserPromptSubmit on `before_agent_start` for a person's prompt: what it
 *   says goes with the prompt; a block ends the run before its first
 *   request ("An abort requested while the run was starting, e.g. during
 *   before_agent_start, stops it", pi 1.3.0 agent-session.js), its reason
 *   shown;
 * - Stop on `agent_end`: a block sends its reason as a message that starts
 *   another turn, whose Stop hooks are told `stop_hook_active`, as Claude
 *   Code tells them.
 */
class FleetHooks {
  readonly #place: HookPlace;
  /** What SessionStart hooks said, for the session's next prompt. */
  readonly #pending: string[] = [];
  /** What PreToolUse hooks said of a call, by its id, for its result. */
  readonly #before = new Map<string, string>();
  /** The turn running now was started by a Stop hook's block. */
  #stopActive = false;

  constructor(place: HookPlace) {
    this.#place = place;
  }

  async #run(
    event: HookEvent,
    match: string | undefined,
    input: Record<string, unknown>,
    context: { sessionManager: { getSessionId: () => string } }
  ) {
    return runFleetHooks(
      "pi",
      hooksAt(await readFleetHarnessSet(), await placeSetAt(this.#place.cwd)),
      event,
      match,
      input,
      { ...this.#place, sessionId: context.sessionManager.getSessionId() }
    );
  }

  extension(): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", async (event, context) => {
        const call = hookToolCall("pi", event.toolName, event.input);
        const verdict = await this.#run(
          "PreToolUse",
          call.name,
          {
            tool_name: call.name,
            tool_input: call.input,
            tool_use_id: event.toolCallId,
          },
          context
        );
        if (verdict.block) {
          return { block: true, reason: verdict.block };
        }
        // Its words go with the call's result, as Claude Code adds a
        // PreToolUse hook's `additionalContext` for the model.
        if (verdict.context) {
          this.#before.set(event.toolCallId, verdict.context);
        }
        // A rewrite, taken outside a workspace only (fleet-hook-run.ts):
        // pi takes a call's new input mutated in place ("To modify
        // arguments, mutate `event.input` in place", types.d.ts).
        if (verdict.updatedInput) {
          const { input } = event;
          for (const key of Object.keys(input)) {
            Reflect.deleteProperty(input, key);
          }
          Object.assign(
            input,
            hookToolInputBack("pi", event.toolName, verdict.updatedInput)
          );
        }
      });
      pi.on("tool_result", async (event, context) => {
        const call = hookToolCall("pi", event.toolName, event.input);
        const verdict = await this.#run(
          event.isError ? "PostToolUseFailure" : "PostToolUse",
          call.name,
          {
            tool_name: call.name,
            tool_input: call.input,
            tool_use_id: event.toolCallId,
            ...(event.isError
              ? { error: resultText(event.content) }
              : { tool_response: event.content }),
          },
          context
        );
        const said = [
          this.#before.get(event.toolCallId),
          verdict.block,
          verdict.context,
        ].filter(Boolean);
        this.#before.delete(event.toolCallId);
        return said.length > 0
          ? {
              content: [
                ...event.content,
                { type: "text" as const, text: said.join("\n") },
              ],
            }
          : undefined;
      });
      pi.on("session_start", async (event, context) => {
        // A reload of the running session's runtime (`#reloadSkills`)
        // starts no session: no Claude Code event matches it.
        if (event.reason === "reload") {
          return;
        }
        const verdict = await this.#run(
          "SessionStart",
          event.reason,
          { source: event.reason },
          context
        );
        if (verdict.context) {
          this.#pending.push(verdict.context);
        }
      });
      pi.on("before_agent_start", async (event, context) => {
        if (event.messageType !== "user") {
          return;
        }
        const verdict = await this.#run(
          "UserPromptSubmit",
          undefined,
          { prompt: event.prompt },
          context
        );
        if (verdict.block) {
          context.abort();
          return {
            message: {
              customType: FLEET_HOOK_MESSAGE,
              content: `A fleet hook refused this prompt: ${verdict.block}`,
              display: true,
            },
          };
        }
        const said = [...this.#pending.splice(0), verdict.context].filter(
          Boolean
        );
        return said.length > 0
          ? {
              message: {
                customType: FLEET_HOOK_MESSAGE,
                content: said.join("\n\n"),
                display: false,
              },
            }
          : undefined;
      });
      pi.on("agent_end", async (_event, context) => {
        const active = this.#stopActive;
        this.#stopActive = false;
        const verdict = await this.#run(
          "Stop",
          undefined,
          { stop_hook_active: active },
          context
        );
        if (verdict.block) {
          this.#stopActive = true;
          pi.sendMessage(
            {
              customType: FLEET_HOOK_MESSAGE,
              content: verdict.block,
              display: true,
            },
            { triggerTurn: true }
          );
        }
      });
    };
  }
}

/**
 * A fenced session's extensions (`SpawnPayload.fence`: a fleet-watch triage
 * run, a memory curator): CawCo's inline ones alone, as Claude Code's and
 * OpenCode's fences give it CawCo's MCP server alone. None of the person's
 * own extensions is the session's, nor a built-in one their settings enable
 * (`builtin:mcp` and its `mcp.json`): pi builds the session's runner from
 * this list (agent-session.js: `new ExtensionRunner(extensionsResult.extensions,
 * …)`), and each extension's tools, handlers and commands are its own
 * (`Extension.tools`, `.handlers`, `.commands`, extensions/types.d.ts). What
 * they registered as model providers stays on the loader's shared runtime
 * (`runtime.pendingProviderRegistrations`, extensions/loader.js), which
 * {@link registerExtensionProviders} puts on the session's model runtime: a
 * pi model may run on one.
 */
const cawcosExtensionsAlone = (
  base: LoadExtensionsResult
): LoadExtensionsResult => ({
  ...base,
  extensions: base.extensions.filter((extension) =>
    extension.path.startsWith("<inline:")
  ),
});

/**
 * A clean session's resources (`SpawnPayload.clean`), beside its fence's
 * extensions ({@link cawcosExtensionsAlone}): no context file (`AGENTS.md`,
 * `CLAUDE.md`, from its folder up and pi's own), no skill and no prompt
 * template of the person's or a package's, and pi's own system prompt, not
 * a `SYSTEM.md` or `APPEND_SYSTEM.md` in its folder or agent dir (pi 1.4.0
 * resource-loader.js `discoverSystemPromptFile`). `noSkills` keeps the
 * loader's added skill paths (`mergePaths(cliEnabledSkills,
 * this.additionalSkillPaths)`), so the session adds none.
 */
const CLEAN_LOADER = {
  noContextFiles: true,
  noSkills: true,
  noPromptTemplates: true,
  systemPromptOverride: () => undefined,
  appendSystemPromptOverride: () => [],
} satisfies Partial<ConstructorParameters<typeof DefaultResourceLoader>[0]>;

/**
 * A session's skills held to its starting set ({@link SpawnPayload.startingSet}):
 * pi's own filter over what it found (`skillsOverride`, applied to every skill
 * the loader loads, resource-loader.js `updateSkillsFromPaths`; "Discover,
 * filter, merge, or replace them", examples/sdk/04-skills.ts), by the name pi
 * lists a skill by. The model reads the skills pi lists in its system prompt
 * (skills.js `formatSkillsForPrompt`), and a brief's skills load from the same
 * list ({@link loadSkills}). No set: every skill it found.
 */
const skillsHeldTo = (
  set: StartingSet | undefined
): Partial<ConstructorParameters<typeof DefaultResourceLoader>[0]> =>
  set
    ? {
        skillsOverride: ({ skills, diagnostics }) => ({
          skills: skills.filter((skill) => set.skills.includes(skill.name)),
          diagnostics,
        }),
      }
    : {};

/**
 * What a session's resource loader reads beside pi's own discovery, and the
 * context files CawCo adds to pi's. pi reads `AGENTS.md` and `CLAUDE.md` up
 * from its folder itself (resource-loader.js `loadContextFileFromDir`,
 * 1.0.1); the fleet's main memory, from CawCo's own file (fleet-memory.ts),
 * the project's memory documents CawCo placed in its folder (fleet.ts
 * `placedMemoryIn`) and its role's, which it launches with, join them as
 * context files (`agentsFilesOverride`, "Discover AGENTS.md files walking up
 * from cwd" and add to them, examples/sdk/07-context-files.ts). The fleet's
 * skills, from CawCo's own dir: pi's `--skill <path>` "Loads a skill file or
 * directory" (docs/cli.md), as `additionalSkillPaths` does, and no `pi` the
 * person starts reads them. The project's skills placed at its folder: pi reads no
 * `.claude/skills` (its place's file, fleet-place-set.ts), and "if a
 * directory contains SKILL.md, treat it as a skill root" (pi 1.3.0
 * skills.js). The fleet's pi extensions and its folder's project's, as the
 * fleet sync made them ready (fleet-harness-config.ts): a module's file, or
 * an installed package's dir, which pi loads as a pi package. A clean
 * session reads none of them, nor pi's own ({@link CLEAN_LOADER}).
 */
const loaderSources = async (
  spec: SpawnPayload,
  cwd: string
): Promise<{
  loader: Partial<ConstructorParameters<typeof DefaultResourceLoader>[0]>;
  memory: { content: string; path: string }[];
}> => {
  if (spec.clean === true) {
    return {
      memory: [],
      loader: {
        ...CLEAN_LOADER,
        additionalSkillPaths: [],
        additionalExtensionPaths: [],
      },
    };
  }
  const set = await readFleetHarnessSet();
  const placed = await placeSetAt(cwd);
  return {
    memory: await sessionMemory(spec, cwd),
    loader: {
      ...skillsHeldTo(spec.startingSet),
      additionalSkillPaths: [
        ...Object.values(placed?.skills ?? {}),
        piFleetSkillsDir(),
      ],
      additionalExtensionPaths: configAt(set, placed, "piExtensions").flatMap(
        (extension) => (extension.entry ? [extension.entry] : [])
      ),
    },
  };
};

/**
 * The HTTP status of the provider's last answer to a session, read off the
 * response itself: {@link fetch} is the fetch every request the session's
 * agent streams is made with (pi-ai `StreamOptions.fetch`, "Defaults to
 * `globalThis.fetch`"). An answer pi refuses passes through it too: pi-ai's
 * OpenAI client throws on a 429 before pi's `onResponse`, so its
 * `after_provider_response` is never heard for one, and its error message
 * keeps the status only in words. An error answer's body is read for the
 * provider's own error code and type too (core `providerErrorOf`): OpenAI's
 * no-credit answer is a 429 that only its code tells from a rate limit, and
 * a model the account may not use is a 403 that only its type tells
 * (`permission_error`) from any other refusal.
 */
class ProviderAnswers {
  #answer: ProviderRefusal = {};

  readonly fetch: typeof globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1]
    ): Promise<Response> => {
      const response = await globalThis.fetch(input, init);
      const body = response.ok
        ? {}
        : providerErrorOf(
            await response
              .clone()
              .text()
              .catch(() => undefined)
          );
      this.#answer = { status: response.status, ...body };
      return response;
    },
    { preconnect: globalThis.fetch.preconnect }
  );

  /**
   * The session's agent makes every request it streams with {@link fetch}:
   * its stream function (pi-agent-core `Agent.streamFunction`, the one each
   * run calls) is handed it in its options.
   */
  watch(agent: AgentSession["agent"]): void {
    const stream = agent.streamFunction;
    agent.streamFunction = (model, context, options) =>
      stream(model, context, { ...options, fetch: this.fetch });
  }

  /** The turn's last answer, its status and error code, cleared for the next turn's. */
  take(): ProviderRefusal {
    const answer = this.#answer;
    this.#answer = {};
    return answer;
  }
}

/** One request's pi-ai `Usage` on `model` (`provider/id`), priced by CawCo at `at` (epoch ms, core `pricedRequest`). */
const priced = (model: string, usage: Usage, at: number): ModelTurnUsage =>
  pricedRequest(
    model,
    {
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      ...(usage.cacheWrite1h === undefined
        ? {}
        : { cacheWrite1h: usage.cacheWrite1h }),
    },
    at
  );

/**
 * What the conversation a session resumes had cost before its host
 * started, in dollars, priced as a live turn prices each request
 * ({@link priced}): every answer, compaction, branch summary and request
 * pi made of its own (`usage`) its session file stored, abandoned branches
 * too, since each was spent. An entry older than the file itself (its
 * header's `timestamp`) was copied in by a fork (`forkFrom`,
 * `createBranchedSession` keep each entry's own time) and is the
 * conversation it came from's spend. A summary names no model: it ran on
 * the one the conversation was on (`AgentSession.compact`: `const model =
 * this.model`), the last answer's before it, else the session's.
 */
const storedCost = (session: AgentSession): number => {
  const manager = session.sessionManager;
  const made = Date.parse(manager.getHeader()?.timestamp ?? "");
  let model = session.model ? piModelValue(session.model) : undefined;
  let cost = 0;
  const add = (
    on: string | undefined,
    usage: Usage | undefined,
    at: string
  ) => {
    if (on && usage && !(Date.parse(at) < made)) {
      cost += priced(on, usage, Date.parse(at)).costUsd ?? 0;
    }
  };
  for (const entry of manager.getEntries()) {
    switch (entry.type) {
      case "message":
        if (entry.message.role === "assistant") {
          model = `${entry.message.provider}/${entry.message.model}`;
          add(model, entry.message.usage, entry.timestamp);
        }
        break;
      case "compaction":
      case "branch_summary":
        add(model, entry.usage, entry.timestamp);
        break;
      case "usage":
        add(`${entry.provider}/${entry.model}`, entry.usage, entry.timestamp);
        break;
      // What spent nothing: no request was made for it.
      case "context_edit":
      case "custom":
      case "custom_message":
      case "label":
      case "model_change":
      case "session_info":
      case "thinking_level_change":
        break;
      default:
        unhandled("pi session entry", entry);
    }
  }
  return cost;
};

/** A send that is pi's `/compact`, with its optional focus text. */
const COMPACT_COMMAND = /^\/compact(?:\s+([\s\S]*))?$/u;

class PiSession implements HarnessSession {
  /** It runs inside its pi host, which the agent reaches through its own session (pi-sessiond.ts). */
  attached(): void {
    // The host's own session needs nothing at an attach.
  }

  readonly endedForMove = cannot(
    "A pi session is never carried between accounts: it keeps no account dir."
  );

  /** It holds no work for later outside a turn: no background task and no one-time wake-up. */
  heldForLater(): RestartHold[] {
    return [];
  }

  /** Nothing it holds for later, so no start of it to say. */
  heldSince(): number | undefined {
    return undefined;
  }

  /** Nothing it holds in its own process beyond a turn the supervisor sees. */
  holding(): string | undefined {
    return undefined;
  }

  /** pi starts no turn of its own between sends, so it never loops into the supervisor's stop. */
  noteStopped(): Promise<void> {
    return Promise.resolve();
  }

  /** Its host is the machine's pi, checked against its floor as it starts. */
  outdated(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  /** It runs inside its host's process, which its remote session names (pi-sessiond.ts). */
  processId(): Promise<number | undefined> {
    return Promise.resolve(undefined);
  }

  /** It keeps no table of its own that grows. */
  tables(): Record<string, number> {
    return {};
  }

  readonly harness = "pi" as const;
  sessionId: string | null = null;
  readonly #ctx: HarnessContext;
  readonly #session: AgentSession;
  readonly #credential: { value?: string };
  readonly #tools: CawcoTools;
  /** The fleet's MCP servers it holds, taken again at each fleet change; none for a fenced session. */
  readonly #fleetMcp: FleetMcp | undefined;
  /** The status of each answer its provider gave. */
  readonly #answers = new ProviderAnswers();
  /** The runtime the session runs on: its account's, or the machine's own. */
  readonly #runtime: ModelRuntime;
  /** Its shell commands, which a send moves to the background. */
  readonly #shells: PiShells;
  readonly #unread: string[] = [];
  /** The last send handed to pi, its skills first: the next send waits for it ({@link send}). */
  #handed: Promise<void> = Promise.resolve();
  #reading: string | undefined;
  /** What the turn's requests spent so far: its answers' and any compaction's. */
  #turnUsage: ModelTurnUsage[] = [];
  /**
   * What the conversation's requests before the turn now ending cost, in
   * dollars ({@link #costSoFar}): from its start, what its session file
   * stored before this host ({@link storedCost}), then each turn this host
   * ran.
   */
  #costBase: number;

  /**
   * What the conversation has cost, the turn now ending included: each
   * request priced by CawCo as it ran ({@link #spent}, core
   * `pricedRequest`), the price the turn's `turnUsage` carries to the hub's
   * records, summed as OpenCode's session sums it (`total_cost_usd`). pi's
   * own `usage.cost` is not read: the hub's one price is the truth, and the
   * total is only the transcript's cost fact, which each result overwrites
   * (core transcript-rules.ts: "`total_cost_usd` is cumulative, so the
   * session overwrites rather than accumulates"), never added to a record.
   * An unpriced model's spend is unknown, so it adds nothing.
   */
  #costSoFar(turnUsage: readonly ModelTurnUsage[]): number {
    this.#costBase += turnUsage.reduce(
      (sum, usage) => sum + (usage.costUsd ?? 0),
      0
    );
    return this.#costBase;
  }

  /**
   * The effort the person chose for the session: its spawn's, then each
   * set-effort's. A model switch puts the session back on it, as far as the
   * new model goes ({@link CONTROL_SET_MODEL}).
   */
  #effort: EffortLevel | undefined;

  /**
   * Says the effort the session sends on its next request ({@link
   * EFFORT_READ}), read back from pi rather than remembered from an ask: its
   * thinking level now, which pi holds within what the session's model
   * takes (agent-session.js `setThinkingLevel`: "Clamps to model
   * capabilities"). pi's `off` is no effort sent. Its `minimal`, which only
   * the person's own pi settings put a session on (CawCo offers no level of
   * that name, `piEffortLevels`), is no CawCo level: it is said nowhere, and
   * the session's chip reads not yet known.
   */
  #sayEffort(): void {
    const level: string = this.#session.thinkingLevel;
    if (level !== "off" && !isEffortLevel(level)) {
      console.warn(
        `[pi] ${this.#ctx.instanceId}: pi runs it at thinking level ${level}, which is no CawCo effort level`
      );
      return;
    }
    this.#ctx.frame({
      type: "system",
      subtype: EFFORT_READ,
      effort: level === "off" ? null : level,
    });
  }

  /**
   * The session put on effort `level`, refused when its model has no such
   * level in pi (`getAvailableThinkingLevels`): pi would otherwise run the
   * nearest it has without a word. Said back as pi then holds it.
   */
  #setEffort(level: EffortLevel): void {
    const offered: string[] = this.#session.getAvailableThinkingLevels();
    if (!offered.includes(level)) {
      throw new Error(
        harnessRefusedWords.effortNotOffered(
          "pi",
          this.#session.model ? piModelValue(this.#session.model) : "its model",
          level,
          offered.filter(isEffortLevel)
        )
      );
    }
    this.#effort = level;
    this.#session.setThinkingLevel(level);
    this.#sayEffort();
  }

  /** One request's pi-ai `Usage` on `model` (`provider/id`), priced at `at` (epoch ms). */
  #spent(model: string, usage: Usage | undefined, at: number): void {
    if (usage) {
      this.#turnUsage.push(priced(model, usage, at));
    }
  }

  #leaf(): { uuid: string; timestamp: string } {
    const entry = this.#session.sessionManager.getLeafEntry();
    if (!entry) {
      throw new Error("The pi session has stored no entry yet.");
    }
    return { uuid: entry.id, timestamp: entry.timestamp };
  }

  /**
   * The tokens the session's last answered request sent: its last assistant
   * message's usage, whose `input` pi-ai reports without the cached tokens
   * (api/openai-completions.js 1175), so they are added back. A request that
   * failed reports none and is passed over.
   */
  #contextTokens(): number | undefined {
    for (const message of [...this.#session.messages].reverse()) {
      if (message.role === "assistant") {
        const { usage } = message;
        const sent = usage.input + usage.cacheRead + usage.cacheWrite;
        if (sent > 0) {
          return sent;
        }
      }
    }
    return undefined;
  }

  /**
   * Where pi compacts the session on its own: its model's window less the
   * reserve of the session's own compaction setting, as pi reads it
   * (`_exceedsCompactionThreshold`: `this.settingsManager
   * .getCompactionSettings(this.model)`); none with compaction off.
   */
  #compactsAt(): { compactsAt?: number } {
    const { model, settingsManager } = this.#session;
    const at = piCompactsAt(
      model?.contextWindow,
      settingsManager.getCompactionSettings(model)
    );
    return at === undefined ? {} : { compactsAt: at };
  }

  #setBusy(active: boolean): void {
    this.#ctx.busy(active);
    if (active) {
      piOpenTurns.add(this.#session.sessionId);
    } else {
      piOpenTurns.delete(this.#session.sessionId);
    }
  }

  constructor(
    ctx: HarnessContext,
    session: AgentSession,
    credential: { value?: string },
    tools: CawcoTools,
    runtime: ModelRuntime,
    shells: PiShells,
    fleetMcp: FleetMcp | undefined,
    effort: EffortLevel | undefined
  ) {
    this.#costBase = storedCost(session);
    this.#ctx = ctx;
    this.#effort = effort;
    this.#session = session;
    this.#credential = credential;
    this.#tools = tools;
    this.#fleetMcp = fleetMcp;
    this.#runtime = runtime;
    this.#shells = shells;
    shells.report = {
      moved: (taskId, command) =>
        ctx.frame({
          type: "system",
          subtype: "task_started",
          session_id: session.sessionId,
          task_id: taskId,
          description: command,
        }),
      ended: (end, output, stopped) => this.#shellEnded(end, output, stopped),
    };
    this.sessionId = session.sessionId;
    this.#answers.watch(session.agent);
    session.subscribe((event) => this.#handle(event));
    ctx.session(session.sessionId);
    ctx.frame({
      type: "system",
      subtype: "init",
      session_id: session.sessionId,
      cwd: ctx.cwd,
      ...(session.model ? { model: piModelValue(session.model) } : {}),
    });
    this.#sayEffort();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: translates each pi event shape once into the neutral stream
  #handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "message_start": {
        const read =
          event.message.role === "user" ? this.#unread.shift() : undefined;
        if (read) {
          this.#reading = read;
        }
        break;
      }
      case "message_end": {
        const { message } = event;
        const sent = this.#reading;
        if (sent && message.role === "user") {
          this.#reading = undefined;
          // pi appends after notifying listeners, in the same synchronous run.
          queueMicrotask(() =>
            this.#ctx.frame({
              type: "system",
              subtype: MESSAGES_READ,
              read: [sent],
              storedAs: {
                [sent]: this.#leaf().uuid,
              },
              session_id: this.sessionId ?? undefined,
            })
          );
        }
        if (message.role === "assistant") {
          this.#spent(
            `${message.provider}/${message.model}`,
            message.usage,
            message.timestamp
          );
          queueMicrotask(() => {
            const blocks = toBlocks(message.content);
            if (blocks.length) {
              this.#ctx.frame({
                type: "assistant",
                ...this.#leaf(),
                message: { content: blocks },
              });
            }
          });
        }
        break;
      }
      case "message_update": {
        const ae = event.assistantMessageEvent;
        if (ae.type === "text_delta") {
          this.#ctx.frame({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: ae.delta },
            },
          });
          this.#setBusy(true);
        }
        break;
      }
      // A compaction that stored a summary: its boundary, with what triggered
      // it and how full the context was, then the summary itself — under the
      // ids a stored read gives them (pi-services). pi appends the compaction
      // entry before it notifies, so the leaf is that entry. One that was
      // aborted or failed carries no result and stored nothing.
      case "compaction_end": {
        if (!event.result) {
          break;
        }
        // pi summarizes with the session's model (`const model = this.model`
        // in AgentSession.compact and its auto-compaction).
        const leaf = this.#leaf();
        if (this.#session.model) {
          this.#spent(
            piModelValue(this.#session.model),
            event.result.usage,
            Date.parse(leaf.timestamp)
          );
        }
        this.#ctx.frame({
          type: "system",
          subtype: "compact_boundary",
          uuid: compactBoundaryId(leaf.uuid),
          timestamp: leaf.timestamp,
          session_id: this.sessionId ?? undefined,
          compact_metadata: {
            trigger: event.reason === "manual" ? "manual" : "auto",
            pre_tokens: event.result.tokensBefore,
          },
        });
        this.#ctx.frame({
          type: "user",
          ...leaf,
          compactSummary: true,
          message: { role: "user", content: event.result.summary },
        });
        this.#listOpenItems();
        break;
      }
      case "tool_execution_end": {
        const { toolCallId, isError } = event;
        // pi-agent-core types a tool's result `any` (types.d.ts AgentEvent
        // `tool_execution_end`): read as what it may be.
        const result: unknown = event.result;
        const content = isRecord(result) ? contentOf(result.content) : "";
        const details = isRecord(result) ? result.details : undefined;
        const structuredContent =
          isRecord(details) && Object.keys(details).length > 0
            ? details
            : undefined;
        this.#ctx.frame({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolCallId,
                content,
                is_error: isError,
                ...(structuredContent ? { structuredContent } : {}),
              },
            ],
          },
        });
        break;
      }
      case "agent_end": {
        if (event.willRetry) {
          break;
        }
        this.#setBusy(false);
        const errors = event.messages.flatMap((message) =>
          message.role === "assistant" && message.errorMessage
            ? [message.errorMessage]
            : []
        );
        const failed = errors.length > 0;
        // A failed turn whose last answer was a 402, or a 429 that names no
        // credit, ended for want of credit or on its account's limit (core
        // `outOfCredit`, `atProviderLimit`); a 403 `permission_error`, on
        // a model the account may not use (core `modelNotEnabled`),
        // whatever its error's words say.
        const answer = this.#answers.take();
        const leaf = this.#leaf();
        const context = this.#contextTokens();
        const turnUsage = usageByModel(this.#turnUsage);
        this.#turnUsage = [];
        this.#ctx.frame({
          type: "result",
          uuid: leaf.uuid,
          timestamp: leaf.timestamp,
          subtype: failed ? "error_during_execution" : "success",
          is_error: failed,
          turnUsage,
          total_cost_usd: this.#costSoFar(turnUsage),
          ...(failed ? { errors } : {}),
          ...(failed && atProviderLimit(answer) ? { atLimit: true } : {}),
          ...(failed && outOfCredit(answer) ? { outOfCredit: true } : {}),
          ...(failed && modelNotEnabled(answer) ? { modelRefused: true } : {}),
          ...(context === undefined ? {} : { contextTokens: context }),
          ...this.#compactsAt(),
        });
        this.#sayEffort();
        break;
      }
      // A request pi made of its own, which no answer of the session's
      // carries: its prompt cache kept warm (cache-warmer.js
      // `appendUsage("cache_warm", …)`, on by default: `cacheWarming:
      // "idle"`, "Global only because each refresh costs money"). One made
      // while a turn runs goes with its result, as a compaction's does; one
      // made between turns ("idle … for up to 30 minutes between runs", pi
      // docs/settings.md) is said as it is spent ({@link SPENT_READ}).
      case "entry_appended": {
        const { entry } = event;
        if (entry.type !== "usage") {
          break;
        }
        const model = `${entry.provider}/${entry.model}`;
        const at = Date.parse(entry.timestamp);
        // A turn runs ({@link #setBusy}): it goes with the turn's result.
        if (piOpenTurns.has(this.#session.sessionId)) {
          this.#spent(model, entry.usage, at);
          break;
        }
        const spent = priced(model, entry.usage, at);
        this.#costBase += spent.costUsd ?? 0;
        this.#ctx.frame({
          type: "system",
          subtype: SPENT_READ,
          uuid: entry.id,
          timestamp: entry.timestamp,
          session_id: this.sessionId ?? undefined,
          spent: [spent],
        });
        break;
      }
      // Its effort moved (a set-effort, a model switch, pi's own clamp): said
      // as pi now holds it.
      case "thinking_level_changed":
        this.#sayEffort();
        break;
      case "agent_settled":
      case "agent_start":
      case "auto_retry_end":
      case "auto_retry_start":
      case "bash_execution_update":
      case "compaction_start":
      case "queue_update":
      case "session_info_changed":
      case "summarization_retry_attempt_start":
      case "summarization_retry_finished":
      case "summarization_retry_scheduled":
      case "tool_execution_start":
      case "tool_execution_update":
      case "turn_end":
      case "turn_start":
        break;
    }
  }

  /**
   * The session's open items, word for word (the `open_items` tool, hub
   * open-items.ts), listed after a compaction whoever asked for it, as
   * Claude Code's SessionStart hook on `compact` lists them: a message that
   * starts no turn (pi 1.4.0 `sendCustomMessage`: "Not streaming + no
   * trigger: appends to state/session, no turn"). One that ends mid-run, at
   * pi's threshold before its next request, joins once the turn's tool
   * results are in ("Streaming + triggerTurn false: appended to
   * state/session once the current turn ends"), before that request is
   * sent.
   */
  #listOpenItems(): void {
    openItemsText(this.#ctx.instanceId, this.#credential.value)
      .then((text) =>
        this.#session.sendCustomMessage(
          { customType: OPEN_ITEMS_MESSAGE, content: text, display: false },
          { triggerTurn: false }
        )
      )
      .catch((error: unknown) =>
        console.warn(
          `[pi] ${this.#ctx.instanceId}: its open items could not be listed after its compaction: ${error instanceof Error ? error.message : String(error)}`
        )
      );
  }

  /**
   * `/compact [focus]`: pi's own compaction (`AgentSession.compact`, the
   * entry point its TUI's `/compact` calls, interactive-mode.js 2608-2611),
   * never a prompt. It runs once the turn under way has ended, since pi's
   * compact aborts whatever runs. pi stores no user message for it, so the
   * send is said read here; its `compaction_end` gives the boundary and the
   * summary ({@link #handle}), and a result closes it with what the summary
   * cost and the context it leaves.
   */
  async #compact(uuid: string, focus: string | undefined): Promise<void> {
    await this.#session.waitForIdle();
    this.#setBusy(true);
    this.#ctx.frame({
      type: "system",
      subtype: MESSAGES_READ,
      read: [uuid],
      session_id: this.sessionId ?? undefined,
    });
    try {
      const done = await this.#session.compact(focus);
      const leaf = this.#leaf();
      const turnUsage = usageByModel(this.#turnUsage);
      this.#turnUsage = [];
      this.#setBusy(false);
      this.#ctx.frame({
        type: "result",
        uuid: leaf.uuid,
        timestamp: leaf.timestamp,
        subtype: "success",
        is_error: false,
        turnUsage,
        total_cost_usd: this.#costSoFar(turnUsage),
        ...(done.estimatedTokensAfter === undefined
          ? {}
          : { contextTokens: done.estimatedTokensAfter }),
        ...this.#compactsAt(),
      });
    } catch (error) {
      this.#turnUsage = [];
      this.#setBusy(false);
      this.#ctx.rejected(uuid, error);
    }
  }

  send(message: SentMessage, extras: TurnExtras): void {
    const text = textOf(message.message.content);
    const compact = COMPACT_COMMAND.exec(text.trim());
    if (compact) {
      this.#compact(message.uuid, compact[1]?.trim() || undefined).catch(
        (error: unknown) => this.#refused(message.uuid, error)
      );
      return;
    }
    const images = (extras.images ?? []).map((image) => ({
      type: "image" as const,
      data: image.data,
      mimeType: image.mediaType,
    }));
    // Each skill it names loads first, as pi's own `/skill:name` would load
    // it ({@link loadSkills}); pi runs none of a `/name` itself, its opening
    // one included. Every send waits for the one before it to be handed to
    // pi, so a send's skills never land after a later send's words.
    const { skills } = this.#session.resourceLoader.getSkills();
    const named = skillsNamed(
      text,
      skills.map((skill) => skill.name)
    ).map((skill) => skill.name);
    this.#unread.push(message.uuid);
    this.#setBusy(true);
    const handed = this.#handed.then(async () => {
      await loadSkills(this.#session, named, this.#ctx.cwd);
      this.#prompt(
        message.uuid,
        withPastedText(text, extras.attachments ?? []),
        images
      );
    });
    this.#handed = handed.catch(() => undefined);
    handed.catch((error: unknown) => this.#refused(message.uuid, error));
  }

  /** The words of send `uuid` to pi: a turn at rest, steered into a running one. */
  #prompt(
    uuid: string,
    text: string,
    images: { type: "image"; data: string; mimeType: string }[]
  ): void {
    const streaming = this.#session.isStreaming;
    this.#session
      .prompt(text, {
        images,
        ...(streaming ? { streamingBehavior: "steer" as const } : {}),
      })
      .then(() => {
        // Any send — the person's, a hand-off, a report, a
        // rule's reply — is steered into a running turn, which reads it once
        // its tool calls end. Once it is queued (pi's `prompt` returns from
        // `_queueSteer` while streaming), the shell commands the turn waits
        // on are moved to the background: it reads the send now, and they
        // run on.
        if (streaming) {
          this.#moveShells();
        }
      })
      .catch((error: unknown) => this.#refused(uuid, error));
  }

  #moveShells(): void {
    const moved = this.#shells.moveAll();
    if (moved > 0) {
      console.info(
        `[pi] ${this.#ctx.instanceId}: a send moved ${moved} running shell command(s) to the background`
      );
    }
  }

  /**
   * A moved shell command ended: said to the model as a notice of its own
   * ({@link BACKGROUND_SHELL}), which pi hands the model as a user message
   * (messages.js `case "custom"`), at the running turn's next boundary or as
   * a turn of its own; and to the transcript as its `task_notification` row,
   * the one a stored read gives it (pi-services). One the session's own
   * interrupt `stopped` starts no turn: the model reads it with its next one
   * (pi's `deliverAs: "nextTurn"`), and an interrupted session stays idle.
   */
  #shellEnded(end: BackgroundShellEnd, output: string, stopped: boolean): void {
    this.#ctx.frame({
      type: "system",
      subtype: "task_notification",
      session_id: this.sessionId ?? undefined,
      task_id: end.taskId,
      status: end.status,
      summary: end.summary,
    });
    this.#session
      .sendCustomMessage<BackgroundShellEnd>(
        {
          customType: BACKGROUND_SHELL,
          content: `${end.summary}.${output ? `\nIts last output:\n${output}` : ""}`,
          display: true,
          details: end,
        },
        stopped
          ? { deliverAs: "nextTurn" }
          : { triggerTurn: true, deliverAs: "steer" }
      )
      .catch((error: unknown) =>
        console.warn(
          `[pi] ${this.#ctx.instanceId}: telling the session background command ${end.taskId} ended failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
  }

  #refused(uuid: string, error: unknown): void {
    const at = this.#unread.indexOf(uuid);
    if (at >= 0) {
      this.#unread.splice(at, 1);
    }
    if (!this.#session.isStreaming) {
      this.#setBusy(false);
    }
    this.#ctx.rejected(uuid, error);
  }

  /** The credential the hub granted this session, installed: its tools and its shells act as it. */
  async #installCredential(
    credential: string
  ): Promise<SessionCredentialInstall> {
    await this.#session.waitForIdle();
    this.#credential.value = credential;
    // This host runs one session: its shells act as that session.
    process.env[CAWCO_ENV.sessionCredential] = credential;
    // The ACK is authenticated by the credential itself (the hub refuses
    // one it does not know), and the hub minted it in this session's own
    // spawn: the proof its tools will be taken as this session. No
    // `list_sessions` first: it read the whole fleet twice inside the hub
    // under 5 s timeouts, and a machine restoring twenty sessions at once
    // timed its own gates out (2026-10-09).
    await acknowledgeSessionCredential(credential);
    return {
      installed: true,
      harness: "pi",
      instanceId: this.#ctx.instanceId,
    };
  }

  /**
   * The host outlived the agent that started it and still holds the
   * credential its tools send. The ACK is authenticated by it, so one the
   * hub no longer knows is refused, as is a host that holds none.
   */
  async #verifyCredential(): Promise<undefined> {
    if (!this.#credential.value) {
      throw new Error("This pi host holds no CawCo session credential.");
    }
    await acknowledgeSessionCredential(this.#credential.value);
    return undefined;
  }

  /**
   * Its controls (core traits.ts `sessionControls`), with the session
   * credential's install and verify ({@link credentialControls}).
   */
  readonly controls: SessionControls<"pi"> = {
    ...credentialControls(
      (credential) => this.#installCredential(credential),
      () => this.#verifyCredential()
    ),
    [CONTROL_REFRESH_CAWCO_TOOLS]: async () => {
      const count = await this.#tools.refresh();
      console.error(`[pi] cawco tools refreshed: ${count} listed`);
      return { listed: count };
    },
    [CONTROL_MCP_FLEET_CHANGED]: async (changes) =>
      // A fenced session takes no MCP server ({@link cawcosExtensionsAlone}).
      this.#fleetMcp
        ? await this.#fleetMcp.take(changes)
        : {
            servers: changes.map(({ name, kind }) => ({
              name,
              kind,
              status: "not taken: the session is fenced",
              holds: false,
            })),
          },
    // Named by the hub for a connect ask.
    [CONTROL_MCP_FLEET_HEAL]: async (asked) => {
      const names = asked ?? [];
      return this.#fleetMcp
        ? await this.#fleetMcp.heal(names)
        : {
            servers: names.map((name) => ({
              name,
              kind: "signed-in",
              status: "not taken: the session is fenced",
              holds: false,
            })),
          };
    },
    [CONTROL_INTERRUPT]: () => this.interrupt(),
    // A model switch keeps the session's chosen effort as far as the new
    // model goes, as Claude Code's does: pi's own switch puts it on the
    // person's pi settings default instead (`_getThinkingLevelForModelSwitch`),
    // so the chosen one is asked again, which pi holds within the model's
    // levels and the read-back says.
    [CONTROL_SET_MODEL]: async (model) => {
      await this.#session.setModel(await resolvePiModel(this.#runtime, model));
      if (this.#effort) {
        this.#session.setThinkingLevel(this.#effort);
      }
      this.#sayEffort();
    },
    // Refused, never another level put in its place, when the model has
    // none of that name ({@link #setEffort}).
    [CONTROL_SET_EFFORT]: (effort) =>
      new Promise<void>((resolve) => {
        this.#setEffort(effort);
        resolve();
      }),
    [CONTROL_SUPPORTED_MODELS]: () => modelCatalog(this.#runtime),
    // pi has no slash commands.
    [CONTROL_SUPPORTED_COMMANDS]: () => Promise.resolve([]),
    [CONTROL_RELOAD_SKILLS]: () => this.#reloadSkills(),
    [CONTROL_MCP_RECONNECT]: (name) => this.#reconnectMcp(name),
    // The fleet's servers, which CawCo registered for the session; a fenced
    // session runs none ({@link cawcosExtensionsAlone}).
    [CONTROL_MCP_TOGGLE]: (name, enabled) =>
      new Promise<void>((resolve) => {
        if (!this.#fleetMcp) {
          throw new Error(
            harnessRefusedWords.noMcp(
              "pi",
              `${name} wasn't switched ${enabled ? "on" : "off"}`
            )
          );
        }
        this.#fleetMcp.toggle(name, enabled);
        resolve();
      }),
    [CONTROL_CONTEXT_USAGE]: () => {
      // The last message that carries a usage: an answer's, or a tool
      // result's own (pi-ai types.d.ts `ToolResultMessage.usage`).
      const [total = 0] = [...this.#session.messages]
        .reverse()
        .flatMap((m) => ("usage" in m && m.usage ? [m.usage.totalTokens] : []));
      // The model's window in pi-ai's catalog is what a request may send:
      // its input limit where that is below the context (gpt-5.5: 272000,
      // providers/data/openai.json).
      const window = this.#session.model?.contextWindow;
      if (!window) {
        return Promise.reject(
          new Error("The pi session has no model, so it has no context window.")
        );
      }
      return Promise.resolve({
        totalTokens: total,
        maxTokens: window,
        percentage: Math.min(100, Math.round((total / window) * 100)),
        categories: [],
      });
    },
  };
  /**
   * The folder's skills read again in the running session, by pi's own
   * reload (`AgentSession.reload`, what its `/reload` runs: "Run `/reload`
   * after editing a skill during an active session", pi docs/skills.md),
   * once the turn under way has ended, since pi refuses a reload while one
   * streams. pi's reload is its whole runtime's: it reads its settings,
   * context files and extensions again too, and its MCP extension
   * reconnects its servers on the `session_start` that follows. Answers the
   * skills pi lists now, each as the `/` menu's skill.
   */
  async #reloadSkills(): Promise<{ skills: SlashCommand[] }> {
    await this.#session.waitForIdle();
    await this.#session.reload();
    return {
      skills: this.#session.resourceLoader.getSkills().skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        argumentHint: "",
        kind: "skill" as const,
      })),
    };
  }

  /**
   * One MCP server reconnected by pi's own `/mcp reconnect <server>` (pi's
   * MCP extension, extensions/mcp/index.js: "/mcp reconnect [server]"), any
   * server its MCP extension holds, the fleet's and the person's own alike.
   * The command's handler is run as `session.prompt` runs an extension's
   * command (`_tryExecuteExtensionCommand`: the command found by name and
   * handed the runner's command context), never through `prompt` itself,
   * which sends a text no command takes to the model as a message. What
   * the command says is read off its context's `ui.notify`, which in a
   * session with no screen goes nowhere: an error or a warning (no such
   * server, a disabled one, a reconnect that failed, a misread argument) is
   * the call's failure in pi's own words, and its "Reconnected to MCP
   * server" is its success.
   */
  async #reconnectMcp(name: string): Promise<void> {
    const runner = this.#session.extensionRunner;
    const command = runner.getCommand("mcp");
    if (!command) {
      throw new Error(
        harnessRefusedWords.noMcp("pi", `${name} wasn't reconnected`)
      );
    }
    const said: { message: string; type: string }[] = [];
    const context = runner.createCommandContext();
    const { ui } = context;
    Object.defineProperty(context, "ui", {
      value: {
        ...ui,
        notify: (message: string, type = "info") => {
          said.push({ message, type });
        },
      } satisfies typeof ui,
    });
    await command.handler(`reconnect ${name}`, context);
    const failed = said.find((one) => one.type !== "info");
    if (failed || said.length === 0) {
      throw new Error(
        failed?.message ?? `pi said nothing of reconnecting ${name}.`
      );
    }
  }

  /** pi has no permission modes and no question tool, and puts no call to the hub: there is no ask to answer. */
  resolvePermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
  withdrawPermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
  /**
   * Cuts the turn and ends the commands it moved to the background, each
   * end said for the next turn and waking none ({@link PiShells.stopAll}):
   * the agent ends what they left in the workspace (session.ts `#endWork`),
   * and the interrupted session stays idle.
   */
  async interrupt(): Promise<void> {
    this.#shells.stopAll();
    await this.#session.abort();
  }
  async stop(): Promise<void> {
    this.#shells.stopAll();
    await this.#session.abort().catch(() => {
      /* teardown continues */
    });
    await this.#session.waitForIdle().catch(() => {
      /* teardown continues */
    });
    piOpenTurns.delete(this.#session.sessionId);
  }
  dispose(): Promise<void> {
    piOpenTurns.delete(this.#session.sessionId);
    this.#session.dispose();
    return Promise.resolve();
  }
}

/**
 * The providers the session's extensions register, put on its runtime before
 * its model is chosen, as pi's own services do
 * (core/agent-session-services.js 69-97): a session's own runner registers
 * them only once the session exists, after pi has picked its model.
 */
const registerExtensionProviders = (
  runtime: ModelRuntime,
  loader: DefaultResourceLoader
): void => {
  const { runtime: extensions } = loader.getExtensions();
  for (const {
    name,
    config,
    extensionPath,
  } of extensions.pendingProviderRegistrations) {
    try {
      runtime.registerProvider(name, config);
    } catch (error) {
      console.error(
        `[pi] extension ${extensionPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  extensions.pendingProviderRegistrations = [];
  for (const {
    provider,
    extensionPath,
  } of extensions.pendingNativeProviderRegistrations) {
    try {
      runtime.registerNativeProvider(provider);
    } catch (error) {
      console.error(
        `[pi] extension ${extensionPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  extensions.pendingNativeProviderRegistrations = [];
};

/**
 * Skills put in a session's context, each in the block pi's own
 * `/skill:name` expands to (`_expandSkillCommand`), which expands only at
 * the start of one prompt: a launch's before its first prompt, and those a
 * send names before its words ({@link PiSession.send}). A custom message
 * with no `triggerTurn` is appended at rest, read with the words that follow
 * it in one request, and steered into a running turn (agent-session.js
 * `sendCustomMessage`), which reads one steered message a step, each skill
 * a step ahead of the words (pi's default `steeringMode`,
 * `one-at-a-time`); pi hands the model each as a user message (messages.js
 * `case "custom"`). An unknown name is refused as OpenCode's is.
 */
const loadSkills = async (
  session: AgentSession,
  names: readonly string[],
  cwd: string
): Promise<void> => {
  const { skills } = session.resourceLoader.getSkills();
  for (const name of names) {
    const skill = skills.find((one) => one.name === name);
    if (!skill) {
      throw new Error(`pi has no skill “${name}” at ${cwd}.`);
    }
    const body = stripFrontmatter(
      await readFile(skill.filePath, "utf8")
    ).trim();
    await session.sendCustomMessage({
      customType: LOADED_SKILL,
      content: `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`,
      display: false,
    });
  }
};

/**
 * The effort a launch asks for (the hub's: a first spawn's, else the one
 * chosen for the session, which every wake, restore, move and relaunch asks
 * for), put on the session as its thinking level. With none, pi's own pick
 * stands: the level a resumed conversation was left on, else the person's
 * pi settings (sdk.js `createAgentSession`). A level the model lacks (one
 * chosen on another model) is held by pi within the model's levels, as
 * Claude Code holds it, and the session's first effort reading says the
 * level it runs at ({@link PiSession}), which the session's chip shows.
 */
const launchEffort = (
  session: AgentSession,
  effort: EffortLevel | undefined
): void => {
  if (effort) {
    session.setThinkingLevel(effort);
  }
};

/**
 * The custom type of the entry a rewind leaves at the message it resumes at
 * ({@link sessionManagerFor}): pi keeps it out of the model's context
 * (session-format.md: "`custom` … not in LLM context"), and no transcript
 * draws it.
 */
const REWOUND = "cawco-rewind";

/**
 * The session's store: the one it resumes or forks, else a new one. A
 * resume at a message (`resume.atMessage`, a rewind: the entry of the answer
 * before the turn said again, core traits `rewindAnchor`) moves pi's leaf
 * there, as pi's own `/tree` does (`SessionManager.branch`), and writes a
 * {@link REWOUND} entry under it: pi reads a session file's last entry as
 * its leaf, so without one a restart before the next message would resume
 * the abandoned branch, and every read of the file would show it. A fork
 * at a message is pi's branched session (`createBranchedSession`: a new
 * session file holding only the path to that entry). pi restores no file a
 * rewound turn changed.
 */
const sessionManagerFor = async (
  spec: SpawnPayload,
  cwd: string
): Promise<SessionManager> => {
  if (!spec.resume) {
    return SessionManager.create(cwd);
  }
  const { sessionKey, fork, atMessage } = spec.resume;
  // A conversation goes on filed under the folder it runs in now; a fork
  // reads its origin's where it is.
  const source = fork
    ? await piSessionPath(sessionKey, cwd)
    : await piFileUnder(sessionKey, cwd);
  // Its session file is gone: the conversation is, as a Claude Code
  // transcript or an OpenCode session can be (core relaunch.ts).
  if (!source) {
    throw conversationGone();
  }
  if (fork && !atMessage) {
    return SessionManager.forkFrom(source, cwd);
  }
  const manager = SessionManager.open(source, undefined, cwd);
  if (!atMessage) {
    return manager;
  }
  if (!manager.getEntry(atMessage)) {
    throw new Error(
      `pi's conversation ${sessionKey} has no entry ${atMessage} to go back to.`
    );
  }
  if (fork) {
    manager.createBranchedSession(atMessage);
    return manager;
  }
  const from = manager.getLeafId();
  manager.branch(atMessage);
  manager.appendCustomEntry(REWOUND, { from });
  return manager;
};

export async function startPiHost(
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<HarnessSession> {
  // A session on an account runs on the account's runtime: its provider's
  // sign-in from the account's own store, every other provider from the
  // machine's. One without runs on the machine's own, as pi always has.
  const runtime = spec.accountDir
    ? await accountRuntime(spec.accountDir.accountId)
    : await ModelRuntime.create({ refreshOnCreate: false });
  const credential = { value: ctx.sessionCredential };
  process.env[CAWCO_ENV.instanceId] = ctx.instanceId;
  // The SDK's own default loader (sdk.js: `new DefaultResourceLoader({ cwd,
  // agentDir, settingsManager })`), plus the CawCo tools as an inline
  // extension, so the hub can have them replaced on the live session.
  const tools = new CawcoTools(ctx.instanceId, credential);
  const shells = new PiShells();
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
  const { memory, loader } = await loaderSources(spec, ctx.cwd);
  // The fleet's MCP servers, registered for this session alone (`FleetMcp`),
  // and pi's own MCP and tool-search extensions, which the SDK does not load
  // ("SDK sessions do not; add `createCodemodeExtension()`,
  // `createToolSearchExtension()`, and `createMcpExtension()`",
  // pi.dev/docs/latest/sdk): they connect the fleet's beside the person's own
  // `mcp.json` servers, and find the fleet's `deferred` tools when asked. A
  // fenced session has none of them, and CawCo's extensions alone
  // ({@link cawcosExtensionsAlone}).
  const fenced = spec.fence === true;
  const fleetMcp =
    fenced || !ctx.mcpGate
      ? undefined
      : new FleetMcp(ctx.cwd, ctx.mcpGate, spec.startingSet);
  const mcp: ExtensionFactory[] = fleetMcp
    ? [
        createToolSearchExtension(),
        piMcpExtension(spec.startingSet),
        fleetMcp.extension((await fleetMcp.read()).servers),
      ]
    : [];
  // The fleet's hooks, and its folder's project's (`FleetHooks`); a fenced
  // session runs none, as it takes no fleet MCP server.
  const hooks = fenced
    ? undefined
    : new FleetHooks({
        cwd: ctx.cwd,
        ...(ctx.boundary ? { boundary: ctx.boundary } : {}),
      });
  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    settingsManager,
    ...loader,
    extensionFactories: [
      tools.extension(await piHandoffTools(ctx.instanceId, credential)),
      ...mcp,
      ...(hooks ? [hooks.extension()] : []),
    ],
    // A fenced session keeps CawCo's inline extensions alone.
    ...(fenced ? { extensionsOverride: cawcosExtensionsAlone } : {}),
    agentsFilesOverride: (base) => ({
      agentsFiles: [...base.agentsFiles, ...memory],
    }),
  });
  await resourceLoader.reload();
  registerExtensionProviders(runtime, resourceLoader);
  // pi picks a session's model by which providers have auth configured
  // (`hasConfiguredAuth`, read off the runtime's availability snapshot), so
  // the snapshot is taken before the session is made.
  await runtime.getAvailable();
  // The hub names every launch's model (hub start-models.ts); a reattach
  // names none, and its session runs on what it runs on.
  const model = spec.model
    ? await resolvePiModel(runtime, spec.model)
    : undefined;
  const denied = deniedToolsOn(PI.kind, spec.denyTools ?? []).tools;
  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    agentDir,
    modelRuntime: runtime,
    ...(model ? { model } : {}),
    sessionManager: await sessionManagerFor(spec, ctx.cwd),
    settingsManager,
    resourceLoader,
    // Its denied tools (its delegate type's), by pi's own names:
    // "Whether `--tools` and `--exclude-tools` keep the tool registered"
    // (agent-session.js `_isAllowedTool`), so an excluded tool is in no list
    // the model reads, and nothing can activate or call it.
    ...(denied.length > 0 ? { excludeTools: denied } : {}),
    customTools: [
      sessionBash(ctx.cwd, ctx.boundary, shells),
      ...(ctx.boundary ? boundedFileTools(ctx.cwd, ctx.boundary) : []),
    ],
  });
  // `session_start` reaches the extensions, on which the MCP extension
  // connects its servers ("The MCP extension connects its servers on
  // `session_start`, so call `session.bindExtensions()`", pi.dev/docs/latest/sdk).
  // A reload of the session (`#reloadSkills`) emits `session_start` again only
  // to a session bound to something ("hasBindings", agent-session.js
  // `reload`): its extensions' errors, written to the host's stderr, are
  // what it is bound to.
  await session.bindExtensions({
    onError: (error) =>
      console.error(
        `[pi] ${ctx.instanceId}: extension ${error.extensionPath} failed on ${error.event}: ${error.error}`
      ),
  });
  launchEffort(session, spec.effort);
  await loadSkills(session, spec.skills ?? [], ctx.cwd);
  return new PiSession(
    ctx,
    session,
    credential,
    tools,
    runtime,
    shells,
    fleetMcp,
    spec.effort
  );
}
