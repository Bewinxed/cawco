import { NO_REPLY_TOOL } from "@cawco/core";
import { MCP_SERVER_NAME } from "./delegation";

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
 *
 * A turn that ends with no text is its own rule, with no toggle: Claude Code
 * 2.1.311 answers it with a meta user message, so a session told to work
 * silent wrote a line anyway, `if((tt==="end_turn"||tt==="stop_sequence")&&…
 * !$Hr(H)&&!ie.some((ne)=>ne.message.content.some((Ee)=>Ee.type==="text"&&
 * Ee.text.trim().length>0))&&…){…content:Pkn,isMeta:!0,…`, with
 * `Pkn="[Your previous response had no visible output. Please continue and
 * produce a user-visible response.]"`. Its one exemption is a named tool that
 * succeeded in the turn: `function qTe(){return new Set((i.
 * CLAUDE_CODE_TERMINAL_MCP_TOOLS||"").split(",")…` and `function $Hr(e){let
 * n=qTe();…if(y.type==="tool_use"&&r.has(y.id)&&n.has(y.name))return!0…`.
 * The same set marks the turn ended for a resume
 * (`qTe().has(G.name)&&!y.is_error?{endsTurn:!0,…}`). So CawCo's
 * `no_reply_needed` is named here.
 */
export const CLAUDE_QUIET_ENV = {
  CLAUDE_CODE_SILENT_TURN_REMINDER: "0",
  CLAUDE_CODE_TERMINAL_MCP_TOOLS: `mcp__${MCP_SERVER_NAME}__${NO_REPLY_TOOL}`,
};
