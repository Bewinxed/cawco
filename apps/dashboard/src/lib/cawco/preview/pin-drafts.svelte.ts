/**
 * What the person has half-written in each pin's card: it belongs to the
 * pin, not to the card drawing it. A card dismissed (a press outside it,
 * Esc, its Close, another pin opened) leaves its words with its pin, and
 * they are back in the field when that pin opens again, across a reload
 * too: kept as the composer keeps a conversation's draft (keep-draft), in
 * the composer's draft store under `pin:<artifact>:<pin>`, read back once
 * the pin's card first opens, written as they change at most every 250ms,
 * and at once when the page goes away or this tab reloads itself.
 *
 * Nothing of a pin is written until its read has landed: the empty field a
 * card starts with must not replace the stored words. Words typed while the
 * read was in flight are the newer ones, and stand.
 *
 * Call while a component initialises: the keeping lives as long as it does.
 */
import { keepsDrafts } from "../reload.svelte";
import { loadDraft, saveDraft } from "../transcript/draft-store";

/** At most this often a pin's words are written, ms: the composer's. */
const WRITE_MS = 250;

const stored = (text: string) => ({
  text,
  images: [],
  texts: [],
  files: [],
  canvas: null,
});

export function pinDrafts(artifact: () => string | null | undefined) {
  /** Each pin's words, by its id. */
  const texts = $state<Record<string, string>>({});
  /** The pins whose stored words have been read (or found unreadable). */
  const landed = new Set<string>();
  const asked = new Set<string>();
  /** Words waiting to be written, by pin. */
  const unwritten = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const keyOf = (pin: string) => {
    const id = artifact();
    return id ? `pin:${id}:${pin}` : null;
  };

  function write(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const writes = [...unwritten].flatMap(([pin, text]) => {
      const key = keyOf(pin);
      return key ? [saveDraft(key, stored(text))] : [];
    });
    unwritten.clear();
    return Promise.all(writes).then(() => undefined);
  }

  function later(pin: string, text: string) {
    if (!landed.has(pin)) {
      return;
    }
    unwritten.set(pin, text);
    timer ??= setTimeout(write, WRITE_MS);
  }

  $effect(() => {
    window.addEventListener("pagehide", write);
    const release = keepsDrafts(write);
    return () => {
      window.removeEventListener("pagehide", write);
      release();
      // biome-ignore lint/complexity/noVoid: fire-and-forget — what waits lands on its own
      void write();
    };
  });

  return {
    /** Pin `pin`'s words now. */
    text: (pin: string) => texts[pin] ?? "",
    /** The person typed in pin `pin`'s card. */
    set: (pin: string, text: string) => {
      texts[pin] = text;
      later(pin, text);
    },
    /** Pin `pin`'s card opens: its stored words are read back, once. */
    open: (pin: string) => {
      const key = keyOf(pin);
      if (!key || asked.has(pin)) {
        return;
      }
      asked.add(pin);
      loadDraft(key).then(
        (draft) => {
          landed.add(pin);
          if (draft?.text && !texts[pin]) {
            texts[pin] = draft.text;
          } else if (texts[pin]) {
            later(pin, texts[pin]);
          }
        },
        () => {
          // No database: this pin's words are kept only while the pane is.
        }
      );
    },
    /** Pin `pin`'s words are done with (said, or the pin is gone): its stored copy goes now. */
    discard: (pin: string) => {
      delete texts[pin];
      unwritten.delete(pin);
      const key = keyOf(pin);
      if (key) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget — an empty draft deletes its record
        void saveDraft(key, stored(""));
      }
    },
  };
}
