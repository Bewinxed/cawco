import type {
  AccountReport,
  PendingAccountSignin,
  ProviderAccountReading,
  ProviderSigninChallenge,
  RebalanceNotice,
  RefusalVerdict,
} from "@cawco/core/accounts";
import {
  CONTROL_CHECK_ACCOUNT,
  CONTROL_PROBE_ACCOUNT,
  CONTROL_READ_ACCOUNT_USAGE,
} from "@cawco/core/accounts/controls";
import { backoffSchedule } from "@cawco/core/effect/backoff-schedule";
import { makeJoin } from "@cawco/core/effect/join";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { accountsWords } from "@cawco/core/words/accounts";
import { configurePage } from "@cawco/core/words/configure";
import { Effect, type Fiber, Schema } from "effect";
import type { AccountProber } from "./accounts";
import {
  checkRefusal,
  noteProviderReading,
  PROBE_RETRIES,
  REFUSAL_CHECK_EVERY_MS,
  reconcileAccounts,
  refusalsDue,
  usageLimits,
} from "./accounts";
import type { ClosureContext } from "./closure-context";
import { SIGNIN_TIMEOUT_MS } from "./login-moves";
import { unreachable } from "./unreachable";

export type AccountProbesContext = Pick<
  ClosureContext,
  | "accountWords"
  | "accountsMoved"
  | "board"
  | "db"
  | "dispatcher"
  | "lifetime"
  | "machineCalls"
  | "machineFault"
  | "machineName"
  | "registry"
  | "spendNow"
  | "stallOf"
  | "stalledNow"
  | "triggers"
  | "unansweredFault"
  | "workItems"
>;

