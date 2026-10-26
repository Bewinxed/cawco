/**
 * Hooks the fleet keeps, and everything both ends need to agree about them.
 *
 * A hook is the one row in this codebase that is *executable*: converging it
 * writes a script and registers it to run on a lifecycle event, on every
 * machine, with no prompt. So the validation here is not decoration — it is
 * the last thing between the editor and a shell on every box, and it runs
 * twice on purpose (the hub before it stores, the daemon before it writes).
 *
 * The matcher semantics below are Claude Code's, not ours. They are subtle
 * enough that guessing them silently produces a hook that never fires, which
 * is why {@link hookMatcherKind} exists as a shared function rather than a
 * comment: the editor's test box previews with it and the reader sees which
 * of the three readings their matcher actually got.
 */

import { USER_LAYER_SHELL, userLayerLabel } from "./claude-dirs";
import type { FleetPlacement } from "./fleet";
import type { HarnessKind } from "./harness";

/** Every lifecycle point a hook can attach to. */
export type HookEvent =
  | "SessionStart"
  | "Setup"
  | "InstructionsLoaded"
  | "UserPromptSubmit"
  | "UserPromptExpansion"
  | "MessageDisplay"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "PermissionDenied"
  | "Notification"
  | "SubagentStart"
  | "SubagentStop"
  | "TaskCreated"
  | "TaskCompleted"
  | "Stop"
  | "StopFailure"
  | "TeammateIdle"
  | "ConfigChange"
  | "CwdChanged"
  | "DirectoryAdded"
  | "FileChanged"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "PreCompact"
  | "PostCompact"
  | "SessionEnd"
  | "Elicitation"
  | "ElicitationResult";

/** How the picker files an event, so thirty-one of them stay findable. */
export type HookGroup =
  "Session" | "Prompt" | "Tool" | "Subagent" | "Task" | "Files" | "Compaction";

/**
 * One event as the editor needs to present it. `filters` is the field the
 * matcher is tested against, and its absence is what "this event has no
 * matcher" means — Claude Code silently ignores a matcher on those, so the
 * editor hides the field rather than letting a reader write one that does
 * nothing.
 */
export interface HookEventInfo {
  /** What fires it, in one clause that finishes "Runs …". */
  blurb: string;
  event: HookEvent;
  /** What the matcher is tested against; absent means no matcher support. */
  filters?: string;
  group: HookGroup;
  /** Real values, offered as suggestions. Empty for open-ended fields. */
  suggests?: string[];
}

/**
 * The events, in lifecycle order — the same order Claude Code's own
 * documentation walks them in, because a reader scanning for "the one after
 * the tool runs" is scanning a sequence, not an alphabet.
 */
