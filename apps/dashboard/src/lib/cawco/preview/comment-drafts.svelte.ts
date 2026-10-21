/**
 * What the person has half-written about an artifact's comments, kept by the
 * pane rather than by whichever composer draws it: the next comment's (one
 * per artifact, comment-rows.ts `NEXT_COMMENT`: a composer closed by Esc or
 * a press outside leaves its words and its chips there for the next one,
 * and an upload in flight goes on), and each thread's reply, by its pin.
 * Each is a composer draft that keeps everything by reference (a comment's,
 * core comments.ts `CommentAttachment`), stored across a reload in the
 * composer's draft store under `comment:<artifact>:<key>`: read back once,
 * when it is first asked for; written as it changes, at most every 250ms,
 * and at once when the page goes away, this tab reloads itself, or the pane
 * lets the drafts go (`release`).
 *
 * Nothing of a draft is written until its read has landed: the empty draft
 * a composer starts with must not replace the stored one. What was typed
 * while the read was in flight is the newer, and stands.
 *
 * Loaded on demand with the composer and the thread (PreviewPane's comment
 * kit), so an artifact's own tab loads none of the composer's code at first
 * paint.
 */

import { loadDraft, saveDraft } from "../draft-store";
import { keepsDrafts } from "../reload.svelte";
import { ComposerDraft } from "../transcript/composer-draft.svelte";

/** At most this often a draft is written, ms: the composer's. */
const WRITE_MS = 250;

export function commentDrafts(artifact: () => string | null | undefined) {
  /** Each draft, by `<artifact>:<key>`. */
  const drafts = new Map<string, ComposerDraft>();
  /** The drafts whose stored copy has been read (or found unreadable). */
  const landed = new Set<string>();
  /** Drafts waiting to be written. */
  const unwritten = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const storeKey = (slot: string) => `comment:${slot}`;

  function write(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const writes = [...unwritten].flatMap((slot) => {
      const draft = drafts.get(slot);
      return draft ? [saveDraft(storeKey(slot), draft.keep)] : [];
    });
    unwritten.clear();
    return Promise.all(writes).then(() => undefined);
  }

  window.addEventListener("pagehide", write);
  const unkeep = keepsDrafts(write);

  const slotOf = (key: string) => {
    const id = artifact();
    return id ? `${id}:${key}` : null;
  };

  return {
    /** The draft for `key` (the next comment's, or a pin's reply), its stored copy read back the first time. */
    draft: (key: string): ComposerDraft => {
      const slot = slotOf(key) ?? `:${key}`;
      const had = drafts.get(slot);
      if (had) {
        return had;
      }
      const draft = new ComposerDraft({ byReference: true });
      drafts.set(slot, draft);
      if (slotOf(key)) {
        loadDraft(storeKey(slot)).then(
          (stored) => {
            landed.add(slot);
            if (stored && !draft.hasContent) {
              draft.fill(stored);
            } else if (draft.hasContent) {
              unwritten.add(slot);
              timer ??= setTimeout(write, WRITE_MS);
            }
          },
          () => {
            // No database: this draft is kept only while the pane is.
          }
        );
      }
      return draft;
    },
    /** The draft for `key` changed: written soon. */
    changed: (key: string) => {
      const slot = slotOf(key);
      if (!(slot && landed.has(slot))) {
        return;
      }
      unwritten.add(slot);
      timer ??= setTimeout(write, WRITE_MS);
    },
    /** The draft for `key` is said (or its pin is gone): its stored copy goes now. */
    discard: (key: string) => {
      const slot = slotOf(key);
      if (!slot) {
        return;
      }
      drafts.get(slot)?.settle();
      unwritten.delete(slot);
      // biome-ignore lint/complexity/noVoid: fire-and-forget — an empty draft deletes its record
      void saveDraft(storeKey(slot), {
        text: "",
        images: [],
        texts: [],
        files: [],
        canvas: null,
      });
    },
    /** The pane goes: what waits is written, and the keeping ends. */
    release: () => {
      window.removeEventListener("pagehide", write);
      unkeep();
      // biome-ignore lint/complexity/noVoid: fire-and-forget — what waits lands on its own
      void write();
    },
  };
}

export type CommentDrafts = ReturnType<typeof commentDrafts>;
