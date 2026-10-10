import { AsyncLocalStorage } from "node:async_hooks";
import {
  CLAUDE_JSON_NAME,
  projectClaudeRelative,
} from "@cawco/core/claude-dirs";

export interface PromptWriteNotice {
  at: number;
  phase: "begin" | "end";
  reason: string;
}

const observers = new AsyncLocalStorage<(notice: PromptWriteNotice) => void>();
/** A Claude Code settings file, whose hooks a session reads. */
const PROJECT_SETTINGS = [
  `/${projectClaudeRelative("settings.json")}`,
  `/${projectClaudeRelative("settings.local.json")}`,
];

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

/** `/.claude/<dir>/`: a dir inside a Claude Code dir, the user's or a project's. */
const inClaudeDir = (dir: string): string => `/${projectClaudeRelative(dir)}/`;

/** What a write under each Claude Code dir entry changes in a prompt. */
const CLAUDE_DIR_REASONS: readonly [string, string][] = [
  [inClaudeDir("memories"), "memory docs"],
  [inClaudeDir("skills"), "skills"],
  [inClaudeDir("agents"), "agent definitions"],
  [inClaudeDir("plugins"), "plugins"],
  [inClaudeDir("cawco-marketplaces"), "plugins"],
  [inClaudeDir("cawco-hooks"), "hooks"],
];

/** The fs RPC also carries managed agent docs and project-bound prompt settings. */
export const promptWriteReason = (path: string): string | undefined => {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.endsWith(`/${CLAUDE_JSON_NAME}`) ||
    normalized.endsWith("/.mcp.json")
  ) {
    return "MCP servers";
  }
  if (normalized.endsWith("/CLAUDE.md") || normalized.endsWith("/AGENTS.md")) {
    return "instructions";
  }
  const reason = CLAUDE_DIR_REASONS.find(([dir]) =>
    normalized.includes(dir)
  )?.[1];
  if (reason) {
    return reason;
  }
  if (PROJECT_SETTINGS.some((file) => normalized.endsWith(file))) {
    return "hooks";
  }
  return undefined;
};
