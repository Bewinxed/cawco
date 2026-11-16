/**
 * A SPAWN'S OPTIONS FOR CLAUDE CODE, AS ITS HARNESS READS THEM: the
 * harness-specific options a spawn carries (`SpawnPayload.options`, passed
 * through from whoever started the session), parsed once where the agent's
 * Claude harness reads them. The fields the harness reads are typed as the
 * Agent SDK's `Options` types them; every other is kept as it was sent, for
 * the SDK to read.
 */

import {
  array,
  boolean,
  type InferOutput,
  literal,
  looseObject,
  nullable,
  optional,
  record,
  safeParse,
  string,
  summarize,
  union,
  unknown,
} from "valibot";
import { harnessWords } from "./words/harness";

const texts = array(string());
const words = record(string(), string());

/** An MCP server a spawn names: one the CLI starts (stdio) or dials (SSE, HTTP). */
const McpServerSchema = union([
  looseObject({
    args: optional(texts),
    command: string(),
    env: optional(words),
    type: optional(literal("stdio")),
  }),
  looseObject({
    headers: optional(words),
    type: union([literal("sse"), literal("http")]),
    url: string(),
  }),
]);

/** A system prompt as the SDK's `Options.systemPrompt` takes it. */
const SystemPromptSchema = union([
  string(),
  texts,
  looseObject({
    prompt: union([string(), texts]),
    snapshot: optional(boolean()),
    type: literal("custom"),
  }),
  looseObject({
    append: optional(string()),
    excludeDynamicSections: optional(boolean()),
    preset: literal("claude_code"),
    snapshot: optional(boolean()),
    type: literal("preset"),
  }),
]);

const ClaudeCallerOptionsSchema = looseObject({
  disallowedTools: optional(texts),
  env: optional(record(string(), optional(string()))),
  extraArgs: optional(record(string(), nullable(string()))),
  mcpServers: optional(record(string(), McpServerSchema)),
  sandbox: optional(record(string(), unknown())),
  systemPrompt: optional(SystemPromptSchema),
});

/** A spawn's options for Claude Code ({@link ClaudeCallerOptionsSchema}). */
export type ClaudeCallerOptions = InferOutput<typeof ClaudeCallerOptionsSchema>;

/**
 * `value` (a spawn's `options`) as Claude Code's caller options: none when
 * it carries none (absent or null), and an error naming what does not read
 * when they are not options of this shape.
 */
export const claudeCallerOptionsOf = (
  value: unknown
): ClaudeCallerOptions | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const read = safeParse(ClaudeCallerOptionsSchema, value);
  if (!read.success) {
    throw new Error(harnessWords.claudeOptionsUnread(summarize(read.issues)));
  }
  return read.output;
};
