/**
 * The rows only this tab draws: a message it is sending, before the hub has
 * it, and a failure it saw. Everything else in a transcript is the hub's.
 */
import type { SendPayload } from "@cawco/core";
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
          attachments: attachments?.map(({ name, content }) => ({
            name,
            content,
          })),
          images: images?.map(({ mediaType, data }) => ({
            mediaType,
            src: `data:${mediaType};base64,${data}`,
          })),
        }
      : undefined,
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
