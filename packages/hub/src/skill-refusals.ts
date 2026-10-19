/**
 * What the decision-page skill's "Before you show it" table must refuse: the
 * catalogue pages agents showed the owner instead of interviewing him (one
 * question per card, each option drawn live with its gets and its cost, one
 * recommendation, nothing decided or rejected left standing). Each is the
 * start of a row's first cell; `bun run roles:check` fails while one is
 * missing, so an edit to the skill can't drop it unseen.
 */
import { join } from "node:path";

export const REFUSALS = [
  "A card with no question",
  "An option with no cost line",
  "Two Recommended on one card, or none",
  '"Today" frames that aren\'t a real option',
  "Legends",
  "Size or id captions",
  "Frames outside a card",
  "More than one card for a choice already made",
  "A page that shows a state catalogue",
] as const;

const SKILL = join(import.meta.dir, "../skills/decision-page/SKILL.md");
const TABLE = "## Before you show it";

/** The refusals the skill's table lacks: each row's first cell, matched from its start. */
export const missingRefusals = async (): Promise<string[]> => {
  const text = await Bun.file(SKILL).text();
  const at = text.indexOf(TABLE);
  const next = at < 0 ? -1 : text.indexOf("\n## ", at + TABLE.length);
  const section = at < 0 ? "" : text.slice(at, next < 0 ? undefined : next);
  const refused = section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => line.slice(2).split(" | ")[0]?.trim() ?? "");
  return REFUSALS.filter(
    (refusal) => !refused.some((cell) => cell.startsWith(refusal))
  );
};
