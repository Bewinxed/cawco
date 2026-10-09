/**
 * The keeper's process-table reader, on a thread of its own ({@link ./table}).
 * Each message asks for one reading; the answer is every process's pid,
 * parent, group and start, or the reason there is none. Spawned by table.ts,
 * and shipped in the binary as scripts/binary/process-table-worker.ts.
 */
import { processLineage } from "@cawco/core/process-identity";

export type TableAnswer =
  | {
      rows: { pgid: number; pid: number; ppid: number; started: string }[];
    }
  | { error: string };

declare const self: Worker;

self.onmessage = async () => {
  let answer: TableAnswer;
  try {
    answer = { rows: await processLineage() };
  } catch (error) {
    answer = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(answer);
};
