/** A rule draft as a sentence. */

import type { RuleDraft } from "../rules";

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
  if (rule.scope?.role) {
    narrowing.push(`${rule.scope.role} sessions`);
  }
  if (rule.scope?.delegateType) {
    narrowing.push(`${rule.scope.delegateType} delegates`);
  }
  const scope = narrowing.length ? ` In ${narrowing.join(" and ")} only.` : "";

  let where: string;
  if (rule.watch === "thinking") {
    where = "thinks";
  } else if (rule.watch === "both") {
    where = "says or thinks";
  } else {
    where = "says";
  }
  const what = watchedFor(rule);

  let when: string;
  if (rule.timing === "immediate") {
    when = "send, without waiting for the message to finish";
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
