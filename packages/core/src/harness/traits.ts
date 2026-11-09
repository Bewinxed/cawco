/**
 * What each harness is, one table: the per-kind facts the hub, core and the
 * dashboard need, which only ever know a {@link HarnessKind}. A fact that
 * varies by machine is a capability (`HarnessCapabilities`, reported by each
 * machine's own adapter); one fixed by what the harness is sits here, so an
 * older daemon on the far end changes nothing.
 *
 * Read a harness's traits through {@link traitsOf}, whatever the type of its
 * name says: a stored row and a frame off the wire can name a harness this
 * build does not know, and a compare with its name read that as "not this
 * one", never as a failure ({@link UNKNOWN_TRAITS}).
 */

import { HOUR_MS } from "../time";
import { harnessWords } from "../words/harness";
import { HARNESSES, type HarnessKind, harnessNamed } from "./kinds";

export interface HarnessTraits {
  /**
   * Whether a session runs in its account's own config dir, which holds the
   * account's login and its conversations: a launch picks the dir, a session
   * that changes account has its conversation carried to the new one, and
   * the machine reports each dir's sign-in. Without one, an account is a
   * credential the harness is handed, and a session's model picks which.
   */
  readonly accountDir: boolean;
  /** After a compaction's boundary the session may still report the compaction failed (hub compaction.ts `compactionFailedAfterBoundary`). */
  readonly boundaryBeforeCompactionFailure: boolean;
  /**
   * Whether a stored conversation missing from the machine's catalog is
   * gone: the catalog is the harness's whole store, read for one account's
   * sessions (hub db `settleInstances`).
   */
  readonly catalogProvesGone: boolean;
  /**
   * Why a session of it can't start clean (none of the machine's fleet
   * content), in the words it is refused with; null when one can. A harness
   * that can't is refused, never started half clean.
   */
  readonly cleanStartRefused: string | null;
  /**
   * Where a model's context window comes from. `hub`: the hub learns it from
   * the harness's results (Claude Code's `modelUsage`). `catalog`: the
   * harness's model list carries it.
   */
  readonly contextWindow: "hub" | "catalog";
  /**
   * Whether a session's cost is its real spend, or an estimate at API prices
   * of work a plan may already cover.
   */
  readonly costMeaning: "estimated" | "real";
  /**
   * How a session outlives the agent. `keeper`: its process is the keeper's
   * child. `server`: it lives in a server that outlives the agent, and so
   * proves no absence by not being listed.
   */
  readonly custody: "keeper" | "server";
  /**
   * What the machine's own sign-in to it is, the one CawCo can move into an
   * account. `dir`: one login, its whole home config dir (`~/.claude`).
   * `credentials`: a store holding a credential per provider.
   */
  readonly homeLogin: "dir" | "credentials";
  /** Whether a machine's listing names every conversation it holds, so one it doesn't name is gone; a filtered listing proves nothing by leaving one out. */
  readonly listsAllConversations: boolean;
  /** Whether a live session reloads its skills and reinitializes in place (hub server.ts: these are Claude Code's `Query` methods). */
  readonly liveSkillReload: boolean;
  /**
   * Where a harness's model list comes from. `account`: read per account by
   * the hub. `machine`: the machine's own report.
   */
  readonly modelCatalog: "account" | "machine";
  /** Whether it names providers by ids of its own ({@link accountProviderIds}, core accounts.ts). */
  readonly ownProviderIds: boolean;
  /** Whether it takes a permission mode at all. */
  readonly permissionModes: boolean;
  /**
   * The longest its prompt cache lives after a request, for a harness whose
   * results report the cache's use; null for one whose don't. The hub times
   * an idle session's cache from those reports and keeps it warm with
   * keep-alive turns; a session with no measurement, or no recorded turn,
   * reads its cache as expired at the latest this long after its last
   * activity.
   */
  readonly promptCacheMaxMs: number | null;
  /**
   * Which provider limit a session reads against. `account`: the account's
   * own windows. `go`: OpenCode Go's, for models under its prefix. `none`:
   * the harness reports none.
   */
  readonly providerLimit: "account" | "go" | "none";
  /**
   * Whether a send handed to a busy session waits in the harness's own queue
   * until the session reads it: it shows as queued, and can be taken back
   * while it waits. Without one, a session stores a send as it is handed it.
   */
  readonly queuesSends: boolean;
  /** Whether a machine's context for a stored conversation can be read back (hub server.ts `CONTROL_READ_SESSION_CONTEXT`). */
  readonly readsStoredContext: boolean;
  /** Whether a machine with this harness missing fails the fleet's check: the one every machine runs, and that accounts sign in on. */
  readonly requiredOnEveryMachine: boolean;
  /**
   * Whether it resolves a model name to `provider/id` itself, on each
   * machine: a bare id (one unique among its providers' rows) by the
   * machine's report of its resolution, and no model or `default` by its
   * pick in the session's directory, asked of the machine at the start.
   */
  readonly resolvesModelNames: boolean;
  /**
   * Which row is the anchor of a rewind. `user-turn`: the selected user turn
   * itself. `assistant-before`: the assistant frame before it.
   */
  readonly rewindAnchor: "user-turn" | "assistant-before";
  /**
   * The one provider every account of it is of, or null when a session's
   * model names its provider.
   */
  readonly soleProvider: string | null;
  /** A row can start with no conversation of its own and take one at its first send; until then it is never started, not ended. */
  readonly startsWithoutConversation: boolean;
}

