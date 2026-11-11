import { HARNESSES, type HarnessKind } from "@cawco/core/harness";

/** The process keeper's namespace. Infrastructure procs are never sessions. */
export const OPENCODE_SERVER_PROC_ID = "opencode-server";

/**
 * Whether each harness runs every session in a keeper process of its own,
 * named by {@link procIdFor}. OpenCode's sessions share an account's server
 * ({@link OPENCODE_SERVER_PROC_ID}).
 */
const OWN_PROCESS = {
  claude: true,
  opencode: false,
  pi: true,
} as const satisfies Record<HarnessKind, boolean>;
/** A harness whose every session is a keeper process of its own ({@link OWN_PROCESS}). */
export type SessionProcKind = {
  [K in HarnessKind]: (typeof OWN_PROCESS)[K] extends true ? K : never;
}[HarnessKind];
/** Whether `kind` names a harness whose every session is a keeper process of its own. */
export const isSessionProcKind = (kind: string): kind is SessionProcKind =>
  HARNESSES.some((harness) => harness === kind && OWN_PROCESS[harness]);
/** {@link SessionProcKind}'s members, in {@link HARNESSES}' order. */
export const SESSION_PROC_KINDS: readonly SessionProcKind[] =
  HARNESSES.filter(isSessionProcKind);

export type ProcId =
  | { kind: SessionProcKind; instanceId: string }
  | { kind: "boundary"; id: string }
  | { kind: "judge" }
  | { kind: "opencode-server" };

/** A session's own keeper process, as {@link parseProcId} reads it. */
export type SessionProc = Extract<ProcId, { instanceId: string }>;
/** Whether `id` is a session's own keeper process ({@link isSessionProcKind}). */
export const isSessionProc = (id: ProcId): id is SessionProc =>
  isSessionProcKind(id.kind);

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
  kind: SessionProcKind | "boundary",
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
