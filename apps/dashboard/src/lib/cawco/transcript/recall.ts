/**
 * What the composer's recall rolls through: the messages the reader sent in
 * this conversation, newest first (the sends still queued, then the
 * transcript from its end). Only their own turns (`opensTurn`), never the
 * agent's, a delegate's or a harness note, and each text once: the newest
 * copy of words sent twice stands for both, so "continue" sent ten times is
 * one entry, not ten rows to roll past.
 *
 * A send that failed, or never reached the hub, counts: it is the one most
 * worth having back, and recall takes words into the composer unsent, so
 * taking it is never unsafe. A send cancelled does not: the reader took it
 * back. A send with no words (pictures alone) has nothing to recall.
 *
 * Typing into an empty composer while the wheel is up filters these
 * (`SentIndex`): MiniSearch's BM25 over the same entries, every word a
 * prefix, a little typo tolerance, and every word required.
 */
import MiniSearch from "minisearch";
import type { Message, SendRowState } from "../types";
import { opensTurn } from "./rows";

export interface Sent {
  /** When the hub took it, epoch ms; null when the harness gave no time. */
  at: number | null;
  id: string;
  state: SendRowState | undefined;
  text: string;
}

/** The reader's own sends in `messages` (oldest first), newest first, each text once. */
export function sentByReader(messages: readonly Message[]): Sent[] {
  const seen = new Set<string>();
  const sent: Sent[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const text = message.content.trim();
    if (
      !(opensTurn(message) && text) ||
      message.state === "cancelled" ||
      seen.has(text)
    ) {
      continue;
    }
    seen.add(text);
    const at = message.timestamp ? Date.parse(message.timestamp) : Number.NaN;
    sent.push({
      id: message.id,
      text: message.content,
      at: Number.isNaN(at) ? null : at,
      state: message.state,
    });
  }
  return sent;
}

/** A message's words on one line, its line breaks shown as ⏎. */
export const oneLine = (text: string): string =>
  text.trim().replace(/\s*\n\s*/g, " ⏎ ");

/**
 * MiniSearch's own word boundary (its default tokenizer), with the
 * boundaries kept, so the words it matched can be marked where they stand.
 */
const BOUNDARY = /([\n\r\p{Z}\p{P}]+)/u;

/** One piece of a matched row: a run of text, marked where it matched. */
export interface Part {
  mark: boolean;
  text: string;
}

/** `text` cut into its words and what lies between, the matched words marked. */
export function marked(text: string, terms: ReadonlySet<string>): Part[] {
  return text
    .split(BOUNDARY)
    .filter((piece) => piece !== "")
    .map((piece) => ({ text: piece, mark: terms.has(piece.toLowerCase()) }));
}

/** One match: the entry, and the words in it the query matched. */
export interface Match {
  entry: Sent;
  terms: Set<string>;
}

/** The sends one wheel rolls through, searchable as the reader types. */
export class SentIndex {
  readonly #search = new MiniSearch<{ id: string; text: string }>({
    fields: ["text"],
    searchOptions: { prefix: true, fuzzy: 0.2, combineWith: "AND" },
  });
  readonly #byId = new Map<string, Sent>();

  constructor(entries: readonly Sent[]) {
    this.add(entries);
  }

  /** Entries the index does not hold yet (an older page, read while it is up). */
  add(entries: readonly Sent[]): void {
    const fresh = entries.filter((entry) => !this.#byId.has(entry.id));
    for (const entry of fresh) {
      this.#byId.set(entry.id, entry);
    }
    this.#search.addAll(fresh.map(({ id, text }) => ({ id, text })));
  }

  /** The best matches first; equal scores keep the newer first. */
  search(query: string): Match[] {
    const order = [...this.#byId.keys()];
    return this.#search
      .search(query)
      .sort(
        (a, b) =>
          b.score - a.score ||
          order.indexOf(String(a.id)) - order.indexOf(String(b.id))
      )
      .flatMap((result) => {
        const entry = this.#byId.get(String(result.id));
        return entry ? [{ entry, terms: new Set(result.terms) }] : [];
      });
  }
}
