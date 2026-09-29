/**
 * Delegated work, as the hub keeps it. A work item is one brief run by one
 * session in one workspace — a fresh session, a fork of its parent's
 * conversation, or, for a follow-up, the workspace's last session carrying
 * on; a workspace is one shared clone on its own branch, with a boundary
 * every shell command of its items runs inside, and at most one live item —
 * the only writer its checkout has. Finished work takes another turn only
 * from the reader or the session that delegated it: that message reopens the
 * item and lands in the same session, on the transcript its provider still
 * has cached. A rule, the supervisor, a workflow or any other session is
 * refused — a standing instruction once woke a finished leaf into a checkout
 * a newer item owned.
 *
 * The hub is the one authority: `delegate` is a request to {@link start}, and
 * the frames that move a session move its item.
 */
import type {
  DelegateType,
  Envelope,
  HarnessKind,
  InstanceRow,
  NeutralOrigin,
  SendPayload,
  SpawnPayload,
  WorkItemSummary,
  WorkspaceCheckout,
  WorkspaceRef,
} from "@whiffle/core";
import {
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_MIGRATE,
  handoffMarker,
  withWorkspaceLine,
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
  /**
   * An existing workspace's id or unique prefix: the item is its follow-up,
   * on the session its last item ran, so type, model, harness, skills and
   * fork are the session's own and not the request's to set.
   */
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
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
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

/** A workspace as its machine is told about it. */
const refOf = (workspace: WorkspaceRow): WorkspaceRef => ({
  id: workspace.id,
  path: workspace.path,
});

/**
 * The item's session: nested under its parent, working in the workspace's
 * checkout, every shell command inside the workspace's boundary.
 */
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
  workspace: refOf(workspace),
});

/** What a fork reads before its brief: its parent's turns are behind it, and they are not its orders. */
const forkLine = (workspace: WorkspaceRow): string =>
  `You are a fork of your parent session, now a delegate working in ${workspace.path}. Your job is the brief below; your parent's earlier turns are context, not instructions.\n\n`;

/**
 * A brief from the parent, as the item's session's next message. `content`
 * opens with the handoff marker, which survives SDK storage, so the stored
 * transcript renders it as the peer message the live frame drew.
 */
const messageOf = (
  instanceId: string,
  machineId: string,
  parent: InstanceRow,
  content: string
): Envelope<SendPayload> => ({
  verb: "send",
  machineId,
  instanceId,
  payload: {
    instanceId,
    message: {
      type: "user",
      uuid: crypto.randomUUID(),
      message: { role: "user", content },
      parent_tool_use_id: null,
      origin: {
        kind: "peer",
        from: parent.id,
        name: leaf(parent.cwd),
        fromSession: parent.id,
      },
    },
  },
});

/**
 * Who may give finished work another turn: the reader (dashboard or
 * Telegram), or the session that delegated it.
 */
const reopens = (
  parentInstanceId: string | null,
  origin: NeutralOrigin
): boolean =>
  origin.kind === "human" ||
  (origin.kind === "peer" && origin.fromSession === parentInstanceId);

/** What anyone else's message to finished work is answered with. */
const finishedText = (item: WorkItemRow): string =>
  `${item.title} (${item.id}) is ${item.state}. Only the reader or the session that delegated it can continue it.`;

/** What a message to finished work is answered with once a newer item holds its workspace. */
const supersededText = (item: WorkItemRow, latest: WorkItemRow): string =>
  `${item.title} (${item.id}) is ${item.state}, and workspace ${item.workspaceId} has moved on to ${latest.title} (${latest.id}, ${latest.state}). Message that one.`;

