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
  LandsMode,
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
  type WorkspaceLanding,
  withLandingLine,
  withWorkspaceLine,
} from "@cawco/core";
import type { DbShape, WorkItemRow, WorkspaceRow } from "./db";
import type { WorkItemCheck, WorkItemSubmission } from "./db/schema";
import {
  type BranchOutcome,
  land,
  landingQueue,
  openPullRequest,
  pushBranch,
  quote,
} from "./landing";
import {
  FOLDER_FILE_LIMIT,
  FolderRefusal,
  folderPath,
  writeFolderFiles,
} from "./project-folder";

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

/** Whether an item in `state` is live work: starting or running. */
export const isLive = (state: WorkItemRow["state"]): boolean => LIVE.has(state);

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
  /** Where its commits go once its checks pass; `main` when left out. */
  lands?: LandsMode;
  /** The machine a new workspace is cut on; the parent's by default. */
  machineId?: string;
  model?: string;
  /**
   * Files in its workspace, as paths from the clone's root, that the hub
   * copies into its project's folder when it finishes. Needs a project.
   */
  outputs?: string[];
  parentInstanceId: string;
  prompt: string;
  /**
   * The workspace of an earlier attempt at the same task (a retry): the item
   * runs in a fresh session there when its clone is still on its machine,
   * else in a new workspace as though this were not given.
   */
  reuse?: string;
  skills?: string[];
  /**
   * The project task the item is an attempt at (dispatch.ts). Only for a new
   * workspace; the item's session may write that task's to-dos.
   */
  task?: { id: string; projectId: string };
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
  /** Store stop intent and wait for the machine's positive end confirmation. */
  readonly end: (instanceId: string) => Promise<void>;
  /** The agent's live turn state, including a long tool call with no output. */
  readonly inTurn: (row: InstanceRow) => boolean;
  /**
   * An item went from live to finished (done, failed or cancelled), as
   * written. Called in the same step; whoever listens defers its own work.
   */
  readonly itemEnded?: (item: WorkItemRow) => void;
  /** Tells every dashboard an item moved: its parent's delegate tray follows it. */
  readonly publish: (item: WorkItemSummary) => void;
  /** Hands a report to the parent of the item's session. */
  readonly report: (
    row: InstanceRow,
    body: string,
    failed: boolean,
    notice?: boolean
  ) => void;
  /** The one send path; its record says whether the machine took it. */
  readonly send: (envelope: Envelope<SendPayload>) => {
    reason: string | null;
    state: string;
  };
  /** Where a reader opens a session in the dashboard: the link a pull request carries back. */
  readonly sessionUrl?: (instanceId: string) => string;
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
  /** A task's title as its project's index has it: a pull request's title. */
  readonly taskTitle?: (
    projectId: string,
    taskId: string
  ) => string | undefined;
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
 * checkout, every shell command inside the workspace's boundary, and its
 * parent's project's, as the workspace is one of that project's places.
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
  ...(parent.projectId ? { projectId: parent.projectId } : {}),
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

/** A harness gets one minute after its declared deadline to start a turn. */
const WAIT_RESUME_GRACE_MS = 60_000;
const waitClock = (at: Date): string =>
  at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const WAIT_ITEM_LIMIT =
  "Wait not set. Use whole minutes from 1 to 120 and a non-empty reason for waiting on a command you started.";

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

/** A path as the project's folder reads it, or undefined when the folder refuses it. */
const folderPathOf = (raw: string): string | undefined => {
  try {
    return folderPath(raw);
  } catch (error) {
    if (error instanceof FolderRefusal) {
      return undefined;
    }
    throw error;
  }
};

/** Outputs one work item may name. */
const OUTPUTS_LIMIT = 50;

/**
 * A request's outputs as paths from the clone's root, each once; null for
 * none. Refused when one could reach outside the clone or into its history,
 * the same rules a path in the project's folder follows (where they go).
 */
const outputsOf = (outputs: string[] | undefined): string[] | null => {
  if (!outputs?.length) {
    return null;
  }
  if (outputs.length > OUTPUTS_LIMIT) {
    throw new WorkItemRefusal(
      400,
      `outputs names ${outputs.length} files; it stops at ${OUTPUTS_LIMIT}.`
    );
  }
  const paths = outputs.map((raw) => {
    const path = folderPathOf(raw.trim());
    if (path === undefined) {
      throw new WorkItemRefusal(
        400,
        `outputs: “${raw}” is not a path inside the workspace. Name each file from the workspace's root, like report.md or docs/notes.md: no leading "/", no "..", nothing under .git.`
      );
    }
    if (!path) {
      throw new WorkItemRefusal(
        400,
        `outputs: “${raw}” names the workspace itself; name a file in it, like report.md.`
      );
    }
    return path;
  });
  return [...new Set(paths)];
};

