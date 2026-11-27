import type {
  Account,
  AccountIdentity,
  AccountJoined,
  AccountKind,
  AccountProvider,
  AccountSignin,
  AccountSigninResult,
  HomeStore,
  MachineProviderLists,
  ProviderInfo,
  ProviderSigninResult,
  SigninState,
} from "@cawco/core/accounts";
import {
  ACCOUNT_KINDS,
  accountNameAmong,
  CLAUDE_PROVIDER,
  joinProviders,
  PROVIDER_ACCOUNT_KINDS,
  providerChoices,
  sameIdentity,
} from "@cawco/core/accounts";
import {
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_AGY_LOGIN,
  CONTROL_COMPLETE_PROVIDER_LOGIN,
  CONTROL_FORGET_CODEX_LOGIN,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_JOIN_PROVIDER_ACCOUNT,
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_READ_HOME_LOGIN,
} from "@cawco/core/accounts/controls";
import {
  type ApartSignins,
  harnessSignins,
  hasHarnessSignin,
} from "@cawco/core/accounts/harness-signins";
import type { Bounded } from "@cawco/core/bounded";
import {
  AGY_PROVIDER,
  type AgyAccountRecord,
  agyRecordRefusal,
} from "@cawco/core/harness/agy-account";
import { harnessName } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { agyWords } from "@cawco/core/words/agy";
import { ElysiaStatus, problem } from "elysia";
import { marksRenewed } from "./account-marks";
import {
  accountOfIdentity,
  keepProbe,
  uncompared,
  withOrgIdFrom,
} from "./accounts";
import type {
  ClosureContext,
  HomeCredentialFound,
  SigninFinished,
} from "./closure-context";
import type { LoginMove } from "./db/accounts";
import { SIGNIN_TIMEOUT_MS } from "./login-moves";
import {
  answerAs,
  awayProblem,
  type CallAnswer,
  silentProblem,
  type Unanswered,
} from "./machine-answers";
import { noHarnessSigninRefusal } from "./placement";
import { unreachable } from "./unreachable";

/** Why an account's marks end as it signs in (account-marks.ts `marksRenewed`). */
const SIGNED_IN_AGAIN = "it was signed in again through CawCo";

export type AccountSigninContext = Pick<
  ClosureContext,
  | "advanceMove"
  | "db"
  | "forgetOn"
  | "liveFrom"
  | "machineCalls"
  | "machineName"
  | "moveKey"
  | "moveResults"
  | "movingLogins"
  | "publishUsage"
  | "rowsLeave"
  | "silentWords"
  | "tickMoves"
>;

