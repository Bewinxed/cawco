/**
 * A Caw thread's transcript, built here: a thread is addressed as a session
 * (`thread:<id>`, core threads.ts) and read as one, a page at
 * `GET /api/instances/thread:<id>/transcript` and a stream under that id, so
 * every screen draws it through the session's own state and rows.
 *
 * Its rows come from the hub's two tables and nothing else:
 *
 * - the person's words are sends (`sent_messages` with the thread's id),
 *   placed where Caw read them (`read_at`); one he has not read waits in
 *   `queued`, and one that never went is drawn by its record, failed;
 * - Caw's replies, the events noted in it and the person's answers to his
 *   questions are its `thread_messages`, at the time each was written;
 * - the tail is Caw's words as he writes them, in the turn that read the
 *   person's newest words here;
 * - each session Caw started from the thread (`instances.thread_id`) is the
 *   row a session's transcript draws for its `delegate` or `start_session`
 *   call (a `tool.handoff` the dashboard draws as its Delegate card), at
 *   its spawn, carrying each hand-off Caw sent it since its brief. Its live
 *   state, asks and report are the hub's delegate events, as on any card.
 *
 * Built once per thread from what the database holds (core
 * `TranscriptBuilder.seed`), then kept: each record that moves, each row
 * added and each move of the tail goes out on the thread's stream as
 * transcript events, sequenced like a session's, so a reader that read a
 * page at `seq` applies what follows and has what the hub has.
 */
import {
  CAW_EVENT_NOTE,
  parseHandoffMarker,
  type SendRecord,
  sendRef,
  TRANSCRIPT_PAGE,
  type TranscriptBlock,
  TranscriptBuilder,
  type TranscriptEvent,
  type TranscriptPage,
  type TranscriptStreamFrame,
  type TranscriptTail,
  type TranscriptWhere,
  threadTargetOf,
} from "@cawco/core";
import type {
  DbShape,
  PublicInstanceRow,
  SentMessageRow,
  ThreadMessageRow,
  ThreadRow,
} from "./db";

export interface ThreadTranscriptPorts {
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "sendsIn"
    | "thread"
    | "threadDelegates"
    | "threadMessages"
    | "threadSends"
    | "workItem"
  >;
  /** The thread's stream head: the seq a page is consistent with. */
  readonly head: (viewId: string) => number;
  /** This hub's run, the numbering {@link head} counts in. */
  readonly hubRun: string;
  /** A send's record as it goes out on the transcript `viewId` (server.ts `toSendRecord`). */
  readonly record: (row: SentMessageRow, viewId: string) => SendRecord;
  /** One frame onto the thread's stream. */
  readonly sequence: (viewId: string, frame: TranscriptStreamFrame) => void;
  /** Where the thread is read: its project's Caw, his machine, folder and harness. */
  readonly where: (thread: ThreadRow) => TranscriptWhere;
}

export interface ThreadTranscriptsShape {
  /**
   * A session Caw started from a thread was spawned, or sent something:
   * its row on the thread, drawn again when what it says moved.
   */
  readonly delegate: (instanceId: string) => void;
  /** One of the thread's own rows added: Caw's reply, a note, your answer to his question. */
  readonly line: (row: ThreadMessageRow) => void;
  /** A page of the thread, the newest when `before` is absent; undefined for no such thread. */
  readonly page: (
    threadId: string,
    limit: number | undefined,
    before: string | undefined
  ) => TranscriptPage | { gone: string } | undefined;
  /** A send written in a thread moved: its record. */
  readonly send: (row: SentMessageRow) => void;
  /** The thread's live tail moved: Caw's words in the turn that read your newest. */
  readonly tail: (threadId: string, patch: Partial<TranscriptTail>) => void;
}

/** The time a row of a thread's stands at, ms. */
const timeOf = (iso: string | undefined): number =>
  iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY;

/** What a note carries to act on under its line: a made routine, a design or LFS offer. */
const eventMetadata = (
  row: ThreadMessageRow
): NonNullable<TranscriptBlock["metadata"]> => {
  const { event } = row;
  return {
    noteTitle: row.noteTitle ?? "",
    noteKind: CAW_EVENT_NOTE,
    ...(event?.kind === "routine-made"
      ? {
          routineMade: {
            expiresAt: event.expiresAt,
            routineId: event.routineId,
          },
        }
      : {}),
    ...(event?.kind === "design-offer"
      ? { designOffer: { projectId: event.projectId } }
      : {}),
    ...(event?.kind === "repo" && event.lfsOffer
      ? { lfsOffer: { id: event.lfsOffer } }
      : {}),
  };
};