export const HOOK_EVENTS: HookEventInfo[] = [
  {
    event: "SessionStart",
    group: "Session",
    blurb: "a session starts or resumes",
    filters: "how the session started",
    suggests: ["startup", "resume", "clear", "compact", "fork"],
  },
  {
    event: "Setup",
    group: "Session",
    blurb: "a setup CLI flag runs",
    filters: "which CLI flag triggered setup",
    suggests: ["init", "maintenance"],
  },
  {
    event: "InstructionsLoaded",
    group: "Session",
    blurb: "CLAUDE.md and rules are loaded",
    filters: "load reason",
    suggests: [
      "session_start",
      "nested_traversal",
      "path_glob_match",
      "include",
      "compact",
    ],
  },
  {
    event: "SessionEnd",
    group: "Session",
    blurb: "the session ends",
    filters: "why the session ended",
    suggests: ["clear", "resume", "logout", "prompt_input_exit", "other"],
  },
  {
    event: "UserPromptSubmit",
    group: "Prompt",
    blurb: "you submit a prompt, before the model sees it",
  },
  {
    event: "UserPromptExpansion",
    group: "Prompt",
    blurb: "a slash command or skill expands",
    filters: "command name",
  },
  {
    event: "MessageDisplay",
    group: "Prompt",
    blurb: "an assistant message streams text",
  },
  {
    event: "PreToolUse",
    group: "Tool",
    blurb: "before a tool call runs",
    filters: "tool name",
    suggests: ["Bash", "Edit", "Write", "Read", "Edit|Write", "mcp__.*"],
  },
  {
    event: "PermissionRequest",
    group: "Tool",
    blurb: "a tool call asks for permission",
    filters: "tool name",
    suggests: ["Bash", "Edit", "Write"],
  },
  {
    event: "PostToolUse",
    group: "Tool",
    blurb: "after a tool call succeeds",
    filters: "tool name",
    suggests: ["Bash", "Edit", "Write", "Edit|Write"],
  },
  {
    event: "PostToolUseFailure",
    group: "Tool",
    blurb: "after a tool call fails",
    filters: "tool name",
    suggests: ["Bash", "Edit", "Write"],
  },
  {
    event: "PostToolBatch",
    group: "Tool",
    blurb: "once after a whole batch of parallel tool calls resolves",
  },
  {
    event: "PermissionDenied",
    group: "Tool",
    blurb: "a tool call is denied",
    filters: "tool name",
    suggests: ["Bash", "Edit", "Write"],
  },
  {
    event: "SubagentStart",
    group: "Subagent",
    blurb: "a subagent is spawned",
    filters: "agent type",
    suggests: ["general-purpose", "Explore", "Plan", "code", "opus-5"],
  },
  {
    event: "SubagentStop",
    group: "Subagent",
    blurb: "a subagent finishes",
    filters: "agent type",
    suggests: ["general-purpose", "Explore", "Plan", "code", "opus-5"],
  },
  {
    event: "TeammateIdle",
    group: "Subagent",
    blurb: "a teammate goes idle",
  },
  {
    event: "TaskCreated",
    group: "Task",
    blurb: "a task is added to the shared list",
  },
  {
    event: "TaskCompleted",
    group: "Task",
    blurb: "a task is completed",
  },
  {
    event: "Stop",
    group: "Task",
    blurb: "the main agent finishes a turn",
  },
  {
    event: "StopFailure",
    group: "Task",
    blurb: "a turn ends in an API error",
    filters: "error type",
    suggests: [
      "rate_limit",
      "overloaded",
      "authentication_failed",
      "billing_error",
      "server_error",
    ],
  },
  {
    event: "Notification",
    group: "Task",
    blurb: "Claude Code raises a notification",
    filters: "notification type",
    suggests: [
      "permission_prompt",
      "idle_prompt",
      "auth_success",
      "agent_needs_input",
    ],
  },
  {
    event: "FileChanged",
    group: "Files",
    blurb: "a watched file changes",
    filters: "literal filenames to watch",
    suggests: [".env", ".envrc", ".env|.envrc"],
  },
  {
    event: "CwdChanged",
    group: "Files",
    blurb: "the working directory changes",
  },
  {
    event: "DirectoryAdded",
    group: "Files",
    blurb: "a directory is added to the session",
    filters: "how the directory was added",
    suggests: ["slash_command", "register_repo_root"],
  },
  {
    event: "WorktreeCreate",
    group: "Files",
    blurb: "a git worktree is created",
  },
  {
    event: "WorktreeRemove",
    group: "Files",
    blurb: "a git worktree is removed",
  },
  {
    event: "ConfigChange",
    group: "Files",
    blurb: "a settings file changes",
    filters: "configuration source",
    suggests: [
      "user_settings",
      "project_settings",
      "local_settings",
      "policy_settings",
      "skills",
    ],
  },
  {
    event: "Elicitation",
    group: "Files",
    blurb: "an MCP server asks the user something",
    filters: "MCP server name",
  },
  {
    event: "ElicitationResult",
    group: "Files",
    blurb: "an MCP elicitation is answered",
    filters: "MCP server name",
  },
  {
    event: "PreCompact",
    group: "Compaction",
    blurb: "before the transcript is compacted",
    filters: "what triggered compaction",
    suggests: ["manual", "auto"],
  },
  {
    event: "PostCompact",
    group: "Compaction",
    blurb: "after the transcript is compacted",
    filters: "what triggered compaction",
    suggests: ["manual", "auto"],
  },
];

const EVENT_INFO = new Map(HOOK_EVENTS.map((info) => [info.event, info]));

/** What an event's matcher is tested against, or undefined when it has none. */
export const hookEventInfo = (event: HookEvent): HookEventInfo | undefined =>
  EVENT_INFO.get(event);

/** Whether writing a matcher on this event does anything at all. */
export const hookTakesMatcher = (event: HookEvent): boolean =>
  EVENT_INFO.get(event)?.filters !== undefined;

/**
 * The two events Claude Code reads with a narrower exact-match set: letters,
 * digits, `_` and `|` only. A hyphen, space or comma in one of these keeps the
 * whole matcher on the regular-expression path, which is nearly always a
 * surprise — a filename matcher of `my-file.env` is a regex, not a filename.
 */
const NARROW_EVENTS = new Set<HookEvent>(["FileChanged", "StopFailure"]);

/** How Claude Code will read a matcher: the three-way branch, shared. */
export type HookMatcherKind = "all" | "exact" | "regex";

/**
 * Which of the three readings a matcher gets. The rule is entirely about
 * which characters appear, never about intent, so a reader who typed a dot
 * meaning "a literal dot" has written a regular expression and needs to be
 * told so before they save.
 */
