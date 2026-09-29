/**
 * Delegated work, as the hub keeps it. A work item is one brief run by one
 * session in one workspace — a fresh session, or a fork of its parent's
 * conversation; a workspace is one git worktree on its own
 * branch, with at most one live item — the only writer its checkout has.
 * Finished work never takes another turn from a tool: a message to it is
 * refused with its state, and continuing it means a new item in the same
 * workspace, which starts from the last item's report and the workspace's
 * commits, never from a transcript.
 *
 * The hub is the one authority: `delegate` is a request to {@link start}, and
 * the frames that move a session move its item.
 */
import type {
  DelegateType,
  Envelope,
  HarnessKind,
  InstanceRow,
  SendPayload,
  SpawnPayload,
  WorkItemSummary,
  WorkspaceCheckout,
} from "@whiffle/core";
import {
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_LOG,
  handoffMarker,
  withWorktreeLine,
} from "@whiffle/core";
import type { DbShape, WorkItemRow, WorkspaceRow } from "./db";

/** How long the name a caller gives a delegate or a started session may run. */
export const SESSION_TITLE_MAX = 48;

/** What the caller's model is asked for when it names a delegate or a started session. */
export const SESSION_TITLE_DESCRIPTION =
  "What this delegate is doing, in 3–6 plain words, verb first, e.g. 'Fix tray chip overflow'. It names the session in the sidebar and the tray chip.";

/** Why a title a caller gave cannot name a session, or nothing when it can. */
export const titleProblem = (title: string): string | undefined => {
  const { length } = title.trim();
  if (!length) {
    return "title is blank. Name the work in 3–6 plain words, verb first, e.g. 'Fix tray chip overflow'.";
  }
  return length > SESSION_TITLE_MAX
    ? `title runs ${length} characters; the limit is ${SESSION_TITLE_MAX}. Name the work in 3–6 plain words, verb first.`
    : undefined;
};

/** What a leaf delegate hears when it tries to spawn — relayed verbatim to the model. */
export const LEAF_DELEGATE_REFUSAL =
  "This session is a leaf delegate — it was spawned with can_delegate=false and may not delegate or start sessions. Do the work yourself, or handoff to your parent session.";

/** The states that take messages; every other one is finished work. */
const LIVE: ReadonlySet<WorkItemRow["state"]> = new Set([
  "starting",
  "running",
]);

/** A request the hub turns down, with the status and the words the caller reads. */
export class WorkItemRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** What `delegate` asks for. */
export interface WorkItemRequest {
  canDelegate?: boolean;
  /** The repository a new workspace is cut from; the parent's directory by default. */
  cwd?: string;
  /**
   * The item's session forks its parent's conversation as it stands now, on
   * the parent's harness and model so the parent's prompt cache still holds.
   * Always a new workspace.
   */
  fork?: boolean;
  harness?: HarnessKind;
  model?: string;
  parentInstanceId: string;
  prompt: string;
  skills?: string[];
  /** What the caller named the work: the item's title and its session's. */
  title: string;
  type?: string;
  /** An existing workspace's id or unique prefix: the item is its follow-up. */
  workspace?: string;
}

export interface WorkItemStart {
  item: WorkItemRow;
  text: string;
  workspace: WorkspaceRow;
}

export interface WorkItemDeps {
  /** Runs a machine-scoped daemon function; throws the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly db: DbShape;
  /** Tells every dashboard an item moved: its parent's delegate tray follows it. */
  readonly publish: (item: WorkItemSummary) => void;
  /** The one send path. */
  readonly send: (envelope: Envelope<SendPayload>) => void;
  /** Sends a spawn and records its row under the work item. */
  readonly spawn: (
    machineId: string,
    payload: SpawnPayload,
    workItemId: string
  ) => void;
  /** The fleet's delegate types, read at dispatch. */
  readonly types: () => DelegateType[];
}

