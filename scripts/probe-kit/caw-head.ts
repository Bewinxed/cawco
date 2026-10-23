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
import { Unmet } from "./journeys/suite";
import { literal } from "./words";

/** A count no head says, standing in for the count in the needs words. */
const HOLE = 987_654_321;

/** The needs words with `count` (a pattern) where the number goes. */
const needsPattern = (count: string) =>
  literal(words.needs(HOLE)).replace(String(HOLE), count);

/** What the head says with nothing to count. */
const QUIET = [words.caughtUp, words.reading, words.waiting];

/** Every word the head says of what needs you, at the start of its label. */
export const CAW_SAYS = new RegExp(
  `^(?:${[needsPattern("\\d+"), ...QUIET.map(literal)].join("|")})`
);

/** The one empty answer: nothing needs you, known over a live hub. */
export const ZERO = words.caughtUp;

/** The head saying exactly `count` need you (a notice may follow). */
export const needsCount = (count: number) =>
  new RegExp(`^${needsPattern(String(count))}(?:\\D|$)`);

/** How long a reading waits for a head saying a known word. */
const READ_MS = 5000;

/** Caw's head: the needs-you count. */
export const caw = (page: Page) =>
  page.getByRole("button", { name: CAW_SAYS }).first();

/**
 * What Caw's head says now. A head saying none of its words fails with
 * what it does say (its accessible name, its aria-label); no head on the
 * page fails as that.
 */
export async function cawSays(page: Page): Promise<string> {
  try {
    return (
      (await caw(page).getAttribute("aria-label", { timeout: READ_MS })) ?? ""
    );
  } catch (error) {
    // Read the head by its mark alone, to say what it says instead. Only a
    // diagnosis: the head is still found by the person's words above.
    const said = await page
      .locator("button[data-needs-caw]")
      .first()
      .getAttribute("aria-label", { timeout: 500 })
      .catch(() => null);
    if (said === null) {
      throw new Unmet(
        `no Caw's head on the page within ${READ_MS / 1000}s (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
        { cause: error }
      );
    }
    throw new Unmet(
      `Caw's head said “${said}”, none of ${[words.needs(HOLE).replace(String(HOLE), "N"), ...QUIET].map((one) => `“${one}”`).join(", ")}`,
      { cause: error }
    );
  }
}
