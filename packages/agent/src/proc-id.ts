/** The process keeper's namespace. Infrastructure procs are never sessions. */
export const OPENCODE_SERVER_PROC_ID = "opencode-server";
export const SESSION_PROC_KINDS = ["claude", "pi"] as const;

export type ProcId =
  | { kind: "claude" | "pi"; instanceId: string }
  | { kind: "boundary"; id: string }
  | { kind: "judge" }
  | { kind: "opencode-server" };

const JUDGE_PREFIX = "judge-";

/** A workspace's judge of one form (boundary.ts `judgeFor`): one runs per form. */
export const judgeProcId = (workspace: string, form: string): string =>
  `${JUDGE_PREFIX}${workspace}-${form}`;

/** Whether `procId` is one of workspace `workspace`'s judges, of any form. */
export const isJudgeOf = (procId: string, workspace: string): boolean =>
  procId.startsWith(`${JUDGE_PREFIX}${workspace}-`);

export function procIdFor(
  kind: "claude" | "pi" | "boundary",
  id: string
): string {
  switch (kind) {
    case "claude":
      return id;
    case "pi":
      return `pi:${id}`;
    case "boundary":
      return `boundary-${id}`;
    default:
      return kind satisfies never;
  }
}

export function parseProcId(procId: string): ProcId {
  if (
    procId === OPENCODE_SERVER_PROC_ID ||
    procId.startsWith(`${OPENCODE_SERVER_PROC_ID}-`)
  ) {
    return { kind: "opencode-server" };
  }
  if (procId.startsWith(JUDGE_PREFIX)) {
    return { kind: "judge" };
  }
  if (procId.startsWith("boundary-")) {
    return { kind: "boundary", id: procId.slice("boundary-".length) };
  }
  if (procId.startsWith("pi:")) {
    return { kind: "pi", instanceId: procId.slice(3) };
  }
  return { kind: "claude", instanceId: procId };
}
