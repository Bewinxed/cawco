import type { DbShape } from "./db";
import type { DelegateResult } from "./delegate-result";
import type { AttemptAsk } from "./dispatch";
import type { createTreeStops } from "./tree-stops";
import { WorkItemRefusal } from "./work-item-state";
import type { WorkItemRequest, WorkItemStart, WorkItems } from "./work-items";
import type { Unlanded } from "./workspaces";

/** What the work-item calls act through (server.ts's hub context holds each). */
export interface WorkItemCallsDeps {
  /** What a session's workspace holds on no remote, or why it could not be read. */
  readonly coldWork: (
    instanceId: string
  ) => Promise<Unlanded | { error: string } | null>;
  readonly db: DbShape;
  /** A `delegate` naming its task: an attempt at it (dispatch.ts). */
  readonly delegatedAttempt: (
    asked: AttemptAsk &
      Pick<
        WorkItemRequest,
        | "clean"
        | "cwd"
        | "host"
        | "machineId"
        | "parentInstanceId"
        | "workspace"
      > & { task: string }
  ) => Promise<DelegateResult>;
  /** The delegate type a `delegate` with none names runs as. */
  readonly delegateTypeFor: (request: {
    fork?: boolean;
    harness?: string;
    model?: string;
    parentInstanceId: string;
    prompt: string;
    title: string;
    type?: string;
    workspace?: string;
  }) => Promise<{ type?: string }>;
  /** Asks the person whether workspace `id` goes (asks.ts). */
  readonly discardAsked: (
    from: string,
    id: string,
    reason: string | undefined
  ) => Promise<{ recorded: string } | { approved: boolean }>;
  /** Workspace `id` discarded for `from`. */
  readonly discarded: (
    from: string,
    id: string,
    arg2?: { approved?: boolean }
  ) => Promise<string>;
  /** A session as the fleet names it. */
  readonly sessionName: (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }) => string;
  readonly treeStops: ReturnType<typeof createTreeStops>;
  readonly workItems: WorkItems;
}

/** What `delegate` started (`POST /api/work-items` answers it too): the item, its session and workspace; or queued for owned files, with neither yet. */
const delegated = (
  started: WorkItemStart | { queued: string; text: string },
  asked: string
): DelegateResult =>
  "queued" in started
    ? {
        state: "queued",
        queued: started.queued,
        title: asked.trim(),
        text: started.text,
      }
    : {
        state: "started",
        workItemId: started.item.id,
        workspaceId: started.workspace.id,
        ...(started.workspace.tmp
          ? { workspaceTmp: started.workspace.tmp }
          : {}),
        instanceId: started.item.instanceId,
        title: started.item.title,
        text: started.text,
      };

/** What `delegate` asks for, as its route's body takes it. */
export type DelegateAsk = Parameters<WorkItemCallsDeps["delegateTypeFor"]>[0] &
  Omit<Parameters<WorkItemCallsDeps["delegatedAttempt"]>[0], "task"> & {
    task?: string;
  };

/**
 * `discard_workspace` from `from`: workspace `id` discarded, or, with
 * `ask`, the person asked to decide (asks.ts).
 */
export const discardCall =
  (ctx: Pick<WorkItemCallsDeps, "discardAsked" | "discarded">) =>
  async (
    from: string,
    id: string,
    asked: { ask?: boolean; reason?: string }
  ): Promise<string> => {
    const decided = asked.ask
      ? await ctx.discardAsked(from, id, asked.reason)
      : { approved: false };
    if ("recorded" in decided) {
      return decided.recorded;
    }
    return await ctx.discarded(from, id, { approved: decided.approved });
  };

/**
 * THE CALLS a session's work-item tools make (delegation-actions.ts), each
 * the same function its route calls (routes/work-items.ts,
 * routes/workspaces.ts): a tool calls it directly, a route after its own
 * checks of who calls and what the body holds. A refusal throws a
 * {@link WorkItemRefusal} with its status and words; anything else throws
 * the machine's words, which a route answers with 502.
 */
export const workItemCalls = (ctx: WorkItemCallsDeps) => ({
  /** `delegate`: one work item for `parentInstanceId`, or an attempt at its `task`. */
  async delegate(asked: DelegateAsk): Promise<DelegateResult> {
    if (!(
      asked.parentInstanceId.trim() &&
      ctx.db.getInstancesByIds([asked.parentInstanceId])[0]
    )) {
      throw new WorkItemRefusal(
        400,
        "work item needs a known non-empty parentInstanceId"
      );
    }
    const { task, ...plain } = asked;
    if (task) {
      return await ctx.delegatedAttempt({ ...plain, task });
    }
    const started = await ctx.workItems.delegate({
      ...plain,
      ...(await ctx.delegateTypeFor(plain)),
    });
    return delegated(started, plain.title);
  },

  /** `wait_item` for `instanceId`'s item. */
  waitItem: (instanceId: string, minutes: unknown, reason: unknown): string =>
    ctx.workItems.waitItem(instanceId, minutes, reason),

  /** `finish_item` for `instanceId`'s item: its landing gate run, its answer said. */
  finishItem: (
    instanceId: string,
    finished: Parameters<WorkItems["finishItem"]>[1]
  ): Promise<string> => ctx.workItems.finishItem(instanceId, finished),

  /**
   * `stop_delegate`: the session `instanceId` names (a former id by its id
   * now) and its tree stopped (tree-stops.ts) by `from`, its parent or the
   * conversation of its project; how many sessions under it end first.
   */
  stop(from: string, instanceId: string) {
    const [requester] = ctx.db.getInstancesByIds([from]);
    const [row] = ctx.db.getInstancesByIds([ctx.db.instanceIdOf(instanceId)]);
    if (!(
      requester &&
      row &&
      (row.parentInstanceId === requester.id ||
        ctx.workItems.ledBy(row.id, requester.id))
    )) {
      throw new WorkItemRefusal(
        403,
        "you can only stop your own delegates, or the work items of the project whose conversation you are"
      );
    }
    return ctx.treeStops.stop(row.id, {
      kind: "session",
      name: ctx.sessionName(requester),
    });
  },

  /** `stop_delegate` on a queued delegate: its words, or nothing when `target` names none. */
  withdrawQueued: (from: string, target: string): string | undefined =>
    ctx.workItems.withdrawQueued(from, target),

  /**
   * What item `id`'s workspace holds on no remote now (workspaces.ts
   * `unlandedOf`), or why it could not be read, and what it serves, which
   * holds its retirement; nothing when there is no such item.
   */
  async unlandedOf(id: string): Promise<
    | {
        serving: ReturnType<WorkItems["serving"]>;
        unlanded: Awaited<ReturnType<WorkItemCallsDeps["coldWork"]>>;
      }
    | undefined
  > {
    const item = ctx.workItems.item(id);
    return item
      ? {
          unlanded: await ctx.coldWork(item.instanceId),
          serving: ctx.workItems.serving(item.workspaceId),
        }
      : undefined;
  },

  /** Item `id`, or nothing. */
  item: (id: string) => ctx.workItems.item(id),

  discard: discardCall(ctx),
});

export type WorkItemCalls = ReturnType<typeof workItemCalls>;
