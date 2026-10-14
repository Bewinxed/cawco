/**
 * One thread's repair, run once on the hub that has it (2026-10-14).
 *
 * Before every word to Caw went through his threads (caw.ts `personSent`),
 * the app sent its words straight into his session. The owner's message in
 * thread ad5f8277 ("…read this video", 08:27:56Z) went that way, right after
 * he dismissed Caw's question there, and Caw answered it in plain text: the
 * session has both, the thread neither. Here the person's sends to the
 * project's Caw after that question's card, that no thread has, are written
 * into the thread at the times they were accepted, each followed by what
 * Caw said in plain text in the turn that read it, at the times his session
 * stored it (a turn that answered with thread_reply is in a thread already).
 * Then a note from the hub says so. It runs once: the note is its mark. Caw's
 * words are read from his stored transcript, so a machine that is away
 * leaves it for the next one that registers.
 */
import type { NeutralContentBlock, SessionMessage } from "@cawco/core";
import type { Caw } from "./caw";
import type { DbShape, SentMessageRow } from "./db";
import type { HistoryRead } from "./transcripts";

export const REPAIRED_THREAD = "ad5f8277-a861-4110-9089-b8d423699beb";
/** The note that marks the repair done. */
export const REPAIR_NOTE = "Hub · thread repaired";
const THREAD_REPLY = /(^|__)thread_reply$/;

export interface ThreadRepairDeps {
  readonly db: Pick<DbShape, "leadSends" | "thread" | "threadMessages">;
  /** A session's whole stored transcript, from its machine. */
  readonly history: (instanceId: string) => Promise<HistoryRead>;
  readonly restore: Caw["restore"];
}

type Line = Parameters<Caw["restore"]>[1][number];

/** The blocks of a stored entry's message, or its text as one block. */
const blocksOf = (entry: SessionMessage): NeutralContentBlock[] => {
  const content = (entry.message as { content?: unknown } | null)?.content;
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return Array.isArray(content) ? (content as NeutralContentBlock[]) : [];
};

/** A stored user entry that is a prompt, not a tool's result. */
const isPrompt = (entry: SessionMessage): boolean =>
  entry.type === "user" &&
  !blocksOf(entry).every((block) => block.type === "tool_result");

/** The words a send carried. */
const wordsOf = (send: SentMessageRow): string => {
  const content = send.body?.message.content;
  return typeof content === "string"
    ? content
    : (content ?? [])
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");
};

/**
 * What Caw said in plain text in the turn that read `send`, each stored
 * message at its own time; none when that turn answered with thread_reply.
 */
const turnWords = (entries: SessionMessage[], send: SentMessageRow): Line[] => {
  const start = entries.findIndex(
    (entry) =>
      entry.uuid === send.uuid ||
      entry.sourceUuid === send.uuid ||
      (entry.sends ?? []).includes(send.uuid)
  );
  if (start === -1) {
    return [];
  }
  const said: Line[] = [];
  for (const entry of entries.slice(start + 1)) {
    if (isPrompt(entry)) {
      break;
    }
    if (entry.type !== "assistant" || entry.parent_tool_use_id) {
      continue;
    }
    const blocks = blocksOf(entry);
    if (
      blocks.some(
        (block) => block.type === "tool_use" && THREAD_REPLY.test(block.name)
      )
    ) {
      return [];
    }
    const text = blocks
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (text) {
      said.push({
        author: "caw",
        body: text,
        at: entry.timestamp ? new Date(entry.timestamp) : send.acceptedAt,
      });
    }
  }
  return said;
};

const clock = (at: Date) => `${at.toISOString().slice(11, 16)} UTC`;

export const createThreadRepair = ({
  db,
  history,
  restore,
}: ThreadRepairDeps) => {
  let running = false;

  /** Whether the hub's note says the repair is done. */
  const done = (): boolean =>
    db
      .threadMessages(REPAIRED_THREAD)
      .some((one) => one.author === "event" && one.noteTitle === REPAIR_NOTE);

  /**
   * The person's sends to the project's Caw after the card that no thread
   * has, oldest first; none once repaired, or on a hub without the thread.
   */
  const missedSends = (): SentMessageRow[] => {
    const thread = db.thread(REPAIRED_THREAD);
    if (!thread || done()) {
      return [];
    }
    const messages = db.threadMessages(thread.id);
    // The question's card the owner dismissed: the words that missed the
    // thread were sent after it.
    const card = messages.findLast((one) => one.question);
    if (!card) {
      return [];
    }
    return db
      .leadSends(thread.projectId, card.createdAt)
      .filter(
        (send) =>
          send.body?.origin?.kind === "human" &&
          !messages.some((one) => one.id === send.uuid) &&
          wordsOf(send).trim()
      );
  };

  /** Each send and what Caw said in the turn that read it; undefined while a transcript cannot be read. */
  const linesOf = async (
    missed: SentMessageRow[]
  ): Promise<Line[] | undefined> => {
    const read = new Map<string, SessionMessage[]>();
    const lines: Line[] = [];
    for (const send of missed) {
      let entries = read.get(send.instanceId);
      if (!entries) {
        // biome-ignore lint/performance/noAwaitInLoops: one session's transcript, read once
        const stored = await history(send.instanceId);
        if ("fault" in stored) {
          console.warn(
            `[caw] thread ${REPAIRED_THREAD} is not repaired yet: Caw's transcript did not read (${stored.message}); the next machine to register tries again`
          );
          return;
        }
        ({ entries } = stored);
        read.set(send.instanceId, entries);
      }
      lines.push(
        { author: "you", body: wordsOf(send).trim(), at: send.acceptedAt },
        ...turnWords(entries, send)
      );
    }
    return lines;
  };

  const repair = async (): Promise<void> => {
    const missed = missedSends();
    const [first] = missed;
    if (!first) {
      return;
    }
    const lines = await linesOf(missed);
    // Read again after the awaits: written once.
    if (!lines || done()) {
      return;
    }
    const yours = missed.length === 1 ? "Your message" : "Your messages";
    restore(REPAIRED_THREAD, lines, {
      title: REPAIR_NOTE,
      body: `${yours} from ${clock(first.acceptedAt)} went to Caw's session from the app and never reached this thread, and neither did his answer. They are written in above, at the times they were said. What you send Caw from any device now lands here.`,
    });
    console.log(
      `[caw] thread ${REPAIRED_THREAD} repaired: ${lines.length} message(s) written in`
    );
  };

  /** Runs the repair unless it is running; it does nothing once done. */
  return (): void => {
    if (running) {
      return;
    }
    running = true;
    repair()
      .catch((error: unknown) =>
        console.warn(
          `[caw] thread ${REPAIRED_THREAD} was not repaired: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => {
        running = false;
      });
  };
};