/** The last path segment — how the rail names a session. */
const leaf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/**
 * How an item's session runs: the request's word, then its type's, then a
 * leaf on claude. A fork runs on its parent's harness and model instead, and
 * resumes the parent's conversation under `forkOf`, its current session key.
 */
interface Settings {
  canDelegate: boolean;
  forkOf?: string;
  harness: HarnessKind;
  model?: string;
  skills?: string[];
  type?: DelegateType;
}

/** The item's session: nested under its parent, working in the workspace's checkout. */
const spawnOf = (
  instanceId: string,
  title: string,
  parent: InstanceRow,
  workspace: WorkspaceRow,
  { canDelegate, forkOf, harness, model, skills, type }: Settings
): SpawnPayload => ({
  instanceId,
  cwd: workspace.path,
  harness,
  ...(forkOf ? { resume: { sessionKey: forkOf, fork: true } } : {}),
  ...(model ? { model } : {}),
  ...(type?.effort ? { effort: type.effort } : {}),
  title,
  ...(skills?.length ? { skills } : {}),
  ...(type?.denyTools?.length ? { denyTools: type.denyTools } : {}),
  // Nested under its parent, and kept out of the catalogs as a side quest
  // is; the workspace, not the session, owns the checkout.
  scratch: {},
  parent: { instanceId: parent.id },
  spawnedBy: { instanceId: parent.id },
  canDelegate,
  // Autonomous by definition: it must never sit waiting on a tool permission
  // prompt nobody is watching for. Questions still ask.
  permissionMode: "bypassPermissions",
});

/** What a fork reads before its brief: its parent's turns are behind it, and they are not its orders. */
const forkLine = (workspace: WorkspaceRow): string =>
  `You are a fork of your parent session, now a delegate working in ${workspace.path}. Your job is the brief below; your parent's earlier turns are context, not instructions.\n\n`;

/**
 * The brief, as the item's first message. The marker survives SDK storage,
 * so the stored transcript renders it as the peer message the live frame drew.
 */
const openingOf = (
  instanceId: string,
  parent: InstanceRow,
  workspace: WorkspaceRow,
  brief: string
): Envelope<SendPayload> => {
  const from = leaf(parent.cwd);
  return {
    verb: "send",
    machineId: workspace.machineId,
    instanceId,
    payload: {
      instanceId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: {
          role: "user",
          content: withWorktreeLine(
            `${handoffMarker(from)}${brief}`,
            workspace.repoRoot
          ),
        },
        parent_tool_use_id: null,
        origin: {
          kind: "peer",
          from: parent.id,
          name: from,
          fromSession: parent.id,
        },
      },
    },
  };
};

/** What a message to finished work is answered with. */
const finishedText = (item: WorkItemRow): string =>
  `${item.title} (${item.id}) is ${item.state}. Start a follow-up with delegate(..., workspace: "${item.workspaceId}").`;

