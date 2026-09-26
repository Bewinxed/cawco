/**
 * What one conversation has half-written: the text, the attachments, and
 * the element notes picked out of its preview.
 *
 * It belongs to the conversation, not to whichever composer is drawing it.
 * A desk draws one composer per pane, each over its own draft; a phone
 * draws ONE composer for the whole deck and points it at the draft of
 * whichever conversation is in front, so a swipe between chats changes the
 * words in the box without the box moving. `SessionPane` holds one of these
 * per conversation for as long as the conversation is open.
 */
import type { SendExtras } from "../client.svelte";
import { newId } from "../id";
import type { CapturedSelection, PendingSelection } from "../preview/selection";
import { readJson, writeJson } from "../storage";

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

/** The most element notes one message carries. */
const MAX_SELECTIONS = 12;

/**
 * Every conversation's unsent words, by session id. A reload — the "Whiffle
 * updated" toast asks for one — used to throw a half-written message away;
 * this is what brings it back. Text only: attachments and element notes are
 * in-memory and do not survive a reload.
 */
const DRAFTS_KEY = "whiffle.drafts";

/** The words stored for a conversation, or nothing. */
export function storedDraft(sessionId: string): string {
  return readJson<Record<string, string>>(DRAFTS_KEY, {})[sessionId] ?? "";
}

/** Stores a conversation's words; empty words drop its entry. */
export function storeDraft(sessionId: string, text: string): void {
  const drafts = readJson<Record<string, string>>(DRAFTS_KEY, {});
  if ((drafts[sessionId] ?? "") === text) {
    return;
  }
  if (text) {
    drafts[sessionId] = text;
  } else {
    delete drafts[sessionId];
  }
  writeJson(DRAFTS_KEY, drafts);
}

export class ComposerDraft {
  text = $state("");
  images = $state<PendingImage[]>([]);
  texts = $state<PendingText[]>([]);
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

  constructor(text: string) {
    this.text = text;
  }

  hasContent = $derived(
    this.text.trim().length > 0 ||
      this.images.length > 0 ||
      this.texts.length > 0 ||
      this.selections.length > 0
  );

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
    const extras: SendExtras = {};
    if (this.selections.length) {
      extras.selections = $state.snapshot(this.selections);
    }
    if (this.texts.length) {
      extras.attachments = this.texts.map((t) => ({ ...t }));
    }
    if (this.images.length) {
      extras.images = this.images.map((i) => ({
        mediaType: i.mediaType,
        data: i.data,
      }));
    }
    const text = this.text.trim();
    this.text = "";
    this.images = [];
    this.texts = [];
    this.editorOpen = false;
    this.editing = null;
    return { text, extras };
  }

  /**
   * Puts a message that never left back, attachments and all.
   *
   * Image filenames do not survive the wire — `SendPayload.images` carries
   * `mediaType` and `data` only — so restored images are numbered rather
   * than given a name they never had.
   */
  restore(text: string, extras: SendExtras = {}): void {
    this.text = text;
    this.selections = extras.selections ?? [];
    this.texts = (extras.attachments ?? []).map((attachment) => ({
      kind: "text",
      name: attachment.name,
      content: attachment.content,
    }));
    this.images = (extras.images ?? []).map((image, at) => ({
      mediaType: image.mediaType,
      data: image.data,
      name: `Image ${at + 1}`,
    }));
    this.focusWanted = true;
  }
}
