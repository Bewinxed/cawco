/**
 * The frames that say a subagent started or ended, as every adapter writes
 * them: Claude Code's `task_*` system subtypes, which CawCo's neutral spine
 * and the other harnesses' adapters speak too. {@link Harness.subagentChange}
 * is this for each of them; a harness of its own vocabulary would answer it
 * from its own frames.
 */
import type { NeutralMessage } from "@cawco/core/session-messages";
import type { SubagentChange } from "../harness";

export const neutralSubagentChange = (
  message: NeutralMessage
): SubagentChange | undefined => {
  if (message.type !== "system") {
    return;
  }
  const taskId = message.task_id;
  if (!taskId) {
    return;
  }
  if (
    message.subtype === "task_started" ||
    message.subtype === "task_progress"
  ) {
    // `subagent_type` is what separates a real Task/Agent subagent from a
    // plain Bash task — only the former counts in the rail's subagent badge.
    return message.subagent_type ? { kind: "started", taskId } : undefined;
  }
  if (message.subtype === "task_notification") {
    return { kind: "ended", taskId };
  }
  if (message.subtype === "task_updated") {
    const status = message.patch?.status;
    const terminal =
      status === "completed" || status === "failed" || status === "killed";
    return terminal ? { kind: "ended", taskId } : undefined;
  }
  return undefined;
};
