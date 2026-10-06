import type { PermissionMode } from "@cawco/core";

/**
 * The mode a session the hub starts on its own runs in — a work item's
 * session, a workflow step, a continuation's summariser, a run's supervisor —
 * where nobody watches for a tool ask: Full Send when the session that caused
 * it is in Full Send, else plain bypass. `causeMode` is that session's mode as
 * stored, read when the new session starts; none when no session caused it
 * (the owner, from the dashboard). Only the owner puts a session in Full Send,
 * so the hub never starts one in it that no Full Send session caused.
 */
export const unwatchedMode = (
  causeMode: string | null | undefined
): PermissionMode =>
  causeMode === "fullSend" ? "fullSend" : "bypassPermissions";
