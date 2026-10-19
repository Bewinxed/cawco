/**
 * Files: every artifact and attachment of one conversation, in one place
 * (the owner: "there's currently no way to view all the previous artifacts
 * or files for a session easily").
 *
 * What it holds, per session: its artifacts as the hub lists them
 * (`listArtifacts`, newest first, each with the thumbnail the hub keeps of
 * it), read when Files asks and again when the session's panel frame names
 * an artifact the list has not got; and its attachments, read off the
 * transcript held here (each message's pictures, pasted texts and files,
 * the person's and what the agent sent), newest first.
 *
 * Where it stands: on a desk, a face of the bar glass's one card (bar-glass
 * `files`, GlassCard); a file chosen there floats on Files' leading side
 * (`picked`, FilesFloat). On a phone, the house bottom drawer (`sheet`,
 * FilesSheet), opened from the sidebar's Files row or a finger from the
 * screen's right edge.
 */
import type { ArtifactSummary } from "@cawco/core";
import { field, KIND_WORDS, matchOf, parse } from "@cawco/core/find-match";
import { SvelteMap } from "svelte/reactivity";
import { listArtifacts } from "../artifact-api";
import { cawco } from "../client.svelte";
import type { Excerpt } from "../find/find-rows";
import { failureWords } from "../hub-read";
import { extensionOf } from "../lightbox/extension";
import { speakerName } from "../transcript/speaker";
import type { Message } from "../types";

/** One session's artifacts as Files last read them. */
interface ArtifactsRead {
  /** The last read's refusal, in the hub's words; null once one answered. */
  failed: string | null;
  /** The list, once read; kept while a read again is on its way. */
  list: ArtifactSummary[] | null;
  reading: boolean;
}

const reads = new SvelteMap<string, ArtifactsRead>();

/** The session's artifacts as last read (undefined: never asked). */
export const artifactsOf = (instanceId: string): ArtifactsRead | undefined =>
  reads.get(instanceId);

/** Reads the session's artifacts; one read at a time per session. */
export function readArtifacts(instanceId: string): void {
  const was = reads.get(instanceId);
  if (was?.reading) {
    return;
  }
  reads.set(instanceId, {
    list: was?.list ?? null,
    failed: null,
    reading: true,
  });
  listArtifacts(instanceId).then(
    (list) => {
      reads.set(instanceId, { list, failed: null, reading: false });
    },
    (error: unknown) => {
      reads.set(instanceId, {
        list: was?.list ?? null,
        failed: failureWords(error),
        reading: false,
      });
    }
  );
}

/** An artifact as Files' cards draw it. */
export interface ArtifactCard {
  artifact: ArtifactSummary;
  /** The words on its page round the first hit, when they are what matched. */
  within: Excerpt["parts"] | null;
}

/* ── Attachments ──────────────────────────────────────────────────── */

/** What opens an attachment: its picture in the lightbox, its text read there, or its file. */
export type AttachmentOpen =
  | { kind: "image"; src: string; alt: string }
  | { kind: "text"; content: string }
  | { kind: "file"; href: string | null };

export interface AttachmentRow {
  /** When its message was, epoch ms; null when the harness gave no time. */
  at: number | null;
  /** Its message's id and its place in it. */
  id: string;
  /** Its kind in a word: "PNG", "Markdown", "Text". */
  kind: string;
  /** The message it rode, for Show in conversation (`?at=`). */
  messageId: string;
  name: string;
  open: AttachmentOpen;
  /** The picture itself, for an image. */
  picture: string | null;
  /** Who sent it: "You", or the agent by its harness's name. */
  who: string;
}

/** A file's kind in a word, from its name or its media type. */
const KIND_OF_EXTENSION: Record<string, string> = {
  md: "Markdown",
  markdown: "Markdown",
  txt: "Text",
  json: "JSON",
  csv: "CSV",
  log: "Log",
  html: "HTML",
  pdf: "PDF",
  ts: "TypeScript",
  js: "JavaScript",
  py: "Python",
  swift: "Swift",
  svelte: "Svelte",
};
const kindOf = (name: string, mediaType?: string): string => {
  const extension = extensionOf(name);
  if (extension) {
    return KIND_OF_EXTENSION[extension] ?? extension.toUpperCase();
  }
  const sub = mediaType?.split("/")[1]?.split("+")[0];
  return sub ? sub.toUpperCase() : "File";
};

/** A file's hub address from its reference (`/api/files/<sha256>`), when the line named the whole hash. */
const fileHref = (ref: string | undefined): string | null =>
  ref?.startsWith("/api/files/") ? ref : null;

