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
import type { FindBy, FindKind } from "@cawco/core/find";
import { hub } from "#lib/platform/hub.js";
import {
  type HubAsked,
  hubAsk,
  hubSaid,
  unreachable,
  unreachedAnswer,
} from "#lib/platform/hub-read.js";

export type {
  FindAnswer,
  FindArtifact,
  FindBy,
  FindChange,
  FindConversation,
  FindCoverage,
  FindKind,
  FindLiveState,
  FindMachine,
  FindMoment,
  FindProject,
  FindResult,
  FindRoutine,
  FindTask,
  MomentAuthor,
  WaitingAnswer,
  WaitingItem,
} from "@cawco/core/find";

/** How a read ended. */
export type Read<T> =
  | { ok: true; value: T }
  | { ok: false; unreached: true }
  | { ok: false; unreached: false; detail: string };

/** A read the caller asked: it ran to an end, or a newer one took its place. */
export type Asked<T> =
  { kind: "answered"; read: Read<T> } | { kind: "superseded" };

async function read<T>(
  asked: Promise<HubAsked<T>>,
  signal?: AbortSignal
): Promise<Asked<T>> {
  try {
    return { kind: "answered", read: await answer(asked, signal) };
  } catch (error) {
    // The abort rejects the fetch, or the body read after it (Firefox: "The
    // operation was aborted."); either way it is the caller letting go.
    if (signal?.aborted) {
      return { kind: "superseded" };
    }
    throw error;
  }
}

async function answer<T>(
  asked: Promise<HubAsked<T>>,
  signal?: AbortSignal
): Promise<Read<T>> {
  let answered: HubAsked<T>;
  try {
    answered = await asked;
  } catch (error) {
    if (!signal?.aborted && unreachable(error)) {
      return { ok: false, unreached: true };
    }
    throw error;
  }
  if (answered.ok) {
    return answered;
  }
  if (unreachedAnswer(answered.refused.response)) {
    return { ok: false, unreached: true };
  }
  return { ok: false, unreached: false, detail: hubSaid(answered.refused) };
}

export interface Ask {
  /** Who said it, for the part of the answer read from transcripts. */
  by?: FindBy | null;
  kinds?: readonly FindKind[];
  limit?: number;
  signal?: AbortSignal;
}

const query = (
  q: string,
  { by, kinds, limit, signal }: Ask,
  transcripts: boolean
) =>
  hubAsk(
    hub.api.find.get({
      query: {
        q,
        ...(limit ? { limit: String(limit) } : {}),
        ...(kinds && kinds.length > 0 ? { kinds: kinds.join(",") } : {}),
        ...(by ? { by } : {}),
        ...(transcripts ? {} : { transcripts: "0" as const }),
      },
      fetch: { signal },
    })
  );

/** What the hub knows by name, in milliseconds: asked on every keystroke. */
export const findNames = (q: string, ask: Ask = {}) =>
  read(query(q, ask, false), ask.signal);

/** Names and every machine's transcripts (up to 1.5 s each): asked once typing settles. */
export const findEverywhere = (q: string, ask: Ask = {}) =>
  read(query(q, ask, true), ask.signal);

export const findWaiting = (signal?: AbortSignal) =>
  read(hubAsk(hub.api.find.waiting.get({ fetch: { signal } })), signal);

/**
 * Every place in one conversation where the words stand, its machine's
 * transcript index asked (find in a conversation, conversation-find).
 */
export const findPlaces = (session: string, q: string, signal?: AbortSignal) =>
  read(
    hubAsk(
      hub.api.find.places.get({ query: { session, q }, fetch: { signal } })
    ),
    signal
  );
