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
import { readdir, readFile, rm, rmdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { browserGatePort } from "@cawco/core/browser";
import { machineId } from "@cawco/core/machine-id";
import {
  workspaceProjectFile,
  workspaceStateDir,
  workspacesDir,
} from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import { setProject } from "../boundary";
import { reserveBrowser } from "./browsers";
import {
  closeWorkspaceBrowsers,
  ensureGateToken,
  gateTokenFile,
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

/** A workspace's records (workspace-records.ts): a state dir holding any is a workspace's, never a session's own door. */
const WORKSPACE_RECORDS = ["create.json", "boundary.json", "place.json"];

/**
 * A session's own door let go for good, as the hub forgets the session: its
 * pages closed on every browser of the machine, then its token, config and
 * project, and its folder once nothing else is in it. A workspace's door goes
 * with its workspace, so a folder holding a workspace's records is left.
 * Whether the folder went.
 */
export const forgetBrowserDoor = async (
  instanceId: string
): Promise<boolean> => {
  const dir = workspaceStateDir(instanceId);
  const workspace = await Promise.all(
    WORKSPACE_RECORDS.map((name) =>
      stat(join(dir, name)).then(
        () => true,
        () => false
      )
    )
  );
  if (workspace.some(Boolean)) {
    return false;
  }
  try {
    await closeWorkspaceBrowsers(instanceId);
    await Promise.all(
      [
        gateTokenFile(instanceId),
        join(dir, GATE_CONFIG_NAME),
        workspaceProjectFile(instanceId),
      ].map((file) => rm(file, { force: true }))
    );
    await rmdir(dir);
    console.info(`[browser] ${instanceId}'s door is gone with its session`);
    return true;
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code !== "ENOENT" && code !== "ENOTEMPTY") {
      console.warn(
        `[browser] ${instanceId}'s door was not let go: ${String(error)}`
      );
    }
    return false;
  }
};

/**
 * The doors of sessions the hub no longer has on this machine, removed as
 * its welcome names every one it has (`RegisterAckPayload.instances`): a
 * session forgotten while the machine was away, or forgotten with no stop
 * sent (a fold, a session its machine reported gone). Each by
 * {@link forgetBrowserDoor}, which leaves a workspace's folder alone. A door
 * made since the welcome came is a session the welcome could not name yet,
 * and stays. A welcome naming no list is a wire error: nothing is swept.
 */
export const sweepBrowserDoors = (welcome: unknown): void => {
  const named = (welcome as { instances?: unknown } | undefined)?.instances;
  if (!(Array.isArray(named) && named.every((id) => typeof id === "string"))) {
    console.warn(
      "[browser] the hub's welcome names no instances, a wire error: it is refused, and no browser door is swept"
    );
    return;
  }
  sweepDoors(new Set<string>(named), Date.now()).catch((error: unknown) =>
    console.warn(
      `[browser] the welcome's door sweep failed: ${error instanceof Error ? error.message : String(error)}`
    )
  );
};

/** A file's stat, or undefined when it is not there. */
const statOf = (file: string) => stat(file).catch(() => undefined);

/** Every door folder under the workspaces dir not named in `kept` and made before `since`, let go. */
const sweepDoors = async (
  kept: ReadonlySet<string>,
  since: number
): Promise<void> => {
  let ids: string[] = [];
  try {
    ids = await readdir(workspacesDir());
  } catch {
    return;
  }
  let gone = 0;
  for (const id of ids) {
    if (kept.has(id)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time, each judged by its own files.
    const marks = await Promise.all([
      statOf(gateTokenFile(id)),
      statOf(join(workspaceStateDir(id), GATE_CONFIG_NAME)),
    ]);
    const door = marks.filter((mark) => mark !== undefined);
    if (door.length === 0 || door.some((mark) => mark.mtimeMs >= since)) {
      continue;
    }
    if (await forgetBrowserDoor(id)) {
      gone += 1;
    }
  }
  if (gone > 0) {
    console.info(
      `[browser] ${gone} door folder(s) of sessions this hub no longer has on the machine are gone`
    );
  }
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
