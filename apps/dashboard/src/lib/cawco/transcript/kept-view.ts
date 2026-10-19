import { readJson, writeJson } from "../storage";

/**
 * What a conversation's transcript last showed, by session, so the skeleton
 * standing in for it while it is read again draws its bars where its lines
 * were (The Claim Of Nothing Rule: the skeleton stands at the real layout's
 * size). Kept beside the reader's place (Transcript `LANDING`), in the same
 * sessionStorage: a reload lands on that place, so the lines kept are the
 * lines it lands on. Through the one way to storage (storage.ts), as the
 * blocks keep their bodies (blocks/kept-bodies.ts).
 */
const KEY = "cawco-transcript-views";
/** The views remembered: the conversations shown last. Our own call. */
const LIMIT = 24;

/**
 * A box on the transcript, px from its own box's inline-start and top edges:
 * inline offset, block offset, inline size, and for a line the size of its
 * words' type (a bar is one em of it, from the top of its words).
 */
export type KeptBox = [number, number, number, number];

export type KeptView = {
  /** The transcript's own box when it was kept: a view is drawn only in a box of its size. */
  width: number;
  height: number;
  /** Each run of words on a line. */
  lines: KeptBox[];
  /** Each speaker's mark and each tool's glyph cell (the last number its block size). */
  marks: KeptBox[];
};

type Kept = Record<string, KeptView>;

/** The view `session`'s transcript last showed; null if it was never kept here. */
export function keptView(session: string): KeptView | null {
  const view = readJson<Kept>(KEY, {}, "session")[session];
  return view && Array.isArray(view.lines) && Array.isArray(view.marks)
    ? view
    : null;
}

/** Keeps the view `session`'s transcript shows now, the newest last. */
export function keepView(session: string, view: KeptView): void {
  const kept = readJson<Kept>(KEY, {}, "session");
  const others = Object.entries(kept).filter(([id]) => id !== session);
  writeJson(
    KEY,
    Object.fromEntries([...others.slice(-(LIMIT - 1)), [session, view]]),
    "session"
  );
}
