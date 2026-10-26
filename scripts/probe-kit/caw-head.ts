/**
 * Caw's head in the top bar (NeedsCaw.svelte), as journeys and specs find
 * and read it: by its role and the words it says, taken from the words the
 * product renders (packages/core/src/words/caw-head.ts), never copied here.
 * A word changed there is the word looked for here.
 *
 * A head saying anything else fails its reading by name: "Caw's head said
 * “X”, none of …", read off the head itself, rather than as no head after
 * the locator's wait.
 */
import type { Page } from "playwright-core";
import { cawHeadWords as words } from "../../packages/core/src/words/caw-head";
import { literal } from "./words";

/** A count no head says, standing in for the count in the needs words. */
const HOLE = 987_654_321;

/** The needs words with `count` (a pattern) where the number goes. */
const needsPattern = (count: string) =>
  literal(words.needs(HOLE)).replace(String(HOLE), count);

/** What the head says with nothing to count. */
const QUIET = [words.caughtUp, words.reading, words.waiting];

/** Every word the head says of what needs you, at the start of its label. */
const CAW_SAYS = new RegExp(
  `^(?:${[needsPattern("\\d+"), ...QUIET.map(literal)].join("|")})`,
  "u"
);

/** Caw's head: the needs-you count. */
export const caw = (page: Page) =>
  page.getByRole("button", { name: CAW_SAYS }).first();
