import type { Bounded } from "@cawco/core/bounded";
import type { MachineMemorySet, SkillFile } from "@cawco/core/fleet";
import type { FramePayload } from "@cawco/core/frames";
import { SkillFileSchema } from "@cawco/core/stored-shapes";
import { isToolStatus, type ToolStatus } from "@cawco/core/tools";
import { HTTPError, problem } from "elysia";
import { z } from "zod";
import { received } from "./stored-json";

/** A machine ask that got no answer: not connected ("dead") or silent past its deadline ("timeout"). */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/**
 * The answer to a machine that is away (not connected): 503, `machine-away`,
 * in `detail`'s words, naming the machine. Wherever it is answered from, the
 * hub's one hook (machine-reads.ts `nameAwayMachine`) reads `machineId` off
 * it and sets the `X-Cawco-Machine` headers a dashboard reads it by; a tool's
 * call, which answers no headers, says its words.
 */
export const awayProblem = (machineId: string, detail: string) =>
  problem(503, { code: "machine-away", detail, machineId });

/** The answer to a machine that did not answer in time: 504, `machine-silent`, in `detail`'s words. */
export const silentProblem = (detail: string) =>
  problem(504, { code: "machine-silent", detail });

/**
 * A machine call left unanswered, answered by its cause: not connected
 * (`dead`) {@link awayProblem}, silent past its deadline
 * {@link silentProblem}, in `words`, or each its own.
 */
export const unansweredIn = (
  machineId: string,
  answer: Unanswered,
  words: string | { away: string; silent: string }
) => {
  const { away, silent } =
    typeof words === "string" ? { away: words, silent: words } : words;
  return answer.reason === "dead"
    ? awayProblem(machineId, away)
    : silentProblem(silent);
};

/** {@link awayProblem}'s answer. */
export type AwayProblem = ReturnType<typeof awayProblem>;

/** {@link silentProblem}'s answer. */
export type SilentProblem = ReturnType<typeof silentProblem>;

/** A machine that answered a call with its failure: 502, in the machine's words, at the code of what failed. */
export type MachineFailed = ReturnType<
  typeof problem<502, { code: string; detail: string }>
>;

/**
 * A machine's cause thrown where its caller throws (server.ts `callMachine`,
 * a session's context read, a hub start): Elysia's own thrown problem
 * (`HTTPError`), whose `value()` is the problem it holds, so a route it
 * reaches answers that problem, and the hub's error hook names an away
 * machine on it (machine-reads.ts `nameAwayMachine`). Its message is the problem's words, for a caller that
 * catches it and says them.
 */
export class MachineProblem extends HTTPError {
  /** As `problem()` writes it: the problem's `code` says what it is. */
  readonly type = "about:blank";
  readonly problem: AwayProblem | SilentProblem | MachineFailed;
  constructor(answer: AwayProblem | SilentProblem | MachineFailed) {
    super(answer.response.detail);
    this.name = "MachineProblem";
    this.problem = answer;
  }
  override value() {
    return this.problem;
  }
}

/** The frame a forwarded `control` comes back as, whoever asked for it. */
export type ControlResult = Extract<FramePayload, { kind: "control_result" }>;

/** What a machine answered `readMemoryFile` with: its own memory set, or nothing. */
export type MachineMemory = MachineMemorySet | null;

/** A route's `set`: the headers it answers with. */
export interface RouteSet {
  headers: Record<string, string | number | string[]>;
}

/** And what the machine answered it with. */
export const peekToolStatus = (payload: unknown): ToolStatus | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { result } = payload as { result?: unknown };
  return isToolStatus(result) ? result : undefined;
};

/** A skill's files as a machine read them, taken into CawCo's type as they are kept (hub stored-json.ts `received`). */
export const machineSkillFiles = (result: unknown): SkillFile[] =>
  received(z.array(SkillFileSchema), result, "a machine's skill files");
