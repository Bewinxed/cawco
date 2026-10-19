/**
 * A session's door to its browser (Projects spec §5.11, "The gate"): the
 * config file every session's browser tool (chrome-devtools-mcp) is launched
 * with, naming the machine's gate and the token it opens to. Nothing else of
 * a session reaches a browser, and no session launches a Chromium of its own.
 *
 * A door is a gate id's: the session's workspace when it runs in one (its
 * boundary minted the token, `ensureBoundary`), else the session's own
 * instance id, its token minted here the same way and its project kept
 * beside it. The gate keys every door by that one record (gate.ts
 * `keyOfWorkspace`): its project's browser, else the machine's.
 *
 * The token never rides on a command line, which every local user can read:
 * chrome-devtools-mcp 1.11.0 reads its options from a JSON file named by
 * `--config` ("An explicit `--config` takes precedence over all of them",
 * its src/config/ConfigLocator.ts), and `wsHeaders` there is the same JSON
 * string the flag takes. The file is 0600 in the gate id's state dir, which
 * no command of a workspace reads; the command line names only its path.
 *
 * Making a door starts no browser and takes no ports: the registry keeps
 * the key's record and serves its gate at once (`reserveBrowser`); the gate
 * wakes the browser as a tool first connects, which chrome-devtools-mcp does
 * at its first tool call, not as it starts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { browserGatePort } from "@cawco/core/browser";
import { machineId } from "@cawco/core/machine-id";
import { workspaceStateDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import { setProject } from "../boundary";
import { reserveBrowser } from "./browsers";
import {
  closeWorkspaceBrowsers,
  ensureGateToken,
  keyOfWorkspace,
} from "./gate";

/**
 * The fleet's Chrome DevTools MCP server, by its fleet name: every session's
 * browser tool. A workspace session's captures go to the workspace's scratch
 * as well as its clone; it writes a `filePath` only inside its roots: those
 * its client answers `roots/list` with, those named by `--filesystem-root`,
 * and its own temp dir.
 */
export const CHROME_DEVTOOLS = "chrome-devtools";

/** The name of a gate id's chrome-devtools-mcp config in its state dir: OpenCode's plugin names it for a workspace's location. */
export const GATE_CONFIG_NAME = "browser-mcp.json";

/** What a session's browser tool is launched with: its config file. */
export interface BrowserDoor {
  config: string;
}

/**
 * Gate id `id`'s door, made when it has none. `projectId` is kept for an id
 * that is a session's own (a workspace keeps its project as its boundary
 * starts).
 */
export const browserDoor = async (
  id: string,
  projectId?: string
): Promise<BrowserDoor> => {
  const began = performance.now();
  if (projectId) {
    await setProject(id, projectId);
  }
  const token = await ensureGateToken(id);
  const key = await keyOfWorkspace(id, await machineId());
  await reserveBrowser(key);
  const config = join(workspaceStateDir(id), GATE_CONFIG_NAME);
  const body = `${JSON.stringify({
    wsEndpoint: `ws://127.0.0.1:${browserGatePort()}/${id}`,
    wsHeaders: JSON.stringify({ Authorization: `Bearer ${token}` }),
  })}\n`;
  if ((await readFile(config, "utf8").catch(() => "")) !== body) {
    await writeStateFile(config, body, { mode: 0o600 });
  }
  console.info(
    `[browser] ${id}'s door to ${key} at ${config}, made in ${Math.round(performance.now() - began)} ms`
  );
  return { config };
};

/**
 * A session's own door as its process ends: its pages closed on every
 * browser of the machine, as its browser tool's Chromium once ended with it.
 * Its config stays for its next launch, and for a process an agent restart
 * attaches to again, whose browser tool reads it.
 */
export const closeBrowserDoor = (instanceId: string): void => {
  closeWorkspaceBrowsers(instanceId).catch((error: unknown) =>
    console.warn(
      `[browser] ${instanceId}'s pages were not closed: ${String(error)}`
    )
  );
};

/** chrome-devtools-mcp's arguments that pick a browser or a config: the door picks both now. */
export const BROWSER_ARG =
  /^--(?:config|wsEndpoint|wsHeaders|browserUrl|browser-url|executable[Pp]ath|channel|isolated|userDataDir|user-data-dir|headless|autoConnect|auto-connect)(?:=|$)/;

/** A chrome-devtools-mcp command line's arguments through `door`, whatever browser they named before. */
export const throughGate = (
  args: readonly string[],
  door: BrowserDoor
): string[] => [
  ...args.filter((arg) => !BROWSER_ARG.test(arg)),
  `--config=${door.config}`,
];
