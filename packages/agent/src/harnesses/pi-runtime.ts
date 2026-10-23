/** Host-only pi turns. This module is absent from the agent process graph. */
import type {
  FleetMcpChange,
  HookEvent,
  ModelTurnUsage,
  PermissionResult,
  SentMessage,
  SpawnPayload,
  SupportedCommands,
} from "@cawco/core";
import {
  atProviderLimit,
  CAWCO_ENV,
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_REFRESH_CAWCO_TOOLS,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  hookToolCall,
  INSTALL_SESSION_CREDENTIAL,
  LEAD_GATED_TOOLS,
  MESSAGES_READ,
  piToolsFor,
  pricedRequest,
  usageByModel,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import { sessionEnvironment } from "@cawco/core/session-env";
import {
  judgeCall,
  readPolicy,
  type Verdict,
} from "@cawco/core/workspace-judge";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
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
  type ToolCallEvent,
  type ToolCallEventResult,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Boundary, boundaryCommand } from "../boundary";
import type { BrowserDoor } from "../browser/door";
import { callDelegationTool, delegationTools } from "../delegation";
import { hooksAt, readFleetHarnessSet } from "../fleet-harness-set";
import { type HookPlace, runFleetHooks } from "../fleet-hook-run";
import { fleetMcpAt, readFleetMcpSet } from "../fleet-mcp-set";
import type { HarnessContext, HarnessSession, TurnExtras } from "../harness";
import type { McpGate } from "../mcp-gate";
import { placedMemoryIn } from "../placed-memory";
import { acknowledgeSessionCredential } from "../session-identity";
import { accountRuntime } from "./pi-accounts";
import { piMcpServers } from "./pi-mcp";
import {
  BACKGROUND_SHELL,
  type BackgroundShellEnd,
  compactBoundaryId,
  contentOf,
  modelCatalog,
  piModelValue,
  piSessionPath,
  resolvePiModel,
  textOf,
  toBlocks,
} from "./pi-services";
import { type PiGateAsk, piOpenTurns } from "./pi-sessiond";

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
      let tail = "";
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
            tail = (tail + data.toString()).slice(-MOVED_OUTPUT_TAIL);
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
                tail,
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
                tail,
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
  return createBashToolDefinition(cwd, {
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
  }) as unknown as ToolDefinition;
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
const boundedFileTools = (cwd: string, boundary: Boundary): ToolDefinition[] =>
  [
    createReadToolDefinition(cwd),
    createWriteToolDefinition(cwd),
    createEditToolDefinition(cwd),
    createLsToolDefinition(cwd),
    createFindToolDefinition(cwd),
    createGrepToolDefinition(cwd),
  ].map((tool) => {
    const definition = tool as unknown as ToolDefinition;
    return {
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
    } as ToolDefinition;
  });

