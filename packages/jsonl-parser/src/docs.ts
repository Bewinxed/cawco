/**
 * A transcript file's documents, by whose transcript it is: the one read a
 * sync's tails and its workers' full parses both take (fts5.ts `sync`,
 * worker.ts `runTask`). Both harnesses here write one append-only JSONL file
 * per session, so a file's checkpoint, its batches and its commit are one
 * path; only how a record becomes a document differs.
 */

import { type Checkpoint, firstRecord, type ScanResult, scanFile } from "./file.ts";
import { PI_DOC_TYPES, piDoc, piSessionOf } from "./pi.ts";
import { typeFilter } from "./scan.ts";
import { DOC_TYPES, type ExtractOptions, extractDoc, type TranscriptDoc } from "./text.ts";

/** The harnesses whose transcripts are files. */
export const FILE_HARNESSES = ["claude-code", "pi"] as const;
export type FileHarness = (typeof FILE_HARNESSES)[number];

/** A transcript file and whose it is. */
export interface TranscriptFile {
  harness: FileHarness;
  path: string;
}

export interface ScanDocsOptions {
  extract?: ExtractOptions;
  /** Where an earlier scan stopped; absent (or no longer valid): from the start. */
  from?: Checkpoint;
}

const READERS: Record<
  FileHarness,
  (path: string, options: ScanDocsOptions) => Promise<ScanResult<TranscriptDoc>>
> = {
  "claude-code": (path, { extract, from }) =>
    scanFile(path, {
      from,
      prefilter: typeFilter(...DOC_TYPES),
      pick: (located) => extractDoc(located.record, extract) ?? undefined,
    }),
  // Only the header names the session and its folder, and a tail starts past
  // it. A file with none yet fails here, so no checkpoint passes its words by.
  pi: async (path, { extract, from }) => {
    const session = piSessionOf(await firstRecord(path));
    if (!session) {
      throw new Error("no pi session header");
    }
    return await scanFile(path, {
      from,
      prefilter: typeFilter(...PI_DOC_TYPES),
      pick: (located) => piDoc(located.record, session, extract) ?? undefined,
    });
  },
};

/** Every document of `file` from `options.from` on, in file order ({@link scanFile}). */
export const scanDocs = (
  file: TranscriptFile,
  options: ScanDocsOptions = {},
): Promise<ScanResult<TranscriptDoc>> => READERS[file.harness](file.path, options);
