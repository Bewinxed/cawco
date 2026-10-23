/**
 * Apple's notarization limit, counted on the release host: every submission
 * a release makes is a line in its ledger before it goes up, and a release
 * starts only while the last 24 hours leave room for its own. Apple: "Limit
 * notarizations to 75 per day"
 * (https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).
 * The window is the last 24 hours, not a calendar day: Apple names no day
 * boundary, so the rolling window is the one that cannot overrun it (our call).
 *
 *   bun scripts/release-quota.ts        prints what is left; exits 2, in words, when a release does not fit
 *
 * No dependency beyond Bun: scripts/ship.sh asks it before anything is
 * installed.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Apple's limit per day. */
export const NOTARIZATIONS_PER_DAY = 75;
/** What one release submits: darwin-arm64 and darwin-x64. */
export const NOTARIZATIONS_PER_RELEASE = 2;
const DAY_MS = 24 * 60 * 60_000;

/** The ledger: one JSON line per submission, `{ at, target, version }`. */
export const notarizationLedger = (): string =>
  join(homedir(), ".cache", "cawco", "release-pipeline", "notarizations.jsonl");

/** The submissions of the last 24 hours. */
export const notarizationsToday = async (now = Date.now()): Promise<number> => {
  const text = await readFile(notarizationLedger(), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => (JSON.parse(line) as { at: number }).at)
    .filter((at) => now - at < DAY_MS).length;
};

/** One submission, written before it goes up: a failed one counts at Apple too. */
export const recordNotarization = async (entry: {
  target: string;
  version: string;
}): Promise<void> => {
  await mkdir(dirname(notarizationLedger()), { recursive: true });
  await appendFile(
    notarizationLedger(),
    `${JSON.stringify({ at: Date.now(), ...entry })}\n`
  );
};

/** Why a release may not start now, in words; nothing when the day leaves room for one. */
export const quotaRefusal = async (): Promise<string | undefined> => {
  const used = await notarizationsToday();
  const left = NOTARIZATIONS_PER_DAY - used;
  return left < NOTARIZATIONS_PER_RELEASE
    ? `Apple's notarization limit (${NOTARIZATIONS_PER_DAY} a day) has ${Math.max(0, left)} left in the last 24 hours, and a release takes ${NOTARIZATIONS_PER_RELEASE}. The nightly ships it.`
    : undefined;
};

if (import.meta.main) {
  const refused = await quotaRefusal();
  if (refused) {
    console.log(refused);
    process.exit(2);
  }
  const used = await notarizationsToday();
  console.log(
    `${NOTARIZATIONS_PER_DAY - used} of Apple's ${NOTARIZATIONS_PER_DAY} notarizations left in the last 24 hours; a release takes ${NOTARIZATIONS_PER_RELEASE}.`
  );
}
