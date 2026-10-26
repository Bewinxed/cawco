/**
 * A long-running CawCo process (hub, agent, sessiond, keeper, judge, srt
 * host) serves every listener it needs, or it ends so its service manager
 * starts it again. Half-alive is the one outcome it never has: on
 * 2026-10-26 an agent whose MCP gateway could not listen stayed up, never
 * registering, until its rig gave up (7c27d1a31).
 *
 * {@link endProcess} is that ending, and {@link listenOrEnd} a `net.Server`
 * that keeps it: its listen's failure rejects, and any error after it
 * listens ends the process. Node's server drops an `error` with no listener
 * into the process's uncaught handlers ("If there is no listener for the
 * 'error' event, the error is thrown", nodejs.org/api/events.html, "Error
 * events"), so a door that let go of its handler once it listened went deaf
 * where such a handler logged and carried on.
 */
import type { Server } from "node:net";
import { failureOf } from "./detach";

/**
 * Says what failed, and ends the process with 1: systemd's
 * `Restart=on-failure` and launchd's `KeepAlive` start it again.
 */
export const endProcess = (what: string, error: unknown): never => {
  console.error(
    `${what}: ${error instanceof Error ? (error.stack ?? failureOf(error)) : failureOf(error)}`
  );
  process.exit(1);
};

/**
 * `server` listening on the unix socket `path`: rejects when it cannot, and
 * once it listens, any later error of the server ends the process with
 * `what` named ({@link endProcess}).
 */
export const listenOrEnd = (
  server: Server,
  path: string,
  what: string
): Promise<void> =>
  new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(path, () => {
      server.off("error", fail);
      server.on("error", (error) =>
        endProcess(`${what} stopped serving ${path}`, error)
      );
      done();
    });
  });
