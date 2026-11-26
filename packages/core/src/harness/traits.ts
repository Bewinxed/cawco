/**
 * Reading what a harness is from its plugin's descriptor (./descriptor.ts,
 * registered in ./kinds.ts `HARNESS_PLUGINS`), for the hub, core and the
 * dashboard, which only ever know a {@link HarnessKind}. A fact that varies
 * by machine is a capability (`HarnessCapabilities`, reported by each
 * machine's own adapter); one fixed by what the harness is sits in its
 * descriptor, so an older daemon on the far end changes nothing.
 *
 * Read a harness's traits through {@link traitsOf}, whatever the type of its
 * name says: a stored row and a frame off the wire can name a harness this
 * build does not know, and a compare with its name read that as "not this
 * one", never as a failure ({@link UNKNOWN_TRAITS}).
 */

import { IMAGE_MEDIA_TYPES } from "../attachments";
import type { HarnessDescriptor, HarnessHomeLogin } from "./descriptor";
import {
  descriptorOf,
  HARNESSES,
  type HarnessKind,
  type HarnessPlugin,
  harnessNamed,
  type PluginOf,
} from "./kinds";
import {
  COMMANDS_UNASKED_MODES,
  type OfferedMode,
  SHARED_MODES,
} from "./modes";

/**
 * The facts a stored row or a frame's harness name is read for, whatever
 * build wrote it: a descriptor's plain answers, which a name this build does
 * not know answers too ({@link UNKNOWN_TRAITS}).
 */
export type HarnessTraits = HarnessHomeLogin &
  Pick<
    HarnessDescriptor,
    | "accountDir"
    | "boundaryBeforeCompactionFailure"
    | "catalogProvesGone"
    | "cleanStartRefused"
    | "contextWindow"
    | "costMeaning"
    | "custody"
    | "listsAllConversations"
    | "mcpPerFolder"
    | "modelCatalog"
    | "ownProviderIds"
    | "permissionModes"
    | "pictureTypes"
    | "promptCacheMaxMs"
    | "providerLimit"
    | "queuesSends"
    | "readsStoredContext"
    | "readsThroughCli"
    | "requiredOnEveryMachine"
    | "resolvesModelNames"
    | "rewindAnchor"
    | "sessionControls"
    | "startsWithoutConversation"
    | "subagentEndsWithCall"
  >;

/**
 * The traits of a name this build does not know, or of none: every question
 * answered as a compare with the name answers it, "not this harness". An
 * account dir, a server's custody or a capability is never claimed for it,
 * and a `!==` reads as true of it, as it always did. Each line says which of
 * the two its value is.
 */
const UNKNOWN_TRAITS: HarnessTraits = {
  accountDir: false, // nothing claimed
  homeLogin: "credentials", // as a compare with a name it isn't
  soleProvider: null, // nothing claimed
  ownProviderIds: false, // nothing claimed
  pictureTypes: IMAGE_MEDIA_TYPES, // as a compare with a name it isn't
  providerLimit: "none", // as a compare with a name it isn't
  costMeaning: "real", // as a compare with a name it isn't
  modelCatalog: "machine", // as a compare with a name it isn't
  resolvesModelNames: false, // nothing claimed
  contextWindow: "catalog", // as a compare with a name it isn't
  cleanStartRefused: null, // nothing claimed
  permissionModes: SHARED_MODES, // as a compare with a name it isn't
  requiredOnEveryMachine: false, // nothing claimed
  startsWithoutConversation: false, // nothing claimed
  custody: "keeper", // as a compare with a name it isn't
  listsAllConversations: true, // as a compare with a name it isn't
  catalogProvesGone: false, // nothing claimed
  mcpPerFolder: false, // nothing claimed
  readsStoredContext: false, // nothing claimed
  readsThroughCli: false, // nothing claimed
  rewindAnchor: "assistant-before", // as a compare with a name it isn't
  queuesSends: false, // nothing claimed
  promptCacheMaxMs: null, // nothing claimed
  boundaryBeforeCompactionFailure: false, // nothing claimed
  sessionControls: [], // nothing claimed
  subagentEndsWithCall: false, // nothing claimed
};

/** The traits of `harness`, a kind or whatever a row or a frame says one is. */
export const traitsOf = (harness: unknown): HarnessTraits => {
  const named = harnessNamed(harness);
  return named ? descriptorOf(named) : UNKNOWN_TRAITS;
};

/** The controls a live session of `H` answers ({@link HarnessTraits.sessionControls}). */
export type SessionControlOf<H extends HarnessKind> =
  PluginOf<H>["sessionControls"][number];

/** Whether a live session of `harness`, a kind or whatever a row says one is, answers control `method`. */
export const answersControl = (harness: unknown, method: string): boolean =>
  traitsOf(harness).sessionControls.includes(method);

/** Every kind a fact of its descriptor holds of, in {@link HARNESSES} order: for a query that filters on a column. */
export const harnessesWith = (
  holds: (plugin: HarnessDescriptor) => boolean
): HarnessKind[] => HARNESSES.filter((kind) => holds(descriptorOf(kind)));

/** The kinds whose sessions are a keeper's children, per the table. */
export type KeeperHarnessKind = {
  [K in HarnessKind]: PluginOf<K>["custody"] extends "keeper" ? K : never;
}[HarnessKind];

/** Whether `kind`'s sessions are a keeper's children. */
const isKeeperHarness = (kind: HarnessKind): kind is KeeperHarnessKind =>
  descriptorOf(kind).custody === "keeper";

