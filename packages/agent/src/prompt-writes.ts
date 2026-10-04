import { AsyncLocalStorage } from "node:async_hooks";

export interface PromptWriteNotice {
  at: number;
  phase: "begin" | "end";
  reason: string;
}

const observers = new AsyncLocalStorage<(notice: PromptWriteNotice) => void>();
const PROJECT_SETTINGS = /\/\.claude\/settings(?:\.local)?\.json$/;

/** The agent supplies this for managed prompt writes; private stacks use the same seam. */
export const withPromptWrites = <T>(
  observe: (notice: PromptWriteNotice) => void,
  run: () => Promise<T>
): Promise<T> => observers.run(observe, run);

/** Block pings before mutation, and retain cold state after even a partial write. */
export const promptWrite = async <T>(
  reason: string,
  run: () => Promise<T>
): Promise<T> => {
  const observe = observers.getStore();
  if (!observe) {
    throw new Error("A Claude prompt write has no cache invalidation handler.");
  }
  observe({
    phase: "begin",
    reason: `prompt changed: ${reason}`,
    at: Date.now(),
  });
  try {
    return await run();
  } finally {
    observe({
      phase: "end",
      reason: `prompt changed: ${reason}`,
      at: Date.now(),
    });
  }
};

/** The fs RPC also carries managed agent docs and project-bound prompt settings. */
export const promptWriteReason = (path: string): string | undefined => {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.endsWith("/.claude.json") ||
    normalized.endsWith("/.mcp.json")
  ) {
    return "MCP servers";
  }
  if (normalized.endsWith("/CLAUDE.md") || normalized.endsWith("/AGENTS.md")) {
    return "instructions";
  }
  if (normalized.includes("/.claude/memories/")) {
    return "memory docs";
  }
  if (normalized.includes("/.claude/skills/")) {
    return "skills";
  }
  if (normalized.includes("/.claude/agents/")) {
    return "agent definitions";
  }
  if (
    normalized.includes("/.claude/plugins/") ||
    normalized.includes("/.claude/cawco-marketplace/")
  ) {
    return "plugins";
  }
  if (
    normalized.includes("/.claude/cawco-hooks/") ||
    PROJECT_SETTINGS.test(normalized)
  ) {
    return "hooks";
  }
  return undefined;
};
