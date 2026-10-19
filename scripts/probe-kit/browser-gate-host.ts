/**
 * The browser-gate spec's machine side (specs/browser-gate.ts), run as a
 * process of its own: the agent's browser registry and the gates it serves,
 * as the daemon runs them, with the scratch fleet's HOME. A gate reads each
 * workspace's token and project from the workspace's state dir under HOME,
 * and Bun reads HOME once, as a process starts (`os.homedir()` keeps that
 * value whatever `process.env.HOME` becomes later), so the spec cannot point
 * its own process at the fleet's home.
 *
 * Its browsers live in the data dir `XDG_DATA_HOME` names. It reads one JSON
 * command per line on stdin, `{ "id", "verb", ...args }`, and answers each on
 * stdout as `GATE-HOST {"id","ok","value"|"error"}`; every other line it
 * prints is the registry's log.
 *
 *   HOME=<fleet home> XDG_DATA_HOME=<dir> CAWCO_BROWSER_GATE_PORT=<free port> bun scripts/probe-kit/browser-gate-host.ts
 */
import type { BrowserKey } from "../../packages/core/src/browser";

const browsers = await import("../../packages/agent/src/browser/browsers");
const gates = await import("../../packages/agent/src/browser/gate");
const { readBrowser } = await import("../../packages/agent/src/browser/state");

// SIGTERM stops it as the daemon's finalizer stops the registry
// (daemon.ts): a move into a container under way is aborted, and its own
// failure path awaited, before the process exits.
process.on("SIGTERM", () => {
  browsers
    .stopBrowsers()
    .catch((error: unknown) =>
      console.warn(`[browser] the registry did not stop: ${String(error)}`)
    )
    .finally(() => process.exit(0));
});

interface Command {
  hidden?: boolean;
  id: number;
  key?: BrowserKey;
  verb: string;
  why?: string;
  workspace?: string;
}

/** What `DOCKER_HOST` was as this process started. */
const dockerHost = process.env.DOCKER_HOST;

const gateFor = (key: BrowserKey | undefined) => {
  const gate = key ? gates.gateOf(key) : undefined;
  if (!gate) {
    throw new Error(`no gate serves ${key}`);
  }
  return gate;
};

const act = async (command: Command): Promise<unknown> => {
  const key = command.key as BrowserKey;
  switch (command.verb) {
    case "watch":
      return browsers.watchBrowsers();
    case "reserve":
      return browsers.reserveBrowser(key);
    case "start":
      return browsers.startBrowser({ key });
    case "stop":
      return browsers.stopBrowser(key);
    case "remove":
      return browsers.removeBrowser(key);
    case "record":
      return (await readBrowser(key)) ?? null;
    case "runtime": {
      // The runtime hidden as `DOCKER_HOST=unix:///nonexistent` hides it, or
      // as this process found it.
      if (command.hidden) {
        process.env.DOCKER_HOST = "unix:///nonexistent";
      } else if (dockerHost === undefined) {
        delete process.env.DOCKER_HOST;
      } else {
        process.env.DOCKER_HOST = dockerHost;
      }
      const found = await browsers.browserRuntime(true);
      return "missing" in found
        ? { missing: found.missing }
        : { endpoint: found.endpoint };
    }
    case "closeAll":
      gateFor(command.key).closeAll(command.why ?? "");
      return null;
    case "open":
      gateFor(command.key).open();
      return null;
    case "forget":
      return gateFor(command.key).forget(command.workspace ?? "");
    default:
      throw new Error(`${command.verb} is no verb of this host`);
  }
};

const answer = (body: object): void => {
  process.stdout.write(`GATE-HOST ${JSON.stringify(body)}\n`);
};

let pending = "";
for await (const chunk of Bun.stdin.stream()) {
  pending += new TextDecoder().decode(chunk);
  let end = pending.indexOf("\n");
  while (end >= 0) {
    const line = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    end = pending.indexOf("\n");
    if (!line) {
      continue;
    }
    const command = JSON.parse(line) as Command;
    // biome-ignore lint/performance/noAwaitInLoops: one command at a time, in the order sent.
    await act(command).then(
      (value) => answer({ id: command.id, ok: true, value: value ?? null }),
      (error: unknown) =>
        answer({
          id: command.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
    );
  }
}
process.exit(0);
