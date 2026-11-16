/**
 * PI'S STORED VALUES, AS THE AGENT READS THEM: the lines of a pi session
 * file, the content blocks of its messages, and the `details` CawCo's own
 * notices carry. pi types them (@earendil-works/pi-coding-agent
 * dist/core/session-manager.d.ts `FileEntry`, @earendil-works/pi-ai
 * dist/types.d.ts `Message` and its content), but a line read off disk is
 * only JSON, so each is parsed here by its schema where the agent reads it,
 * and the harness holds no cast of one. Each schema is pi's own shape as far
 * as CawCo reads it: a field CawCo does not read is not checked, and is kept
 * as written.
 */

import {
  boolean,
  type InferOutput,
  literal,
  looseObject,
  nullable,
  number,
  optional,
  picklist,
  record,
  string,
  unknown,
  variant,
} from "valibot";
import { readerOf } from "../reader-of";

// ------------------------------------------------------------- lines

/**
 * Any line of a session file, as the path walk links it: its `type`, and
 * the ids that place it in the session's tree (`SessionEntryBase`). The
 * header (`SessionHeader`) has an id and no parent.
 */
const PI_LINE = looseObject({
  type: string(),
  id: optional(string()),
  parentId: optional(nullable(string())),
});

/** `value` as a session file's line, or undefined when it is not one. */
export const piLineOf = readerOf(PI_LINE);

/**
 * A stored message (pi-ai `Message`, and the coding agent's own roles, such
 * as `bashExecution`): its role, its content (read block by block,
 * {@link piBlockOf}), and what an answer or a tool's result says of how it
 * ended.
 */
const PI_MESSAGE = looseObject({
  role: string(),
  content: optional(unknown()),
  errorMessage: optional(string()),
  stopReason: optional(string()),
  toolCallId: optional(string()),
  isError: optional(boolean()),
  timestamp: optional(number()),
});

/** A stored message ({@link PI_MESSAGE}). */
export type PiMessage = InferOutput<typeof PI_MESSAGE>;

/**
 * The lines CawCo reads more of than their place, each in pi's own shape:
 * the header's format version (`SessionHeader`), a message
 * (`SessionMessageEntry`), a compaction (`CompactionEntry`), and what an
 * extension said to the model (`CustomMessageEntry`: pi stores every custom
 * message as one of these, never as a `message` line, agent-session.js
 * `_appendCustomMessage`).
 */
const PI_ENTRY = variant("type", [
  looseObject({ type: literal("session"), version: optional(number()) }),
  looseObject({
    type: literal("message"),
    id: string(),
    timestamp: string(),
    message: PI_MESSAGE,
  }),
  looseObject({
    type: literal("compaction"),
    id: string(),
    timestamp: string(),
    summary: string(),
    firstKeptEntryId: string(),
    tokensBefore: number(),
  }),
  looseObject({
    type: literal("custom_message"),
    id: string(),
    timestamp: string(),
    customType: string(),
    details: optional(unknown()),
  }),
]);

/** `value` as one of the lines CawCo reads, or undefined for any other line. */
export const piEntryOf = readerOf(PI_ENTRY);

// ------------------------------------------------------------- content

/**
 * One block of a message's content, of the kinds CawCo draws (pi-ai
 * `TextContent`, `ThinkingContent`, `ToolCall`, `ImageContent`). A block of
 * another kind reads as none.
 */
const PI_BLOCK = variant("type", [
  looseObject({ type: literal("text"), text: string() }),
  looseObject({ type: literal("thinking"), thinking: string() }),
  looseObject({
    type: literal("toolCall"),
    id: string(),
    name: string(),
    arguments: optional(record(string(), unknown())),
  }),
  looseObject({ type: literal("image"), data: string(), mimeType: string() }),
]);

/** `value` as a content block CawCo draws, or undefined for any other. */
export const piBlockOf = readerOf(PI_BLOCK);

// ------------------------------------------------------------- notices

/**
 * The `details` of the notice a pi session's moved shell command leaves when
 * it ends (the agent's `BACKGROUND_SHELL` custom message): its
 * `task_notification` frame's fields.
 */
const PI_SHELL_END = looseObject({
  status: picklist(["completed", "failed"]),
  summary: string(),
  taskId: string(),
});

/** A moved shell command's end ({@link PI_SHELL_END}). */
export type PiShellEnd = InferOutput<typeof PI_SHELL_END>;

/** `value` as a moved shell command's end, or undefined when it is not one. */
export const piShellEndOf = readerOf(PI_SHELL_END);
