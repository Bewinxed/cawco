import type { HarnessKind } from "./harness";

/**
 * Rules: standing instructions the hub enforces on every session, without the
 * model's cooperation and without touching any harness's own hook system.
 *
 * The hub already watches every frame from every machine on its way to the
 * dashboards, so it is the one place that can read what a session said and
 * answer it. A rule is a phrase to watch for and a sentence to send back when
 * it shows up.
 *
 * The session receives the reply exactly as the operator wrote it and
 * acknowledges it the way it would any message from the operator: by answering
 * and acting on it. A fired rule is *pending* until a later turn of that
 * session ends without matching it again; then it re-arms. A rule set to
 * {@link Rule.repeat} fires again on every later match, so a session that keeps
 * the habit keeps hearing about it, up to {@link RULE_FIRE_CEILING} in a row.
 */

/**
 * How {@link Rule.pattern} is read.
 *
 * - `phrase` / `regex` — text to find in what the session said.
 * - `meaning` — a yes/no question the hub puts to TypeSafe's Jev (through
 *   OpenRouter) about what the session said; the rule fires when the answer
 *   is yes. Decided by the hub asynchronously, so nothing here matches it.
 */
export type RuleMatchKind = "phrase" | "regex" | "meaning";

/** Which part of the session's output a rule reads. */
export type RuleWatch = "text" | "thinking" | "both";

/**
 * When the reply is delivered.
 *
 * - `turn` — the session has stopped and is idle, so the reply wakes it into a
 *   new turn. This is the one that makes a session keep working.
 * - `message` — queued the moment the assistant message that matched is
 *   complete; the session reads it at the next turn boundary without being
 *   interrupted.
 * - `immediate` — sent the moment the phrase appears mid-stream, optionally
 *   interrupting the turn in flight ({@link Rule.interrupt}).
 */
export type RuleTiming = "turn" | "message" | "immediate";

/**
 * What starts a rule's evaluation.
 *
 * - `pattern` — the phrase/regex match this file has always done: a rule
 *   fires when {@link Rule.pattern} shows up.
 * - `every-turn` — there is nothing to match; every turn end is itself the
 *   trigger. Only the supervisor can act on that (see {@link RuleAction}),
 *   since nothing about the turn has been read yet to answer with a fixed
 *   reply.
 */
export type RuleTrigger = "pattern" | "every-turn";

/**
 * What a firing rule does.
 *
 * - `reply` — send {@link Rule.reply}, verbatim, the way every rule has
 *   always fired.
 * - `llm` — hand the turn to the supervisor and send back whatever it
 *   decides. Only fires at the `turn` timing (the supervisor judges a
 *   finished turn, not a half-typed message) and never repeats a fixed
 *   reply (it decides fresh every time).
 */
export type RuleAction = "reply" | "llm";

/**
 * What narrows a rule from "every session on the fleet" to some of them. Every
 * field is optional and they are ANDed; an empty scope is the default and means
 * everywhere. `model` is a substring test, so `opus` covers every dated build
 * of it.
 */
export interface RuleScope {
  harness?: HarnessKind;
  machineId?: string;
  model?: string;
  projectId?: string;
}

/** The instance facts a {@link RuleScope} is tested against. */
export interface RuleFacts {
  harness: string | null;
  machineId: string;
  model: string | null;
  projectId: string | null;
}

/** One standing instruction. */
export interface Rule {
  /** What the rule does when it fires. Default `'reply'` — the only kind before this existed. */
  action: RuleAction;
  caseSensitive: boolean;
  createdAt: number;
  enabled: boolean;
  id: string;
  /** `immediate` only: cut into the running turn rather than queueing. */
  interrupt: boolean;
  matchKind: RuleMatchKind;
  /** What the rule is called in the list, and in the reply the session reads. */
  name: string;
  /** The phrase to watch for, a regular expression, or a yes/no question, as `matchKind` says. */
  pattern: string;
  /** `action: 'llm'` only: the operator's standing instructions for the supervisor. */
  prompt: string | null;
  /**
   * Fire again on every later match. Off makes the rule fire once per session
   * and then go quiet.
   */
  repeat: boolean;
  /** What the session is sent when the rule fires. Ignored (and not required) when `action` is `'llm'`. */
  reply: string;
  scope: RuleScope;
  timing: RuleTiming;
  /** What starts the evaluation. Default `'pattern'` — every rule before this existed. */
  trigger: RuleTrigger;
  watch: RuleWatch;
  /** Phrase mode only: refuse matches that sit inside a longer word. */
  wholeWord: boolean;
}

