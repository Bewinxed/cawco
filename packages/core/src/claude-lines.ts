/**
 * CLAUDE CODE'S OWN LINES, READ WHERE THE AGENT'S CLAUDE HARNESS READS THEM:
 * a transcript's records on disk, and the lines its CLI writes on its stream
 * that the Agent SDK passes through without typing. Each is parsed here
 * once, so the harness reads a typed value and never asserts one. Every
 * shape is loose: a field nothing here names is kept as it was written, and
 * read where it is used.
 */

import {
  array,
  type GenericSchema,
  type InferOutput,
  literal,
  looseObject,
  nullable,
  number,
  optional,
  record,
  safeParse,
  string,
  union,
} from "valibot";

/** `schema`'s reading of a value: its output, or undefined when the value is not one. */
const readerOf =
  <S extends GenericSchema>(schema: S) =>
  (value: unknown): InferOutput<S> | undefined => {
    const read = safeParse(schema, value);
    return read.success ? read.output : undefined;
  };

/**
 * One line of a Claude Code transcript as the chain walk links it: its
 * `type`, and the fields that place it in its conversation. `uuid` is absent
 * on a line no record hangs from (a `queue-operation`).
 */
const ClaudeLineSchema = looseObject({
  parentUuid: optional(nullable(string())),
  sessionId: optional(string()),
  timestamp: optional(string()),
  type: string(),
  uuid: optional(string()),
});

/** A transcript line ({@link ClaudeLineSchema}). */
export type ClaudeLine = InferOutput<typeof ClaudeLineSchema>;

/** `value` as a transcript line, or undefined when it is not one. */
export const claudeLineOf = readerOf(ClaudeLineSchema);

/** A transcript line a message is made of: one with a `uuid` of its own. */
const ClaudeRecordSchema = looseObject({
  ...ClaudeLineSchema.entries,
  uuid: string(),
});

/** A transcript record ({@link ClaudeRecordSchema}). */
export type ClaudeRecord = InferOutput<typeof ClaudeRecordSchema>;

/** `value` as a transcript record, or undefined when it is not one. */
export const claudeRecordOf = readerOf(ClaudeRecordSchema);

/**
 * What a `compact_boundary` record says of its compaction
 * (`compactMetadata`): what triggered it, how full the context was, and the
 * records it kept, which the chain walk puts back after its summary.
 */
const CompactMetadataSchema = looseObject({
  preservedMessages: optional(
    looseObject({ anchorUuid: string(), uuids: array(string()) })
  ),
  preservedSegment: optional(
    looseObject({
      anchorUuid: string(),
      headUuid: string(),
      tailUuid: string(),
    })
  ),
  preTokens: optional(number()),
  trigger: optional(string()),
});

/** A compaction's metadata ({@link CompactMetadataSchema}). */
export type CompactMetadata = InferOutput<typeof CompactMetadataSchema>;

/** `value` as a compaction's metadata, or undefined when it is not one. */
export const compactMetadataOf = readerOf(CompactMetadataSchema);

/**
 * The CLI's word on one command it was sent (`command_lifecycle`): which
 * send (`command_uuid`, the uuid it carried) and where it stands (`state`:
 * `queued`, `started`, `completed`, `cancelled`). The Agent SDK passes the
 * line through without typing it (`SDKMessage` names no such member,
 * 0.3.325).
 */
const CommandLifecycleSchema = looseObject({
  command_uuid: string(),
  session_id: optional(string()),
  state: string(),
  type: literal("command_lifecycle"),
});

/** A command's lifecycle line ({@link CommandLifecycleSchema}). */
export type CommandLifecycle = InferOutput<typeof CommandLifecycleSchema>;

/** `value` as a command's lifecycle line, or undefined when it is not one. */
export const commandLifecycleOf = readerOf(CommandLifecycleSchema);

/**
 * The answers of an `AskUserQuestion` as Claude Code hands them back
 * (`AskUserQuestionOutput.answers`, keyed by question text): each a string,
 * or the strings of a multi-select, which a real transcript carries though
 * the SDK types it a string.
 */
const QuestionAnswersSchema = record(
  string(),
  union([string(), array(string())])
);

/** `value` as an `AskUserQuestion`'s answers, or undefined when it is not. */
export const questionAnswersOf = readerOf(QuestionAnswersSchema);

/** The notes and previews an `AskUserQuestion`'s answers carry, keyed by question text (`AskUserQuestionOutput.annotations`). */
const QuestionAnnotationsSchema = record(
  string(),
  looseObject({ notes: optional(string()), preview: optional(string()) })
);

/** `value` as an `AskUserQuestion`'s annotations, or undefined when it is not. */
export const questionAnnotationsOf = readerOf(QuestionAnnotationsSchema);