/** What an item's branch and its assets folder are named by: its task, else its own short id. */
const landingKey = (item: Pick<WorkItemRow, "id" | "taskId">): string =>
  item.taskId ?? item.id.slice(0, 8);

/** The branch an item that lands `branch` or `pr` is pushed to: `cawco/tsk-12`. */
export const landingBranch = (item: Pick<WorkItemRow, "id" | "taskId">) =>
  `cawco/${landingKey(item)}`;

/** How an item lands, as its session is told. */
const landingOf = (item: WorkItemRow): WorkspaceLanding => ({
  lands: item.lands,
  ...(item.outputs?.length ? { outputs: item.outputs } : {}),
});

const MIB = 1024 * 1024;

/** The shell that says of each output whether it is missing, a link, or a file of some size. */
const outputsProbe = (outputs: string[]): string =>
  outputs
    .map(
      (path) =>
        `p=${quote(path)}; if [ -L "$p" ]; then echo "link $p"; elif [ ! -f "$p" ]; then echo "missing $p"; else echo "size $(wc -c < "$p" | tr -d ' ') $p"; fi`
    )
    .join("; ");

/** What a probe's answer says is wrong with the outputs, a sentence each. */
const outputsSaid = (stdout: string): string[] => {
  const by = { missing: [] as string[], link: [] as string[] };
  const large: string[] = [];
  for (const line of stdout.split("\n")) {
    const [word, ...rest] = line.split(" ");
    if (word === "missing" || word === "link") {
      by[word].push(rest.join(" "));
    } else if (word === "size" && Number(rest[0]) > FOLDER_FILE_LIMIT) {
      large.push(
        `${rest.slice(1).join(" ")} is ${(Number(rest[0]) / MIB).toFixed(2)} MiB`
      );
    }
  }
  return [
    ...(by.missing.length > 0
      ? [
          `These outputs are not in your workspace: ${by.missing.join(", ")}; write each at its path from the workspace's root.`,
        ]
      : []),
    ...(by.link.length > 0
      ? [
          `These outputs are links, and the hub copies files: ${by.link.join(", ")}. Write the file itself at that path.`,
        ]
      : []),
    ...(large.length > 0
      ? [
          `${large.join("; ")}; an output stops at ${FOLDER_FILE_LIMIT / MIB} MiB.`,
        ]
      : []),
  ];
};

/** A command's failure in a few words: what it wrote, else its exit code. */
const failedWith = (result: CommandResult): string =>
  (result.stderr || result.stdout).trim() || `exit ${result.exitCode}`;

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
  waitUntil: item.waitUntil?.getTime() ?? null,
  waitReason: item.waitReason,
  firstLines: {
    brief: firstLine(item.brief),
    result: firstLine(item.result),
    error: firstLine(item.error),
  },
});

/**
 * What landing a checked item came to: done (with the pull request it opened
 * or found, landing `pr`), back to its session, or refused.
 */
type Landed =
  | { kind: "done" | "refused"; line: string; prUrl?: string }
  | { kind: "retry"; text: string };

/** The text that hands uncommitted work back to the session, for a landing that takes only commits. */
const dirtyText = (files: string, where: string): string =>
  `The checks passed, but the workspace has changes that are not committed, new files included. The checks ran on them and the hub lands only commits, so landing now could leave ${where} without them. Commit them, delete them, or add them to .gitignore, then call finish_item again.${fenced(files)}`;

/** A push to an item's own branch that did not happen, as its landing. */
const unpushed = (
  pushed: Exclude<BranchOutcome, { kind: "pushed" }>,
  workspace: WorkspaceRow,
  branch: string,
  lands: LandsMode
): Landed => {
  switch (pushed.kind) {
    case "dirty":
      return { kind: "retry", text: dirtyText(pushed.files, branch) };
    case "nothing":
      return {
        kind: "done",
        line: `Nothing to push: ${workspace.base} already holds every commit in this workspace${lands === "pr" ? ", so no pull request was opened" : ""}.`,
      };
    case "no-remote":
      return {
        kind: "done",
        line: "Not pushed: this workspace's repository has no remote.",
      };
    default:
      return {
        kind: "refused",
        line: `Not pushed: the push to branch ${branch} was refused.${fenced(pushed.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${workspace.id}.`,
      };
  }
};

/** How long a tray shows a finished item before it leaves (the dashboard's hold). */
const TRAY_HOLD_MS = 6000;

