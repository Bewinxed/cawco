/** The sentences a permission card shows. */

import type { PermissionPresentation } from "../permission-presentation";

/** Who asks and where, as an ask's head names them: "Caw · cockpit". */
export const askerLine = (presentation: PermissionPresentation): string =>
  presentation.project
    ? `${presentation.asker} · ${presentation.project}`
    : presentation.asker;

/**
 * How long an "Always allow" grant lasts, by the destination Claude names on
 * its suggestion, in the card's "This would allow … for {scope}". Claude
 * picks the destination and the card only reports it: `localSettings` writes
 * the rule into the checkout's `.claude/settings.local.json`, which is not a
 * session's promise.
 */
export const grantScopes: ReadonlyMap<string, string> = new Map([
  ["session", "session"],
  ["cliArg", "session"],
  ["localSettings", "this project"],
  ["projectSettings", "this project"],
  ["userSettings", "everywhere"],
]);

/** A destination the list above does not name: one a later Claude release added. */
export const unnamedGrantScope = "a scope CawCo doesn't know yet";

/**
 * What a harness hears when the person denies its tool ask and gives no
 * words of their own: Claude Code reads it as the deny's message, and
 * OpenCode as its reject's, which fails the call with it and lets the turn
 * go on (a reject with no words ends OpenCode's step).
 */
export const PERMISSION_DENIED = "User denied permission";