/**
 * Your answer to a question of his from before his choices became decision
 * pages (core `ThreadQuestion`): the call that asked it, settled, which the
 * transcript draws as its QuestionCard, as it draws any session's.
 */
const answerBlock = (
  row: ThreadMessageRow
): Pick<TranscriptBlock, "content" | "metadata" | "toolCallId" | "type"> => {
  const { question, answer } = row;
  const call = question?.toolUseId ?? row.id;
  const questions = question?.questions ?? [];
  return {
    type: "tool.use",
    content: "",
    toolCallId: call,
    metadata: {
      toolName: "AskUserQuestion",
      toolId: call,
      toolInput: { questions },
      toolStatus: "success",
      toolUseResult:
        answer?.outcome === "answered"
          ? {
              outcome: "answered",
              answers: answer.answers,
              questions,
              ...(answer.annotations
                ? { annotations: answer.annotations }
                : {}),
            }
          : { outcome: "dismissed", questions },
    },
  };
};

/**
 * A thread's own row as a transcript's block: Caw's reply is his turn with
 * the tasks and files it names; a note is an event line with what it carries
 * to act on; your answer to his question is the settled call that asked it.
 */
const threadBlockOf = (
  row: ThreadMessageRow,
  viewId: string
): TranscriptBlock => {
  const base = {
    id: row.id,
    instanceId: viewId,
    timestamp: row.createdAt.toISOString(),
  };
  switch (row.author) {
    case "caw": {
      const metadata = {
        ...(row.tasks?.length ? { tasks: row.tasks } : {}),
        ...(row.files?.length ? { files: row.files } : {}),
      };
      return {
        ...base,
        type: "assistant",
        content: row.body,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      };
    }
    case "event":
      return {
        ...base,
        type: "ui.system_note",
        content: row.body,
        metadata: eventMetadata(row),
      };
    case "you":
      break;
  }
  return { ...base, ...answerBlock(row) };
};

/** The states a hand-off stands in on a delegate's row: sent, whether or not it was read yet. */
const HANDED_STATES: SentMessageRow["state"][] = ["pending", "read", "failed"];

/** A send's words as its sender wrote them, its pictures and files left out. */
const sendText = (row: SentMessageRow): string => {
  const { content } = row.body.message;
  return typeof content === "string"
    ? content
    : content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
};

/**
 * What a delegate's starter sent it, oldest first, each as its words without
 * the hand-off marker: its brief first, then every hand-off after it.
 */
const fromStarter = (
  sends: SentMessageRow[],
  starter: string
): { at: string; text: string }[] =>
  sends
    .filter(
      (send) =>
        send.body.origin?.kind === "peer" &&
        send.body.origin.fromSession === starter
    )
    .map((send) => {
      const text = sendText(send);
      return {
        at: send.acceptedAt.toISOString(),
        text: (parseHandoffMarker(text)?.body ?? text).trim(),
      };
    });

/**
 * Whether a session has its live card on a thread: Caw started it from
 * there (its `thread_id`, set at spawn, with a parent). The card says how
 * it ended, so nothing else in that thread need (caw.ts `endNoteIn`).
 */
const cardOn = (
  row: { parentInstanceId?: string | null; threadId?: string | null },
  threadId: string
): boolean => row.threadId === threadId && Boolean(row.parentInstanceId);

/** The id a session's row on a thread keeps, page to page and frame to frame. */
const delegateRowId = (instanceId: string): string => `delegate:${instanceId}`;