const PLAIN_MATCHER_NARROW = /^[A-Za-z0-9_|]+$/u;
const PLAIN_MATCHER_WIDE = /^[A-Za-z0-9_\-, |]+$/u;

export function hookMatcherKind(
  matcher: string | undefined,
  event?: HookEvent
): HookMatcherKind {
  const text = (matcher ?? "").trim();
  if (text === "" || text === "*") {
    return "all";
  }
  const plain =
    event && NARROW_EVENTS.has(event)
      ? PLAIN_MATCHER_NARROW
      : PLAIN_MATCHER_WIDE;
  return plain.test(text) ? "exact" : "regex";
}

/**
 * Whether `value` matches, by the same branch Claude Code takes. The editor's
 * test box calls this so what it shows is what the fleet will do.
 */
const SEPARATOR_NARROW = /\|/u;
const SEPARATOR_WIDE = /[|,]/u;

/**
 * A matcher as a test with no rule left to apply: every value, one of a list
 * of exact names, or a regular expression tested unanchored. What a harness
 * that is not Claude Code runs a fleet hook's matcher by (agent
 * fleet-harness-set.ts), so the three readings live here alone.
 */
export type HookMatchTest =
  { all: true } | { exact: string[] } | { regex: string };

export function hookMatchTest(
  matcher: string | undefined,
  event?: HookEvent
): HookMatchTest {
  const kind = hookMatcherKind(matcher, event);
  const text = (matcher ?? "").trim();
  if (kind === "all") {
    return { all: true };
  }
  if (kind === "exact") {
    const separator =
      event && NARROW_EVENTS.has(event) ? SEPARATOR_NARROW : SEPARATOR_WIDE;
    return {
      exact: text
        .split(separator)
        .map((part) => part.trim())
        .filter((part) => part !== ""),
    };
  }
  return { regex: text };
}

/** Whether `value` passes a {@link HookMatchTest}; a regex that does not compile passes nothing. */
export function hookTestPasses(test: HookMatchTest, value: string): boolean {
  if ("all" in test) {
    return true;
  }
  if ("exact" in test) {
    return test.exact.includes(value);
  }
  try {
    // Unanchored, exactly as Claude Code tests it — `Edit.*` really does match
    // `NotebookEdit`, and the test box has to reproduce that, not correct it.
    // biome-ignore lint/style/useUnicodeRegex: Claude Code compiles the owner's matcher without a flag; u would reject patterns it runs.
    return new RegExp(test.regex).test(value);
  } catch {
    return false;
  }
}

export function hookMatches(
  matcher: string | undefined,
  value: string,
  event?: HookEvent
): boolean {
  return hookTestPasses(hookMatchTest(matcher, event), value);
}

/**
 * The harnesses that run the fleet's hooks from CawCo's harness set (agent
 * fleet-harness-set.ts): CawCo's OpenCode plugin and its inline pi
 * extension. Claude Code runs them itself.
 */
export type HookHarness = Exclude<HarnessKind, "claude">;

/**
 * The events each harness runs a command hook on, by the point it raises:
 * OpenCode 2.0's plugin tool hooks, `execute.before` and `execute.after`
 * ("Inspect or replace tool input before execution",
 * opencode.ai/v2/docs/build/plugins); pi's extension events, `tool_call`
 * ("can mutate input or block execution"), `tool_result`, `session_start`,
 * `before_agent_start` and `agent_end` (pi 1.3.0 docs/extensions.md). Any
 * other event is unsupported on that harness, and said so on the machine's
 * row ({@link hookUnsupported}).
 */
export const HOOK_EVENTS_ON = {
  opencode: ["PreToolUse", "PostToolUse", "PostToolUseFailure"],
  pi: [
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "SessionStart",
    "UserPromptSubmit",
    "Stop",
  ],
} as const satisfies Record<HookHarness, readonly HookEvent[]>;

/** One harness tool in Claude Code's words: its name, and its input's keys renamed to Claude Code's. */
export interface HookToolName {
  input?: Readonly<Record<string, string>>;
  name: string;
}

/**
 * Each harness's tools by Claude Code's names, which a fleet hook's matcher
 * and its `tool_name` read, so `Bash` and `Edit|Write` mean the same on
 * every harness. OpenCode 2.0.29's `shell`, `read`, `write` and `edit` (their
 * `path`, and `edit`'s `oldString`, `newString`, `replaceAll`: the schemas
 * its binary defines, `o({path:…,content:…})` for `write`), `patch`, `glob`,
 * `grep`, `webfetch`, `websearch`, `subagent` and `skill`; pi 1.3.0's `bash`,
 * `powershell`, `read`, `write` and `edit` (their `path`, and `edit`'s
 * `edits` kept as they are), `ls`, `find` and `grep`. A tool not named here
 * (an MCP tool, a plugin's or an extension's) is matched by its own name.
 */
