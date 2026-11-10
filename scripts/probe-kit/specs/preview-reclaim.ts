/**
 * A full preview range gives a port back from what no screen shows, a
 * running session's artifacts among them, and an address a tab still holds
 * of a port that moved on is sent to the artifact's own tab.
 *
 * On 2026-11-05 the owner's Show of "profile-fixes" was refused: "Every
 * preview port (3457–3556) is in use: 1 by previews open on a screen and 96
 * by sessions that are running." 95 of the hub's 97 port rows were
 * artifacts no screen showed, kept because their sessions might run (hub
 * preview.ts `sessionKeeps`, now `panelShows`): nothing could be taken back.
 * Then a tab he held at a decision page's address answered nothing of it:
 * its port belonged to another origin.
 *
 *   bun scripts/probe-kit/run.ts preview-reclaim
 *
 * Drives the hub's real listeners in-process (`createPreviewListeners`) on a
 * range of {@link SIZE} ports, its db's rows kept in memory as db
 * previews.ts keeps them (`portsByUse` ordered by `used_at`):
 * 0. Started, before any port is handed out: every port of the range binds
 *    for another program (a plain bind, as systemd's socket units make).
 *    The hub held every free one once (35b2e437f), and the release proof's
 *    socket on 43458, inside its hub's range, failed to start.
 * 1. The range filled by artifacts of a session that runs, none on a
 *    screen, then one used again: a new artifact's show opens, on the port
 *    of the one used least recently, which alone let its port go (`letGo`);
 *    every other keeps its port.
 * 2. Every port's artifact in a panel a screen follows: a new show is
 *    refused 503, its words counting them as previews open on a screen, and
 *    no running session.
 * 3. A tab at a page's address on the port that moved (`Sec-Fetch-Dest:
 *    document`, its pass sent): answered 302 to the page's own tab on the
 *    dashboard (`/artifact/<id>`); a frame's load of it is no tab's and
 *    stays 404.
 * 4. A port let go by its origin and taken by none: the hub holds it (for
 *    preview.ts `VACANT_HOLD_MS`), and the same tab there is answered as on
 *    another origin's port, never the browser's connection error.
 * 5. An `artifact_browse` url (a session's ticket into the page's session
 *    origin) loaded on a port that origin no longer holds: sent, its ticket
 *    unspent, to the entry where the origin stands now, which spends it and
 *    sets the session's pass.
 * 6. That session's pass at the page's stale address: sent to the page
 *    where its origin stands now, the same path.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

/** The range this spec gives its hub: our pick, clear of a hub's default range and of preview-query's. */
const FIRST = 47_490;
const SIZE = 4;
/** The session that runs and made every artifact here; no screen follows it. */
const RUNNING = "00000000-0000-4000-8000-00000000c0a1";
/** The sessions a screen follows (leg 2), each its panel's showing one artifact. */
const FOLLOWED = "00000000-0000-4000-8000-00000000c0a2";
/** The dashboard this browser reached the hub by. */
const DASHBOARD = "http://127.0.0.1:3455";
/** A decision page that stood on the port that moved. */
const PAGE = "00000000-0000-4000-8000-00000000c0f0";

/** Artifact `n`'s id, and its origin's key (hub preview.ts `embedKey`). */
const artifact = (n: number) =>
  `00000000-0000-4000-8000-00000000c1${String(n).padStart(2, "0")}`;
const key = (n: number) =>
  `embed-00000000-0000-4000-8000-00000000c2${String(n).padStart(2, "0")}`;

