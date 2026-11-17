/**
 * The harness vocabulary everything in core sits on: which harnesses CawCo
 * runs (the plugin registry), the permission modes and effort levels they
 * take, the models they report, and the `system` origins a send comes from.
 * It imports no module that could reach back up: the descriptors, which
 * import leaf modules alone, and {@link everyOf}, which imports nothing.
 */

import { everyOf } from "../every-of";
import { CLAUDE } from "./claude";
import type { HarnessDescriptor } from "./descriptor";
import { OPENCODE } from "./opencode";
import { PI } from "./pi";

/**
 * Every harness plugin's descriptor, in the order a machine's are named and
 * brought up: Claude Code first, which every machine runs. A new harness is
 * one descriptor here and one adapter (agent harnesses/index.ts); the
 * type-checker names every field and member either one is missing
 * (docs/harnesses.md).
 */
export const HARNESS_PLUGINS = [
  CLAUDE,
  OPENCODE,
  PI,
] as const satisfies readonly HarnessDescriptor[];

/** A registered plugin's descriptor. */
export type HarnessPlugin = (typeof HARNESS_PLUGINS)[number];

const [FIRST_PLUGIN, ...LATER_PLUGINS] = HARNESS_PLUGINS;

/** Every harness, by its plugin's kind, in {@link HARNESS_PLUGINS} order: never empty, as a schema's enum of them needs. */
export const HARNESSES = [
  FIRST_PLUGIN.kind,
  ...LATER_PLUGINS.map((plugin) => plugin.kind),
] as const;

/** The harnesses cawco can spawn sessions on: a registered plugin's kind. */
export type HarnessKind = (typeof HARNESSES)[number];

/** The descriptor of harness `K`, as its plugin wrote it. */
export type PluginOf<K extends HarnessKind> = Extract<
  HarnessPlugin,
  { kind: K }
>;

/** The harness a value off the wire, a URL or storage names, when it names one CawCo runs. */
export const harnessNamed = (value: unknown): HarnessKind | undefined =>
  HARNESSES.find((harness) => harness === value);

/** The descriptor of `kind`: what everything outside its plugin asks of it. */
export const descriptorOf = (kind: HarnessKind): HarnessPlugin => {
  for (const plugin of HARNESS_PLUGINS) {
    if (plugin.kind === kind) {
      return plugin;
    }
  }
  throw new Error(`No harness plugin is registered as ${kind}`);
};

/** What `kind` is called, as the operator knows it and a sentence names it. */
export const harnessName = (kind: HarnessKind): string =>
  descriptorOf(kind).words.name;

/** What a harness a row or a frame names is called: its name, or the value as it is when it names none this build runs. */
export const harnessLabel = (value: string): string => {
  const kind = harnessNamed(value);
  return kind ? harnessName(kind) : value;
};

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
  EFFORT_LEVELS.some((level) => level === value);

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

/**
 * One model a harness offers. `value` is the wire id; `resolvedModel` the alias.
 *
 * @socketFrame fromHub
 */
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
   * harness. Null when the model takes none; absent when not measured. The
   * harness's own word, held as a string: a level a later release adds must
   * not refuse the catalog, and a reader narrows with {@link isEffortLevel}.
   */
  defaultEffort?: string | null;
  description?: string;
  displayName: string;
  /** ISO date the model was released, when the catalog source says. */
  released?: string;
  resolvedModel?: string;
  /**
   * The effort levels the model takes, in the harness's own words (Claude
   * Code's model list): held as strings for the same reason as
   * `defaultEffort`, and narrowed with {@link isEffortLevel} where read.
   */
  supportedEffortLevels?: string[];
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
