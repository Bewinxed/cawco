/**
 * Claude Code session transcript record types.
 *
 * Grounded in a field census over 1,035 real transcripts (283k records,
 * Claude Code 1.x-2.x) plus community schema documentation. The format is
 * internal to Claude Code and unversioned, so every record type keeps an
 * open `Record<string, unknown>` passthrough: unknown fields and unknown
 * record types must survive a parse round-trip.
 */

/** Content block inside a `message.content` array. */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | UnknownBlock;

export interface TextBlock {
  type: "text";
  text: string;
  [key: string]: unknown;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
  [key: string]: unknown;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | ContentBlock[];
  is_error?: boolean | null;
  [key: string]: unknown;
}

export interface ImageBlock {
  type: "image";
  source?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UnknownBlock {
  type: string;
  [key: string]: unknown;
}

/** Token usage on assistant records (snake_case, as written to disk). */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * The 12-field envelope present on every user/assistant record in modern
 * transcripts. Older (pre-2.x) records may omit some of these, so treat
 * everything except `type` as possibly absent when parsing wild files.
 */
export interface RecordEnvelope {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  userType?: string;
  /** Present in subagent transcripts. */
  agentId?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface UserRecord extends RecordEnvelope {
  type: "user";
  message?: {
    role: "user";
    content: string | ContentBlock[];
    [key: string]: unknown;
  } | null;
  /** Raw tool output sidecar (present on ~50% of user records). */
  toolUseResult?: unknown;
  /** True for system-injected user records (not typed by a human). */
  isMeta?: boolean;
  sourceToolAssistantUUID?: string;
}

export interface AssistantRecord extends RecordEnvelope {
  type: "assistant";
  message?: {
    id?: string;
    role: "assistant";
    model?: string;
    content: ContentBlock[];
    stop_reason?: string | null;
    usage?: Usage;
    [key: string]: unknown;
  } | null;
  requestId?: string;
  isApiErrorMessage?: boolean;
}

export interface SystemRecord extends RecordEnvelope {
  type: "system";
  subtype?: string;
  content?: unknown;
  level?: string;
  isMeta?: boolean;
}

/**
 * What Claude Code attaches to the conversation chain. A `queued_command`
 * attachment is a message that arrived while a turn ran, folded into it at a
 * tool boundary: Claude Code writes no user record for it, so this is where
 * its words are (agent claude-transcript.ts `absorbedMessage` reads it the
 * same way for a transcript).
 */
export interface AttachmentRecord extends RecordEnvelope {
  type: "attachment";
  attachment?: {
    type?: string;
    /** The message as sent: its text, or content blocks when images rode with it. */
    prompt?: string | ContentBlock[];
    /** A command never shown, which nobody sent. */
    isMeta?: boolean;
    /** When it was sent. */
    timestamp?: string;
    [key: string]: unknown;
  } | null;
}

/** Compaction summary; appears as the first line of compacted/resumed sessions. */
export interface SummaryRecord {
  type: "summary";
  summary: string;
  /** UUID of the last record before compaction. */
  leafUuid?: string;
  [key: string]: unknown;
}

/** Any record type this library does not model explicitly. */
export interface OtherRecord extends RecordEnvelope {
  type: string;
}

export type TranscriptRecord =
  | UserRecord
  | AssistantRecord
  | AttachmentRecord
  | SystemRecord
  | SummaryRecord
  | OtherRecord;

/** A parsed line plus its physical location in the file. */
export interface LocatedRecord<T = TranscriptRecord> {
  record: T;
  /** 1-based line number. */
  line: number;
  /** Byte offset of the line start within the file. */
  offset: number;
  /** Byte length of the line (excluding the newline). */
  byteLength: number;
}

/** Outcome counters for one parse pass over a file. */
export interface ParseStats {
  lines: number;
  parsed: number;
  /** Lines that failed JSON.parse (corrupt writes; always skipped, never thrown). */
  invalid: number;
  /** Bytes consumed, including newlines. */
  bytes: number;
}
