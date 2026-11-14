import type { WorkBudget } from "./db/stored-types";

/**
 * What a work item's request may state of the files it owns and of its
 * budget, and why one cannot stand: read by the tasks, the dispatcher, the
 * routines and the items themselves, so none of them reaches the others for it.
 */

// --- file ownership ------------------------------------------------------------

/** The longest path a glob is matched against (PATH_MAX). */
const GLOB_LIMIT = 4096;
const LEADING_DOT_SLASH = /^(\.\/)+/u;
const TRAILING_SLASH = /\/+$/u;

/** A glob as ownership compares it: no leading `./`, no trailing `/`. */
export const globOf = (raw: string): string =>
  raw.trim().replace(LEADING_DOT_SLASH, "").replace(TRAILING_SLASH, "");

/** Why owned globs cannot stand, or nothing when they can. */
export const ownsProblem = (owns: string[]): string | undefined => {
  for (const raw of owns) {
    const glob = globOf(raw);
    if (!glob || glob.length > GLOB_LIMIT) {
      return `owns: “${raw}” is not a glob of ${GLOB_LIMIT} characters or fewer.`;
    }
    if (glob.startsWith("/") || glob.split("/").includes("..")) {
      return `owns: “${raw}” reaches outside the repository; name files from its root, like src/theme/** or docs/theme.md.`;
    }
  }
  return undefined;
};

// --- budgets ---------------------------------------------------------------------

/** Why a budget cannot stand, or nothing when it can. */
export const budgetProblem = (budget: WorkBudget): string | undefined => {
  const { usd, turns, minutes } = budget;
  if (usd !== undefined && !(Number.isFinite(usd) && usd > 0)) {
    return "budget.usd is a number of dollars above 0.";
  }
  for (const [name, value] of [
    ["turns", turns],
    ["minutes", minutes],
  ] as const) {
    if (value !== undefined && !(Number.isInteger(value) && value >= 1)) {
      return `budget.${name} is a whole number from 1.`;
    }
  }
  return undefined;
};
