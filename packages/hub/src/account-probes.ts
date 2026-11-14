import type {
  AccountCheck,
  AccountProbe,
  AccountReport,
  PendingAccountSignin,
  ProviderSigninChallenge,
  RebalanceNotice,
  RefusalVerdict,
} from "@cawco/core/accounts";
import {
  CONTROL_CHECK_ACCOUNT,
  CONTROL_PROBE_ACCOUNT,
} from "@cawco/core/accounts/controls";
import { detach } from "@cawco/core/detach";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { accountsWords } from "@cawco/core/words/accounts";
import { configurePage } from "@cawco/core/words/configure";
import type { AccountProber } from "./accounts";
import {
  checkRefusal,
  probeRetryDelay,
  REFUSAL_CHECK_EVERY_MS,
  reconcileAccounts,
  refusalsDue,
  usageLimits,
} from "./accounts";
import type { ClosureContext } from "./closure-context";
import type { HubTimer } from "./lifetime";
import { SIGNIN_TIMEOUT_MS } from "./login-moves";
import { unreachable } from "./unreachable";

export type AccountProbesContext = Pick<
  ClosureContext,
  | "accountWords"
  | "accountsMoved"
  | "db"
  | "dispatcher"
  | "lifetime"
  | "machineFault"
  | "machineName"
  | "readAgent"
  | "registry"
  | "spendNow"
  | "stallOf"
  | "stalledNow"
  | "unansweredFault"
  | "workItems"
>;

