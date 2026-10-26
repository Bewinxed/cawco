/**
 * A stall of the agent's loop is said while it lasts, from a thread of its
 * own (agent loop-watch-worker.ts), with what the process says of the main
 * thread: the loop's own watch says a stall only once it has ended, and the
 * two of 2026-10-25 on obelisk (12:35, 13:48) never ended, so nothing said
 * what held the loop for 45 and 67 minutes, its thread on the CPU and
 * SIGTERM unheard, and the host's ptrace_scope let no stack be taken.
 *
 * Proven in the compiled binary, where the watch's thread starts from an
 * entry the binary embeds (build-binary.ts, loop-watch.ts `WATCHDOG_URL`),
 * not from the source beside it: this machine's target is compiled as a
 * proof build (assets prepared first when none are), and its
 * `proof-loop-held` (scripts/binary/proof-loop-held.ts) starts the loop
 * watch as daemon.ts does, then holds its loop {@link HOLD_MS} in a marked
 * section that spins on the CPU:
 *
 * (a) While held, the watch says so at 10 s and at 30 s, naming the main
 *     thread on the CPU (Linux) and the section it is in, not left.
 * (b) Once it is let go, the watch says it answers again, and the loop's own
 *     watch says the stall it ended, as it did before.
 *
 *   bun scripts/probe-kit/run.ts loop-held-said
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loopWords } from "../../../packages/core/src/words/loop";
import { HOLD_MS, SECTION } from "../../binary/proof-loop-held";
import { compileBinary, prepareAssets, TARGETS } from "../../build-binary";
import { type Kit, ROOT, type Spec } from "../kit";

/** This machine's binary target, as build-binary.ts names it. */
const hostTarget = (): string => {
  const target = `${process.platform}-${process.arch}`;
  if (!TARGETS.includes(target as (typeof TARGETS)[number])) {
    throw new Error(`No binary target for ${target}`);
  }
  return target;
};

export default {
  group: "Speed",
  name: "loop-held-said",
  run: async (kit: Kit) => {
    const { check } = kit;
    if (!existsSync(join(ROOT, ".context/binary-build/prepared.json"))) {
      await prepareAssets({ dashboard: true });
    }
    const binary = join(kit.out, "cawco");
    await compileBinary({
      target: hostTarget(),
      outfile: binary,
      version: "0.0.1-loop-held",
      commit: "loop-held",
      proof: true,
    });
    // The proof runtime runs only under a scratch HOME it can tell by name.
    const home = join(kit.out, "binary-home");
    await mkdir(home, { recursive: true });
    const child = Bun.spawn([binary, "proof-loop-held"], {
      cwd: home,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [err, out, code] = await Promise.all([
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
      child.exited,
    ]);
    kit.note(`the compiled binary's proof-loop-held exited ${code}`);
    const lines = `${err}${out}`
      .split("\n")
      .filter((line) => line.includes("[loop]"));
    for (const line of lines) {
      kit.note(line);
    }
    const atTen = lines.find((line) => line.includes(loopWords.heldNow(10)));
    const atThirty = lines.find((line) => line.includes(loopWords.heldNow(30)));
    // Said at 10 s and 30 s, and not again before 60 s.
    const held = lines.filter((line) =>
      [10, 30, 60].some((at) => line.includes(loopWords.heldNow(at)))
    );
    const onCpu = (line: string | undefined) =>
      process.platform !== "linux" ||
      line?.includes(loopWords.onCpu()) === true;
    const inSection = (line: string | undefined) =>
      line?.includes(loopWords.lastSection(SECTION, false)) === true;
    check(
      `a: the compiled binary held ${HOLD_MS / 1000} s, the watch from its own thread says so at 10 s and 30 s, the main thread on the CPU, in its section, not left`,
      held.length === 2 &&
        onCpu(atTen) &&
        onCpu(atThirty) &&
        inSection(atTen) &&
        inSection(atThirty),
      `${JSON.stringify(lines)}${err ? `\n${err}` : ""}`
    );
    const again = lines.find((line) =>
      [34, 35, 36, 37].some((at) => line.includes(loopWords.answersAgain(at)))
    );
    // The loop's own line up to its number of ms.
    const endedAt = loopWords.heldEnded(0).slice(0, -"0 ms".length);
    const ended = lines.find((line) => line.startsWith(endedAt));
    check(
      "b: let go, the watch says it answers again, and the loop's own watch says the stall it ended",
      code === 0 && again !== undefined && ended?.includes(SECTION) === true,
      JSON.stringify(lines)
    );
  },
} satisfies Spec;
