/**
 * The preview server: `cawco preview`, a process and a service of its own
 * (cli service.ts), apart from the hub's. It holds every preview origin
 * (listeners.ts) and answers each request on them (serve.ts) from what it
 * reads itself: the hub's database on a read-only connection of its own
 * (store.ts), the pages' files, and what the hub says on its link (link.ts).
 * So a preview opens at the speed of its own content: nothing the hub's
 * thread does stands between a frame and its page, and a hub restart leaves
 * every origin standing. Its unit doesn't restart with the hub's.
 *
 * At its start it stands every listener the rows name before the hub is
 * reached; each time the hub's link opens it asks again, as the hub then
 * says what moved while it was away.
 */

import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { failureOf } from "@cawco/core/detach";
import { makeFolder } from "@cawco/core/folders";
import {
  keepLimitReadings,
  READINGS_HANDED_EVERY_MS,
  takeLimitReadings,
} from "@cawco/core/limit-readings";
import { previewServerSocket } from "@cawco/core/paths/hub";
import { unhandled } from "@cawco/core/unhandled";
import { Cause, Effect, Exit, FiberSet, Runtime, Schedule } from "effect";
import { dataOf, reached, refusalText, succeeded } from "../client";
import { LOCAL_DASHBOARD_PORT } from "../config";
import { labelOf, originFor } from "../preview-hosts";
import { createStaleTabs } from "../preview-stale";
import { createTailnetDoors } from "../tailnet-doors";
import { openHubLink } from "./link";
import { createListeners } from "./listeners";
import { createServe, createUpstreams } from "./serve";
import { openPreviewStore } from "./store";
import type { HubSays } from "./wire";

/** How often an origin's use and a pass's use are said to the hub at most, ms: a minute (hub preview.ts `USE_WRITE_MS`, preview-access.ts `TOUCH_EVERY_MS`). */
const SAID_EVERY_MS = 60_000;

/**
 * The process's main fiber: `program` run as the preview server's whole
 * life, its scope the server's. SIGTERM and SIGINT interrupt it, so every
 * finalizer of its scope runs (the listeners stopped, the link and the store
 * closed), and the process then exits 0, as a stop always did; a failure is
 * said and exits 1. Effect's own `Runtime.makeRunMain`, which the platform
 * runners (`NodeRuntime.runMain`) are made of. The hub's lifetime is the
 * hub's: the preview server holds none of the hub's state
 * (scripts/import-rules-check.ts `preview-reaches-hub`).
 */
const runMain = Runtime.makeRunMain(({ fiber }) => {
  const stop = (): void => {
    fiber.interruptUnsafe();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  fiber.addObserver((exit) => {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      console.error(
        `[preview] the preview server failed: ${Cause.pretty(exit.cause)}`
      );
      process.exit(1);
    }
    process.exit(0);
  });
});

