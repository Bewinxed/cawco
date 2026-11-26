/**
 * What agy says over ACP, read as CawCo reads a session: its tool calls as
 * tool uses and their results, an ask's call as the tool CawCo's asks name,
 * its commands as slash commands, the models a session lists as the
 * model picker's rows, and a prompt's answer as its stop and its tokens.
 * Read from agy 1.5.18's own messages (the project's
 * `assets/3c6f6f4e/pb-default.log`): its `tool_call` carries the tool's
 * `name` and its arguments as `rawInput`, its `session/new` answer lists
 * every model under each thinking level (`models.availableModels`, which
 * ACP's own schema no longer names), and its prompt's answer carries the
 * turn's `usage`.
 */
import { EFFORT_LEVELS, type ModelInfo } from "@cawco/core/harness/kinds";
import type { SlashCommand } from "@cawco/core/session-messages";
import { Option, Schema } from "effect";

/**
 * agy's word on a call CawCo's hook rewrote, ahead of the call's own
 * output ("A pre-tool hook changed the arguments of this tool call before
 * it ran. Changed: CommandLine, RunPersistent."): CawCo's, not the call's,
 * so the person never reads it.
 */
const HOOK_NOTICE =
  /^A pre-tool hook changed the arguments of this tool call before it ran\. Changed: [^\n]*\n*/u;

/** `text` without agy's word on CawCo's rewrite ({@link HOOK_NOTICE}). */
const withoutHookNotice = (text: string): string =>
  text.replace(HOOK_NOTICE, "");

const TextContent = Schema.Struct({
  type: Schema.Literal("content"),
  content: Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
});
const isTextContent = Schema.is(TextContent);
const RawOutput = Schema.Struct({ output: Schema.String });
const isRawOutput = Schema.is(RawOutput);

/**
 * Whether a finished call's output opens with agy's word on CawCo's
 * rewrite ({@link HOOK_NOTICE}), in its text content or its raw output:
 * the proof that agy ran the command as the hook rewrote it.
 */
export const carriesHookNotice = (update: {
  content?: readonly unknown[] | null;
  rawOutput?: unknown;
}): boolean =>
  (update.content ?? []).some(
    (part) => isTextContent(part) && HOOK_NOTICE.test(part.content.text)
  ) ||
  (isRawOutput(update.rawOutput) && HOOK_NOTICE.test(update.rawOutput.output));

/**
 * What a finished call said, as its result: its text content, else its raw
 * output's, else what agy wrote of it in its transcript (`written`,
 * agy-transcript.ts: agy says an MCP tool's or `read_file`'s result
 * there alone), without CawCo's notice.
 */
export const callResult = (
  update: {
    content?: readonly unknown[] | null;
    rawOutput?: unknown;
  },
  written: string | undefined
): string => {
  const texts = (update.content ?? []).flatMap((part) =>
    isTextContent(part) ? [part.content.text] : []
  );
  if (texts.length > 0) {
    return withoutHookNotice(texts.join("\n"));
  }
  if (isRawOutput(update.rawOutput)) {
    return withoutHookNotice(update.rawOutput.output);
  }
  return withoutHookNotice(written ?? "");
};

const Args = Schema.Record(Schema.String, Schema.Unknown);
const isArgs = Schema.is(Args);

/** A call's arguments as agy handed them (`rawInput`), or none. */
export const argsOf = (raw: unknown): Readonly<Record<string, unknown>> =>
  isArgs(raw) ? raw : {};

const stringArg = (
  args: Readonly<Record<string, unknown>>,
  name: string
): string | undefined => {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
};

/**
 * A call agy asks about, as CawCo's asks name a tool and read its input
 * (Claude Code's names, as Codex's asks are put): a command as `Bash`, a
 * file write as `Write`, an edit as `Edit`; any other under its own name
 * with its arguments.
 */
export const askedCall = (
  name: string,
  args: Readonly<Record<string, unknown>>
): { input: Record<string, unknown>; toolName: string } => {
  const path = stringArg(args, "Path");
  switch (name) {
    case "run_command": {
      const summary = stringArg(args, "toolSummary");
      return {
        toolName: "Bash",
        input: {
          command: stringArg(args, "CommandLine") ?? "",
          ...(summary ? { description: summary } : {}),
        },
      };
    }
    case "write_file":
      return {
        toolName: "Write",
        input: { file_path: path ?? "", content: args.Content ?? "" },
      };
    case "edit_file":
      return { toolName: "Edit", input: { file_path: path ?? "", ...args } };
    default:
      return { toolName: name, input: { ...args } };
  }
};

/**
 * agy's commands no CawCo session runs: its subagents, swarms, workflows,
 * browser and schedules, which CawCo's own tools stand for (core
 * harness/agy.ts `AGY_TOOLS`), and its guide to its own customizations.
 */
const HIDDEN_COMMANDS = new Set([
  "browser",
  "teamwork",
  "boost",
  "swarm",
  "run-workflow",
  "schedule",
  "agy-customizations",
  "learn",
]);

