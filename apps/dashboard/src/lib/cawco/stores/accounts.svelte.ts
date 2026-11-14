/**
 * The hub's accounts: who they are, where each is signed in, each one's
 * model catalog, and the providers the account picker offers. Read on
 * connect and again on every `usage` frame; written through the hub's
 * account routes, each write read back whole.
 */
import type {
  Account,
  AccountBench,
  AccountCatalog,
  AccountCatalogFault,
  AccountKind,
  AccountProvider,
  AccountReading,
  AccountSetupStep,
  AccountSignin,
  AccountSigninResult,
  PendingAccountSignin,
  PlacementPreview,
  ProviderChoice,
  ProviderRouting,
  ProviderSigninChallenge,
  ProviderSigninResult,
  RebalanceNotice,
  RefusalVerdict,
} from "@cawco/core/accounts";
import type { AccountHue } from "@cawco/core/accounts/kinds";
import { accountsWords } from "@cawco/core/words/accounts";
import { hub } from "#lib/platform/hub.js";
import {
  hubAsk,
  hubData,
  hubFailure,
  hubRefusal,
} from "#lib/platform/hub-read.js";
import { load } from "../hub/load";
import { equal } from "./same";

export const accountsState = $state<{
  /**
   * The hub's accounts (`/api/accounts`): who they are, where each is signed
   * in, and each one's model catalog. Read on connect and after every
   * `kind: 'usage'` frame, which the hub sends when any of it moves.
   */
  accounts: AccountsView | null;

  /**
   * The account picker's rows (`/api/accounts/providers`): every provider
   * the fleet's machines know, each with how it signs in. Read with the
   * accounts; null until read.
   */
  accountProviders: ProviderChoice[] | null;
}>({
  accounts: null,
  accountProviders: null,
});

/** What `/api/accounts` answers. */
export interface AccountsView {
  accounts: Account[];
  /** Accounts out of placement until a window resets. */
  bench: AccountBench[];
  /** Why accounts with no catalog have none: their last probe's fault. */
  catalogFaults: AccountCatalogFault[];
  catalogs: AccountCatalog[];
  /** Sign-ins started on a machine and not finished: the link or code each showed. */
  pending: PendingAccountSignin[];
  /** Each account's freshest reading: its windows, plan and extra usage. */
  readings: AccountReading[];
  /** What adding an account (or one back from its bench) set moving, newest first. */
  rebalances: RebalanceNotice[];
  /** How each provider's new sessions choose among its accounts. */
  routing: ProviderRouting[];
  signins: AccountSignin[];
}

/** Reads of the accounts so far: only the newest one's answer is kept. */
let accountsReads = 0;

/** Who hears the hub's accounts signal (see {@link followAccounts}). */
let accountsFollower: (() => void) | null = null;

/**
 * Calls `follower` each time the hub says an account moved (a reading, a
 * sign-in, a catalog), and on connect: the usage forecast's reader
 * (usage/forecast.svelte.ts) reads again then. One follower.
 */
export function followAccounts(follower: () => void): void {
  accountsFollower = follower;
}

/** Who takes each new accounts read as it lands (see {@link takeAccounts}). */
let accountsTaker: ((view: AccountsView) => void) | null = null;

/**
 * Calls `taker` with each accounts read that changed what the hub said, as
 * it is kept: the sign-ins under way in this tab take up the link or code
 * the hub kept for them (accounts/flows.svelte.ts `startFlows`). One taker.
 * Returns its release: a read then lands with no one taking it.
 */
export function takeAccounts(taker: (view: AccountsView) => void): () => void {
  accountsTaker = taker;
  return () => {
    if (accountsTaker === taker) {
      accountsTaker = null;
    }
  };
}

/**
 * Reads the hub's accounts of every provider, their sign-ins and catalogs,
 * and the providers the fleet's machines know; a failed read keeps what was
 * there.
 */
