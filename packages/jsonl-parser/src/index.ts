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
  type Checkpoint,
  fileStamp,
  ReverseReader,
  type ReverseOptions,
  readSpans,
  type ScanFileOptions,
  type ScanResult,
  scanFile,
  type Span,
} from "./file.ts";
export { parseMany, type ParseManyOptions } from "./pool.ts";
export { setSectionMarker } from "./section.ts";
export {
  completeLines,
  includesAny,
  lineRecords,
  lineSpans,
  newStats,
  parseObject,
  parseRecords,
  typeFilter,
  type BytePrefilter,
  type LineSpan,
  type ScanOptions,
} from "./scan.ts";
export {
  type DocAuthor,
  extractDoc,
  type ExtractOptions,
  type TranscriptDoc,
  userAuthor,
} from "./text.ts";
export type {
  AssistantRecord,
  AttachmentRecord,
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
