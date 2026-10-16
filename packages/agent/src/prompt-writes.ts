import { AsyncLocalStorage } from "node:async_hooks";
import { dirname } from "node:path";
import {
  CLAUDE_DIR_NAME,
  CLAUDE_JSON_NAME,
  projectClaudeRelative,
} from "@cawco/core/claude-dirs";
import {
  accountsRoot,
  claudeHome,
  claudeHomeJson,
  VENDOR_MARKETPLACES_DIR,
} from "@cawco/core/paths";

export interface PromptWriteNotice {
  at: number;
  /**
   * The folder whose Claude sessions read the write: Claude Code reads a
   * folder's own `.claude/` and CLAUDE.md in a session at or under it. Absent
   * for the user layer, which every Claude session on this machine reads.
   */
  folder?: string;
  phase: "begin" | "end";
  reason: string;
}

/**
 * Who reads a write into their prompt: every Claude session on the machine
 * (the user layer), or those at or under one folder (a project's own files).
 */
export type PromptReaders =
  { kind: "machine" } | { kind: "folder"; path: string };

export const MACHINE_READERS: PromptReaders = { kind: "machine" };

/** Whether a session working in `cwd` reads what a write for `folder` changed. */
export const readsFolder = (cwd: string, folder: string): boolean =>
  cwd === folder || cwd.startsWith(`${folder}/`);

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
  run: () => Promise<T>,
  readers: PromptReaders = MACHINE_READERS
): Promise<T> => {
  const observe = observers.getStore();
  if (!observe) {
    throw new Error("A Claude prompt write has no cache invalidation handler.");
  }
  const folder = readers.kind === "folder" ? { folder: readers.path } : {};
  observe({
    phase: "begin",
    reason: `prompt changed: ${reason}`,
    at: Date.now(),
    ...folder,
  });
  try {
    return await run();
  } finally {
    observe({
      phase: "end",
      reason: `prompt changed: ${reason}`,
      at: Date.now(),
      ...folder,
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
  [inClaudeDir(VENDOR_MARKETPLACES_DIR), "plugins"],
  [inClaudeDir("cawco-hooks"), "hooks"],
];

/**
 * The sessions that read `path`: the user layer (`~/.claude/`, a
 * `.claude.json`, an account's config dir, which links to it) reaches every
 * Claude session on the machine; a project's file reaches the sessions in the
 * folder that holds its `.claude/`, or its CLAUDE.md, AGENTS.md or `.mcp.json`.
 */
const readersOf = (path: string): PromptReaders => {
  if (
    path === claudeHomeJson() ||
    path.endsWith(`/${CLAUDE_JSON_NAME}`) ||
    path.startsWith(`${claudeHome()}/`) ||
    path.startsWith(`${accountsRoot()}/`)
  ) {
    return MACHINE_READERS;
  }
  const claudeDir = path.indexOf(`/${CLAUDE_DIR_NAME}/`);
  if (claudeDir > 0) {
    return { kind: "folder", path: path.slice(0, claudeDir) };
  }
  return { kind: "folder", path: dirname(path) };
};

/** The fs RPC also carries managed agent docs and project-bound prompt settings. */
export const promptWriteReason = (
  path: string
): { reason: string; readers: PromptReaders } | undefined => {
  const normalized = path.replaceAll("\\", "/");
  const found = (what: string) => ({
    reason: what,
    readers: readersOf(normalized),
  });
  if (
    normalized.endsWith(`/${CLAUDE_JSON_NAME}`) ||
    normalized.endsWith("/.mcp.json")
  ) {
    return found("MCP servers");
  }
  if (normalized.endsWith("/CLAUDE.md") || normalized.endsWith("/AGENTS.md")) {
    return found("instructions");
  }
  const reason = CLAUDE_DIR_REASONS.find(([dir]) =>
    normalized.includes(dir)
  )?.[1];
  if (reason) {
    return found(reason);
  }
  if (PROJECT_SETTINGS.some((file) => normalized.endsWith(file))) {
    return found("hooks");
  }
  return undefined;
};
