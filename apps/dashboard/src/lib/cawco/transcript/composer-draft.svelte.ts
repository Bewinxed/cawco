/**
 * What one conversation has half-written: the text, the attachments, and
 * the element notes picked out of its preview.
 *
 * It belongs to the conversation, not to whichever composer is drawing it.
 * A desk draws one composer per pane, each over its own draft; a phone
 * draws ONE composer for the whole deck and points it at the draft of
 * whichever conversation is in front, so a swipe between chats changes the
 * words in the box without the box moving. `SessionPane` holds one of these
 * per conversation for as long as the conversation is open, and keeps it
 * across a reload through `draft-store.ts`.
 */
import { SvelteSet } from "svelte/reactivity";
import type { SendExtras } from "../client.svelte";
import { newId } from "../id";
import type {
  CapturedSelection,
  PendingSelection,
  SelectionShot,
} from "../preview/selection";
import type { DraftContent } from "./draft-store";
import { uploadFile } from "./file-upload";

/** A paste longer than this rides as a named attachment, not inline text. */
const LARGE_PASTE = 1200;

/** The largest file that rides as text, folded into the turn. */
const TEXT_LIMIT = 1024 * 1024;

/** base64 without the `data:` prefix — the wire shape images travel in. */
function readImage(file: File): Promise<PendingImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        mediaType: file.type,
        data: result.slice(result.indexOf(",") + 1),
        name: file.name,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A file's words, when it is small and reads as UTF-8 text; else undefined. */
async function textOf(file: File): Promise<string | undefined> {
  if (file.size > TEXT_LIMIT) {
    return;
  }
  let text: string | undefined;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer()
    );
  } catch {
    // Not UTF-8: a file, not a text.
  }
  return text?.includes("\u0000") ? undefined : text;
}

export interface PendingImage {
  data: string;
  mediaType: string;
  name: string;
}

export interface PendingText {
  content: string;
  kind: "text";
  name: string;
}

/**
 * A file that is neither a picture nor text: uploading to the hub as soon as
 * it is attached, then ready (`ref`), or failed (`error`) and kept with its
 * bytes so a tap tries it again.
 */
export interface PendingFile {
  /** Its bytes, while this tab may have to upload them (again). */
  blob?: Blob;
  error?: string;
  id: string;
  mediaType: string;
  name: string;
  /** How far its upload has gone, 0 to 1. */
  progress: number;
  /** The hub's reference, once it has the file. */
  ref?: string;
  size: number;
}

/** The most element notes one message carries. */
const MAX_SELECTIONS = 12;

/**
 * The queued messages whose words are in a composer, by uuid, whichever
 * conversation's: their bubbles fold to their tag while the words are away.
 */
export const liftedIds = new SvelteSet<string>();

/**
 * A queued message whose words are in the composer for editing (lift.svelte.ts).
 * What the composer held before steps aside until they go back.
 */
export interface Lift {
  /** What the composer held, kept whole until the words go back. */
  aside: DraftContent;
  /** The queued message, by its uuid. */
  id: string;
  instanceId: string;
  /** Its words as they are queued: what goes back when the edit is kept. */
  words: string;
}

export class ComposerDraft {
  text = $state("");
  images = $state<PendingImage[]>([]);
  texts = $state<PendingText[]>([]);
  files = $state<PendingFile[]>([]);
  selections = $state<PendingSelection[]>([]);
  /** The note whose editor is (or was last) open, and whether it is open. */
  editing = $state<PendingSelection | null>(null);
  editorOpen = $state(false);
  /** Each note's chip, so closing its editor can hand focus back to it. */
  anchors = $state<Record<string, HTMLButtonElement | undefined>>({});
  /**
   * Set when something outside the composer put words back — a failed send
   * restored by Edit. The composer drawing this draft focuses its field and
   * clears the flag.
   */
  focusWanted = $state(false);
  /**
   * The message last emptied into a send, kept whole until the hub takes it
   * (`settle`). A reload in that gap, or after the send failed, brings it
   * back rather than losing it.
   */
  unsent = $state<DraftContent | null>(null);
  /** The queued message being edited here, while its words are in the field. */
  lifted = $state<Lift | null>(null);
  /**
   * What became of this conversation's last queued edit, when it did not go
   * as asked: said over the field until the next keystroke or send.
   */
  notice = $state("");

