/**
 * Files a reader attached that are neither a picture nor text reach a
 * session as files on its own machine: each is fetched from the hub's file
 * store, written under `~/.cawco/attachments/<session>/`, and named by its
 * path in one line of the turn. Every harness reads it with its own tools.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  attachedFileLine,
  attachedFileName,
  type FileAttachment,
  type SendPayload,
  type SentMessage,
  type TextAttachment,
} from "@cawco/core";
import { delegationHubUrl } from "./delegation";

const attachmentsDir = (): string => join(homedir(), ".cawco", "attachments");

/** How long one file's fetch from the hub may take. */
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

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
  const response = await fetch(`${delegationHubUrl()}${file.ref}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw fetchFailed(
      file,
      error instanceof Error ? error.message : String(error)
    );
  });
  if (!response.ok) {
    throw fetchFailed(file, `HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
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
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time, in the order they were attached; a 100 MB file at once is enough
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
