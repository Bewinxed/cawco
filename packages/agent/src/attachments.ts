/**
 * Files a reader attached that are neither a picture nor text reach a
 * session as files on its own machine: each is fetched from the hub's file
 * store, written under `~/.cawco/attachments/<session>/`, and named by its
 * path in one line of the turn. Every harness reads it with its own tools.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  attachedFileLine,
  attachedFileName,
  type FileAttachment,
  type TextAttachment,
} from "@cawco/core/attachments";
import { heardBody, QUIET_MS, readWhileLive } from "@cawco/core/bounded";
import type { SendPayload } from "@cawco/core/protocol";
import type { SentMessage } from "@cawco/core/session-messages";
import { writeStateFile } from "@cawco/core/state-file";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { delegationHubUrl } from "./delegation";
import { provenFetch } from "./hub-proof";

const attachmentsDir = (): string => join(homedir(), ".cawco", "attachments");

const fetchFailed = (file: FileAttachment, why: string): Error =>
  new Error(
    `Couldn't fetch the attached file ${file.name} from the hub: ${why}`
  );

/**
 * Puts one file on this machine for `sessionId` and answers the line that
 * names it. A file that cannot be fetched or written throws.
 */
async function deliverFile(
  sessionId: string,
  file: FileAttachment
): Promise<string> {
  const path = join(attachmentsDir(), attachedFileName(sessionId, file));
  // Waited on while its bytes arrive: its head, then each chunk.
  const read = await readWhileLive<{ bytes: Uint8Array } | { status: number }>(
    async (signal, alive) => {
      // As this machine, with its key's proof: a hub that requires paired
      // devices, and the door of an SSH-added machine, take no request
      // without one (hub hub-auth.ts).
      const response = await provenFetch(`${delegationHubUrl()}${file.ref}`, {
        signal,
      });
      alive();
      const whole = await heardBody(response, alive);
      return whole.ok
        ? { bytes: new Uint8Array(await whole.arrayBuffer()) }
        : { status: whole.status };
    }
  ).catch((error: unknown) => {
    throw fetchFailed(
      file,
      error instanceof Error ? error.message : String(error)
    );
  });
  let bytes: Uint8Array;
  switch (read.kind) {
    case "answered":
      if (!("bytes" in read.value)) {
        throw fetchFailed(file, `HTTP ${read.value.status}`);
      }
      ({ bytes } = read.value);
      break;
    case "unanswered":
      throw fetchFailed(
        file,
        `the hub sent nothing for ${secondsOf(QUIET_MS)} s`
      );
    default:
      unhandled("read", read);
  }
  await writeStateFile(path, bytes);
  return attachedFileLine(path, {
    size: bytes.byteLength,
    mediaType: file.mediaType,
  });
}

/**
 * A turn as its harness takes it: its files put on this machine and named
 * after its words, a blank line between, and the texts it folds in. A file
 * that cannot be fetched fails the send rather than reaching the session
 * without it.
 */
export async function withFiles(
  sessionId: string,
  message: SentMessage,
  attachments: SendPayload["attachments"] = []
): Promise<{ message: SentMessage; texts: TextAttachment[] }> {
  const texts = attachments.filter(
    (attachment): attachment is TextAttachment => attachment.kind === "text"
  );
  const files = attachments.filter(
    (attachment): attachment is FileAttachment => attachment.kind === "file"
  );
  if (!files.length) {
    return { message, texts };
  }
  const lines: string[] = [];
  for (const file of files) {
    lines.push(await deliverFile(sessionId, file));
  }
  const added = lines.join("\n");
  const { content } = message.message;
  return {
    texts,
    message: {
      ...message,
      message: {
        ...message.message,
        content:
          typeof content === "string"
            ? `${content}\n\n${added}`
            : [...content, { type: "text", text: added }],
      },
    },
  };
}
