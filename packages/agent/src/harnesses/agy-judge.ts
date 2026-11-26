/**
 * The judge of an agy session: its answer to each `PreToolUse` call agy's
 * hook hands it (agy-hook.ts). agy runs its own tools and ignores an ACP
 * client's file system and terminal, and its own modes hold no workspace
 * (its plan mode wrote files, its auto mode ran a shell write outside: the
 * project's `assets/b3380ec3/agy-harness-parity.md` §P-a0, §P-b), so CawCo's
 * mode, the workspace boundary and the fleet's denials are this judge's
 * answers, and agy runs in its own `default` mode with `always-proceed`
 * (`assets/50e9e4c3/agy-harness-decisions.md` §2.4).
 *
 * Every answer is an explicit decision, and only one of agy's: `deny` with
 * the reason the model reads, `allow` with an `overwrite` of a workspace
 * command, `force_ask`, or `allow`. agy 1.5.18 denies a call its hook
 * answers `{}` (`assets/cc1d4173/q1-diagA.log`), and its `ask` raised
 * nothing under `always-proceed` (§P-b), so neither stands for anything.
 * It is an allowlist: a tool agy offers that its table
 * (core harness/agy.ts `AGY_TOOLS`) does not name is denied in words that
 * say so, since agy's list moves by release.
 *
 * Each answer is proven on agy 1.5.18 over ACP (the project's
 * `assets/3c6f6f4e/*.summary.txt`): `deny` stopped the call and the model
 * read the reason; `overwrite` ran a workspace's command through its
 * executor, `allow` and `force_ask` alike (an approved `force_ask` ran the
 * rewritten command, `pb-ws-ask`), with agy's notice "A pre-tool hook
 * changed the arguments … Changed: CommandLine, RunPersistent."; and
 * `force_ask` raised one `session/request_permission` whose `toolCallId`
 * is the hook's `toolCall.id` (`pb-default`).
 */
import { deniedToolsBy } from "@cawco/core/delegate-types";
import {
  AGY,
  AGY_BROWSER_PREFIX,
  AGY_DENIED_TOOLS,
  AGY_TASK_INPUT_ACTION,
  AGY_TOOLS,
  type AgyToolClass,
} from "@cawco/core/harness/agy";
import type { SharedMode } from "@cawco/core/harness/modes";
import { shellQuote } from "@cawco/core/shell-quote";
import { unhandled } from "@cawco/core/unhandled";
import { judgeCall, type Policy } from "@cawco/core/workspace-judge";
import { Option, Schema } from "effect";

/** What agy hands its `PreToolUse` hook on stdin (its hooks doc, "Input/Output Contract"). */
const HookInput = Schema.Struct({
  hookEventName: Schema.String,
  cwd: Schema.String,
  toolCall: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    args: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
});

/** A `PreToolUse` call as the judge reads it. */
type AgyHookInput = typeof HookInput.Type;

const decodeInput = Schema.decodeUnknownOption(
  Schema.fromJsonString(HookInput)
);

/** One answer, as agy reads it from the hook's stdout. */
export type AgyAnswer =
  | { readonly decision: "deny"; readonly reason: string }
  | {
      readonly decision: "allow";
      readonly overwrite?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly decision: "force_ask";
      readonly overwrite?: Readonly<Record<string, unknown>>;
    };

/** A workspace session's boundary, as the judge holds it to it. */
interface AgyWorkspace {
  /**
   * The workspace's executor (agent boundary/exec.ts `execScript`): every
   * `run_command` is rewritten to run through it, inside the boundary.
   */
  readonly exec: string;
  /** The workspace's policy, read again for each call, since the agent writes it again as the machine changes. */
  readonly policy: () => Policy;
}

/** What one session's judge knows when a call comes in. */
export interface AgySession {
  /**
   * The tools denied to it, in agy's names ({@link agyDeniedTools}): the
   * fleet's and its delegate type's. An MCP server's every tool is
   * `mcp_<server>_*`.
   */
  readonly denied: ReadonlySet<string>;
  /** Its permission mode, as CawCo names it (core harness/modes.ts `modeOn` has made `auto` Bypass). */
  readonly mode: SharedMode;
  /**
   * Whether a turn the person sent is running. agy starts turns by itself
   * when a background command or a wake-up ends, and a permission it raises
   * then is held until the client's next request (issue #1461), so an ask
   * is raised only in a turn the person is there for.
   */
  readonly personTurn: boolean;
  /** Its workspace's boundary, when it is a work item's session. */
  readonly workspace: AgyWorkspace | undefined;
}

/**
 * A denied-tool list written in Claude Code's names (the fleet's, a
 * delegate type's: agent denied-tools.ts `sessionFleetDenials`), in agy's
 * names, for {@link AgySession.denied}.

 */
export const agyDeniedTools = (names: readonly string[]): ReadonlySet<string> =>
  new Set(deniedToolsBy(AGY_DENIED_TOOLS, names).tools);

const deny = (reason: string): AgyAnswer => ({ decision: "deny", reason });

