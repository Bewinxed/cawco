/**
 * Each harness's own to-do list, read where the harness keeps it and mapped
 * into one shape, a session's plan steps (`PlanStep`, core plan.ts). One
 * reader per harness:
 * - Claude Code: its task ledger, one JSON file per task under its config
 *   dir's `tasks/<session>/` (the session's account's dir, else `~/.claude`),
 *   read on the session's machine;
 * - OpenCode: its todo list, through the agent's `getTodos` control;
 * - pi: none.
 * Nothing here is stored: the harness's list is the truth.
 */
import {
  CONTROL_GET_TODOS,
  type CommandResult,
  type InstanceRow,
  type NeutralTask,
  type PlanStep,
} from "@cawco/core";

/** A ledger read is local; past this the machine is not going to answer it. */
const READ_MS = 10_000;
/** Record separator between ledger files in one command's output. */
const SEPARATOR = "\u001e";
/** A harness session id is a plain token; anything else is not put in a shell line. */
const SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** One task of Claude Code's ledger, as its file has it. */
export interface LedgerTask {
  description?: string;
  id: string;
  status: PlanStep["status"];
  subject: string;
}

export interface HarnessPlanDeps {
  /** A machine control, answered by the session's harness (server.ts `callAgent`). */
  control: (
    machineId: string,
    method: string,
    args: unknown[],
    harness: "opencode"
  ) => Promise<unknown>;
  online: (machineId: string) => boolean;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
}

type Row = Pick<
  InstanceRow,
  "accountId" | "cwd" | "harness" | "machineId" | "sessionId"
>;

const statusOf = (raw: unknown): PlanStep["status"] =>
  raw === "in_progress" || raw === "completed" ? raw : "pending";

/** One ledger file, if it is one. */
const ledgerTask = (id: string, text: string): LedgerTask | null => {
  try {
    const raw = JSON.parse(text) as {
      subject?: unknown;
      description?: unknown;
      status?: unknown;
    };
    if (typeof raw.subject !== "string") {
      return null;
    }
    return {
      id,
      subject: raw.subject,
      status: statusOf(raw.status),
      ...(typeof raw.description === "string" && raw.description.trim()
        ? { description: raw.description }
        : {}),
    };
  } catch {
    // A half-written file is not a reason to lose the plan.
    return null;
  }
};

/** Claude Code's ledger for the session, every task, in id order. */
export const readClaudeLedger = async (
  deps: Pick<HarnessPlanDeps, "online" | "run">,
  row: Row
): Promise<LedgerTask[]> => {
  if (
    (row.harness ?? "claude") !== "claude" ||
    !row.sessionId ||
    !SESSION_ID.test(row.sessionId) ||
    !deps.online(row.machineId)
  ) {
    return [];
  }
  // Claude Code keeps the ledger in its config dir: a session on an account
  // runs in that account's (`~/.cawco/accounts/<id>/claude`, core paths.ts
  // `accountConfigDir`, where a move also carries it), one from before
  // accounts in `~/.claude`. The account's dir is read first.
  const dirs = [
    ...(row.accountId && SESSION_ID.test(row.accountId)
      ? [
          `"$HOME/.cawco/accounts/${row.accountId}/claude/tasks/${row.sessionId}"`,
        ]
      : []),
    `"$HOME/.claude/tasks/${row.sessionId}"`,
  ];
  // The first dir that exists; each file as its number on a line, its JSON,
  // then a record separator.
  const cmd = `d=; for c in ${dirs.join(" ")}; do [ -d "$c" ] && { d=$c; break; }; done; [ -n "$d" ] || exit 0; for f in "$d"/*.json; do [ -f "$f" ] && { basename "$f" .json; cat "$f"; printf '\\n\\036\\n'; }; done; exit 0`;
  try {
    const result = await deps.run(row.machineId, "/", cmd, READ_MS);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout
      .split(SEPARATOR)
      .map((chunk) => {
        const text = chunk.trim();
        const newline = text.indexOf("\n");
        return newline < 0
          ? null
          : ledgerTask(text.slice(0, newline), text.slice(newline + 1));
      })
      .filter((task): task is LedgerTask => task !== null)
      .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  } catch {
    return [];
  }
};

/** OpenCode's todos for the session, as the agent's `getTodos` answers them. */
const readOpencodeTodos = async (
  deps: Pick<HarnessPlanDeps, "control" | "online">,
  row: Row
): Promise<NeutralTask[]> => {
  if (!(row.sessionId && deps.online(row.machineId))) {
    return [];
  }
  const answer = await deps.control(
    row.machineId,
    CONTROL_GET_TODOS,
    [row.sessionId, row.cwd || undefined],
    "opencode"
  );
  return Array.isArray(answer) ? (answer as NeutralTask[]) : [];
};

/** The session's steps from its harness's own list; pi keeps none. */
export const harnessSteps = async (
  deps: HarnessPlanDeps,
  row: Row
): Promise<PlanStep[]> => {
  switch (row.harness ?? "claude") {
    case "claude":
      return (await readClaudeLedger(deps, row)).map((task) => ({
        id: task.id,
        content: task.subject,
        status: task.status,
        depth: 0,
      }));
    case "opencode":
      return (await readOpencodeTodos(deps, row)).map((task) => ({
        id: task.id,
        content: task.subject,
        status: task.status,
        depth: 0,
        ...(task.priority ? { priority: task.priority } : {}),
      }));
    default:
      return [];
  }
};
