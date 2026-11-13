/**
 * A `cawco:` reference (references.ts) written in the words of a decision
 * page: its text, a card's question and `why`, an option's words. The page
 * stands on another origin than the dashboard's and reads none of its
 * store, so the dashboard that frames it says how each reference draws now,
 * as data, and the page draws that face on the dashboard's own chip
 * (ReferenceFace.svelte); a press asks the dashboard to open it, as a chip
 * of it pressed in the dashboard opens.
 *
 * What a page may learn of and open is the product's to say, never the
 * page's: its links ({@link PageLinks}), every reference its program's
 * words name ({@link programReferences}) and every artifact its Canvas and
 * Preview pieces show, read by the hub off the program it checked and kept
 * (`GET /api/artifacts/:artifact/links`). Nothing the page, or any script
 * in it, says adds to them; a page with no program has none.
 *
 * - The host to the page through the overlay: {@link REFERENCE_FACES}
 *   `{ faces }`, the face of each reference in the set, again each time
 *   one changes. A reference with no face (null, or none said) draws as
 *   its label alone, as a reference the dashboard knows nothing by draws
 *   everywhere.
 * - The page asks its host, a JSON-RPC ask: {@link OPEN_REFERENCE_ASK}
 *   `{ href }`, or `cawco/open-artifact` `{ artifact }` (a Canvas's Open to
 *   draw, a Preview's Open full), answered with the refusal's words, or
 *   null once it opened; a reference or an artifact outside its links is
 *   refused.
 */
import { Lexer } from "marked";
import { ARTIFACT_KINDS, type ArtifactKind } from "./artifact-kinds";

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

/** A run of a page's words: text as written, or a reference with its written label. */
export type ReferenceRun = { text: string } | { href: string; label: string };

/** What every reference's destination starts with, after its label. */
const LINK_SCHEME = "](cawco:";
/** A backslash escape in a link's label (references.ts `referenceLink` writes them). */
const ESCAPED = /\\([\\[\]])/gu;

/**
 * `text`'s runs, in order: its text as written, and each `cawco:`
 * reference in it (`[label](cawco:<kind>/<id>)`) with its destination and
 * its written label, read by marked's inline lexer, the CommonMark reader
 * the transcript's markdown reads links by (svelte-streamdown). Only a
 * reference is taken out of the words: every other token, a link to any
 * other address among them, stays the characters it was written as, so
 * words with no reference are one run of exactly what was written.
 */
export function referenceRuns(text: string): ReferenceRun[] {
  if (!text.includes(LINK_SCHEME)) {
    return [{ text }];
  }
  const runs: ReferenceRun[] = [];
  let written = "";
  for (const token of Lexer.lexInline(text)) {
    if (token.type === "link" && isReferenceHref(token.href)) {
      if (written) {
        runs.push({ text: written });
        written = "";
      }
      runs.push({
        href: token.href,
        label: token.text.replace(ESCAPED, "$1"),
      });
    } else {
      written += token.raw;
    }
  }
  if (written) {
    runs.push({ text: written });
  }
  return runs;
}

/** The references `words` name, each once, in the order first written, at most {@link REFERENCES_MOST}. */
export function programReferences(words: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const text of words) {
    for (const run of referenceRuns(text)) {
      if ("href" in run) {
        found.add(run.href);
        if (found.size >= REFERENCES_MOST) {
          return [...found];
        }
      }
    }
  }
  return [...found];
}

/** What a page's program links to: all its frame may learn the faces of, and ask its host to open. */
export interface PageLinks {
  /** The artifacts its Canvas and Preview pieces show, by id. */
  artifacts: string[];
  /** The `cawco:` references its words name. */
  references: string[];
}

/** The most artifacts one page's pieces show. Our call: a page shows a few dozen. */
const ARTIFACTS_MOST = 200;
/** The longest artifact id taken. Our call: an id is a UUID. */
const ARTIFACT_ID_MOST = 100;

/** A page's links as the hub said them, each entry whole; anything else left out. */
export function pageLinksOf(value: unknown): PageLinks {
  const raw = (typeof value === "object" && value !== null ? value : {}) as {
    artifacts?: unknown;
    references?: unknown;
  };
  return {
    references: Array.isArray(raw.references)
      ? [...new Set(raw.references.filter(isReferenceHref))].slice(
          0,
          REFERENCES_MOST
        )
      : [],
    artifacts: Array.isArray(raw.artifacts)
      ? [
          ...new Set(
            raw.artifacts.filter(
              (one): one is string =>
                typeof one === "string" &&
                one.length > 0 &&
                one.length <= ARTIFACT_ID_MOST
            )
          ),
        ].slice(0, ARTIFACTS_MOST)
      : [],
  };
}