/** agy's `available_commands_update` as the session's slash commands, those CawCo runs alone. */
export const commandsOf = (
  available: readonly { description: string; name: string }[]
): SlashCommand[] =>
  available
    .filter((command) => !HIDDEN_COMMANDS.has(command.name))
    .map((command) => ({
      name: command.name,
      description: command.description,
      argumentHint: "",
      kind: command.name === "compact" ? "builtin" : "skill",
    }));

/** The thinking levels agy names, low to high: CawCo's effort levels but `max`; a model id is its option's value and one of these. */
const LEVELS = EFFORT_LEVELS.filter((level) => level !== "max");

const Listed = Schema.Struct({
  models: Schema.optional(
    Schema.Struct({
      availableModels: Schema.Array(
        Schema.Struct({ modelId: Schema.String, name: Schema.String })
      ),
    })
  ),
  configOptions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        currentValue: Schema.optional(Schema.Unknown),
        options: Schema.optional(
          Schema.Array(
            Schema.Struct({ value: Schema.String, name: Schema.String })
          )
        ),
      })
    )
  ),
});
const decodeListed = Schema.decodeUnknownOption(Listed);

/**
 * The models a session lists, as the picker's rows: each model option agy
 * offers (`configOptions` `model`), with the thinking levels its
 * `availableModels` list under it (`<model>-<level>`). None when the answer
 * names no model option.
 */
export const modelsOf = (answer: unknown): ModelInfo[] => {
  const listed = Option.getOrUndefined(decodeListed(answer));
  const option = listed?.configOptions?.find((one) => one.id === "model");
  if (!option?.options) {
    return [];
  }
  const ids = new Set(
    (listed?.models?.availableModels ?? []).map((model) => model.modelId)
  );
  return option.options.map((model): ModelInfo => {
    const levels = LEVELS.filter((level) => ids.has(`${model.value}-${level}`));
    return {
      value: model.value,
      displayName: model.name,
      supportsEffort: levels.length > 0,
      ...(levels.length > 0 ? { supportedEffortLevels: [...levels] } : {}),
    };
  });
};

/** The value config option `id` holds now in a session's answer, when it is a string. */
export const currentOption = (
  answer: unknown,
  id: string
): string | undefined => {
  const listed = Option.getOrUndefined(decodeListed(answer));
  const value = listed?.configOptions?.find(
    (one) => one.id === id
  )?.currentValue;
  return typeof value === "string" ? value : undefined;
};

/** The thinking levels a session's answer offers for its model now, low to high. */
export const levelsOffered = (answer: unknown): string[] => {
  const listed = Option.getOrUndefined(decodeListed(answer));
  return (
    listed?.configOptions
      ?.find((one) => one.id === "thought_level")
      ?.options?.map((one) => one.value) ?? []
  );
};

/**
 * The thinking level a session sends for CawCo's `effort` among the levels
 * agy offers its model: the level itself, else the highest offered below
 * it (`max` reads as agy's highest), else none.
 */
export const levelFor = (
  effort: string,
  offered: readonly string[]
): string | undefined => {
  const levels: readonly string[] = LEVELS;
  const rank = levels.indexOf(effort === "max" ? "xhigh" : effort);
  return [...LEVELS]
    .slice(0, rank + 1)
    .reverse()
    .find((level) => offered.includes(level));
};

const Answered = Schema.Struct({
  stopReason: Schema.String,
  usage: Schema.optional(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      cachedReadTokens: Schema.optional(Schema.NullOr(Schema.Number)),
      cachedWriteTokens: Schema.optional(Schema.NullOr(Schema.Number)),
      thoughtTokens: Schema.optional(Schema.NullOr(Schema.Number)),
    })
  ),
});
const decodeAnswered = Schema.decodeUnknownOption(Answered);

/** A prompt's tokens, as CawCo counts a request's. */
export interface PromptTokens {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
}

/**
 * A prompt's answer: why it stopped, and its tokens (agy's `inputTokens`
 * leave out its cache reads, which it counts apart; its thinking is output).
 */
export const promptAnswer = (
  answer: unknown
): { stopReason: string; tokens: PromptTokens | undefined } => {
  const read = Option.getOrUndefined(decodeAnswered(answer));
  const usage = read?.usage;
  return {
    stopReason: read?.stopReason ?? "end_turn",
    tokens: usage
      ? {
          input: usage.inputTokens,
          output: usage.outputTokens + (usage.thoughtTokens ?? 0),
          cacheRead: usage.cachedReadTokens ?? 0,
          cacheWrite: usage.cachedWriteTokens ?? 0,
        }
      : undefined,
  };
};

const Appends = Schema.Struct({
  agentCapabilities: Schema.Struct({
    _meta: Schema.Struct({
      antigravity: Schema.Struct({
        systemPrompt: Schema.Struct({ append: Schema.Literal(true) }),
      }),
    }),
  }),
});

/** Whether agy's `initialize` answer says it takes words appended to its system prompt (`_meta.antigravity.systemPrompt.append`). */
export const takesAppend = Schema.is(Appends);
