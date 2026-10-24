/**
 * What the hub refused or held, as it says the same in its log and from the
 * same values: the log line is for people, this record for what checks the
 * hub (proofs, probe specs). `hub-record.json` beside the hub's database
 * ({@link hubDbPath}): its latest {@link EVENTS_KEPT} events in order, each
 * with when it happened (`at`, ms since the epoch), written whole within
 * {@link WRITE_AFTER_MS} of each, one write at a time. A hub started again
 * goes on from what the one before it wrote.
 *
 * - `admission-held`: a machine's connection proved no key and is held for
 *   the person's Admit (hub-auth.ts `hold`); `quiet` when it came through
 *   its SSH add's forward, held unlisted until it proves the add's key.
 * - `frame-refused`: a machine's frame on a connection that is not its
 *   registered one, refused "register first" (server.ts).
 * - `request-refused`: a request the gate refused (hub-auth.ts), by its
 *   caller's kind and, for a machine, its id: what a machine's agent hears
 *   as a 401.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hubDbPath } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** The file beside the hub's database that holds {@link HubEvent}s. */
export const HUB_RECORD_FILE = "hub-record.json";

/** How many of the latest events the record keeps. Ours: a run's worth of refusals, a beat's every 15 s for an hour. */
const EVENTS_KEPT = 512;

/** How soon an event reaches the disk. Ours: a burst of refused frames is one write. */
const WRITE_AFTER_MS = 100;

export type HubEvent =
  | {
      readonly kind: "admission-held";
      readonly machineId: string;
      readonly quiet: boolean;
    }
  | {
      readonly kind: "frame-refused";
      readonly machineId: string;
      readonly verb: string;
    }
  | {
      readonly caller: string;
      readonly kind: "request-refused";
      readonly machineId: string | null;
      readonly method: string;
      readonly path: string;
    };

/** The record's path. */
const recordPath = (): string => join(dirname(hubDbPath()), HUB_RECORD_FILE);

/** What the hub before this one recorded, read once; none when there is none or it does not parse. */
const earlier = (): (HubEvent & { readonly at: number })[] => {
  try {
    const read: unknown = JSON.parse(readFileSync(recordPath(), "utf8"));
    return Array.isArray(read) ? read : [];
  } catch {
    return [];
  }
};

let events: (HubEvent & { readonly at: number })[] | undefined;
let writing: ReturnType<typeof setTimeout> | undefined;
let written: Promise<void> = Promise.resolve();

/** Adds `event` to the record, written soon ({@link WRITE_AFTER_MS}); a write that fails is said, never thrown. */
export const recordHubEvent = (event: HubEvent): void => {
  events ??= earlier();
  events.push({ ...event, at: Date.now() });
  if (events.length > EVENTS_KEPT) {
    events.splice(0, events.length - EVENTS_KEPT);
  }
  if (writing !== undefined) {
    return;
  }
  writing = setTimeout(() => {
    writing = undefined;
    const text = `${JSON.stringify(events)}\n`;
    const path = recordPath();
    written = written
      .then(() => writeStateFile(path, text))
      .catch((error: unknown) => {
        console.warn(
          `[hub] ${path} could not be written: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }, WRITE_AFTER_MS);
};