/** A rule as it arrives from the dashboard, before the hub gives it an id. */
export type RuleDraft = Omit<Rule, "id" | "createdAt">;

/** Where one rule stands with one session. */
export interface RuleState {
  /** When a turn last ended without matching the rule again, re-arming it. */
  ackedAt: number | null;
  /** Fires in a row, each in a turn that matched again. Stops at {@link RULE_FIRE_CEILING}. */
  fireCount: number;
  instanceId: string;
  lastFiredAt: number | null;
  ruleId: string;
  /** `pending` means fired, and no turn has since ended without matching it. */
  status: "armed" | "pending";
  /** Fires over the session's whole life, which re-arming does not reset. */
  totalFires: number;
}

/** What the list needs to show about a rule without loading every session's state. */
export interface RuleStats {
  lastFiredAt: number | null;
  /** Sessions that fired this rule and have not yet finished a turn without it. */
  pending: number;
  ruleId: string;
  /** Every fire, ever. */
  totalFires: number;
}

/** A rule plus what it has been doing. */
export interface RuleRow extends Rule {
  stats: RuleStats;
}

/** How long a body of text a rule will read. Longer than this and it reads the tail. */
export const RULE_SCAN_LIMIT = 200_000;

/** The most times in a row a rule fires on one session before the hub goes quiet for it. */
export const RULE_FIRE_CEILING = 10;

const RESERVED = /[.*+?^${}()|[\]\\]/g;
const INVALID_REGEX_PREFIX = /^Invalid regular expression:\s*/;
const escapeForRegex = (text: string): string => text.replace(RESERVED, "\\$&");

/**
 * The matcher, shared deliberately: the hub decides with it and the editor's
 * test box previews with it, so what the editor shows is what the fleet does.
 * Returns undefined for a pattern that cannot compile — {@link ruleProblem}
 * is what explains why.
 */
export function ruleRegex(
  rule: Pick<Rule, "pattern" | "matchKind" | "caseSensitive" | "wholeWord">
): RegExp | undefined {
  const flags = rule.caseSensitive ? "g" : "gi";
  let body: string;
  if (rule.matchKind === "regex") {
    body = rule.pattern;
  } else if (rule.wholeWord) {
    body = `\\b${escapeForRegex(rule.pattern)}\\b`;
  } else {
    body = escapeForRegex(rule.pattern);
  }
  try {
    return new RegExp(body, flags);
  } catch {
    return undefined;
  }
}

/** Every place `rule` hits `text`, as offsets — the test box highlights these. */
export function ruleHits(
  rule: Pick<Rule, "pattern" | "matchKind" | "caseSensitive" | "wholeWord">,
  text: string
): { start: number; end: number }[] {
  // A meaning rule's pattern is a question for Jev, not text to find.
  if (rule.matchKind === "meaning" || rule.pattern.trim() === "") {
    return [];
  }
  const expression = ruleRegex(rule);
  if (!expression) {
    return [];
  }
  const read =
    text.length > RULE_SCAN_LIMIT ? text.slice(-RULE_SCAN_LIMIT) : text;
  const found: { start: number; end: number }[] = [];
  const offset = text.length - read.length;
  for (const match of read.matchAll(expression)) {
    if (match.index === undefined) {
      continue;
    }
    // A zero-width pattern matches everywhere and highlights nothing; treating
    // it as no match is kinder than freezing the editor on every keystroke.
    if (match[0] === "") {
      continue;
    }
    found.push({
      start: offset + match.index,
      end: offset + match.index + match[0].length,
    });
    if (found.length >= 500) {
      break;
    }
  }
  return found;
}

/** Whether `rule` fires on `text` at all. */
export const ruleMatches = (
  rule: Pick<Rule, "pattern" | "matchKind" | "caseSensitive" | "wholeWord">,
  text: string
): boolean => ruleHits(rule, text).length > 0;

/**
 * The shortest an LLM rule's prompt (or an autopilot standing prompt) can be
 * and still count as an instruction rather than noise — under ten characters
 * is not a sentence.
 */
const MIN_LLM_PROMPT = 10;

/** The shortest a meaning rule's question can be and still be a question. */
const MIN_MEANING_QUESTION = 10;