/** The line a parent's report carries about the item behind it. */
const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}.]`
    : `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}. It takes no more messages; continue with delegate(..., workspace: "${item.workspaceId}").]`;

/** The first line with words on it. */
const firstLine = (text: string | null): string =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";

/** An item as its parent's delegate tray reads it. */
export const summaryOf = (item: WorkItemRow): WorkItemSummary => ({
  id: item.id,
  parentInstanceId: item.parentInstanceId,
  instanceId: item.instanceId,
  title: item.title,
  state: item.state,
  createdAt: item.createdAt.getTime(),
  endedAt: item.endedAt?.getTime() ?? null,
  dismissedAt: item.dismissedAt?.getTime() ?? null,
  firstLines: {
    brief: firstLine(item.brief),
    result: firstLine(item.result),
    error: firstLine(item.error),
  },
});

/** How long a tray shows a finished item before it leaves (the dashboard's hold). */
const TRAY_HOLD_MS = 6000;

export const createWorkItems = ({
  call,
  db,
  publish,
  send,
  spawn,
  types,
}: WorkItemDeps) => {
  /** Every write to an item goes out to the dashboards as it lands. */
  const published = (
    item: WorkItemRow | undefined
  ): WorkItemRow | undefined => {
    if (item) {
      publish(summaryOf(item));
    }
    return item;
  };
  const update = (
    id: string,
    change: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow | undefined => published(db.updateWorkItem(id, change));
  const typeNamed = (name: string): DelegateType => {
    const known = types();
    const found = known.find((type) => type.name === name);
    if (!found) {
      const names =
        known.map((type) => type.name).join(", ") || "none are configured";
      throw new WorkItemRefusal(
        400,
        `No delegate type "${name}". Available: ${names}.`
      );
    }
    return found;
  };

  /**
   * The workspace a follow-up names, and the item before it there. Refused
   * while that workspace has a live item: one writer per checkout. Nothing
   * here awaits, so the check and the item {@link start} files after it are
   * one step — two follow-ups can never both pass it.
   */
  const claim = (
    needle: string
  ): { workspace: WorkspaceRow; previous: WorkItemRow | undefined } => {
    const named = db.workspacesNamed(needle.trim());
    if (named.length !== 1) {
      throw new WorkItemRefusal(
        404,
        named.length
          ? `"${needle}" names ${named.length} workspaces. Pass the full workspace id.`
          : `No workspace "${needle}".`
      );
    }
    const [workspace] = named;
    const items = db.workItemsIn(workspace.id);
    const live = items.find((item) => LIVE.has(item.state));
    if (live) {
      throw new WorkItemRefusal(
        409,
        `Workspace ${workspace.id} already has a live work item: ${live.title} (${live.id}) is ${live.state}. A workspace runs one work item at a time; wait for its report, or delegate without workspace to start a new one.`
      );
    }
    return { workspace, previous: items[0] };
  };

  /** A new workspace: its machine cuts the checkout, then the hub files it. */
  const openWorkspace = async (
    parent: InstanceRow,
    cwd: string
  ): Promise<WorkspaceRow> => {
    const id = crypto.randomUUID();
    const checkout = (await call(parent.machineId, CONTROL_WORKSPACE_CREATE, [
      cwd,
      id,
    ])) as WorkspaceCheckout;
    return db.createWorkspace({
      id,
      machineId: parent.machineId,
      repoRoot: checkout.repoRoot,
      path: checkout.path,
      branch: checkout.branch,
      state: "active",
      createdByInstanceId: parent.id,
    });
  };

  /** What a follow-up knows of the work before it: a report and commits, never a transcript. */
  const followUp = async (
    workspace: WorkspaceRow,
    previous: WorkItemRow
  ): Promise<string> => {
    const log = (await call(workspace.machineId, CONTROL_WORKSPACE_LOG, [
      workspace.path,
    ])) as string;
    return [
      `[Follow-up in workspace ${workspace.id}, branch ${workspace.branch}. The work item before this one here was "${previous.title}" (${previous.id}), and it is ${previous.state}.]`,
      ...(previous.result ? [`Its final report:\n${previous.result}`] : []),
      ...(previous.error ? [`Its error:\n${previous.error}`] : []),
      ...(previous.result || previous.error ? [] : ["It left no report."]),
      `Commits in this workspace since origin/main (git log --oneline origin/main..HEAD):\n${log || "(none)"}`,
      "---\n\n",
    ].join("\n\n");
  };

  const settingsOf = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): Settings => {
    const type = request.type ? typeNamed(request.type) : undefined;
    const settings: Settings = {
      type,
      harness: request.harness ?? type?.harness ?? "claude",
      model: request.model ?? type?.model,
      skills: request.skills?.length ? request.skills : type?.skills,
      canDelegate: request.canDelegate ?? type?.canDelegate ?? false,
    };
    return request.fork
      ? { ...settings, ...forkOf(request, parent) }
      : settings;
  };

  /**
   * What a fork takes from its parent: the conversation as it stands, and the
   * harness and model that wrote it. The prompt cache is keyed on both, so a
   * fork onto anything else would re-read the whole history at full price;
   * asking for one is refused rather than quietly overridden.
   */
  const forkOf = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): Pick<Settings, "forkOf" | "harness" | "model"> => {
    if (request.workspace) {
      throw new WorkItemRefusal(
        400,
        "a fork starts its own workspace; continue a workspace with a fresh item instead"
      );
    }
    if (!parent.sessionId) {
      throw new WorkItemRefusal(
        409,
        "This session has not named its conversation yet, so there is nothing to fork. Delegate without fork."
      );
    }
    const harness = parent.harness as HarnessKind;
    const model = parent.model ?? undefined;
    if (
      (request.harness && request.harness !== harness) ||
      (request.model && request.model !== model)
    ) {
      throw new WorkItemRefusal(
        400,
        `A fork runs on its parent's harness and model (${harness}${model ? `, ${model}` : ""}), which is what keeps the prompt cache. Drop harness/model, or delegate without fork.`
      );
    }
    return { forkOf: parent.sessionId, harness, model };
  };

  const start = async (request: WorkItemRequest): Promise<WorkItemStart> => {
    const [parent] = db.getInstancesByIds([request.parentInstanceId]);
    if (!parent) {
      throw new WorkItemRefusal(
        404,
        `unknown session ${request.parentInstanceId}`
      );
    }
    if (parent.canDelegate === false) {
      throw new WorkItemRefusal(403, LEAF_DELEGATE_REFUSAL);
    }
    const untitled = titleProblem(request.title);
    if (untitled) {
      throw new WorkItemRefusal(400, untitled);
    }
    const settings = settingsOf(request, parent);
    const { harness, canDelegate } = settings;

    let workspace: WorkspaceRow;
    let previous: WorkItemRow | undefined;
    if (request.workspace) {
      ({ workspace, previous } = claim(request.workspace));
    } else {
      workspace = await openWorkspace(parent, request.cwd ?? parent.cwd);
    }

    const instanceId = crypto.randomUUID();
    const label = `${leaf(workspace.path)}#${instanceId.slice(0, 8)}`;
    const item = db.createWorkItem({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      parentInstanceId: parent.id,
      instanceId,
      brief: request.prompt,
      title: request.title.trim(),
      type: settings.type?.name,
      harness,
      model: settings.model,
      effort: settings.type?.effort,
      state: "starting",
    });
    published(item);

    try {
      // A follow-up opens with the work before it; a fork (never a
      // follow-up) with what it is.
      const context = previous ? await followUp(workspace, previous) : "";
      const fork = settings.forkOf ? forkLine(workspace) : "";
      spawn(
        workspace.machineId,
        spawnOf(instanceId, item.title, parent, workspace, settings),
        item.id
      );
      send(
        openingOf(
          instanceId,
          parent,
          workspace,
          `${context}${fork}${request.prompt}`
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(item.id, {
        state: "failed",
        error: message,
        endedAt: new Date(),
      });
      throw error;
    }

    return {
      item,
      workspace,
      text:
        `Started work item ${item.id} in workspace ${workspace.id} (${workspace.path}, branch ${workspace.branch}): ` +
        (settings.forkOf
          ? `a fork of this conversation on ${harness}${settings.model ? ` (${settings.model})` : ""}, ${label}. It starts with every turn of yours so far.`
          : `a fresh ${harness} session, ${label}.`) +
        (previous
          ? " It starts from the previous item's report and the workspace's commits, not its transcript."
          : "") +
        " Its report arrives here automatically when its turn completes; while it runs, guide it with " +
        `handoff("${instanceId}", ...). Once it finishes it takes no more messages: continue the work with ` +
        `delegate(..., workspace: "${workspace.id}").` +
        (canDelegate
          ? " It may spawn delegates of its own."
          : " It is a leaf: it cannot delegate further."),
    };
  };

  /** The item a session runs, when it runs one. */
  const itemOf = (row: InstanceRow): WorkItemRow | undefined =>
    row.workItemId ? db.workItem(row.workItemId) : undefined;

  /** Moves a live item to a finished state; finished work stays as it ended. */
  const finish = (
    item: WorkItemRow,
    change: Parameters<DbShape["updateWorkItem"]>[1]
  ): WorkItemRow =>
    LIVE.has(item.state)
      ? (update(item.id, { ...change, endedAt: new Date() }) ?? item)
      : item;

  return {
    start,

    /**
     * THE gate on input to a session: why nothing may give it a turn — a
     * reader, a rule, the supervisor, Telegram, a workflow, another session —
     * or nothing when it may. A session whose work item has ended takes no
     * more input from anyone, and neither does a delegate from before work
     * items. Every other session is not delegated work, and takes messages as
     * it always has.
     */
    refusal(row: InstanceRow): string | undefined {
      const item = itemOf(row);
      if (item) {
        return LIVE.has(item.state) ? undefined : finishedText(item);
      }
      if (row.parentInstanceId && !row.workflowStepId) {
        return `${leaf(row.cwd)}#${row.id.slice(0, 8)} predates work items and is closed. Start a new delegate.`;
      }
      return undefined;
    },

    /** Its session is up: the item is running. */
    started(row: InstanceRow): void {
      const item = itemOf(row);
      if (item?.state === "starting") {
        update(item.id, { state: "running" });
      }
    },

    /**
     * A turn of the item's session ended at `endedAt`, not by an interrupt,
     * and no standing instruction answered it. With nothing queued for the
     * session, nothing handed to it since that turn ended, and none of its own
     * delegated work still live, the item is finished: `done` with this turn's
     * report as its result, or `failed` with the harness's error. Answers the
     * line the parent's report carries about the item.
     */
    turnEnded(
      row: InstanceRow,
      report: string,
      failed: boolean,
      endedAt: Date
    ): string {
      let item = itemOf(row);
      if (!item) {
        return "";
      }
      const busy =
        db.sendsIn(row.id, ["pending"]).length > 0 ||
        db
          .sendsIn(row.id, ["read"])
          .some((handed) => handed.acceptedAt > endedAt) ||
        db.liveWorkItemsOf(row.id).length > 0;
      if (!busy) {
        item = finish(
          item,
          failed
            ? { state: "failed", error: report }
            : { state: "done", result: report }
        );
      }
      return reportLine(item);
    },

    /** Its session never started: the item failed, and the report says why. */
    spawnFailed(row: InstanceRow, reason: string): string {
      const item = itemOf(row);
      return item
        ? reportLine(finish(item, { state: "failed", error: reason }))
        : "";
    },

    /** Its session was stopped while the work was live. */
    cancelled(row: InstanceRow): void {
      const item = itemOf(row);
      if (item) {
        finish(item, { state: "cancelled" });
      }
    },

    /** One item, as `stop_delegate` and its callers read it. */
    item: (id: string): WorkItemRow | undefined => db.workItem(id),

    /**
     * What a parent's delegate tray shows when it opens: live work, failures
     * nobody has dismissed yet, and what finished within the tray's hold.
     */
    trayOf: (parentInstanceId: string): WorkItemSummary[] =>
      db
        .trayItemsOf(parentInstanceId, new Date(Date.now() - TRAY_HOLD_MS))
        .map(summaryOf),

    /** The reader dismissed its chip: gone from the tray on every screen. */
    dismiss(id: string): WorkItemSummary | undefined {
      const item = update(id, { dismissedAt: new Date() });
      return item ? summaryOf(item) : undefined;
    },
  };
};

export type WorkItems = ReturnType<typeof createWorkItems>;