export const createAccountSignin = (ctx: AccountSigninContext) => {
  /**
   * A sign-in through CawCo kept as it came out on `machineId`: no longer a
   * login that was moved, and, signed in, out of every credit and access
   * mark it held (account-marks.ts `marksRenewed`); every screen hears it.
   */
  const keepSignin = (
    accountId: string,
    machineId: string,
    state: SigninState
  ): void => {
    ctx.db.accounts.putSignin({ accountId, machineId, state, moved: null });
    if (state === "signed-in") {
      marksRenewed(ctx.db, accountId, SIGNED_IN_AGAIN);
    }
    ctx.publishUsage(machineId);
  };

  const undoRemovedSignin = async (
    account: Account,
    machineId: string
  ): Promise<string> => {
    await ctx.forgetOn(account, machineId);
    const named = account.label ?? account.email;
    return `${named ? `The account "${named}"` : "The account you were adding"} was removed while ${ctx.machineName(machineId)} was signing it in, so that sign-in was undone. Add the account again to sign it in.`;
  };

  /**
   * Each machine's harnesses' word on the providers an account can be for,
   * each harness's from the last beat that carried it: a harness a beat
   * leaves out (its list could not be read) keeps its last list.
   */
  const machineProviders = new Map<string, MachineProviderLists>();

  /**
   * Each machine's accounts whose Codex home there holds a Codex sign-in,
   * as its last beat said (agent harnesses/codex-home.ts
   * `codexSignedInAccounts`). Live: a machine says it again at every
   * register.
   */
  const codexAccountsOn = new Map<string, ReadonlySet<string>>();

  /**
   * Codex sign-outs a person asked for while a Codex session on the account
   * still ran on the machine, by machine: the account counts as signed out
   * for Codex there at once ({@link codexBeat} keeps it out), and its Codex
   * home is signed out once no Codex session there runs on it (account-carry.ts
   * `leaveCodexHomes`), as an account's own sign-out waits for its sessions
   * (`leaveAccounts`). Live, like {@link codexAccountsOn}.
   */
  const codexLeaves = new Map<string, Set<string>>();

  /** Whether a Codex sign-out of `accountId` on `machineId` waits there ({@link codexLeaves}). */
  const codexLeaving = (accountId: string, machineId: string): boolean =>
    codexLeaves.get(machineId)?.has(accountId) ?? false;

  /**
   * A Codex sign-out of `accountId` on `machineId` waits for its sessions
   * there ({@link codexLeaves}), or (`waits` false) is over.
   */
  const keepCodexLeave = (
    accountId: string,
    machineId: string,
    waits: boolean
  ): void => {
    const now = new Set(codexLeaves.get(machineId));
    if (waits) {
      now.add(accountId);
    } else {
      now.delete(accountId);
    }
    if (now.size > 0) {
      codexLeaves.set(machineId, now);
    } else {
      codexLeaves.delete(machineId);
    }
  };

  /** Every Codex sign-out still waiting for its sessions ({@link codexLeaves}). */
  const pendingCodexLeaves = (): { accountId: string; machineId: string }[] =>
    [...codexLeaves].flatMap(([machineId, ids]) =>
      [...ids].map((accountId) => ({ accountId, machineId }))
    );

  /**
   * A machine's beat on the accounts whose Codex home holds a sign-in there:
   * kept, but for one whose sign-out waits ({@link codexLeaves}). Whether
   * that changed what the hub holds.
   */
  const codexBeat = (machineId: string, accountIds: readonly string[]) => {
    const was = codexAccountsOn.get(machineId);
    const now = new Set(
      accountIds.filter((id) => !codexLeaving(id, machineId))
    );
    codexAccountsOn.set(machineId, now);
    return !(
      was &&
      was.size === now.size &&
      [...now].every((id) => was.has(id))
    );
  };

  /**
   * What a machine's answer to a Codex sign-in or sign-out just settled,
   * kept at once: its next beat says it again. A sign-in ends a sign-out
   * still waiting there ({@link codexLeaves}).
   */
  const noteCodexSignin = (
    accountId: string,
    machineId: string,
    signedIn: boolean
  ): void => {
    const now = new Set(codexAccountsOn.get(machineId));
    if (signedIn) {
      keepCodexLeave(accountId, machineId, false);
      now.add(accountId);
    } else {
      now.delete(accountId);
    }
    codexAccountsOn.set(machineId, now);
  };

  /**
   * An account removed: Codex signs out of its Codex home on every machine
   * that holds one, as far as each answers. One that doesn't drops the
   * home when it next names its stores (`unknownAccountsOf`). On `waitOn`,
   * the machines where a session still runs on the account, the sign-out
   * waits for its Codex sessions there ({@link codexLeaves}), as the
   * account's own store waits for its sessions (`leaveAccounts`).
   */
  const forgetCodexEverywhere = async (
    accountId: string,
    waitOn: readonly string[]
  ): Promise<void> => {
    for (const [machineId, ids] of codexAccountsOn) {
      if (!ids.has(accountId)) {
        continue;
      }
      if (waitOn.includes(machineId)) {
        noteCodexSignin(accountId, machineId, false);
        keepCodexLeave(accountId, machineId, true);
        continue;
      }
      const answer = await ctx.machineCalls.callAgent(
        machineId,
        CONTROL_FORGET_CODEX_LOGIN,
        [accountId],
        SIGNIN_TIMEOUT_MS
      );
      if (answer.kind === "answered" && answer.value.ok) {
        noteCodexSignin(accountId, machineId, false);
      }
    }
  };

  /**
   * Where each account is signed in for Codex, as the dashboard reads it:
   * one row per account and machine whose Codex home holds a sign-in.
   */
  const codexSignins = (): { accountId: string; machineId: string }[] =>
    [...codexAccountsOn].flatMap(([machineId, ids]) =>
      [...ids].map((accountId) => ({ accountId, machineId }))
    );

  /**
   * Where each account is signed in for each harness whose sign-in is a
   * home of its own beside the account's (core accounts/harness-signins.ts `ApartSignins`).
   */
  const apartSignins = (): ApartSignins => ({ codex: codexSignins() });

  /**
   * The sign-ins a session in `harness` can run on (placement.ts
   * `harnessSignins`): a harness's own sign-ins for a harness whose sign-in
   * is a home of its own, the accounts' own for any other. Placement and the
   * launch read the same.
   */
  const signinsFor = (harness: string): AccountSignin[] =>
    harnessSignins(harness, ctx.db.accounts.signins(), apartSignins());

  /** Every provider any machine knows, one entry each, the first machine's word on it. */
  const knownProviders = (): ProviderInfo[] => {
    const byId = new Map<string, ProviderInfo>();
    for (const lists of machineProviders.values()) {
      for (const provider of joinProviders(
        lists.pi ?? [],
        lists.opencode ?? []
      )) {
        if (!byId.has(provider.id)) {
          byId.set(provider.id, provider);
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  };

  /**
   * Why no start of `harness` can run on `machineId`: a harness each account
   * signs in itself with no account signed in for it there (core
   * accounts/harness-signins.ts `hasHarnessSignin`); undefined when one is,
   * and for any other harness.
   */
  const unsignedHarness = (
    machineId: string,
    harness: string
  ): string | undefined =>
    hasHarnessSignin(harness, machineId, {
      accounts: ctx.db.accounts.list(),
      apart: apartSignins(),
      choices: providerChoices(knownProviders()),
      signins: ctx.db.accounts.signins(),
    })
      ? undefined
      : noHarnessSigninRefusal(harness, ctx.machineName(machineId));

  /**
   * Why an account of `provider` cannot be of `kind` (and, for an
   * Antigravity account, signed in by `agy`, its method and place:
   * {@link agyRecordRefusal}); undefined when it can.
   */
  const accountKindRefusal = (
    provider: string,
    kind: AccountKind,
    agy?: AgyAccountRecord
  ): string | undefined => {
    if (provider === AGY_PROVIDER) {
      return agy ? agyRecordRefusal(agy, kind) : agyWords.pickMethod;
    }
    if (agy) {
      return agyWords.methodOnlyForAgy;
    }
    if (provider === CLAUDE_PROVIDER) {
      return ACCOUNT_KINDS.includes(kind)
        ? undefined
        : "A Claude account is a subscription or a Console organization.";
    }
    if (!PROVIDER_ACCOUNT_KINDS.includes(kind)) {
      return `A ${provider} account signs in with OAuth or a key, not as a ${kind}.`;
    }
    const known = knownProviders().find((one) => one.id === provider);
    if (!known) {
      return `No machine knows a provider ${provider}; it is neither pi-ai's nor OpenCode's on any connected machine.`;
    }
    if (kind === "oauth" && !known.oauth) {
      return `${known.name} has no OAuth sign-in CawCo can run; add it with a key.`;
    }
    return undefined;
  };

  /**
   * The credential a move takes out of a machine's own store, read on the
   * machine now: `~/.claude`'s login for `claude`; else the entry `provider`
   * names in pi's or OpenCode's own `auth.json`.
   */
  const homeCredentialOf = async (
    machineId: string,
    store: HomeStore,
    storeProvider: string | undefined
  ) => {
    const machine = ctx.machineName(machineId);
    /** What the machine's stores hold, or why it did not say. */
    const said = <T>(asked: Bounded<CallAnswer<T>>) => {
      switch (asked.kind) {
        case "unanswered":
          return asked.reason === "dead"
            ? awayProblem(machineId, awayWords(machineId, asked))
            : silentProblem(awayWords(machineId, asked));
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      const read = asked.value;
      return read.ok
        ? { held: read.result }
        : problem(502, {
            code: "home-login-refused",
            detail:
              read.error ?? `${machine} could not say what its stores hold.`,
          });
    };
    const traits = traitsOf(store);
    if (traits.homeLogin === "dir") {
      const read = said(
        await ctx.machineCalls.readAgent(
          machineId,
          CONTROL_READ_HOME_LOGIN,
          [],
          SIGNIN_TIMEOUT_MS,
          store
        )
      );
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const home = read.held;
      return home.loggedIn && home.identity
        ? ({
            identity: home.identity,
            kind: home.kind ?? "subscription",
            provider: traits.soleProvider,
            storeProvider: traits.soleProvider,
          } satisfies HomeCredentialFound)
        : problem(409, {
            code: "home-login-refused",
            detail: `${harnessName(store)} on ${machine} isn't signed in, so there is no login to move.`,
          });
    }
    const read = said(
      await ctx.machineCalls.readAgent(
        machineId,
        CONTROL_READ_HOME_CREDENTIALS,
        [],
        SIGNIN_TIMEOUT_MS
      )
    );
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const found = read.held.find(
      (one) => one.store === store && one.storeProvider === storeProvider
    );
    return found
      ? ({
          identity: found.identity,
          kind: found.kind,
          provider: found.provider,
          storeProvider: found.storeProvider,
        } satisfies HomeCredentialFound)
      : problem(409, {
          code: "home-login-refused",
          detail: `${store}'s own store on ${machine} holds no ${storeProvider ?? "(name a provider)"} credential CawCo can move.`,
        });
  };

  /** A machine that did not answer a sign-in step, in a sentence. */
  const awayWords = (machineId: string, answer: Unanswered) =>
    `${ctx.silentWords(machineId, answer)}.`;

  /**
   * Starts moving one credential out of a machine's own store into the
   * account of the identity it is (made now when there is none): the move is
   * kept until the machine has made it, and tried at once. Refused when it is
   * already moving, or the account already has a sign-in there or one moving
   * there.
   */
  const startMove = async (
    machineId: string,
    store: HomeStore,
    found: {
      identity: AccountIdentity;
      kind: AccountKind;
      provider: AccountProvider;
      storeProvider: string;
    }
  ): Promise<
    | { error: string; status: 409 }
    | {
        accountId: string;
        email: string;
        provider: AccountProvider;
        store: HomeStore;
        waitingFor: number;
      }
  > => {
    const machine = ctx.machineName(machineId);
    const { identity, kind, provider, storeProvider } = found;
    const key = ctx.moveKey({ machineId, store, storeProvider });
    if (ctx.movingLogins().some((one) => ctx.moveKey(one) === key)) {
      return {
        status: 409,
        error: `${machine}'s own ${store} ${storeProvider} is already moving into CawCo.`,
      };
    }
    const account = accountOfIdentity(ctx.db, identity, kind, provider);
    if (
      ctx.db.accounts
        .signins()
        .some(
          (one) =>
            one.accountId === account.id &&
            one.machineId === machineId &&
            one.state === "signed-in"
        )
    ) {
      return {
        status: 409,
        error: `${accountNameAmong(account, ctx.db.accounts.list())} is already signed in on ${machine} in CawCo; nothing was moved.`,
      };
    }
    if (
      ctx
        .movingLogins()
        .some(
          (one) => one.accountId === account.id && one.machineId === machineId
        )
    ) {
      return {
        status: 409,
        error: `Another of ${machine}'s own stores is already moving ${accountNameAmong(account, ctx.db.accounts.list())} into CawCo.`,
      };
    }
    const move: LoginMove = {
      accountId: account.id,
      identity,
      machineId,
      provider,
      since: Date.now(),
      store,
      storeProvider,
    };
    ctx.db.accounts.putMove(move);
    ctx.moveResults.delete(key);
    ctx.tickMoves();
    const waitingFor = ctx.liveFrom(move).length;
    console.log(
      `[hub] moving ${machine}'s own ${store} ${storeProvider} (${identity.email}) into account ${account.id}; it moves at the first moment its ${waitingFor} live session(s) are at rest`
    );
    await ctx.advanceMove(move);
    return {
      accountId: account.id,
      email: identity.email,
      store,
      provider,
      waitingFor,
    };
  };

  /** The fingerprint of each connected machine's own stores this hub last moved from, by machine; cleared at its register. */
  const homeStamps = new Map<string, string>();
  /**
   * Every credential in a machine's own pi and OpenCode stores moved into
   * CawCo, so every provider login its harnesses use is an account the hub
   * places sessions on and reads limits for (OpenCode Go's windows,
   * ChatGPT's) and generate_image signs in with. Asked once per connection,
   * when its first report says how those stores stand, and again each time
   * they change under it ({@link HeartbeatPayload.homeStores}): a login made
   * there later moves within the agent's next check. A credential already
   * moved is gone from its store, and one whose account is already signed in
   * there stays where it is. A move that fails leaves the original as it was
   * and is asked again when the stores next change or the machine reconnects.
   */
  const adoptHomeCredentials = async (machineId: string): Promise<void> => {
    const read = await ctx.machineCalls.readAgent(
      machineId,
      CONTROL_READ_HOME_CREDENTIALS,
      [],
      SIGNIN_TIMEOUT_MS
    );
    switch (read.kind) {
      case "unanswered":
        console.warn(
          `[hub] ${ctx.machineName(machineId)} did not say what its own pi and OpenCode stores hold: ${ctx.silentWords(machineId, read)}`
        );
        return;
      case "answered":
        if (!read.value.ok) {
          console.warn(
            `[hub] ${ctx.machineName(machineId)} did not say what its own pi and OpenCode stores hold: ${read.value.error ?? "it gave no reason"}`
          );
          return;
        }
        break;
      default:
        throw unreachable(read);
    }
    for (const found of read.value.result) {
      const started = await startMove(machineId, found.store, found);
      if ("error" in started) {
        console.log(`[hub] ${started.error}`);
      }
    }
  };

  /**
   * Accounts removed because a sign-in to them came out as an account that
   * already was ({@link joinExisting}), and the account each is now: a
   * sign-in still waiting on another machine for the removed one finishes
   * into that account.
   */
  const joinedInto = new Map<string, string>();

  /**
   * The account an id names: its own, or the one a join made it
   * ({@link joinedInto}). Every route that takes an account id reads it so,
   * so an id a sign-in joined away (still held by the screen that added it)
   * reaches the account it is now, never "There is no account".
   */
  const accountOf = (id: string): Account | undefined =>
    ctx.db.accounts.get(id) ?? ctx.db.accounts.get(joinedInto.get(id) ?? "");

  /**
   * Of the account stores a connecting machine named (`accountStores` on its
   * register), the ones this hub deliberately removed (or joined away): the
   * machine forgets each ({@link RegisterAckPayload.unknownAccounts}). A
   * store this hub has no account for and no record of removing is left
   * alone: a hub whose database was wiped, or restored from an older copy,
   * has never heard of accounts that are real, and their logins may exist
   * nowhere else. Undefined when the machine named none, as an agent that is
   * not the machine's does.
   */
  const unknownAccountsOf = (
    machineId: string,
    stores: string[] | undefined
  ): string[] | undefined => {
    if (stores === undefined) {
      return undefined;
    }
    const unheld = stores.filter((id) => !ctx.db.accounts.get(id));
    // A store a process there still runs in stays until none does: its
    // sign-out is `leaveAccounts`'s.
    const leaving = new Set(
      ctx.db.accounts
        .leaves()
        .filter((leave) => leave.machineId === machineId)
        .map((leave) => leave.accountId)
    );
    const gone = ctx.db.accounts.removedOf(unheld);
    const removed = gone.filter((id) => !leaving.has(id));
    const strangers = unheld.filter((id) => !gone.includes(id));
    if (removed.length > 0) {
      console.log(
        `[accounts] ${ctx.machineName(machineId)} still holds the stores of ${removed.length} account${removed.length === 1 ? "" : "s"} this hub removed, so it is told to forget them. Their folders are named by account id, the only name left for them: ${removed.join(", ")}.`
      );
    }
    if (strangers.length > 0) {
      console.warn(
        `[accounts] ${ctx.machineName(machineId)} holds the stores of ${strangers.length} account${strangers.length === 1 ? "" : "s"} this hub has never heard of, so they are left alone: another hub may own them. Remove the folders on that machine if nothing uses them. They are named by account id, the only name they have: ${strangers.join(", ")}.`
      );
    }
    return removed;
  };

  /**
   * The other account of `account`'s provider that already is `identity`.
   * None when the identity names no organization id: it can't be compared,
   * and the sign-in stays an account of its own (said in the log).
   */
  const existingAs = (
    account: Account,
    identity: AccountIdentity
  ): Account | undefined => {
    if (!identity.orgId) {
      uncompared(
        identity,
        `A new sign-in into ${accountNameAmong(account, ctx.db.accounts.list())}`
      );
      return undefined;
    }
    return ctx.db.accounts.byIdentity(account.provider, identity, account.id);
  };

  /**
   * One identity is one account. A sign-in on `machineId` into `account`,
   * made for it and never signed in as anyone yet, came out as `existing`'s
   * identity: the machine joins it into `existing` there (its login moved
   * into `existing`'s store, or signed out and dropped when `existing`
   * already holds one), the sign-in is recorded on `existing`, and `account`
   * is removed with the empty stores its sign-ins left on other machines.
   */
  /**
   * The machine's half of a join: the login it signed in under `fromId`
   * becomes `existing`'s there, and the sign-in is recorded on `existing`.
   */
  const joinOn = async (
    fromId: string,
    existing: Account,
    machineId: string,
    identity: AccountIdentity
  ): Promise<AccountJoined | { error: string }> => {
    const asked =
      existing.provider === CLAUDE_PROVIDER
        ? await ctx.machineCalls.callAgent(
            machineId,
            CONTROL_JOIN_ACCOUNT_LOGIN,
            [fromId, existing.id, identity],
            SIGNIN_TIMEOUT_MS,
            "claude"
          )
        : await ctx.machineCalls.callAgent(
            machineId,
            CONTROL_JOIN_PROVIDER_ACCOUNT,
            [fromId, existing.id, identity],
            SIGNIN_TIMEOUT_MS
          );
    switch (asked.kind) {
      case "unanswered":
        return { error: awayWords(machineId, asked) };
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    const existingName = accountNameAmong(existing, ctx.db.accounts.list());
    if (!answer.ok) {
      return {
        error: `${ctx.machineName(machineId)} signed in as ${identity.email}, already ${existingName}, but could not make it that account's: ${answer.error ?? "it gave no reason"}`,
      };
    }
    const joined = answer.result;
    console.log(
      `[accounts] A new sign-in on ${ctx.machineName(machineId)} is ${identity.email}, which this hub already has as ${existingName}, so the two are one account there: ${joined.outcome === "kept" ? `${existingName}'s login on ${ctx.machineName(machineId)} is kept, and the new one is dropped` : `the new login is ${existingName}'s on ${ctx.machineName(machineId)} from now on`}.`
    );
    keepSignin(existing.id, machineId, "signed-in");
    return {
      accountId: existing.id,
      note: `Signed in as ${identity.email}, which is already an account here; it's that account now.`,
    };
  };

  const joinExisting = async (
    account: Account,
    existing: Account,
    machineId: string,
    identity: AccountIdentity
  ): Promise<AccountJoined | { error: string }> => {
    const joined = await joinOn(account.id, existing, machineId, identity);
    if ("error" in joined) {
      return joined;
    }
    for (const signin of ctx.db.accounts
      .signins()
      .filter(
        (one) => one.accountId === account.id && one.machineId !== machineId
      )) {
      await ctx.forgetOn(account, signin.machineId, existing.id);
    }
    ctx.db.accounts.remove(account.id, "joined");
    ctx.rowsLeave(account.id, existing.id);
    joinedInto.set(account.id, existing.id);
    ctx.publishUsage();
    return joined;
  };

  /**
   * A sign-in into `account`, never anyone yet, that came out as an identity
   * another account of its provider already is: joined into that account
   * ({@link joinExisting}). Undefined when it is nobody else's.
   */
  const joinIfTaken = async (
    account: Account,
    machineId: string,
    identity: AccountIdentity | null | undefined
  ): Promise<AccountJoined | { error: string } | undefined> => {
    const existing =
      identity && !account.identity ? existingAs(account, identity) : undefined;
    return existing && identity
      ? await joinExisting(account, existing, machineId, identity)
      : undefined;
  };

  /**
   * What a Claude sign-in came to, kept, with the models its probe read. An
   * account named before organization ids were read was not compared on
   * the machine ({@link expectedOf}): its id is filled from this login, and
   * a login of someone else is `mismatch` here.
   */
  const settleClaudeSignin = async (
    account: Account,
    machineId: string,
    answered: AccountSigninResult
  ): Promise<AccountSigninResult | { error: string }> => {
    const joined =
      answered.state === "signed-in"
        ? await joinIfTaken(account, machineId, answered.probe?.identity)
        : undefined;
    if (joined) {
      return "error" in joined ? joined : { ...answered, joined };
    }
    const signedAs = answered.probe?.identity;
    const held =
      answered.state === "signed-in" && signedAs
        ? withOrgIdFrom(ctx.db, account, signedAs).identity
        : null;
    const result: AccountSigninResult =
      held && signedAs && !sameIdentity(held, signedAs)
        ? { ...answered, state: "mismatch" }
        : answered;
    if (result.state === "signed-in" && result.probe) {
      if (result.probe.identity && !account.identity) {
        ctx.db.accounts.setIdentity(account.id, result.probe.identity);
      }
      keepProbe(ctx.db, machineId, account.id, result.probe);
    }
    // Signed in here through CawCo: no longer the login that was moved.
    keepSignin(account.id, machineId, result.state);
    return result;
  };

  /**
   * What a provider sign-in or key came to, kept: signed in (the account
   * named by its identity the first time, its plan kept with its reading),
   * or signed out again as someone else's. Still waiting or expired changes
   * nothing.
   */
  const settleProviderSignin = async (
    account: Account,
    machineId: string,
    result: ProviderSigninResult
  ): Promise<ProviderSigninResult | { error: string }> => {
    const joined =
      result.state === "signed-in"
        ? await joinIfTaken(account, machineId, result.identity)
        : undefined;
    if (joined && result.state === "signed-in") {
      return "error" in joined ? joined : { ...result, joined };
    }
    if (result.state === "signed-in") {
      if (result.identity && !account.identity) {
        ctx.db.accounts.setIdentity(account.id, result.identity);
      }
      if (result.plan) {
        ctx.db.accounts.putReading(account.id, { subscription: result.plan });
      }
    }
    if (result.state === "signed-in" || result.state === "mismatch") {
      // Signed in here through CawCo: no longer the credential that was moved.
      keepSignin(account.id, machineId, result.state);
    }
    return result;
  };

  /**
   * The identity a machine holds a sign-in into `account` to: its own, when
   * it names its organization's id. One that names none (a Claude account
   * named before ids were read) can't be compared there, so none is sent and
   * the hub compares the answer once its id is filled ({@link
   * settleClaudeSignin}).
   */
  const expectedOf = (account: Account): AccountIdentity | null =>
    account.identity?.orgId ? account.identity : null;

  /**
   * Finishes a machine's sign-in, which runs under the id it was begun with
   * (`signinId`), as the account it now finishes into: it must come out as
   * that account's identity ({@link expectedOf}).
   */
  const completeOn = async (
    account: Account,
    signinId: string,
    machineId: string,
    code: string | undefined
  ): Promise<Bounded<CallAnswer<SigninFinished>>> => {
    if (account.provider === CLAUDE_PROVIDER) {
      return answerAs(
        await ctx.machineCalls.callAgent(
          machineId,
          CONTROL_COMPLETE_ACCOUNT_LOGIN,
          [code ?? null, signinId, expectedOf(account)],
          SIGNIN_TIMEOUT_MS,
          "claude"
        ),
        (result): SigninFinished => ({ kind: "account", result })
      );
    }
    // Antigravity: what the person pasted, handed to agy's own sign-in
    // waiting in the account's agy home there.
    if (account.agy) {
      return answerAs(
        await ctx.machineCalls.callAgent(
          machineId,
          CONTROL_COMPLETE_AGY_LOGIN,
          [code ?? "", signinId],
          SIGNIN_TIMEOUT_MS
        ),
        (result): SigninFinished => ({ kind: "provider", result })
      );
    }
    return answerAs(
      await ctx.machineCalls.callAgent(
        machineId,
        CONTROL_COMPLETE_PROVIDER_LOGIN,
        [code ?? null, signinId, expectedOf(account)],
        SIGNIN_TIMEOUT_MS
      ),
      (result): SigninFinished => ({ kind: "provider", result })
    );
  };

  /** Who a finished sign-in, of either kind, came out as. */
  const signedInAs = (
    finished: SigninFinished
  ): AccountIdentity | null | undefined => {
    if (finished.kind === "account") {
      return finished.result.probe?.identity;
    }
    const provider = finished.result;
    return provider.state === "signed-in" ? provider.identity : undefined;
  };

  /** A finished sign-in, kept on its account ({@link settleClaudeSignin}, {@link settleProviderSignin}). */
  const settleSignin = (
    account: Account,
    machineId: string,
    finished: SigninFinished
  ) =>
    finished.kind === "account"
      ? settleClaudeSignin(account, machineId, finished.result)
      : settleProviderSignin(account, machineId, finished.result);

  /**
   * A sign-in begun for `signinId`, an account a sign-in on another machine
   * has since joined into `into`: it finishes into `into` there too.
   */
  const finishJoined = async (
    signinId: string,
    into: Account,
    machineId: string,
    finished: SigninFinished
  ) => {
    const identity = signedInAs(finished);
    const { result } = finished;
    if (result.state !== "signed-in" || !identity) {
      return result;
    }
    const joined = await joinOn(signinId, into, machineId, identity);
    return "error" in joined ? joined : { ...result, joined };
  };

  return {
    undoRemovedSignin,
    codexAccountsOn,
    codexBeat,
    codexLeaving,
    codexSignins,
    keepCodexLeave,
    pendingCodexLeaves,
    signinsFor,
    unsignedHarness,
    noteCodexSignin,
    forgetCodexEverywhere,
    machineProviders,
    knownProviders,
    accountKindRefusal,
    homeCredentialOf,
    awayWords,
    startMove,
    homeStamps,
    adoptHomeCredentials,
    accountOf,
    unknownAccountsOf,
    joinOn,
    settleProviderSignin,
    completeOn,
    settleSignin,
    finishJoined,
  };
};
