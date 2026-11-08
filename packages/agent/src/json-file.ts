import { writeStateFile } from "@cawco/core/state-file";

export const readJson = async <T>(path: string): Promise<T | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return (await file.json()) as T;
  } catch {
    return undefined;
  }
};

/**
 * Written whole and moved into place — a half-written config is a broken
 * machine: `~/.claude.json` is read by every Claude Code on this machine, and
 * a half-written one is a machine with no MCP servers and no history.
 */
export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeStateFile(path, JSON.stringify(value, null, 2));
