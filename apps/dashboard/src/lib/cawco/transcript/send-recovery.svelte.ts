/**
 * The way back from a send the hub refused (core `SendRefusal`), as its row
 * offers it: what happened and why, in the error formula's words (WORDS.md),
 * and the actions that recover from it, wired to what the dashboard already
 * does — the account's sign-in page, the session menu's move to another
 * account, the New session dialog, the session a newer work item runs in,
 * the session's own permission picker (ModePick).
 *
 * It is read against the fleet as it stands now, not as it stood when the
 * send failed: once the account is signed in, the session has moved, or the
 * machine is back, what refused the send no longer holds, and the row says
 * so and offers Send again.
 */
import {
  type Account,
  type HarnessKind,
  type ModeAsk,
  machineLabel,
  type SendRefusal,
} from "@cawco/core";
import { nameOf, signinState } from "../accounts/model.svelte";
import { signedInHere } from "../accounts/switch.svelte";
import { type BoardRow, cawco } from "../client.svelte";
import { conversationHref } from "../links";

/** One way back, as a row action draws it. */
export type RecoveryAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "move"; account: Account }
  | { kind: "new-session"; machineId: string; projectId?: string }
  | { kind: "mode"; machineId: string; harness: HarnessKind };

export interface SendRecovery {
  /** What recovers from it while it holds. */
  actions: RecoveryAction[];
  /**
   * A question, not a failure: the line stands alone, never after "Couldn't
   * send that message." (no permission mode named yet: the row asks for one).
   */
  asks?: true;
  /** What refused the send still holds: sending it again would fail the same way. */
  holds: boolean;
  /** What happened and why, after "Couldn't send that message." */
  line: string;
}

const machineOf = (machineId: string): string => {
  const machine = cawco.machines.find((one) => one.machineId === machineId);
  return machine ? machineLabel(machine.hostname) : machineId;
};

const accountOf = (accountId: string): Account | undefined =>
  cawco.accounts?.accounts.find((one) => one.id === accountId);

function signedOut(
  refusal: Extract<SendRefusal, { kind: "account-signed-out" }>,
  session: BoardRow
): SendRecovery {
  const machine = machineOf(refusal.machineId);
  const account = accountOf(refusal.accountId);
  const named = account ? nameOf(account) : "Its account";
  if (session.accountId && session.accountId !== refusal.accountId) {
    const now = accountOf(session.accountId);
    return {
      line: `This session runs on ${now ? nameOf(now) : "another account"} now.`,
      holds: false,
      actions: [],
    };
  }
  const signins = cawco.accounts?.signins ?? [];
  if (
    signinState(signins, refusal.accountId, refusal.machineId) === "signed-in"
  ) {
    return {
      line: `${named} is signed in on ${machine} now.`,
      holds: false,
      actions: [],
    };
  }
  return {
    line: `${named} isn't signed in on ${machine}, so this session can't run there. The message is kept here.`,
    holds: true,
    actions: [
      {
        kind: "link",
        label: `Sign in on ${machine}`,
        href: `/config/accounts/${encodeURIComponent(refusal.accountId)}`,
      },
      ...signedInHere(session)
        .filter((one) => one.id !== refusal.accountId)
        .map((one) => ({ kind: "move" as const, account: one })),
    ],
  };
}

/**
 * What a refused send's row says and offers, or null for a refusal nothing
 * here recovers from (one only another session's message meets: finished
 * work it may not continue).
 */
export function recoveryOf(
  refusal: SendRefusal,
  session: BoardRow
): SendRecovery | null {
  switch (refusal.kind) {
    case "account-signed-out":
      return signedOut(refusal, session);
    case "no-account": {
      const machine = machineOf(refusal.machineId);
      if (signedInHere(session).length > 0) {
        return {
          line: `An account is signed in on ${machine} now.`,
          holds: false,
          actions: [],
        };
      }
      return {
        line: `No account this session can run on is signed in on ${machine}. The message is kept here.`,
        holds: true,
        actions: [
          {
            kind: "link",
            label: `Sign in on ${machine}`,
            href: "/config/accounts",
          },
        ],
      };
    }
    case "machine-away": {
      const machine = machineOf(refusal.machineId);
      const back =
        cawco.machines.find((one) => one.machineId === refusal.machineId)
          ?.status === "online";
      return back
        ? {
            line: `${machine} is connected again.`,
            holds: false,
            actions: [],
          }
        : {
            line: `${machine} isn't connected. The message is kept here; send it again once ${machine} is back.`,
            holds: true,
            actions: [],
          };
    }
    case "item-superseded":
      return {
        line: `This work item is finished, and its workspace has moved on to ${refusal.latest.title}.`,
        holds: true,
        actions: refusal.latest.instanceId
          ? [
              {
                kind: "link",
                label: `Open ${refusal.latest.title}`,
                href: conversationHref(
                  refusal.latest.instanceId,
                  cawco.instanceIndex
                ),
              },
            ]
          : [],
      };
    case "workspace-archived":
      return {
        line: "This work item is finished, and its files were removed when it finished. The message is kept here; a new session can pick the work up with it.",
        holds: true,
        actions: [
          {
            kind: "new-session",
            machineId: session.machineId,
            ...(session.projectId ? { projectId: session.projectId } : {}),
          },
        ],
      };
    case "item-closed":
      return null;
    default:
      return null;
  }
}

/**
 * A send that has to wake a session with no permission mode to wake on
 * (core `ModeAsk`): the row asks for one with the session's picker, never
 * saying the hub's refusal. Once its row names a mode (a pick here, or the
 * session's own card), it wakes on that, and Send again goes.
 */
export function modeAskRecovery(ask: ModeAsk, session: BoardRow): SendRecovery {
  if (session.permissionMode) {
    return {
      line: "This session has a permission mode now.",
      holds: false,
      actions: [],
    };
  }
  return {
    line: "Choose a permission mode for this session, and the message goes.",
    holds: true,
    asks: true,
    actions: [{ kind: "mode", machineId: ask.machineId, harness: ask.harness }],
  };
}
