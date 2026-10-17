/**
 * THE SENDS EACH SESSION HAS TAKEN, KEPT ON ITS MACHINE: what makes a send one
 * turn however many times the hub hands it over.
 *
 * The hub owes a pending send again whenever it cannot tell that its session
 * read it (server.ts `settleSend`), and it cannot always tell: a harness's read
 * handed to a hub that then stopped is not sent to the hub that replaced it
 * (outbox.ts), and a transcript can lag what its process took, or hold nothing
 * (the proof's stand-in). On 2026-10-17 a session took a send 0.3 s before its
 * hub stopped; the next hub owed it again and it became a second turn. So the
 * end that turns a send into a turn refuses one its session has taken already.
 *
 * Kept by this agent, on disk, by session: a hub restart leaves it alone, the
 * next agent reads it back, and a keeper handover moves processes, not this.
 * A send is taken when its harness says it read it (`MESSAGES_READ`), and the
 * read is kept before the hub can hear it (session.ts `#noteRead`).
 *
 * Only the latest {@link TAKEN_KEPT} are kept: a send the hub owes again is
 * pending there, and every read a session makes settles the pending sends
 * accepted before it (server.ts `takeRead`), so one taken longer ago than that
 * is no longer pending anywhere. Our call.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { sessionTakenDir } from "@cawco/core/paths";
import {
  DamagedRecord,
  readRecordSync,
  writeStateFileSync,
} from "@cawco/core/state-file";

/** How many of a session's sends are kept as taken, the latest. */
export const TAKEN_KEPT = 128;

const fileOf = (instanceId: string): string =>
  join(sessionTakenDir(), instanceId);

/** Each session's record as this agent last read or wrote it. */
const known = new Map<string, string[]>();

/**
 * The sends `instanceId` has taken, oldest first. A record that is there and
 * is not a list of ids is a {@link DamagedRecord}.
 */
const takenBy = (instanceId: string): string[] => {
  const held = known.get(instanceId);
  if (held) {
    return held;
  }
  const file = fileOf(instanceId);
  const kept = readRecordSync<unknown>(file) ?? [];
  if (!(Array.isArray(kept) && kept.every((id) => typeof id === "string"))) {
    throw new DamagedRecord(file, "it is not a list of send ids");
  }
  known.set(instanceId, kept);
  return kept;
};

/** Whether `instanceId` has taken the send `uuid`. */
export const hasTaken = (instanceId: string, uuid: string): boolean =>
  takenBy(instanceId).includes(uuid);

/** `instanceId` has taken these sends: kept, on disk, before this returns. */
export const noteTaken = (instanceId: string, uuids: string[]): void => {
  const taken = takenBy(instanceId);
  const fresh = uuids.filter((uuid) => !taken.includes(uuid));
  if (fresh.length === 0) {
    return;
  }
  const next = [...taken, ...fresh].slice(-TAKEN_KEPT);
  writeStateFileSync(fileOf(instanceId), JSON.stringify(next));
  known.set(instanceId, next);
};

/** `instanceId` was stopped: the hub has settled everything it was sent. */
export const forgetTaken = (instanceId: string): void => {
  known.delete(instanceId);
  rmSync(fileOf(instanceId), { force: true });
};
