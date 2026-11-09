/**
 * The harness vocabulary everything in core sits on: which harnesses CawCo
 * runs, the permission modes and effort levels they take, the models they
 * report, and the `system` origins a send comes from. It imports no module
 * that could reach back up (only {@link everyOf}, which imports nothing).
 */

import { everyOf } from "../every-of";

/** Every harness, in the order a machine's are named and brought up: Claude Code first, which every machine runs. */
export const HARNESSES = ["claude", "opencode", "pi"] as const;

/** The harnesses cawco can spawn sessions on. Adding one is a new adapter. */
export type HarnessKind = (typeof HARNESSES)[number];

/** The harness a value off the wire, a URL or storage names, when it names one CawCo runs. */
export const harnessNamed = (value: unknown): HarnessKind | undefined =>
  HARNESSES.find((harness) => harness === value);

/** Every permission mode the wire may name ({@link PermissionMode}). */
export const WIRE_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
  "auto",
  "fullSend",
] as const;

/**
 * How a session answers tool permissions. The union is Claude Code's, plus
 * `fullSend`, CawCo's own: bypass, with every approval approved for the
 * session (the owner, 2026-10-22: "FULL SEND LITERALLY MEANS FULL SEND"):
 * on Claude Code the host answers the checks and ask rules the CLI still
 * raises in bypass, and on every harness the hub approves CawCo's admin
 * writes (hub asks.ts). A question to the person still asks; a
 * fleet-denied tool still never runs. Each adapter maps `fullSend` onto its
 * harness; none hands it to an SDK as is.
 */
export type PermissionMode = (typeof WIRE_PERMISSION_MODES)[number];

/**
 * The permission modes CawCo offers: the one list every machine reports for
 * each harness that has modes (agent claude.ts `CLAUDE_CAPABILITIES`,
 * opencode.ts `OPENCODE_CAPABILITIES`; pi has none), and so the one list
 * every tool schema and picker takes its modes from. Claude Code's
 * `dontAsk` and `auto` are not among them: no harness here is offered either.
 *
 * {@link PermissionMode} stays wider, as the wire names a mode: a CLI may
 * report `dontAsk` or `auto` as its mode, and the TestFlight builds still
 * installable (20261015 to 20261018) were built to send either (hub
 * scripts/wire-compat.ts). The hub refuses a start in one with the
 * machine's own list (hub launches.ts `modeRefusal`), and an agent refuses one
 * that reaches it ({@link offeredMode}).
 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
  "fullSend",
] as const satisfies readonly PermissionMode[];

export type OfferedMode = (typeof PERMISSION_MODES)[number];

/**
 * The modes one session may start or continue another in: every
 * {@link PERMISSION_MODES} but `fullSend`, which only the owner chooses. A
 * session in Full Send passes it on by naming none.
 */
export const SESSION_CHOSEN_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
] as const satisfies readonly OfferedMode[];

export type SessionChosenMode = (typeof SESSION_CHOSEN_MODES)[number];

/** `value` as an {@link OfferedMode}, when it is one CawCo offers. */
export const permissionModeNamed = (value: unknown): OfferedMode | undefined =>
  PERMISSION_MODES.find((mode) => mode === value);

/**
 * How hard the model thinks, and how much it spends doing it: Claude Code's
 * effort scale, in its own order. Hand-written rather than tunnelled from the
 * SDK — nothing in this file imports a harness SDK, and `@cawco/core` has no
 * dependencies at all — but it is the SDK's `EffortLevel` verbatim, so the
 * claude adapter hands it straight on.
 *
 * Effort is not only thinking depth. A lower level also buys fewer and more
 * consolidated tool calls, less preamble and terser confirmations; a higher one
 * spends tokens in all of those places. A harness with no such knob reports
 * `effort: false` rather than mapping onto this.
 */
