/**
 * Whether a machine's agent speaks this hub's hub ↔ agent contract: what
 * the board's machine status and a held start (start-holds.ts) read.
 */
import { protocolRange } from "@cawco/core/runtime";

/** Whether an agent's contract range holds this hub's (core runtime.ts `protocolRange`). */
export const speaksContract = (
  range: { max: number; min: number } | undefined
): boolean =>
  range !== undefined &&
  range.min <= protocolRange.max &&
  range.max >= protocolRange.min;
