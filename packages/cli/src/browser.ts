/**
 * `cawco browser <list|start|stop|remove> [key]`: this machine's browsers,
 * acted on here, on the same records the agent keeps (agent
 * `browser/browsers.ts`), so it works whether the agent runs or not.
 */
import { type BrowserRow, isBrowserKey } from "@cawco/core/browser";

export class BrowserCommandError extends Error {}

const ACTIONS = ["list", "start", "stop", "remove"] as const;
type Action = (typeof ACTIONS)[number];

const isAction = (value: string | undefined): value is Action =>
  ACTIONS.includes(value as Action);

const portsLine = (row: BrowserRow): string =>
  Object.entries(row.ports ?? {})
    .map(([name, port]) => `${name}=${port}`)
    .join(" ");

const rowLine = (row: BrowserRow): string =>
  [
    row.key,
    row.host,
    row.state,
    portsLine(row),
    `last used ${new Date(row.lastUsedAt).toISOString()}`,
    row.why ? `(${row.why})` : "",
  ]
    .filter(Boolean)
    .join("  ");

/** Runs the command; its lines, and whether it did what it was asked. */
export const runBrowser = async (
  action: string | undefined,
  key: string | undefined
): Promise<string[]> => {
  if (!isAction(action)) {
    throw new BrowserCommandError(
      `browser takes ${ACTIONS.join(", ")}, and a key (project:<id> or machine:<id>) for all but list`
    );
  }
  const browsers = await import("@cawco/agent/browser");
  try {
    return await act(browsers, action, key);
  } catch (error) {
    if (error instanceof BrowserCommandError) {
      throw error;
    }
    throw new BrowserCommandError(
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
};

const act = async (
  browsers: typeof import("@cawco/agent/browser"),
  action: Action,
  key: string | undefined
): Promise<string[]> => {
  if (action === "list") {
    const runtime = await browsers.browserRuntime(true);
    const rows = await browsers.browserRows();
    return [
      "missing" in runtime
        ? `runtime: none (${runtime.missing})`
        : `runtime: ${runtime.kind} ${runtime.version} (API ${runtime.api}${runtime.rootless ? ", rootless" : ""}) at ${runtime.endpoint}`,
      ...(rows.length ? rows.map(rowLine) : ["no browsers"]),
    ];
  }
  if (!isBrowserKey(key)) {
    throw new BrowserCommandError(
      `browser ${action} needs a key: project:<id> or machine:<id>`
    );
  }
  if (action === "start") {
    const began = Date.now();
    const row = await browsers.startBrowser({ key });
    return [
      `${rowLine(row)}  (live in ${((Date.now() - began) / 1000).toFixed(1)} s)`,
    ];
  }
  if (action === "stop") {
    const row = await browsers.stopBrowser(key);
    return [row ? rowLine(row) : `${key}: no such browser on this machine`];
  }
  await browsers.removeBrowser(key);
  return [`${key} removed, its profile with it`];
};