const ALLOW: AgyAnswer = { decision: "allow" };

/** Why each class agy offers is denied in every CawCo session, in the words the model reads. */
const CLASS_DENIED: Partial<Record<AgyToolClass, string>> = {
  subagent:
    "agy's own subagents, workflows and swarms are off in CawCo: hand work off with CawCo's `delegate` tool instead.",
  browser:
    "agy's own browser is off in CawCo: use the chrome-devtools tools CawCo gives this session instead.",
  question:
    "agy's own question and permission tools are off in CawCo: ask the person with CawCo's `ask` tool instead.",
  config:
    "agy's own plugins, marketplace and agent definitions are off in CawCo: they would change agy's setup for later sessions.",
};

/**
 * What each mode does with a call of each class that a mode governs: run
 * it, ask the person first, or refuse it. A mode means on agy what it means
 * on every harness (core harness/modes.ts): `default` asks before a command
 * or an edit, `acceptEdits` before a command, `plan` runs neither, Bypass
 * and Full Send ask nothing. Input to a running command follows the command
 * it feeds, which was asked for as it started. Every other class runs in
 * every mode.
 */
const MODE_ACTION: Readonly<
  Record<
    SharedMode,
    Readonly<Record<"shell" | "terminal" | "write", "run" | "ask" | "refuse">>
  >
> = {
  default: { shell: "ask", terminal: "run", write: "ask" },
  acceptEdits: { shell: "ask", terminal: "run", write: "run" },
  plan: { shell: "refuse", terminal: "refuse", write: "refuse" },
  bypassPermissions: { shell: "run", terminal: "run", write: "run" },
  fullSend: { shell: "run", terminal: "run", write: "run" },
};

/** The part of {@link MODE_ACTION} a class answers to, if any. */
const governed = (
  kind: AgyToolClass
): "shell" | "terminal" | "write" | undefined => {
  switch (kind) {
    case "shell":
      return "shell";
    case "terminal":
      return "terminal";
    case "write":
    case "image":
      return "write";
    case "read":
    case "task":
    case "mcp":
    case "mcp-call":
    case "web":
    case "list":
    case "turn":
    case "schedule":
    case "subagent":
    case "browser":
    case "question":
    case "config":
      return undefined;
    default:
      return unhandled("kind", kind);
  }
};

/** agy's MCP tool name, `mcp_<server>_<tool>` (its `mcp_%s_%s`; P-d named `mcp_cawco-probe_probe_echo`). */
const mcpName = (server: string, tool: string): string =>
  `${AGY_DENIED_TOOLS.mcpPrefix}${server}${AGY_DENIED_TOOLS.mcpSeparator}${tool}`;

/**
 * The tool a call reaches and its arguments: `call_mcp_tool`, agy's call of
 * an MCP tool by its server and name, as that MCP tool, so a denial or a
 * path it names is judged as the tool's own.
 */
const reached = (
  name: string,
  args: Readonly<Record<string, unknown>>
): { tool: string; input: Readonly<Record<string, unknown>> } => {
  if (AGY_TOOLS[name] === "mcp-call") {
    const server = args.ServerName;
    const tool = args.ToolName;
    const input = args.Arguments;
    if (typeof server === "string" && typeof tool === "string") {
      return {
        tool: mcpName(server, tool),
        input:
          typeof input === "object" && input !== null && !Array.isArray(input)
            ? Object.fromEntries(Object.entries(input))
            : {},
      };
    }
  }
  return { tool: name, input: args };
};

/** Whether `tool` is one of `denied`, a server's every tool (`mcp_<server>_*`) included. */
const isDenied = (denied: ReadonlySet<string>, tool: string): boolean =>
  denied.has(tool) ||
  [...denied].some(
    (name) => name.endsWith("_*") && tool.startsWith(name.slice(0, -1))
  );

/**
 * The class of the tool a call reaches, with what it is handed: an MCP
 * tool and agy's browser's by their prefixes, `manage_task` sending input
 * as input to a running command, every other by agy's table; none for a
 * tool the table does not name.
 */
const classOf = (
  tool: string,
  input: Readonly<Record<string, unknown>>
): AgyToolClass | undefined => {
  if (tool.startsWith(AGY_DENIED_TOOLS.mcpPrefix)) {
    return "mcp";
  }
  if (tool.startsWith(AGY_BROWSER_PREFIX)) {
    return "browser";
  }
  const kind = AGY_TOOLS[tool];
  if (kind === "task" && input.Action === AGY_TASK_INPUT_ACTION) {
    return "terminal";
  }
  return kind === "mcp-call" ? "mcp" : kind;
};

/**
 * `command` as this workspace's executor runs it (boundary/exec.ts
 * `--session`): the executor shows the workspace's notice and runs it inside
 * the boundary, in the directory agy started its shell in.
 */
const wrapped = (exec: string, command: string): string =>
  `${shellQuote(exec)} --session ${shellQuote(command)}`;