/**
 * Everything wrong with a draft, as whole sentences the form can print under
 * the field that caused it. Empty means it is safe to save.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates a draft against every trigger/action/matchKind combination the form allows — the hub's own gate before a rule starts firing on live sessions.
export function ruleProblem(draft: Partial<RuleDraft>): Record<string, string> {
  const wrong: Record<string, string> = {};
  if (!draft.name?.trim()) {
    wrong.name = "Give the rule a name so you can recognise it later.";
  }

  const trigger = draft.trigger ?? "pattern";
  const action = draft.action ?? "reply";

  // `every-turn` has nothing to match against — a fixed reply cannot answer a
  // turn it never read, so only the supervisor can be behind it.
  if (trigger === "every-turn" && action !== "llm") {
    wrong.trigger =
      "An every-turn rule has nothing to match, so only the supervisor can act on it — set the action to LLM.";
  }

  if (trigger === "pattern") {
    const pattern = draft.pattern ?? "";
    if (pattern.trim() === "") {
      wrong.pattern = "A rule needs something to watch for.";
    } else if (draft.matchKind === "meaning") {
      if (pattern.trim().length < MIN_MEANING_QUESTION) {
        wrong.pattern =
          "Ask a whole yes-or-no question — that is too short to be one.";
      }
      if (draft.timing === "immediate") {
        wrong.timing =
          "A meaning rule is answered about a finished message or turn, so it cannot fire mid-stream — pick message or turn.";
      }
    } else if (draft.matchKind === "regex") {
      try {
        const compiled = new RegExp(pattern);
        if (compiled.test("")) {
          wrong.pattern =
            "This expression matches empty text, so it would fire on every message.";
        }
      } catch (error) {
        wrong.pattern = `That is not a valid regular expression — ${
          error instanceof Error
            ? error.message.replace(INVALID_REGEX_PREFIX, "")
            : "it will not compile"
        }.`;
      }
    } else if (pattern.trim().length < 3) {
      wrong.pattern =
        "Two characters will match almost everything. Watch for something longer.";
    }
  }

  if (action === "reply" && !draft.reply?.trim()) {
    wrong.reply = "Write what the session should be told when this fires.";
  }

  if (action === "llm") {
    if (draft.timing !== undefined && draft.timing !== "turn") {
      wrong.timing =
        "The supervisor judges a finished turn, not a message in progress — an LLM rule only fires at the turn boundary.";
    }
    if ((draft.prompt ?? "").trim().length < MIN_LLM_PROMPT) {
      wrong.prompt =
        "Tell the supervisor what to watch for and how to respond — that is too short to be an instruction.";
    }
    if (draft.repeat) {
      wrong.repeat =
        "The supervisor decides fresh at every turn end — there is no fixed reply to repeat.";
    }
  }

  if (draft.timing !== "immediate" && draft.interrupt) {
    wrong.interrupt =
      "Only an immediate rule can interrupt — the other two wait for a boundary.";
  }
  return wrong;
}

/** What a pattern rule watches for, as the object of {@link ruleSentence}. */
function watchedFor(rule: Partial<RuleDraft>): string {
  if (rule.matchKind === "meaning") {
    return `something where the answer to “${rule.pattern || "…"}” is yes`;
  }
  if (rule.matchKind === "regex") {
    // Quoted like a phrase is: an expression set loose in the middle of a
    // sentence has no visible end, and `|` reads as prose punctuation.
    return `something matching “${rule.pattern || "…"}”`;
  }
  return `“${rule.pattern || "…"}”`;
}

/**
 * The rule read back as one English sentence. The editor prints it live above
 * the form, so the thing being configured stays legible while it is configured.
 */
export function ruleSentence(rule: Partial<RuleDraft>): string {
  const narrowing: string[] = [];
  if (rule.scope?.harness) {
    narrowing.push(`${rule.scope.harness} sessions`);
  }
  if (rule.scope?.model) {
    narrowing.push(`models matching ${rule.scope.model}`);
  }
  if (rule.scope?.projectId) {
    narrowing.push("one project");
  }
  if (rule.scope?.machineId) {
    narrowing.push("one machine");
  }
  const scope = narrowing.length ? ` In ${narrowing.join(" and ")} only.` : "";

  if (rule.trigger === "every-turn") {
    // Nothing is matched — every turn end is the trigger, and only the
    // supervisor can be behind that (ruleProblem refuses any other action).
    return `At the end of every turn, ask the supervisor to judge it and reply as it decides.${scope}`;
  }

  let where: string;
  if (rule.watch === "thinking") {
    where = "thinks";
  } else if (rule.watch === "both") {
    where = "says or thinks";
  } else {
    where = "says";
  }
  const what = watchedFor(rule);

  if (rule.action === "llm") {
    // Illegal to pair with anything but `timing: 'turn'`, so the wake-into-a-
    // new-turn phrasing is the only one that ever applies here.
    return `When a session ${where} ${what}, wait for the turn to end, then ask the supervisor to judge it and reply as it decides.${scope}`;
  }

  let when: string;
  if (rule.timing === "immediate") {
    when = rule.interrupt
      ? "interrupt it straight away and send"
      : "send, without waiting for the message to finish";
  } else if (rule.timing === "message") {
    when = "wait for that message to finish, then send";
  } else {
    when = "wait for the turn to end, then wake it with";
  }
  const nag = rule.repeat
    ? " It fires again every time it matches."
    : " It fires once per session.";
  return `When a session ${where} ${what}, ${when} your reply.${scope}${nag}`;
}