  /**
   * What should survive a reload right now: the message being written, or,
   * while nothing new is being written, the one sent and not yet taken.
   * Element notes are not "new writing": they stay in the draft through a
   * send until the hub accepts them.
   */
  get keep(): DraftContent {
    // A queued message's words in the field are its, not new writing: what
    // they stepped in front of is what a reload brings back.
    if (this.lifted) {
      return $state.snapshot(this.lifted.aside);
    }
    const writing =
      this.text.length > 0 ||
      this.images.length > 0 ||
      this.texts.length > 0 ||
      this.files.length > 0;
    // Held in state, the unsent message is a proxy all the way down, and a
    // proxy cannot be stored: its plain copy is what gets kept.
    if (!writing && this.unsent) {
      return $state.snapshot(this.unsent);
    }
    return {
      text: this.text,
      images: this.images,
      texts: $state.snapshot(this.texts),
      files: $state.snapshot(this.files),
      selections: $state.snapshot(this.selections),
    };
  }

  /** Takes back a stored message, as it was: names, notes and all. */
  fill(content: DraftContent): void {
    this.text = content.text;
    this.images = content.images;
    this.texts = content.texts;
    this.files = content.files;
    this.selections = content.selections;
  }

  /**
   * A queued message's words come into the field to be edited; what the
   * field held steps aside, notes and attachments with it.
   */
  lift(id: string, instanceId: string, words: string): void {
    this.lifted = {
      id,
      instanceId,
      words,
      aside: {
        text: this.text,
        images: this.images,
        texts: $state.snapshot(this.texts),
        files: $state.snapshot(this.files),
        selections: $state.snapshot(this.selections),
      },
    };
    liftedIds.add(id);
    this.editorOpen = false;
    this.editing = null;
    this.text = words;
    this.images = [];
    this.texts = [];
    this.files = [];
    this.selections = [];
  }

  /**
   * The words leave the field (back to their bubble, or sent in its place)
   * and what stepped aside comes back. Returns what the field held.
   */
  putBack(): string {
    const { lifted } = this;
    const held = this.text;
    if (lifted) {
      this.lifted = null;
      liftedIds.delete(lifted.id);
      this.fill(lifted.aside);
    }
    return held;
  }

  /**
   * An edit that could not replace its message stays to be sent as a new
   * one: after whatever the field holds, never in place of it.
   */
  keepEdit(words: string): void {
    const typed = this.text.trimEnd();
    this.text = typed ? `${typed}\n\n${words}` : words;
  }

  /** The hub took the last send: nothing of it needs keeping. */
  settle(): void {
    this.unsent = null;
  }

  hasContent = $derived(
    this.text.trim().length > 0 ||
      this.images.length > 0 ||
      this.texts.length > 0 ||
      this.files.length > 0 ||
      this.selections.length > 0
  );

  /** A file is still on its way to the hub: nothing sends until it lands. */
  uploading = $derived(this.files.some((file) => !(file.ref || file.error)));
  /** A file the hub does not have: sending now would leave it behind. */
  unready = $derived(this.files.some((file) => !file.ref));