const run = async (kit: Kit) => {
  // Before the hub's config is read (in this spec's own process, `ownProcess`).
  const scratch = await mkdtemp(join(tmpdir(), "preview-reclaim-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  process.env.CAWCO_PREVIEW_PORTS = `${FIRST}-${FIRST + SIZE - 1}`;
  const { createPreviewListeners, noteParent, previewTargets } =
    await import("../../../packages/hub/src/preview");
  const { mintSessionTicket, mintTicket } =
    await import("../../../packages/hub/src/preview-access");
  const { PREVIEW_ENTER_PATH, previewEnterUrl } =
    await import("../../../packages/core/src/preview/routes");
  type Deps = Parameters<typeof createPreviewListeners>[1];
  type Db = Parameters<typeof createPreviewListeners>[2];
  type Passes = Parameters<typeof createPreviewListeners>[3];
  type PassRow = Parameters<Passes["open"]>[0];
  noteParent(DASHBOARD);

  /** Each origin's port and its last use, as the port rows keep them. */
  const rows = new Map<string, { port: number; usedAt: number }>();
  let clock = 0;
  const db = {
    settings: () => ({ mode: "port", pattern: null }),
    ownerHeld: () => true,
    ports: () => [...rows].map(([one, row]) => ({ key: one, port: row.port })),
    portsByUse: () =>
      [...rows]
        .sort(([, a], [, b]) => a.usedAt - b.usedAt || a.port - b.port)
        .map(([one, row]) => ({ key: one, port: row.port })),
    keepPort: (one: string, port: number) => {
      clock += 1;
      rows.set(one, { port, usedAt: clock });
      return true;
    },
    dropPort: (one: string) => {
      rows.delete(one);
    },
    used: () => undefined,
    setSettings: () => undefined,
  } as unknown as Db;
  /** Origins let go, in order (server.ts `letGo` tells what shows each again). */
  const letGone: string[] = [];
  const followed = new Set<string>();
  const deps = {
    artifactAt: (one: string) => {
      const n = Number(one.slice(-2));
      return one.startsWith("embed-") ? artifact(n) : undefined;
    },
    followed: (id: string) => followed.has(id),
    letGo: (keys: string[]) => {
      letGone.push(...keys);
    },
    kindOf: (id: string) => (id === PAGE ? "page" : "preview"),
    // The page stands on its session's origin alone.
    servedOn: (id: string, origin: string) => id === PAGE && origin === RUNNING,
    originOf: () => RUNNING,
    ownerOf: () => RUNNING,
    sessionLive: () => true,
    rowAt: () => undefined,
  } as unknown as Deps;
  const passRows = new Map<string, PassRow>();
  const passes: Passes = {
    live: (hash, now) => {
      const row = passRows.get(hash);
      return row && row.expiresAt > now ? row : undefined;
    },
    open: (row, replacing) => {
      if (replacing) {
        passRows.delete(replacing.tokenHash);
      }
      passRows.set(row.tokenHash, row);
      return true;
    },
    revoke: () => 0,
    touch: () => undefined,
  };
  const listeners = createPreviewListeners(
    "127.0.0.1",
    deps,
    db,
    passes,
    { beside: () => ({ close: () => undefined }), origin: () => undefined },
    { listens: true, after: () => undefined }
  );
  const opened: string[] = [];
  const open = (n: number) => {
    opened.push(key(n));
    const embed = listeners.embed(key(n), RUNNING);
    if (!("port" in embed)) {
      throw new Error(embed.response.detail);
    }
    return embed.port;
  };
  try {
    // 0. The hub up, no port handed out: every one stays free for another program.
    listeners.start();
    const bindable = Array.from({ length: SIZE }, (_, at) => {
      const port = FIRST + at;
      try {
        Bun.serve({
          hostname: "127.0.0.1",
          port,
          fetch: () => new Response(null),
        }).stop(true);
        return `${port} bound`;
      } catch (error) {
        return `${port} ${(error as { code?: string }).code ?? String(error)}`;
      }
    });
    kit.check(
      "0: with the hub started, a port of its range it never handed out binds for another program (no SO_REUSEPORT), as a systemd socket does",
      bindable.every((one) => one.endsWith("bound")),
      bindable.join(", ")
    );

    // 1. Filled by a running session's artifacts no screen shows; one used again.
    const before = new Map<number, number>();
    for (let n = 1; n <= SIZE; n += 1) {
      before.set(n, open(n));
    }
    clock += 1;
    rows.set(key(1), { port: before.get(1) as number, usedAt: clock });
    const port = open(SIZE + 1);
    const kept = [1, 3, 4].every(
      (n) => rows.get(key(n))?.port === before.get(n)
    );
    kit.check(
      "1: a full range of a running session's artifacts no screen shows: a new show opens on the port of the one used least recently, which alone let its port go",
      port === before.get(2) &&
        letGone.join(",") === key(2) &&
        !rows.has(key(2)) &&
        kept,
      `new on ${port}; let go: ${letGone.join(", ") || "none"}; ports before ${JSON.stringify([...before])}, now ${JSON.stringify([...rows].map(([one, row]) => [one.slice(-2), row.port]))}`
    );

    // 2. Every port's artifact in a panel a screen follows: refused, counted as shown.
    for (const [one] of rows) {
      previewTargets.set(`${FOLLOWED}-${one}`, {
        artifact: {
          id: artifact(Number(one.slice(-2))),
          kind: "preview",
          name: one,
          title: one,
        },
        revision: "1",
      });
    }
    // Each panel's session is one a screen follows.
    for (const id of previewTargets.keys()) {
      followed.add(id);
    }
    const refused = (() => {
      try {
        open(SIZE + 2);
        return null;
      } catch (error) {
        return error as { message: string; status?: number };
      }
    })();
    kit.check(
      "2: every port shown on a screen: a new show is refused 503, its words counting previews open on a screen and no running session",
      refused?.status === 503 &&
        refused.message.includes(`${SIZE} by previews open on a screen`) &&
        !refused.message.includes("running") &&
        letGone.length === 1,
      refused ? `${refused.status}: ${refused.message}` : "it opened"
    );
    previewTargets.clear();

    // 3. A tab at the page's address on the port that moved: sent to its own tab.
    const entered = await fetch(
      `http://127.0.0.1:${port}${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(mintTicket(null).ticket)}&next=%2F`,
      { redirect: "manual" }
    );
    const pass = entered.headers.get("set-cookie")?.split(";")[0] ?? "";
    const stale = `http://127.0.0.1:${port}/__cawco/page/${PAGE}/`;
    const asTab = await fetch(stale, {
      redirect: "manual",
      headers: { cookie: pass, "sec-fetch-dest": "document" },
    });
    const asFrame = await fetch(stale, {
      redirect: "manual",
      headers: { cookie: pass, "sec-fetch-dest": "iframe" },
    });
    kit.check(
      "3: a tab at a page's address on a port that moved on is sent to the page's own tab on the dashboard; a frame's load stays 404",
      pass !== "" &&
        asTab.status === 302 &&
        asTab.headers.get("location") === `${DASHBOARD}/artifact/${PAGE}` &&
        asFrame.status === 404,
      `entered ${entered.status} (${pass ? "a pass" : "no pass"}); tab ${asTab.status} → ${asTab.headers.get("location")}; frame ${asFrame.status}`
    );

    // 4. A port let go and taken by none: held, and the stale tab sent on.
    const freed = rows.get(key(3))?.port as number;
    listeners.release(key(3));
    await Bun.sleep(100);
    const vacantTab = await fetch(
      `http://127.0.0.1:${freed}/__cawco/page/${PAGE}/`,
      {
        redirect: "manual",
        headers: { cookie: pass, "sec-fetch-dest": "document" },
      }
    ).catch((error: unknown) => error as Error);
    kit.check(
      "4: a tab at a page's address on a port no origin holds is sent to the page's own tab, as on another origin's port",
      vacantTab instanceof Response &&
        vacantTab.status === 302 &&
        vacantTab.headers.get("location") === `${DASHBOARD}/artifact/${PAGE}`,
      vacantTab instanceof Response
        ? `port ${freed}: ${vacantTab.status} → ${vacantTab.headers.get("location")}`
        : `port ${freed}: ${vacantTab.message}`
    );

    // 5. A stale artifact_browse url: its entry sent to where the origin stands.
    const { ticket } = mintSessionTicket(RUNNING, [RUNNING]);
    const place = `/__cawco/page/${PAGE}/`;
    const staleEntry = await fetch(
      previewEnterUrl(`http://127.0.0.1:${port}`, ticket, place),
      { redirect: "manual" }
    );
    const forwarded = staleEntry.headers.get("location") ?? "";
    const runningPort = rows.get(RUNNING)?.port;
    const spent =
      forwarded === "" ? null : await fetch(forwarded, { redirect: "manual" });
    const sessionPass = spent?.headers.get("set-cookie")?.split(";")[0] ?? "";
    kit.check(
      "5: an artifact_browse url on a port its origin let go is sent, unspent, to the entry where the origin stands now, which lets the session in",
      staleEntry.status === 302 &&
        runningPort !== undefined &&
        forwarded ===
          previewEnterUrl(`http://127.0.0.1:${runningPort}`, ticket, place) &&
        spent?.status === 302 &&
        spent.headers.get("location") === place &&
        sessionPass.startsWith("cawco-preview-session-pass-"),
      `entry on ${port}: ${staleEntry.status} → ${forwarded}; there: ${spent?.status} → ${spent?.headers.get("location")} (${sessionPass ? "a session's pass" : "no pass"})`
    );

    // 6. The session's pass at the page's stale address: sent to where it stands.
    const sessionTab = await fetch(`http://127.0.0.1:${port}${place}?x=1`, {
      redirect: "manual",
      headers: { cookie: sessionPass, "sec-fetch-dest": "document" },
    });
    kit.check(
      "6: a session's pass at a page's address on a port that moved on is sent to the page where its origin stands now",
      sessionTab.status === 302 &&
        sessionTab.headers.get("location") ===
          `http://127.0.0.1:${runningPort}${place}?x=1`,
      `tab on ${port}: ${sessionTab.status} → ${sessionTab.headers.get("location")}`
    );
  } finally {
    for (const one of opened) {
      listeners.release(one);
    }
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-reclaim",
  ownProcess:
    "the hub's config reads CAWCO_PREVIEW_PORTS and CAWCO_DB_PATH once, as it loads: a spec before it in a run would have fixed the range elsewhere",
  run,
};
export default spec;
