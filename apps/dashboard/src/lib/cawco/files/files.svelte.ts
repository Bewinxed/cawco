/**
 * Files: every artifact and attachment of one conversation, in one place
 * (the owner: "there's currently no way to view all the previous artifacts
 * or files for a session easily").
 *
 * What it holds, per session, both read from the hub, so neither depends on
 * the transcript pages this tab has loaded: its artifacts that reached the
 * person (`listFiles`, newest first, each with the thumbnail the hub keeps
 * of it; every other one stays in its panel's menu) and its
 * attachments (`listAttachments`: every text, file and picture its
 * conversation carried, the person's and the agent's, newest first). Each
 * read is read when Files opens, and again once each time the session moves
 * on (its panel frame names other artifacts, or its newest message
 * changes). Until a read answers there is no count and no "nothing" line.
 *
 * Where it stands: on a desk, a face of the bar glass's one card (bar-glass
 * `files`, GlassCard). On a phone, the house bottom drawer (`sheet`,
 * FilesSheet), opened from the sidebar's Files row or a finger from the
 * screen's right edge. Either way, an artifact chosen there opens in the
 * session's own panel, and Files goes (owner: "if i open an artifact from
 * the folder tab, it doesn't dismiss the panel").
 */

import { field, KIND_WORDS, matchOf, parse } from "@cawco/core/find-match";
import { machineCalled, machineFaultWords } from "@cawco/core/machine-names";
import type { ArtifactSummary, SessionAttachment } from "@cawco/core/protocol";
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { listAttachments, listFiles } from "../artifact-api";
import { cawco, storedReadWaits } from "../client.svelte";
import type { Excerpt } from "../find/find-rows";
import { failureWords } from "../hub-read";
import { extensionOf } from "../lightbox/extension";
import { readJson, writeJson } from "../storage";
import { paneDrafts } from "../transcript/composer-draft.svelte";
import { speakerName } from "../transcript/speaker";
import { onArtifactReached } from "./reached";

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

