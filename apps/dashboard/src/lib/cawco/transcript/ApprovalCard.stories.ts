/**
 * The permission card as one sentence (Component Story Format 3, live
 * components), beside today's card for the owner's pick: "[caw branding]
 * [agent] on [session] needs to [reason] allow it to [action] [target]
 * edit [x] with [a], and [b] with chips". Claude Code asks in cockpit,
 * four ways: it changes an MCP server, writes a file, runs a command, and
 * runs a command that throws work away. Each stands in the real composer's
 * grown shape (approval-frame.svelte), on a desk (the transcript column
 * about 900px wide) and on a phone (390px), drawn settled: its parts up.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`), so Approve and
 * Deny stand enabled as the person meets them.
 */
import { hubAs } from "../hub-stand-in";
import ApprovalFrame from "./approval-frame.svelte";

const PHONE = { args: { height: 760 }, parameters: { viewport: 390 } };
const TODAY = { look: "today" };

export default {
  title: "Approval card/The sentence beside today's card",
  component: ApprovalFrame,
  args: { ask: "mcp", look: "sentence", height: 640 },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk, the sentence: Claude Code on its session needs to pin mobbin-web; allow it to change MCP server mobbin-web, each setting before and after. */
export const McpEdit = {};

/** Phone, the sentence: the MCP server change across the phone's composer. */
export const McpEditPhone = { ...PHONE, args: { ...PHONE.args } };

/** Desk, today's card: the same MCP server change, its reason a "why" row in the well. */
export const McpEditToday = { args: TODAY };

/** Phone, today's card: the MCP server change. */
export const McpEditTodayPhone = {
  ...PHONE,
  args: { ...PHONE.args, ...TODAY },
};

/** Desk, the sentence: allow it to write TrayChipLabel.svelte, the file whole as its diff. */
export const FileWrite = { args: { ask: "write" } };

/** Phone, the sentence: the file write. */
export const FileWritePhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "write" },
};

/** Desk, today's card: the file write, its whole path as the summary. */
export const FileWriteToday = { args: { ask: "write", ...TODAY } };

/** Phone, today's card: the file write. */
export const FileWriteTodayPhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "write", ...TODAY },
};

/** Desk, the sentence: needs to type-check and build the dashboard; allow it to run, the command whole. */
export const ShellCommand = { args: { ask: "shell" } };

/** Phone, the sentence: the command wraps whole under the sentence. */
export const ShellCommandPhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "shell" },
};

/** Desk, today's card: the reason as the summary, the command on one line under it. */
export const ShellCommandToday = { args: { ask: "shell", ...TODAY } };

/** Phone, today's card: the command cut to one line until opened. */
export const ShellCommandTodayPhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "shell", ...TODAY },
};

/** Desk, the sentence: git reset --hard and git clean, with what it throws away said before the answer. */
export const DestructiveCommand = { args: { ask: "destructive" } };

/** Phone, the sentence: the destructive command and its warning. */
export const DestructiveCommandPhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "destructive" },
};

/** Desk, today's card: the destructive command reads as any other. */
export const DestructiveCommandToday = {
  args: { ask: "destructive", ...TODAY },
};

/** Phone, today's card: the destructive command. */
export const DestructiveCommandTodayPhone = {
  ...PHONE,
  args: { ...PHONE.args, ask: "destructive", ...TODAY },
};
