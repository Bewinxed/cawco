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
 * the frames that move a session move its item. An item carries acceptance
 * checks; it is `done` only when its session calls `finish_item` and the hub
 * has run every check in the item's worktree and seen it pass. The parent's
 * report is built by the hub from those results, never from the session's
 * prose.
 */
import type {
  CommandResult,
  DelegateType,
  Envelope,
  HarnessKind,
  InstanceRow,
  NeutralOrigin,
  PermissionMode,
  SendPayload,
  SpawnPayload,
  WorkItemSummary,
  WorkspaceCheckout,
  WorkspaceRef,
} from "@cawco/core";
import {
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_MIGRATE,
  handoffMarker,
  withWorkspaceLine,
} from "@cawco/core";
import type { DbShape, WorkItemRow, WorkspaceRow } from "./db";
import type { WorkItemCheck, WorkItemSubmission } from "./db/schema";

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

/** The delegate type a session the fleet starts runs as when its caller names none. */
export const DEFAULT_DELEGATE_TYPE = "medium";

/**
 * What a session the fleet starts runs on — `delegate`'s and
 * `start_session`'s one rule, so neither ever leaves its model to the
 * machine's default. A named type sets harness and model, and an explicit
 * harness or model still overrides it. With no type, {@link
 * DEFAULT_DELEGATE_TYPE} applies; a harness other than that type's has no
 * model to take from it, so it must come with one.
 */
export const resolveSpawnType = (
  types: DelegateType[],
  request: { type?: string; harness?: HarnessKind; model?: string }
): { type?: DelegateType; harness: HarnessKind; model: string } => {
  const named = (name: string): DelegateType => {
    const found = types.find((entry) => entry.name === name);
    if (!found) {
      const names =
        types.map((entry) => entry.name).join(", ") || "none are configured";
      throw new WorkItemRefusal(
        400,
        `No delegate type "${name}". Available: ${names}.`
      );
    }
    return found;
  };
  const type = named(request.type ?? DEFAULT_DELEGATE_TYPE);
  if (request.type || !request.harness || request.harness === type.harness) {
    return {
      type,
      harness: request.harness ?? type.harness,
      model: request.model ?? type.model,
    };
  }
  if (!request.model) {
    throw new WorkItemRefusal(
      400,
      `No type was named, and the default type '${type.name}' runs on ${type.harness}, not ${request.harness}. Name a type, or a model for ${request.harness}.`
    );
  }
  return { harness: request.harness, model: request.model };
};

