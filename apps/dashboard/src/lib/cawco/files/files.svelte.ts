/**
 * Files: every artifact and attachment of one conversation, in one place
 * (the owner: "there's currently no way to view all the previous artifacts
 * or files for a session easily").
 *
 * What it holds, per session, both read from the hub, so neither depends on
 * the transcript pages this tab has loaded: its artifacts (`listArtifacts`,
 * newest first, each with the thumbnail the hub keeps of it) and its
 * attachments (`listAttachments`: every text, file and picture its
 * conversation carried, the person's and the agent's, newest first). Each
 * read is read when Files opens, and again once each time the session moves
 * on (its panel frame names other artifacts, or its newest message
 * changes). Until a read answers there is no count and no "nothing" line.
 *
 * Where it stands: on a desk, a face of the bar glass's one card (bar-glass
 * `files`, GlassCard); a file chosen there floats on Files' leading side
 * (`picked`, FilesFloat). On a phone, the house bottom drawer (`sheet`,
 * FilesSheet), opened from the sidebar's Files row or a finger from the
 * screen's right edge.
 */
import type { ArtifactSummary, SessionAttachment } from "@cawco/core";
import { field, KIND_WORDS, matchOf, parse } from "@cawco/core/find-match";
import { SvelteMap } from "svelte/reactivity";
import { listArtifacts, listAttachments } from "../artifact-api";
import { cawco } from "../client.svelte";
import type { Excerpt } from "../find/find-rows";
import { failureWords } from "../hub-read";
import { extensionOf } from "../lightbox/extension";
import { paneDrafts } from "../transcript/composer-draft.svelte";
import { speakerName } from "../transcript/speaker";

/** One of a session's lists as Files last read it. */
export interface ListRead<T> {
  /** The last read's refusal, in the hub's words, kept while it is read again; null once one answered. */
  failed: string | null;
  /** The list, once read; kept while a read again is on its way. */
  list: T[] | null;
  reading: boolean;
}

/** A hub read per session, one at a time: what it holds, read, and read again. */
class SessionReads<T> {
  readonly #held = new SvelteMap<string, ListRead<T>>();
  readonly #reading = new Map<string, Promise<void>>();
  readonly #read: (instanceId: string) => Promise<T[]>;

  constructor(read: (instanceId: string) => Promise<T[]>) {
    this.#read = read;
  }

  of(instanceId: string): ListRead<T> | undefined {
    return this.#held.get(instanceId);
  }

  /** Reads the session's list; a read on its way is the one answered. */
  read(instanceId: string): Promise<void> {
    const going = this.#reading.get(instanceId);
    if (going) {
      return going;
    }
    const was = this.#held.get(instanceId);
    this.#held.set(instanceId, {
      list: was?.list ?? null,
      failed: was?.failed ?? null,
      reading: true,
    });
    const read = this.#read(instanceId).then(
      (list) => {
        this.#held.set(instanceId, { list, failed: null, reading: false });
      },
      (error: unknown) => {
        this.#held.set(instanceId, {
          list: was?.list ?? null,
          failed: failureWords(error),
          reading: false,
        });
      }
    );
    const done = read.finally(() => {
      this.#reading.delete(instanceId);
    });
    this.#reading.set(instanceId, done);
    return done;
  }
}

const artifactReads = new SessionReads<ArtifactSummary>(listArtifacts);
/** The harness each session's attachments were read under, for who sent them. */
const harnessOf = new SvelteMap<string, string>();
const attachmentReads = new SessionReads<SessionAttachment>(
  async (instanceId) => {
    const read = await listAttachments(instanceId);
    harnessOf.set(instanceId, read.harness);
    return read.attachments;
  }
);

/** The session's artifacts as last read (undefined: never asked). */
export const artifactsOf = (
  instanceId: string
): ListRead<ArtifactSummary> | undefined => artifactReads.of(instanceId);

/** Reads the session's artifacts again; its promise settles once the hub answered. */
export const readArtifacts = (instanceId: string): Promise<void> =>
  artifactReads.read(instanceId);

/** Reads the session's attachments again; its promise settles once the hub answered. */
export const readAttachments = (instanceId: string): Promise<void> =>
  attachmentReads.read(instanceId);

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
  /** Its message's id and its place among the list. */
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
const kindOf = (name: string, mediaType: string): string => {
  const extension = extensionOf(name);
  if (extension) {
    return KIND_OF_EXTENSION[extension] ?? extension.toUpperCase();
  }
  const sub = mediaType.split("/")[1]?.split("+")[0];
  return sub ? sub.toUpperCase() : "File";
};

/** A file's hub address (`/api/files/<sha256>`), when its line named the whole hash. */
const fileHref = (ref: string | undefined): string | null =>
  ref?.startsWith("/api/files/") ? ref : null;