/** One single-quoted POSIX shell word, as {@link shellQuote} writes one. */
const QUOTED_WORD = /^'(?:[^']|'\\'')*'$/u;

/**
 * Whether `command` is already this workspace's executor around one command
 * ({@link wrapped}): a hook run twice for one call (issue #1462) wraps it
 * once. Only the executor's own form is taken, so anything after it would
 * be wrapped again, never run outside.
 */
const isWrapped = (exec: string, command: string): boolean => {
  const head = `${shellQuote(exec)} --session `;
  return (
    command.startsWith(head) && QUOTED_WORD.test(command.slice(head.length))
  );
};

/**
 * What a workspace's `run_command` runs as: its command line through the
 * executor, and never in one of agy's persistent terminals, whose later
 * commands run in a shell agy keeps outside the call (changelog 1.5.3:
 * "persistent terminal commands run outside the sandbox"). Undefined when
 * the call already is that ({@link isWrapped}, not persistent).
 */
const throughExecutor = (
  exec: string,
  args: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> | undefined => {
  const command = args.CommandLine;
  if (typeof command !== "string") {
    return;
  }
  if (isWrapped(exec, command)) {
    return args.RunPersistent === true ? { RunPersistent: false } : undefined;
  }
  return { CommandLine: wrapped(exec, command), RunPersistent: false };
};

/** The model's words for a call the mode asks about while no turn of the person's is running. */
const noTurnToAsk = (tool: string, mode: SharedMode): string =>
  `cawco: ${tool} needs the person's approval in this session's ${mode} mode, and no turn of theirs is running to ask in, so it did not run. Say what you meant to do and end your turn.`;

/**
 * Why `tool` (`name` as agy called it) may not run for `session` whatever
 * its mode, if it may not: a tool agy's table does not name or names in a
 * class CawCo refuses (in that class's words, which say what to use
 * instead), a denial of the fleet's or its type's, a recurring schedule, or
 * a path the workspace's policy refuses.
 */
const refusedOutright = (
  call: AgyHookInput,
  reach: { tool: string; input: Readonly<Record<string, unknown>> },
  kind: AgyToolClass | undefined,
  session: AgySession
): string | undefined => {
  const { name } = call.toolCall;
  const { tool, input } = reach;
  if (kind === undefined) {
    return `cawco: ${name} is not a tool CawCo knows on agy, so it did not run. Use another tool.`;
  }
  const classDenied = CLASS_DENIED[kind];
  if (classDenied) {
    return `cawco: ${name} did not run. ${classDenied}`;
  }
  if (isDenied(session.denied, tool) || isDenied(session.denied, name)) {
    return `cawco: ${tool} is denied to this session.`;
  }
  if (kind === "schedule" && input.CronExpression !== undefined) {
    return "cawco: a recurring schedule is off in CawCo: set a one-time wake-up with DurationSeconds, or ask for a CawCo routine.";
  }
  const { workspace } = session;
  if (workspace && kind !== "shell") {
    const verdict = judgeCall(workspace.policy(), {
      harness: AGY.kind,
      tool,
      input,
      cwd: call.cwd,
    });
    return verdict.ok ? undefined : verdict.reason;
  }
};

/** The judge's answer to one call, read from what agy handed the hook, for `session`. */
const agyAnswer = (call: AgyHookInput, session: AgySession): AgyAnswer => {
  if (call.hookEventName !== "PreToolUse") {
    return deny(
      `cawco: the judge answers PreToolUse alone, and was handed ${call.hookEventName}.`
    );
  }
  const { name, args } = call.toolCall;
  const reach = reached(name, args ?? {});
  const kind = classOf(reach.tool, reach.input);
  const refused = refusedOutright(call, reach, kind, session);
  if (refused !== undefined || kind === undefined) {
    return deny(refused ?? `cawco: ${name} did not run.`);
  }
  const part = governed(kind);
  const action = part === undefined ? "run" : MODE_ACTION[session.mode][part];
  const { workspace } = session;
  const overwrite =
    workspace && kind === "shell"
      ? throughExecutor(workspace.exec, reach.input)
      : undefined;
  switch (action) {
    case "refuse":
      return deny(
        `cawco: ${name} does not run in plan mode. Read and plan, then say what you would change.`
      );
    case "ask":
      if (!session.personTurn) {
        return deny(noTurnToAsk(name, session.mode));
      }
      return overwrite
        ? { decision: "force_ask", overwrite }
        : { decision: "force_ask" };
    case "run":
      return overwrite ? { decision: "allow", overwrite } : ALLOW;
    default:
      return unhandled("action", action);
  }
};

/**
 * The answer to one line the hook sent: the call agy handed it, as JSON. A
 * line that is not one is denied: the judge never lets a call run that it
 * could not read.

 */
export const agyAnswerTo = (line: string, session: AgySession): AgyAnswer =>
  Option.match(decodeInput(line), {
    onNone: () =>
      deny(
        "cawco: this call did not run, because the judge could not read what agy handed its hook."
      ),
    onSome: (call) => agyAnswer(call, session),
  });
