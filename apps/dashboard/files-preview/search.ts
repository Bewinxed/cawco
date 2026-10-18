/**
 * Files' search: the find engine's own matcher (packages/hub find-names.ts,
 * what the composer's finder and Jump are answered by), run over a
 * session's files. A word matches a name or, at a lower weight, the words
 * on an artifact's page: the engine's `transcript` recogniser, the one its
 * "said in" moments are found by, with `excerptOf` cutting the words around
 * the first hit and the finder's `excerptParts` marking it. Every word must
 * match (`matchOf`); results keep the engine's order, best match first, then
 * newest.
 */
import type { FindField } from "@cawco/core";
import type { Excerpt } from "#lib/cawco/find/find-rows.js";
import { excerptParts } from "#lib/cawco/find/find-rows.js";
import {
  type Entry,
  excerptOf,
  KIND_WORDS,
  matchOf,
  parse,
  wordsOf,
} from "../../../packages/hub/src/find-names";
import type { ArtifactRow, AttachmentRow } from "./fixtures";

export interface Hit<T> {
  item: T;
  /** The words on its page around the first hit, when the page is what matched. */
  within: Excerpt["parts"] | null;
}

const fieldOf = (name: FindField, text: string) => ({
  name,
  text: text.toLowerCase(),
  words: wordsOf(text),
});

const entryOf = (fields: Entry["fields"], kinds: readonly string[]): Entry =>
  ({
    asked: new Set(kinds),
    fields,
    kin: 0,
    result: null,
  }) as unknown as Entry;

/**
 * How many characters a card keeps before the first hit. The engine cuts
 * 70 each side for the finder's full-width row; a card's two lines at a
 * column's width would leave the hit past them, under the clamp.
 */
const BEFORE_HIT = 24;

/** The engine's excerpt, begun a few words before its first hit. */
const nearHit = (excerpt: string): string => {
  const hit = excerpt.indexOf("「");
  if (hit <= BEFORE_HIT) {
    return excerpt;
  }
  const from = excerpt.indexOf(" ", hit - BEFORE_HIT);
  return `…${excerpt.slice(from < 0 || from >= hit ? hit : from + 1)}`;
};

export function searchArtifacts(
  rows: ArtifactRow[],
  q: string
): Hit<ArtifactRow>[] {
  const query = parse(q);
  if (query.tokens.length === 0) {
    return rows.map((item) => ({ item, within: null }));
  }
  return rows
    .map((item) => {
      const match = matchOf(
        entryOf(
          [fieldOf("title", item.name), fieldOf("transcript", item.text)],
          [...KIND_WORDS.artifact, ...KIND_WORDS[item.kind]]
        ),
        query
      );
      const within =
        match.score > 0 && match.fields.includes("transcript")
          ? excerptParts(nearHit(excerptOf(item.text, query.words)))
          : null;
      return { item, within, score: match.score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.age - b.item.age)
    .map(({ item, within }) => ({ item, within }));
}

export function searchAttachments(
  rows: AttachmentRow[],
  q: string
): AttachmentRow[] {
  const query = parse(q);
  if (query.tokens.length === 0) {
    return rows;
  }
  return rows
    .map((item) => ({
      item,
      score: matchOf(
        entryOf(
          [
            fieldOf("title", item.name),
            fieldOf("kind", `${item.kind} ${item.who}`),
          ],
          KIND_WORDS.file
        ),
        query
      ).score,
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.age - b.item.age)
    .map(({ item }) => item);
}
