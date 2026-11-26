/**
 * A harness adapter's word that its session's conversation is open, for a
 * harness whose CLI says no `system`/`init` of its own (Claude Code's does):
 * pi's, OpenCode's, Antigravity's and Codex's adapters say it as they start
 * or take up the conversation.
 */
import type { PermissionMode } from "@cawco/core/harness/modes";
import type { NeutralMessage } from "@cawco/core/session-messages";
import type { HarnessContext } from "../harness";

/** What the session's `init` names besides its conversation. */
export interface SessionOpening {
  readonly cwd: string;
  /** As CawCo names it (`<provider>/<id>` where the harness takes a provider); none for the harness's default. */
  readonly model?: string;
  readonly permissionMode?: PermissionMode;
}

/**
 * Conversation `sessionId` named to the agent (`ctx.session`), then said as
 * the session's `init` through `say`, the adapter's own way of saying a
 * frame: the hub reads it as the session being up, so its row reads running,
 * its work item too, and the row names the conversation (hub
 * agent-socket/session-signals.ts).
 */
export const sessionOpened = (
  ctx: Pick<HarnessContext, "session">,
  say: (message: NeutralMessage) => void,
  sessionId: string,
  { cwd, model, permissionMode }: SessionOpening
): void => {
  ctx.session(sessionId);
  say({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    cwd,
    ...(model ? { model } : {}),
    ...(permissionMode ? { permissionMode } : {}),
  });
};
