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

import { HARNESSES, type HarnessKind, harnessNamed } from "./kinds";

export interface HarnessTraits {
  /**
   * What a session's account is. `dir`: a place on disk, and the login moves
   * with its session (`~/.claude`, an account's config dir). `provider`: the
   * harness signs in to a provider; a session's account only picks whose
   * credential it uses.
   */
  readonly accountModel: "dir" | "provider";
  /** A model id on it may be bare, one unique among its providers' rows, and is read to its full id off the harness's report. */
  readonly bareModelIds: boolean;
  /** After a compaction's boundary the session may still report the compaction failed (hub server.ts `compactionFailedAfterBoundary`). */
  readonly boundaryBeforeCompactionFailure: boolean;
  /**
   * Whether a stored conversation missing from the machine's catalog is
   * gone: the catalog is the harness's whole store, read for one account's
   * sessions (hub db `settleInstances`).
   */
  readonly catalogProvesGone: boolean;
  /** Whether a session can start clean: none of the machine's fleet content. A harness that can't is refused, never started half clean. */
  readonly cleanStart: boolean;
  /** Whether the hub runs the compaction after an at-limit move (`compactBy`), rather than the harness's own CLI. */
  readonly compactedByHub: boolean;
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
  /** A session that names no model runs its harness's pick for its directory, asked first (hub server.ts `asksPiDefault`). */
  readonly defaultModelFromDirectory: boolean;
  /** Whether an idle session's prompt cache is kept warm by keep-alive turns: only a measured cache lifetime can be. */
  readonly keepAlive: boolean;
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
   * Which provider limit a session reads against. `account`: the account's
   * own windows. `go`: OpenCode Go's, for models under its prefix. `none`:
   * the harness reports none.
   */
  readonly providerLimit: "account" | "go" | "none";
  /** Whether a send it holds waits in the harness's own queue, and shows as queued. */
  readonly queuesSends: boolean;
  /** Whether a machine's context for a stored conversation can be read back (hub server.ts `CONTROL_READ_SESSION_CONTEXT`). */
  readonly readsStoredContext: boolean;
  /** Whether a machine with this harness missing fails the fleet's check: the one every machine runs, and that accounts sign in on. */
  readonly requiredOnEveryMachine: boolean;
  /**
   * Which row is the anchor of a rewind. `user-turn`: the selected user turn
   * itself. `assistant-before`: the assistant frame before it.
   */
  readonly rewindAnchor: "user-turn" | "assistant-before";
  /** A row can start with no conversation of its own and take one at its first send; until then it is never started, not ended. */
  readonly startsWithoutConversation: boolean;
  /** A session whose turns were not recorded is bounded by its last activity instead (hub server.ts `followupState`). */
  readonly unrecordedTurnsBoundByActivity: boolean;
  /** Whether a send still pending can be taken back from the harness's own queue (CLI's `withdrawSend`). */
  readonly withdrawSend: boolean;
}

const CLAUDE_TRAITS = {
  accountModel: "dir",
  bareModelIds: false,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: true,
  cleanStart: true,
  compactedByHub: false,
  contextWindow: "hub",
  costMeaning: "estimated",
  custody: "keeper",
  defaultModelFromDirectory: false,
  keepAlive: true,
  listsAllConversations: true,
  liveSkillReload: true,
  modelCatalog: "account",
  ownProviderIds: false,
  permissionModes: true,
  providerLimit: "account",
  queuesSends: true,
  readsStoredContext: true,
  requiredOnEveryMachine: true,
  rewindAnchor: "assistant-before",
  startsWithoutConversation: false,
  unrecordedTurnsBoundByActivity: true,
  withdrawSend: true,
} as const satisfies HarnessTraits;

const OPENCODE_TRAITS = {
  accountModel: "provider",
  bareModelIds: false,
  boundaryBeforeCompactionFailure: true,
  catalogProvesGone: false,
  cleanStart: false,
  compactedByHub: true,
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "server",
  defaultModelFromDirectory: false,
  keepAlive: false,
  listsAllConversations: false,
  liveSkillReload: false,
  modelCatalog: "machine",
  ownProviderIds: true,
  permissionModes: true,
  providerLimit: "go",
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  rewindAnchor: "user-turn",
  startsWithoutConversation: true,
  unrecordedTurnsBoundByActivity: false,
  withdrawSend: false,
} as const satisfies HarnessTraits;

const PI_TRAITS = {
  accountModel: "provider",
  bareModelIds: true,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: false,
  cleanStart: true,
  compactedByHub: true,
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "keeper",
  defaultModelFromDirectory: true,
  keepAlive: false,
  listsAllConversations: true,
  liveSkillReload: false,
  modelCatalog: "machine",
  ownProviderIds: false,
  permissionModes: false,
  providerLimit: "none",
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  rewindAnchor: "assistant-before",
  startsWithoutConversation: false,
  unrecordedTurnsBoundByActivity: false,
  withdrawSend: false,
} as const satisfies HarnessTraits;

/** Each harness's traits: the one table. */
export const HARNESS_TRAITS = {
  claude: CLAUDE_TRAITS,
  opencode: OPENCODE_TRAITS,
  pi: PI_TRAITS,
} as const satisfies Record<HarnessKind, HarnessTraits>;

/**
 * The traits of a name this build does not know, or of none: every question
 * answered as a compare with the name answers it, "not this harness". A
 * `dir` account, a server's custody or a capability is never claimed for it,
 * and a `!==` reads as true of it, as it always did.
 */
const UNKNOWN_TRAITS: HarnessTraits = {
  accountModel: "provider",
  bareModelIds: false,
  boundaryBeforeCompactionFailure: false,
  catalogProvesGone: false,
  cleanStart: true,
  compactedByHub: false,
  contextWindow: "catalog",
  costMeaning: "real",
  custody: "keeper",
  defaultModelFromDirectory: false,
  keepAlive: false,
  listsAllConversations: true,
  liveSkillReload: false,
  modelCatalog: "machine",
  ownProviderIds: false,
  permissionModes: true,
  providerLimit: "none",
  queuesSends: false,
  readsStoredContext: false,
  requiredOnEveryMachine: false,
  rewindAnchor: "assistant-before",
  startsWithoutConversation: false,
  unrecordedTurnsBoundByActivity: false,
  withdrawSend: false,
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
