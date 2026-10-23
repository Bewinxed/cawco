/**
 * The control names and tool names a parked ask is settled by, and what an
 * ask the hub could not show says: imported alone by a reader of them; core's
 * index re-exports it.
 */

/** Settles a parked permission request; args are `[requestId, PermissionResult]`. */
export const RESOLVE_PERMISSION = "resolvePermission";

/**
 * Takes back a parked permission request nobody could be shown; args are
 * `[requestId, message]`. The harness denies it with the message and moves
 * on, as it does when the CLI withdraws an ask itself (an interrupt): it is
 * not the reader's dismissal, because the reader never saw it.
 */
export const WITHDRAW_PERMISSION = "withdrawPermission";

/** How a withdrawn question's message begins; the card that drew it reads "withdrawn" from it. */
export const QUESTION_UNSHOWN = "This question couldn't be shown";

/** What an ask the hub could not show says to the session that asked it, with why. */
export const unshownAskMessage = (question: boolean, why: string): string =>
  `${question ? QUESTION_UNSHOWN : "This permission request couldn't be shown"} (${why}).`;

/**
 * The tool that asks the reader rather than the machine. Its permission request
 * is the question, so it settles through {@link RESOLVE_PERMISSION} like any
 * other: the choices arrive as the request's `input`, and the answer goes back
 * as `updatedInput`.
 */
export const ASK_USER_QUESTION = "AskUserQuestion";

/**
 * OpenCode's Code Mode tool: MCP tools are reached through the programs it
 * runs, each of a program's calls its own tool_use frame under the
 * program's (`parent_tool_use_id`).
 */
export const CODE_MODE_TOOL = "execute";
