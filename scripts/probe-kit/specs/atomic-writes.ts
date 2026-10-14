/**
 * A process killed in the middle of writing a record leaves the old record
 * or the new one, never NULs or a cut-off one: every file CawCo keeps is
 * written through core `writeStateFile`.
 *
 * A helper process writes one record 1000 times through it, each a 256 KB
 * JSON value naming its round, and is sent SIGKILL at a random moment while
 * it writes. 20 runs; after each the record must parse whole, name a round,
 * and carry its whole body. The same is done once more writing in place, a
 * piece at a time, as a streaming writer does (the control): that one is
 * expected to leave a cut-off record, which shows the probe catches what the
 * atomic writer prevents. A SIGKILL leaves the page cache whole, so this
 * proves the rename; the fsyncs, which carry it through a power loss, are
 * what no kill can reach.
 *
 *   bun scripts/probe-kit/run.ts atomic-writes
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delay } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const RUNS = 20;
const BODY = 256 * 1024;
const WRITER = join(import.meta.dir, "..", "atomic-writer.ts");

/** What the record holds after a kill: whole, or why not. */
const judge = async (file: string): Promise<string | undefined> => {
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) {
    return "missing";
  }
  if (text.includes("\0")) {
    return `${text.length} bytes holding NUL`;
  }
  try {
    const record = JSON.parse(text) as { round?: unknown; body?: unknown };
    if (typeof record.round !== "number") {
      return "no round";
    }
    if (typeof record.body !== "string" || record.body.length !== BODY) {
      return `body of ${String(record.body).length}`;
    }
  } catch (error) {
    return `${text.length} bytes that do not parse (${error instanceof Error ? error.message : String(error)})`;
  }
};

/** Runs the writer in `how`, kills it while it writes, and answers what it left. */
const killedOnce = async (
  dir: string,
  how: "atomic" | "plain"
): Promise<string | undefined> => {
  const file = join(dir, "record.json");
  const writer = Bun.spawn(["bun", WRITER, file, how, String(BODY)], {
    stdout: "pipe",
    stderr: "inherit",
  });
  // Under way: the writer says so once its first record is whole.
  const reader = writer.stdout.getReader();
  await reader.read();
  await delay(5 + Math.random() * 150);
  writer.kill("SIGKILL");
  await writer.exited;
  return await judge(file);
};

const spec: Spec = {
  name: "atomic-writes",
  run: async (kit: Kit) => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "atomic-"));
    try {
      const damaged: string[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        const dir = join(root, `atomic-${run}`);
        // biome-ignore lint/performance/noAwaitInLoops: one killed writer at a time
        const left = await killedOnce(dir, "atomic");
        if (left) {
          damaged.push(`run ${run}: ${left}`);
        }
        const strays = (await readdir(dir)).filter(
          (name) => name !== "record.json"
        );
        kit.note(
          `run ${run}: ${left ?? "whole"}; ${strays.length} unfinished temporary file(s) beside it, which the agent's sweep removes`
        );
      }
      kit.check(
        `${RUNS} writers killed mid-write: each left a whole record`,
        damaged.length === 0,
        damaged.join("; ")
      );
      const control: string[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one killed writer at a time
        const left = await killedOnce(join(root, `plain-${run}`), "plain");
        if (left) {
          control.push(left);
        }
      }
      kit.note(
        `control, written in place: ${control.length} of ${RUNS} kills left a damaged record (${control.slice(0, 3).join("; ")})`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
