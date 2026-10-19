/**
 * One option of the owner's pick on answered asks (the approval-card
 * decision page): the card kept in the conversation once answered, as the
 * record of it, with Undo on an approved removal while the hub's trash
 * keeps it. Its twin is today's tool row (today/ToolRow.stories.ts).
 * Deleted with whichever option loses the pick.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import Prompt from "./Prompt.svelte";
import { ASKS, requestOf } from "./prompt-fixtures";

const AT = "2026-10-19T12:41:00Z";
/** The hub keeps a removed setting for a minute (hub db/trash.ts `UNDO_MS`). */
const UNDO_MS = 60_000;

export default {
  title: "Transcript/Approval card, answered",
  component: Prompt,
  parameters: { viewport: 390 },
  args: {
    request: requestOf(ASKS.mcpEdit, presentPermission),
    asker: "the agent",
    shown: true,
    onanswer: () => null,
  },
};

/** The MCP edit approved: the answer where the row stood. */
export const McpApproved = {
  args: { decided: { outcome: "approved", at: AT } },
};

/** The MCP edit denied. */
export const McpDenied = { args: { decided: { outcome: "denied", at: AT } } };

/** Withdrawn: the turn moved on before an answer. */
export const McpWithdrawn = {
  args: { decided: { outcome: "withdrawn", at: AT } },
};

/** A removal approved: Removed, with Undo while the hub keeps it. */
export const RemoveApproved = {
  args: {
    request: requestOf(ASKS.remove, presentPermission),
    decided: { outcome: "approved", at: AT, undoUntil: Date.now() + UNDO_MS },
    onundo: () =>
      new Promise<string | null>((done) => setTimeout(() => done(null), 400)),
  },
};