const CLAUDE_TRAITS = {
  accountDir: true,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: true,
  cleanStartRefused: null,
  contextWindow: "hub",
  costMeaning: "estimated",
  custody: "keeper",
  homeLogin: "dir",
  listsAllConversations: true,
  liveSkillReload: true,
  modelCatalog: "account",
  ownProviderIds: false,
  permissionModes: true,
  promptCacheMaxMs: HOUR_MS,
  providerLimit: "account",
  queuesSends: true,
  readsStoredContext: true,
  requiredOnEveryMachine: true,
  resolvesModelNames: false,
  rewindAnchor: "assistant-before",
  soleProvider: "anthropic",
  startsWithoutConversation: false,
} as const satisfies HarnessTraits;

const OPENCODE_TRAITS = {
  accountDir: false,
  boundaryBeforeCompactionFailure: true,
  catalogProvesGone: false,
  cleanStartRefused: harnessWords.openCodeNotClean,
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "server",
  homeLogin: "credentials",
  listsAllConversations: false,
  liveSkillReload: false,
  modelCatalog: "machine",
  ownProviderIds: true,
  permissionModes: true,
  promptCacheMaxMs: null,
  providerLimit: "go",
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  resolvesModelNames: false,
  rewindAnchor: "user-turn",
  soleProvider: null,
  startsWithoutConversation: true,
} as const satisfies HarnessTraits;

const PI_TRAITS = {
  accountDir: false,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: false,
  cleanStartRefused: null,
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "keeper",
  homeLogin: "credentials",
  listsAllConversations: true,
  liveSkillReload: false,
  modelCatalog: "machine",
  ownProviderIds: false,
  permissionModes: false,
  promptCacheMaxMs: null,
  providerLimit: "none",
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  resolvesModelNames: true,
  rewindAnchor: "assistant-before",
  soleProvider: null,
  startsWithoutConversation: false,
} as const satisfies HarnessTraits;

/** Each harness's traits: the one table. */
const HARNESS_TRAITS = {
  claude: CLAUDE_TRAITS,
  opencode: OPENCODE_TRAITS,
  pi: PI_TRAITS,
} as const satisfies Record<HarnessKind, HarnessTraits>;

/**
 * The traits of a name this build does not know, or of none: every question
 * answered as a compare with the name answers it, "not this harness". An
 * account dir, a server's custody or a capability is never claimed for it,
 * and a `!==` reads as true of it, as it always did.
 */
const UNKNOWN_TRAITS: HarnessTraits = {
  // Nothing claimed of it.
  accountDir: false,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: false,
  cleanStartRefused: null,
  liveSkillReload: false,
  ownProviderIds: false,
  promptCacheMaxMs: null,
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  resolvesModelNames: false,
  soleProvider: null,
  startsWithoutConversation: false,
  // What a compare with a name it isn't answered.
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "keeper",
  homeLogin: "credentials",
  listsAllConversations: true,
  modelCatalog: "machine",
  permissionModes: true,
  providerLimit: "none",
  rewindAnchor: "assistant-before",
};

/** The traits of `harness`, a kind or whatever a row or a frame says one is. */
export const traitsOf = (harness: unknown): HarnessTraits => {
  const named = harnessNamed(harness);
  return named ? HARNESS_TRAITS[named] : UNKNOWN_TRAITS;
};

/** Every kind a trait holds of, in {@link HARNESSES} order: for a query that filters on a column. */
export const harnessesWith = (
  holds: (traits: HarnessTraits) => boolean
): HarnessKind[] => HARNESSES.filter((kind) => holds(HARNESS_TRAITS[kind]));

/** The kinds whose sessions are a keeper's children, per the table. */
export type KeeperHarnessKind = {
  [K in HarnessKind]: (typeof HARNESS_TRAITS)[K]["custody"] extends "keeper"
    ? K
    : never;
}[HarnessKind];