export const HOOK_TOOL_NAMES = {
  opencode: {
    shell: { name: "Bash" },
    read: { name: "Read", input: { path: "file_path" } },
    write: { name: "Write", input: { path: "file_path" } },
    edit: {
      name: "Edit",
      input: {
        path: "file_path",
        oldString: "old_string",
        newString: "new_string",
        replaceAll: "replace_all",
      },
    },
    patch: { name: "Edit" },
    glob: { name: "Glob" },
    grep: { name: "Grep" },
    webfetch: { name: "WebFetch" },
    websearch: { name: "WebSearch" },
    subagent: { name: "Agent" },
    skill: { name: "Skill" },
  },
  pi: {
    bash: { name: "Bash" },
    powershell: { name: "PowerShell" },
    read: { name: "Read", input: { path: "file_path" } },
    write: { name: "Write", input: { path: "file_path" } },
    edit: { name: "Edit", input: { path: "file_path" } },
    ls: { name: "LS" },
    find: { name: "Glob" },
    grep: { name: "Grep" },
  },
} as const satisfies Record<HookHarness, Record<string, HookToolName>>;

/** A harness's tool call as a fleet hook reads it: Claude Code's name for the tool, and its input with Claude Code's keys. */
export const hookToolCall = (
  harness: HookHarness,
  tool: string,
  input: unknown
): { input: unknown; name: string } => {
  const known: HookToolName | undefined = (
    HOOK_TOOL_NAMES[harness] as Record<string, HookToolName>
  )[tool];
  if (!known) {
    return { name: tool, input };
  }
  const keys = known.input;
  if (!(keys && input && typeof input === "object" && !Array.isArray(input))) {
    return { name: known.name, input };
  }
  return {
    name: known.name,
    input: Object.fromEntries(
      Object.entries(input).map(([key, value]) => [keys[key] ?? key, value])
    ),
  };
};

/**
 * An input in Claude Code's words back in `harness`'s own keys for `tool`:
 * the inverse of {@link hookToolCall}'s renames, for a hook's `updatedInput`
 * a harness applies to the call it runs.
 */
export const hookToolInputBack = (
  harness: HookHarness,
  tool: string,
  input: Record<string, unknown>
): Record<string, unknown> => {
  const keys = (HOOK_TOOL_NAMES[harness] as Record<string, HookToolName>)[tool]
    ?.input;
  if (!keys) {
    return input;
  }
  const back = Object.fromEntries(
    Object.entries(keys).map(([own, claude]) => [claude, own])
  );
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [back[key] ?? key, value])
  );
};

/**
 * The events whose hooks can rewrite the call's input: Claude Code's
 * `updatedInput`, "directly under `hookSpecificOutput`" for PreToolUse and
 * "inside the `decision` object" for PermissionRequest
 * (code.claude.com/docs/en/hooks).
 */
export const HOOK_INPUT_EVENTS: readonly HookEvent[] = [
  "PreToolUse",
  "PermissionRequest",
];

/**
 * What a hook that could rewrite a call's input comes to in a workspace
 * session, on the machine's row: the boundary judged the call as the model
 * asked it, and "When multiple `PreToolUse` hooks return `updatedInput` …,
 * the last one to finish takes effect" (code.claude.com/docs/en/hooks-guide),
 * so no rewrite is taken there. A command or HTTP hook runs through CawCo's
 * guard (agent fleet-hook-guard.ts), which drops it from the reply. An MCP
 * tool hook runs as the owner approved it, the fleet's and a project's
 * alike, its rewrite kept: Claude Code reads its reply itself, and the owner
 * picked "Allow them" for these ("user choice in the end", 2026-10-23).
 */
export const hookWorkspaceWords = {
  dropped:
    "In a workspace session its input rewrite (updatedInput) is dropped: the boundary judged the call as asked. Its deny, ask and context still count.",
  mcpToolKept:
    "In a workspace session an MCP tool hook's input rewrite is not dropped: Claude Code reads its reply itself.",
} as const;

/** The workspace word for `hook` on the machine's row, or none for a hook that cannot rewrite input. */
export const hookWorkspaceNote = (
  hook: Pick<FleetHook, "event" | "handler">
): string | undefined => {
  if (!HOOK_INPUT_EVENTS.includes(hook.event)) {
    return;
  }
  if (hook.handler.type === "command" || hook.handler.type === "http") {
    return hookWorkspaceWords.dropped;
  }
  if (hook.handler.type === "mcp_tool") {
    return hookWorkspaceWords.mcpToolKept;
  }
};

