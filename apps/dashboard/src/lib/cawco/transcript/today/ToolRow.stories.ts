/**
 * What an answered approval leaves in the conversation today, kept for the
 * owner's pick: the transcript's tool row (ToolGroup.svelte) for the same
 * MCP edit and removal the card's sheet asks about, as their calls read once
 * answered. Deleted with whichever answer loses the pick.
 */

import { ASKS } from "../prompt-fixtures";
import ToolGroup from "../ToolGroup.svelte";

const AT = "2026-10-19T12:41:00Z";

/** One answered call as the transcript keeps it. */
const call = (
  id: string,
  ask: { input: Record<string, unknown>; instanceId: string; toolName: string },
  result: string,
  status: "success" | "error"
) => ({
  id,
  toolCallId: `call-${id}`,
  instanceId: ask.instanceId,
  type: "tool.use" as const,
  content: "",
  timestamp: AT,
  metadata: {
    toolName: ask.toolName,
    toolInput: ask.input,
    toolResult: result,
    toolStatus: status,
  },
});

export default {
  title: "Transcript/Answered today",
  component: ToolGroup,
  parameters: { viewport: 390 },
  args: {
    messages: [
      call(
        "mcp-edit",
        ASKS.mcpEdit,
        '{"ok":true,"name":"mobbin-web"}',
        "success"
      ),
    ],
  },
};

/** The MCP edit, approved: one tool row. */
export const McpApproved = { args: {} };

/** The MCP edit, denied: the row says the person declined it. */
export const McpDenied = {
  args: {
    messages: [
      call(
        "mcp-denied",
        ASKS.mcpEdit,
        "The person declined admin_mcp_servers_write: User denied permission",
        "error"
      ),
    ],
  },
};

/** The removal, approved: one tool row, with no way back from here. */
export const RemoveApproved = {
  args: {
    messages: [
      call(
        "remove",
        ASKS.remove,
        '{"ok":true,"restore":41,"restorableForMs":60000}',
        "success"
      ),
    ],
  },
};
