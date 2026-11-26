/**
 * Antigravity adapter: an agy conversation's transcript steps as documents,
 * for the same sync and the same index as Claude Code's (docs.ts
 * `scanDocs`).
 *
 * agy 1.5 writes one append-only JSONL file per conversation, at
 * `<app-data>/brain/<conversation id>/.system_generated/logs/transcript_full.jsonl`,
 * one step a line: `{step_index, source, type, status, created_at, content,
 * thinking, model, tool_calls: [{name, args}], error}`. Its path is the only
 * place that names the conversation; no line names its folder.
 *
 * A conversation's words are its steps of these types: `USER_INPUT` (the
 * person's words inside `<USER_REQUEST>`, agy's own metadata after them),
 * `PLANNER_RESPONSE` (the model's thinking, reply and tool calls) and
 * `GENERIC` (one tool call's result). agy's system messages are its own
 * notices and reminders to the model, and a `CHECKPOINT` retells the
 * conversation the file still holds, so neither is searched.
 */

import { type ContentBlock, type TranscriptRecord } from "./types.ts";
import { contentWords, type ExtractOptions, type TranscriptDoc } from "./text.ts";

/** The step types a document is made from, as the byte prefilter matches them (scan.ts `typeFilter`). */
export const AGY_DOC_TYPES = ["USER_INPUT", "PLANNER_RESPONSE", "GENERIC"] as const;

/** Where a transcript's conversation id stands in its path: the dir under `brain/`. */
const BRAIN_ID = /[\\/]brain[\\/]([^\\/]+)[\\/]\.system_generated[\\/]/;

/** The conversation the transcript at `path` is, or null for a path of no such shape. */
export function agyConversationOf(path: string): string | null {
  return BRAIN_ID.exec(path)?.[1] ?? null;
}

const USER_REQUEST = /<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Whether `value` is a JSON object, its keys each read as unknown. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A response's tool calls as Claude Code's `tool_use` blocks. */
function callBlocks(calls: unknown): ContentBlock[] {
  if (!Array.isArray(calls)) {
    return [];
  }
  return calls.flatMap((call: unknown) =>
    isObject(call) && typeof call.name === "string"
      ? [
          {
            type: "tool_use",
            id: "",
            name: call.name,
            input: isObject(call.args) ? call.args : {},
          },
        ]
      : [],
  );
}

/** Which role a step is in a document, and its content in Claude Code's blocks; null for a step with no words. */
function asBlocks(
  step: TranscriptRecord,
): { content: string | ContentBlock[]; role: TranscriptDoc["role"] } | null {
  switch (step.type) {
    case "USER_INPUT": {
      const said = text(step.content);
      return { role: "user", content: USER_REQUEST.exec(said)?.[1] ?? said };
    }
    case "PLANNER_RESPONSE":
      return {
        role: "assistant",
        content: [
          ...(step.thinking ? [{ type: "thinking", thinking: text(step.thinking) }] : []),
          ...(step.content ? [{ type: "text", text: text(step.content) }] : []),
          ...callBlocks(step.tool_calls),
        ],
      };
    case "GENERIC":
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "",
            content: text(step.error) || text(step.content),
          },
        ],
      };
    default:
      return null;
  }
}

/** A transcript's step as a document of conversation `sessionId`, or null for one with no words. */
export function agyDoc(
  record: TranscriptRecord,
  sessionId: string,
  options: ExtractOptions = {},
): TranscriptDoc | null {
  const step = record;
  const blocks = asBlocks(step);
  const words = blocks && contentWords(blocks.role, blocks.content, options);
  if (!(blocks && words)) {
    return null;
  }
  const at = text(step.created_at);
  const model = text(step.model);
  return {
    harness: "agy",
    sessionId,
    id: String(step.step_index ?? ""),
    role: blocks.role,
    timestamp: at || undefined,
    model: blocks.role === "assistant" && model ? model : undefined,
    ...words,
  };
}
