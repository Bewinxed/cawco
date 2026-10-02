/**
 * Shared utilities for displaying tool information in chat UI.
 * Used by ToolGroup.svelte and SubagentBranch.svelte to avoid duplication.
 */

/**
 * Get a preview/glimpse of a tool result for collapsed view.
 * Returns the first line or first N characters.
 */
export function getResultGlimpse(result: unknown, maxLength = 60): string {
  if (result === undefined || result === null) {
    return "";
  }

  const str = typeof result === "string" ? result : JSON.stringify(result);
  const [firstLine] = str.split("\n");

  if (firstLine.length > maxLength) {
    return `${firstLine.slice(0, maxLength)}...`;
  }
  return firstLine;
}

/**
 * Extract readable text from tool result content.
 * Handles string, array of content blocks, or falls back to JSON.stringify.
 */
export function extractResultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    // Handle array of content blocks (common for tool results)
    return content
      .map((block: unknown) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object" && "type" in block) {
          const b = block as { type: string; text?: string };
          if (b.type === "text" && b.text) {
            return b.text;
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content);
}

/**
 * Get tool status from message metadata.
 */
export function getToolStatus(
  metadata: { toolStatus?: string } | undefined
): "pending" | "success" | "error" {
  return (metadata?.toolStatus as "pending" | "success" | "error") || "pending";
}

/**
 * Format tool result as string for display.
 */
export function formatToolResult(result: unknown): string | null {
  if (result === undefined || result === null) {
    return null;
  }
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