/** Every kind whose sessions are a keeper's children, in {@link HARNESSES} order. */
export const KEEPER_HARNESSES: readonly KeeperHarnessKind[] =
  HARNESSES.filter(isKeeperHarness);

/** The kinds whose descriptor's `F` is a `V`. */
type KindsWhere<F extends keyof HarnessPlugin, V> = {
  [K in HarnessKind]: PluginOf<K>[F] extends V ? K : never;
}[HarnessKind];

const isCredentialStore = (
  kind: HarnessKind
): kind is KindsWhere<"homeLogin", "credentials"> =>
  descriptorOf(kind).homeLogin === "credentials";

/** Every kind whose machine sign-in is a store of credentials, in {@link HARNESSES} order. */
export const CREDENTIAL_STORE_HARNESSES: readonly KindsWhere<
  "homeLogin",
  "credentials"
>[] = HARNESSES.filter(isCredentialStore);

/** A harness whose own store holds a credential per provider, which an account can hold one of. */
export type CredentialStoreKind = (typeof CREDENTIAL_STORE_HARNESSES)[number];

const isSelfSigned = (
  kind: HarnessKind
): kind is KindsWhere<"homeLogin", "none"> =>
  descriptorOf(kind).homeLogin === "none";

/**
 * Every kind each account signs in itself, in a home CawCo keeps for the
 * account on each machine (descriptor `homeLogin` "none"), in
 * {@link HARNESSES} order: a session of one runs on that home's sign-in,
 * never on the account's own.
 */
const SELF_SIGNED_HARNESSES: readonly KindsWhere<"homeLogin", "none">[] =
  HARNESSES.filter(isSelfSigned);

/** A harness each account signs in itself, in its own home ({@link SELF_SIGNED_HARNESSES}). */
export type SelfSignedKind = (typeof SELF_SIGNED_HARNESSES)[number];

/** Whether `harness`, a kind or whatever a row or a frame says one is, is signed in by each account in its own home. */
export const signsInItself = (harness: unknown): harness is SelfSignedKind => {
  const named = harnessNamed(harness);
  return named !== undefined && isSelfSigned(named);
};

/**
 * Where a session of each harness each account signs in itself finds its
 * sign-in. `apart`: a home of the harness's own, signed in beside the
 * account's own sign-in, which says nothing of it (Codex's, beside a
 * ChatGPT account's for pi and OpenCode). `own`: the account's own
 * sign-in, which is that home's (Antigravity's: its whole sign-in is its
 * agy home, reported as the account's).
 */
const SELF_SIGNIN = {
  codex: "apart",
  agy: "own",
} as const satisfies Readonly<Record<SelfSignedKind, "apart" | "own">>;

/** A harness whose sign-in is a home of its own, beside the account's ({@link SELF_SIGNIN}). */
export type ApartSigninKind = {
  [K in SelfSignedKind]: (typeof SELF_SIGNIN)[K] extends "apart" ? K : never;
}[SelfSignedKind];

/** Whether `harness`, a kind or whatever a row or a frame says one is, signs in apart from the account's own sign-in ({@link SELF_SIGNIN}). */
export const signsInApart = (harness: unknown): harness is ApartSigninKind =>
  signsInItself(harness) && SELF_SIGNIN[harness] === "apart";

/** Every kind whose sign-in is a home of its own beside the account's, in {@link HARNESSES} order. */
export const APART_SIGNIN_HARNESSES: readonly ApartSigninKind[] =
  SELF_SIGNED_HARNESSES.filter(signsInApart);

const isCompactNamed = (
  kind: HarnessKind
): kind is KindsWhere<"compactByOnMovedLine", "named"> =>
  descriptorOf(kind).compactByOnMovedLine === "named";

/** Every kind a moved line names as its compactor, in {@link HARNESSES} order. */
export const COMPACT_NAMED_HARNESSES: readonly KindsWhere<
  "compactByOnMovedLine",
  "named"
>[] = HARNESSES.filter(isCompactNamed);

/** A harness a moved line's `compactBy` names. */
export type CompactNamedKind = (typeof COMPACT_NAMED_HARNESSES)[number];

/**
 * The harness whose `/compact` a moved line says ran: the one its
 * `compactBy` names, else the one whose descriptor says `unnamed`, as every
 * line before the field was.
 */
export const compactorOf = (
  compactBy: CompactNamedKind | undefined
): HarnessKind => {
  if (compactBy) {
    return compactBy;
  }
  for (const kind of HARNESSES) {
    if (!isCompactNamed(kind)) {
      return kind;
    }
  }
  throw new Error("No harness's moved lines go without a compactBy");
};

/**
 * Whether a session of `harness` in permission mode `mode` (as its row keeps
 * them) runs a shell command without asking the person: a harness with no
 * permission modes always does, any other only in
 * {@link COMMANDS_UNASKED_MODES}. What a session may set up that runs a
 * command for it later (hub routines.ts, a `command` routine) follows this,
 * as running the command itself would.
 */
export const runsCommandsUnasked = (
  harness: unknown,
  mode: string | null | undefined
): boolean =>
  traitsOf(harness).permissionModes.length === 0 ||
  COMMANDS_UNASKED_MODES.some((each) => each === mode);

/** Whether `harness` has permission mode `mode` (its descriptor's `permissionModes`). */
export const hasMode = (harness: unknown, mode: OfferedMode): boolean =>
  traitsOf(harness).permissionModes.includes(mode);
