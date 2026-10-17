/**
 * The rows only this tab draws: a message it is sending, before the hub has
 * it, a failure it saw, and an ask it saw withdrawn or answered elsewhere.
 * Everything else in a transcript is the hub's.
 */
import type { AskAnswer, SendPayload } from "@cawco/core";
import { newId } from "../id";
import type { Message } from "../types";

/**
 * The row this tab draws for a message it is sending, under the uuid the
 * message goes out with — the row its record takes over once the hub has it.
 * It waits at the end, where that record puts a send not read yet.
 */
export function localUserMessage(
  instanceId: string,
  id: string,
  text: string,
  { attachments, images }: Pick<SendPayload, "attachments" | "images"> = {}
): Message {
  const carried = Boolean(attachments?.length || images?.length);
  return {
    id,
    instanceId,
    type: "user",
    state: "sending",
    queued: true,
    content: text,
    timestamp: new Date().toISOString(),
    // Thumbnails come from the same base64 that went out: nothing comes back to
    // build them from, since the live path never echoes the user's own turn.
    metadata: carried
      ? {
          attachments: attachments?.map((attachment) =>
            attachment.kind === "file"
              ? {
                  kind: "file" as const,
                  name: attachment.name,
                  mediaType: attachment.mediaType,
                  size: attachment.size,
                  ref: attachment.ref,
                }
              : {
                  kind: "text" as const,
                  name: attachment.name,
                  content: attachment.content,
                }
          ),
          images: images?.map(({ mediaType, data }) => ({
            mediaType,
            src: `data:${mediaType};base64,${data}`,
          })),
        }
      : undefined,
  };
}

/**
 * The quiet line an ask leaves when it is withdrawn before it is answered
 * (the turn interrupted, the session gone): the composer it grew folds back,
 * and this says why it went. `why` is the hub's, for an ask it could not show
 * anyone: then this line is the only sign there was one.
 */
export function withdrawnNote(
  instanceId: string,
  question: boolean,
  why?: string
): Message {
  const line = question ? "Question withdrawn" : "Permission request withdrawn";
  return {
    id: newId(),
    instanceId,
    type: "ui.system_note",
    content: why ? `${line}: it couldn't be shown (${why})` : line,
    timestamp: new Date().toISOString(),
  };
}

/**
 * The same line for an ask answered somewhere other than this tab while it
 * held the card (JOURNEY.md Flow 2: "the answer row resolves to the answer
 * that won, naming where it came from"): "Already answered — Denied from the
 * app." `harness` names the session's harness, for an ask it took itself.
 */
export function answeredNote(
  instanceId: string,
  question: boolean,
  answer: AskAnswer,
  harness: string
): Message {
  let word: string | null = null;
  if (answer.behavior === "allow") {
    word = question ? "Answered" : "Approved";
  } else if (answer.behavior === "deny") {
    word = question ? "Dismissed" : "Denied";
  }
  const where = {
    page: answer.name ? `from ${answer.name}` : "from another tab",
    app: answer.name ? `from ${answer.name}` : "from the app",
    session: answer.name ? `by ${answer.name}` : "by another session",
    harness: `in ${harness}`,
  }[answer.via];
  return {
    id: newId(),
    instanceId,
    type: "ui.system_note",
    content: word
      ? `Already answered — ${word} ${where}`
      : `Already answered ${where}`,
    timestamp: new Date().toISOString(),
  };
}

/** A client- or hub-side failure, rendered inline so it cannot be missed. */
export function errorMessage(instanceId: string, text: string): Message {
  return {
    id: newId(),
    instanceId,
    type: "ui.error",
    content: text,
    timestamp: new Date().toISOString(),
  };
}