export const createThreadTranscripts = (
  ports: ThreadTranscriptPorts
): ThreadTranscriptsShape => {
  const built = new Map<string, TranscriptBuilder>();

  /**
   * A send's record on the thread's own transcript: its rows are the
   * thread's, and a failed send stands by its clock among them, never after
   * a row of the lead's session it was anchored to there.
   */
  const recordOn = (row: SentMessageRow, viewId: string): SendRecord => {
    const { anchor: _anchor, ...record } = ports.record(row, viewId);
    return record;
  };

  const emit = (viewId: string, events: TranscriptEvent[]): void => {
    if (events.length > 0) {
      ports.sequence(viewId, {
        kind: "transcript",
        instanceId: viewId,
        events,
      });
    }
  };

  /** Each delegate row as last drawn, so a send that moves nothing it says draws nothing. */
  const drawn = new Map<string, string>();

  /**
   * A session Caw started from the thread as its transcript draws a
   * `delegate` (a work item) or `start_session` call: its title and type,
   * its brief, the session it is, and each hand-off sent it since.
   */
  const delegateBlockOf = (
    row: PublicInstanceRow,
    viewId: string
  ): TranscriptBlock => {
    const item = row.workItemId ? ports.db.workItem(row.workItemId) : undefined;
    const said = row.parentInstanceId
      ? fromStarter(
          ports.db.sendsIn(row.id, HANDED_STATES),
          row.parentInstanceId
        )
      : [];
    const [opening, ...handoffs] = said;
    const title = item?.title ?? row.title ?? "";
    const type = item?.type ?? row.delegateType;
    const id = delegateRowId(row.id);
    return {
      id,
      instanceId: viewId,
      timestamp: row.createdAt.toISOString(),
      type: "tool.handoff",
      content: title,
      toolCallId: id,
      metadata: {
        toolId: id,
        toolName: item ? "delegate" : "start_session",
        toolInput: { title, ...(type ? { type } : {}) },
        toolStatus: "success",
        handoffKind: item ? "delegate" : "start",
        handoffBrief: item?.brief ?? opening?.text ?? "",
        delegateInstanceId: row.id,
        delegateTitle: title,
        ...(handoffs.length > 0 ? { delegateHandoffs: handoffs } : {}),
      },
    };
  };

  /** The thread's builder, built from the database the first time it is asked for. */
  const builderOf = (threadId: string): TranscriptBuilder | undefined => {
    const known = built.get(threadId);
    if (known) {
      return known;
    }
    if (!ports.db.thread(threadId)) {
      return;
    }
    const viewId = threadTargetOf(threadId);
    const builder = new TranscriptBuilder(viewId);
    const sends = ports.db.threadSends(threadId);
    const rows: { at: number; block: TranscriptBlock }[] = [
      ...ports.db.threadMessages(threadId).map((row) => ({
        at: row.createdAt.getTime(),
        block: threadBlockOf(row, viewId),
      })),
      ...sends
        .filter((send) => send.state === "read")
        .map((send) => ({
          at: (send.readAt ?? send.acceptedAt).getTime(),
          block: sendRef(viewId, send.uuid),
        })),
      ...ports.db.threadDelegates(threadId).map((row) => {
        const block = delegateBlockOf(row, viewId);
        drawn.set(block.id, JSON.stringify(block));
        return { at: row.createdAt.getTime(), block };
      }),
    ];
    rows.sort(
      (a, b) =>
        a.at - b.at ||
        timeOf(a.block.timestamp) - timeOf(b.block.timestamp) ||
        a.block.id.localeCompare(b.block.id)
    );
    builder.seed(
      rows.map((row) => row.block),
      Object.fromEntries(
        sends.map((send) => [send.uuid, recordOn(send, viewId)])
      )
    );
    built.set(threadId, builder);
    return builder;
  };

  return {
    delegate: (instanceId) => {
      const [row] = ports.db.getInstancesByIds([instanceId]);
      const builder = row?.threadId ? built.get(row.threadId) : undefined;
      if (!(row?.threadId && builder && cardOn(row, row.threadId))) {
        return;
      }
      const block = delegateBlockOf(row, builder.instanceId);
      const json = JSON.stringify(block);
      if (drawn.get(block.id) === json) {
        return;
      }
      drawn.set(block.id, json);
      emit(builder.instanceId, builder.applyBlock(block));
    },
    line: (row) => {
      const builder = built.get(row.threadId);
      if (builder) {
        emit(
          builder.instanceId,
          builder.applyBlock(threadBlockOf(row, builder.instanceId))
        );
      }
    },
    send: (row) => {
      const builder = row.threadId ? built.get(row.threadId) : undefined;
      if (builder) {
        emit(
          builder.instanceId,
          builder.applyRecord(recordOn(row, builder.instanceId))
        );
      }
    },
    tail: (threadId, patch) => {
      const builder = built.get(threadId);
      if (builder) {
        emit(builder.instanceId, builder.applyTail(patch));
      }
    },
    page: (threadId, limit, before) => {
      const builder = builderOf(threadId);
      const thread = ports.db.thread(threadId);
      if (!(builder && thread)) {
        return;
      }
      const page = builder.page(limit ?? TRANSCRIPT_PAGE, before);
      if (!page) {
        return { gone: before ?? "" };
      }
      return {
        ...page,
        where: ports.where(thread),
        ...(before === undefined
          ? { seq: ports.head(builder.instanceId), hubRun: ports.hubRun }
          : {}),
      };
    },
  };
};
