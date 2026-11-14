import { isObject } from "@cawco/core/comments/model";
import {
  grantScopes,
  unnamedGrantScope,
} from "@cawco/core/words/permission-lines";

/*
 * What an ask says (its summary, the change, its fields) is the hub's reading,
 * on the ask itself: `PendingPermission.presentation` (core
 * permission-presentation.ts). This file keeps only the standing grant's words.
 */

/** How much of a rule the card's "always allow" label carries before it is cut. */
const RULE_LABEL_MAX = 30;

/**
 * One suggestion as a rule, written the way the SDK writes them:
 * `Bash(git status:*)`. A suggestion is the provider's own value, so this
 * reads only what it finds: a first rule naming its tool, or a directory an
 * `addDirectories` adds. Anything else has no rule to show.
 */
function ruleText(update: Record<string, unknown>): string | null {
  if (Array.isArray(update.rules)) {
    const [rule] = update.rules;
    if (!(isObject(rule) && typeof rule.toolName === "string")) {
      return null;
    }
    return typeof rule.ruleContent === "string" && rule.ruleContent
      ? `${rule.toolName}(${rule.ruleContent})`
      : rule.toolName;
  }
  if (update.type === "addDirectories" && Array.isArray(update.directories)) {
    const [directory] = update.directories;
    return typeof directory === "string" ? directory : null;
  }
  return null;
}

/** How long a grant lasts, in the card's words; a destination the card doesn't know still reads as a scope. */
const scopeOf = (destination: unknown): string =>
  (typeof destination === "string" && grantScopes.get(destination)) ||
  unnamedGrantScope;

/**
 * What granting the SDK's suggestions would allow from now on, for the card's
 * "always allow" action: `short` fits on a button, `full` is what it titles
 * itself with — a rule you cannot read is a rule you cannot decide on.
 */
export function suggestedRule(
  suggestions: unknown[]
): { short: string; full: string; scope: string } | null {
  for (const update of suggestions) {
    if (!isObject(update)) {
      continue;
    }
    const full = ruleText(update);
    if (!full) {
      continue;
    }
    const short =
      full.length > RULE_LABEL_MAX
        ? `${full.slice(0, RULE_LABEL_MAX - 1)}…`
        : full;
    return { short, full, scope: scopeOf(update.destination) };
  }
  return null;
}