/** Every attachment of one message, in the order it carried them. */
function attachmentsOfMessage(
  message: Message,
  who: string,
  pictureNumber: () => number
): AttachmentRow[] {
  const at = message.timestamp ? Date.parse(message.timestamp) : Number.NaN;
  const when = Number.isFinite(at) ? at : null;
  const rows: AttachmentRow[] = [];
  const carried = message.metadata?.attachments ?? [];
  for (const [i, attachment] of carried.entries()) {
    rows.push({
      id: `${message.id}:a${i}`,
      messageId: message.id,
      name: attachment.name,
      kind:
        attachment.kind === "text"
          ? kindOf(attachment.name, "text/plain")
          : kindOf(attachment.name, attachment.mediaType),
      who,
      at: when,
      picture: null,
      open:
        attachment.kind === "text"
          ? { kind: "text", content: attachment.content }
          : { kind: "file", href: fileHref(attachment.ref) },
    });
  }
  for (const [i, image] of (message.metadata?.images ?? []).entries()) {
    if (!image.src) {
      continue;
    }
    const name = `Picture ${pictureNumber()}`;
    rows.push({
      id: `${message.id}:i${i}`,
      messageId: message.id,
      name,
      kind: kindOf("", image.mediaType),
      who,
      at: when,
      picture: image.src,
      open: { kind: "image", src: image.src, alt: name },
    });
  }
  return rows;
}

/**
 * The session's attachments, newest first, read off the transcript held
 * here. Pictures carry no name of their own, so each is numbered in the
 * conversation's order, the first "Picture 1".
 */
export function attachmentsOf(instanceId: string): AttachmentRow[] {
  const session = cawco.session(instanceId);
  if (!session) {
    return [];
  }
  const agent = speakerName(session.harness);
  let pictures = 0;
  const rows = session.messages.flatMap((message) =>
    attachmentsOfMessage(
      message,
      message.type === "user" ? "You" : agent,
      () => {
        pictures += 1;
        return pictures;
      }
    )
  );
  return rows.reverse();
}

/**
 * The attachments a query matches, by the find engine's own matcher
 * (`@cawco/core/find-match`, what the hub's Find answers with): every word
 * must match the name, its kind or who sent it, or a kind word for a file.
 * Best match first, then newest.
 */
export function searchAttachments(
  rows: AttachmentRow[],
  q: string
): AttachmentRow[] {
  const query = parse(q);
  if (query.tokens.length === 0) {
    return rows;
  }
  return rows
    .map((row, order) => ({
      row,
      order,
      score: matchOf(
        {
          asked: new Set(KIND_WORDS.file),
          fields: [
            ...field("title", row.name),
            ...field("kind", `${row.kind} ${row.who}`),
          ],
        },
        query
      ).score,
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ row }) => row);
}

/** What Files holds for the session, once its artifacts are read: the bar's and the sidebar's count. */
export function filesCount(instanceId: string): number | null {
  const list = reads.get(instanceId)?.list;
  return list ? list.length + attachmentsOf(instanceId).length : null;
}

/** The panel frame's ids each session's list was last read for. */
const readFor = new Map<string, string>();

/**
 * Files follows the conversation on screen: its artifacts are read once it
 * is, so the count stands, and again each time its panel frame names a
 * different set of artifacts (one made, one removed): once per change, so a
 * list that never agrees with the frame is never read in a loop.
 */
export function followFiles(instanceId: string | null): void {
  if (!instanceId) {
    return;
  }
  const held = cawco.previews[instanceId]?.artifacts?.join(",") ?? "";
  if (readFor.get(instanceId) === held) {
    return;
  }
  readFor.set(instanceId, held);
  readArtifacts(instanceId);
}

/* ── Where it stands ──────────────────────────────────────────────── */

class FilesPlace {
  /** The conversation on screen whose files Files holds; null off a conversation. */
  session = $state<string | null>(null);
  /** The phone's drawer is open. */
  sheet = $state(false);
  /**
   * The artifact chosen in Files on a desk, floating on Files' leading
   * side: the session's panel shows it there rather than in the split
   * while Files is open (SideSplit reads it).
   */
  picked = $state<{ instanceId: string; id: string } | null>(null);
}

export const files = new FilesPlace();

/** Files holds the session's panel floating beside it: the split leaves it alone. */
export const floatingPanel = (instanceId: string): boolean =>
  files.picked?.instanceId === instanceId;