export async function readAccounts(): Promise<void> {
  accountsFollower?.();
  accountsReads += 1;
  const ticket = accountsReads;
  const [view, providers] = await Promise.all([
    load(hubData(hub.api.accounts.get())),
    load(hubData(hub.api.accounts.providers.get())),
  ]);
  // Reads overlap (every `usage` frame and every write asks again): only the
  // newest one's answer is kept, so an older one landing last never stands.
  if (ticket !== accountsReads) {
    return;
  }
  if (view && !equal(accountsState.accounts, view)) {
    accountsState.accounts = view;
    accountsTaker?.(view);
  }
  if (providers && !equal(accountsState.accountProviders, providers)) {
    accountsState.accountProviders = providers;
  }
}

/**
 * One write to the accounts routes. A refusal is thrown in the hub's own
 * sentence, which is written for people; the accounts are read again after
 * every write that landed, since only a sign-in makes the hub say so.
 */
async function accountsWrite<T>(written: Promise<T>): Promise<T> {
  const answer = await written;
  await readAccounts();
  return answer;
}

/** Adds an account; it goes last in its provider's fill-first order. */
export const createAccount = (body: {
  kind: AccountKind;
  provider: AccountProvider;
  hue?: AccountHue;
  label?: string;
  /** Made by the setup: the step it stands at, until it is done. */
  setupStep?: AccountSetupStep;
}): Promise<Account> => accountsWrite(hubData(hub.api.accounts.post(body)));

/** Changes an account's nickname (null: its email), colour, order or limits. */
export const patchAccount = (
  id: string,
  patch: {
    hue?: AccountHue;
    label?: string | null;
    neverBackup?: boolean;
    order?: number;
    reservePct?: number | null;
    /** Where its setup stands; null once the setup is done. */
    setupStep?: AccountSetupStep | null;
  }
): Promise<Account> =>
  accountsWrite(hubData(hub.api.accounts({ id }).patch(patch)));

/**
 * What removing an account does with the sessions on it, for its confirm:
 * how many move to another account and how many have none to go to.
 * Null when the hub could not say.
 */
export const accountRemoval = (
  id: string
): Promise<{ moving: number; staying: number } | null> =>
  load(hubData(hub.api.accounts({ id }).removal.get()));

/**
 * Removes an account, signing it out on every machine signed in to it; its
 * sessions move to the accounts placement carries them to.
 */
export const deleteAccount = (id: string) =>
  accountsWrite(hubData(hub.api.accounts({ id }).delete()));

/** Sets how a provider's new sessions choose among its accounts: the fields the hub's route takes. */
export const putRouting = (
  provider: AccountProvider,
  routing: Omit<ProviderRouting, "provider">
): Promise<ProviderRouting> =>
  accountsWrite(
    hubData(
      hub.api.accounts.routing({ provider }).put({
        yours: routing.yours,
        delegates: routing.delegates,
        atLimit: routing.atLimit,
      })
    )
  );

/** Starts Claude Code's own login for the account on a machine: the link to open. */
export const beginSignin = (
  id: string,
  machineId: string
): Promise<{ url: string }> =>
  accountsWrite(
    hubData(hub.api.accounts({ id }).machines({ machineId }).signin.post())
  ).then((challenge) => {
    if (!("url" in challenge)) {
      throw new Error(accountsWords.signin.notALink);
    }
    return challenge;
  });

/** Types the pasted code into that login: signed in, or someone else's account. */
export const completeSignin = (
  id: string,
  machineId: string,
  code: string
): Promise<AccountSigninResult> =>
  accountsWrite(
    hubData(
      hub.api
        .accounts({ id })
        .machines({ machineId })
        .signin.complete.post({ code })
    )
  ).then((result) =>
    // Claude's login never says `expired` or `pending`: a code that did not take is signed out.
    result.state === "expired" || result.state === "pending"
      ? { state: "signed-out" }
      : result
  );

/**
 * Starts a provider's own OAuth sign-in for the account on a machine: a
 * device code to enter on any device, where, and until when.
 */
export const beginDeviceSignin = (
  id: string,
  machineId: string
): Promise<ProviderSigninChallenge> =>
  accountsWrite(
    hubData(hub.api.accounts({ id }).machines({ machineId }).signin.post())
  );

/**
 * Waits up to a minute for the device code to be entered: signed in, as
 * someone else, expired, or still pending (ask again).
 */
