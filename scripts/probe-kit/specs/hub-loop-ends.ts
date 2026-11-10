/**
 * A hub whose loop is held for good is ended by its own watch, and its
 * service starts it again (hub hub-loop.ts, core loop-watch-worker.ts).
 *
 * 2026-11-04 23:16:55, obelisk's hub: a continuation advanced again and
 * again in microtasks, so no timer, socket or log line ran for 18 minutes,
 * at 100% CPU, until a person killed it.
 *
 * No fleet: a process with the hub's loop watch on (hub-loop-child.ts),
 * its bound {@link END_MS}, names its work and holds its loop, once in a
 * loop of microtasks that never yields, once in a synchronous loop. Each:
 *
 * (a) The process is killed (SIGKILL) once its loop has been held past the
 *     bound, and not long after.
 * (b) Its last lines say the loop was held past its bound and that the
 *     process is ended for its service to start again, naming the work it
 *     started last.
 * (c) Its record keeps that work and the hold; the next process with the
 *     watch on says it once, as the hub before it ended by its watch, and
 *     lets the record go.
 *
 *   bun scripts/probe-kit/run.ts hub-loop-ends
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoopEndedSchema } from "../../../packages/core/src/loop-watch-shared";
import type { Kit, Spec } from "../spec";

const CHILD = join(import.meta.dir, "..", "hub-loop-child.ts");
/** The bound the child's watch ends it at. The watch calls a loop held from 10 s, so past that. */
const END_MS = 12_000;
/** How long past the bound the end may come: the watch looks once a second. */
const SLACK_MS = 5000;

/** One run of the child: how it ended, when, and what it wrote. */
const runChild = async (
  record: string,
  mode: "microtasks" | "sync" | "after"
): Promise<{
  ms: number;
  signal: string | null;
  code: number | null;
  said: string;
}> => {
  const from = Date.now();
  const child = Bun.spawn(
    [process.execPath, CHILD, record, String(END_MS), mode],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    }
  );
  const killer = setTimeout(() => child.kill("SIGKILL"), END_MS + 60_000);
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  clearTimeout(killer);
  return {
    ms: Date.now() - from,
    signal: child.signalCode === null ? null : String(child.signalCode),
    code: child.exitCode,
    said: `${out}${err}`,
  };
};

const spec: Spec = {
  group: "The hub and machines",
  name: "hub-loop-ends",
  run: async (kit: Kit) => {
    const { check } = kit;
    const dir = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "hub-loop-ends-")
    );
    try {
      for (const mode of ["microtasks", "sync"] as const) {
        const record = join(dir, `${mode}.json`);
        const held = await runChild(record, mode);
        const name = `probe hold: ${mode}`;
        check(
          `a (${mode}): held past its ${END_MS / 1000} s bound, the process is killed (SIGKILL), within ${SLACK_MS / 1000} s of it`,
          held.signal === "SIGKILL" &&
            held.ms >= END_MS &&
            held.ms <= END_MS + 1000 + SLACK_MS,
          `signal ${held.signal}, code ${held.code}, after ${held.ms} ms`
        );
        const lines = held.said.split("\n");
        const ending = lines.find((line) =>
          line.includes("past its bound: the hub is ended now (SIGKILL)")
        );
        const named = lines.find(
          (line) =>
            line.includes("the hub's loop has been held") &&
            line.includes(`the work it started last: ${name}`)
        );
        check(
          `b (${mode}): its last lines say the hold past the bound and the end, naming the work it started last`,
          ending !== undefined && named !== undefined,
          held.said.slice(-1500)
        );
        const kept = existsSync(record)
          ? LoopEndedSchema.parse(JSON.parse(readFileSync(record, "utf8")))
          : undefined;
        const after = await runChild(record, "after");
        const said = after.said
          .split("\n")
          .find((line) =>
            line.includes("the hub before this one was ended by its watch")
          );
        check(
          `c (${mode}): its record keeps the work and the hold; the next process says it once and lets it go`,
          kept?.doing === name &&
            (kept?.heldMs ?? 0) >= END_MS &&
            after.code === 0 &&
            said?.includes(`the work it started last: ${name}`) === true &&
            !existsSync(record),
          `record ${JSON.stringify(kept)}; next ${after.code}: ${said ?? after.said.slice(-500)}`
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export default spec;
