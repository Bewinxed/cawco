/**
 * A session's attachments, read off its whole transcript (Files'
 * Attachments, `GET /api/instances/:id/attachments`): every text the person
 * pasted at length, every file, and every picture its messages carried,
 * the person's and the agent's, newest first. Pictures carry no name of
 * their own, so each is numbered in the conversation's order, the first
 * "Picture 1".
 */
import type {
  SessionAttachment,
  TranscriptBlock,
  TranscriptPage,
} from "@cawco/core";

/** Blocks per page the walk asks for, back to the conversation's start. */
export const ATTACHMENT_PAGE_LIMIT = 500;

/** One block's attachments, in the order it carried them. */
const ofBlock = (
  block: TranscriptBlock,
  pictureNumber: () => number
): SessionAttachment[] => {
  const who = block.type === "user" ? "person" : "agent";
  const at = block.timestamp ?? null;
  const rows: SessionAttachment[] = [];
  /** Its id: its message's id and its place within that message, the same however the list grows. */
  const idOf = () => `${block.id}:${rows.length}`;
  for (const attachment of block.metadata?.attachments ?? []) {
    rows.push(
      attachment.kind === "text"
        ? {
            id: idOf(),
            kind: "text",
            name: attachment.name,
            mediaType: "text/plain",
            content: attachment.content,
            messageId: block.id,
            who,
            at,
          }
        : {
            id: idOf(),
            kind: "file",
            name: attachment.name,
            mediaType: attachment.mediaType,
            size: attachment.size,
            ...(attachment.ref ? { ref: attachment.ref } : {}),
            messageId: block.id,
            who,
            at,
          }
    );
  }
  for (const image of block.metadata?.images ?? []) {
    if (!image.src) {
      continue;
    }
    rows.push({
      id: idOf(),
      kind: "image",
      name: `Picture ${pictureNumber()}`,
      mediaType: image.mediaType,
      src: image.src,
      messageId: block.id,
      who,
      at,
    });
  }
  return rows;
};

/** The attachments of `pages`, read newest page first, newest first. */
export function attachmentsOfPages(
  pages: TranscriptPage[]
): SessionAttachment[] {
  const blocks = pages
    .toReversed()
    .flatMap((page) => [...page.blocks, ...(page.queued ?? [])]);
  let pictures = 0;
  const rows = blocks.flatMap((block) =>
    ofBlock(block, () => {
      pictures += 1;
      return pictures;
    })
  );
  return rows.reverse();
}
