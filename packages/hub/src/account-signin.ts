import type {
  Account,
  AccountIdentity,
  AccountJoined,
  AccountJoinedOn,
  AccountKind,
  AccountProvider,
  AccountSigninResult,
  HomeCredential,
  HomeLogin,
  HomeStore,
  MachineProviderLists,
  ProviderInfo,
  ProviderSigninResult,
} from "@cawco/core/accounts";
import {
  ACCOUNT_KINDS,
  accountNameAmong,
  CLAUDE_PROVIDER,
  joinProviders,
  PROVIDER_ACCOUNT_KINDS,
  sameIdentity,
} from "@cawco/core/accounts";
import {
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_PROVIDER_LOGIN,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_JOIN_PROVIDER_ACCOUNT,
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_READ_HOME_LOGIN,
} from "@cawco/core/accounts/controls";
import { traitsOf } from "@cawco/core/harness/traits";
import type { ToolSigninChallenge } from "@cawco/core/tools";
import { accountsWords } from "@cawco/core/words/accounts";
import { problem } from "elysia";
import {
  accountOfIdentity,
  keepProbe,
  uncompared,
  withOrgIdFrom,
} from "./accounts";
import type { ClosureContext, HomeCredentialFound } from "./closure-context";
import type { LoginMove } from "./db/accounts";
import { SIGNIN_TIMEOUT_MS } from "./login-moves";
import type { Unanswered } from "./machine-answers";
import { awayProblem } from "./machine-answers";
import { unreachable } from "./unreachable";

export type AccountSigninContext = Pick<
  ClosureContext,
  | "advanceMove"
  | "callAgent"
  | "db"
  | "forgetOn"
  | "liveFrom"
  | "machineName"
  | "moveKey"
  | "moveResults"
  | "movingLogins"
  | "publishUsage"
  | "readAgent"
  | "rowsLeave"
  | "silentWords"
  | "tickMoves"
>;

export const createAccountSignin = (ctx: AccountSigninContext) => {
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

  /** Why an account of `provider` cannot be of `kind`; undefined when it can. */
  const accountKindRefusal = (
    provider: string,
    kind: AccountKind
  ): string | undefined => {
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
    const asked =
      traitsOf(store).homeLogin === "dir"
        ? await ctx.readAgent(
            machineId,
            CONTROL_READ_HOME_LOGIN,
            [],
            SIGNIN_TIMEOUT_MS,
            store
          )
        : await ctx.readAgent(
            machineId,
            CONTROL_READ_HOME_CREDENTIALS,
            [],
            SIGNIN_TIMEOUT_MS
          );
    switch (asked.kind) {
      case "unanswered":
        return asked.reason === "dead"
          ? awayProblem(machineId, awayWords(machineId, asked))
          : problem(503, {
              code: "home-login-refused",
              detail: awayWords(machineId, asked),
            });
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const read = asked.value;
    if (!read.ok) {
      return problem(422, {
        code: "home-login-refused",
        detail: read.error ?? `${machine} could not say what its stores hold.`,
      });
    }
    const traits = traitsOf(store);
    if (traits.homeLogin === "dir") {
      const home = read.result as HomeLogin;
      return home.loggedIn && home.identity
        ? ({
            identity: home.identity,
            kind: home.kind ?? "subscription",
            provider: traits.soleProvider,
            storeProvider: traits.soleProvider,
          } satisfies HomeCredentialFound)
        : problem(409, {
            code: "home-login-refused",
            detail: `${accountsWords.harnesses[store]} on ${machine} isn't signed in, so there is no login to move.`,
          });
    }
    const found = (read.result as HomeCredential[]).find(
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
   * A tool's own sign-in a machine has begun and not finished (core
   * `ToolSpec.signin`), by `machineId:toolId`: its link, kept until it is
   * used or lapses, so a screen that reloads or reopens shows that link
   * again instead of starting another.
   */
  const pendingToolSignins = new Map<string, ToolSigninChallenge>();

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
    const read = await ctx.readAgent(
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
    for (const found of read.value.result as HomeCredential[]) {
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
    payload: unknown
  ): string[] | undefined => {
    const stores = (payload as { accountStores?: unknown }).accountStores;
    if (!Array.isArray(stores)) {
      return undefined;
    }
    const unheld = stores.filter(
      (id): id is string => typeof id === "string" && !ctx.db.accounts.get(id)
    );
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
        ? await ctx.callAgent(
            machineId,
            CONTROL_JOIN_ACCOUNT_LOGIN,
            [fromId, existing.id, identity],
            SIGNIN_TIMEOUT_MS,
            "claude"
          )
        : await ctx.callAgent(
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
    const joined = answer.result as AccountJoinedOn;
    console.log(
      `[accounts] A new sign-in on ${ctx.machineName(machineId)} is ${identity.email}, which this hub already has as ${existingName}, so the two are one account there: ${joined.outcome === "kept" ? `${existingName}'s login on ${ctx.machineName(machineId)} is kept, and the new one is dropped` : `the new login is ${existingName}'s on ${ctx.machineName(machineId)} from now on`}.`
    );
    ctx.db.accounts.putSignin({
      accountId: existing.id,
      machineId,
      state: "signed-in",
      moved: null,
    });
    ctx.publishUsage(machineId);
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
      keepProbe(ctx.db, account.id, result.probe);
    }
    // Signed in here through CawCo: no longer the login that was moved.
    ctx.db.accounts.putSignin({
      accountId: account.id,
      machineId,
      state: result.state,
      moved: null,
    });
    ctx.publishUsage(machineId);
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
      ctx.db.accounts.putSignin({
        accountId: account.id,
        machineId,
        state: result.state,
        moved: null,
      });
      ctx.publishUsage(machineId);
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
  const completeOn = (
    account: Account,
    signinId: string,
    machineId: string,
    code: string | undefined
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? ctx.callAgent(
          machineId,
          CONTROL_COMPLETE_ACCOUNT_LOGIN,
          [code, signinId, expectedOf(account)],
          SIGNIN_TIMEOUT_MS,
          "claude"
        )
      : ctx.callAgent(
          machineId,
          CONTROL_COMPLETE_PROVIDER_LOGIN,
          [code ?? null, signinId, expectedOf(account)],
          SIGNIN_TIMEOUT_MS
        );

  /** Who a finished sign-in, of either kind, came out as. */
  const signedInAs = (
    account: Account,
    result: AccountSigninResult | ProviderSigninResult
  ): AccountIdentity | null | undefined => {
    if (account.provider === CLAUDE_PROVIDER) {
      return (result as AccountSigninResult).probe?.identity;
    }
    const provider = result as ProviderSigninResult;
    return provider.state === "signed-in" ? provider.identity : undefined;
  };

  /** A finished sign-in, kept on its account ({@link settleClaudeSignin}, {@link settleProviderSignin}). */
  const settleSignin = (
    account: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? settleClaudeSignin(account, machineId, result as AccountSigninResult)
      : settleProviderSignin(
          account,
          machineId,
          result as ProviderSigninResult
        );

  /**
   * A sign-in begun for `signinId`, an account a sign-in on another machine
   * has since joined into `into`: it finishes into `into` there too.
   */
  const finishJoined = async (
    signinId: string,
    into: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) => {
    const identity = signedInAs(into, result);
    if (result.state !== "signed-in" || !identity) {
      return result;
    }
    const joined = await joinOn(signinId, into, machineId, identity);
    return "error" in joined ? joined : { ...result, joined };
  };

  return {
    undoRemovedSignin,
    machineProviders,
    knownProviders,
    accountKindRefusal,
    homeCredentialOf,
    awayWords,
    pendingToolSignins,
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