/**
 * Why `harness` cannot run `hook`, in a sentence, or undefined when it runs
 * it: an event it raises no point for ({@link HOOK_EVENTS_ON}), a handler
 * that is not a command (a prompt, an agent, an HTTP post or an MCP tool are
 * Claude Code's own), or a condition (`if`), which is Claude Code's
 * permission-rule syntax.
 */
export const hookUnsupported = (
  harness: HookHarness,
  hook: Pick<FleetHook, "event" | "handler">
): string | undefined => {
  const name = harness === "opencode" ? "OpenCode" : "pi";
  const events: readonly HookEvent[] = HOOK_EVENTS_ON[harness];
  if (!events.includes(hook.event)) {
    return `${name} raises no ${hook.event}: it runs hooks on ${events.join(", ")}.`;
  }
  if (hook.handler.type !== "command") {
    return `${name} runs command hooks only; this one is a ${hook.handler.type} hook.`;
  }
  if (hook.handler.if?.trim()) {
    return `${name} does not read a condition (if): it is Claude Code's permission-rule syntax.`;
  }
  return undefined;
};

/** What a command hook's run came to, for the harness that ran it: a refusal's reason, words for the model, or nothing. */
export interface HookVerdict {
  /** Its refusal: exit 2 (its stderr), `decision: "block"`, or a PreToolUse `deny` (their reason). */
  block?: string;
  /** Words for the model: `additionalContext`, or what a SessionStart or UserPromptSubmit hook printed. */
  context?: string;
  /** A PreToolUse hook's rewrite of the call's input, in Claude Code's keys: taken outside a workspace only. */
  updatedInput?: Record<string, unknown>;
}

/**
 * A command hook's run read as Claude Code reads it (code.claude.com/docs/en/hooks,
 * "Exit code output" and "JSON output"): exit 2 blocks with its stderr; exit
 * 0 reads its stdout as JSON when it is (`decision: "block"`,
 * `hookSpecificOutput.permissionDecision: "deny"`, `continue: false`, each
 * with its reason, and `additionalContext`), else as words for the model on
 * SessionStart and UserPromptSubmit; any other exit is a hook that failed,
 * which blocks nothing.
 */
export const hookVerdict = (
  event: HookEvent,
  ran: { exit: number | null; stderr: string; stdout: string }
): HookVerdict => {
  if (ran.exit === 2) {
    return {
      block: ran.stderr.trim() || "A fleet hook refused it (exit 2).",
    };
  }
  if (ran.exit !== 0) {
    return {};
  }
  const out = ran.stdout.trim();
  const parsed = jsonObject(out);
  if (!parsed) {
    return out && (event === "SessionStart" || event === "UserPromptSubmit")
      ? { context: out }
      : {};
  }
  const specific = (parsed.hookSpecificOutput ?? {}) as Record<string, unknown>;
  const block = jsonBlock(parsed, specific);
  const context = saidText(specific.additionalContext);
  const updated = specific.updatedInput;
  return {
    ...(block ? { block } : {}),
    ...(context ? { context } : {}),
    ...(event === "PreToolUse" &&
    updated &&
    typeof updated === "object" &&
    !Array.isArray(updated)
      ? { updatedInput: updated as Record<string, unknown> }
      : {}),
  };
};

