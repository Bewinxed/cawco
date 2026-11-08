/** The process keeper's namespace. Infrastructure procs are never sessions. */
export const OPENCODE_SERVER_PROC_ID = "opencode-server";
export const SESSION_PROC_KINDS = ["claude", "pi"] as const;

export type ProcId =
  | { kind: "claude" | "pi"; instanceId: string }
  | { kind: "boundary"; id: string }
  | { kind: "judge" }
  | { kind: "opencode-server" };

const JUDGE_PREFIX = "judge-";

/** How many hex digits of its hash a judge's form is (boundary.ts `judgeFor`). */
export const JUDGE_FORM_LENGTH = 16;

/** A workspace's judge of one form (boundary.ts `judgeFor`): one runs per form. */
export const judgeProcId = (workspace: string, form: string): string =>
  `${JUDGE_PREFIX}${workspace}-${form}`;

/** Whether `procId` is one of workspace `workspace`'s judges, of any form. */
export const isJudgeOf = (procId: string, workspace: string): boolean =>
  procId.startsWith(`${JUDGE_PREFIX}${workspace}-`);

/**
 * A workspace's boundary of one generation (boundary.ts `start`): an older
 * one runs on beside the current one until nothing runs in it.
 */
export const boundaryProcId = (workspace: string, generation: string) =>
  `${procIdFor("boundary", workspace)}-${generation}`;

/** Whether `procId` is one of workspace `workspace`'s boundaries, of any generation. */
export const isBoundaryOf = (procId: string, workspace: string): boolean =>
  procId.startsWith(`${procIdFor("boundary", workspace)}-`);

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

/** A keeper child that is a session's, with whose: every other child (a boundary, a judge, a server) is the machine's. */
export type SessionProc = Extract<ProcId, { instanceId: string }>;

/** `procId` as a session's child, when it is one. */
export function sessionOfProc(procId: string): SessionProc | undefined {
  const proc = parseProcId(procId);
  return "instanceId" in proc ? proc : undefined;
}
