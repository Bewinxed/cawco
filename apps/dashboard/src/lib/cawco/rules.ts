import type { RULE_TEMPLATES, Rule, RuleDraft, RuleRow } from "@cawco/core";

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
// biome-ignore lint/performance/noBarrelFile: re-exports the shared rule types/constant that this dashboard module and the hub engine must agree on, not a module-graph barrel
export { RULE_TEMPLATES } from "@cawco/core";

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

/** Elysia refuses with a bare string; JSON only when something else went wrong. */
async function said(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      return String((parsed as { message: unknown }).message);
    }
  } catch {
    // Not JSON, which is the ordinary case: the string is the sentence.
  }
  return body || `the hub answered ${response.status}`;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Could not ${attempt} — ${await said(response)}.`);
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

export const removeRule = async (id: string, name: string): Promise<void> => {
  const response = await fetch(`/api/rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Could not delete ${name} — ${await said(response)}.`);
  }
};

/** A blank rule, on the defaults that make the common case one field of typing. */
export const blankRule = (): RuleDraft => ({
  name: "",
  enabled: true,
  trigger: "pattern",
  pattern: "",
  matchKind: "phrase",
  caseSensitive: false,
  wholeWord: false,
  watch: "text",
  action: "reply",
  reply: "",
  prompt: null,
  // Waking an idle session is what makes a rule change what the session does;
  // the other two timings are for the cases where that is too late.
  timing: "turn",
  interrupt: false,
  repeat: true,
  scope: {},
});

/** Strips a saved rule back to a draft, so the editor holds one shape either way. */
export const draftOf = (rule: Rule): RuleDraft => ({
  name: rule.name,
  enabled: rule.enabled,
  trigger: rule.trigger,
  pattern: rule.pattern,
  matchKind: rule.matchKind,
  caseSensitive: rule.caseSensitive,
  wholeWord: rule.wholeWord,
  watch: rule.watch,
  action: rule.action,
  reply: rule.reply,
  prompt: rule.prompt,
  timing: rule.timing,
  interrupt: rule.interrupt,
  repeat: rule.repeat,
  scope: { ...rule.scope },
});

/**
 * Pre-written every-turn LLM rules — the adversarial "whip" presets the
 * operator clicks into place. Client-side templates (no migration, operator
 * opts in); the prompts are sent verbatim to a local qwen model.
 */
export const WHIP_PRESETS: {
  name: string;
  trigger: "every-turn";
  action: "llm";
  prompt: string;
}[] = [
  {
    name: "Done-claim without evidence",
    trigger: "every-turn",
    action: "llm",
    prompt:
      "If the agent claims work is done, finished, complete, or passing without pasting the actual test output or build output that proves it, reject the claim. Tell it to run the tests and paste the full output before reporting done.",
  },
  {
    name: "Permission-seeking stall",
    trigger: "every-turn",
    action: "llm",
    prompt:
      'If the agent asks "would you like me to…", "shall I proceed", "should I continue", or any variation that hands the decision back instead of doing the work, tell it to stop asking and proceed. Finish the whole list, do not stop after each item.',
  },
  {
    name: "Placeholder left behind",
    trigger: "every-turn",
    action: "llm",
    prompt:
      'If the agent left a placeholder, stub, TODO, "rest as an exercise", or any incomplete implementation where real code was asked for, reject it. Demand the complete working version — no ellipsis, no "implement similarly", no deferred work.',
  },
  {
    name: "Files touched outside the brief",
    trigger: "every-turn",
    action: "llm",
    prompt:
      "If the agent touched, edited, or created files outside the set of owned files stated in its brief, tell it to revert those changes immediately and stay in its owned files. Scope drift is not initiative — it is desertion.",
  },
];

/** Whatever the caller threw, as a sentence. Every panel in this app has one. */
export const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** "3 minutes ago", and "never" for a rule that has not caught anything yet. */
export function since(at: number | null): string {
  if (at === null) {
    return "never";
  }
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

/** `1 time` / `4 times`, because "4 time" in a settings list is a tell. */
export const times = (count: number): string =>
  `${count} time${count === 1 ? "" : "s"}`;