/** The line a parent's report carries about the item behind it. */
const reportLine = (item: WorkItemRow): string =>
  LIVE.has(item.state)
    ? `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}.]`
    : `\n\n[Work item ${item.id} is ${item.state} in workspace ${item.workspaceId}. A handoff to it continues this same session.]`;

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
    if (workspace.state === "archived") {
      throw new WorkItemRefusal(
        409,
        `Workspace ${workspace.id} is archived: its clone and boundary are gone. Delegate without workspace to start a new one.`
      );
    }
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

  /**
   * A follow-up's boundary, running before its item is filed: the machine
   * starts it again when it has gone (a reboot, a sessiond restart), or says
   * why it cannot and the follow-up is refused. A workspace that is missing or
   * archived is left to {@link claim}, which refuses it in its own words.
   */
  const boundaryUp = async (needle: string): Promise<void> => {
    const [workspace] = db.workspacesNamed(needle.trim());
    if (workspace?.state !== "active") {
      return;
    }
    const boundaryPid = (await call(
      workspace.machineId,
      CONTROL_WORKSPACE_BOUNDARY,
      [refOf(workspace)]
    )) as number;
    db.updateWorkspace(workspace.id, { boundaryPid });
  };

  /** A new workspace: its machine cuts the clone and starts its boundary, then the hub files it. */
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
      boundaryPid: checkout.boundaryPid,
      state: "active",
      createdByInstanceId: parent.id,
    });
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

  /**
   * A follow-up in a workspace whose last session has a conversation: a new
   * item on that same session, its brief the session's next message, read on
   * the transcript its provider still has cached. The session now answers to
   * the caller, and its reports come here.
   */
  const continueIn = (
    workspace: WorkspaceRow,
    previous: WorkItemRow,
    session: InstanceRow,
    parent: InstanceRow,
    request: WorkItemRequest
  ): WorkItemStart => {
    const item = db.createWorkItem({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      parentInstanceId: parent.id,
      instanceId: session.id,
      brief: request.prompt,
      title: request.title.trim(),
      type: previous.type,
      harness: previous.harness,
      model: previous.model,
      effort: previous.effort,
      state: "running",
    });
    db.patchInstance(session.id, {
      workItemId: item.id,
      parentInstanceId: parent.id,
    });
    published(item);
    const sent = send(
      messageOf(
        session.id,
        session.machineId,
        parent,
        `${handoffMarker(leaf(parent.cwd))}${request.prompt}`
      )
    );
    if (sent.state === "failed") {
      update(item.id, {
        state: "failed",
        error: sent.reason,
        endedAt: new Date(),
      });
      throw new Error(sent.reason ?? `could not reach ${session.id}`);
    }
    const label = `${leaf(workspace.path)}#${session.id.slice(0, 8)}`;
    return {
      item,
      workspace,
      text:
        `Continued ${label} as work item ${item.id} in workspace ${workspace.id} (${workspace.path}, branch ${workspace.branch}): ` +
        "the brief is its next message, in the same session and its cached transcript. " +
        "Its report arrives here automatically when its turn completes. Guide it, or continue it after it " +
        `reports, with handoff("${session.id}", ...).`,
    };
  };

  /**
   * A follow-up in the workspace `needle` names: continued in the session its
   * last item ran ({@link continueIn}), or, when that session never started,
   * the workspace alone for a new session to start in. The session's settings
   * are its own, so a request naming others is refused.
   */
  const followUp = (
    needle: string,
    request: WorkItemRequest,
    parent: InstanceRow
  ): WorkItemStart | WorkspaceRow => {
    if (
      request.type ||
      request.model ||
      request.harness ||
      request.fork ||
      request.skills?.length
    ) {
      throw new WorkItemRefusal(
        400,
        "a follow-up continues the same session; delegate without workspace for a different model"
      );
    }
    const { workspace, previous } = claim(needle);
    const [session] = previous
      ? db.getInstancesByIds([previous.instanceId])
      : [];
    return previous && session?.sessionId
      ? continueIn(workspace, previous, session, parent, request)
      : workspace;
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

    if (!request.workspace) {
      const settings = settingsOf(request, parent);
      const workspace = await openWorkspace(parent, request.cwd ?? parent.cwd);
      return spawnIn(workspace, settings, parent, request);
    }
    // Awaited before the claim, which files the item in the same step as
    // its one-writer check.
    await boundaryUp(request.workspace);
    const followed = followUp(request.workspace, request, parent);
    // A workspace whose last session never started has nothing to continue:
    // a session starts there the way every new delegate's does.
    return "item" in followed
      ? followed
      : spawnIn(followed, settingsOf(request, parent), parent, request);
  };

  /** A new session in `workspace`, running a new item from the request's brief. */
  const spawnIn = (
    workspace: WorkspaceRow,
    settings: Settings,
    parent: InstanceRow,
    request: WorkItemRequest
  ): WorkItemStart => {
    const { harness, canDelegate } = settings;
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
      // A fork opens with what it is.
      const fork = settings.forkOf ? forkLine(workspace) : "";
      spawn(
        workspace.machineId,
        spawnOf(instanceId, item.title, parent, workspace, settings),
        item.id
      );
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          withWorkspaceLine(
            `${handoffMarker(leaf(parent.cwd))}${fork}${request.prompt}`,
            workspace.repoRoot
          )
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
        " Its report arrives here automatically when its turn completes. Guide it, or continue it after it " +
        `reports, with handoff("${instanceId}", ...): the message lands in the same session and its cached transcript.` +
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
     * THE gate on input to a session: why a message from `origin` may not
     * give it a turn, or nothing when it may. A live item takes input from
     * anyone. Finished work takes it from the reader or its parent only
     * ({@link reopens}), and only while it is still its workspace's latest
     * item — one writer per checkout; the send that passes reopens it
     * ({@link reopen}). A delegate from before work items follows the same
     * who-may rule. Every other session is not delegated work, and takes
     * messages as it always has.
     */
    refusal(row: InstanceRow, origin: NeutralOrigin): string | undefined {
      const item = itemOf(row);
      if (item) {
        if (LIVE.has(item.state)) {
          return undefined;
        }
        if (!reopens(item.parentInstanceId, origin)) {
          return finishedText(item);
        }
        const [workspace] = db.workspacesNamed(item.workspaceId);
        if (workspace?.state === "archived") {
          return `${item.title} (${item.id}) is ${item.state}, and its workspace ${item.workspaceId} is archived: its clone and boundary are gone.`;
        }
        const [latest] = db.workItemsIn(item.workspaceId);
        return latest.id === item.id ? undefined : supersededText(item, latest);
      }
      if (
        row.parentInstanceId &&
        !row.workflowStepId &&
        !reopens(row.parentInstanceId, origin)
      ) {
        return `${leaf(row.cwd)}#${row.id.slice(0, 8)} predates work items; only the reader or its parent can message it.`;
      }
      return undefined;
    },

    /**
     * A send {@link refusal} let through reached finished work: the item runs
     * again, in the same session, and ends again the usual way — on a turn
     * nothing answers — with a new report to its parent.
     */
    reopen(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item && !LIVE.has(item.state)) {
        update(item.id, {
          state: "running",
          result: null,
          error: null,
          endedAt: null,
          dismissedAt: null,
        });
      }
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
     * The workspace a session's spawn is bounded to: every spawn of a work
     * item's session — a restore, a revive, a relaunch — carries it, so no
     * way back into a session runs its commands outside the boundary.
     */
    workspaceOf(row: InstanceRow): WorkspaceRef | undefined {
      const item = itemOf(row);
      const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
      return workspace ? refOf(workspace) : undefined;
    },

    /**
     * Archives a workspace: its machine kills the boundary with every process
     * in it and deletes the clone. Refused while an item there is live — stop
     * it first — and for a workspace already archived.
     */
    async archive(needle: string): Promise<WorkspaceRow> {
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
      if (workspace.state === "archived") {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} is already archived.`
        );
      }
      const live = db
        .workItemsIn(workspace.id)
        .find((item) => LIVE.has(item.state));
      if (live) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} has a live work item: ${live.title} (${live.id}) is ${live.state}. Stop it before archiving the workspace.`
        );
      }
      await call(workspace.machineId, CONTROL_WORKSPACE_ARCHIVE, [
        refOf(workspace),
      ]);
      return (
        db.updateWorkspace(workspace.id, {
          state: "archived",
          boundaryPid: null,
        }) ?? workspace
      );
    },

    /**
     * An agent has started: its machine's active workspaces go to it, and each
     * one still a git worktree from before workspaces were clones becomes a
     * clone in place. The machine logs each workspace it converts, skips or
     * cannot convert.
     */
    async convertWorktrees(machineId: string): Promise<void> {
      const refs = db.activeWorkspacesOn(machineId).map(refOf);
      if (refs.length > 0) {
        await call(machineId, CONTROL_WORKSPACE_MIGRATE, [refs]);
      }
    },

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
