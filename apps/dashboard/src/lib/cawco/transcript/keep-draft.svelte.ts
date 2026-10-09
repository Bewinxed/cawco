/**
 * A draft across a reload: read back once its key is known, then written as
 * it changes, at most every 250ms, and at once when the page goes away, a
 * reload this tab does itself is about to run (`keepsDrafts`), or the key
 * goes. A session's pane keeps its conversation's draft under the session's
 * id; New session keeps its first prompt under this tab's own key.
 *
 * Nothing is written until the read has landed: the empty draft a surface
 * starts with must not replace the stored one. Words typed while the read
 * was in flight are the newer ones, and stand.
 *
 * Call while a component initialises: the keeping lives as long as it does.
 */
import { untrack } from "svelte";
import { keepsDrafts } from "../reload.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";
import { type DraftContent, loadDraft, saveDraft } from "./draft-store";

export function keepDraft(
  draft: ComposerDraft,
  key: () => string | null
): void {
  /** The key the draft is read and written under; null while there is none. */
  let kept = $state<string | null>(null);
  /** The draft as it should be stored, waiting for the next write. */
  let unwritten: DraftContent | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Writes what is waiting; resolves once it is stored. */
  function write(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (!(unwritten && kept)) {
      return Promise.resolve();
    }
    const next = unwritten;
    unwritten = null;
    return saveDraft(kept, next);
  }

  $effect(() => {
    const id = key();
    if (!id) {
      return;
    }
    let live = true;
    untrack(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the read lands in the draft, and a refused read leaves the draft unstored rather than overwritten
      void loadDraft(id).then(
        (stored) => {
          if (!live) {
            return;
          }
          if (stored && !draft.hasContent) {
            draft.fill(stored);
          }
          kept = id;
        },
        () => {
          // No database: drafts do not start, so nothing is ever written.
        }
      );
    });
    return () => {
      live = false;
      // The key goes: what the draft holds now is what is kept under it.
      if (kept === id) {
        unwritten = untrack(() => draft.keep);
        // biome-ignore lint/complexity/noVoid: fire-and-forget — the write lands on its own
        void write();
        kept = null;
      }
    };
  });

  $effect(() => {
    if (!kept) {
      return;
    }
    // `keep` reads every stored piece, notes and attachments deeply, so any
    // change to them lands here and schedules a write.
    unwritten = draft.keep;
    timer ??= setTimeout(write, 250);
  });

  $effect(() => {
    window.addEventListener("pagehide", write);
    const release = keepsDrafts(write);
    return () => {
      window.removeEventListener("pagehide", write);
      release();
    };
  });
}
