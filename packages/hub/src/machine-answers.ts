import type { Bounded } from "@cawco/core/bounded";
import type { MachineMemorySet, SkillFile } from "@cawco/core/fleet";
import type { FramePayload } from "@cawco/core/frames";
import { SkillFileSchema } from "@cawco/core/stored-shapes";
import { isToolStatus, type ToolStatus } from "@cawco/core/tools";
import { z } from "zod";
import { received } from "./stored-json";

/** A machine ask that got no answer: not connected ("dead") or silent past its deadline ("timeout"). */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/** The frame a forwarded `control` comes back as, whoever asked for it. */
export type ControlResult = Extract<FramePayload, { kind: "control_result" }>;

/** A read off a machine refused, as the status its route answers with. */
export interface ReadRefused {
  code: 500 | 503 | 504;
  ok: false;
  said: string;
}

/** What a machine answered `readMemoryFile` with: its own memory set, or nothing. */
export type MachineMemory = MachineMemorySet | null;

/** A read of a machine's memory, or the status the route should answer with. */
export type MemoryRead = { ok: true; copy: MachineMemory } | ReadRefused;

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
