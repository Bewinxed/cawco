import type { Bounded } from "@cawco/core/bounded";
import type { MachineMemorySet, SkillFile } from "@cawco/core/fleet";
import type { FramePayload } from "@cawco/core/frames";
import { SkillFileSchema } from "@cawco/core/stored-shapes";
import { isToolStatus, type ToolStatus } from "@cawco/core/tools";
import { problem } from "elysia";
import { z } from "zod";
import { received } from "./stored-json";

/** A machine ask that got no answer: not connected ("dead") or silent past its deadline ("timeout"). */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/**
 * The 503 a machine away is answered with, in `detail`'s words. What answers
 * no route itself (a spawn, a delegate's control, a tool) says it so; a
 * route answers machine-reads.ts `awayStatus`, which names the machine too.
 */
export const awayProblem = (detail: string) =>
  problem(503, { code: "machine-away", detail });

/** The frame a forwarded `control` comes back as, whoever asked for it. */
export type ControlResult = Extract<FramePayload, { kind: "control_result" }>;

/** What a machine answered `readMemoryFile` with: its own memory set, or nothing. */
export type MachineMemory = MachineMemorySet | null;

/** A route's `set`, on which a read whose machine is away names it (`awayStatus`). */
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
