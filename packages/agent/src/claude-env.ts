/**
 * Claude Code's silent-turn reminder, off in every Claude Code CawCo starts.
 * After a run of tool calls with no text the CLI injects "The user hasn't
 * heard from you in a while…"; CawCo folds text written before a tool call
 * under Reasoning, so the reminder buys updates the owner never sees.
 *
 * `CLAUDE_CODE_SILENT_TURN_REMINDER` "Toggles an injected reminder that fires
 * after several turns with no update to the user … Overrides the server-side
 * default" (https://www.turboai.dev/blog/claude-code-env-vars-v2-1-237).
 * Claude Code 2.1.302 parses it as `H.triBool()`, false for
 * `["0","false","no","off"]`, and its gate returns that value before any
 * server flag: `function T$(e,n,r,s){if(s!==void 0)return s;…}`, called as
 * `T$("silent_turn_reminder",n,e,a.CLAUDE_CODE_SILENT_TURN_REMINDER)`; the
 * only `silent_turn_reminder` attachment (turn- and seconds-based alike) is
 * behind that gate. Spread last, so no spec's or person's env turns it on.
 */
export const CLAUDE_QUIET_ENV = { CLAUDE_CODE_SILENT_TURN_REMINDER: "0" };
