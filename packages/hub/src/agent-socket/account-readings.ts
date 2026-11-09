/** What a session's Claude Code reported about its account. */

import {
  accountNameAmong,
  CLAUDE_PROVIDER,
  sameIdentity,
} from "@cawco/core/accounts";
import { detach } from "@cawco/core/detach";
import { ACCOUNT_READ, RATE_LIMIT_READ } from "@cawco/core/harness";
import {
  keepReading,
  noteRateLimit,
  refreshCatalog,
  uncompared,
  withOrgIdFrom,
} from "../accounts";
import type { HubContext } from "../hub-context";
import { onSessionFrame } from "./frame-run";

export type AccountReadingsContext = Pick<
  HubContext,
  | "db"
  | "limitRefused"
  | "machineName"
  | "probeAccount"
  | "processGeneration"
  | "publishUsage"
>;

export const accountReadingStagesOf = (ctx: AccountReadingsContext) => {
  const accountRead = onSessionFrame(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
    ({ message, agentFrame }, frame, instanceId) => {
      // What the session's Claude Code reported about its account:
      // its limits, from each `rate_limit_event`, and its plan, once
      // per start. The account's reading, and no screen's line. A
      // session's readings are its row's account's while that
      // account is signed in on the machine, where the session runs
      // in its dir. One that is not (a process launched in the
      // machine's own `~/.claude` before accounts were CawCo's
      // alone) reads nobody CawCo knows, and is kept by nobody.
      if (
        frame.message.type === "system" &&
        (frame.message.subtype === RATE_LIMIT_READ ||
          frame.message.subtype === ACCOUNT_READ)
      ) {
        const [row] = ctx.db.getInstancesByIds([instanceId]);
        // A reading from a process its row has since replaced
        // (a move relaunched it on another account) is of no
        // account the row names: dropped, never let it say who is
        // signed in. The row names the account of the launch it
        // has now, as a move waits for it ({@link owedMoves}).
        if (
          !row ||
          agentFrame.processGeneration !== ctx.processGeneration(row)
        ) {
          return "stop";
        }
        const accountId =
          row.accountId &&
          ctx.db.accounts
            .signins()
            .some(
              (one) =>
                one.accountId === row.accountId &&
                one.machineId === message.machineId &&
                one.state === "signed-in"
            )
            ? row.accountId
            : undefined;
        if (!accountId) {
          return "stop";
        }
        const read = frame.message.account;
        const stored = ctx.db.accounts.get(accountId);
        const account =
          stored && read?.identity
            ? withOrgIdFrom(ctx.db, stored, read.identity)
            : stored;
        if (read?.identity && !read.identity.orgId) {
          // Its dir's login named no org id the agent could
          // carry over: whose process it is is not known, and its
          // reading is no account's.
          uncompared(read.identity, `${instanceId}'s Claude Code`);
          return "stop";
        }
        if (
          read?.identity &&
          account?.identity &&
          !sameIdentity(account.identity, read.identity)
        ) {
          // A process signed in as someone else: its reading and
          // catalog are not this account's. Whether the account
          // is signed in there is its dir's reading to say
          // (`reconcileAccounts`, read again every minute), not one
          // process's: a process launched before a move answers
          // for the dir it started in, and marking the account
          // from it held it "mismatch" with its own login intact,
          // since an unchanged reading is never squared again.
          console.warn(
            `[hub] ${instanceId} runs on ${accountNameAmong(account, ctx.db.accounts.list())} but its Claude Code is signed in as someone else on ${ctx.machineName(message.machineId)}; its reading is dropped, and the account's sign-in there is its dir's reading`
          );
          return "stop";
        }
        const info = frame.message.rate_limit_info;
        if (info) {
          noteRateLimit(ctx.db, accountId, info, row.model);
          if (info.status === "rejected" && !info.isUsingOverage) {
            ctx.limitRefused.add(instanceId);
          }
        }
        if (read) {
          keepReading(ctx.db, accountId, read);
        }
        // A session starting on the account reads its catalog
        // again once it is stale, through a probe that names no
        // model: the session's own initialize lists models around
        // its own (a session started on "pi" listed a "pi" row).
        if (
          frame.message.subtype === ACCOUNT_READ &&
          account?.provider === CLAUDE_PROVIDER
        ) {
          const { machineId: probedOn } = message;
          detach(
            refreshCatalog(
              ctx.db,
              probedOn,
              account,
              ctx.probeAccount,
              "stale"
            ).then((went) => {
              if (went === "read") {
                ctx.publishUsage(probedOn);
              }
            }),
            "account catalog refresh"
          );
        }
        ctx.publishUsage(message.machineId);
        return "stop";
      }
      return "continue";
    }
  );

  return { accountRead };
};
