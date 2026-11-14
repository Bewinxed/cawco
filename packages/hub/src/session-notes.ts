import type { AccountMove } from "@cawco/core/accounts";
import type { LeakFound } from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { ProjectNote } from "@cawco/core/project-conversation";
import { accountMoveSentence } from "@cawco/core/words/account-lines";
import { containerWords } from "@cawco/core/words/containers";
import { leakWords } from "@cawco/core/words/leaks";
import { noticeWords } from "@cawco/core/words/notices";
import type { ClosureContext } from "./closure-context";
import { waitsLine } from "./db/at-limit";
import {
  limitLine,
  movedHereLine,
  projectNoteLine,
  watchLine,
} from "./history";
import { uuidOf } from "./named-uuid";

/** The system origin name of the hub's word that something a session started leaks (core `LEAK_FOUND`). */
const LEAK_ORIGIN = "leak";
/** The system origin name of the hub's word that a session's containers stopped as it ended (core `CONTAINERS_ENDED`). */
const CONTAINERS_ORIGIN = "containers";

/**
 * The uuid of the notice sent for leak `leak` of session `instanceId`,
 * whoever it was told to: what its end is found by ({@link LEAK_ENDED}), and
 * a leak told again after a restart is the same send, handed over once.
 */
const leakSend = (instanceId: string, leak: string): string =>
  uuidOf(`${instanceId}\u0000leak\u0000${leak}`);

/**
 * A leak's line in the person's transcript (core words/notices.ts), from
 * what its machine found; `by` names the delegate whose it is. None from an
 * agent that says only words: the row says its kind's line.
 */
const leakLine = (
  found: LeakFound | undefined,
  by: string | null
): string | undefined => {
  switch (found?.kind) {
    case "left":
      return noticeWords.leftRunning(found.count, by);
    case "memory":
      return noticeWords.leaking(found.command, found.resident, by);
    case undefined:
      return;
  }
};

export type SessionNotesContext = Pick<
  ClosureContext,
  | "changeSend"
  | "db"
  | "firstTellingOfLeak"
  | "inputRefusal"
  | "sessionName"
  | "tellSession"
  | "transcripts"
>;