/** One attachment as Files' rows draw it. */
const rowOf = (
  attachment: SessionAttachment,
  place: number,
  agent: string
): AttachmentRow => {
  const at = attachment.at ? Date.parse(attachment.at) : Number.NaN;
  let open: AttachmentOpen = {
    kind: "file",
    href: fileHref(attachment.ref),
  };
  if (attachment.kind === "image" && attachment.src) {
    open = { kind: "image", src: attachment.src, alt: attachment.name };
  } else if (attachment.kind === "text") {
    open = { kind: "text", content: attachment.content ?? "" };
  }
  return {
    id: `${attachment.messageId}:${place}`,
    messageId: attachment.messageId,
    name: attachment.name,
    kind:
      attachment.kind === "image"
        ? kindOf("", attachment.mediaType)
        : kindOf(attachment.name, attachment.mediaType),
    who: attachment.who === "person" ? "You" : agent,
    at: Number.isFinite(at) ? at : null,
    picture: attachment.kind === "image" ? (attachment.src ?? null) : null,
    open,
  };
};

/** The session's attachments as last read (undefined: never asked). */
export function attachmentsOf(instanceId: string):
  | (Omit<ListRead<SessionAttachment>, "list"> & {
      list: AttachmentRow[] | null;
    })
  | undefined {
  const read = attachmentReads.of(instanceId);
  if (!read) {
    return;
  }
  const agent = speakerName(harnessOf.get(instanceId));
  return {
    ...read,
    list: read.list?.map((one, place) => rowOf(one, place, agent)) ?? null,
  };
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

/** What Files holds for the session, once both its lists are read: the bar's and the sidebar's count. */
export function filesCount(instanceId: string): number | null {
  const artifacts = artifactReads.of(instanceId)?.list;
  const attachments = attachmentReads.of(instanceId)?.list;
  return artifacts && attachments
    ? artifacts.length + attachments.length
    : null;
}

/** Where each session stood when its lists were last read: its panel frame's artifacts and its newest message. */
const readAt = new Map<string, string>();

/**
 * Files follows the conversation on screen: its lists are read once it is,
 * so the count stands, and again once each time the session moves on (its
 * panel frame names other artifacts, or its newest message changes), never
 * in a loop.
 */
export function followFiles(instanceId: string | null): void {
  if (!instanceId) {
    return;
  }
  const held = cawco.previews[instanceId]?.artifacts?.join(",") ?? "";
  const newest = cawco.session(instanceId)?.messages.at(-1)?.id ?? "";
  const at = `${held}|${newest}`;
  if (readAt.get(instanceId) === at) {
    return;
  }
  readAt.set(instanceId, at);
  readArtifacts(instanceId);
  readAttachments(instanceId);
}

/**
 * The Empty Starts Work Rule, a session's own case: its Files are filled by
 * its own agent, so the empty state's one action puts these words in the
 * session's composer, the caret after them, nothing sent.
 */
export const ASK_FOR_A_PAGE = "Make a page that shows what we've done so far";

/** Puts the ask in the session's composer; false when its pane isn't standing. */
export function askForAPage(instanceId: string): boolean {
  const draft = paneDrafts.get(instanceId);
  if (!draft) {
    return false;
  }
  draft.ask(ASK_FOR_A_PAGE);
  return true;
}

/* ── Where it stands ──────────────────────────────────────────────── */

class FilesPlace {
  /** The conversation on screen whose files Files holds; null off a conversation. */
  session = $state<string | null>(null);
  /** The phone's drawer is open. */
  sheet = $state(false);
  /**
   * What the drawer gives the focus back to when it closes, handed over by
   * what opened it when the opener itself goes away: the sidebar's Files
   * row goes with the sidebar, so it hands over the burger (as bar-glass
   * `invoker` does for Jump).
   */
  returnTo: HTMLElement | null = null;
  /**
   * The artifact chosen in Files on a desk, floating on Files' leading
   * side: the session's panel shows it there rather than in the split
   * while Files is open (SideSplit reads it). `panelWasOpen`: the session's
   * panel stood open before Files opened it, so Files put away gives it
   * back to the split; otherwise Files closes it, and no conversation moves
   * for a panel the person had shut.
   */
  picked = $state<{
    instanceId: string;
    id: string;
    panelWasOpen: boolean;
    /** Chosen from the keyboard: the focus goes to the panel's name. */
    byKeyboard: boolean;
  } | null>(null);
}

/** The split's share of the page (Split), the float's widest. */
const FLOAT_SHARE = 0.45;

/**
 * Where the file floating beside Files stands, read off Files' card and the
 * rail: its top on Files' top, its trailing edge `--space-3` clear of
 * Files' leading one, the split's share of the page at most and never
 * nearer the rail than the same. Null when Files' card isn't drawn.
 */
export function floatPlace(): {
  top: number;
  right: number;
  width: number;
} | null {
  const card = document.querySelector<HTMLElement>(".kit-pop.files-pop");
  if (!card) {
    return null;
  }
  const gap = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--space-3")
  );
  const box = card.getBoundingClientRect();
  const rail =
    document
      .querySelector<HTMLElement>("[data-slot='rail']")
      ?.getBoundingClientRect().right ?? 0;
  const room = box.left - gap - (rail + gap);
  return {
    top: box.top,
    right: window.innerWidth - box.left + gap,
    width: Math.max(
      0,
      Math.min((window.innerWidth - rail) * FLOAT_SHARE, room)
    ),
  };
}

export const files = new FilesPlace();

/** Files holds the session's panel floating beside it: the split leaves it alone. */
export const floatingPanel = (instanceId: string): boolean =>
  files.picked?.instanceId === instanceId;
