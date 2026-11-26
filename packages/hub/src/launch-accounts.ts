import type { AccountProvider } from "@cawco/core/accounts";
import {
  accountNameAmong,
  accountProvidersOf,
  CLAUDE_PROVIDER,
  isChatgptPlan,
} from "@cawco/core/accounts";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { SpawnPayload } from "@cawco/core/protocol";
import type { SendRefusal } from "@cawco/core/session-messages";
import { chatgptPlanWords } from "@cawco/core/words/chatgpt-plan";
import { configurePage } from "@cawco/core/words/configure";
import { spawnWords } from "@cawco/core/words/spawn";
import { keptOffIn } from "./account-marks";
import type { LoginMove } from "./db/accounts";
import type { HubContext } from "./hub-context";
import type { AccountUse } from "./hub-shapes";
import {
  namedIn,
  noAccountRefusal,
  place as placeAccount,
  signedInForWords,
} from "./placement";

export type LaunchAccountsContext = Pick<
  HubContext,
  | "db"
  | "homeMovedAccountOn"
  | "machineName"
  | "placementInput"
  | "refusedHarness"
  | "resolvedModel"
  | "signinsFor"
>;

export const createLaunchAccounts = (ctx: LaunchAccountsContext) => {
  /**
   * Whether `accountId` can run `harness` on `machineId`: signed in there
   * for that harness, as placement reads it (placement.ts
   * `harnessSignins`): Codex on the account's Codex home, signed in by
   * Codex itself; any other on the account's own sign-in. The launch's
   * last guard, after placement chose only such accounts.
   */
  const signedInFor = (
    harness: HarnessKind,
    accountId: string,
    machineId: string
  ): boolean =>
    ctx
      .signinsFor(harness)
      .some(
        (one) =>
          one.accountId === accountId &&
          one.machineId === machineId &&
          one.state === "signed-in"
      );
  /**
   * The provider whose accounts a session of `model` in `harness` on
   * `machineId` is placed among: of those that open the model (core
   * `accountProvidersOf`), the provider of the account the start names
   * (`account`: an id, nickname or email) when it opens it, so a start that
   * names an OpenAI API key runs on that key even where a ChatGPT plan is
   * signed in; else the first with an account signed in there.
   */
  const accountProviderFor = (
    machineId: string,
    harness: string,
    model: string | null | undefined,
    account?: string
  ): AccountProvider | undefined => {
    const candidates = accountProvidersOf(
      harness,
      ctx.resolvedModel(machineId, harness, model)
    );
    if (traitsOf(harness).soleProvider !== null) {
      return candidates[0];
    }
    const named = account
      ? namedIn(ctx.db.accounts.list(), account)
      : undefined;
    if (named && candidates.includes(named.provider)) {
      return named.provider;
    }
    // Signed in for its harness: a Codex session's providers by Codex's
    // own sign-ins (core accounts/harness-signins.ts `harnessSignins`).
    const signedIn = new Set(
      ctx
        .signinsFor(harness)
        .filter(
          (one) => one.machineId === machineId && one.state === "signed-in"
        )
        .map((one) => one.accountId)
    );
    const accounts = ctx.db.accounts.list();
    const found = candidates.find((provider) =>
      accounts.some((one) => one.provider === provider && signedIn.has(one.id))
    );
    // A harness with no machine login of its own (Codex) runs on an account
    // or not at all: with none signed in for it here, it is placed among
    // its provider's accounts anyway, so placement refuses it in words
    // (placement.ts `place`) rather than it starting on none.
    if (found || traitsOf(harness).homeLogin !== "none") {
      return found;
    }
    return (
      candidates.find((provider) =>
        accounts.some((one) => one.provider === provider)
      ) ?? candidates[0]
    );
  };
  /**
   * The account a session launches on, on `machineId`, or why it can't
   * launch there. A Claude session always runs in its account's own dir and
   * never in the machine's `~/.claude`, but for one that runs on the
   * machine's own login while that moves into CawCo ({@link homeLoginMoveOf}),
   * which launches on it there until it lands: one whose account has no signed-in
   * sign-in there is refused (nothing moves it to another account on its
   * own), and so is one with no account at all once placement finds none. A
   * Claude row with no account (it ran in `~/.claude` before accounts) is
   * placed now, like a new session, and its row names that account from here
   * on; the machine carries its conversation into the account's dir. A pi or
   * OpenCode session on a ChatGPT model runs on a ChatGPT account where its
   * machine has one signed in for its harness, and is placed the same way;
   * any other runs on no account. Every launch asks this before its row
   * opens, and {@link bounded} refuses any that did not.
   */
  /**
   * The account a launch placed a Claude row with a conversation on, by row:
   * its data is carried there by that launch, and its row names the account
   * only once the launch's agent says the data is there
   * ({@link SESSION_DIR_READ}). Held meanwhile so every look at that launch
   * (its refusal check, its mode, its payload) agrees, for as long as a
   * launch takes to say; a launch that never does leaves the row as it was.
   */
  const launchClaims = new Map<string, { accountId: string; at: number }>();
  /** How long a launch's placement is held for its agent's word. */
  const CLAIM_HOLD_MS = 120_000;

  /** The placement a launch of `rowId` holds, while it holds one. */
  const heldClaim = (rowId: string): string | undefined => {
    const held = launchClaims.get(rowId);
    if (held && Date.now() - held.at > CLAIM_HOLD_MS) {
      launchClaims.delete(rowId);
      return;
    }
    return held?.accountId;
  };

  /**
   * Places a row on `accountId` for its launch. A Claude row with a
   * conversation has data to carry, so its row waits for the launch's word
   * ({@link launchClaims}); any other has none, and its row names the account
   * now.
   */
  const placeForLaunch = (
    rowId: string,
    accountId: string,
    why: string
  ): void => {
    const [row] = ctx.db.getInstancesByIds([rowId]);
    if (row && traitsOf(row.harness).accountDir && row.sessionId) {
      launchClaims.set(rowId, { accountId, at: Date.now() });
      console.log(spawnWords.launchesOnLine(rowId, accountId, why));
      return;
    }
    ctx.db.patchInstance(rowId, { accountId });
    console.log(`[hub] ${rowId} runs on ${accountId} from now on (${why})`);
  };

  /**
   * The account a row with no account would be placed on now, like a new
   * session, and why, without placing it: a launch already placed holds its
   * account ({@link heldClaim}); one that ran from the machine's own login,
   * which has moved into an account since, runs on that account
   * (`repinMovedFrom`); any other is placed. Nothing when placement
   * finds none. Only a launch acts on it ({@link claimAccount}).
   */
  const accountToPlace = (
    machineId: string,
    row: {
      harness: HarnessKind;
      id: string;
      model?: string | null;
      projectId?: string | null;
    }
  ):
    | { accountId?: string; moved?: true; placed?: string }
    | { refusal: string } => {
    const held = heldClaim(row.id);
    if (held) {
      return { accountId: held };
    }
    const plan = backOnPlan(machineId, row);
    if (plan) {
      return plan;
    }
    const moved =
      traitsOf(row.harness).accountDir && movedFrom().has(row.id)
        ? ctx.homeMovedAccountOn(machineId)
        : undefined;
    if (moved) {
      return { accountId: moved, moved: true };
    }
    const input = ctx.placementInput(
      machineId,
      {
        instanceId: row.id,
        cwd: "",
        harness: row.harness,
        ...(row.model ? { model: row.model } : {}),
      },
      { projectId: row.projectId },
      undefined
    );
    // It keeps off an account a provider refused its model, as a start
    // whose model the hub picks does (account-marks.ts).
    const placed = input
      ? placeAccount({
          ...input,
          ...keptOffIn(
            ctx.db,
            row.harness,
            ctx.resolvedModel(machineId, row.harness, row.model)
          ),
        })
      : undefined;
    if (!placed?.ok) {
      return placed ? { refusal: placed.refusal } : {};
    }
    return placed.accountId
      ? { accountId: placed.accountId, placed: placed.why }
      : {};
  };

  /**
   * A row a ChatGPT plan's removal or sign-out left on no account: back on
   * that plan once it is signed in for the row's harness on its machine
   * again ({@link signedInFor}), and on no other (core `isChatgptPlan`).
   * Till then it is refused, its refusal offering to continue it on the
   * person's API key or on another agent or model. Undefined for any other
   * row: it is placed as any is.
   */
  const backOnPlan = (
    machineId: string,
    row: { harness: HarnessKind; id: string }
  ):
    { accountId: string; placed: string } | { refusal: string } | undefined => {
    const left = ctx.db.accounts.strandedOf(row.id);
    if (!(left?.provider && isChatgptPlan({ provider: left.provider }))) {
      return;
    }
    const plan = left.accountId
      ? ctx.db.accounts.get(left.accountId)
      : undefined;
    if (plan && signedInFor(row.harness, plan.id, machineId)) {
      return {
        accountId: plan.id,
        placed: chatgptPlanWords.backOnPlan(left.accountName),
      };
    }
    return {
      refusal: chatgptPlanWords.leftRefusal(
        left.accountName,
        left.why === "removed" ? null : ctx.machineName(machineId),
        signedInForWords(row.harness)
      ),
    };
  };

  /**
   * A row with no account, placed now for its launch ({@link accountToPlace}):
   * its row names the account from its launch on ({@link placeForLaunch}).
   * Nothing when placement finds none.
   */
  const claimAccount = (
    machineId: string,
    row: Parameters<typeof accountToPlace>[1]
  ): { accountId?: string } | { refusal: string } => {
    const chosen = accountToPlace(machineId, row);
    if ("refusal" in chosen || !chosen.accountId) {
      return chosen;
    }
    const { accountId } = chosen;
    if (chosen.moved) {
      ctx.db.accounts.removeMovedFrom(row.id);
      placeForLaunch(
        row.id,
        accountId,
        `it ran on ${ctx.machineName(machineId)}'s own login, which moved there`
      );
    } else if (chosen.placed !== undefined) {
      placeForLaunch(
        row.id,
        accountId,
        `it ran on no account; ${chosen.placed}`
      );
    }
    return { accountId };
  };
  /** {@link claimAccount} for a launch that goes, {@link accountToPlace} for one only asked about. */
  const accountFor = (
    machineId: string,
    row: Parameters<typeof accountToPlace>[1],
    use: AccountUse
  ): { accountId?: string } | { refusal: string } =>
    use === "claim"
      ? claimAccount(machineId, row)
      : accountToPlace(machineId, row);
  const launchAccount = (
    machineId: string,
    row: Parameters<typeof accountLaunch>[1],
    session: string,
    use: AccountUse
  ):
    | { accountId?: string; homeLoginMove?: { accountId: string } }
    | { refusal: string; cause?: SendRefusal } => {
    // A machine that refuses every start of the harness's CLI is refused
    // for that, in its row's words, before any account is asked about: its
    // refused report is filed signed out, which reads as no account.
    const refused = ctx.refusedHarness(machineId, row.harness);
    if (refused) {
      // No cause: none of SendRefusal's ways back meets it, and the apps
      // read that union closed. The session's surface says the machine's
      // block, with its fix, in place of the start (dashboard HarnessBlock).
      return { refusal: refused };
    }
    // The machine's own Claude login is moving into an account and has not
    // yet: a session that runs on it runs on it until it lands.
    const move = homeLoginMoveOf(machineId, row);
    return move
      ? { homeLoginMove: { accountId: move.accountId } }
      : accountLaunch(machineId, row, session, use);
  };
  /** Why a session can't run on an account not signed in for its harness there. */
  const signedOutWords = (
    harness: HarnessKind,
    named: string,
    machine: string,
    session: string
  ): string => {
    const forWhat = signedInForWords(harness);
    return `${named} isn't signed in${forWhat} on ${machine}, so ${session} can't run there. Sign ${named} in${forWhat} on ${machine} in ${configurePage("accounts")}, or continue the session on another account.`;
  };
  /** {@link launchAccount} for a session on a CawCo account, or to be placed on one. */
  const accountLaunch = (
    machineId: string,
    row: {
      accountId?: string | null;
      harness: HarnessKind;
      id?: string;
      model?: string | null;
      projectId?: string | null;
    },
    session: string,
    use: AccountUse
  ): { accountId?: string } | { refusal: string; cause: SendRefusal } => {
    const { harness } = row;
    // A row on an account stays on it (nothing moves it on its own); one
    // with none is placed when its model is an account provider's here. So
    // is one whose account a person removed while its process still ran
    // (its row names that account until the process is gone, `leaveAccounts`):
    // no account is not one.
    const on = row.accountId ? ctx.db.accounts.get(row.accountId) : undefined;
    const provider = on
      ? on.provider
      : accountProviderFor(machineId, harness, row.model);
    if (!provider) {
      return {};
    }
    const machine = ctx.machineName(machineId);
    const claimed =
      on || !row.id
        ? { accountId: on?.id }
        : accountFor(machineId, { ...row, id: row.id }, use);
    if ("refusal" in claimed) {
      return {
        refusal: claimed.refusal,
        cause: { kind: "no-account", machineId },
      };
    }
    const { accountId } = claimed;
    if (!accountId) {
      return traitsOf(harness).accountDir
        ? {
            refusal: noAccountRefusal(machine),
            cause: { kind: "no-account", machineId },
          }
        : {};
    }
    if (signedInFor(harness, accountId, machineId)) {
      return { accountId };
    }
    const account = ctx.db.accounts.get(accountId);
    const named = account
      ? accountNameAmong(account, ctx.db.accounts.list())
      : accountId;
    return {
      refusal: signedOutWords(harness, named, machine, session),
      cause: { kind: "account-signed-out", accountId, machineId },
    };
  };
  /**
   * The credentials moving out of a machine's own stores into CawCo now
   * (pi's and OpenCode's each when its machine connects,
   * `adoptHomeCredentials`; any by `POST /api/accounts/move-login`),
   * with the account each moves into,
   * kept in the database (`login_moves`) so a hub restart carries each on.
   * While one is, the sessions that run from it ({@link movingFor}) go on
   * running from it, woken and started as ever, and the move itself runs at
   * the first moment every one of them is at rest ({@link advanceMove}).
   */
  const movingLogins = (): LoginMove[] => ctx.db.accounts.moves();
  const moveKey = ({
    machineId,
    store,
    storeProvider,
  }: Pick<LoginMove, "machineId" | "store" | "storeProvider">): string =>
    `${machineId}\u0000${store}\u0000${storeProvider}`;
  /** The moves with a step under way in this hub: their sessions asked whether they are at rest, or the machine moving it. */
  const stepping = new Set<string>();
  /**
   * The sessions whose process still runs from a credential that has moved
   * out of its machine's store, by instance id → machine id, kept in the
   * database (`moved_from_sessions`). Each was at rest when it moved; each is
   * put to sleep at rest, so its next wake launches it where the credential
   * is now. Claude Code keeps the access token it read until that expires,
   * and never refreshes it once its store no longer holds it: 2.1.289 clears
   * its cache before every refresh (`ZT()` → `DI()`, `cache={data:null}`) and
   * reads the store again. pi and OpenCode read their `auth.json` again
   * before a refresh too (pi-ai's `credentials.modify`, OpenCode's
   * `Auth.get` on every request).
   */
  const movedFrom = (): Map<string, string> => ctx.db.accounts.movedFrom();
  /**
   * Whether `accountId` has a sign-in row on `machineId`, in any state: an
   * account CawCo placed there. A Claude session on one with none ran on the
   * machine's own login.
   */
  const placedOn = (machineId: string, accountId: string): boolean =>
    ctx.db.accounts
      .signins()
      .some(
        (one) => one.accountId === accountId && one.machineId === machineId
      );
  /** Whether any Claude account is signed in on `machineId`. */
  const claudeSignedInOn = (machineId: string): boolean =>
    ctx.db.accounts
      .signins()
      .some(
        (one) =>
          one.machineId === machineId &&
          one.state === "signed-in" &&
          ctx.db.accounts.get(one.accountId)?.provider === CLAUDE_PROVIDER
      );
  /**
   * The Claude move pending on `machineId` whose login a session there runs
   * on until it lands ({@link SpawnPayload.homeLoginMove}): one on the
   * account it moves into, on no account, or on an account CawCo never
   * placed there ({@link placedOn}).
   */
  const homeLoginMoveOf = (
    machineId: string,
    row: { accountId?: string | null; harness?: string | null }
  ) =>
    traitsOf(row.harness).homeLogin === "dir"
      ? movingLogins().find(
          (move) =>
            move.store === row.harness &&
            move.machineId === machineId &&
            (!row.accountId ||
              row.accountId === move.accountId ||
              !placedOn(machineId, row.accountId))
        )
      : undefined;
  /**
   * Whether a start nobody put on an account runs on the machine's own
   * Claude login: it is moving into CawCo, and no Claude account is signed
   * in there yet. A fork runs where its origin ran.
   */
  const startsOnHomeLogin = (
    machineId: string,
    payload: SpawnPayload
  ): boolean =>
    !(payload.account || payload.resume?.fork) &&
    homeLoginMoveOf(machineId, payload) !== undefined &&
    !claudeSignedInOn(machineId);
  /**
   * The move under way of the credential `row` runs from: a Claude session
   * on the machine's own login ({@link homeLoginMoveOf}); a pi or OpenCode
   * session on no account whose model is the moving provider's, which runs
   * from the machine's own store.
   */
  const movingFor = (row: {
    accountId?: string | null;
    harness: HarnessKind;
    machineId: string;
    model?: string | null;
  }) => {
    const { harness } = row;
    if (traitsOf(harness).homeLogin === "dir") {
      return homeLoginMoveOf(row.machineId, row);
    }
    return movingLogins().find(
      (move) =>
        move.machineId === row.machineId &&
        move.store === harness &&
        !row.accountId &&
        accountProvidersOf(harness, row.model).includes(move.provider)
    );
  };
  /** {@link launchAccount}'s refusal, or undefined when the session can launch. */
  const accountStartRefusal = (
    machineId: string,
    row: Parameters<typeof launchAccount>[1],
    session: string
  ): string | undefined => {
    const launch = launchAccount(machineId, row, session, "claim");
    return "refusal" in launch ? launch.refusal : undefined;
  };

  return {
    accountProviderFor,
    launchClaims,
    heldClaim,
    accountToPlace,
    claimAccount,
    launchAccount,
    accountLaunch,
    movingLogins,
    moveKey,
    stepping,
    movedFrom,
    placedOn,
    homeLoginMoveOf,
    startsOnHomeLogin,
    movingFor,
    accountStartRefusal,
  };
};
