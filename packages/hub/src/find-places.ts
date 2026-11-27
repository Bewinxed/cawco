/**
 * The person's find in one conversation (`GET /api/find/places`): how many
 * places its machine's transcript index holds the words in, and one window
 * of them (agent `transcriptPlaceWindow`, jsonl-parser fts5.ts `places`),
 * named by whose words they are as the dashboard's places list keeps them:
 * the person's, the agent's (said or thought), what its tools answered, a
 * delegate's report. What a harness or CawCo put under the person's role (a
 * notice, a hook's output) is no one's words, and the index holds no place
 * of it.
 */

import type { Bounded } from "@cawco/core/bounded";
import {
  type FindPlace,
  PLACES_WINDOW,
  type PlacesHeard,
  type PlaceWhose,
  type SecretSpan,
  type TranscriptPlace,
  type TranscriptPlaces,
  type TranscriptPlacesQuery,
} from "@cawco/core/find";
import { unmarked } from "@cawco/core/find-match";
import {
  CONTROL_TRANSCRIPT_PLACES,
  unknownControlWords,
} from "@cawco/core/session/controls";
import type { ControlAnswer } from "./machine-answers";
import { secretRangesOf } from "./secret-filter";

/** Whose words each kind of place the index tells is. */
const WHOSE: Record<TranscriptPlace["kind"], PlaceWhose> = {
  owner: "me",
  agent: "agent",
  report: "delegates",
  output: "tools",
};

/** The index's kind of each whose: what a filter asks the machine for. */
const KIND: Record<PlaceWhose, TranscriptPlace["kind"]> = {
  me: "owner",
  agent: "agent",
  delegates: "report",
  tools: "output",
};

/** What the hub asks the machine for one window of a find. */
export const placesQuery = (
  sessions: string[],
  words: string,
  window: { near?: number; offset?: number; whose?: PlaceWhose }
): TranscriptPlacesQuery => ({
  sessions,
  words,
  // @limit measured: a page; the next page's cursor rides the answer. 50 is the rows one page returns
  limit: PLACES_WINDOW,
  ...(window.whose === undefined ? {} : { kind: KIND[window.whose] }),
  ...(window.offset === undefined ? {} : { offset: Math.trunc(window.offset) }),
  ...(window.near === undefined ? {} : { near: Math.trunc(window.near) }),
});

/** How many places of each whose the machine counted. */
export const placeCounts = (
  counts: TranscriptPlaces["counts"] | null
): Record<PlaceWhose, number> => ({
  me: counts?.owner ?? 0,
  agent: counts?.agent ?? 0,
  tools: counts?.output ?? 0,
  delegates: counts?.report ?? 0,
});

/** One place the machine answered, as the dashboard's places list reads it. */
function placeOf(place: TranscriptPlace): FindPlace {
  const at =
    place.timestamp === null ? Number.NaN : Date.parse(place.timestamp);
  return {
    at: Number.isNaN(at) ? null : at,
    docId: place.docId,
    excerpt: place.excerpt,
    n: place.n,
    thinking: place.column === "thinking",
    whose: WHOSE[place.kind],
  };
}

/**
 * How the machine took the places read (core `PlacesHeard`), and its places
 * when it answered: an agent from before the read was added says it has no
 * such function (core `unknownControlWords`), which is told apart from a
 * machine that did not answer, since waiting brings nothing and an update
 * does.
 */
export function placesHeard(
  answer: Bounded<ControlAnswer<typeof CONTROL_TRANSCRIPT_PLACES>>
):
  | { heard: "answered"; places: TranscriptPlaces }
  | { heard: Exclude<PlacesHeard, "answered"> } {
  if (answer.kind !== "answered") {
    return { heard: "silent" };
  }
  const { value } = answer;
  if (value.ok) {
    return { heard: "answered", places: value.result };
  }
  return value.error?.includes(unknownControlWords(CONTROL_TRANSCRIPT_PLACES))
    ? { heard: "outdated" }
    : { heard: "silent" };
}

/**
 * The machine's window as the screens read it, oldest first; while "Hide
 * secrets in Find" is on (`hide`), each names where its excerpt's secrets
 * stand, for the screen to draw as dots (find-secrets.ts). Only the
 * window's excerpts are read for secrets.
 */
export async function placesForScreens(
  places: readonly TranscriptPlace[],
  hide: boolean
): Promise<FindPlace[]> {
  const kept = places.map(placeOf);
  if (!hide) {
    return kept;
  }
  const spans: SecretSpan[][] = await secretRangesOf(
    kept.map((place) => unmarked(place.excerpt))
  );
  return kept.map((place, index) => {
    const found = spans[index] ?? [];
    return found.length > 0 ? { ...place, secrets: found } : place;
  });
}