const artifactReads = new SessionReads<ArtifactSummary>(listFiles);
/** The harness each session's attachments were read under, for who sent them. */
const harnessOf = new SvelteMap<string, string>();
const attachmentReads = new SessionReads<SessionAttachment>(
  async (instanceId) => {
    // A stored conversation's attachments are read off its whole transcript,
    // on its machine: while the board lists that machine away the hub could
    // only refuse the read (503), so it is not asked, and its refusal's own
    // words stand in its place (`followFiles` reads it once the machine is
    // back).
    const waits = storedReadWaits(instanceId);
    if (waits?.on === "machine") {
      throw new Error(
        machineFaultWords(
          machineCalled(waits.machine.machineId, cawco.machines),
          "offline"
        )
      );
    }
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

/*
 * An artifact a view of this tab had on screen has reached the person
 * (files/reached.ts): Files, once it read the session, reads it again when
 * it doesn't list it.
 */
onArtifactReached((instanceId, id) => {
  const list = artifactReads.of(instanceId)?.list;
  if (list && !list.some((artifact) => artifact.id === id)) {
    readArtifacts(instanceId);
  }
});

/**
 * Reads the session's attachments again; its promise settles once the hub
 * answered. A stored conversation's waits for the first board, which says
 * whether its machine is there (`followFiles` reads it then).
 */
export const readAttachments = (instanceId: string): Promise<void> =>
  storedReadWaits(instanceId)?.on === "board"
    ? Promise.resolve()
    : attachmentReads.read(instanceId);

/** An artifact as Files' cards draw it. */
export interface ArtifactCard {
  artifact: ArtifactSummary;
  /** The words on its page round the first hit, when they are what matched. */
  within: Excerpt["parts"] | null;
}

/* ── Attachments ──────────────────────────────────────────────────── */

/** What opens an attachment: its picture in the lightbox, its text read there, or its file. */
type AttachmentOpen =
  | { kind: "image"; src: string; alt: string }
  | { kind: "text"; content: string }
  | { kind: "file"; href: string | null };

export interface AttachmentRow {
  /** When its message was, epoch ms; null when the harness gave no time. */
  at: number | null;
  /** Its message's id and its place within that message (the hub's): the same however the list grows. */
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
const rowOf = (attachment: SessionAttachment, agent: string): AttachmentRow => {
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
    id: attachment.id,
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
    list: read.list?.map((one) => rowOf(one, agent)) ?? null,
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

/** Where each session stood when each of its lists was last read. */
const artifactsReadAt = new Map<string, string>();
const attachmentsReadAt = new Map<string, string>();

/** The newest of the session's loaded messages that carried an attachment, by its id; "" for none. */
const newestCarrying = (instanceId: string): string => {
  const messages = cawco.session(instanceId)?.messages ?? [];
  for (let at = messages.length - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (
      message &&
      ((message.metadata?.attachments?.length ?? 0) > 0 ||
        (message.metadata?.images?.length ?? 0) > 0)
    ) {
      return message.id;
    }
  }
  return "";
};

/**
 * What waits on the person among the session's artifacts, as Needs you has
 * it now (core artifact-needs.ts): each one's reasons and raise, and its
 * notices. A change is a card's dot or reason moving.
 */
const waitingKey = (instanceId: string): string =>
  JSON.stringify([
    cawco.artifactNeeds
      .filter((need) => need.instanceId === instanceId)
      .map((need) => [
        need.artifactId,
        need.raisedAt,
        need.parked,
        need.pending,
      ]),
    cawco.artifactNotices
      .filter((notice) => notice.instanceId === instanceId)
      .map((notice) => [notice.artifactId, notice.parts]),
  ]);

/**
 * Files follows the conversation on screen: its lists are read once it is,
 * so the count stands, and each again only when it can have changed: the
 * artifacts when its panel frame names other artifacts (one made, one
 * removed) or what waits on the person among them moves (Needs you's
 * `artifact.needs`), the attachments when a new message carries one. A
 * reply that carries none reads nothing again.
 */
export function followFiles(instanceId: string | null): void {
  if (!instanceId) {
    return;
  }
  const held = `${cawco.previews[instanceId]?.artifacts?.join(",") ?? ""}|${waitingKey(instanceId)}`;
  if (artifactsReadAt.get(instanceId) !== held) {
    artifactsReadAt.set(instanceId, held);
    readArtifacts(instanceId);
  }
  // A stored conversation's machine away is a place of its own: its read
  // says so without asking, and the machine back reads it once.
  const waits = storedReadWaits(instanceId);
  if (waits?.on === "board") {
    return;
  }
  // The machine back, its transcript is read again first (client.svelte.ts
  // `readBehind`): the attachments are read once that lands, by the newest
  // message it brings, not before it and again after.
  if (
    !waits &&
    attachmentsReadAt.get(instanceId)?.startsWith("away:") &&
    cawco.session(instanceId)?.loading
  ) {
    return;
  }
  const carrying =
    waits?.on === "machine"
      ? `away:${waits.machine.machineId}`
      : newestCarrying(instanceId);
  if (attachmentsReadAt.get(instanceId) !== carrying) {
    attachmentsReadAt.set(instanceId, carrying);
    readAttachments(instanceId);
  }
}

/**
 * The Empty Starts Work Rule, a session's own case: its Files are filled by
 * its own agent, so the empty state's one action puts these words in the
 * session's composer, the caret after them, nothing sent.
 */
const ASK_FOR_A_PAGE = "Make a page that shows what we've done so far";

/** Puts the ask in the session's composer; false when its pane isn't standing. */
export function askForAPage(instanceId: string): boolean {
  const draft = paneDrafts.get(instanceId);
  if (!draft) {
    return false;
  }
  draft.ask(ASK_FOR_A_PAGE);
  return true;
}

/** Opens the session's composer's own attach picker; false when its pane isn't standing. */
export function attachToSession(instanceId: string): boolean {
  const draft = paneDrafts.get(instanceId);
  if (!draft) {
    return false;
  }
  draft.pickFiles();
  return true;
}

/* ── How the artifacts are shown ──────────────────────────────────── */

/** The artifacts as their thumbnails' masonry, or one row each as the attachments are. */
export type ArtifactsView = "thumbnails" | "list";

const VIEW_KEY = "cawco-files-view";
const view = $state<{ shown: ArtifactsView }>({
  shown:
    readJson(VIEW_KEY, z.unknown(), "thumbnails") === "list"
      ? "list"
      : "thumbnails",
});

/**
 * Thumbnails or list, the person's pick, kept in this browser as the
 * home's Working or Finished is (home/work-tab): the bar's card, the
 * phone's drawer and every session's Files read the one answer, and a
 * reload keeps it. Thumbnails until the person picks.
 */
export const artifactsView = {
  get shown(): ArtifactsView {
    return view.shown;
  },
  set(shown: ArtifactsView): void {
    view.shown = shown;
    writeJson(VIEW_KEY, shown);
  },
};

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
}

export const files = new FilesPlace();

/**
 * An artifact chosen in Files from the keyboard: the focus goes to the name
 * of the session's panel showing it (its `[data-artifact-trigger]`, beside
 * the conversation or in its sheet on the composer) as soon as that stands
 * and takes the focus, so the person goes on from where it opened (WAI-ARIA
 * APG, Dialog (Modal) Pattern: on close the focus goes back to the invoker
 * "unless … The invoking element no longer exists. Then, focus is set on
 * another element that provides logical work flow"). Files' own close may
 * hand the focus to its opener first; this takes it on from there. A press
 * or a key before the panel stands is the person moving on: it lets go.
 */
export function focusPanelName(artifactId: string): void {
  const name = `:is([data-side-pane], [data-preview-sheet][data-state="open"]) [data-artifact-trigger][data-artifact="${CSS.escape(artifactId)}"]`;
  const land = (): boolean => {
    const trigger = document.querySelector<HTMLElement>(name);
    if (!trigger || trigger.closest("[inert]")) {
      return false;
    }
    trigger.focus({ preventScroll: true });
    return document.activeElement === trigger;
  };
  // The panel already showed it: its name stands now.
  if (land()) {
    return;
  }
  const seen = new MutationObserver(() => {
    if (land()) {
      letGo();
    }
  });
  const letGo = () => {
    seen.disconnect();
    window.removeEventListener("pointerdown", letGo, true);
    window.removeEventListener("keydown", letGo, true);
  };
  seen.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["inert", "data-state", "data-artifact"],
  });
  window.addEventListener("pointerdown", letGo, true);
  window.addEventListener("keydown", letGo, true);
}
