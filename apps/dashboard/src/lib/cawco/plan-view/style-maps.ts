import { unhandled } from "@cawco/core/unhandled";
import type { WaitKind } from "@cawco/core/wait-targets";
import type { IdentitySlot } from "./types.js";

/** Static Tailwind background utilities for CawCo's eight identity hues (no inline styles). */
export const IDENTITY_DOT_BG: Record<IdentitySlot, string> = {
  1: "bg-mark-1",
  2: "bg-mark-2",
  3: "bg-mark-3",
  4: "bg-mark-4",
  5: "bg-mark-5",
  6: "bg-mark-6",
  7: "bg-mark-7",
  8: "bg-mark-8",
};

/** Static indentation step for Level-3 nested to-dos inside a task's recessed well. */
export function todoIndentClass(depth: number): string {
  if (depth <= 0) {
    return "ps-0";
  }
  if (depth === 1) {
    return "ps-space-5";
  }
  return "ps-space-8";
}

/** Short noun for what kind of wait holds a step inside the opened task inspector. */
export function waitKindLabel(kind: WaitKind | undefined): string {
  switch (kind) {
    case "card":
      return "Your decision";
    case "pin":
      return "Your reply on pin";
    case "pr":
      return "Pull request";
    case "run":
      return "Check run";
    case "task":
      return "Upstream task";
    case "session":
      return "Other session";
    case "time":
      return "Scheduled time";
    case undefined:
      return "Hold";
    default:
      return unhandled("wait kind", kind);
  }
}