export const createWorkItems = ({
  call,
  command,
  db,
  end,
  itemEnded,
  publish,
  report,
  inTurn,
  send,
  sessionUrl,
  spawn,
  taskTitle,
  types,
}: WorkItemDeps) => {
  /** Turns in a row each live item's session ended without `finish_item`, by item. */
  const quiet = new Map<string, number>();
  const waitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Waits whose declaring turn ended: the next busy transition resumes them. */
  const waitsAtRest = new Set<string>();
  const disarmWait = (id: string): void => {
    clearTimeout(waitTimers.get(id));
    waitTimers.delete(id);
    waitsAtRest.delete(id);
    quiet.delete(id);
  };
  /** Items whose checks this hub process is running now: a resume leaves them to that run. */
  const finishing = new Set<string>();
  /** One landing at a time per repository and branch (landing.ts). */
  const landings = landingQueue();
  /** Creates this hub is still waiting for; register recovery leaves those to their caller. */
  const opening = new Set<string>();
  const discarding = new Map<string, Promise<void>>();
  /** The filed and unfiled cases use the same machine archive, acknowledged before forgetting it. */
  const discardCreate = (id: string, machineId: string): Promise<void> => {
    const pending = discarding.get(id);
    if (pending) {
      return pending;
    }
    const discarded = call(machineId, CONTROL_WORKSPACE_ARCHIVE, [{ id }])
      .then(() => db.finishWorkspaceCreate(id))
      .finally(() => discarding.delete(id));
    discarding.set(id, discarded);
    return discarded;
  };
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
  ): WorkItemRow | undefined => {
    if (change.state && !LIVE.has(change.state)) {
      disarmWait(id);
      const before = db.workItem(id);
      const after = published(
        db.updateWorkItem(id, {
          ...change,
          waitUntil: null,
          waitReason: null,
          waitResumeBy: null,
        })
      );
      if (after && before && LIVE.has(before.state)) {
        itemEnded?.(after);
      }
      return after;
    }
    return published(db.updateWorkItem(id, change));
  };
  const clearWait = (item: WorkItemRow): void => {
    disarmWait(item.id);
    if (item.waitUntil || item.waitReason !== null || item.waitResumeBy) {
      update(item.id, {
        waitUntil: null,
        waitReason: null,
        waitResumeBy: null,
      });
    }
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
    cwd: string,
    machineId: string
  ): Promise<WorkspaceRow> => {
    const id = crypto.randomUUID();
    db.beginWorkspaceCreate(id, machineId);
    opening.add(id);
    const started = Date.now();
    try {
      const checkout = (await call(machineId, CONTROL_WORKSPACE_CREATE, [
        cwd,
        id,
      ])) as WorkspaceCheckout;
      return db.createWorkspace({
        id,
        machineId,
        repoRoot: checkout.repoRoot,
        path: checkout.path,
        branch: checkout.branch,
        base: checkout.base,
        boundaryPid: checkout.boundaryPid,
        state: "active",
        createdByInstanceId: parent.id,
      });
    } catch (error) {
      opening.delete(id);
      const reason = error instanceof Error ? error.message : String(error);
      const waited = ((Date.now() - started) / 1000).toFixed(1);
      try {
        await discardCreate(id, machineId);
      } catch (discardError) {
        const pending =
          discardError instanceof Error
            ? discardError.message
            : String(discardError);
        throw new Error(
          `Workspace create on machine ${machineId} failed after ${waited}s: ${reason}. Discard of workspace ${id} is pending (${pending}); it will be retried when the machine next registers.`,
          { cause: discardError }
        );
      }
      throw new Error(
        `Workspace create on machine ${machineId} failed after ${waited}s: ${reason}. Workspace ${id} was discarded; no clone or boundary was left.`,
        { cause: error }
      );
    } finally {
      opening.delete(id);
    }
  };

  /** A new workspace's machine; a remote one needs its own repository and cannot fork. */
  const targetMachine = (
    request: WorkItemRequest,
    parent: InstanceRow
  ): string => {
    const machineId = request.machineId ?? parent.machineId;
    if (machineId !== parent.machineId) {
      if (request.fork) {
        throw new WorkItemRefusal(
          400,
          "A fork copies a conversation stored on the parent's machine; drop machine, or delegate without fork."
        );
      }
      if (!request.cwd?.trim()) {
        throw new WorkItemRefusal(
          400,
          "A delegate on another machine needs cwd: the repository's absolute path on that machine."
        );
      }
    }
    return machineId;
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
      ...placing(request, parent),
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
    const brief = `${handoffMarker(leaf(parent.cwd))}${request.prompt}`;
    // The session read how its last item landed; this one is told when it
    // lands otherwise or hands in outputs.
    const told =
      item.lands === "main" && !item.outputs?.length
        ? brief
        : withLandingLine(brief, workspace.base, landingOf(item));
    const sent = send(messageOf(session.id, session.machineId, parent, told));
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
      request.machineId !== undefined ||
      request.skills?.length
    ) {
      throw new WorkItemRefusal(
        400,
        "a follow-up continues the same session; delegate without workspace for a different model or machine"
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

  /**
   * The workspace of an earlier attempt a retry runs in again, when its clone
   * is still on its machine: its boundary started again (and the workspace
   * filed as active again, should it have been archived with the clone left
   * behind). Undefined when the clone is gone or its machine cannot say, and
   * the retry cuts a new workspace. Refused while an item there is live.
   */
  const reusable = async (
    id: string,
    projectId: string | null
  ): Promise<WorkspaceRow | undefined> => {
    const [workspace] = db.workspacesNamed(id);
    if (!workspace) {
      return;
    }
    const busy = (): void => {
      const live = db
        .workItemsIn(workspace.id)
        .find((item) => LIVE.has(item.state));
      if (live) {
        throw new WorkItemRefusal(
          409,
          `Workspace ${workspace.id} already has a live work item: ${live.title} (${live.id}) is ${live.state}. A workspace runs one work item at a time.`
        );
      }
    };
    busy();
    try {
      const there = await command(
        workspace.machineId,
        "/",
        `test -d ${quote(`${workspace.path}/.git`)}`,
        GIT_TIMEOUT_MS
      );
      if (there.exitCode !== 0) {
        return;
      }
      const boundaryPid = (await call(
        workspace.machineId,
        CONTROL_WORKSPACE_BOUNDARY,
        [refOf(workspace)]
      )) as number;
      // Awaited above: the one-writer check again, in the step that files the item.
      busy();
      if (workspace.state === "archived" && projectId) {
        db.addPlace({
          projectId,
          machineId: workspace.machineId,
          path: workspace.path,
          kind: "workspace",
        });
      }
      return (
        db.updateWorkspace(workspace.id, { boundaryPid, state: "active" }) ??
        workspace
      );
    } catch (error) {
      if (error instanceof WorkItemRefusal) {
        throw error;
      }
      console.warn(
        `[work-items] workspace ${workspace.id} cannot be used again, so a new one is cut: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  };

  /**
   * The request as {@link start} files it (its outputs as paths), its parent,
   * and the project it works for; refused when any of it cannot stand.
   */
  const admitted = (
    asked: WorkItemRequest
  ): {
    parent: InstanceRow;
    projectId: string | null;
    request: WorkItemRequest;
  } => {
    const request = {
      ...asked,
      outputs: outputsOf(asked.outputs) ?? undefined,
    };
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
    const projectId = request.task?.projectId ?? parent.projectId;
    if (request.outputs && !projectId) {
      throw new WorkItemRefusal(
        400,
        "outputs are copied into the project's folder, and this session belongs to no project. Drop outputs, or delegate from a session in a project."
      );
    }
    return { request, parent, projectId };
  };

  const start = async (asked: WorkItemRequest): Promise<WorkItemStart> => {
    const { request, parent, projectId } = admitted(asked);
    if (request.reuse) {
      const again = await reusable(request.reuse, projectId);
      if (again) {
        return spawnIn(again, settingsOf(request, parent), parent, request);
      }
    }
    if (!request.workspace) {
      const machineId = targetMachine(request, parent);
      const settings = settingsOf(request, parent);
      const workspace = await openWorkspace(
        parent,
        request.cwd ?? parent.cwd,
        machineId
      );
      // While it lives, the clone is one of the parent's project's places;
      // archiving the workspace removes it.
      if (parent.projectId) {
        db.addPlace({
          projectId: parent.projectId,
          machineId,
          path: workspace.path,
          kind: "workspace",
        });
      }
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

  /**
   * Where an item lands and what it hands in, and the project it works for
   * (its task's, else its parent's), as its row keeps them.
   */
  const placing = (request: WorkItemRequest, parent: InstanceRow) => {
    const projectId = request.task?.projectId ?? parent.projectId;
    return {
      ...(request.task ? { taskId: request.task.id } : {}),
      ...(projectId ? { projectId } : {}),
      lands: request.lands ?? "main",
      outputs: request.outputs?.length ? request.outputs : null,
    };
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
      ...placing(request, parent),
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
            workspace.base,
            landingOf(item)
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

  /** One expiry path for a live timer, an overdue startup wait, or a turn reaching its deadline. */
  const endWait = (id: string): void => {
    const item = db.workItem(id);
    if (!item?.waitUntil) {
      disarmWait(id);
      return;
    }
    const reason = item.waitReason;
    const resumeBy = new Date(item.waitUntil.getTime() + WAIT_RESUME_GRACE_MS);
    clearWait(item);
    const [row] = db.getInstancesByIds([item.instanceId]);
    if (row && LIVE.has(item.state)) {
      if (inTurn(row)) {
        return;
      }
      const resuming = update(id, { waitResumeBy: resumeBy }) as WorkItemRow;
      armWait(resuming);
      tell(
        row,
        `Your wait is over: ${reason}. Continue, then call finish_item.`
      );
    }
  };
  const armWait = (item: WorkItemRow): void => {
    disarmWait(item.id);
    if (item.waitResumeBy && LIVE.has(item.state)) {
      const missed = (): void => {
        waitTimers.delete(item.id);
        const current = db.workItem(item.id);
        if (!(current?.waitResumeBy && LIVE.has(current.state))) {
          return;
        }
        update(item.id, { waitResumeBy: null });
        const [row] = db.getInstancesByIds([item.instanceId]);
        if (row && !inTurn(row)) {
          report(
            row,
            `${item.title}: the delegate did not resume within 60 seconds of its wait deadline.`,
            false,
            true
          );
        }
      };
      const timer = setTimeout(
        missed,
        Math.max(0, item.waitResumeBy.getTime() - Date.now())
      );
      timer.unref?.();
      waitTimers.set(item.id, timer);
      return;
    }
    if (!item.waitUntil) {
      return;
    }
    const remaining = item.waitUntil.getTime() - Date.now();
    if (!LIVE.has(item.state) || remaining <= 0) {
      endWait(item.id);
      return;
    }
    const timer = setTimeout(() => endWait(item.id), remaining);
    timer.unref?.();
    waitTimers.set(item.id, timer);
  };
  const waitingTurn = (item: WorkItemRow): boolean => {
    if (!item.waitUntil) {
      return false;
    }
    quiet.delete(item.id);
    if (item.waitUntil.getTime() <= Date.now()) {
      endWait(item.id);
    }
    return true;
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

  /** Runs a command in the item's workspace, inside its boundary. */
  const runIn =
    (workspace: WorkspaceRow) =>
    (cmd: string, timeoutMs: number): Promise<CommandResult> =>
      command(
        workspace.machineId,
        workspace.path,
        cmd,
        timeoutMs,
        refOf(workspace)
      );

  /**
   * Lands a checked item's commits on its workspace's base branch
   * (landing.ts). Answers the line the report and the delegate read when the
   * item can be done; the text that hands it back to its delegate (`retry`:
   * uncommitted work, a conflict, checks that fail after a rebase); or the line
   * that says why it could not land (`refused`).
   */
  const landOnBase = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[]
  ): Promise<Landed> => {
    const { base } = workspace;
    const outcome = await land<CheckOutcome[]>(base, {
      run: runIn(workspace),
      recheck: async () => {
        const again = await runChecks(workspace, checks);
        return again.some((check) => !check.passed) ? again : undefined;
      },
      queue: landings,
      skip: item.outputs ?? [],
    });
    switch (outcome.kind) {
      case "landed":
        return {
          kind: "done",
          line: `Landed on ${base} at ${outcome.sha.slice(0, 9)}${outcome.rebased ? `, rebased onto the newer ${base} with the checks run again` : ""}.`,
        };
      case "nothing":
        return {
          kind: "done",
          line: `Nothing to land: ${base} already holds every commit in this workspace.`,
        };
      case "no-remote":
        return {
          kind: "done",
          line: "Not landed: this workspace's repository has no remote.",
        };
      case "dirty":
        return { kind: "retry", text: dirtyText(outcome.files, base) };
      case "conflict":
        return {
          kind: "retry",
          text: `The checks passed, but your commits conflict with origin/${base} in:${fenced(outcome.files)}\nThe hub undid its rebase. Rebase onto origin/${base} yourself, resolve the conflicts, commit, and call finish_item again.`,
        };
      case "recheck-failed": {
        const failing = outcome.failing.filter((check) => !check.passed);
        const passing = outcome.failing.filter((check) => check.passed);
        return {
          kind: "retry",
          text: `${base} had moved, so the hub rebased your commits onto it and ran the checks again: ${failing.length} of ${outcome.failing.length} failed. Your branch is now on top of origin/${base}. Fix the cause and call finish_item again.\n\n${[...failing, ...passing].map(checkResultLine).join("\n")}`,
        };
      }
      default:
        return {
          kind: "refused",
          line: `Not landed: the push to ${base} was refused.${fenced(outcome.detail)}\nThe commits are on branch ${workspace.branch} in workspace ${workspace.id}.`,
        };
    }
  };

  /** A pull request's body: what the delegate said it did, its checks, and where its report is. */
  const pullRequestBody = (
    item: WorkItemRow,
    said: { lines: string; summary: string }
  ): string => {
    const link = sessionUrl?.(item.instanceId);
    const what = item.taskId
      ? `an attempt at ${item.taskId}`
      : `work item ${item.id}`;
    return [
      said.summary.trim(),
      `Checks, run by the CawCo hub:\n${said.lines}`,
      link
        ? `This is ${what}; its report and transcript: ${link}`
        : `This is ${what} (work item ${item.id}).`,
    ].join("\n\n");
  };

  /**
   * Lands an item that lands `branch` or `pr`: its commits pushed as they are
   * to `cawco/<task or item>`, and for `pr`, a pull request against the base
   * branch opened, or the open one found. gh turning the pull request down
   * refuses the landing in gh's words.
   */
  const landOnBranch = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    said: { lines: string; summary: string }
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const pushed = await pushBranch(base, branch, {
      run: runIn(workspace),
      queue: landings,
      skip: item.outputs ?? [],
    });
    if (pushed.kind !== "pushed") {
      return unpushed(pushed, workspace, branch, item.lands);
    }
    const at = `${branch} at ${pushed.sha.slice(0, 9)}`;
    return item.lands === "pr"
      ? await pullRequestFor(workspace, item, said, at)
      : {
          kind: "done",
          line: `Pushed to branch ${at} on origin; ${base} is untouched.`,
        };
  };

  /** Opens the pull request for an item's pushed branch, or finds the open one. */
  const pullRequestFor = async (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    said: { lines: string; summary: string },
    at: string
  ): Promise<Landed> => {
    const { base } = workspace;
    const branch = landingBranch(item);
    const title =
      (item.projectId && item.taskId
        ? taskTitle?.(item.projectId, item.taskId)
        : undefined) ?? item.title;
    const pr = await openPullRequest(
      { base, branch, title, body: pullRequestBody(item, said) },
      runIn(workspace)
    );
    if (pr.kind === "refused") {
      return {
        kind: "refused",
        line: `Pushed to branch ${at}, but the pull request was not opened. gh said:${fenced(pr.detail)}\nOpen it by hand from ${branch} into ${base}, or start the task again once gh can.`,
      };
    }
    return {
      kind: "done",
      prUrl: pr.url,
      line:
        pr.kind === "opened"
          ? `Pushed to branch ${at} and opened a pull request against ${base}: ${pr.url}`
          : `Pushed to branch ${at}, which updates its open pull request: ${pr.url}`,
    };
  };

  /** Lands a checked item the way it lands: on its base, on a branch, through a pull request, or not at all. */
  const landChecked = (
    workspace: WorkspaceRow,
    item: WorkItemRow,
    checks: WorkItemCheck[],
    said: { lines: string; summary: string }
  ): Promise<Landed> => {
    switch (item.lands) {
      case "none":
        return Promise.resolve({
          kind: "done",
          line: item.outputs?.length
            ? "Nothing pushed: this item lands none, and its outputs are what it hands in."
            : "Nothing pushed: this item lands none.",
        });
      case "branch":
      case "pr":
        return landOnBranch(workspace, item, said);
      default:
        return landOnBase(workspace, item, checks);
    }
  };

  /**
   * Whether each of the item's outputs is in its workspace: a file (not a
   * link, which could lead anywhere) within the size the project's folder
   * takes. The text that sends the item back when one is not; else nothing.
   */
  const outputsProblem = async (
    workspace: WorkspaceRow,
    outputs: string[]
  ): Promise<string | undefined> => {
    const result = await runIn(workspace)(
      outputsProbe(outputs),
      GIT_TIMEOUT_MS
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `the hub could not look for the item's outputs: ${failedWith(result)}`
      );
    }
    const problems = outputsSaid(result.stdout);
    return problems.length > 0
      ? `The checks passed, but the item's outputs are not ready. ${problems.join(" ")} Then call finish_item again.`
      : undefined;
  };

  /**
   * Copies the item's outputs from its workspace into its project's folder,
   * under `assets/<task or item>/`, in one commit (project-folder.ts). The
   * report's lines on them, and whether they arrived.
   */
  const collectOutputs = async (
    workspace: WorkspaceRow,
    item: WorkItemRow
  ): Promise<{ ok: boolean; line: string }> => {
    const outputs = item.outputs ?? [];
    if (outputs.length === 0) {
      return { ok: true, line: "" };
    }
    if (!item.projectId) {
      return {
        ok: false,
        line: "\n\nOutputs not collected: the item belongs to no project.",
      };
    }
    const folder = `assets/${landingKey(item)}`;
    try {
      const files: { path: string; content: Uint8Array }[] = [];
      for (const path of outputs) {
        // biome-ignore lint/performance/noAwaitInLoops: one file at a time keeps each read under the command's output cap
        const read = await runIn(workspace)(
          `base64 < ${quote(path)}`,
          GIT_TIMEOUT_MS
        );
        if (read.exitCode !== 0) {
          throw new Error(`${path} could not be read: ${failedWith(read)}`);
        }
        files.push({
          path: `${folder}/${path}`,
          content: Buffer.from(read.stdout, "base64"),
        });
      }
      const written = await writeFolderFiles(item.projectId, files, {
        author: { name: item.title },
        message: `assets: ${item.taskId ? `outputs of ${item.taskId}, attempt ${item.id.slice(0, 8)}` : `outputs of work item ${item.id.slice(0, 8)}`}`,
      });
      return {
        ok: true,
        line: `\n\nOutputs, copied into the project's folder ${written.changed ? `at ${written.sha.slice(0, 9)}` : "(already there, unchanged)"}:\n${written.paths.map((path) => `- ${path}`).join("\n")}`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        line: `\n\nOutputs not collected into ${folder}/: ${reason}`,
      };
    }
  };

  /**
   * A checked item, its checks all passed, to its end: its outputs must be
   * in its workspace (else it is back to running, told which are not); then
   * it lands as its row says and its outputs are collected, and it is done
   * (or failed, when it could not land or its outputs did not arrive) with
   * the report the hub builds sent to its parent.
   */
  const landAndReport = async (
    item: WorkItemRow,
    row: InstanceRow,
    workspace: WorkspaceRow,
    checks: WorkItemCheck[],
    submission: WorkItemSubmission,
    passed: { count: number; lines: string }
  ): Promise<{ done: boolean; text: string }> => {
    const settled = { checkingSince: null, submission: null };
    const { count, lines } = passed;
    const unready = item.outputs?.length
      ? await outputsProblem(workspace, item.outputs)
      : undefined;
    if (unready) {
      update(item.id, settled);
      return { done: false, text: unready };
    }
    const landing = await landChecked(workspace, item, checks, {
      summary: submission.summary,
      lines,
    });
    if (landing.kind === "retry") {
      update(item.id, settled);
      return { done: false, text: landing.text };
    }
    const collected =
      landing.kind === "done"
        ? await collectOutputs(workspace, item)
        : { ok: true, line: "" };
    const body = `${submission.summary}\n\nChecks:\n${lines}\n\n${landing.line}${collected.line}${await changesSince(workspace, item)}${findingsBlock(submission.findings)}`;
    const landed = landing.kind === "done" && collected.ok;
    const ended = finish(db.workItem(item.id) ?? item, {
      state: landed ? "done" : "failed",
      result: body,
      ...(landing.kind === "done" && landing.prUrl
        ? { prUrl: landing.prUrl }
        : {}),
      ...settled,
    });
    report(row, `${body}${reportLine(ended)}`, false);
    if (landing.kind !== "done") {
      return {
        done: false,
        text: `All ${count} checks passed, but the work could not land. ${landing.line}\n\nThe item has failed and your parent has the details. End your turn.`,
      };
    }
    return collected.ok
      ? {
          done: true,
          text: `All ${count} checks passed. ${landing.line}${collected.line}\n\n${lines}\n\nThe item is done. End your turn.`,
        }
      : {
          done: false,
          text: `All ${count} checks passed. ${landing.line} But the outputs did not arrive.${collected.line}\n\nThe item has failed and your parent has the details. End your turn.`,
        };
  };

  /**
   * THE run of a `finish_item`: the item's checks, in order, against the
   * submission stored on its row, to an outcome. The live call and a hub
   * start-up resume both come here. All passing, the item's outputs must be
   * in its workspace (else it is back to running, told which are not); then
   * it lands as its row says and its outputs are collected, and it is done
   * and the parent gets the report the hub builds; any check failing, it is
   * back to running and the answer names the failures. Either way the row
   * stops checking — also when a check cannot run at all, which throws.
   * Answers the text the delegate reads, and whether the item is done.
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
      // The checks took their time: the item may have been stopped since.
      const stopped = db.workItem(item.id) ?? item;
      if (!LIVE.has(stopped.state)) {
        update(item.id, settled);
        return {
          done: false,
          text: `The checks passed, but ${stopped.title} is ${stopped.state} now; nothing was landed or reported.`,
        };
      }
      return await landAndReport(stopped, row, workspace, checks, submission, {
        count: outcomes.length,
        lines,
      });
    } catch (error) {
      update(item.id, settled);
      throw error;
    } finally {
      finishing.delete(item.id);
    }
  };

  return {
    start,

    /** The one send path adds this to reports, handoffs and asks alike. */
    waitSummary(instanceId: string, parentInstanceId: string): string {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      const history =
        item?.parentInstanceId === parentInstanceId ? item.waitHistory : null;
      return history
        ? `\n\nWaited ${history.count} time${history.count === 1 ? "" : "s"} since its last delivered message; last wait until ${waitClock(new Date(history.until))}: ${history.reason}.`
        : "";
    },

    delivered(instanceId: string, parentInstanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.parentInstanceId === parentInstanceId && item.waitHistory) {
        db.updateWorkItem(item.id, { waitHistory: null });
      }
    },

    /** The live idle/busy transition, even while turn-end rules are still deciding. */
    turnState(instanceId: string, busy: boolean): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!busy && item?.waitUntil) {
        waitsAtRest.add(item.id);
      } else if (
        busy &&
        (item?.waitResumeBy || (item?.waitUntil && waitsAtRest.has(item.id)))
      ) {
        clearWait(item);
      }
    },

    /** Called once startup has installed the hub's send path. */
    resumeWaits(): void {
      for (const item of db.waitingWorkItems()) {
        armWait(item);
        if (item.waitUntil) {
          waitsAtRest.add(item.id);
        }
      }
    },

    /** Declares a bounded wait; the tray keeps it, the next actionable message summarizes it. */
    waitItem(instanceId: string, minutes: unknown, reason: unknown): string {
      if (
        typeof minutes !== "number" ||
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 120 ||
        typeof reason !== "string" ||
        !reason.trim()
      ) {
        throw new WorkItemRefusal(400, WAIT_ITEM_LIMIT);
      }
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (!(row && item)) {
        throw new WorkItemRefusal(
          409,
          "No work item is open on this session. Start a delegate before calling wait_item."
        );
      }
      if (!LIVE.has(item.state) || item.checkingSince) {
        throw new WorkItemRefusal(
          409,
          `${item.title} (${item.id}) cannot wait while ${item.checkingSince ? "its checks run" : `it is ${item.state}`}. Continue a live item before calling wait_item.`
        );
      }
      clearWait(item);
      const waitUntil = new Date(Date.now() + minutes * 60_000);
      const waitReason = reason.trim().replace(/\s+/g, " ");
      const waiting = update(item.id, {
        state: "running",
        waitUntil,
        waitReason,
        waitHistory: {
          count: (item.waitHistory?.count ?? 0) + 1,
          until: waitUntil.getTime(),
          reason: waitReason,
        },
      }) as WorkItemRow;
      armWait(waiting);
      const clock = waitClock(waitUntil);
      const line = `${item.title} is waiting until ${clock}: ${waitReason}`;
      return `${line}\n\nEnd your turn. The hub will wake you when the wait ends.`;
    },

    /** An interrupt cancels the declared wait without starting another turn. */
    interrupted(instanceId: string): void {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row ? itemOf(row) : undefined;
      if (item?.waitUntil || item?.waitResumeBy) {
        clearWait(item);
      }
    },

    /** Replays durable discards, including creates whose reply a previous hub never received. */
    discardUnfiled(machineId: string): void {
      for (const { id } of db.workspaceCreatesOn(machineId)) {
        if (opening.has(id)) {
          continue;
        }
        discardCreate(id, machineId).catch((error: unknown) => {
          console.warn(
            `[workspaces] discard ${id} on ${machineId} is still pending: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }
    },

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
     * work live, gets the "still open" message; the third in a row fails it
     * and reports that failure to the parent. A declared wait stays
     * on the tray and is summarized only with the next actionable message.
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
      if (turn.error === undefined && waitingTurn(item)) {
        return undefined;
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
        `Your work item is still open. Its checks: ${checkNames(item.checks)}. Finish the work and call finish_item, or call it with \`blocked\` and the exact command and error. Use wait_item for a bounded wait on a command you started.`
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
      clearWait(item);

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
      await Promise.all(
        db.workItemsIn(workspace.id).map((item) => end(item.instanceId))
      );
      await call(workspace.machineId, CONTROL_WORKSPACE_ARCHIVE, [
        refOf(workspace),
      ]);
      db.removeWorkspacePlaces(workspace.machineId, workspace.path);
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
