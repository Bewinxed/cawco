/**
 * A `cawco:` reference (references.ts) written in the words of a page that
 * stands on another origin than the dashboard's: a decision page's text, a
 * card's question and `why`, an option's words. The page reads none of the
 * dashboard's store, so the dashboard that frames it says how each reference
 * draws now, as data, and the page draws that face on the dashboard's own
 * chip (ReferenceFace.svelte); a press asks the dashboard to open it, as a
 * chip of it pressed in the dashboard opens.
 *
 * - The page to its overlay, a `window` event, and the overlay to its host:
 *   {@link REFERENCES_DRAWN} `{ hrefs }`, every reference the page draws now
 *   (the whole list each time it changes, and again on each hello).
 * - The host to the page through the overlay: {@link REFERENCE_FACES}
 *   `{ faces }`, each of those links' face, again each time one changes.
 *   A link with no face (null, or none said yet) draws as its label alone,
 *   as a reference the dashboard knows nothing by draws everywhere.
 * - The page asks its host, a JSON-RPC ask: {@link OPEN_REFERENCE_ASK}
 *   `{ href }`, answered with the refusal's words, or null once it opened.
 */
import { ARTIFACT_KINDS, type ArtifactKind } from "./artifact-kinds";

/** The page's references, to its host. */
export const REFERENCES_DRAWN = "cawco:references";
/** The host's faces of them, to the page. */
export const REFERENCE_FACES = "cawco:reference-faces";
/** The page's ask to open one. */
export const OPEN_REFERENCE_ASK = "cawco/open-reference";

/** The most references one page's words are drawn with. Our call: a long page names a few dozen. */
const REFERENCES_MOST = 200;
/** The longest destination a reference is followed by. Our call: an id is short. */
const REFERENCE_HREF_MOST = 400;
/** The longest words a face carries. Our call: a task's title, a step's text. */
const WORDS_MOST = 2000;

/** A reference's mark before its words. */
export type ReferenceMark =
  /** A session's: its sprite seeded by `seed`, on the hue `place` seeds (dashboard mark.ts). */
  | { of: "session"; seed: string; place: string }
  /** An artifact's kind's glyph: an artifact's chip, and a pin's on its page. */
  | { of: "artifact"; kind: ArtifactKind }
  /** A decision card's. */
  | { of: "decision" }
  /** A spot an update changed. */
  | { of: "change" };

/** A reference's face: what its chip shows, as the dashboard reads it now. */
export interface ReferenceFace {
  /** Its mark before its words; null: none. */
  mark: ReferenceMark | null;
  /** Its state after its words (a task's stage, a step's status); null: none. */
  state: string | null;
  /** Its whole name, its tip and its accessible name; null: its words. */
  title: string | null;
  /** Its words; null: the link's written label. */
  words: string | null;
}

/** A string of at most `most` characters, or null; undefined when it is neither. */
const wordsOf = (
  value: unknown,
  most = WORDS_MOST
): string | null | undefined => {
  if (value === null) {
    return null;
  }
  return typeof value === "string" && value.length <= most ? value : undefined;
};

const isArtifactKind = (value: unknown): value is ArtifactKind =>
  (ARTIFACT_KINDS as readonly unknown[]).includes(value);

function markOf(value: unknown): ReferenceMark | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = value as Record<string, unknown> | undefined;
  switch (raw?.of) {
    case "session":
      return typeof raw.seed === "string" && typeof raw.place === "string"
        ? { of: "session", seed: raw.seed, place: raw.place }
        : undefined;
    case "artifact":
      return isArtifactKind(raw.kind)
        ? { of: "artifact", kind: raw.kind }
        : undefined;
    case "decision":
    case "change":
      return { of: raw.of };
    default:
      return undefined;
  }
}

/** A host's face, whole; null when it is not one. */
function faceOf(value: unknown): ReferenceFace | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const words = wordsOf(raw.words);
  const state = wordsOf(raw.state, 200);
  const title = wordsOf(raw.title);
  const mark = markOf(raw.mark);
  return words === undefined ||
    state === undefined ||
    title === undefined ||
    mark === undefined
    ? null
    : { words, state, mark, title };
}

/** Whether `href` is a destination a page may ask a face of, or to open. */
export const isReferenceHref = (href: unknown): href is string =>
  typeof href === "string" &&
  href.length <= REFERENCE_HREF_MOST &&
  href.startsWith("cawco:");

/** The references a page said it draws, each one a `cawco:` destination; the rest left out. */
export const drawnReferencesOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter(isReferenceHref))].slice(0, REFERENCES_MOST)
    : [];

/** The faces a host said, each one whole; any other entry left out. */
export function referenceFacesOf(
  value: unknown
): Record<string, ReferenceFace | null> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const faces: Record<string, ReferenceFace | null> = {};
  for (const [href, face] of Object.entries(value).slice(0, REFERENCES_MOST)) {
    if (!isReferenceHref(href)) {
      continue;
    }
    faces[href] = faceOf(face);
  }
  return faces;
}
