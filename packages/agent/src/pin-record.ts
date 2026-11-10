/**
 * What putting a build's pinned harnesses on replaced (`cawco binary-pins`,
 * tools.ts `putOnPins`), kept beside the binary installation until that build
 * is confirmed. A build whose pins went on and that then does not run (its
 * helper never started or took over, refused before the swap, or the build
 * was rolled back) leaves the build before running beside harnesses it
 * refuses: every one of those ways out puts the record back on
 * ({@link putBackPins}), and a confirm forgets it ({@link forgetPins}).
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  binaryRoot,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import { readWithin } from "@cawco/core/bounded";
import { failureSentence } from "@cawco/core/cli-failure";
import { hostEnvironment } from "@cawco/core/session-env";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { type PinMove, pinMoveWords, putOnPins } from "./tools";

const PinRecord = z.object({
  /** The build whose pins went on. */
  build: z.string(),
  /** Each moved tool's version before, by tool id: what goes back on. */
  tools: z.record(z.string(), z.string()),
});
type PinRecord = z.infer<typeof PinRecord>;

const recordPath = (): string => join(binaryRoot(), "pins-before.json");

const readPinRecord = async (): Promise<PinRecord | undefined> => {
  const record = PinRecord.safeParse(
    await Bun.file(recordPath())
      .json()
      .catch(() => undefined)
  );
  return record.success ? record.data : undefined;
};

/**
 * One move for `build`, recorded as it lands. The first version recorded for
 * a tool stays: it is what the machine had before any attempt at `build`. A
 * record of another build is replaced: that build is not being installed.
 */
export async function recordPinMove(
  build: string,
  move: PinMove
): Promise<void> {
  const before = await readPinRecord();
  const tools = before?.build === build ? { ...before.tools } : {};
  if (move.from && !(move.id in tools)) {
    tools[move.id] = move.from;
  }
  await writeJsonAtomic(recordPath(), {
    build,
    tools,
  } satisfies PinRecord);
}

/**
 * Puts back what went on for `build`, which is not going to run, for `runs`,
 * the build that does; then the record goes. Answers what went back on, or
 * throws the sentence of the one that did not.
 */
export async function putBackPins(
  build: string,
  runs: string
): Promise<string[]> {
  const record = await readPinRecord();
  if (record?.build !== build) {
    return [];
  }
  try {
    const moves = await putOnPins(record.tools, runs, () => Promise.resolve());
    return moves.map(pinMoveWords);
  } finally {
    await rm(recordPath(), { force: true });
  }
}

/**
 * The harnesses that went on for `version` before the swap put back for
 * `runs`, the build that runs instead, which refuses them: by `runs`'s own
 * `binary-pins back` ({@link runBinaryPins}), never by `version`, which may
 * not start at all. Never throws: what calls it is on its way out already.
 * `said` is told what went back, or the sentence of what did not, which is
 * also answered for the caller's record.
 */
export async function pinsBackFor(
  version: string,
  runs: string,
  said: {
    readonly back: (what: string) => Promise<void> | void;
    readonly failed: (sentence: string) => Promise<void> | void;
  }
): Promise<string | undefined> {
  try {
    const back = await runBinaryPins(runs, version);
    if (back) {
      await said.back(back);
    }
    return undefined;
  } catch (error) {
    const sentence = `what went on for ${version} did not go back: ${error instanceof Error ? error.message : String(error)}`;
    await said.failed(sentence);
    return sentence;
  }
}

/** `build` is confirmed: what went on for it stays on. */
export async function forgetPins(): Promise<void> {
  await rm(recordPath(), { force: true });
}

/**
 * How long one `binary-pins` gets: an npm or bun install of a harness takes
 * seconds to a minute, and the install's fence (10 min) must outlast it with
 * room for the swap. 5 min, our call.
 */
const PINS_MS = 5 * 60_000;

/**
 * `cawco binary-pins`, run from `from`'s own executable. With no `back`:
 * `from`'s pinned harnesses put on, with the methods `from`'s catalog knows
 * (the build before may not know one a copy here came from). With `back`
 * (a build that will not run): what went on for it put back for `from`, the
 * build that runs instead, and never by the build that will not run, which
 * may not start at all. Answers what it did, in words; throws its one
 * sentence when it did not, and the error's own line when it died of one
 * (core cli-failure.ts).
 */
export async function runBinaryPins(
  from: string,
  back?: string
): Promise<string> {
  const ran = await readWithin(PINS_MS, async (signal) => {
    const child = Bun.spawn(
      [versionExecutable(from), "binary-pins", ...(back ? ["back", back] : [])],
      { env: hostEnvironment(), stdout: "pipe", stderr: "pipe", signal }
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      const said = failureSentence(err);
      throw new Error(
        said ||
          `${from}'s binary-pins ${child.signalCode ? `was ended by ${child.signalCode}` : `exited ${code}`}`
      );
    }
    // Its last line is what it did; the lines before are the installers' own.
    return out.trim().split("\n").at(-1) ?? "";
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(
        `${from}'s binary-pins did not answer within ${PINS_MS / 60_000} minutes`
      );
    default:
      unhandled("read", ran);
  }
}
