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
 *   person's newest words here.
 *
 * Built once per thread from what the database holds (core
 * `TranscriptBuilder.seed`), then kept: each record that moves, each row
 * added and each move of the tail goes out on the thread's stream as
 * transcript events, sequenced like a session's, so a reader that read a
 * page at `seq` applies what follows and has what the hub has.
 */
import {
  CAW_EVENT_NOTE,
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
  SentMessageRow,
  ThreadMessageRow,
  ThreadRow,
} from "./db";

export interface ThreadTranscriptPorts {
  readonly db: Pick<DbShape, "thread" | "threadMessages" | "threadSends">;
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