/**
 * Starting points offered on the empty state. The first is the one this whole
 * feature was built for.
 */
export const RULE_TEMPLATES: {
  title: string;
  blurb: string;
  draft: RuleDraft;
}[] = [
  {
    title: "Honest caveat",
    blurb: "Catches a session reporting a known problem instead of fixing it.",
    draft: {
      name: "Honest caveat",
      enabled: true,
      trigger: "pattern",
      pattern: "honest caveat",
      matchKind: "phrase",
      caseSensitive: false,
      wholeWord: false,
      watch: "text",
      action: "reply",
      reply:
        "if there's an honest caveat that you are aware of and you're just reporting it to the user instead of fixing it, then your work is not done yet",
      prompt: null,
      timing: "turn",
      interrupt: false,
      repeat: true,
      scope: {},
    },
  },
  {
    title: "Placeholder code",
    blurb: "Catches a stub left behind where an implementation was asked for.",
    draft: {
      name: "Placeholder code",
      enabled: true,
      trigger: "pattern",
      pattern: "for (now|brevity)|placeholder|TODO: implement|stub(bed)? out",
      matchKind: "regex",
      caseSensitive: false,
      wholeWord: false,
      watch: "text",
      action: "reply",
      reply:
        "You left a placeholder. Go back and write the real implementation, or tell me exactly what is blocking you from writing it.",
      prompt: null,
      timing: "turn",
      interrupt: false,
      repeat: true,
      scope: {},
    },
  },
  {
    title: "Unverified claim",
    blurb: 'Catches "should work" before anything was actually run.',
    draft: {
      name: "Unverified claim",
      enabled: true,
      trigger: "pattern",
      pattern: "should (work|be fine)|probably works|I believe (this|it) works",
      matchKind: "regex",
      caseSensitive: false,
      wholeWord: false,
      watch: "text",
      action: "reply",
      reply:
        "You said it should work. Run it and report what actually happened, with the output.",
      prompt: null,
      timing: "turn",
      interrupt: false,
      repeat: true,
      scope: {},
    },
  },
];

/**
 * Whether a scope covers a session with these facts — the check both engines
 * make before a matched rule is allowed to fire, so a rule scoped to one
 * machine or one model stays quiet everywhere else. Every field is ANDed; an
 * empty scope matches everything.
 */
export function ruleInScope(scope: RuleScope, facts: RuleFacts): boolean {
  if (scope.machineId && scope.machineId !== facts.machineId) {
    return false;
  }
  if (scope.projectId && scope.projectId !== facts.projectId) {
    return false;
  }
  if (scope.harness && scope.harness !== facts.harness) {
    return false;
  }
  // Substring, so `opus` covers every dated build of it and the user does
  // not have to keep the filter in step with model releases.
  if (
    scope.model &&
    !facts.model?.toLowerCase().includes(scope.model.toLowerCase())
  ) {
    return false;
  }
  return true;
}

/**
 * The first line of every message a rule sends, followed by a blank line:
 * `[Rule: <name>]`. Storage strips a message's origin, so this line is what
 * lets a transcript read back off disk render the message as the rule that
 * sent it rather than as the reader's own turn. Hub and dashboard share it.
 */
export const ruleMarker = (name: string): string => `[Rule: ${name}]\n\n`;

const RULE_MARKER = /^\[Rule: (.+?)\]\n\n/;

/**
 * A rule message read back into its rule's name and the reply itself, with the
 * marker line dropped. Null when the text does not open with {@link ruleMarker}.
 */
export function parseRuleMarker(
  text: string
): { name: string; body: string } | null {
  const marker = RULE_MARKER.exec(text);
  if (!marker) {
    return null;
  }
  return {
    name: marker[1],
    body: text.slice(marker[0].length).trim(),
  };
}