/** What `delegate` asks for. */
export interface WorkItemRequest {
  canDelegate?: boolean;
  /** Its acceptance checks: at least one. */
  checks: WorkItemCheck[];
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
  /**
   * Runs a command on a machine, in a directory — inside `workspace`'s
   * boundary when one is named; throws when the machine cannot.
   */
  readonly command: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef
  ) => Promise<CommandResult>;
  readonly db: DbShape;
  /** Tells every dashboard an item moved: its parent's delegate tray follows it. */
  readonly publish: (item: WorkItemSummary) => void;
  /** Hands a report to the parent of the item's session. */
  readonly report: (row: InstanceRow, body: string, failed: boolean) => void;
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  /**
   * Sends a spawn and records its row under the work item. `fallbackMode` is
   * the mode it runs in when its harness has modes; the hub's one rule
   * settles it (none at all for a harness without modes).
   */
  readonly spawn: (
    machineId: string,
    payload: SpawnPayload,
    workItemId: string,
    fallbackMode: PermissionMode
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

/** How long a check runs when it names no limit, and the most it may name. */
const CHECK_TIMEOUT_SEC = 600;
const CHECK_TIMEOUT_MAX_SEC = 3600;

/** How long the report's git reads may take. */
const GIT_TIMEOUT_MS = 60_000;

/**
 * The commits a worktree's session made since `since` (unix seconds) that
 * HEAD still holds, one hash per line. It runs on the machine and prints
 * only the hashes, so the whole reflog never crosses the wire: its HEAD entries whose
 * action made or rewrote a commit (commit, amend, merge, cherry-pick, a
 * rebase pick), written at or after `since`, each once, kept while
 * `git merge-base --is-ancestor` says HEAD holds it.
 */
const keptCommits = (since: number): string =>
  `git reflog --date=unix --format='%H %gd %gs' HEAD` +
  ` | grep -E '^[0-9a-f]{40} HEAD@\\{[0-9]+\\} (commit|commit \\((amend|merge)\\)|cherry-pick|rebase( -i)? \\((pick|reword|edit|squash|fixup)\\)): '` +
  ` | awk -v since=${since} '{ t = $2; gsub(/[^0-9]/, "", t) } t + 0 >= since && !seen[$1]++ { print $1 }'` +
  ` | while read -r c; do git merge-base --is-ancestor "$c" HEAD && echo "$c"; done`;

/** Lines of diffstat a report keeps: the last, its summary, always among them. */
const DIFFSTAT_LINES = 40;

/** Quiet turns in a row an item survives: the next one fails it. */
const QUIET_TURNS = 3;

const QUIET_ERROR = "ended three turns in a row without finish_item";

const WORD = /\s+/;

/** Why a `delegate` call's checks cannot stand, or nothing when they can. */
export const checksProblem = (checks: WorkItemCheck[]): string | undefined => {
  if (checks.length === 0) {
    return "checks is empty: give at least one acceptance check.";
  }
  for (const check of checks) {
    const words = check.name.trim().split(WORD).filter(Boolean).length;
    if (words < 2 || words > 6) {
      return `check "${check.name}": name it in 2 to 6 plain words.`;
    }
    if (!check.command.trim()) {
      return `check "${check.name}": command is blank.`;
    }
    const limit = check.timeoutSec;
    if (
      limit !== undefined &&
      !(Number.isInteger(limit) && limit >= 1 && limit <= CHECK_TIMEOUT_MAX_SEC)
    ) {
      return `check "${check.name}": timeoutSec must be a whole number from 1 to ${CHECK_TIMEOUT_MAX_SEC}.`;
    }
  }
  return undefined;
};

/** How much of each stream a check keeps: `expect` and the report read this. */
const CHECK_TAIL = 4000;

/** A check's command result, each stream cut to its last {@link CHECK_TAIL} characters. */
const checkTails = (result: CommandResult): CommandResult => ({
  exitCode: result.exitCode,
  stdout: result.stdout.slice(-CHECK_TAIL),
  stderr: result.stderr.slice(-CHECK_TAIL),
});

/** One check, as the hub ran it: `result` holds the stream tails. */
interface CheckOutcome {
  check: WorkItemCheck;
  durationMs: number;
  exitCode: number;
  passed: boolean;
  result: CommandResult;
}

/** A fenced block that no command output can close early. */
const fenced = (text: string): string =>
  `\n\`\`\`\`\n${text.trimEnd()}\n\`\`\`\``;

/**
 * A check's line: its name, pass or fail, exit code and duration. A failure
 * carries its stdout tail under it; a pass is the line alone.
 */
const checkLine = ({
  check,
  passed,
  exitCode,
  durationMs,
  result,
}: CheckOutcome): string => {
  const missing =
    exitCode === 0 && !passed && check.expect !== undefined
      ? `, stdout does not contain ${JSON.stringify(check.expect)}`
      : "";
  const line = `- ${check.name}: ${passed ? "pass" : "fail"} (exit ${exitCode}, ${(durationMs / 1000).toFixed(1)}s${missing})`;
  // A pass is its line: its output is the report's length, not its news.
  return !passed && result.stdout.trim()
    ? `${line}${fenced(result.stdout)}`
    : line;
};

/** A check as the delegate reads it: a failure carries its stderr too. */
const checkResultLine = (outcome: CheckOutcome): string =>
  !outcome.passed && outcome.result.stderr.trim()
    ? `${checkLine(outcome)}\nstderr:${fenced(outcome.result.stderr)}`
    : checkLine(outcome);

/** The findings, numbered; nothing when there are none. */
const findingsBlock = (findings: WorkItemSubmission["findings"]): string =>
  findings?.length
    ? `\n\nFindings:\n${findings.map((finding, index) => `${index + 1}. ${finding.title}: ${finding.detail}`).join("\n")}`
    : "";

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
  command,
  db,
  publish,
  report,
  send,
  spawn,
  types,
}: WorkItemDeps) => {
  /** Turns in a row each live item's session ended without `finish_item`, by item. */
  const quiet = new Map<string, number>();
  /** Items whose checks this hub process is running now: a resume leaves them to that run. */
  const finishing = new Set<string>();
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
      base: checkout.base,
      boundaryPid: checkout.boundaryPid,
      state: "active",
      createdByInstanceId: parent.id,
    });
  };

  const settingsOf = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): Settings => {
    const { type, harness, model } = resolveSpawnType(types(), request);
    const settings: Settings = {
      type,
      harness,
      model,
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
      checks: request.checks,
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
        "Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
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
    const unchecked = checksProblem(request.checks);
    if (unchecked) {
      throw new WorkItemRefusal(400, unchecked);
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
      checks: request.checks,
    });
    published(item);

    try {
      // A fork opens with what it is.
      const fork = settings.forkOf ? forkLine(workspace) : "";
      spawn(
        workspace.machineId,
        spawnOf(instanceId, item.title, parent, workspace, settings),
        item.id,
        // Autonomous by definition: it must never sit waiting on a tool
        // permission prompt nobody is watching for. Questions still ask.
        "bypassPermissions"
      );
      send(
        messageOf(
          instanceId,
          workspace.machineId,
          parent,
          withWorkspaceLine(
            `${handoffMarker(leaf(parent.cwd))}${fork}${request.prompt}`,
            workspace.repoRoot,
            workspace.base
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
        " Its report arrives when the hub has run its acceptance checks. Guide it, or continue it after it " +
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

  /**
   * Whether the session still has something coming as its turn ends at
   * `endedAt`: a send it has not read, one it read since, or its own
   * delegated work still live.
   */
  const busyAfter = (row: InstanceRow, endedAt: Date): boolean =>
    db.sendsIn(row.id, ["pending"]).length > 0 ||
    db
      .sendsIn(row.id, ["read"])
      .some((handed) => handed.acceptedAt > endedAt) ||
    db.liveWorkItemsOf(row.id).length > 0;

  /**
   * A turn of an item filed before checks existed: unless the session is
   * busy, it ends the item with the turn's text, and the report carries it.
   */
  const uncheckedTurn = (
    item: WorkItemRow,
    turn: { text: string; error?: string },
    busy: boolean
  ): { body: string; failed: boolean } => {
    const failed = turn.error !== undefined;
    const ended = busy
      ? item
      : finish(
          item,
          failed
            ? { state: "failed", error: turn.text }
            : { state: "done", result: turn.text }
        );
    return { body: `${turn.text}${reportLine(ended)}`, failed };
  };

  /** A word from the hub about an item, to the item's session. */
  const tell = (row: InstanceRow, content: string): void => {
    send({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "work-item" },
        },
      },
    });
  };

  /** The names of an item's checks, as its session is told them. */
  const checkNames = (checks: WorkItemCheck[]): string =>
    checks.map((check) => check.name).join(", ");

  /**
   * The session's live, checked item that `finish_item` may finish; the done
   * result, when it is done already; or the refusal.
   */
  const finishable = (
    instanceId: string
  ):
    | { row: InstanceRow; item: WorkItemRow; checks: WorkItemCheck[] }
    | string => {
    const [row] = db.getInstancesByIds([instanceId]);
    const item = row ? itemOf(row) : undefined;
    if (!(row && item)) {
      throw new WorkItemRefusal(409, "No work item is open on this session.");
    }
    if (item.state === "done") {
      return `The item is done.\n\n${item.result ?? ""}\n\nEnd your turn.`;
    }
    if (!LIVE.has(item.state)) {
      throw new WorkItemRefusal(
        409,
        `${item.title} (${item.id}) is ${item.state}; finish_item finishes live work only.`
      );
    }
    if (!item.checks?.length) {
      throw new WorkItemRefusal(
        409,
        "This item has no acceptance checks yet; your parent sets them with set_item_checks."
      );
    }
    if (item.checkingSince) {
      throw new WorkItemRefusal(
        409,
        "checks are already running for this item"
      );
    }
    return { row, item, checks: item.checks };
  };

  /**
   * Runs `checks` in order in the workspace's worktree, on its machine, inside
   * the workspace's boundary: a check reads what its delegate wrote, at the
   * path the delegate wrote it (`/tmp` is the workspace's own there).
   */
  const runChecks = async (
    workspace: WorkspaceRow,
    checks: WorkItemCheck[]
  ): Promise<CheckOutcome[]> => {
    const outcomes: CheckOutcome[] = [];
    for (const check of checks) {
      const started = Date.now();
      // biome-ignore lint/performance/noAwaitInLoops: checks run in order, one at a time, in one worktree
      const complete = await command(
        workspace.machineId,
        workspace.path,
        check.command,
        (check.timeoutSec ?? CHECK_TIMEOUT_SEC) * 1000,
        refOf(workspace)
      );
      const result = checkTails(complete);
      outcomes.push({
        check,
        result,
        exitCode: result.exitCode,
        durationMs: Date.now() - started,
        passed:
          result.exitCode === 0 &&
          (check.expect === undefined || result.stdout.includes(check.expect)),
      });
    }
    return outcomes;
  };

  /**
   * The report's commits and diffstat: only what the item's own session
   * made. A range from a starting commit cannot say that — a rebase onto a
   * newer main pulls other people's commits into it, and after the push that
   * lands the work, `merge-base origin/<base> HEAD` is HEAD itself. The
   * worktree's HEAD reflog can: every commit its session made, or rewrote by
   * rebasing, is an entry there. The ones since the item began that HEAD still
   * holds are the item's ({@link keptCommits}); the diffstat runs from the
   * oldest of them. Each command prints only what the report shows.
   */
  const changesSince = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<string> => {
    const git = (cmd: string) =>
      command(workspace.machineId, workspace.path, cmd, GIT_TIMEOUT_MS);
    const since = Math.floor(item.createdAt.getTime() / 1000);
    const kept = (await git(keptCommits(since))).stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    if (!kept) {
      return `\n\nCommits:${fenced("(none)")}\n\nDiffstat:${fenced("(no changes)")}`;
    }
    const [commits, diffstat] = await Promise.all([
      git(`git log --oneline --no-walk ${kept}`),
      git(
        `git diff --stat "$(git merge-base --octopus ${kept})^" HEAD | tail -n ${DIFFSTAT_LINES}`
      ),
    ]);
    return `\n\nCommits:${fenced(commits.stdout.trim())}\n\nDiffstat:${fenced(diffstat.stdout.trim() || "(no changes)")}`;
  };

  /**
   * THE run of a `finish_item`: the item's checks, in order, against the
   * submission stored on its row, to an outcome. The live call and a hub
   * start-up resume both come here. All passing, the item is done and the
   * parent gets the report the hub builds; any failing, it is back to running
   * and the answer names the failures. Either way the row stops checking —
   * also when a check cannot run at all, which throws. Answers the text the
   * delegate reads, and whether the item is done.
   */
  const settleChecks = async (
    item: WorkItemRow,
    checks: WorkItemCheck[],
    submission: WorkItemSubmission
  ): Promise<{ done: boolean; text: string }> => {
    const [row] = db.getInstancesByIds([item.instanceId]);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    const settled = { checkingSince: null, submission: null };
    finishing.add(item.id);
    try {
      const outcomes = await runChecks(workspace, checks);
      const failing = outcomes.filter((outcome) => !outcome.passed);
      if (failing.length > 0) {
        update(item.id, settled);
        const passing = outcomes.filter((outcome) => outcome.passed);
        return {
          done: false,
          text: `${failing.length} of ${outcomes.length} checks failed. The item is still running: fix the cause and call finish_item again.\n\n${[...failing, ...passing].map(checkResultLine).join("\n")}`,
        };
      }
      const lines = outcomes.map(checkLine).join("\n");
      const body = `${submission.summary}\n\nChecks:\n${lines}${await changesSince(workspace, item)}${findingsBlock(submission.findings)}`;
      // The checks took their time: the item may have been stopped since.
      const current = db.workItem(item.id) ?? item;
      if (!LIVE.has(current.state)) {
        update(item.id, settled);
        return {
          done: false,
          text: `The checks passed, but ${current.title} is ${current.state} now; nothing was reported.`,
        };
      }
      const done = finish(current, { state: "done", result: body, ...settled });
      report(row, `${body}${reportLine(done)}`, false);
      return {
        done: true,
        text: `All ${outcomes.length} checks passed.\n\n${lines}\n\nThe item is done. End your turn.`,
      };
    } catch (error) {
      update(item.id, settled);
      throw error;
    } finally {
      finishing.delete(item.id);
    }
  };

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
     * A turn of a delegated session ended at `endedAt`, not by an interrupt,
     * and no standing instruction answered it. `turn.error` is the harness's
     * error when the turn failed; `turn.text` is what a report from a session
     * without checks carries. Answers what the parent is sent, or nothing.
     *
     * An item with checks ends only through {@link finishItem}, or here when
     * its turn failed. A turn that ends it quietly, with nothing queued for
     * the session, nothing handed to it since, and none of its own delegated
     * work live, gets the "still open" message; the third in a row fails it.
     *
     * An item filed before checks existed, and a delegate from before work
     * items, end as they always did: on a turn nothing answers, with that
     * turn's text as the report.
     */
    turnEnded(
      row: InstanceRow,
      turn: { text: string; error?: string },
      endedAt: Date
    ): { body: string; failed: boolean } | undefined {
      const item = itemOf(row);
      if (!item) {
        return { body: turn.text, failed: turn.error !== undefined };
      }
      const busy = busyAfter(row, endedAt);
      if (!item.checks) {
        return uncheckedTurn(item, turn, busy);
      }
      // A finished item has reported; one whose checks are running reports
      // when they settle (its session's own call may have died with the hub).
      if (!LIVE.has(item.state) || item.checkingSince) {
        return undefined;
      }
      if (turn.error !== undefined) {
        quiet.delete(item.id);
        const ended = busy
          ? item
          : finish(item, { state: "failed", error: turn.error });
        return { body: `${turn.error}${reportLine(ended)}`, failed: true };
      }
      if (busy) {
        return undefined;
      }
      const turns = (quiet.get(item.id) ?? 0) + 1;
      if (turns >= QUIET_TURNS) {
        quiet.delete(item.id);
        const failed = finish(item, { state: "failed", error: QUIET_ERROR });
        return { body: `${QUIET_ERROR}${reportLine(failed)}`, failed: true };
      }
      quiet.set(item.id, turns);
      tell(
        row,
        `Your work item is still open. Its checks: ${checkNames(item.checks)}. Finish the work and call finish_item, or call it with \`blocked\` and the exact command and error.`
      );
      return undefined;
    },

    /**
     * A message reached a session: one from its parent or the reader starts
     * its item's count of quiet turns over.
     */
    heard(instanceId: string, origin: NeutralOrigin): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item && reopens(item.parentInstanceId, origin)) {
        quiet.delete(item.id);
      }
    },

    /**
     * `finish_item` from the session `instanceId`: with `blocked`, the item
     * fails with that command and error. Otherwise the submission is stored
     * and the item marked checking before the first check starts, so a hub
     * that dies mid-run resumes it ({@link resumeChecks}); then
     * {@link settleChecks} runs it to its outcome. An item done already
     * answers its done result; one checking already is refused. Answers what
     * the tool returns.
     */
    async finishItem(
      instanceId: string,
      request: WorkItemSubmission
    ): Promise<string> {
      const open = finishable(instanceId);
      if (typeof open === "string") {
        return open;
      }
      const { row, item, checks } = open;
      quiet.delete(item.id);

      if (request.blocked) {
        const error = `Blocked: ${request.blocked.command}${fenced(request.blocked.error)}`;
        const failed = finish(item, { state: "failed", error });
        report(
          row,
          `${request.summary}\n\n${error}${findingsBlock(request.findings)}${reportLine(failed)}`,
          true
        );
        return "The item failed as blocked; your parent has the command and the error. End your turn.";
      }

      update(item.id, { submission: request, checkingSince: new Date() });
      return (await settleChecks(item, checks, request)).text;
    },

    /**
     * An agent has registered: every item on its machine left checking by a
     * hub that stopped mid-run has its checks run again from the first, on
     * the stored submission, through {@link settleChecks}. A pass needs no
     * word to the session — its parent has the report; a failure, or checks
     * that cannot run, is sent to the session as the tool would have
     * answered. An item this hub is running now is left to that run.
     */
    resumeChecks(machineId: string): void {
      for (const workspace of db.activeWorkspacesOn(machineId)) {
        for (const item of db.workItemsIn(workspace.id)) {
          const { checks, submission } = item;
          if (
            !(item.checkingSince && checks && submission) ||
            finishing.has(item.id)
          ) {
            continue;
          }
          console.log(`resumed checks for item ${item.id}`);
          const [row] = db.getInstancesByIds([item.instanceId]);
          settleChecks(item, checks, submission)
            .then(({ done, text }) => {
              if (!done) {
                tell(row, text);
              }
            })
            .catch((error: unknown) => {
              const reason =
                error instanceof Error ? error.message : String(error);
              console.error(`[work-items] ${item.id}: ${reason}`);
              tell(
                row,
                `Your work item's checks could not run: ${reason}. Call finish_item again.`
              );
            });
        }
      }
    },

    /**
     * The parent replaces the whole list of a running item's checks — one
     * written for a design that changed since. Refused to anyone else, while
     * the checks run, and on finished work. The session is told the new list,
     * and the still-open reminder and `finish_item` read it from then on.
     * Answers what the tool returns.
     */
    setChecks(
      instanceId: string,
      from: string,
      checks: WorkItemCheck[]
    ): string {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(row && item)) {
        throw new WorkItemRefusal(404, `${instanceId} runs no work item.`);
      }
      if (item.parentInstanceId !== from) {
        throw new WorkItemRefusal(
          403,
          "Only the session that delegated an item can replace its checks."
        );
      }
      if (item.checkingSince) {
        throw new WorkItemRefusal(
          409,
          "checks are running; wait for the outcome"
        );
      }
      if (!LIVE.has(item.state)) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${item.id}) is ${item.state}; only a running item's checks can be replaced.`
        );
      }
      const unchecked = checksProblem(checks);
      if (unchecked) {
        throw new WorkItemRefusal(400, unchecked);
      }
      update(item.id, { checks });
      tell(
        row,
        `Your work item's checks were replaced by your parent. Its checks: ${checkNames(checks)}.`
      );
      return `Replaced the checks of ${item.title} (${item.id}): ${checkNames(checks)}. Its session was told.`;
    },

    /**
     * Its session never started: a live item failed, and the report line says
     * why. An item that already ended has reported, so a session of it that
     * does not come back (a restore after an agent restart, into a workspace
     * since removed) is news for nobody: no line, and no report.
     */
    spawnFailed(row: InstanceRow, reason: string): string | undefined {
      const item = itemOf(row);
      return item && LIVE.has(item.state)
        ? reportLine(finish(item, { state: "failed", error: reason }))
        : undefined;
    },

    /** Its session was stopped or archived while the work was live. */
    cancelled(row: InstanceRow): void {
      const item = itemOf(row);
      if (item) {
        quiet.delete(item.id);
        finish(item, {
          state: "cancelled",
          checkingSince: null,
          submission: null,
        });
      }
    },

    /** One item, as `stop_delegate` and its callers read it. */
    item: (id: string): WorkItemRow | undefined => db.workItem(id),

    /** Whether the session's work item is over: done, failed or cancelled. */
    over(row: InstanceRow): boolean {
      const item = itemOf(row);
      return item !== undefined && !LIVE.has(item.state);
    },

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
