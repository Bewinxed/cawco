/**
 * Delegate types: named presets a calling agent selects via the `delegate`
 * tool's `type` param, so routing is by description ("explore the codebase")
 * instead of a raw model string the caller has to already know. The hub owns
 * the fleet-wide set; a daemon resolves a name against it before it ever
 * builds a `SpawnPayload`.
 */

import { EFFORT_LEVELS, type EffortLevel } from "./harness";

/** One named preset. `name` is the key a `delegate` call's `type` asks for. */
export interface DelegateType {
  /**
   * Whether a delegate of this type may itself delegate (or start sessions)
   * when the `delegate` call did not say. `false` (and absent) means a leaf —
   * the same default a bare `delegate` call gets; `true` makes the type a
   * coordinator by default. An explicit `can_delegate` on the call still wins.
   */
  canDelegate?: boolean;
  denyTools?: string[];
  /** What the calling model reads to decide whether this is the right type. */
  description: string;
  /** How hard the model thinks: the same {@link EffortLevel} scale every other effort control uses. */
  effort?: EffortLevel;
  harness: "claude" | "opencode" | "pi";
  model: string;
  /** Unique across the fleet; what a `delegate` call's `type` param names. */
  name: string;
  skills?: string[];
}

/** What a name may be. Mirrors a subagent's own `AGENT_NAME` — no reason to invent a second rule. */
export const DELEGATE_TYPE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Why this row cannot be stored, in a sentence, or nothing when it can. One
 * rule for the hub's refusal and any editor built on top of it.
 */
export const delegateTypeProblem = (
  draft: Partial<DelegateType>
): string | undefined => {
  if (!(draft.name && DELEGATE_TYPE_NAME.test(draft.name))) {
    return "a delegate type needs a name: lowercase letters, digits and hyphens only";
  }
  if (!draft.description?.trim()) {
    return "a delegate type needs a description — it is the whole of how the calling model routes to it";
  }
  if (
    !(draft.harness && ["claude", "opencode", "pi"].includes(draft.harness))
  ) {
    return `“${draft.harness}” is not a harness a delegate type can run on`;
  }
  if (!draft.model?.trim()) {
    return "a delegate type needs a model";
  }
  if (draft.effort && !EFFORT_LEVELS.includes(draft.effort)) {
    return `“${draft.effort}” is not an effort level`;
  }
  // denyTools is enforced by the claude adapter alone — it writes into the
  // spawned session's own settings.deny, the mechanism opencode and pi have
  // no equivalent of. A type that names denyTools on another harness would
  // store a promise nothing enforces, which is worse than refusing it here.
  if (draft.denyTools?.length && draft.harness !== "claude") {
    return `denyTools only applies to the claude harness — “${draft.harness}” cannot enforce it`;
  }
  return undefined;
};

/**
 * The fleet's seed set (inserted once, only when the table is empty): one type
 * per effort level, each description saying which tasks that level fits, so a
 * caller routes by how much verification and judgement the work needs.
 */
export const DEFAULT_DELEGATE_TYPES: DelegateType[] = [
  {
    name: "low",
    description:
      "Fastest pass: the leaf does what the brief says, checks it against a case or two, and stops. Use it when the brief leaves nothing to decide or you want a draft to react to: mechanical edits across many files (renames, copy or config sweeps, a listed set of replacements), inventories and where-is sweeps, log and evidence pulls, quick sketches and prototypes. Not for bug fixes, reviews, security, parsers, migrations, or anything where a missed edge case ships.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "low",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "medium",
    description:
      "The default for most delegated work: carrying out a complete spec (new features, multi-file changes, UI built from a spec, doc rewrites, deploys with known steps) and wide research sweeps that return a cited report. It runs the brief's build, lint, type-check and verification command, but does not hunt edge cases beyond the brief. Given a complete spec, the higher levels write much the same code more slowly and add assumptions of their own. Not for bugs with an unknown cause, reviews, verification passes, or security: use `high`.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "medium",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "high",
    description:
      "For work where verification and hidden edge cases decide the result: fixing a bug in an existing codebase, reviewing a diff into ranked file:line findings, the verification pass after a `low` or `medium` build, browser verification of a flow, a security review of a change, and performance work. Also architecture plans and analyses where the method chosen changes the answer. Takes about 1.5–3x as long as `medium`. Code whose edge cases are the whole job goes to `xhigh`. More effort does not fix a wrong approach: rewrite the brief instead.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "high",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "xhigh",
    description:
      "Between `high` and `max`, for code whose edge cases are the whole job and where one missed case ships as a defect: sanitizers, parsers, storage engines, concurrency, auth, data migrations, or a fix `high` got only partly right. In Anthropic's storage-engine bug task the xhigh runs reproduced the crash before editing and went from 0/5 at low to 4/5, at about 11 min a run. It stays on one problem, so it costs far less than `max`. Not for spec-complete builds (`medium`) or ordinary reviews (`high`).",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "xhigh",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "max",
    description:
      "For long, fully autonomous runs on hard problems: building and verifying a whole app or subsystem end to end, a vulnerability hunt in critical code, or a problem an `xhigh` leaf failed on by missing edge cases. The slowest and most expensive level by far (one spec'd build took 79 min at max against 22 at medium), and the one that makes the most assumptions on your behalf, so the brief must settle every product decision. Not for routine features, work you plan to iterate on, or a leaf that took the wrong approach.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "max",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
];
