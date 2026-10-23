/**
 * THE PROVIDER-RETRY DEADLINE. A work item whose session sits in its
 * provider's retry (core `PROVIDER_RETRY`: the provider refused the turn,
 * and the harness waits to try again) ends at its deadline for that, in
 * plain words, and its parent is told (work-items.ts `retryPassed`).
 *
 * The workflow engine ended a step's attempt whose provider would only try
 * again past the attempt's deadline (4141893c0): run d1ee813a sat 30
 * minutes in OpenCode's `retry` status (an account rate limit, the next
 * attempt about 2 h out) and learned nothing. Work items have no attempt
 * deadline, so this is theirs: from the first retry of a stretch,
 * {@link PROVIDER_RETRY_DEADLINE_MS}, or the item's own minutes budget when
 * that ends sooner. A retry whose next attempt is past the deadline ends
 * the item now, since the wait would run past it; else the item ends at the
 * deadline if the session still has not moved. Anything the session's model
 * says (an assistant message, a turn's end) is progress, and ends the
 * stretch. Only OpenCode says when it retries (agent opencode-session.ts
 * `#retry`); a retry at the limit of an account of CawCo's is the at-limit
 * controller's, whose harness ends the turn on it (server.ts).
 */
import { workWords } from "@cawco/core";
import type { DbShape, WorkItemRow } from "./db";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { isLive } from "./work-items";

/**
 * How long a work item may sit in its provider's retry: our call, the half
 * hour run d1ee813a sat in OpenCode's before its attempt timed out.
 */
export const PROVIDER_RETRY_DEADLINE_MS = 30 * 60_000;

/** What a provider's retry says: its words, and when the harness tries again (ms epoch) if it said. */
export interface ProviderRetry {
  message: string;
  nextAttemptAt?: number;
}

interface Stretch {
  deadline: number;
  last: ProviderRetry;
  timer: HubTimer;
}

const clock = (at: number): string =>
  `${new Date(at).toISOString().slice(0, 19).replace("T", " ")} UTC`;

export const createProviderRetries = ({
  db,
  lifetime,
  ended,
}: {
  db: Pick<DbShape, "getInstancesByIds" | "workItem">;
  lifetime: HubLifetimeShape;
  /** The item of `instanceId` ends with `why`, its turn halted and its parent told (server.ts). */
  ended: (instanceId: string, why: string) => void;
}) => {
  /** Each session sitting in a provider's retry now, by id. */
  const stretches = new Map<string, Stretch>();

  /** The live item `instanceId` runs that a stop or a landing does not hold. */
  const itemOf = (instanceId: string): WorkItemRow | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
    return item && isLive(item.state) && !item.stoppingAt && !item.landingSince
      ? item
      : undefined;
  };

  /** The deadline a stretch begun at `since` has: the hub's, or the item's minutes budget when that ends sooner. */
  const deadlineOf = (item: WorkItemRow, since: number): number => {
    const minutes = item.budget?.minutes;
    const budgeted =
      minutes === undefined
        ? Number.POSITIVE_INFINITY
        : item.createdAt.getTime() + minutes * 60_000;
    return Math.min(since + PROVIDER_RETRY_DEADLINE_MS, budgeted);
  };

  const forget = (instanceId: string): void => {
    const stretch = stretches.get(instanceId);
    if (stretch) {
      lifetime.cancel(stretch.timer);
      stretches.delete(instanceId);
    }
  };

  /** The stretch's deadline came, or a retry lands past it: the item ends. */
  const end = (instanceId: string): void => {
    const stretch = stretches.get(instanceId);
    forget(instanceId);
    if (!(stretch && itemOf(instanceId))) {
      return;
    }
    const { last, deadline } = stretch;
    const next =
      last.nextAttemptAt !== undefined && last.nextAttemptAt > deadline
        ? clock(last.nextAttemptAt)
        : undefined;
    const why = workWords.providerRetryEnded(
      last.message,
      clock(deadline),
      next
    );
    console.log(`[provider-retries] ${instanceId}: ${why}`);
    ended(instanceId, why);
  };

  return {
    /** The session's provider refused its turn and its harness retries, as `retry` says. */
    retry(instanceId: string, retry: ProviderRetry): void {
      const item = itemOf(instanceId);
      if (!item) {
        forget(instanceId);
        return;
      }
      let stretch = stretches.get(instanceId);
      if (!stretch) {
        const deadline = deadlineOf(item, Date.now());
        stretch = {
          deadline,
          last: retry,
          timer: lifetime.after(Math.max(0, deadline - Date.now()), () =>
            end(instanceId)
          ),
        };
        stretches.set(instanceId, stretch);
      }
      stretch.last = retry;
      if (
        retry.nextAttemptAt !== undefined &&
        retry.nextAttemptAt > stretch.deadline
      ) {
        end(instanceId);
      }
    },

    /** The session's model said something, or its turn ended: the retry is over. */
    progress(instanceId: string): void {
      forget(instanceId);
    },
  };
};

export type ProviderRetries = ReturnType<typeof createProviderRetries>;
