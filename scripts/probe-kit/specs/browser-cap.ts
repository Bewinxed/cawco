/**
 * The kit's browser memory cap (browser-cap.ts): a page that allocates
 * without bound has its browser killed at the cap, the run fails with a
 * line naming the spec, the leg, the page and the cap, and nothing else
 * moves: a bystander browser in the same run still answers, and the run
 * itself ends in order.
 *
 * Each engine's leg is a kit run of its own (browser-cap-child.ts), with a
 * cap of {@link CAP_GIB} GiB so the page reaches it in seconds; the code
 * that watches and kills is the one every kit browser runs under.
 *
 * - (a) The runaway browser is killed: the cap's line is the run's, with
 *   `browser-cap-runaway (leg <leg>)`, the engine, the cap, the process
 *   holding the most and the page's address; the run exits 1 and its
 *   failed list holds that line.
 * - (b) It is killed near the cap: its tree's most at one look is under
 *   the cap and one look's growth more ({@link OVERSHOOT_GIB} GiB).
 * - (c) The bystander Chromium still answers its page afterwards.
 * - (d) How far the machine's MemAvailable fell while the page grew, read
 *   every 100 ms: said in a NOTE, never held to a bound, since every other
 *   run on the machine moves it too.
 *
 *   bun scripts/probe-kit/run.ts browser-cap
 */
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "browser-cap-child.ts");
const CAP_GIB = 1.5;
/** What one 250 ms look lets a page add past the cap, at most, with room: measured growth is said in (b). */
const OVERSHOOT_GIB = 1;

interface CapResult {
  bystander: string;
  capGiB: number;
  engine: string;
  failed: string[];
  killedAfterMs: number | null;
  killedLine: string | null;
  memAvailableDropGiB: number;
  peakGiB: number;
  runFailures: number;
}

async function leg(kit: Kit, engine: "chromium" | "webkit"): Promise<void> {
  const name = `grow-${engine}`;
  const child = Bun.spawn(
    [process.execPath, CHILD, engine, String(CAP_GIB), "--leg", name],
    { stdout: "pipe", stderr: "pipe" }
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const said = out.split("\n").find((one) => one.startsWith("CAP-RESULT "));
  if (!said) {
    kit.check(
      `(${engine}) the run said how it went`,
      false,
      `exit ${code}: ${(err || out).slice(-1500)}`
    );
    return;
  }
  const result = JSON.parse(said.slice("CAP-RESULT ".length)) as CapResult;
  const line = result.killedLine ?? "";
  kit.check(
    `(a ${engine}) the runaway browser is killed at the cap, and the run fails with a line naming the spec, the leg, the engine, the cap and the page`,
    code === 1 &&
      line.startsWith(
        `browser-cap-runaway (leg ${name}): its ${engine} browser was killed at the kit's memory cap of ${CAP_GIB.toFixed(2)} GiB`
      ) &&
      line.includes("data:text/html,<title>runaway</title>") &&
      result.failed.some((one) =>
        one.includes("its browsers stay under the kit's memory cap")
      ),
    `exit ${code}, killed ${result.killedAfterMs} ms after it began to grow: ${line}`
  );
  kit.check(
    `(b ${engine}) it is killed near the cap: its tree's most is under the cap and one look's growth`,
    result.peakGiB > CAP_GIB && result.peakGiB < CAP_GIB + OVERSHOOT_GIB,
    `${result.peakGiB.toFixed(2)} GiB at most, cap ${CAP_GIB} GiB`
  );
  kit.check(
    `(c ${engine}) the bystander browser still answers its page`,
    result.bystander === "bystander: quiet",
    result.bystander
  );
  // Said, never held to a bound: every other run on the machine moves it too.
  kit.note(
    `(d ${engine}) the machine's MemAvailable fell ${result.memAvailableDropGiB.toFixed(2)} GiB at most while the page grew (read every 100 ms; the cap is ${CAP_GIB} GiB, and the rest of the machine moves it too)`
  );
}

const spec: Spec = {
  name: "browser-cap",
  run: async (kit) => {
    await leg(kit, "chromium");
    await leg(kit, "webkit");
  },
};

export default spec;
