/**
 * The conversations of the sessions that ran in a moved folder, following
 * it (core `CONTROL_FOLDER_SESSIONS_CARRY`): each by its own harness's
 * carry (harness.ts `FolderCarry`), on one machine filed again for its new
 * folder; to another machine every session's part sent in one stream the
 * hub relays (folder-tree.ts), each under `<session>/<harness>/`, and filed
 * there by the same harness's carry. A conversation carried away leaves its
 * copy here until the move's removal step ({@link dropCarried}).
 */
import { join } from "node:path";
import type {
  FolderCarried,
  FolderCarryAsk,
  FolderCarrySession,
} from "@cawco/core/folder-move";
import { makeFolder } from "@cawco/core/folders";
import { carryDir } from "./folder-files";
import { relayStream, relayTaken } from "./folder-relay";
import { sendTree, type TreeTop, takeTree } from "./folder-tree";
import type { FolderCarry } from "./harness";
import { harness } from "./harnesses";
import { removeTree } from "./remove-tree";

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A session's harness's carry here; one this agent has no adapter for carries nothing. */
const carryOf = (one: FolderCarrySession): FolderCarry => {
  const adapter = harness(one.harness);
  if (!adapter) {
    throw new Error(`this machine runs no ${one.harness}`);
  }
  return adapter.folderCarry;
};

/** Each session's outcome of `run`, one failing never stopping the rest. */
const eachOf = async (
  sessions: readonly FolderCarrySession[],
  run: (one: FolderCarrySession) => Promise<void>
): Promise<FolderCarried> => {
  const carried: FolderCarried = {};
  for (const one of sessions) {
    try {
      await run(one);
      carried[one.instanceId] = { carried: true };
    } catch (error) {
      carried[one.instanceId] = { carried: false, why: why(error) };
    }
  }
  return carried;
};

/** A session's part of the stream: `<session>/<harness>/`. */
const partOf = (one: FolderCarrySession): string =>
  `${one.instanceId}/${one.harness}`;

/**
 * The conversations of a moved folder carried, per session: filed again
 * here, or with `relay`, sent from here (`send`) or taken here (`take`).
 * One that can't be carried says why, and the rest go on.
 */
export const carryConversations = async (
  ask: FolderCarryAsk
): Promise<FolderCarried> => {
  if (!ask.relay) {
    return await eachOf(ask.sessions, (one) =>
      carryOf(one).here(one, ask.jobId)
    );
  }
  if (ask.relay.side === "send") {
    const tops: TreeTop[] = [];
    const carried = await eachOf(ask.sessions, async (one) => {
      const own = await carryOf(one).tops(one, ask.jobId);
      tops.push(
        ...own.map((top) => ({ ...top, name: `${partOf(one)}/${top.name}` }))
      );
    });
    await relayStream(
      ask.relay.token,
      sendTree(tops, {
        recheck: false,
        mounts: new Set(),
        blocked: (block) => `${block.kind}`,
      })
    );
    return carried;
  }
  const received = join(carryDir(ask.jobId), "in");
  await removeTree(received);
  await makeFolder(received, { mode: 0o700 });
  await takeTree(await relayTaken(ask.relay.token), received, () => undefined);
  const carried = await eachOf(ask.sessions, (one) =>
    carryOf(one).take(one, join(received, ...partOf(one).split("/")))
  );
  await removeTree(carryDir(ask.jobId));
  return carried;
};

/**
 * The copies here of conversations carried to another machine, removed once
 * the move's removal step runs: never resumed here again, so no conversation
 * forks under one id. One that stays is said.
 */
export const dropCarried = async (
  sessions: readonly FolderCarrySession[]
): Promise<void> => {
  const dropped = await eachOf(sessions, (one) => carryOf(one).drop(one));
  for (const [instanceId, outcome] of Object.entries(dropped)) {
    if (!outcome.carried) {
      console.warn(
        `[folder-move] ${instanceId}'s conversation stays on this machine too: ${outcome.why}`
      );
    }
  }
};