// Written out, not indexed off the array: the apps' schema names it `EffortLevel`
// only while the union is written as one.
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Every {@link EffortLevel}, low to max: the one runtime list validators and pickers read. */
export const EFFORT_LEVELS = everyOf<EffortLevel>()([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/**
 * The effort a session actually sends, as its instance row records it: a level,
 * or {@link EFFORT_NONE} when it sends no effort parameter at all (a model
 * without effort, or effort switched off). A row with no value has not been
 * read yet.
 */
export const EFFORT_NONE = "none";

export type SessionEffort = EffortLevel | typeof EFFORT_NONE;

/** Whether a stored or wire value is one of the {@link EFFORT_LEVELS}. */
export const isEffortLevel = (value: unknown): value is EffortLevel =>
  EFFORT_LEVELS.includes(value as EffortLevel);

/**
 * The `system` origin name of the message a session went on from in a fresh
 * conversation of its own, in a hub from before it compacted natively: the
 * summary of the one before, the artifact index and its last turns. Its row,
 * stored history, folds under the `continued` line before it.
 */
export const CONTINUATION_ORIGIN = "continuation";

/**
 * The `system` origin name of the hub's own steps before a conversation is
 * made small or carried on (hub open-items.ts): the turn that files a
 * session's open items in its records, before the hub compacts it after a
 * move at its account's limit or before a person's Continue opens a new
 * session from it; and the `/compact` that follows such a move. A person's
 * Continue asked for it, so it may wake a session that was stopped; it
 * reopens no finished work.
 */
export const COMPACTION_ORIGIN = "compaction";

/**
 * The `system` origin name of the hub's word to a work item's session about
 * its open item (hub work-items.ts): a quiet turn's "still open", the sleep
 * sweep's wake, a declared wait's end. One its account's limit refused is
 * answered as a person's turn is (hub at-limit.ts `turnRefused`): moved to
 * an account with room, else held until the earliest reset.
 */
export const WORK_ITEM_ORIGIN = "work-item";

/**
 * The `system` origin name of the hub's word to a parent while its delegate
 * waits on the person, and of how that wait ended (hub delegate-waits.ts):
 * the hub's word about the delegate, never the delegate's own message, so a
 * send of it that fails tells no session it failed. It wakes a parent at
 * rest: the far end of the work the parent set going.
 */
export const DELEGATE_WAIT_ORIGIN = "delegate-wait";

/**
 * The `system` origin name of the hub's word on the person's acts on one of
 * the session's artifacts: their picks sent (core injected.ts
 * `artifactResponsesNotice`), which the session reads with its tools, and
 * their pins, replies, resolves and ink, delivered by themselves
 * (`artifactCommentsNotice`). It is the person's act, so it reaches the
 * session as their own words do ({@link byPerson}). Its row is the note
 * {@link ARTIFACT_RESPONSES}.
 */
export const ARTIFACT_ORIGIN = "artifact";

/**
 * The `system` origin name of the hub's word on the person's changes to a
 * plan (hub plan-changes.ts): each step they reworded, added, removed,
 * commented on, ticked or moved, in their words. It is the person's act, so
 * it reaches its session as their own words do ({@link byPerson}): into a
 * running turn at its next step, starting an idle one, reopening an ended
 * one.
 */
export const PLAN_ORIGIN = "plan";

/**
 * The `system` origin name of the hub's word on one of the person's acts
 * that carries none of their words and has no origin of its own: a project
 * made from a session's offer set up, a decision page's "I'm done picking",
 * its Make tasks. The hub writes what the act was in CawCo's words, and the
 * notice's `line` where it is made. It is the person's act, so it reaches its
 * session as their own words do ({@link byPerson}).
 */
export const ACT_ORIGIN = "act";

/* --------------------------------------------------------------- models — */

/** One model a harness offers. `value` is the wire id; `resolvedModel` the alias. */
export interface ModelInfo {
  /**
   * The tokens one request to the model may send, as the harness reports it:
   * opencode's provider `limit.input` where it gives one, else its
   * `limit.context`; pi's `Model.contextWindow`; and for claude the
   * `modelUsage` window the hub last observed. Absent means unknown — never a
   * guess.
   */
  contextWindow?: number;
  /**
   * The effort the CLI applies when a spawn omits effort, measured by the
   * harness. Null when the model takes none; absent when not measured.
   */
  defaultEffort?: EffortLevel | null;
  description?: string;
  displayName: string;
  /** ISO date the model was released, when the catalog source says. */
  released?: string;
  resolvedModel?: string;
  supportedEffortLevels?: EffortLevel[];
  supportsAdaptiveThinking?: boolean;
  supportsAutoMode?: boolean;
  /**
   * Whether this model has an effort scale, and which of its stops it reaches.
   * The pair is the *only* thing that decides what an effort control offers —
   * `xhigh` and `max` are model-dependent, and a hardcoded list of which models
   * have them is a list that is wrong by the next release.
   */
  supportsEffort?: boolean;
  supportsFastMode?: boolean;
  /**
   * Whether the model's thinking can be turned off, as Claude Code's model
   * list says (its initialize answer carries it; the Agent SDK's
   * `ModelInfo` does not name it yet).
   */
  supportsThinkingOff?: boolean;
  value: string;
}

/**
 * The `system` origin the answer is delivered under: the person's act (core
 * harness.ts `byPerson`), so it reaches the session as their words do, into
 * a running turn at its next step, starting one in a session at rest.
 */
export const ASK_ORIGIN = "ask";
