/**
 * A stall of the agent's loop is said while it lasts, from a thread of its
 * own (agent loop-watch-worker.ts), with what the process says of the main
 * thread: the loop's own watch says a stall only once it has ended, and the
 * two of 2026-10-25 on obelisk (12:35, 13:48) never ended, so nothing said
 * what held the loop for 45 and 67 minutes, its thread on the CPU and
 * SIGTERM unheard, and the host's ptrace_scope let no stack be taken.
 *
 * The agent's loop watch (`watchLoop`, as daemon.ts starts it) runs in a
 * Bun process of its own, which then holds its loop {@link HOLD_MS} in a
 * marked section that spins on the CPU:
 *
 * (a) While held, the watch says so at 10 s and at 30 s, naming the main
 *     thread on the CPU (Linux) and the section it is in, not left.
 * (b) Once it is let go, the watch says it answers again, and the loop's own
 *     watch says the stall it ended, as it did before.
 *
 *   bun scripts/probe-kit/run.ts loop-held-said
 */
import { join } from "node:path";
import { loopWords } from "../../../packages/core/src/words/loop";
import { type Kit, ROOT, type Spec } from "../kit";

/** How long the loop is held: past the watch's second saying. */
const HOLD_MS = 35_000;
const SECTION = "probe: a spin on the CPU";

/** The process the loop watch runs in, held once it is up. */
const program = `
import { syncSection, watchLoop } from ${JSON.stringify(join(ROOT, "packages/agent/src/loop-watch.ts"))};
watchLoop((line) => console.warn(line));
setInterval(() => {}, 1000);
setTimeout(() => {
  syncSection(${JSON.stringify(SECTION)}, () => {
    const end = Date.now() + ${HOLD_MS};
    while (Date.now() < end) {}
  });
  setTimeout(() => process.exit(0), 4000);
}, 2000);
`;

export default {
  name: "loop-held-said",
  run: async (kit: Kit) => {
    const { check } = kit;
    const child = Bun.spawn(["bun", "-e", program], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [err, out] = await Promise.all([
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
      child.exited,
    ]);
    const lines = `${err}${out}`
      .split("\n")
      .filter((line) => line.includes("[loop]"));
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
      `a: held ${HOLD_MS / 1000} s, the watch from its own thread says so at 10 s and 30 s, the main thread on the CPU, in its section, not left`,
      held.length === 2 &&
        onCpu(atTen) &&
        onCpu(atThirty) &&
        inSection(atTen) &&
        inSection(atThirty),
      JSON.stringify(lines)
    );
    const again = lines.find((line) =>
      [34, 35, 36, 37].some((at) => line.includes(loopWords.answersAgain(at)))
    );
    // The loop's own line up to its number of ms.
    const endedAt = loopWords.heldEnded(0).slice(0, -"0 ms".length);
    const ended = lines.find((line) => line.startsWith(endedAt));
    check(
      "b: let go, the watch says it answers again, and the loop's own watch says the stall it ended",
      again !== undefined && ended?.includes(SECTION) === true,
      JSON.stringify(lines)
    );
  },
} satisfies Spec;