export const awaitDeviceSignin = (
  id: string,
  machineId: string
): Promise<ProviderSigninResult> =>
  accountsWrite(
    hubData(
      hub.api.accounts({ id }).machines({ machineId }).signin.complete.post({})
    )
  ).then((result) => {
    if ("identity" in result) {
      return result;
    }
    if (result.state === "expired" || result.state === "pending") {
      return result;
    }
    if (result.state === "mismatch" && "email" in result) {
      return result;
    }
    // A signed-out answer is the Claude login's: the code did not take.
    throw new Error(accountsWords.signin.refused);
  });

/**
 * Checks now whether Claude Code still refuses an account it refused
 * account-wide: one turn as the account on a machine its refusal signed
 * out. The accounts are read again once it answers.
 */
export const checkRefusalOf = (id: string): Promise<RefusalVerdict> =>
  accountsWrite(hubData(hub.api.accounts({ id })["refusal-check"].post()));

/**
 * Signs an account out on one machine and drops its store there; the hub
 * refuses a machine that is offline (503, named as away) or not signed in
 * (404).
 */
export const signOutOn = (id: string, machineId: string): Promise<unknown> =>
  accountsWrite(
    hubData(hub.api.accounts({ id }).machines({ machineId }).delete())
  );

/** What sending a key came to on one machine: its result, or why it didn't arrive. */
export type KeyDelivery =
  | { machineId: string; result: ProviderSigninResult }
  | { machineId: string; error: string };

/** Relays a key account's key to each machine named; the hub never keeps it. */
export const sendAccountKey = (
  id: string,
  key: string,
  machineIds: string[]
): Promise<{ machines: KeyDelivery[] }> =>
  accountsWrite(
    hubData(hub.api.accounts({ id }).key.post({ key, machineIds }))
  );

/** The Configure page a refused start is put right on, by the hub's code for why. */
type PlacementFix = "accounts" | "cli-tools";

/**
 * A start placement refuses, in the hub's words, and the Configure page its
 * fix is on: no account can take it (`not-placed`), sign one in on
 * Accounts; the machine refuses the harness's CLI (`harness-refused`),
 * install or update it on Command-line tools. Null for a refusal no page
 * puts right (a harness CawCo does not run, a machine that could not say
 * which model pi starts on).
 */
export class PlacementRefused extends Error {
  readonly fix: PlacementFix | null;
  constructor(words: string, fix: PlacementFix | null) {
    super(words);
    this.name = "PlacementRefused";
    this.fix = fix;
  }
}

/** Where the fix is for the hub's placement refusal `code` ({@link PlacementRefused}). */
const placementFix = (code: string | undefined): PlacementFix | null => {
  if (code === "not-placed") {
    return "accounts";
  }
  return code === "harness-refused" ? "cli-tools" : null;
};

/**
 * Which account a session would start on, why, and the model it was read for
 * as the session would start on it in `cwd` (`/api/accounts/placement`).
 * Undefined when it cannot be read; a refusal is thrown in the hub's words
 * with where its fix is ({@link PlacementRefused}): no account can take it
 * or the machine refuses the harness's CLI (400), or the machine could not
 * say which model pi starts on in that folder (503), any of which refuses
 * the start too.
 */
export async function placementFor(query: {
  cwd?: string;
  harness: string;
  machineId: string;
  model?: string;
  projectId?: string;
}): Promise<PlacementPreview | undefined> {
  const answer = await hubAsk(hub.api.accounts.placement.get({ query }));
  if (!answer.ok) {
    const { status } = answer.refused.error;
    if (status === 400 || status === 503) {
      throw new PlacementRefused(
        hubRefusal(answer.refused).message,
        placementFix(hubFailure(answer.refused).code)
      );
    }
    return undefined;
  }
  return answer.value;
}

/** The hub's accounts and the providers the fleet can sign in to; null until read. */
export const accountsStore = {
  /** The hub's accounts, their sign-ins and catalogs; null until read. */
  get accounts(): AccountsView | null {
    return accountsState.accounts;
  },
  /** The account picker's rows, every provider the fleet knows; null until read. */
  get accountProviders(): ProviderChoice[] | null {
    return accountsState.accountProviders;
  },
};
