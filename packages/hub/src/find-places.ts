/**
 * The person's find in one conversation (`GET /api/find/places`): every
 * place its machine's transcript index holds the words in (agent
 * `transcriptPlaces`, jsonl-parser fts5.ts `places`), named by whose words
 * they are as the dashboard's places list keeps them: the person's, the
 * agent's (said or thought), what its tools answered, a delegate's report.
 * What a harness or CawCo put under the person's role (a notice, a hook's
 * output) is no one's words here, and is left out.
 */
import type { Bounded } from "@cawco/core/bounded";
import type {
  FindPlace,
  PlacesHeard,
  SecretSpan,
  TranscriptPlace,
} from "@cawco/core/find";
import { unmarked } from "@cawco/core/find-match";
import type { ControlResultFrame } from "@cawco/core/frames";
import {
  CONTROL_TRANSCRIPT_PLACES,
  unknownControlWords,
} from "@cawco/core/session/controls";
import { secretRangesOf } from "./secret-filter";

/**
 * The most places one find in a conversation lists: a few hundred rows draw
 * in the places list at once. The hub asks the machine for one more (agent
 * search/index.ts `MAX_PLACES` is this and one), which says there are more.
 */
export const PLACES_LIMIT = 500;

const WHOSE: Record<
  Exclude<TranscriptPlace["author"], "injected">,
  FindPlace["whose"]
> = {
  owner: "me",
  agent: "agent",
  report: "delegates",
};

/** One place the machine answered, as the dashboard's places list reads it; none for words no one said. */
function placeOf(place: TranscriptPlace): FindPlace[] {
  const output = place.column === "output";
  let whose: FindPlace["whose"] = "tools";
  if (!output) {
    if (place.author === "injected") {
      return [];
    }
    whose = WHOSE[place.author];
  }
  const at =
    place.timestamp === null ? Number.NaN : Date.parse(place.timestamp);
  return [
    {
      at: Number.isNaN(at) ? null : at,
      docId: place.docId,
      excerpt: place.excerpt,
      thinking: place.column === "thinking",
      whose,
    },
  ];
}

/** Whether `value` reads as a machine's places answer: a list of places. */
const isPlaces = (value: unknown): value is TranscriptPlace[] =>
  Array.isArray(value) &&
  value.every(
    (each) =>
      typeof each === "object" &&
      each !== null &&
      typeof (each as TranscriptPlace).docId === "string" &&
      typeof (each as TranscriptPlace).excerpt === "string"
  );

/**
 * How the machine took the places read (core `PlacesHeard`), and its places
 * when it answered: an agent from before the read was added says it has no
 * such function (core `unknownControlWords`), which is told apart from a
 * machine that did not answer, since waiting brings nothing and an update
 * does. `null`: the asker let the read go.
 */
export function placesHeard(
  answer: Bounded<ControlResultFrame> | null
):
  | { heard: "answered"; places: TranscriptPlace[] }
  | { heard: Exclude<PlacesHeard, "answered"> } {
  if (answer?.kind !== "answered") {
    return { heard: "silent" };
  }
  const { value } = answer;
  if (value.ok && isPlaces(value.result)) {
    return { heard: "answered", places: value.result };
  }
  return value.error?.includes(unknownControlWords(CONTROL_TRANSCRIPT_PLACES))
    ? { heard: "outdated" }
    : { heard: "silent" };
}

/**
 * The machine's places as the screens read them, oldest first; while
 * "Hide secrets in Find" is on (`hide`), each names where its excerpt's
 * secrets stand, for the screen to draw as dots (find-secrets.ts).
 */
export async function placesForScreens(
  places: readonly TranscriptPlace[],
  hide: boolean
): Promise<FindPlace[]> {
  const kept = places.flatMap(placeOf);
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
