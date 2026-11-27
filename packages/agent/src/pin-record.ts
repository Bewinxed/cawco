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
  readInstallation,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import { QUIET_MS, readWithin } from "@cawco/core/bounded";
import { failureSentence } from "@cawco/core/cli-failure";
import { runLive } from "@cawco/core/run-captured";
import { hostEnvironment } from "@cawco/core/session-env";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { hubClient } from "@cawco/hub/client";
import { z } from "zod";
import { provenFetch } from "./hub-proof";
import {
  type FleetUpdates,
  type PinMove,
  pinMoveWords,
  putOnPins,
} from "./tools";

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
 * `cawco binary-pins`, run from `from`'s own executable. With no `back`:
 * `from`'s pinned harnesses put on, with the methods `from`'s catalog knows
 * (the build before may not know one a copy here came from). With `back`
 * (a build that will not run): what went on for it put back for `from`, the
 * build that runs instead, and never by the build that will not run, which
 * may not start at all. Answers what it did, in words; throws its one
 * sentence when it did not, and the error's own line when it died of one
 * (core cli-failure.ts).
 *
 * It runs as the leader of a process group of its own, tethered to this
 * process (core run-captured.ts `runLive`): alive while it, or an install
 * it runs, writes or spends CPU time; one gone quiet, or let go
 * through `signal` (a sleep, binary-update.ts), is ended with each install
 * it started, and this answers only once all of it has gone, so the
 * put-back that follows never runs beside an install of its.
 */
export async function runBinaryPins(
  from: string,
  back?: string,
  signal?: AbortSignal
): Promise<string> {
  const ran = await runLive(
    [versionExecutable(from), "binary-pins", ...(back ? ["back", back] : [])],
    {
      env: hostEnvironment(),
      ...(signal ? { signal } : {}),
    }
  );
  switch (ran.kind) {
    case "answered": {
      const { code, signalCode, stderr, stdout } = ran.value;
      if (code !== 0) {
        const said = failureSentence(stderr);
        throw new Error(
          said ||
            `${from}'s binary-pins ${signalCode ? `was ended by ${signalCode}` : `exited ${code}`}`
        );
      }
      // Its last line is what it did; the lines before are the installers' own.
      return stdout.trim().split("\n").at(-1) ?? "";
    }
    case "unanswered":
      throw new Error(
        `${from}'s binary-pins said nothing and did no work for ${secondsOf(QUIET_MS)} s, so it was ended with every install it started`
      );
    default:
      unhandled("read", ran);
  }
}

/** How long the hub is given to say what the fleet does with a copy CawCo doesn't run. */
const UPDATES_READ_MS = 10_000;

/**
 * What the fleet does with a copy of a tool at a version CawCo does not run
 * (core `ToolUpdates`), as this machine's hub says it now, asked as this
 * machine: what a build's pins go on by before its swap (tools.ts
 * `putOnFleetPins`). When the hub could not be asked or did not say (a hub
 * of a build before the choice answers 404; one restarting into its own
 * new build, nothing), why, in words that `binary-pins` says on the line
 * the update's log keeps: nothing goes on before the swap then, and the
 * build's agent reports what it found to a hub that decides.
 */
export async function fleetToolUpdates(): Promise<FleetUpdates> {
  const installation = await readInstallation();
  if (!installation) {
    return { unsaid: "this machine's install names no hub to ask" };
  }
  const hub = installation.hubUrl;
  try {
    const read = await readWithin(UPDATES_READ_MS, async (signal) =>
      hubClient(hub, (url, init) => provenFetch(url, { ...init, signal })).api[
        "tool-updates"
      ].get()
    );
    if (read.kind === "unanswered") {
      return {
        unsaid: `the hub at ${hub} didn't say within ${UPDATES_READ_MS / 1000} s whether the fleet updates one`,
      };
    }
    if (read.value.error) {
      return {
        unsaid: `the hub at ${hub} answered ${read.value.status} when asked whether the fleet updates one`,
      };
    }
    return { updates: read.value.data.updates };
  } catch (error) {
    return {
      unsaid: `the hub at ${hub} wasn't reached to ask whether the fleet updates one: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