const piHandoffTools = async (
  instanceId: string,
  credential: { value?: string }
): Promise<ToolDefinition[]> =>
  (await delegationTools(instanceId, "pi")).map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as never,
      execute: async (_id, params) =>
        callDelegationTool(instanceId, tool.name, params, credential.value),
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

  /** The inline extension: holds pi's API and registers the first list. */
  extension(first: ToolDefinition[]): ExtensionFactory {
    return (pi) => {
      this.#api = pi;
      this.#register(first);
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
  /** A workspace session's MCP gate, which its servers with a command go through ({@link piMcpServers}). */
  readonly #gate: McpGate | undefined;

  constructor(cwd: string, gate: McpGate | undefined) {
    this.#cwd = cwd;
    this.#gate = gate;
  }

  /** The inline extension: holds pi's API and registers the session's first set. */
  extension(first: Record<string, McpServerConfig>): ExtensionFactory {
    return (pi) => {
      this.#api = pi;
      this.#apply(first, new Set());
    };
  }

  /**
   * The fleet's servers for this session's folder now ({@link piMcpServers}),
   * the gated chrome-devtools through `door`, and why any is not taken.
   */
  async read(door: BrowserDoor | undefined): Promise<{
    servers: Record<string, McpServerConfig>;
    skipped: Record<string, string>;
  }> {
    return piMcpServers(
      fleetMcpAt(await readFleetMcpSet(), this.#cwd),
      door,
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
        api.registerMcpServer(name, config);
        this.#held.set(name, entry);
        done[name] = "registered";
      } catch (error) {
        done[name] =
          `refused: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return done;
  }

  /** A fleet change taken in place: the set read again and applied ({@link #apply}). */
  async take(
    changes: readonly FleetMcpChange[],
    door: BrowserDoor | undefined
  ): Promise<{ servers: { name: string; kind: string; status: string }[] }> {
    const again = new Set(
      changes
        .filter(({ kind }) => kind === "signed-in" || kind === "signed-out")
        .map(({ name }) => name)
    );
    const { servers, skipped } = await this.read(door);
    const done = this.#apply(servers, again);
    return {
      servers: changes.map(({ name, kind }) => ({
        name,
        kind,
        status:
          done[name] ??
          (skipped[name] ? `not taken: ${skipped[name]}` : undefined) ??
          (this.#held.has(name) ? "kept" : "not taken"),
      })),
    };
  }
}

/** What CawCo's fleet hooks put in a pi session's conversation, by this custom type. */
const FLEET_HOOK_MESSAGE = "cawco-fleet-hook";

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
 *   docs/extensions.md);
 * - PostToolUse and PostToolUseFailure on `tool_result`, by its `isError`:
 *   what a hook says (a block's reason, `additionalContext`) is added to the
 *   result the model reads, as Claude Code shows the model a PostToolUse
 *   hook's stderr;
 * - SessionStart on `session_start`, its reason the matcher's value: what it
 *   says goes with the session's first prompt;
 * - UserPromptSubmit on `before_agent_start` for a person's prompt: what it
 *   says goes with the prompt; a block ends the run before its first
 *   request ("An abort requested while the run was starting, e.g. during
 *   before_agent_start, stops it", pi 1.3.0 agent-session.js), its reason
 *   shown;
 * - Stop on `agent_end`: a block sends its reason as a message that starts
 *   another turn, whose Stop hooks are told `stop_hook_active`, as Claude
 *   Code tells them.
 *
 * It comes before the lead's gate, so a call a hook refuses is never put to
 * the hub.
 */
class FleetHooks {
  readonly #place: HookPlace;
  /** What SessionStart hooks said, for the session's next prompt. */
  readonly #pending: string[] = [];
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
      hooksAt(await readFleetHarnessSet(), this.#place.cwd),
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
        return verdict.block
          ? { block: true, reason: verdict.block }
          : undefined;
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
        const said = [verdict.block, verdict.context].filter(Boolean);
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

/** Caw's shell and edit tools on pi, by pi's own names (core `LEAD_GATED_TOOLS`). */
const LEAD_GATED_ON_PI: ReadonlySet<string> = new Set(LEAD_GATED_TOOLS.pi);

/** Why a gated call did not run when its turn was aborted before the hub answered. */
const INTERRUPTED =
  "The turn was interrupted before the hub answered this call.";

/**
 * Where a tool CawCo gave the session comes from, as pi's registry keeps it
 * (`ToolInfo.sourceInfo.path`, extensions/types.d.ts): pi's built-ins
 * (`builtin:<name>`), the SDK's custom tools CawCo hands `createAgentSession`
 * (`<sdk:<name>>`), and CawCo's inline extensions (`<inline:<n>>`,
 * resource-loader.js `loadExtensionFactories`). A tool any of the person's
 * own extensions registers carries its file's path; one that takes a
 * built-in's name takes its place in the registry, path and all
 * (agent-session.js `_refreshToolRegistry`).
 */
const CAWCO_TOOL_SOURCE = /^(?:builtin:|<sdk:|<inline:)/;

/** Whether the tool `name` stands in pi's registry as one CawCo gave the session ({@link CAWCO_TOOL_SOURCE}); a name pi does not hold is not. */
const cawcosTool = (pi: ExtensionAPI, name: string): boolean => {
  const path = pi.getAllTools().find((tool) => tool.name === name)
    ?.sourceInfo.path;
  return path !== undefined && CAWCO_TOOL_SOURCE.test(path);
};

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
 * A project's Caw on pi (`SpawnPayload.lead`): each call of his shell and
 * edit tools is put to the hub as a permission ask before it runs, and runs
 * only once the hub's gate allows it (hub lead-gate.ts), as Claude Code's
 * `ask` rules and OpenCode's put his calls there. pi's own point for it:
 * "`tool_call` can mutate input or block execution" (pi docs
 * extensions.md); pi awaits each handler before the call runs
 * (agent-session.js `_beforeToolCall`), a script's calls included ("Nested
 * calls go through argument validation and the `tool_call` and `tool_result`
 * handlers like model-issued calls"), and a handler that fails blocks the
 * call ("A `tool_call` handler failure blocks the tool as a fail-safe"). It
 * is the session's last extension, so no other handler changes a call's
 * input after the hub judged it ("Later `tool_call` handlers see earlier
 * mutations", types.d.ts `ToolCallEvent`; inline extensions load after the
 * person's own, resource-loader.js `loadFinalExtensionSet`).
 *
 * A tool the person's own pi extensions registered (or put in place of a
 * built-in) is put to the hub too, whatever its name: his extensions keep
 * working, each call of theirs decided by the gate (lead-gate.ts `isGated`,
 * your card). CawCo's own tools run as on every harness: its board tools,
 * pi's readers, and the MCP servers' tools, which Caw has as any session
 * does ({@link cawcosTool}).
 */
class PiLeadGate {
  readonly #ctx: HarnessContext;
  /** The asks the hub has not answered, by request: each with its call's answer. */
  readonly #waiting = new Map<
    string,
    {
      ask: PiGateAsk;
      settle: (answer: ToolCallEventResult | undefined) => void;
    }
  >();

  constructor(ctx: HarnessContext) {
    this.#ctx = ctx;
  }

  /** The inline extension: every gated call waits on the hub. */
  extension(): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", (event, context) =>
        LEAD_GATED_ON_PI.has(event.toolName) || !cawcosTool(pi, event.toolName)
          ? this.#put(event, context.signal)
          : undefined
      );
    };
  }

  /**
   * A gated call, put to the hub. The call's own id names its transcript
   * row; a call a script made has none there ("These ids do not appear as
   * tool calls or tool results in the transcript"). An abort of the turn
   * takes the ask back.
   */
  #put(
    event: ToolCallEvent,
    signal: AbortSignal | undefined
  ): Promise<ToolCallEventResult | undefined> {
    if (signal?.aborted) {
      return Promise.resolve({ block: true, reason: INTERRUPTED });
    }
    const ask: PiGateAsk = {
      requestId: crypto.randomUUID(),
      toolName: event.toolName,
      input: event.input,
      requestKind: "tool",
      ...(event.parentToolCallId ? {} : { toolUseId: event.toolCallId }),
    };
    return new Promise((resolve) => {
      const interrupted = () =>
        this.#settle(
          ask.requestId,
          { block: true, reason: INTERRUPTED },
          "cancelled"
        );
      signal?.addEventListener("abort", interrupted, { once: true });
      this.#waiting.set(ask.requestId, {
        ask,
        settle: (answer) => {
          signal?.removeEventListener("abort", interrupted);
          resolve(answer);
        },
      });
      this.#ctx.permission(ask);
    });
  }

  #settle(
    requestId: string,
    answer: ToolCallEventResult | undefined,
    outcome: "answered" | "cancelled"
  ): void {
    const waiting = this.#waiting.get(requestId);
    if (!waiting) {
      return;
    }
    this.#waiting.delete(requestId);
    waiting.settle(answer);
    this.#ctx.permissionResolved?.(requestId, outcome);
  }

  /** The hub's answer: an allowed call runs; a denied one is blocked with the hub's words, which pi hands the model as the call's error. */
  answer(requestId: string, result: PermissionResult): void {
    this.#settle(
      requestId,
      result.behavior === "allow"
        ? undefined
        : { block: true, reason: result.message },
      "answered"
    );
  }

  /** An ask nobody could be shown, taken back: its call does not run. */
  withdraw(requestId: string, message: string): void {
    this.#settle(requestId, { block: true, reason: message }, "cancelled");
  }
}

/**
 * The HTTP status of the provider's last answer to a session, read off the
 * response itself: {@link fetch} is the fetch every request the session's
 * agent streams is made with (pi-ai `StreamOptions.fetch`, "Defaults to
 * `globalThis.fetch`"). An answer pi refuses passes through it too: pi-ai's
 * OpenAI client throws on a 429 before pi's `onResponse`, so its
 * `after_provider_response` is never heard for one, and its error message
 * keeps the status only in words.
 */
class ProviderAnswers {
  #status: number | undefined;

  readonly fetch: typeof globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1]
    ): Promise<Response> => {
      const response = await globalThis.fetch(input, init);
      this.#status = response.status;
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

  /** The status of the turn's last answer, cleared for the next turn's. */
  take(): number | undefined {
    const status = this.#status;
    this.#status = undefined;
    return status;
  }
}

/** A send that is pi's `/compact`, with its optional focus text. */
const COMPACT_COMMAND = /^\/compact(?:\s+([\s\S]*))?$/;

class PiSession implements HarnessSession {
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
  /** A project's Caw's gate: his shell and edit calls, each put to the hub. */
  readonly #gate: PiLeadGate | undefined;
  #busy = false;
  readonly #unread: string[] = [];
  #reading: string | undefined;
  /** What the turn's requests spent so far: its answers' and any compaction's. */
  #turnUsage: ModelTurnUsage[] = [];

  /** One request's pi-ai `Usage` on `model` (`provider/id`), priced at `at` (epoch ms). */
  #spent(model: string, usage: Usage | undefined, at: number): void {
    if (usage) {
      this.#turnUsage.push(
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
        )
      );
    }
  }

  #leaf(): { uuid: string; timestamp: string } {
    const entry = this.#session.sessionManager.getLeafEntry() as {
      id: string;
      timestamp: string;
    };
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
      const { role, usage } = message as {
        role?: string;
        usage?: { cacheRead: number; cacheWrite: number; input: number };
      };
      const sent = usage ? usage.input + usage.cacheRead + usage.cacheWrite : 0;
      if (role === "assistant" && sent > 0) {
        return sent;
      }
    }
    return undefined;
  }

  #setBusy(active: boolean): void {
    this.#busy = active;
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
    gate: PiLeadGate | undefined
  ) {
    this.#ctx = ctx;
    this.#gate = gate;
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
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: translates each pi event shape once into the neutral stream
  #handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "message_start": {
        const read =
          (event.message as { role?: string }).role === "user"
            ? this.#unread.shift()
            : undefined;
        if (read) {
          this.#reading = read;
        }
        break;
      }
      case "message_end": {
        const { role, content } = event.message as {
          role?: string;
          content?: unknown;
        };
        const sent = this.#reading;
        if (sent && role === "user") {
          this.#reading = undefined;
          // pi appends after notifying listeners, in the same synchronous run.
          queueMicrotask(() =>
            this.#ctx.frame({
              type: "system",
              subtype: MESSAGES_READ,
              read: [sent],
              storedAs: {
                [sent]: this.#session.sessionManager.getLeafId() as string,
              },
              session_id: this.sessionId ?? undefined,
            })
          );
        }
        if (role === "assistant") {
          const answer = event.message as AssistantMessage;
          this.#spent(
            `${answer.provider}/${answer.model}`,
            answer.usage,
            answer.timestamp
          );
          queueMicrotask(() => {
            const blocks = toBlocks(content);
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
        const ae = (
          event as { assistantMessageEvent?: { type?: string; delta?: string } }
        ).assistantMessageEvent;
        if (ae?.type === "text_delta") {
          this.#ctx.frame({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: ae.delta ?? "" },
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
        break;
      }
      case "tool_execution_end": {
        const { toolCallId, result, isError } = event as unknown as {
          toolCallId: string;
          result: {
            content?: unknown;
            details?: Record<string, unknown>;
          } | null;
          isError: boolean;
        };
        const content = Array.isArray(result) ? "" : contentOf(result?.content);
        const details = result?.details;
        const structuredContent =
          details && Object.keys(details).length > 0 ? details : undefined;
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
        if ((event as { willRetry?: boolean }).willRetry === true) {
          break;
        }
        this.#setBusy(false);
        const errors =
          (
            event as { messages?: { errorMessage?: string }[] }
          ).messages?.flatMap((message) =>
            message.errorMessage ? [message.errorMessage] : []
          ) ?? [];
        const failed = errors.length > 0;
        // A failed turn whose last answer was a 429 ended on its account's
        // limit (core `atProviderLimit`), whatever its error's words say.
        const status = this.#answers.take();
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
          ...(failed ? { errors } : {}),
          ...(failed && atProviderLimit({ status }) ? { atLimit: true } : {}),
          ...(context === undefined ? {} : { contextTokens: context }),
        });
        break;
      }
      case "agent_settled":
      case "agent_start":
      case "auto_retry_end":
      case "auto_retry_start":
      case "bash_execution_update":
      case "compaction_start":
      case "entry_appended":
      case "queue_update":
      case "session_info_changed":
      case "summarization_retry_attempt_start":
      case "summarization_retry_finished":
      case "summarization_retry_scheduled":
      case "thinking_level_changed":
      case "tool_execution_start":
      case "tool_execution_update":
      case "turn_end":
      case "turn_start":
        break;
    }
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
        ...(done.estimatedTokensAfter === undefined
          ? {}
          : { contextTokens: done.estimatedTokensAfter }),
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
    const attachments = (extras.attachments ?? [])
      .map(
        (a) =>
          `\n\n<pasted-text name="${a.name}">\n${a.content}\n</pasted-text>`
      )
      .join("");
    this.#unread.push(message.uuid);
    this.#setBusy(true);
    const streaming = this.#session.isStreaming;
    this.#session
      .prompt(text + attachments, {
        images: images as never,
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
      .catch((error: unknown) => this.#refused(message.uuid, error));
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

  async control(method: string, args: unknown[]): Promise<unknown> {
    if (method === INSTALL_SESSION_CREDENTIAL) {
      const [credential] = args;
      if (typeof credential !== "string" || !credential) {
        throw new Error("Session credential is missing.");
      }
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
    // The host outlived the agent that started it and still holds the
    // credential its tools send. The ACK is authenticated by it, so one the
    // hub no longer knows is refused, as is a host that holds none.
    if (method === VERIFY_SESSION_CREDENTIAL) {
      if (!this.#credential.value) {
        throw new Error("This pi host holds no CawCo session credential.");
      }
      await acknowledgeSessionCredential(this.#credential.value);
      return undefined;
    }
    switch (method) {
      case CONTROL_REFRESH_CAWCO_TOOLS: {
        const count = await this.#tools.refresh();
        console.error(`[pi] cawco tools refreshed: ${count} listed`);
        return { listed: count };
      }
      // The agent sends the session's door with the changes (pi-sessiond.ts).
      case CONTROL_MCP_FLEET_CHANGED: {
        const changes = args[0] as FleetMcpChange[];
        // A fenced session takes no MCP server ({@link cawcosExtensionsAlone}).
        return this.#fleetMcp
          ? await this.#fleetMcp.take(
              changes,
              args[1] as BrowserDoor | undefined
            )
          : {
              servers: changes.map(({ name, kind }) => ({
                name,
                kind,
                status: "not taken: the session is fenced",
              })),
            };
      }
      case CONTROL_INTERRUPT:
        await this.interrupt();
        return undefined;
      case CONTROL_SET_MODEL: {
        await this.#session.setModel(
          await resolvePiModel(this.#runtime, String(args[0]))
        );
        return undefined;
      }
      case CONTROL_SUPPORTED_MODELS:
        return await modelCatalog(this.#runtime);
      case CONTROL_SUPPORTED_COMMANDS:
        return [] satisfies SupportedCommands;
      case CONTROL_CONTEXT_USAGE: {
        const last = [...this.#session.messages]
          .reverse()
          .find((m) => (m as { usage?: unknown }).usage);
        const usage = (last as { usage?: { totalTokens?: number } } | undefined)
          ?.usage;
        const total = usage?.totalTokens ?? 0;
        // The model's window in pi-ai's catalog is what a request may send:
        // its input limit where that is below the context (gpt-5.5: 272000,
        // providers/data/openai.json).
        const window = this.#session.model?.contextWindow;
        if (!window) {
          throw new Error(
            "The pi session has no model, so it has no context window."
          );
        }
        return {
          totalTokens: total,
          maxTokens: window,
          percentage: Math.min(100, Math.round((total / window) * 100)),
          categories: [],
        };
      }
      default:
        console.warn(`[pi] no control verb ${method} — ignored`);
        return undefined;
    }
  }
  resolvePermission(requestId: string, result: PermissionResult): void {
    this.#gate?.answer(requestId, result);
  }
  withdrawPermission(requestId: string, message: string): void {
    this.#gate?.withdraw(requestId, message);
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

/** The session's store: the one it resumes or forks, else a new one. */
const sessionManagerFor = async (
  spec: SpawnPayload,
  cwd: string
): Promise<SessionManager> => {
  if (!spec.resume) {
    return SessionManager.create(cwd);
  }
  const source = await piSessionPath(spec.resume.sessionKey, cwd);
  if (!source) {
    throw new Error(
      `pi cannot ${spec.resume.fork ? "fork" : "resume"} missing session ${spec.resume.sessionKey}.`
    );
  }
  return spec.resume.fork
    ? SessionManager.forkFrom(source, cwd)
    : SessionManager.open(source, undefined, cwd);
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
  // pi reads `AGENTS.md` and `CLAUDE.md` up from its folder itself
  // (resource-loader.js `loadContextFileFromDir`, 1.0.1); the project's
  // memory documents CawCo placed in its folder (fleet.ts `placedMemoryIn`)
  // and its role's, which it launches with, join them as context files.
  const memory = [
    ...(await placedMemoryIn(ctx.cwd)).map(({ file, content }) => ({
      path: file,
      content,
    })),
    ...(spec.instructions ?? []).map(({ path, content }) => ({
      path: `cawco memory: ${path}`,
      content,
    })),
  ];
  // The fleet's MCP servers, registered for this session alone (`FleetMcp`),
  // and pi's own MCP and tool-search extensions, which the SDK does not load
  // ("SDK sessions do not; add `createCodemodeExtension()`,
  // `createToolSearchExtension()`, and `createMcpExtension()`",
  // pi.dev/docs/latest/sdk): they connect the fleet's beside the person's own
  // `mcp.json` servers, and find the fleet's `deferred` tools when asked. A
  // fenced session has none of them, and CawCo's extensions alone
  // ({@link cawcosExtensionsAlone}).
  const fenced = spec.fence === true;
  const fleetMcp = fenced ? undefined : new FleetMcp(ctx.cwd, ctx.mcpGate);
  const mcp: ExtensionFactory[] = fleetMcp
    ? [
        createToolSearchExtension(),
        createMcpExtension(),
        fleetMcp.extension(
          (await fleetMcp.read(await ctx.browserDoor?.())).servers
        ),
      ]
    : [];
  const gate = spec.lead ? new PiLeadGate(ctx) : undefined;
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
    extensionFactories: [
      tools.extension(await piHandoffTools(ctx.instanceId, credential)),
      ...mcp,
      ...(hooks ? [hooks.extension()] : []),
      // Last, so its verdict is on the input the call runs with.
      ...(gate ? [gate.extension()] : []),
    ],
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
  const model =
    spec.model && spec.model !== "default"
      ? await resolvePiModel(runtime, spec.model)
      : undefined;
  const denied = piToolsFor(spec.denyTools ?? []).tools;
  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    agentDir,
    modelRuntime: runtime,
    ...(model ? { model } : {}),
    sessionManager: await sessionManagerFor(spec, ctx.cwd),
    settingsManager,
    resourceLoader,
    // Its denied tools (its delegate type's, a lead's), by pi's own names:
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
  await session.bindExtensions({});
  return new PiSession(
    ctx,
    session,
    credential,
    tools,
    runtime,
    shells,
    fleetMcp,
    gate
  );
}