  /**
   * What an attached file becomes, as on iOS: a picture; a text (up to
   * 1 MB, UTF-8), folded into the turn; or any other file, which goes up to
   * the hub at once and rides the send as the hub's reference.
   */
  async add(files: Iterable<File>): Promise<void> {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential by intent — each attachment must append in the order it was picked, not the order its read happens to settle.
        this.images = [...this.images, await readImage(file)];
        continue;
      }
      const text = await textOf(file);
      if (text === undefined) {
        const id = newId();
        this.files = [
          ...this.files,
          {
            id,
            name: file.name,
            mediaType: file.type || "application/octet-stream",
            size: file.size,
            progress: 0,
            blob: file,
          },
        ];
        this.upload(id);
      } else {
        this.texts = [
          ...this.texts,
          { kind: "text", name: file.name, content: text },
        ];
      }
    }
  }

  /** Sends one pending file's bytes to the hub, its chip following along. */
  upload(id: string): void {
    const file = this.files.find((each) => each.id === id);
    if (!file?.blob) {
      return;
    }
    file.error = undefined;
    file.progress = 0;
    const patch = (change: Partial<PendingFile>) => {
      const kept = this.files.find((each) => each.id === id);
      if (kept) {
        Object.assign(kept, change);
      }
    };
    uploadFile(file.blob, file.name, (progress) => patch({ progress }))
      .then(({ ref, size, mediaType }) =>
        patch({ ref, size, mediaType, progress: 1, blob: undefined })
      )
      .catch((error: unknown) =>
        patch({
          error: error instanceof Error ? error.message : String(error),
        })
      );
  }

  /**
   * A paste into the field: files in it are attached, and a paste longer
   * than {@link LARGE_PASTE} rides as a named attachment. True when the
   * paste was taken here, and the field must not insert it.
   */
  paste(data: DataTransfer | null): boolean {
    if (!data) {
      return false;
    }
    const files = [...data.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (files.length) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — a paste handler returns synchronously, independent of the read.
      void this.add(files);
      return true;
    }
    const text = data.getData("text/plain");
    if (text.length > LARGE_PASTE) {
      this.texts = [
        ...this.texts,
        {
          kind: "text",
          name: `Pasted text · ${text.length.toLocaleString()} chars`,
          content: text,
        },
      ];
      return true;
    }
    return false;
  }

  /** Lets every attachment go: the draft keeps its text and notes. */
  dropAttachments(): void {
    this.images = [];
    this.texts = [];
    this.files = [];
  }

  /** An element picked in the preview becomes a note on the next message. */
  attach(selection: CapturedSelection): "added" | "duplicate" | "full" {
    this.editorOpen = false;
    if (
      this.selections.some(
        ({ element }) =>
          element.url === selection.element.url &&
          element.selector === selection.element.selector
      )
    ) {
      return "duplicate";
    }
    if (this.selections.length === MAX_SELECTIONS) {
      return "full";
    }
    const note = { ...selection, id: newId() };
    this.selections.push(note);
    this.editing = this.selections.at(-1) ?? null;
    this.editorOpen = true;
    return "added";
  }

  /** A note whose element screenshot is still on its way: Send waits for it. */
  capturing = $derived(this.selections.some((s) => s.capturing !== null));

  /**
   * A picked element's screenshot arrived (or failed, null) under the
   * overlay's pick id; the note waiting on it takes it.
   */
  captured(pick: string, shot: SelectionShot | null): void {
    const note = this.selections.find((s) => s.capturing === pick);
    if (note) {
      if (shot) {
        note.png = shot.png;
        note.scale = shot.scale;
      }
      note.capturing = null;
    }
  }

  /** The hub took these notes with a message; they leave the draft. */
  acceptSelections(selectionIds: string[]): void {
    this.selections = this.selections.filter(
      ({ id }) => !selectionIds.includes(id)
    );
  }

  removeSelection(selection: PendingSelection): void {
    if (this.editing === selection) {
      this.editorOpen = false;
      this.editing = null;
    }
    this.selections = this.selections.filter((item) => item !== selection);
  }

  /** Closes an open note editor, focus back on its chip. True when one was open. */
  closeSelectionEditor(): boolean {
    if (!this.editorOpen) {
      return false;
    }
    this.editorOpen = false;
    if (this.editing) {
      this.anchors[
        `${this.editing.element.url}:${this.editing.element.selector}`
      ]?.focus({ preventScroll: true });
    }
    return true;
  }

  /**
   * Empties the draft into a message: the text and everything riding with
   * it. Element notes stay until the hub accepts them (`acceptSelections`),
   * so a refused send still has them.
   */
  take(): { text: string; extras: SendExtras } {
    const extras = this.extras();
    const text = this.text.trim();
    this.unsent = {
      text,
      images: this.images,
      texts: $state.snapshot(this.texts),
      files: $state.snapshot(this.files),
      selections: $state.snapshot(this.selections),
    };
    this.text = "";
    this.images = [];
    this.texts = [];
    this.files = [];
    this.editorOpen = false;
    this.editing = null;
    return { text, extras };
  }

  /**
   * What rides a message besides its text, as a send carries it: the notes,
   * the texts and the files the hub has, and the images.
   */
  extras(): SendExtras {
    const extras: SendExtras = {};
    if (this.selections.length) {
      extras.selections = $state.snapshot(this.selections);
    }
    if (this.texts.length || this.files.length) {
      extras.attachments = [
        ...this.texts.map((t) => ({ ...t })),
        ...this.files.flatMap(({ name, mediaType, size, ref }) =>
          ref ? [{ kind: "file" as const, name, mediaType, size, ref }] : []
        ),
      ];
    }
    if (this.images.length) {
      extras.images = this.images.map((i) => ({
        mediaType: i.mediaType,
        data: i.data,
      }));
    }
    return extras;
  }

  /**
   * Puts a message that never left back, attachments and all.
   *
   * Image filenames do not survive the wire — `SendPayload.images` carries
   * `mediaType` and `data` only — so restored images are numbered rather
   * than given a name they never had.
   */
  restore(text: string, extras: SendExtras = {}): void {
    // A queued message being edited here goes back as it was: these words
    // take the field.
    this.putBack();
    this.text = text;
    this.selections = extras.selections ?? [];
    this.texts = (extras.attachments ?? []).flatMap((attachment) =>
      attachment.kind === "text"
        ? [{ kind: "text", name: attachment.name, content: attachment.content }]
        : []
    );
    this.files = (extras.attachments ?? []).flatMap((attachment) =>
      attachment.kind === "file"
        ? [
            {
              id: newId(),
              name: attachment.name,
              mediaType: attachment.mediaType,
              size: attachment.size,
              ref: attachment.ref,
              progress: 1,
            },
          ]
        : []
    );
    this.images = (extras.images ?? []).map((image, at) => ({
      mediaType: image.mediaType,
      data: image.data,
      name: `Image ${at + 1}`,
    }));
    this.focusWanted = true;
  }
}
