import { getContext, setContext } from "svelte";
import type { Trail } from "$lib/components/ui/markdown/trail";

/**
 * THE ARRIVAL RULE — one gate for every piece of transcript motion.
 *
 * A row animates if and only if it is a genuine live arrival in the view that
 * shows it: its id has never been held by this view, it came in on the live
 * stream, and the view was being watched when it came. Everything else — a
 * conversation opening, a refresh, older history arriving in chunks, a re-read
 * after a reconnect, a tab or pane coming back, a row scrolled back into view,
 * anything that landed while the page was hidden — renders still.
 *
 * The decision is taken where the data changes, not where a component mounts.
 * `Transcript` runs the ledger once per build: every id the build holds is
 * recorded, and the new ones that qualify get a ticket. The ticket belongs to
 * the ARRIVAL, not to whichever element happens to draw it: a new row lands
 * below the fold and the follow carries it into view, and virtua may mount
 * it, drop it for a frame and mount it again on the way. Each mount takes the
 * same ticket and plays from where the arrival has got to; the ticket is gone
 * once the entrance has run. Anything that means the reader is not watching
 * the tail — their own scroll, a hidden page, the pane losing focus — clears
 * every ticket still waiting, so a row scrolled back to, a remounted pane or
 * a tab come back finds none. Nothing here reads a clock to decide, waits for
 * a frame, or depends on which component mounted first.
 *
 * "Came in on the live stream" is read from the data too. Every live path in
 * the store PUSHES onto the session's message array; every history path — the
 * first read, older chunks, a reconnect's re-read, a rewind — REPLACES it. So a
 * build whose array is the one the last build saw, and has grown, is live; a
 * build on a new array is history, whatever it contains. The live tail's own
 * rows (the streaming turn, the tool in flight, the queue) exist only while the
 * session is live, so they carry no such question.
 */

/** What a row does as it arrives. Chosen by the row's kind, not by the ticket. */
export type Motion =
  /** Fades up 6px: every turn, note and card that lands on the ledger. */
  | "rise"
  /**
   * The reader's own message, sent from this tab: the row plays no entrance;
   * its content is the composer's text landing (motion/share.svelte.ts).
   */
  | "emerge"
  /** A card that asks for the reader: the prompt's settle. */
  | "settle"
  /** A tool call opening its own line in the run it belongs to. */
  | "open";

export type Ticket =
  /**
   * A new row, playing its entrance. `lead` is its place in a burst: rows
   * that land together cascade, 30ms apart, five deep. `start` is when the
   * arrival started (document timeline, ms): set by the first mount, read by
   * any later one, which plays on from there instead of again.
   */
  | { kind: "arrive"; lead: number; start: number | null }
  /**
   * A reasoning block that has just settled into its row: the row is the same
   * object the live block was, so it arrives open and folds shut, rather than
   * arriving at all.
   */
  | { kind: "fold" }
  /**
   * A streamed answer that has just settled into its row: the same object the
   * live row was, so it does not arrive. The chunk fades the live row had
   * running play on in it, from where they had got to, and whatever the live
   * row never drew fades in like one more chunk.
   */
  | { kind: "carry"; trail: Trail };

/**
 * The height a row starts from because it took another row's place in the
 * update that drew it: the indicator's, for the tool it gave way to; the live
 * row's, for the row it settled into; a tool's glance and its run's, for the
 * run that took the call in. The row tweens from there to its own height, so
 * nothing above it moves in a jump. Handed once per update, and taken once:
 * the same row drawn again later is not taking anyone's place.
 */
export interface Handoff {
  from: number;
  taken: boolean;
}

export interface Ledger {
  /** The arrival's entrance has run: its ticket is spent. */
  done: (id: string) => void;
  /**
   * The ticket for `id` while its arrival is still playing, or null. A fold
   * or a carry is spent as it is taken: neither has an entrance to resume.
   */
  take: (id: string) => Ticket | null;
  /** The trail the live row `key` keeps of its streamed chunks. */
  trail: (key: string) => Trail;
  /**
   * Whether motion may run in this view right now: it has landed, it is the
   * one being worked in, it is on screen and the page is visible. What decides
   * whether a change INSIDE a row that is already there — a streamed chunk, a
   * tool's status — is shown moving.
   */
  readonly watched: boolean;
}

const KEY = Symbol("transcript-ledger");

export const provideLedger = (ledger: Ledger): Ledger =>
  setContext(KEY, ledger);

/** Absent outside a transcript (a subagent's peek, the motion lab): nothing arrives. */
export const useLedger = (): Ledger | undefined => getContext(KEY);

/**
 * The sessions whose transcript is landed, focused and on a visible page — for
 * the one arrival that is not a row: the permission card, drawn beside the
 * transcript in the composer column. A card that mounts while its session is
 * not being watched is history by the same rule as a row.
 */
export const watchedSessions = new Set<string>();
