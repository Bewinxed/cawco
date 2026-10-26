/**
 * What an update's helper did, as it says the same in its log (`apply.log`)
 * and from the same values: the log line is for people, this record for what
 * checks the updater (proofs). `apply-record.json` beside the log, in the
 * binary root: its latest {@link EVENTS_KEPT} events in order, each with the
 * process that recorded it (`pid`) and when (`at`, ms since the epoch),
 * written whole at each.
 *
 * - `start`: a helper took the lock to apply `version`, or (`keeperOnly`) to
 *   hand the session keeper over to it (binary-apply.ts `applyBinary`).
 * - `units`: `version` wrote its units (cli.ts `writeBinaryUnits`): the
 *   hub's, the dashboard's and the agent's (`services`) or its keeper's own,
 *   the files it `rewrote`, and where the dashboard answers now when that
 *   moved (`dashboard`, with where it answered before).
 * - `keeper-units`: a keeper handover to `version` had its keeper's units
 *   written (binary-apply.ts `handOverKeeper`).
 * - `swap`: the current build moved from `from` to `version` and the units
 *   restart onto it (`restarting`), or the swap failed (`error`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { binaryRoot } from "@cawco/core/binary-installation";
import { writeStateFile } from "@cawco/core/state-file";

/** The file in the binary root that holds {@link ApplyEvent}s. */
const APPLY_RECORD_FILE = "apply-record.json";

/** How many of the latest events the record keeps. Ours: many updates' worth, each a handful. */
const EVENTS_KEPT = 256;

export type ApplyEvent =
  | {
      readonly keeperOnly: boolean;
      readonly kind: "start";
      readonly version: string;
    }
  | {
      readonly dashboard: {
        readonly now: string;
        readonly was: string | null;
      } | null;
      readonly kind: "units";
      readonly rewrote: readonly string[];
      readonly services: boolean;
      readonly version: string;
    }
  | { readonly kind: "keeper-units"; readonly version: string }
  | {
      readonly error: string | null;
      readonly from: string;
      readonly kind: "swap";
      readonly restarting: readonly string[];
      readonly version: string;
    };

/**
 * Adds `event` to the record, written whole; a write that fails is said on
 * stderr, never thrown: the record follows the update, never steers it.
 */
export const recordApply = async (event: ApplyEvent): Promise<void> => {
  const path = join(binaryRoot(), APPLY_RECORD_FILE);
  try {
    const text = await readFile(path, "utf8").catch(() => "[]");
    let before: unknown;
    try {
      before = JSON.parse(text);
    } catch {
      before = [];
    }
    const all = [
      ...(Array.isArray(before) ? before : []),
      { ...event, at: Date.now(), pid: process.pid },
    ].slice(-EVENTS_KEPT);
    await writeStateFile(path, `${JSON.stringify(all)}\n`);
  } catch (error) {
    console.error(
      `update: ${path} could not be written: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
