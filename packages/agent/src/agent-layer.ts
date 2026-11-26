/**
 * The agent's services that hold live state, merged into the one layer the
 * daemon builds in its own scope (daemon.ts `startDaemon`, slice W2 of the
 * backend's move to Effect). What each acquires is released as that scope
 * closes, in the reverse of the order they are built here:
 *
 *   built     the MCP gateway, the hub's loopback, the hub's env, the
 *             supervisor, its stages, canvas screens and previews, the
 *             updater, the keeper's watch, transcript search, passkeys,
 *             the browsers;
 *   released  the browsers (a move into a container aborted and awaited)
 *             first, then passkeys, search, the keeper's watch, the
 *             updater, the previews, canvas screens and stages, the
 *             supervisor's detach, the loopback, and the gateway last.
 *
 * That is the order the daemon's finalizers ran in before they were layers,
 * so each step is provided onto the one before it (`Layer.provideMerge`):
 * the chain is the dependency that keeps it. A layer here starts nothing
 * that waits on the hub: the daemon registers once the layer is built, and
 * nothing in it waits on a browser image or a search index to be read.
 *
 * What must outlive the daemon is in none of them: a session's process,
 * which sessiond keeps (the supervisor detaches, never drains), a kept
 * OpenCode server generation, and a workspace's boundary.
 */
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { endProcess } from "@cawco/core/listeners";
import { Effect, Layer } from "effect";
import { BinaryUpdatesLayer } from "./binary-update";
import { stopBrowsers, watchBrowsers } from "./browser/browsers";
import { PasskeysLayer } from "./browser/passkey-capture";
import { restoreShields } from "./browser/shield";
import { CanvasScreensLayer } from "./canvas-screen";
import { DaemonLinks } from "./daemon-links";
import { HubCarryLayer } from "./hub-loopback";
import { KeeperWatchLayer } from "./keeper-watchdog";
import { McpGatewayLayer } from "./mcp-oauth";
import { PreviewsLayer } from "./preview";
import { TranscriptSearchLayer } from "./search";
import { SupervisorLayer } from "./session";
import { StagesLayer } from "./stage";

/**
 * Set for this process's own readers (core machine-id.ts `machineId` takes
 * the id from here; git-credential.ts `hubOrigin`, move.ts and host-lfs.ts
 * read the hub) and for what it starts with an env built from this one: the
 * search index's processes among them, so it is set before they start. A
 * session gets the hub alone (core session-env.ts `sessionEnvironment`),
 * pi's host gets it from its own env (pi-sessiond.ts), a host tool gets
 * both (`hostEnvironment`), and a harness server (OpenCode's) gets no
 * `CAWCO_*` at all (`serverEnvironment`). After the gateway, as it was: the
 * shared MCP servers it restores start with the env the agent was given.
 */
const HubEnvironmentLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { machineId, hubUrl } = yield* DaemonLinks;
    process.env[CAWCO_ENV.machineId] = machineId;
    process.env[CAWCO_ENV.hubUrl] = hubUrl;
  })
);

/**
 * The machine's browsers (browser/browsers.ts): the take-overs held before a
 * restart are held again first (their gates start closed as the registry
 * makes them, browsers.ts `gateFor`), so a browser the registry then reads
 * back as stopped has its take-over released and its gate opened; then the
 * records are watched. Here, not beside the registry: shield.ts imports it.
 *
 * As the scope closes: a move into a container under way is aborted and its
 * own failure path awaited, so nothing it made is left on the runtime
 * ({@link stopBrowsers}); then the start is interrupted, and the records'
 * watch and tick end, one still starting stopped the moment it is ready.
 */
const BrowsersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { ports } = yield* DaemonLinks;
    let unwatch: (() => void) | undefined;
    let ended = false;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        ended = true;
        unwatch?.();
      })
    );
    yield* Effect.forkScoped(
      Effect.promise(() =>
        restoreShields(ports)
          .catch((error: unknown) =>
            console.warn(`[browser] take-overs not restored: ${String(error)}`)
          )
          .then(() => watchBrowsers(ports))
          .then(
            (stop) => {
              unwatch = stop;
              if (ended) {
                stop();
              }
            },
            // Its gate is every session's one door to a browser: an agent
            // without it ends, to be started again (core listeners.ts).
            (error: unknown) =>
              endProcess("[browser] the browsers are not served", error)
          )
      )
    );
    yield* Effect.addFinalizer(() => stopBrowsers);
  })
);

/** Every service of the agent's that holds live state, in the order above; needs {@link DaemonLinks}. */
export const AgentLayer = BrowsersLayer.pipe(
  Layer.provideMerge(PasskeysLayer),
  Layer.provideMerge(TranscriptSearchLayer),
  Layer.provideMerge(KeeperWatchLayer),
  Layer.provideMerge(BinaryUpdatesLayer),
  Layer.provideMerge(PreviewsLayer),
  Layer.provideMerge(CanvasScreensLayer),
  Layer.provideMerge(StagesLayer),
  Layer.provideMerge(SupervisorLayer),
  Layer.provideMerge(HubEnvironmentLayer),
  Layer.provideMerge(HubCarryLayer),
  Layer.provideMerge(McpGatewayLayer)
);