export const createAccountProbes = (ctx: AccountProbesContext) => {
  /**
   * Why each account's models could not be read, as its last probe went (its
   * machine named), until a probe answers (core `AccountCatalogFault`): what
   * a picker says in place of an empty list. Kept in memory: a hub that
   * starts again probes again. A fault that changes says so to every
   * dashboard, as a catalog kept does.
   */
  const catalogFaults = new Map<string, string>();

  /**
   * The sign-ins machines have started and not finished, by `account:machine`
   * (core `PendingAccountSignin`): the link or device code each showed, so a
   * dashboard that reloads or reopens its popover shows the same one rather
   * than minting another. Kept in memory: the login it names lives on the
   * machine, and a hub that starts again has lost its answer anyway.
   */
  const pendingSignins = new Map<string, PendingAccountSignin>();
  /**
   * How long a Claude Code login's link is shown again: its `claude auth
   * login` waits with no clock of its own. Our choice, as long as a
   * connection's sign-in waits.
   */
  const PENDING_LINK_MS = 10 * 60_000;
  const pendingKey = (accountId: string, machineId: string): string =>
    `${accountId}:${machineId}`;
  /** What a machine showed for a sign-in it started, kept until it ends or lapses. */
  const keepPending = (
    accountId: string,
    machineId: string,
    challenge: ProviderSigninChallenge
  ): void => {
    pendingSignins.set(pendingKey(accountId, machineId), {
      accountId,
      machineId,
      challenge,
      expiresAt:
        "expiresAt" in challenge
          ? challenge.expiresAt
          : Date.now() + PENDING_LINK_MS,
    });
  };
  /** Every sign-in under way for an account let go: the account is gone. */
  const forgetPendingOf = (accountId: string): void => {
    for (const one of [...pendingSignins.values()]) {
      if (one.accountId === accountId) {
        pendingSignins.delete(pendingKey(accountId, one.machineId));
      }
    }
  };
  /** The pending sign-ins still live, the lapsed ones let go. */
  const livePendingSignins = (): PendingAccountSignin[] => {
    const now = Date.now();
    for (const [key, one] of pendingSignins) {
      if (one.expiresAt <= now) {
        pendingSignins.delete(key);
      }
    }
    return [...pendingSignins.values()];
  };
  const noteCatalogFault = (
    machineId: string,
    account: string,
    reason: string | undefined
  ): void => {
    const before = catalogFaults.get(account);
    if (reason === undefined) {
      catalogFaults.delete(account);
    } else {
      catalogFaults.set(account, reason);
    }
    if (before !== reason) {
      publishUsage(machineId);
    }
  };
  /**
   * One account dir's initialize response, read on its machine by a session
   * that never takes a turn. Undefined, and said in the log and as the
   * account's catalog fault, when it could not be read.
   */
  const probeAccount: AccountProber = async (machineId, account) => {
    const answer = await ctx.readAgent(
      machineId,
      CONTROL_PROBE_ACCOUNT,
      [account],
      SIGNIN_TIMEOUT_MS,
      "claude"
    );
    // Unanswered or refused, the account keeps what the hub last knew of it
    // (accounts.ts `refreshCatalog` writes nothing and tries again).
    switch (answer.kind) {
      case "unanswered": {
        const fault = ctx.unansweredFault(machineId, answer);
        console.warn(
          `[hub] account probe on ${ctx.machineName(machineId)} (${account}) was not answered: ${fault} (after ${answer.after} ms); the account keeps its last known state`
        );
        noteCatalogFault(
          machineId,
          account,
          `${ctx.machineName(machineId)} didn't answer the read of its models: ${fault}.`
        );
        return;
      }
      case "answered":
        if (!answer.value.ok) {
          const error = answer.value.error ?? "it gave no reason";
          console.warn(
            `[hub] account probe on ${ctx.machineName(machineId)} (${account}) was refused: ${error}`
          );
          noteCatalogFault(
            machineId,
            account,
            `Claude Code on ${ctx.machineName(machineId)} couldn't read its models: ${error}.`
          );
          return;
        }
        noteCatalogFault(machineId, account, undefined);
        return answer.value.result as AccountProbe;
      default:
        throw unreachable(answer);
    }
  };

  /**
   * How long a check's turn as an account may take on its machine: the
   * agent's own bound on the turn (agent accounts.ts `CHECK_TIMEOUT_MS`),
   * with its start and the keychain's look before it.
   */
  const REFUSAL_CHECK_TIMEOUT_MS = 2 * MINUTE_MS;
  /** The check of each account under way now, by account id: a second ask joins it ({@link checkRefused}). */
  const refusalChecks = new Map<string, Promise<RefusalVerdict>>();
  /**
   * Whether Claude Code still refuses `accountId` account-wide (accounts.ts
   * `checkRefusal`): one turn as the account on a connected machine its
   * refusal signed out ({@link CONTROL_CHECK_ACCOUNT}). Answered, the
   * account is back on every such machine, said in the log, and placement
   * and the rebalancer take it again ({@link publishUsage}). One check of an
   * account at a time: the hourly look ({@link checkDueRefusals}) and
   * Configure → Accounts' Check again share it.
   */
  const checkRefused = (accountId: string): Promise<RefusalVerdict> => {
    const running = refusalChecks.get(accountId);
    if (running !== undefined) {
      return running;
    }
    const named = ctx.accountWords(accountId);
    const run = checkRefusal(
      ctx.db,
      accountId,
      async (machineId, account) => {
        const answer = await ctx.readAgent(
          machineId,
          CONTROL_CHECK_ACCOUNT,
          [account],
          REFUSAL_CHECK_TIMEOUT_MS,
          "claude"
        );
        switch (answer.kind) {
          case "unanswered":
            return {
              kind: "unread",
              why: ctx.machineFault(
                machineId,
                answer.reason === "dead" ? "offline" : "silent",
                { next: false }
              ),
            };
          case "answered":
            return answer.value.ok
              ? (answer.value.result as AccountCheck)
              : {
                  kind: "unread",
                  why: answer.value.error
                    ? accountsWords.problem.checkWhy.notRunWith(
                        ctx.machineName(machineId),
                        answer.value.error
                      )
                    : accountsWords.problem.checkWhy.notRun(
                        ctx.machineName(machineId)
                      ),
                };
          default:
            throw unreachable(answer);
        }
      },
      (machineId) => ctx.registry.agent(machineId) !== undefined,
      ctx.machineName
    )
      .then((verdict) => {
        switch (verdict.kind) {
          case "back":
            console.info(
              `[accounts] ${named} is back on ${verdict.machines.map(ctx.machineName).join(", ")}: a turn as it was answered, so Claude Code no longer refuses it, and new sessions are placed on it again.`
            );
            for (const machineId of verdict.machines) {
              publishUsage(machineId);
            }
            break;
          case "refused":
            console.info(
              `[accounts] ${named} is still refused: ${verdict.reason}. It is checked again within ${REFUSAL_CHECK_EVERY_MS / HOUR_MS} hour, or on Check again in ${configurePage("accounts")}.`
            );
            publishUsage();
            break;
          case "none":
            console.warn(
              `[accounts] ${named}'s check gave no verdict (${verdict.why}); it stays out of placement until a check is answered.`
            );
            break;
          case "not-refused":
            break;
          default:
            throw unreachable(verdict);
        }
        return verdict;
      })
      .finally(() => refusalChecks.delete(accountId));
    refusalChecks.set(accountId, run);
    return run;
  };
  /**
   * Checks each account refused account-wide whose hour has come
   * (accounts.ts `refusalsDue`): at boot, then every
   * {@link REFUSAL_LOOK_MS} on the hub's lifetime timer (`lifetime.every`).
   * The hour is read off each account's kept time, so a restart neither
   * resets it nor checks early; an account with no machine connected is
   * looked at again at the next look.
   */
  const checkDueRefusals = (): void => {
    for (const accountId of refusalsDue(ctx.db, Date.now())) {
      detach(checkRefused(accountId), "account refusal check");
    }
  };
  /** How often the hub looks for refused accounts due a check: well under their hour, so one is checked close to it. */
  const REFUSAL_LOOK_MS = 5 * MINUTE_MS;

  /**
   * Each machine's last account report of each kind (its Claude dirs, its
   * provider stores), squared with the hub's accounts one at a time. A
   * probe that failed is tried again on accounts.ts `probeRetryDelay`,
   * while the machine is connected; a new report starts over.
   *
   * A report the same as the last one taken on this connection says
   * nothing new and is not taken: a machine says its stores again with
   * every heartbeat that carries its harnesses (pi's settings changed, say),
   * read when they last changed, and sign-ins the hub settled since then
   * would read as gone from it. The first on each connection is always
   * taken ({@link freshAccountReports}).
   */
  const accountSyncs = new Map<
    string,
    {
      attempt: number;
      /**
       * Undefined until the machine's connection has named its stores: those
       * read, and those Claude Code gave no answer for (`unread`).
       */
      reports: { reports: AccountReport[]; unread: string[] } | undefined;
      /** When `reports` came in: a sign-in settled since is not theirs to undo. */
      receivedAt: number;
      running: Promise<void>;
      timer?: HubTimer;
    }
  >();
  /** A machine's new connection: its first report of each kind is taken. */
  const freshAccountReports = (machineId: string): void => {
    for (const harness of ["claude", "providers"] as const) {
      const sync = accountSyncs.get(`${machineId}\u0000${harness}`);
      if (sync) {
        sync.reports = undefined;
      }
    }
  };
  const syncAccounts = (
    machineId: string,
    harness: "claude" | "providers",
    reports?: { reports: AccountReport[]; unread: string[] }
  ): void => {
    const key = `${machineId}\u0000${harness}`;
    const sync = accountSyncs.get(key) ?? {
      attempt: 0,
      reports: undefined,
      receivedAt: 0,
      running: Promise.resolve(),
    };
    if (reports && sync.reports && Bun.deepEquals(reports, sync.reports)) {
      return;
    }
    if (reports) {
      sync.reports = reports;
      sync.receivedAt = Date.now();
      sync.attempt = 0;
      ctx.lifetime.cancel(sync.timer);
    }
    accountSyncs.set(key, sync);
    sync.running = sync.running
      .then(async () => {
        // A retry after a new connection began waits for that connection's
        // own report.
        if (!sync.reports) {
          return;
        }
        const { changed, failed } = await reconcileAccounts(
          ctx.db,
          machineId,
          harness,
          sync.reports,
          sync.receivedAt,
          probeAccount
        );
        if (changed) {
          publishUsage(machineId);
          // A machine's sign-ins land after its register, behind probes: a
          // project whose start the register's look refused for want of a
          // signed-in account gets its look again now, not at the safety net.
          ctx.dispatcher.machineOnline(machineId);
        }
        if (failed && ctx.registry.agent(machineId)) {
          const delay = probeRetryDelay(sync.attempt);
          sync.attempt += 1;
          sync.timer = ctx.lifetime.after(delay, () =>
            syncAccounts(machineId, harness)
          );
        }
      })
      .catch(console.error);
  };
  /** The words each stopped session's work item last went out with ({@link publishStalls}). */
  const stallsShown = new Map<string, string>();
  /**
   * Each work item whose session's stop at its limit began, changed its
   * words or ended since it last went out goes out again (work-items
   * `stallChanged`): its tray chip says it at once.
   */
  const publishStalls = (): void => {
    for (const instanceId of new Set([
      ...stallsShown.keys(),
      ...ctx.stalledNow(),
    ])) {
      const words = ctx.stallOf(instanceId)?.words;
      if (words === stallsShown.get(instanceId)) {
        continue;
      }
      if (words === undefined) {
        stallsShown.delete(instanceId);
      } else {
        stallsShown.set(instanceId, words);
      }
      ctx.workItems.stallChanged(instanceId);
    }
  };
  /** What adding an account set moving, newest first, for the Accounts page (core `RebalanceNotice`). */
  const rebalanceNotices: RebalanceNotice[] = [];
  const REBALANCE_NOTICES_KEPT = 20;
  const publishUsage = (machineId = ""): void => {
    ctx.accountsMoved();
    ctx.registry.broadcast({
      verb: "frames",
      machineId,
      payload: {
        kind: "usage",
        ...usageLimits(ctx.db),
        spend: ctx.spendNow(),
      },
    });
  };

  return {
    catalogFaults,
    pendingSignins,
    pendingKey,
    keepPending,
    forgetPendingOf,
    livePendingSignins,
    probeAccount,
    checkRefused,
    checkDueRefusals,
    REFUSAL_LOOK_MS,
    freshAccountReports,
    syncAccounts,
    publishStalls,
    rebalanceNotices,
    REBALANCE_NOTICES_KEPT,
    publishUsage,
  };
};
