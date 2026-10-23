/**
 * A writer that never stops appending numbered lines to a CawCo job's log,
 * and what proves a `copytruncate` of that log (core launchd.ts
 * `capLaunchdLogs`) left it writing on at the new end. The writer runs as
 * perl through a shell's `>>`, or as launchd's job: both open the file
 * `O_WRONLY|O_CREAT|O_APPEND` (launchd-842.92.1 src/core.c `job_setup_fd`;
 * POSIX sh: ">>" "shall cause the file … to be opened for appending").
 */
import { readFile, stat } from "node:fs/promises";
import { LAUNCHD_LOG_CAP_BYTES } from "../../packages/core/src/launchd";
import { until } from "../scratch-fleet";
import type { Kit } from "./kit";

/**
 * The writer's program: `line <n> <pad>`, about 190 bytes each, as fast as it
 * can until past the cap (60,000 lines, 11.5 MB), then 100 a second.
 */
export const WRITER = [
  "/usr/bin/perl",
  "-e",
  '$| = 1; my $pad = "x" x 180; for (my $i = 1; ; $i++) { print "line $i $pad\\n"; select(undef, undef, undef, 0.01) if $i > 60000; }',
];

const sizeOf = (path: string): Promise<number> =>
  stat(path).then(
    (found) => found.size,
    () => 0
  );

const LINE = /^line (\d+) /;

/** The numbers of the complete `line <n>` lines in `text`, in order. */
const numbers = (text: string): number[] =>
  text
    .split("\n")
    .slice(0, -1)
    .flatMap((line) => {
      const n = LINE.exec(line)?.[1];
      return n === undefined ? [] : [Number(n)];
    });

/** Waits until the log at `log` has passed the cap. */
export const pastCap = (log: string): Promise<number> =>
  until(
    `${log} past ${LAUNCHD_LOG_CAP_BYTES} bytes`,
    () => sizeOf(log),
    (size) => size > LAUNCHD_LOG_CAP_BYTES,
    60_000
  );

/**
 * Checks a rotation `capLaunchdLogs` reported: `.1` holds the earlier lines
 * from line 1, `.log` was cut to almost nothing, and the writer goes on at
 * the new end (no hole of zero bytes where its old offset was) with lines
 * numbered past the copy's.
 */
export const checkRotation = async (
  kit: Kit,
  log: string,
  rotated: readonly string[]
): Promise<void> => {
  kit.check(
    "capLaunchdLogs rotated the log past its cap",
    rotated.includes(log),
    rotated.join(", ")
  );
  const copy = await readFile(`${log}.1`, "utf8").catch(() => "");
  const copied = numbers(copy);
  kit.check(
    ".log.1 holds the earlier lines, from line 1, past the cap",
    copied[0] === 1 && copy.length > LAUNCHD_LOG_CAP_BYTES,
    `.1: ${copy.length} bytes, lines ${copied[0]}…${copied.at(-1)}`
  );
  const later = await until(
    `${log} written again`,
    () => readFile(log, "utf8"),
    (text) => numbers(text).length >= 20,
    20_000
  );
  const live = numbers(later);
  kit.check(
    ".log is small again and starts with a line, not a hole of zero bytes",
    later.length < 1024 * 1024 && !later.startsWith("\0"),
    `.log: ${later.length} bytes, first byte ${JSON.stringify(later.slice(0, 12))}`
  );
  kit.check(
    "the writer carries on at the new end: .log's lines follow .1's",
    (live[0] ?? 0) > (copied.at(-1) ?? Number.POSITIVE_INFINITY),
    `.1 ends at line ${copied.at(-1)}, .log runs ${live[0]}…${live.at(-1)}`
  );
  const after = await until(
    `${log} still growing`,
    () => readFile(log, "utf8"),
    (text) => (numbers(text).at(-1) ?? 0) > (live.at(-1) ?? 0) + 50,
    20_000
  );
  kit.check(
    "and goes on writing to .log afterwards",
    true,
    `.log now at line ${numbers(after).at(-1)}, ${after.length} bytes`
  );
};
