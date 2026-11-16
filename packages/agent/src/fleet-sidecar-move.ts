/**
 * The fleet's sidecar from before CawCo was named CawCo
 * (`~/.claude/cockpit-fleet.json`, core paths/fleet.ts
 * `legacyClaudeFleetSidecarFile`) folded, once, into the current one
 * (`claudeFleetSidecarFile`, fleet.ts `ClaudeFleetSidecar`), as the agent
 * starts. All it still says is the MCP servers the agent wrote into
 * `.claude.json` files then, which no later sidecar carried: they join the
 * current sidecar's `mcp`, the names the fleet's one cleanup takes back out
 * of the person's files (fleet.ts `dropWrittenMcp`), and the old file goes.
 *
 * It runs before anything can sync the fleet, so from then on the current
 * sidecar alone says what the fleet manages, and nothing reads the old
 * file. A crash between the write and the removal folds the same names in
 * again at the next start, which changes nothing.
 */
import { rm } from "node:fs/promises";
import {
  claudeFleetSidecarFile,
  legacyClaudeFleetSidecarFile,
} from "@cawco/core/paths/fleet";
import { readJson, readOwnJson, UnreadJson, writeJson } from "./json-file";
import {
  ClaudeFleetSidecarSchema,
  LegacyFleetSidecarSchema,
} from "./stored-shapes";

/** What the agent's sidecar said before CawCo was named CawCo, as far as anything still reads it. */
export interface LegacyFleetSidecar {
  /** The MCP servers the agent wrote into `.claude.json` files then. */
  mcp?: string[];
}

/**
 * The old sidecar, or undefined when there is none. One there and unread
 * names nothing anything can read: said, removed, and taken as none.
 */
const readLegacy = async (
  path: string
): Promise<LegacyFleetSidecar | undefined> => {
  try {
    return await readJson(
      path,
      (value) => LegacyFleetSidecarSchema.safeParse(value).data
    );
  } catch (error) {
    if (!(error instanceof UnreadJson)) {
      throw error;
    }
    console.warn(`[fleet] ${error.message}; removed as never written`);
    await rm(path, { force: true });
    return undefined;
  }
};

/** The old sidecar's servers folded into the current sidecar's `mcp`, and the old sidecar removed; said when it was there. */
export const moveLegacyFleetSidecar = async (): Promise<void> => {
  const legacyPath = legacyClaudeFleetSidecarFile();
  const legacy = await readLegacy(legacyPath);
  if (legacy === undefined) {
    return;
  }
  const path = claudeFleetSidecarFile();
  const current =
    (await readOwnJson(
      path,
      (value) => ClaudeFleetSidecarSchema.partial().safeParse(value).data
    )) ?? {};
  await writeJson(path, {
    ...current,
    mcp: [...new Set([...(current.mcp ?? []), ...(legacy.mcp ?? [])])],
  });
  await rm(legacyPath, { force: true });
  console.info(
    `[fleet] ${legacyPath}: the servers it named folded into ${path}, and it removed`
  );
};
