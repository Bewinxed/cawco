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
        runs = `call ${handler.mcp_server_name || "…"}’s ${handler.tool_name || "…"} tool`;
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
