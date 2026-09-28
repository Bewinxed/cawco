/**
 * The queue half of the session store, kept out of the runes module so it can
 * be reasoned about — and tested — on its own.
 *
 * A message sent to a busy session waits in the daemon's harness. The
 * dashboard used to have no word on that at all: it drew a local echo the
 * moment the reader hit send, and that guess was the only evidence the message
 * existed. It did not survive a reload, it existed on no other device, and
 * when a re-read of the transcript landed over the top of it the message could
 * simply vanish. The daemon now announces its queue, and these functions are
 * where that announcement takes over from what this tab drew at the press.
 */
import type { QueuedMessage } from "@whiffle/core";
import type { Message } from "./types";

/**
 * A queue entry, as the store keeps it. One this tab drew itself, the moment
 * the reader sent to a busy session, carries `sentAs`: the send command it
 * is, and its queue id until the daemon names it. The announcement takes it
 * over in place and keeps `sentAs`, so its row is keyed the same throughout
 * and the composer's text lands in it once. Until then it also holds `echo`,
 * the turn it is: what goes into the transcript if the daemon starts it at
 * once instead of queueing it, or refuses it.
 */
export type QueueEntry = QueuedMessage & { sentAs?: string; echo?: Message };

/** The parts of a session's state a queue move touches. */
export interface QueueTarget {
  messages: Message[];
  queued: QueueEntry[];
}

/** An entry this tab drew and the daemon has not announced yet. */
const drawn = (entry: QueueEntry): boolean => entry.sentAs === entry.queueId;

/**
 * Files a message the session is holding, and takes back the guess the sender
 * drew for it.
 *
 * The local echo is the dashboard's own optimistic copy ({@link sendText}),
 * marked `queuedLocally` on the way in. The announcement is the daemon's word
 * about that same message, so it REPLACES the copy: newest-first, one-for-one
 * by content, the same absorption discipline `absorbLive` uses when a stored
 * transcript lands over the top of live turns — so a reader who genuinely sent
 * the same sentence twice keeps both of them.
 *
 * A tab that never sent this message — another device, a session opened
 * mid-queue — has no copy to take back and simply gains the row.
 */
export function ingestQueued(target: QueueTarget, entry: QueuedMessage): void {
  if (target.queued.some((queued) => queued.queueId === entry.queueId)) {
    return;
  }
  const mine = target.queued.findIndex(
    (queued) => drawn(queued) && queued.text === entry.text
  );
  if (mine >= 0) {
    target.queued = target.queued.map((queued, i) =>
      i === mine ? { ...entry, sentAs: queued.sentAs } : queued
    );
    return;
  }
  const guess = target.messages.findLast(
    (message) =>
      message.type === "user" &&
      message.metadata?.queuedLocally === true &&
      !message.sdkUuid &&
      message.content === entry.text
  );
  if (guess) {
    target.messages = target.messages.filter((message) => message !== guess);
  }
  target.queued = [...target.queued, entry];
}

/**
 * Takes the hub's snapshot of a session's queue. The snapshot is the truth
 * about what is queued, but it knows nothing of which entries this tab drew:
 * an entry that was one keeps its `sentAs` (so its row keeps its key), and a
 * drawn entry the hub has not heard of yet stays, after the rest.
 */
export function adoptQueue(
  target: QueueTarget,
  entries: QueuedMessage[]
): void {
  const held = target.queued;
  const claimed = new Set<QueueEntry>();
  const next: QueueEntry[] = entries.map((entry) => {
    const mine = held.find(
      (queued) =>
        queued.sentAs !== undefined &&
        !claimed.has(queued) &&
        (queued.queueId === entry.queueId ||
          (drawn(queued) && queued.text === entry.text))
    );
    if (!mine) {
      return entry;
    }
    claimed.add(mine);
    return { ...entry, sentAs: mine.sentAs };
  });
  target.queued = [
    ...next,
    ...held.filter((queued) => drawn(queued) && !claimed.has(queued)),
  ];
}

/**
 * Takes out every entry the model has just read, whoever drew or announced
 * it: the read line carries each one whose words it holds (`match`), because
 * the CLI opens one turn with every send it held, their words joined. The
 * entries are returned so the caller can fly their rows into the turn.
 */
export function takeRead(
  target: QueueTarget,
  match: (entry: QueueEntry) => boolean
): QueueEntry[] {
  const read = target.queued.filter(match);
  if (read.length > 0) {
    target.queued = target.queued.filter((queued) => !match(queued));
  }
  return read;
}

/**
 * Retires a queue entry the session says it has read (`message_dequeued`):
 * what a tab that missed the read turn's own frame still hears.
 */
export function retireQueued(target: QueueTarget, queueId: string): void {
  if (!target.queued.some((queued) => queued.queueId === queueId)) {
    return;
  }
  target.queued = target.queued.filter((queued) => queued.queueId !== queueId);
}

/**
 * Takes back the entry this tab drew for a send the daemon did not queue
 * after all: the turn it became started at once, or the send failed. The
 * entry is returned so the caller can put the turn in its place.
 */
export function takeDrawn(
  target: QueueTarget,
  match: (entry: QueueEntry) => boolean
): QueueEntry | undefined {
  const entry = target.queued.find((queued) => drawn(queued) && match(queued));
  if (entry) {
    target.queued = target.queued.filter((queued) => queued !== entry);
  }
  return entry;
}
