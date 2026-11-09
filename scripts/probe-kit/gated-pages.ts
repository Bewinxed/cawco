/**
 * A session's pages in its project's browser on a scratch fleet, opened as
 * its browser tool opens them: through the machine's gate (agent
 * browser/gate.ts), by the door a workspace's boundary makes for it (its
 * token and its project in the workspace's state dir: gate.ts
 * `ensureGateToken`, boundary/looks.ts `setProject`). A spec that seeds a
 * delegate's workspace on the hub's rows makes its door here, so that
 * delegate's `browser_ask` finds the page it asks about (agent shield.ts
 * `askedPage`), and a page is driven as an agent drives one (gate.ts
 * `DRIVES`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserKey,
  ListedBrowser,
} from "../../packages/core/src/browser";
import { until } from "../scratch-fleet";
import type { KitFleet } from "./kit";

/** How long the project's browser has to go live: the local host's Chromium starts in seconds. */
const LIVE_MS = 120_000;

/** A site on this machine's loopback, its one page titled `title`: an origin a page loads from with no network. It holds no run open. */
export const servedSite = (
  title: string
): { origin: string; stop: () => void } => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><title>${title}</title><body>${title}</body>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      ),
  });
  // Held by no one: a run that never stops it still ends.
  server.unref();
  return {
    origin: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
};

/** The project's browser started as the panel starts it, answered once its machine lists it live. */
export const liveBrowser = async (
  fleet: KitFleet,
  key: BrowserKey,
  machineId: string
): Promise<ListedBrowser | undefined> => {
  await fleet
    .api((hub) => hub.api.browsers({ key }).start.post({ machineId }))
    .catch(() => undefined);
  return await until(
    `${key} live`,
    async () =>
      (await fleet.api((hub) => hub.api.browsers.get())).find(
        (one) => one.key === key && one.machineId === machineId
      ),
    (row) => row?.state === "live" || row?.state === "failed",
    LIVE_MS
  ).catch(() => undefined);
};

/** A WebSocket opened with headers of its own (Bun's client takes them). */
const SocketWith = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> }
) => WebSocket;

/** One door's connection to the gate, as its session's browser tool holds one. */
export interface GatedDoor {
  close: () => void;
  /** Page `targetId` driven as an agent drives the one in front of it: brought forward. */
  drive: (targetId: string) => Promise<void>;
  /** A new page of the door's on `url`, answered once it is there; its target id. */
  open: (url: string) => Promise<string>;
  send: (
    method: string,
    params?: object,
    sessionId?: string
  ) => Promise<Record<string, unknown>>;
}

/**
 * The door of `workspace` in project `projectId` on the fleet's machine,
 * made as the workspace's boundary makes it, and connected to the gate.
 */
export const doorOf = async (
  fleet: KitFleet,
  workspace: string,
  projectId: string
): Promise<GatedDoor> => {
  const dir = join(fleet.env.HOME as string, ".cawco", "workspaces", workspace);
  await mkdir(dir, { recursive: true });
  const token = crypto.randomUUID().replaceAll("-", "");
  await writeFile(join(dir, "browser-token"), `${token}\n`, { mode: 0o600 });
  await writeFile(join(dir, "project.json"), `${JSON.stringify(projectId)}\n`);
  const socket = new SocketWith(
    `ws://127.0.0.1:${fleet.env.CAWCO_BROWSER_GATE_PORT}/${workspace}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  let next = 0;
  let closed: string | undefined;
  const waiting = new Map<
    number,
    (message: {
      error?: { message: string };
      result?: Record<string, unknown>;
    }) => void
  >();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id === "number") {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  };
  socket.onclose = (event) => {
    closed = `the gate closed ${workspace}'s connection (${event.code} ${event.reason})`;
    for (const answer of waiting.values()) {
      answer({ error: { message: closed } });
    }
    waiting.clear();
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error(`the gate refused ${workspace}`));
  });
  const send: GatedDoor["send"] = (method, params, sessionId) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error(`${method}: ${closed}`));
        return;
      }
      next += 1;
      waiting.set(next, (message) =>
        message.error
          ? reject(new Error(`${method}: ${message.error.message}`))
          : resolve(message.result ?? {})
      );
      socket.send(
        JSON.stringify({
          id: next,
          method,
          params: params ?? {},
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  const sessions = new Map<string, string>();
  const sessionOf = async (targetId: string): Promise<string> => {
    const kept = sessions.get(targetId);
    if (kept) {
      return kept;
    }
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    sessions.set(targetId, String(sessionId));
    return String(sessionId);
  };
  const drive = async (targetId: string): Promise<void> => {
    await send("Page.bringToFront", {}, await sessionOf(targetId));
  };
  return {
    close: () => socket.close(),
    send,
    drive,
    open: async (url) => {
      const { targetId } = await send("Target.createTarget", { url });
      const id = String(targetId);
      // The gate opens it blank and sends it on once it carries its mark.
      await until(
        `${workspace}'s page on ${url}`,
        async () =>
          String(
            (
              (await send("Target.getTargetInfo", { targetId: id }))
                .targetInfo as { url?: string } | undefined
            )?.url ?? ""
          ),
        (at) => at.startsWith(new URL(url).origin),
        30_000
      );
      await drive(id);
      return id;
    },
  };
};