/** `text` as a JSON object, when it is one. */
const jsonObject = (text: string): Record<string, unknown> | undefined => {
  let value: unknown;
  try {
    value = text.startsWith("{") ? JSON.parse(text) : undefined;
  } catch {
    // Words, not JSON.
    value = undefined;
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

/** A value that is words, trimmed; nothing for anything else or for blank. */
const saidText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** A hook's JSON refusal, with its reason: `decision: "block"`, a PreToolUse `deny`, or `continue: false`. */
const jsonBlock = (
  parsed: Record<string, unknown>,
  specific: Record<string, unknown>
): string | undefined => {
  if (parsed.decision === "block") {
    return saidText(parsed.reason) ?? "A fleet hook refused it.";
  }
  if (specific.permissionDecision === "deny") {
    return (
      saidText(specific.permissionDecisionReason) ?? "A fleet hook refused it."
    );
  }
  if (parsed.continue === false) {
    return saidText(parsed.stopReason) ?? "A fleet hook stopped it.";
  }
};

/** The five things a hook can actually run. */
export type HookHandlerType =
  "command" | "http" | "mcp_tool" | "prompt" | "agent";

/** Fields every handler shares, whatever it runs. */
interface HookHandlerBase {
  /**
   * A single permission rule narrowing when this runs, like `Bash(git *)`.
   * Only consulted on tool events; on any other event a handler carrying one
   * never runs at all, which is why {@link hookProblem} refuses the pairing
   * rather than letting it be saved as a hook that silently does nothing.
   */
  if?: string;
  /** Spinner text while it runs. */
  statusMessage?: string;
  /** Seconds before it is cancelled. Claude Code's defaults apply when unset. */
  timeout?: number;
}

export interface HookCommandHandler extends HookHandlerBase {
  args?: string[];
  async?: boolean;
  asyncRewake?: boolean;
  /**
   * Absent when the hook carries a {@link FleetHook.script} — the daemon fills
   * it in with the path it wrote, because that path is machine-local and the
   * fleet row must not contain one machine's home directory.
   */
  command?: string;
  shell?: "bash" | "powershell";
  type: "command";
}

export interface HookHttpHandler extends HookHandlerBase {
  type: "http";
  url: string;
}

export interface HookMcpToolHandler extends HookHandlerBase {
  mcp_server_name: string;
  tool_name: string;
  type: "mcp_tool";
}

export interface HookPromptHandler extends HookHandlerBase {
  prompt: string;
  type: "prompt";
}

export interface HookAgentHandler extends HookHandlerBase {
  /** Which subagent runs it. Absent inherits Claude Code's default. */
  agent?: string;
  prompt: string;
  type: "agent";
}

export type HookHandler =
  | HookCommandHandler
  | HookHttpHandler
  | HookMcpToolHandler
  | HookPromptHandler
  | HookAgentHandler;

/**
 * One hook the fleet should have. Extends {@link FleetPlacement} so a hook can
 * be bound to a project the way an MCP server can — the scaffolding was
 * already there, this is the first row that reads it.
 */
export interface FleetHook extends FleetPlacement {
  /**
   * A disabled hook is simply not written to any machine. Claude Code itself
   * has no way to disable one hook while keeping it, so this is cawco's
   * to provide: the row stays, the registration goes.
   */
  enabled: boolean;
  event: HookEvent;
  /** Set on a targeted push only: overwrite a machine copy that drifted. */
  force?: boolean;
  handler: HookHandler;
  /** sha256 hex of the material a machine compares before writing. */
  hash: string;
  /** Client-generated, like a rule's — the editor owns creation. */
  id: string;
  matcher?: string;
  /** What the reader calls it. Unique across the fleet. */
  name: string;
  /**
   * A command hook's script body. CawCo writes it to a file on every machine
   * and points the registration at that path, so the hook travels — a machine
   * that has never seen this hook still runs it correctly. Absent means the
   * handler carries its own `command` and the reader is on their own for
   * getting that command onto each box.
   */
  script?: string;
}

/**
 * One superseded version of one hook, as a listing reads it — without the
 * material. A hook is kept every time it is saved or deleted over one that
 * already existed, so this is a full edit history. `createdAt` is a `Date` in
 * the hub and its ISO string on the wire (`GET /api/fleet/hooks/history`).
 */
export interface HookVersion {
  createdAt: Date;
  hash: string;
  hookId: string;
  id: number;
  name: string;
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited script a forced push took off that machine. */
  source: string;
}

/** A hook as the editor holds it, before the hub assigns identity and hash. */
export type HookDraft = Omit<FleetHook, "id" | "hash">;

/** A handler as a form holds it before it is checked: its kind, and each of that kind's fields perhaps not given yet. */
export type HookHandlerDraft = {
  [K in HookHandler["type"]]: Partial<Extract<HookHandler, { type: K }>> & {
    type: K;
  };
}[HookHandler["type"]];

/** A hook as its form holds it before it is checked ({@link hookProblem}). */
export type HookDraftForm = Omit<Partial<HookDraft>, "handler"> & {
  handler?: HookHandlerDraft;
};

const NAME_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/u;
const INVALID_REGEX_PREFIX = /^Invalid regular expression:\s*/u;
const SENTENCE_SEPARATOR = /[|,]/u;

/**
 * Everything wrong with a draft, as whole sentences the form prints under the
 * field that caused it. Empty means it is safe to save — and safe here means
 * safe to execute on every machine, so this is deliberately strict about the
 * cases that fail silently rather than loudly.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walks every draft field once per handler type — the last gate before a hook's script runs unattended on every machine in the fleet (see the block comment above).
export function hookProblem(draft: HookDraftForm): Record<string, string> {
  const wrong: Record<string, string> = {};

  const name = draft.name?.trim() ?? "";
  if (name === "") {
    wrong.name = "Give the hook a name so you can recognise it later.";
  } else if (!NAME_SHAPE.test(name)) {
    wrong.name =
      "A name starts with a letter or digit, then letters, digits, spaces, dots, dashes or underscores.";
  }

  if (!draft.event) {
    wrong.event = "Choose the moment this hook runs at.";
  } else if (!EVENT_INFO.has(draft.event)) {
    wrong.event = `“${draft.event}” is not an event Claude Code raises.`;
  }

  const matcher = draft.matcher?.trim() ?? "";
  if (matcher !== "" && draft.event && !hookTakesMatcher(draft.event)) {
    wrong.matcher = `${draft.event} has no matcher — it fires every time, and this would be ignored.`;
  }
  if (matcher !== "" && hookMatcherKind(matcher, draft.event) === "regex") {
    try {
      // biome-ignore lint/correctness/noUnusedInstantiation: constructed only to let an invalid pattern throw here, before it is ever stored — the instance itself is unused by design.
      // biome-ignore lint/style/useUnicodeRegex: compiled as Claude Code compiles a matcher, without a flag.
      new RegExp(matcher);
    } catch (error) {
      wrong.matcher = `That is not a valid regular expression — ${
        error instanceof Error
          ? error.message.replace(INVALID_REGEX_PREFIX, "")
          : "it will not compile"
      }.`;
    }
  }

  const { handler } = draft;
  if (!handler) {
    wrong.handler = "Choose what this hook should run.";
    return wrong;
  }

  // `if` is only read on tool events. Elsewhere the hook never runs at all,
  // which is the worst kind of wrong: configured, saved, silent.
  const TOOL_EVENTS = new Set<HookEvent>([
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "PermissionDenied",
  ]);
  if (handler.if?.trim() && draft.event && !TOOL_EVENTS.has(draft.event)) {
    wrong.if = `A condition is only read on tool events, so on ${draft.event} this hook would never run. Clear it.`;
  }
  if (
    handler.timeout !== undefined &&
    (!Number.isFinite(handler.timeout) || handler.timeout <= 0)
  ) {
    wrong.timeout = "A timeout is a number of seconds greater than zero.";
  }

  switch (handler.type) {
    case "command": {
      const script = draft.script?.trim() ?? "";
      const command = handler.command?.trim() ?? "";
      if (script === "" && command === "") {
        wrong.script =
          "Write the script this hook runs, or give a command already on every machine.";
      }
      if (script !== "" && command !== "") {
        wrong.script =
          "This has both a script and a command. Keep one — cawco points the hook at whichever it writes.";
      }
      // args means exec form: `command` is spawned directly with no shell.
      // A written script is spawned as the executable, so args are its
      // arguments — legal, but only if the reader knows that.
      if (
        handler.args &&
        handler.args.length > 0 &&
        script !== "" &&
        handler.args.some((arg) => typeof arg !== "string")
      ) {
        wrong.args = "Every argument is a string.";
      }
      break;
    }
    case "http": {
      const url = handler.url?.trim() ?? "";
      if (url === "") {
        wrong.url = "Give the URL this hook posts to.";
      } else {
        try {
          const parsed = new URL(url);
          if (
            parsed.protocol !== "https:" &&
            parsed.hostname !== "localhost" &&
            parsed.hostname !== "127.0.0.1"
          ) {
            wrong.url =
              "Use https, or a localhost address — this posts your session’s contents.";
          }
        } catch {
          wrong.url = "That is not a URL.";
        }
      }
      break;
    }
    case "mcp_tool": {
      if (!handler.mcp_server_name?.trim()) {
        wrong.mcp_server_name = "Name the MCP server holding the tool.";
      }
      if (!handler.tool_name?.trim()) {
        wrong.tool_name = "Name the tool to call.";
      }
      break;
    }
    case "prompt":
    case "agent": {
      if (!handler.prompt?.trim()) {
        wrong.prompt = "Write the prompt this hook evaluates.";
      }
      break;
    }
    default: {
      wrong.handler = "Choose what this hook should run.";
    }
  }

  if (draft.scope && draft.scope !== "user" && !draft.projectId) {
    wrong.scope =
      "A project-bound hook needs a project. Choose one, or make it fleet-wide.";
  }

  return wrong;
}

/**
 * The hook read back as one English sentence. The list prints it per row and
 * the editor prints it live above the form, so what is being configured stays
 * legible while it is configured — and so a matcher that silently became a
 * regular expression is visible as prose before it is visible as a bug.
 */
export function hookSentence(draft: Partial<HookDraft>): string {
  const info = draft.event ? EVENT_INFO.get(draft.event) : undefined;
  const when = info ? `When ${info.blurb}` : "When …";

  const matcher = draft.matcher?.trim() ?? "";
  const kind = hookMatcherKind(matcher, draft.event);
  let narrowed = "";
  if (info?.filters && kind !== "all") {
    narrowed =
      kind === "exact"
        ? ` and the ${info.filters} is ${matcher
            .split(SENTENCE_SEPARATOR)
            .map((p) => `“${p.trim()}”`)
            .join(" or ")}`
        : ` and the ${info.filters} matches the expression “${matcher}”`;
  }

  const { handler } = draft;
  let runs = "do something";
  if (handler) {
    switch (handler.type) {
      case "command": {
        runs = draft.script?.trim()
          ? "run this machine’s copy of the script below"
          : `run \`${handler.command ?? "…"}\``;
        break;
      }
      case "http": {
        runs = `post the event to ${handler.url || "…"}`;
        break;
      }
      case "mcp_tool": {
        runs = `call ${handler.mcp_server_name || "…"}’s ${handler.tool_name || "…"} tool`;
        break;
      }
      case "prompt": {
        runs = "ask a model to decide";
        break;
      }
      case "agent": {
        runs = "spawn a subagent to decide";
        break;
      }
      default: {
        runs = "spawn a subagent to decide";
      }
    }
  }

  const where =
    draft.scope && draft.scope !== "user"
      ? " in one project"
      : " on every machine in the fleet";

  const off =
    draft.enabled === false
      ? " It is turned off, so nothing is registered."
      : "";

  return `${when}${narrowed}, ${runs}${where}.${off}`;
}

/**
 * Starting points offered on the empty state. Deliberately dull and readable
 * end to end — a template is the one hook a reader is least likely to audit,
 * so none of them fetch anything or touch a path outside the project.
 */
export const HOOK_TEMPLATES: {
  title: string;
  blurb: string;
  draft: HookDraft;
}[] = [
  {
    title: "Format after every edit",
    blurb: "Runs your formatter whenever Claude writes or edits a file.",
    draft: {
      name: "Format after edit",
      enabled: true,
      event: "PostToolUse",
      matcher: "Edit|Write",
      handler: { type: "command", statusMessage: "Formatting…" },
      script: [
        // biome-ignore lint/plugin/no-system-path: a script the person keeps, run on any machine: env is at /usr/bin/env on every OS (the FHS's /usr/bin, linked there by distros outside it, macOS's protected /usr), and finds bash on the PATH the hook runs with.
        "#!/usr/bin/env bash",
        "# Runs after Claude edits a file. The event JSON arrives on stdin.",
        "set -euo pipefail",
        "",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: this is shell syntax for the generated bash script, not a JS template placeholder — the ${...} is meant for bash to expand, not this string.
        'cd "${CLAUDE_PROJECT_DIR:-.}"',
        "[ -f package.json ] || exit 0",
        "command -v bun >/dev/null 2>&1 || exit 0",
        "",
        "bun run format >/dev/null 2>&1 || true",
      ].join("\n"),
    },
  },
  {
    title: "Keep a command log",
    blurb:
      "Appends every shell command Claude runs to a file you can read later.",
    draft: {
      name: "Command log",
      enabled: true,
      event: "PreToolUse",
      matcher: "Bash",
      handler: { type: "command", async: true },
      script: [
        // biome-ignore lint/plugin/no-system-path: a script the person keeps, run on any machine: env is at /usr/bin/env on every OS (the FHS's /usr/bin, linked there by distros outside it, macOS's protected /usr), and finds bash on the PATH the hook runs with.
        "#!/usr/bin/env bash",
        `# Appends the command Claude is about to run to ${userLayerLabel("command-log")}.`,
        "set -euo pipefail",
        "",
        `log="${USER_LAYER_SHELL}/command-log"`,
        "input=$(cat)",
        'printf \'%s\\t%s\\n\' "$(date -Iseconds)" "$input" >> "$log"',
      ].join("\n"),
    },
  },
  {
    title: "Warn before touching .env",
    blurb: "Notices when a session reads or writes an environment file.",
    draft: {
      name: "Env file touched",
      enabled: false,
      event: "FileChanged",
      matcher: ".env|.envrc",
      handler: { type: "command", statusMessage: "Checking env files…" },
      script: [
        // biome-ignore lint/plugin/no-system-path: a script the person keeps, run on any machine: env is at /usr/bin/env on every OS (the FHS's /usr/bin, linked there by distros outside it, macOS's protected /usr), and finds bash on the PATH the hook runs with.
        "#!/usr/bin/env bash",
        "# Fires when a watched env file changes. Exit 2 to tell Claude about it.",
        "set -euo pipefail",
        "",
        'echo "An environment file changed — check it was intentional." >&2',
        "exit 2",
      ].join("\n"),
    },
  },
];
