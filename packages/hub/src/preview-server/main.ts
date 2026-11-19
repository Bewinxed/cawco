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
import { detach } from "@cawco/core/detach";
import { makeFolder } from "@cawco/core/folders";
import { previewServerSocket } from "@cawco/core/paths/hub";
import { unhandled } from "@cawco/core/unhandled";
import { LOCAL_DASHBOARD_PORT } from "../config";
import { labelOf, originFor } from "../preview-hosts";
import { createStaleTabs } from "../preview-stale";
import { createTailnetDoors } from "../tailnet-doors";
import { openHubLink } from "./link";
import { createListeners } from "./listeners";
import { createServe, createUpstreams } from "./serve";
import { openPreviewStore } from "./store";
import { type HubSays, OPEN_PATH, OpenedSchema } from "./wire";

/** How often an origin's use and a pass's use are said to the hub at most, ms: a minute (hub preview.ts `USE_WRITE_MS`, preview-access.ts `TOUCH_EVERY_MS`). */
const SAID_EVERY_MS = 60_000;

/** Boots the preview server: what `cawco preview` runs, and then stays up. */
export const startPreviewServer = async (): Promise<void> => {
  const store = openPreviewStore();
  const doors = createTailnetDoors();
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
        detach(stand(), "preview listeners stood");
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
  const link = openHubLink(heard);

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
        const answer = await link
          .ask(`${OPEN_PATH}${encodeURIComponent(key)}`, { method: "POST" })
          .catch(() => null);
        const said = answer
          ? OpenedSchema.safeParse(await answer.json().catch(() => null)).data
          : undefined;
        const opened = said?.port;
        if (opened === undefined) {
          return { refused: said?.detail ?? "the hub opened no port for it" };
        }
        port = opened;
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

  /** Every listener as the rows say now, and what didn't stand said to the hub. */
  const stand = async (): Promise<void> => {
    const stood = await listeners.stand(store.ports(), store.settings());
    for (const { key, port, why } of stood.refused) {
      console.warn(`[preview] port ${port} didn't open for ${key}: ${why}`);
    }
    if (stood.host) {
      console.warn(`[preview] host mode didn't open: ${stood.host.why}`);
    }
    link.say({ type: "bound", ...stood });
  };

  link.onOpen(() => detach(stand(), "preview listeners stood"));
  await stand();
  // Its own socket, which says it stands (cli service.ts `probePreview`).
  const own = previewServerSocket();
  await makeFolder(dirname(own), { mode: 0o700 });
  await rm(own, { force: true });
  const standing = Bun.serve({
    unix: own,
    fetch: () => new Response("the preview server stands\n"),
  });
  console.log("[preview] the preview server stands");
  const stop = async () => {
    link.close();
    standing.stop(true);
    await listeners.stopAll();
    store.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => detach(stop(), "preview server stop"));
  process.on("SIGINT", () => detach(stop(), "preview server stop"));
};
