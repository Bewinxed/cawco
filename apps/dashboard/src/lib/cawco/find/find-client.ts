/**
 * The finder's one door to the hub: `GET /api/find` (names per keystroke,
 * then the machines on a settle) and `GET /api/find/waiting`. Every surface
 * in this folder reads the fleet through here and nowhere else. What it
 * answers is the engine's own contract (`@cawco/core`, find.ts).
 *
 * A failed read is said as one of two things and never turned into an empty
 * answer (The Claim Of Nothing Rule): the hub did not answer (`unreached`),
 * or it answered and refused (`refused`, its own words). A read whose signal
 * aborted (a newer keystroke took its place) is neither: it is `superseded`,
 * its own kind (the shape of core's `Bounded`, bounded.ts), whether the abort
 * landed before the hub answered or while its body was still arriving, and
 * the caller drops it.
 */
import type { FindAnswer, FindBy, FindKind, WaitingAnswer } from "@cawco/core";
import { hubFailure, unreachable, unreachedAnswer } from "../hub-read";

export type {
  FindAnswer,
  FindArtifact,
  FindBy,
  FindChange,
  FindConversation,
  FindCoverage,
  FindField,
  FindKind,
  FindLiveState,
  FindMachine,
  FindMoment,
  FindProject,
  FindResult,
  FindRoutine,
  FindTask,
  FindThread,
  MomentAuthor,
  WaitingAnswer,
  WaitingItem,
} from "@cawco/core";

/** How a read ended. */
export type Read<T> =
  | { ok: true; value: T }
  | { ok: false; unreached: true }
  | { ok: false; unreached: false; detail: string };

/** A read the caller asked: it ran to an end, or a newer one took its place. */
export type Asked<T> =
  { kind: "answered"; read: Read<T> } | { kind: "superseded" };

async function read<T>(url: string, signal?: AbortSignal): Promise<Asked<T>> {
  try {
    return { kind: "answered", read: await answer<T>(url, signal) };
  } catch (error) {
    // The abort rejects the fetch, or the body read after it (Firefox: "The
    // operation was aborted."); either way it is the caller letting go.
    if (signal?.aborted) {
      return { kind: "superseded" };
    }
    throw error;
  }
}

async function answer<T>(url: string, signal?: AbortSignal): Promise<Read<T>> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (!signal?.aborted && unreachable(error)) {
      return { ok: false, unreached: true };
    }
    throw error;
  }
  if (unreachedAnswer(response)) {
    return { ok: false, unreached: true };
  }
  if (!response.ok) {
    const { detail } = await hubFailure(response);
    return { ok: false, unreached: false, detail };
  }
  return { ok: true, value: (await response.json()) as T };
}

export interface Ask {
  /** Who said it, for the part of the answer read from transcripts. */
  by?: FindBy | null;
  kinds?: readonly FindKind[];
  limit?: number;
  signal?: AbortSignal;
}

const query = (q: string, { by, kinds, limit }: Ask, transcripts: boolean) => {
  const params = new URLSearchParams({ q });
  if (limit) {
    params.set("limit", String(limit));
  }
  if (kinds && kinds.length > 0) {
    params.set("kinds", kinds.join(","));
  }
  if (by) {
    params.set("by", by);
  }
  if (!transcripts) {
    params.set("transcripts", "0");
  }
  return `/api/find?${params}`;
};

/** What the hub knows by name, in milliseconds: asked on every keystroke. */
export const findNames = (q: string, ask: Ask = {}) =>
  read<FindAnswer>(query(q, ask, false), ask.signal);

/** Names and every machine's transcripts (up to 1.5 s each): asked once typing settles. */
export const findEverywhere = (q: string, ask: Ask = {}) =>
  read<FindAnswer>(query(q, ask, true), ask.signal);

export const findWaiting = (signal?: AbortSignal) =>
  read<WaitingAnswer>("/api/find/waiting", signal);
