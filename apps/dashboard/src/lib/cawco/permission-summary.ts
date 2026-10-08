import type {
  PermissionUpdate,
  PermissionUpdateDestination,
} from "@cawco/core";

/*
 * What an ask says (its summary, the change, its fields) is the hub's reading,
 * on the ask itself: `PendingPermission.presentation` (core
 * permission-presentation.ts). This file keeps only the standing grant's words.
 */

/** How much of a rule the card's "always allow" label carries before it is cut. */
const RULE_LABEL_MAX = 30;

/** One suggestion as a rule, written the way the SDK writes them: `Bash(git status:*)`. */
function ruleText(update: PermissionUpdate): string | null {
  if ("rules" in update) {
    const [rule] = update.rules;
    if (!rule) {
      return null;
    }
    return rule.ruleContent
      ? `${rule.toolName}(${rule.ruleContent})`
      : rule.toolName;
  }
  if (update.type === "addDirectories") {
    return update.directories[0] ?? null;
  }
  return null;
}

/**
 * How long a grant lasts, in the card's words. The SDK picks the destination
 * and the card only reports it: `localSettings` writes the rule into the
 * checkout's `.claude/settings.local.json`, which is not a session's promise.
 */
const SCOPE: Record<PermissionUpdateDestination, string> = {
  session: "session",
  cliArg: "session",
  localSettings: "this project",
  projectSettings: "this project",
  userSettings: "everywhere",
};

/**
 * What granting the SDK's suggestions would allow from now on, for the card's
 * "always allow" action: `short` fits on a button, `full` is what it titles
 * itself with — a rule you cannot read is a rule you cannot decide on.
 */
export function suggestedRule(
  suggestions: PermissionUpdate[]
): { short: string; full: string; scope: string } | null {
  for (const update of suggestions) {
    const full = ruleText(update);
    if (!full) {
      continue;
    }
    const short =
      full.length > RULE_LABEL_MAX
        ? `${full.slice(0, RULE_LABEL_MAX - 1)}…`
        : full;
    return { short, full, scope: SCOPE[update.destination] };
  }
  return null;
}
