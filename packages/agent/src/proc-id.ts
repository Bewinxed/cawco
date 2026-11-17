/**
 * The process keeper's namespace. A session's child is named for its
 * harness, one of the traits table's keeper-held kinds; infrastructure procs
 * are never sessions.
 */
import { descriptorOf } from "@cawco/core/harness/kinds";
import {
  KEEPER_HARNESSES,
  type KeeperHarnessKind,
} from "@cawco/core/harness/traits";

export const OPENCODE_SERVER_PROC_ID = "opencode-server";

export type ProcId =
  | { kind: KeeperHarnessKind; instanceId: string }
  | { kind: "boundary"; id: string }
  | { kind: "judge" }
  | { kind: "opencode-server" };

const JUDGE_PREFIX = "judge-";

/** How many hex digits of its hash a judge's form is (boundary/judge-process.ts `judgeFor`). */
export const JUDGE_FORM_LENGTH = 16;

/** A workspace's judge of one form (boundary/judge-process.ts `judgeFor`): one runs per form. */
export const judgeProcId = (workspace: string, form: string): string =>
  `${JUDGE_PREFIX}${workspace}-${form}`;

/** Whether `procId` is one of workspace `workspace`'s judges, of any form. */
export const isJudgeOf = (procId: string, workspace: string): boolean =>
  procId.startsWith(`${JUDGE_PREFIX}${workspace}-`);

/**
 * A workspace's boundary of one generation (boundary/ensure.ts `start`): an older
 * one runs on beside the current one until nothing runs in it.
 */
export const boundaryProcId = (workspace: string, generation: string) =>
  `${procIdFor("boundary", workspace)}-${generation}`;

/** Whether `procId` is one of workspace `workspace`'s boundaries, of any generation. */
export const isBoundaryOf = (procId: string, workspace: string): boolean =>
  procId.startsWith(`${procIdFor("boundary", workspace)}-`);

/**
 * The keeper's name for a session's child of harness `kind`, its
 * descriptor's `procIdPrefix` and the id, or for a workspace's boundary.
 */
export function procIdFor(
  kind: KeeperHarnessKind | "boundary",
  id: string
): string {
  if (kind === "boundary") {
    return `boundary-${id}`;
  }
  return `${descriptorOf(kind).procIdPrefix ?? `${kind}:`}${id}`;
}

/**
 * The harness whose children's ids carry no prefix (its descriptor's
 * `procIdPrefix` is empty): a bare id is its. Claude Code's, whose children
 * predate the prefix.
 */
const BARE_KIND: KeeperHarnessKind = (() => {
  const bare = KEEPER_HARNESSES.find(
    (kind) => descriptorOf(kind).procIdPrefix === ""
  );
  if (!bare) {
    throw new Error("No keeper-held harness's children carry a bare id");
  }
  return bare;
})();

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
  for (const kind of KEEPER_HARNESSES) {
    const prefix = procIdFor(kind, "");
    if (prefix && procId.startsWith(prefix)) {
      return { kind, instanceId: procId.slice(prefix.length) };
    }
  }
  return { kind: BARE_KIND, instanceId: procId };
}

/** A keeper child that is a session's, with whose: every other child (a boundary, a judge, a server) is the machine's. */
export type SessionProc = Extract<ProcId, { instanceId: string }>;

/** `procId` as a session's child, when it is one. */
export function sessionOfProc(procId: string): SessionProc | undefined {
  const proc = parseProcId(procId);
  return "instanceId" in proc ? proc : undefined;
}