export const createSessionNotes = (ctx: SessionNotesContext) => {
  /** The leaks and container endings each session was told of, by `<session> <id>` (`LEAKS_KEPT`). */
  const leaksTold = new Set<string>();
  /**
   * A leak its machine found in what a session started (core `LEAK_FOUND`):
   * the session is told in the hub's word ({@link tellSession}), once per
   * leak. One from a machine that does not run the session is nobody's.
   *
   * A delegate whose work item has ended takes no word but its parent's
   * (work-items.ts `refusal`), and a leak is mostly found once its commands
   * have ended: a leftover by its nature, often after `finish_item`. Then
   * the session that delegated it is told instead, naming the delegate and
   * its item, so the leak is someone's to end: on 2026-10-23 the notices of
   * a failed delegate's leftover and leaking process in its workspace were
   * refused ("Leak in a workspace (85634c62) is failed. Only the reader, the
   * session that delegated it, or its project's conversation can continue it.") and
   * reached no one.
   *
   * Only a climb in memory is told so ({@link leakWords.leaking}): what an
   * ended item's session left running CawCo ends itself as its workspace
   * settles, or keeps for an artifact that shows it (workspaces.ts
   * `settle`), so a leftover notice ({@link leakWords.leftBehind}) for one
   * is logged and told to no one. On 2026-10-24 a parent was told to end
   * three pids a done delegate left, which had exited by the time it looked.
   */
  const tellLeak = (
    machineId: string,
    instanceId: string,
    said: { uuid?: unknown; content?: unknown; leak?: LeakFound }
  ): void => {
    const told = ctx.firstTellingOfLeak(machineId, instanceId, said);
    if (!told) {
      return;
    }
    const { row } = told;
    const item = row.workItemId ? ctx.db.workItem(row.workItemId) : undefined;
    const parent = item?.parentInstanceId;
    if (
      item &&
      parent &&
      ctx.inputRefusal(row.id, { kind: "system", name: LEAK_ORIGIN })
    ) {
      if (!told.content.includes(leakWords.leaking)) {
        console.warn(
          `[leak] ${row.id} (its item ${item.id} is ${item.state}), told to no one: its workspace's settle ends what it left: ${told.content}`
        );
        return;
      }
      console.warn(
        `[leak] ${row.id} (its item ${item.id} is ${item.state}), told to ${parent}: ${told.content}`
      );
      ctx.tellSession(
        parent,
        leakWords.delegateLeft(
          item.title,
          item.id.slice(0, 8),
          item.state,
          item.workspaceId.slice(0, 8),
          told.content
        ),
        {
          name: LEAK_ORIGIN,
          line: leakLine(said.leak, item.title),
          live: "running",
          uuid: leakSend(row.id, told.uuid),
        }
      );
      return;
    }
    console.warn(`[leak] ${row.id}: ${told.content}`);
    ctx.tellSession(row.id, told.content, {
      name: LEAK_ORIGIN,
      line: leakLine(said.leak, null),
      live: "running",
      uuid: leakSend(row.id, told.uuid),
    });
  };

  /**
   * A leak its machine told of has ended (core `LEAK_ENDED`): the notice
   * sent for it, to the session or to the one that delegated it, says so on
   * its record ({@link leakSend}), its row "· ended" live and read back.
   * Nothing is said to any session. One from a machine that does not run
   * the session, or of a leak no notice was sent for, is nobody's.
   */
  const endLeak = (
    machineId: string,
    instanceId: string,
    said: { uuid?: unknown }
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row || row.machineId !== machineId || typeof said.uuid !== "string") {
      return;
    }
    const record = ctx.db.sendRecord(leakSend(row.id, said.uuid));
    const origin = record?.body.origin;
    if (!(record && origin?.kind === "system" && origin.live === "running")) {
      return;
    }
    console.info(`[leak] ${row.id}: ${said.uuid} ended`);
    ctx.changeSend(record, {
      body: { ...record.body, origin: { ...origin, live: "ended" } },
    });
  };

  /**
   * What its machine said of a session's containers (agent
   * session-containers.ts), in the hub's word, once per notice; one from a
   * machine that does not run the session is nobody's.
   *
   * - `ended` (core `CONTAINERS_ENDED`): the session ended, and the containers
   *   its work started were stopped. The session that delegated it is told,
   *   naming it and its item; a session nobody delegated is the person's
   *   own, and is told itself, a word that waits for whoever wakes it next.
   * - `untracked` (core `CONTAINERS_UNTRACKED`): as it launches, the session
   *   reaches a runtime with no door, so what it starts there will not stop
   *   with it. The session itself is told: it is the one starting them.
   */
  const tellContainers = (
    machineId: string,
    instanceId: string,
    said: { uuid?: unknown; content?: unknown },
    notice: "ended" | "untracked"
  ): void => {
    const told = ctx.firstTellingOfLeak(machineId, instanceId, said);
    if (!told) {
      return;
    }
    const { row } = told;
    const item =
      notice === "ended" && row.workItemId
        ? ctx.db.workItem(row.workItemId)
        : undefined;
    const parent = item?.parentInstanceId;
    console.info(
      `[containers] ${row.id}${parent ? `, told to ${parent}` : ""}: ${told.content}`
    );
    if (item && parent) {
      ctx.tellSession(
        parent,
        containerWords.delegateEnded(
          item.title,
          item.id.slice(0, 8),
          told.content
        ),
        {
          name: CONTAINERS_ORIGIN,
          line: noticeWords.containersStopped(item.title),
        }
      );
      return;
    }
    ctx.tellSession(row.id, told.content, {
      name: CONTAINERS_ORIGIN,
      line:
        notice === "ended"
          ? noticeWords.containersStopped(null)
          : noticeWords.containersUntracked,
    });
  };

  /**
   * What fleet watch did about a session, or told it as its steward (core
   * `FLEET_WATCH`): kept on its row and folded into what its screens show
   * now. Never sent to its process.
   */
  /** A project note placed in its conversation's transcript as it lands (caw.ts `notice`). */
  const noteProject = (
    instanceId: string,
    kept: { at: number; id: string; note: ProjectNote }
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (row) {
      ctx.transcripts.line(row.id, projectNoteLine(row, kept), row.harness);
    }
  };

  const noteWatch = (instanceId: string, content: string): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const line = {
      at: Date.now(),
      id: `watch-${crypto.randomUUID()}`,
      content,
    };
    ctx.db.noteWatchLine(row.id, line);
    ctx.transcripts.line(row.id, watchLine(row, line), row.harness);
  };

  const noteMovedHere = (
    instanceId: string,
    line: { at: number; moved: string; stayed?: string }
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row || ctx.db.movedHereOf(instanceId) !== null) {
      return;
    }
    ctx.db.noteMovedHere(instanceId, line);
    ctx.transcripts.ingest(instanceId, {
      kind: "frame",
      instanceId,
      harness: row.harness,
      message: movedHereLine(row, line),
    });
  };

  /**
   * Writes a line into a session's transcript: kept, and folded into what
   * its screens show now. A move waiting for work in flight is one line per
   * session ({@link waitsLine}): said again, by another attempt to another
   * account or for another reason, it is what the line standing says now,
   * where it stands; any other line ends the wait, and the standing line
   * gives way to it.
   */
  const noteAtLimit = (
    row: {
      derivedTitle?: string | null;
      harness: HarnessKind;
      id: string;
      sessionId: string | null;
      title?: string | null;
    },
    move: AccountMove,
    /** A line already written under this id is what it says now: a compaction's move line as it goes. */
    id: string = crypto.randomUUID(),
    /** When the line stands in the transcript; absent, now. */
    at: number = Date.now()
  ): void => {
    const standing = ctx.db.atLimit.waitingMove(row.id);
    const event =
      standing && waitsLine(move)
        ? { id: standing.id, at: standing.at, move }
        : { id, at, move };
    if (standing && standing.id !== event.id) {
      unnoteAtLimit(row, standing.id);
    }
    ctx.db.atLimit.putEvent({ ...event, instanceId: row.id });
    ctx.transcripts.line(row.id, limitLine(row, event), row.harness);
    // The transcript's own words: its line, then the detail under it.
    console.info(
      `[${move.kind === "ended" ? "session" : "at-limit"}] ${ctx.sessionName(row)}: ${accountMoveSentence(move, event.at)}`
    );
  };

  /** Takes one of the hub's lines back out of a session's transcript: kept, and drawn. */
  const unnoteAtLimit = (row: { id: string }, id: string): void => {
    ctx.db.atLimit.dropEvent(id);
    ctx.db.unanchorLine(row.id, `limit-${id}`);
    ctx.transcripts.removeLine(row.id, `limit-${id}`);
  };

  return {
    leaksTold,
    tellLeak,
    endLeak,
    tellContainers,
    noteProject,
    noteWatch,
    noteMovedHere,
    noteAtLimit,
    unnoteAtLimit,
  };
};
