/**
 * A session's door to its browser (Projects spec §5.11, "The gate"): the
 * gate's endpoint and the token it opens to, which every session's browser
 * tool (chrome-devtools-mcp) is launched with. Nothing else of a session
 * reaches a browser, and no session launches a Chromium of its own.
 *
 * A door is a gate id's: the session's workspace when it runs in one (its
 * boundary minted the token, `ensureBoundary`), else the session's own
 * instance id, its token minted here the same way and its project kept
 * beside it. The gate keys every door by that one record
 * (`workspaceProjectFile`): its project's browser, else the machine's.
 *
 * Making a door starts no browser: the registry keeps the key's record, and
 * so its ports, and serves its gate at once (`reserveBrowser`); the gate
 * wakes the browser as a tool first connects. chrome-devtools-mcp connects
 * at its first tool call, not as it starts.
 */
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BrowserKey } from "@cawco/core/browser";
import { machineId } from "@cawco/core/machine-id";
import { workspaceProjectFile, workspaceStateDir } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { setProject } from "../boundary";
import { reserveBrowser } from "./browsers";
import { closeWorkspaceBrowsers, ensureGateToken, gateTokenFile } from "./gate";

/**
 * The fleet's Chrome DevTools MCP server, by its fleet name: every session's
 * browser tool. A workspace session's captures go to the workspace's scratch
 * as well as its clone; it writes a `filePath` only inside its roots: those
 * its client answers `roots/list` with, those named by `--filesystem-root`,
 * and its own temp dir.
 */
export const CHROME_DEVTOOLS = "chrome-devtools";

/** What a session's browser tool is launched with. */
export interface BrowserDoor {
  /** `ws://127.0.0.1:<gate port>/<gate id>`. */
  endpoint: string;
  token: string;
}

/** The name of a gate id's endpoint in its state dir, beside its token: OpenCode's plugin reads both for a workspace's location. */
export const GATE_ENDPOINT_NAME = "browser-gate";
/** The name of a gate id's token in its state dir (gate.ts `gateTokenFile`). */
export const GATE_TOKEN_NAME = basename(gateTokenFile("id"));

const gateEndpointFile = (id: string): string =>
  join(workspaceStateDir(id), GATE_ENDPOINT_NAME);

/** The browser a gate id's sessions use, by the gate's own rule: its project's, else its machine's. */
const keyOf = async (id: string): Promise<BrowserKey> => {
  const project = await readRecord<unknown>(workspaceProjectFile(id)).catch(
    () => undefined
  );
  return typeof project === "string" && project
    ? `project:${project}`
    : `machine:${await machineId()}`;
};

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
  const key = await keyOf(id);
  const { gate } = await reserveBrowser(key);
  const endpoint = `ws://127.0.0.1:${gate}/${id}`;
  const file = gateEndpointFile(id);
  if ((await readFile(file, "utf8").catch(() => "")).trim() !== endpoint) {
    await writeStateFile(file, `${endpoint}\n`, { mode: 0o600 });
  }
  console.info(
    `[browser] ${id}'s door to ${key} at ${endpoint}, made in ${Math.round(performance.now() - began)} ms`
  );
  return { endpoint, token };
};

/**
 * A session's own door as its process ends: its pages closed on every
 * browser of the machine, as its browser tool's Chromium once ended with it.
 * Its token stays for its next launch, and for a process an agent restart
 * attaches to again, whose browser tool holds it.
 */
export const closeBrowserDoor = (instanceId: string): void => {
  closeWorkspaceBrowsers(instanceId).catch((error: unknown) =>
    console.warn(
      `[browser] ${instanceId}'s pages were not closed: ${String(error)}`
    )
  );
};

/** chrome-devtools-mcp's arguments that pick a browser: the door picks it now. */
export const BROWSER_ARG =
  /^--(?:wsEndpoint|wsHeaders|browserUrl|browser-url|executable[Pp]ath|channel|isolated|userDataDir|user-data-dir|headless|autoConnect|auto-connect)(?:=|$)/;

/** A chrome-devtools-mcp command line's arguments through `door`, whatever browser they named before. */
export const throughGate = (
  args: readonly string[],
  door: BrowserDoor
): string[] => [
  ...args.filter((arg) => !BROWSER_ARG.test(arg)),
  `--wsEndpoint=${door.endpoint}`,
  `--wsHeaders=${JSON.stringify({ Authorization: `Bearer ${door.token}` })}`,
];
