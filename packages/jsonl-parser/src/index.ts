/**
 * @cawco/jsonl-parser — fast, incremental parser for agent-session
 * transcripts, with BM25 search layers as subpath exports:
 *
 * - `@cawco/jsonl-parser`           core (runtime-neutral): types, byte
 *                                     scanner, lazy parse, text extraction,
 *                                     checkpoints, worker fan-out
 * - `@cawco/jsonl-parser/fts5`      BM25 index over parsed docs (bun:sqlite)
 * - `@cawco/jsonl-parser/opencode`  OpenCode sqlite adapter (bun:sqlite)
 */

export {
  readTranscript,
  readTranscriptEnd,
  readTranscriptTail,
  type Checkpoint,
  type ReadEndOptions,
  type ReadEndResult,
  type ReadResult,
} from "./file.ts";
export { parseMany, type ParseManyOptions } from "./pool.ts";
export {
  includesAny,
  lineSpans,
  newStats,
  parseRecords,
  typeFilter,
  type BytePrefilter,
  type LineSpan,
  type ScanOptions,
} from "./scan.ts";
export { extractDoc, type ExtractOptions, type TranscriptDoc } from "./text.ts";
export type {
  AssistantRecord,
  ContentBlock,
  ImageBlock,
  LocatedRecord,
  OtherRecord,
  ParseStats,
  RecordEnvelope,
  SummaryRecord,
  SystemRecord,
  TextBlock,
  ThinkingBlock,
  ToolResultBlock,
  ToolUseBlock,
  TranscriptRecord,
  UnknownBlock,
  Usage,
  UserRecord,
} from "./types.ts";
export type { WorkerFileResult, WorkerTask } from "./worker.ts";
