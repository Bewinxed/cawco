/** A hook draft as a sentence. */

import { EVENT_INFO, type HookDraft, hookMatcherKind } from "../hooks";

const SENTENCE_SEPARATOR = /[|,]/u;

/**
 * The hook read back as one English sentence. The list prints it per row and
 * the editor prints it live above the form, so what is being configured stays
 * legible while it is configured — and so a matcher that silently became a
 * regular expression is visible as prose before it is visible as a bug.
 */
export function hookSentence(draft: Partial<HookDraft>): string {
  const info = draft.event ? EVENT_INFO.get(draft.event) : undefined;
  const when = info ? `When ${info.blurb}` : "When …";

  const matcher = draft.matcher?.trim() ?? "";
  const kind = hookMatcherKind(matcher, draft.event);
  let narrowed = "";
  if (info?.filters && kind !== "all") {
    narrowed =
      kind === "exact"
        ? ` and the ${info.filters} is ${matcher
            .split(SENTENCE_SEPARATOR)
            .map((p) => `“${p.trim()}”`)
            .join(" or ")}`
        : ` and the ${info.filters} matches the expression “${matcher}”`;
  }

  const { handler } = draft;
  let runs = "do something";
  if (handler) {
    switch (handler.type) {
      case "command": {
        runs = draft.script?.trim()
          ? "run this machine’s copy of the script below"
          : `run \`${handler.command ?? "…"}\``;
        break;
      }
      case "http": {
        runs = `post the event to ${handler.url || "…"}`;
        break;
      }
      case "mcp_tool": {
        runs = `call ${handler.server || "…"}’s ${handler.tool || "…"} tool`;
        break;
      }
      case "prompt": {
        runs = "ask a model to decide";
        break;
      }
      case "agent": {
        runs = "spawn a subagent to decide";
        break;
      }
      default: {
        runs = "spawn a subagent to decide";
      }
    }
  }

  const where =
    draft.scope && draft.scope !== "user"
      ? " in one project"
      : " on every machine in the fleet";

  const off =
    draft.enabled === false
      ? " It is turned off, so nothing is registered."
      : "";

  return `${when}${narrowed}, ${runs}${where}.${off}`;
}

/** Why a hook's script could not be parse-checked: `shell` is not on the PATH here (core hook-script.ts). */
export const shellCheckMissing = (shell: string): string =>
  `${shell} is not installed here, so the script could not be checked and could not run`;

/** Why a hook's parse check stopped: `<shell> -n` was ended by a signal. */
export const shellCheckEnded = (shell: string, signal: string): string =>
  `${shell} -n was ended by ${signal}`;

/** Why a hook's script does not parse, when `<shell> -n` failed and printed nothing. */
export const shellCheckExited = (shell: string, code: number): string =>
  `${shell} -n exited ${code}`;

/** Why a hook's script is taken as not parsing: `<shell> -n` did not answer in time. */
export const shellCheckTimedOut = (shell: string, seconds: number): string =>
  `${shell} -n said nothing and did no work for ${seconds} s`;

/**
 * The hub's refusal of a hook whose script `shell` does not parse (hub
 * routes/fleet-hooks.ts): the parser's error, that every machine would
 * refuse it too, and the fix for the usual cause, a script that hands off
 * to another interpreter partway through.
 */
export const hookScriptUnparsed = (shell: string, said: string): string =>
  `The script does not parse as ${shell}: ${said}. Every machine checks a hook's script with \`${shell} -n\` before it installs it, and would refuse this one. If the script hands off to another interpreter (\`exec perl -x "$0" "$@"\`), put everything after that line in a quoted here-document, \`: <<'END'\` above it and \`END\` below it, so ${shell} reads it as text.`;

/**
 * A machine's word on a hook update it could not install while an earlier
 * version is installed (agent fleet.ts `settleHooks`): the new version
 * failed, why, and that the earlier one keeps running.
 */
export const hookUpdateKept = (why: string): string =>
  `This version was not installed: ${why}. The version installed before it keeps running.`;

/**
 * A machine's word on a hook whose copy edited on that machine does not
 * parse (agent fleet.ts `settleHooks`): the copy is kept to compare or
 * adopt, and nothing runs it.
 */
export const hookDriftUnparsed = (why: string): string =>
  `The copy edited on this machine does not parse: ${why}. It is kept on disk to compare or adopt, and is not registered.`;
