import {
  type Deleted,
  type RULE_TEMPLATES,
  type Rule,
  type RuleDraft,
  type RuleRow,
  routinesWords,
} from "@cawco/core";
import { hubFailure } from "#lib/cawco/hub-read.js";

/**
 * The dashboard's side of rules. Fetch wrappers in the shape `fleet.ts`
 * established — a refusal from the hub is an Elysia bare string, so `said`
 * unwraps it and every call throws a whole sentence the caller can print.
 *
 * The matching and validation live in `@cawco/core` rather than here, on
 * purpose: the editor's test box and the hub's engine must agree about what
 * fires, and the form's refusals must be the hub's own words.
 */

export type { Rule, RuleDraft, RuleRow } from "@cawco/core";
/** What `GET /api/rules` answers with. */
export interface RulesPayload {
  rules: RuleRow[];
  templates: typeof RULE_TEMPLATES;
}

/**
 * One session's history with a rule, as the activity trail shows it.
 *
 * A session reads a rule's reply but never sees the rule's history, so this
 * listing is the only place it is visible.
 */
export interface RuleActivity {
  ackedAt: number | null;
  fireCount: number;
  harness: string | null;
  instanceId: string;
  lastFiredAt: number | null;
  ruleId: string;
  status: "armed" | "pending";
  totalFires: number;
  /** The directory the session works in, for a reader who has to recognise it. */
  where: string;
}

export const loadRuleActivity = (
  id: string
): Promise<{ activity: RuleActivity[] }> =>
  send<{ activity: RuleActivity[] }>(
    `/api/rules/${encodeURIComponent(id)}/activity`,
    {},
    "load what this rule has caught"
  );

/** What the hub said went wrong, in one sentence without its stop (hub-read `hubFailure`). */
async function said(response: Response): Promise<string> {
  return (await hubFailure(response)).detail;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Could not ${attempt}. ${await said(response)}.`);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const loadRules = (): Promise<RulesPayload> =>
  send<RulesPayload>("/api/rules", {}, "load the rules");

/** Create: the hub mints the id and answers with the whole rule. */
export const createRule = (draft: RuleDraft): Promise<Rule> =>
  send<Rule>(
    "/api/rules",
    { method: "POST", ...json(draft) },
    `save ${draft.name || "the rule"}`
  );

/** Edit: strictly an existing id — the hub 404s anything it never minted. */
export const saveRule = (id: string, draft: RuleDraft): Promise<Rule> =>
  send<Rule>(
    `/api/rules/${encodeURIComponent(id)}`,
    { method: "PUT", ...json(draft) },
    `save ${draft.name || "the rule"}`
  );

/** Delete: the rule stops at once, into the hub's trash for its Undo (config/undo.ts). */
export const removeRule = (id: string, name: string): Promise<Deleted> =>
  send<Deleted>(
    `/api/rules/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    `delete ${name}`
  );

/** A blank rule, on the defaults that make the common case one field of typing. */
export const blankRule = (): RuleDraft => ({
  name: "",
  enabled: true,
  pattern: "",
  matchKind: "phrase",
  caseSensitive: false,
  wholeWord: false,
  watch: "text",
  reply: "",
  // Waking an idle session is what makes a rule change what the session does;
  // the other two timings are for the cases where that is too late.
  timing: "turn",
  repeat: true,
  scope: {},
});

/** Strips a saved rule back to a draft, so the editor holds one shape either way. */
export const draftOf = (rule: Rule): RuleDraft => ({
  name: rule.name,
  enabled: rule.enabled,
  pattern: rule.pattern,
  matchKind: rule.matchKind,
  caseSensitive: rule.caseSensitive,
  wholeWord: rule.wholeWord,
  watch: rule.watch,
  reply: rule.reply,
  timing: rule.timing,
  repeat: rule.repeat,
  scope: { ...rule.scope },
});

/** "3 minutes ago", and "never" for a rule that has not caught anything yet. */
export function since(at: number | null): string {
  if (at === null) {
    return routinesWords.neverAt;
  }
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) {
    return routinesWords.justNow;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return routinesWords.ago(`${minutes}m`);
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return routinesWords.ago(`${hours}h`);
  }
  return routinesWords.ago(`${Math.round(hours / 24)}d`);
}

/** `1 time` / `4 times`, because "4 time" in a settings list is a tell. */
export const times = (count: number): string =>
  `${count} time${count === 1 ? "" : "s"}`;
