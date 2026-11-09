/** CawCo's own lines in a session's transcript, as the neutral system message each is. */

import type { AgentNotice, LeakFound } from "@cawco/core/harness";
import type { NeutralSystemMessage } from "@cawco/core/session-messages";

/**
 * `notice` as the system message its frame carries: its subtype and uuid,
 * then when it was said, the session it names (none when the agent speaks
 * of the machine) and what it says.
 */
export const noticeMessage = (
  notice: AgentNotice
): NeutralSystemMessage & { leak?: LeakFound } => ({
  type: "system",
  subtype: notice.subtype,
  uuid: notice.uuid,
  ...("timestamp" in notice ? { timestamp: notice.timestamp } : {}),
  session_id: "session_id" in notice ? notice.session_id : "",
  ...("content" in notice ? { content: notice.content } : {}),
  ...("leak" in notice ? { leak: notice.leak } : {}),
});
