/**
 * The keeper's process-table reader, on a thread of its own ({@link ./table}).
 * Each message asks for one reading; the answer is every process's pid,
 * parent, group and start, or the reason there is none. A reading asked
 * `marked` also reads each process's environment for the keeper's tree mark
 * (`CAWCO_SESSIOND_TREE`, core `CAWCO_ENV.sessiondTree`), and a process that
 * carries one is answered with it and its command line. Spawned by table.ts,
 * and shipped in the binary as scripts/binary/process-table-worker.ts.
 */
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { processArgs, processLineage } from "@cawco/core/process-identity";

interface TableRow {
  /** Its command line, its arguments joined by a space: read only for a process that carries a tree mark. */
  command?: string;
  pgid: number;
  pid: number;
  ppid: number;
  started: string;
  /** The tree mark its environment carries, in a marked reading. */
  tree?: string;
}

export type TableAnswer = { rows: TableRow[] } | { error: string };

/** What a reading is asked: with the tree marks, or the lineage alone. */
export interface TableAsk {
  marked: boolean;
}

const MARK = `${CAWCO_ENV.sessiondTree}=`;

declare const self: Worker;

/** `row` with the tree mark its environment carries, and its command line, when it carries one. */
const markedRow = async (row: TableRow): Promise<TableRow> => {
  const args = await processArgs(row.pid);
  const tree = args?.env
    .find((variable) => variable.startsWith(MARK))
    ?.slice(MARK.length);
  return args && tree ? { ...row, tree, command: args.argv.join(" ") } : row;
};

self.onmessage = async (event: MessageEvent<TableAsk>) => {
  let answer: TableAnswer;
  try {
    const rows: TableRow[] = (await processLineage()).map(
      ({ pid, ppid, pgid, started }) => ({ pid, ppid, pgid, started })
    );
    answer = {
      rows: event.data.marked ? await Promise.all(rows.map(markedRow)) : rows,
    };
  } catch (error) {
    answer = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(answer);
};