/** A pass of a machine's account report whose catalog probe could not be read: tried again ({@link PROBE_RETRIES}). */
class ProbesFailed extends Schema.TaggedError<ProbesFailed>()(
  "ProbesFailed",
  {}
) {}

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
  const pendingKey = (
    accountId: string,
    machineId: string,
    codex = false
  ): string => `${accountId}:${machineId}${codex ? ":codex" : ""}`;
  /** What a machine showed for a sign-in it started (`codex`: Codex's own), kept until it ends or lapses. */
  const keepPending = (
    accountId: string,
    machineId: string,
    challenge: ProviderSigninChallenge,
    codex = false
  ): void => {
    pendingSignins.set(pendingKey(accountId, machineId, codex), {
      accountId,
      machineId,
      challenge,
      ...(codex ? { codex: true as const } : {}),
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
        pendingSignins.delete(pendingKey(accountId, one.machineId, one.codex));
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
    const answer = await ctx.machineCalls.readAgent(
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
        return answer.value.result;
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
  const refusalChecks = makeJoin<string, RefusalVerdict, unknown>();
  /**
   * Whether Claude Code still refuses `accountId` account-wide (accounts.ts
   * `checkRefusal`): one turn as the account on a connected machine its
   * refusal signed out ({@link CONTROL_CHECK_ACCOUNT}). Answered, the
   * account is back on every such machine, said in the log, and placement
   * and the rebalancer take it again ({@link publishUsage}). One check of an
   * account at a time: the hourly look ({@link checkDueRefusals}) and
   * Configure → Accounts' Check again share it.
   */
  const refusalCheck = (
    accountId: string
  ): Effect.Effect<RefusalVerdict, unknown> =>
    refusalChecks.run(
      accountId,
      Effect.tryPromise({
        try: () => checkAccount(accountId),
        catch: (error) => error,
      })
    );
  /** The promise edge of {@link refusalCheck}. */
  const checkRefused = (accountId: string): Promise<RefusalVerdict> =>
    ctx.lifetime.run(refusalCheck(accountId));
  /** One check of `accountId`, said in the log and told to every screen ({@link checkRefused}). */
  const checkAccount = (accountId: string): Promise<RefusalVerdict> => {
    const named = ctx.accountWords(accountId);
    return checkRefusal(
      ctx.db,
      accountId,
      async (machineId, account) => {
        const answer = await ctx.machineCalls.readAgent(
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
              ? answer.value.result
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
    ).then((verdict) => {
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
    });
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
      ctx.lifetime.fork("account refusal check", refusalCheck(accountId));
    }
  };
  /** How often the hub looks for refused accounts due a check: well under their hour, so one is checked close to it. */
  const REFUSAL_LOOK_MS = 5 * MINUTE_MS;

  /**
   * Each machine's last account report of each kind (its Claude dirs, its
   * provider stores), squared with the hub's accounts one at a time per
   * machine and kind. A pass whose probe failed is tried again on
   * accounts.ts `PROBE_RETRIES`, while the machine is connected; a new
   * report starts the series over.
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
      /**
       * Undefined until the machine's connection has named its stores: those
       * read, and those Claude Code gave no answer for (`unread`).
       */
      reports: { reports: AccountReport[]; unread: string[] } | undefined;
      /** When `reports` came in: a sign-in settled since is not theirs to undo. */
      receivedAt: number;
      /** The passes of the report taken last, and their tries again. */
      series?: Fiber.Fiber<void>;
    }
  >();
  /** One pass at a time per machine and kind. */
  const accountPasses = makeKeyedLock<string>();
  /** A machine's new connection: its first report of each kind is taken. */
  const freshAccountReports = (machineId: string): void => {
    for (const harness of ["claude", "providers"] as const) {
      const sync = accountSyncs.get(`${machineId}\u0000${harness}`);
      if (sync) {
        sync.reports = undefined;
      }
    }
  };
  /**
   * One pass of the report `sync` holds, in its turn. Fails, to be tried
   * again, when a probe it needed could not be read and the machine is
   * still connected. A pass after a new connection began, before that
   * connection's own report, does nothing.
   */
  const accountPass = (
    machineId: string,
    harness: "claude" | "providers",
    key: string,
    sync: {
      reports?: { reports: AccountReport[]; unread: string[] };
      receivedAt: number;
    }
  ): Effect.Effect<void, ProbesFailed> =>
    accountPasses.withLock(
      key,
      Effect.gen(function* () {
        const { reports } = sync;
        if (!reports) {
          return;
        }
        const { changed, failed } = yield* Effect.promise(() =>
          reconcileAccounts(
            ctx.db,
            machineId,
            harness,
            reports,
            sync.receivedAt,
            probeAccount
          )
        );
        if (changed) {
          publishUsage(machineId);
          // A machine's sign-ins land after its register, behind probes: a
          // project whose start the register's look refused for want of a
          // signed-in account gets its look again now, not at the safety net.
          ctx.dispatcher.machineOnline(machineId);
          // Likewise a project's held triggers, which start where its
          // account is signed in (lead-home.ts).
          const { triggers } = ctx;
          if (triggers) {
            ctx.lifetime.fork(
              "run the projects' held triggers",
              Effect.tryPromise(() => triggers.machineOnline(machineId))
            );
          }
        }
        if (failed && ctx.registry.agent(machineId)) {
          return yield* new ProbesFailed();
        }
      }).pipe(
        // A pass runs whole once begun: a new report's series waits its turn, never cuts a pass in two.
        Effect.uninterruptible
      )
    );
  const syncAccounts = (
    machineId: string,
    harness: "claude" | "providers",
    reports?: { reports: AccountReport[]; unread: string[] }
  ): void => {
    const key = `${machineId}\u0000${harness}`;
    const sync = accountSyncs.get(key) ?? {
      reports: undefined,
      receivedAt: 0,
    };
    if (reports && sync.reports && Bun.deepEquals(reports, sync.reports)) {
      return;
    }
    if (reports) {
      sync.reports = reports;
      sync.receivedAt = Date.now();
    }
    accountSyncs.set(key, sync);
    // A new report starts the series over: the one before stops at its
    // next wait, or once its pass under way ends.
    sync.series?.interruptUnsafe();
    sync.series = ctx.lifetime.fork(
      "account probe retried",
      Effect.retryOrElse(
        accountPass(machineId, harness, key, sync),
        backoffSchedule(PROBE_RETRIES),
        (_failed, tries) =>
          Effect.sync(() => {
            console.warn(
              `[accounts] ${machineId} ${harness}: probes failed ${tries.tries} times in a row; none is tried again until the machine reports its accounts anew`
            );
          })
      )
    );
  };
  /** The words each stopped session's work item last went out with ({@link publishStalls}). */
  const stallsShown = new Map<string, string>();
  /**
   * Each work item whose session's stop at its limit began, changed its
   * words or ended since it last went out goes out again (work-items
   * `stallChanged`): its tray chip says it at once.
   */
  const publishStalls = (): void => {
    // The board's rows say their stall too.
    ctx.board.stallsMoved();
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
  // @limit recording: hub.rebalance-notice-dropped-age-ms until 2026-12-03
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

  /**
   * How long the hub waits on a machine's read of one account now: the
   * provider's answer (5 s on Claude's, its CLI's own bound) and, for a
   * login past its expiry, Claude Code's `auth status` renewing it first.
   */
  // @limit recording: hub.account-read-now-ms until 2026-12-26
  const READ_NOW_TIMEOUT_MS = 10_000;

  /**
   * One account's windows read now, from its provider's usage endpoint on a
   * connected machine it is signed in on, each tried in turn until one
   * reads them (agent provider-usage.ts `readAccountUsage`): the check a pick
   * of the account makes, for any provider with a reader. The reading is the
   * account's at once ({@link noteProviderReading}) and every screen hears
   * it. `unread` says why none was read, in words: no machine to read on,
   * none that answered, or the provider's refusal (a login the endpoint
   * refuses, a setup-token's). Nothing is guessed in its place.
   */
  const readAccountUsageNow = async (
    accountId: string
  ): Promise<
    | { kind: "read"; machineId: string; reading: ProviderAccountReading }
    | { kind: "unread"; why: string }
  > => {
    const machines = [
      ...new Set(
        ctx.db.accounts
          .signins()
          .filter(
            (one) =>
              one.accountId === accountId &&
              one.state === "signed-in" &&
              ctx.registry.agent(one.machineId) !== undefined
          )
          .map((one) => one.machineId)
      ),
    ];
    const named = ctx.accountWords(accountId);
    const whys: string[] = [];
    for (const machineId of machines) {
      const asked = Date.now();
      const answer = await ctx.machineCalls.readAgent(
        machineId,
        CONTROL_READ_ACCOUNT_USAGE,
        [accountId],
        READ_NOW_TIMEOUT_MS
      );
      recordLimitReading("hub.account-read-now-ms", Date.now() - asked);
      const machine = ctx.machineName(machineId);
      if (answer.kind === "unanswered") {
        whys.push(
          `${machine} didn't answer: ${ctx.unansweredFault(machineId, answer)}`
        );
        continue;
      }
      if (!answer.value.ok) {
        whys.push(
          `${machine} refused the read: ${answer.value.error ?? "it gave no reason"}`
        );
        continue;
      }
      const reading = answer.value.result;
      if (!reading) {
        whys.push(`${machine} has no usage reader for it`);
        continue;
      }
      if (reading.error) {
        whys.push(`${machine} couldn't read it: ${reading.error}`);
        continue;
      }
      if (noteProviderReading(ctx.db, machineId, reading)) {
        publishUsage(machineId);
      }
      return { kind: "read", machineId, reading };
    }
    const why =
      machines.length === 0
        ? `${named} is signed in on no connected machine, so its usage was not read`
        : `${named}'s usage was not read: ${whys.join("; ")}`;
    console.warn(`[accounts] ${why}`);
    return { kind: "unread", why };
  };

  return {
    readAccountUsageNow,
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