/** The preview server, for as long as its scope stands: what `cawco preview` runs. */
const previewServer = Effect.gen(function* () {
  const store = yield* Effect.acquireRelease(
    Effect.sync(openPreviewStore),
    (opened) => Effect.sync(() => opened.close())
  );
  /** Work started here and let go, interrupted when the server stops. */
  const forked = yield* FiberSet.makeRuntime();
  /** `work` let go, named `what`: a failure is said as `detach` says one (core detach.ts). */
  const letGo = (what: string, work: Effect.Effect<unknown, unknown>): void => {
    forked(
      Effect.catchCause(work, (cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : Effect.sync(() => {
              console.warn(
                `[${what}] failed: ${failureOf(Cause.squash(cause))}`
              );
            })
      )
    );
  };
  const doors = createTailnetDoors(letGo);
  /** The dashboards that may frame a preview: the operator's own address and the loopback's until the hub says them all. */
  let parents = [
    ...(readEnv(CAWCO_ENV.dashboardUrl)
      ? [readEnv(CAWCO_ENV.dashboardUrl) ?? ""]
      : []),
    `http://localhost:${LOCAL_DASHBOARD_PORT}`,
  ];
  /** The origins a page that shows each origin was reached at: they may frame it too. */
  const ancestors = new Map<string, Set<string>>();
  /** Each origin's open sockets. */
  const viewers = new Map<string, number>();
  /** When each origin's use and each pass's use was last said. */
  const usedSaid = new Map<string, number>();
  const touchedSaid = new Map<string, number>();

  const due = (said: Map<string, number>, key: string, now: number) => {
    if (now - (said.get(key) ?? 0) < SAID_EVERY_MS) {
      return false;
    }
    said.set(key, now);
    return true;
  };

  /** What the hub says. */
  const heard = (said: HubSays): void => {
    switch (said.type) {
      case "ports":
        letGo("preview listeners stood", stand);
        return;
      case "parents":
        ({ parents } = said);
        return;
      case "tailnet":
        if (said.serving === null) {
          doors.close();
        } else if (!doors.same(said.serving)) {
          doors.serve(said.serving);
        }
        return;
      default:
        unhandled("what the hub said", said);
    }
  };
  const link = yield* openHubLink(heard);
  // The server's readings of the bounds waiting on data go to the hub over
  // its link, and stay held while the link is down.
  yield* Effect.forkScoped(
    Effect.sync(() => {
      const readings = takeLimitReadings();
      if (readings.length > 0 && !link.say({ type: "readings", readings })) {
        keepLimitReadings(readings);
      }
    }).pipe(Effect.repeat(Schedule.spaced(READINGS_HANDED_EVERY_MS)))
  );

  const watch = (key: string): (() => void) => {
    const now = (viewers.get(key) ?? 0) + 1;
    viewers.set(key, now);
    if (now === 1) {
      link.say({ type: "watched", key, on: true });
    }
    return () => {
      const left = (viewers.get(key) ?? 1) - 1;
      if (left > 0) {
        viewers.set(key, left);
        return;
      }
      viewers.delete(key);
      link.say({ type: "watched", key, on: false });
    };
  };

  const passes = {
    live: store.live,
    touch: (id: string, at: Date) => {
      if (due(touchedSaid, id, at.getTime())) {
        link.say({ type: "touched", id, at: at.getTime() });
      }
    },
  };

  // Late-bound: the listeners answer through serve, which reads their ports.
  const env = {
    letGo,
    parents: () => parents,
    allow: (key: string, origin: string) => {
      const held = ancestors.get(key) ?? new Set<string>();
      held.add(origin);
      ancestors.set(key, held);
    },
    ancestorsOf: (key: string | undefined) =>
      key === undefined ? [] : [...(ancestors.get(key) ?? [])],
    portOf: (key: string) => listeners.portOf(key),
    hostPattern: () => listeners.hostPattern(),
    watch,
    link,
    store,
  };
  const serve = createServe(env, createUpstreams(env));
  const stale = createStaleTabs({
    dashboards: () => parents,
    kindOf: (id) => store.artifact(id)?.kind,
    originOf: (id) => {
      const row = store.artifact(id);
      return row && store.originOf(row);
    },
    servedOn: store.servedOn,
    standsAt: async (key, at) => {
      let port = listeners.portOf(key);
      if (port === undefined) {
        const answer = await link.hub["__cawco-preview"]
          .open({ key })
          .post()
          .then(reached)
          .catch(() => null);
        if (!answer) {
          return { refused: "the hub opened no port for it" };
        }
        if (!succeeded(answer)) {
          return {
            refused: refusalText({
              status: answer.status,
              value: answer.error?.value,
            }),
          };
        }
        ({ port } = dataOf(answer));
      }
      const pattern = listeners.hostPattern();
      const named =
        pattern &&
        (at.hostname === pattern.domain ||
          at.hostname.endsWith(`.${pattern.domain}`));
      return {
        origin: named
          ? originFor(pattern, pattern.key === "port" ? port : labelOf(key))
          : `${at.protocol}//${at.hostname}:${port}`,
      };
    },
  });
  const listeners = createListeners({
    letGo,
    answer: async (request, server, key, lock) =>
      (await stale.movedOn(request, lock, key)) ??
      serve.answer(request, server, key, lock),
    doors,
    passes,
    used: (key) => {
      const now = Date.now();
      if (due(usedSaid, key, now)) {
        link.say({ type: "used", key, at: now });
      }
    },
  });

  yield* Effect.addFinalizer(() => listeners.stopAll);

  /** Every listener as the rows say now, and what didn't stand said to the hub. */
  const stand = Effect.suspend(() =>
    listeners.stand(store.ports(), store.settings())
  ).pipe(
    Effect.flatMap((stood) =>
      Effect.sync(() => {
        for (const { key, port, why } of stood.refused) {
          console.warn(`[preview] port ${port} didn't open for ${key}: ${why}`);
        }
        if (stood.host) {
          console.warn(`[preview] host mode didn't open: ${stood.host.why}`);
        }
        link.say({ type: "bound", ...stood });
      })
    )
  );

  link.onOpen(() => letGo("preview listeners stood", stand));
  yield* stand;
  // Its own socket, which says it stands (cli service.ts `probePreview`).
  const own = previewServerSocket();
  yield* Effect.promise(async () => {
    await makeFolder(dirname(own), { mode: 0o700 });
    await rm(own, { force: true });
  });
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        unix: own,
        fetch: () => new Response("the preview server stands\n"),
      })
    ),
    (standing) => Effect.sync(() => standing.stop(true))
  );
  console.log("[preview] the preview server stands");
  return yield* Effect.never;
});

/**
 * Boots the preview server: what `cawco preview` runs, and then stays up.
 * The promise edge of {@link previewServer}: it is handed to the process's
 * main fiber ({@link runMain}), which holds it from then on, and a boot that
 * fails ends the process with its cause said.
 */
export const startPreviewServer = (): Promise<void> => {
  runMain(Effect.scoped(previewServer), { disableErrorReporting: true });
  return Promise.resolve();
};
