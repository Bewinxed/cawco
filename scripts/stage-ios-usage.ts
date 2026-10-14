#!/usr/bin/env bun
/**
 * A scratch hub serving the web usage bench's staged forecast, for the iOS
 * usage surfaces' proof (the strip, its sheet, the Usage page's limits).
 *
 *   bun scripts/stage-ios-usage.ts [--port 47800]
 *
 * It stands up a real hub (scratch-fleet.ts, the hub process alone, its own
 * temp HOME and database) with the bench's sessions written into its
 * `instances`, and in front of it a proxy on `--port` that the app points at
 * (`-cawco-hub-url http://127.0.0.1:<port>`). The proxy serves the bench's
 * stage (apps/dashboard/src/routes/(app)/motion/usage-relay/stage-data.ts) where
 * the hub would serve its own: `/api/accounts`, `/api/accounts/forecast` and
 * `/api/usage/limits`; everything else, the dashboard socket included, goes
 * to the hub. The hub calls a running session on a machine with no agent
 * `unknown`; the proxy says the staged ones are running, as the bench does.
 *
 * Control, on the same port:
 *   POST /__stage?n=6|20&stop=1|2      re-stages at this moment
 *   GET  /__web?now=<ms>               what the web's rings.ts says of the
 *                                      current stage at `now`: every cell's
 *                                      name, time, week and tips, the head,
 *                                      the caption and the relay's bands.
 *
 * Ctrl-C stops the hub by its PID and deletes the sandbox.
 */
import { Database } from "bun:sqlite";
import {
  caption,
  cellTime,
  claudeRings,
  delegateTip,
  dialTip,
  fmt,
  openCodeRing,
  orgGroups,
  plain,
  type RingAccount,
  shownNames,
  stopFigure,
  stopOf,
  weekLeft,
} from "../apps/dashboard/src/lib/cawco/usage/rings";
import {
  type StagedData,
  stagedData,
} from "../apps/dashboard/src/routes/(app)/motion/usage-relay/stage-data";
import { scratchFleet } from "./scratch-fleet";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
};
const port = Number(arg("port", "47800"));
const MACHINE = "nixbox";

let staged: StagedData = stagedData(6, null);
let stageName = "n=6";

const fleet = await scratchFleet({
  name: "stage-ios-usage",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
const hubBase = fleet.base;
const hubWs = hubBase.replace("http", "ws");

/** Writes the staged sessions into the hub's own table, every not-null column filled. */
function writeSessions() {
  const db = new Database(fleet.env.CAWCO_DB_PATH as string);
  try {
    db.run("PRAGMA busy_timeout = 15000");
    const columns = db.query("PRAGMA table_info(instances)").all() as {
      dflt_value: string | null;
      name: string;
      notnull: number;
      type: string;
    }[];
    db.run("DELETE FROM instances WHERE id LIKE 'bench-%'");
    /** What the bench's rows carry (stage-data.ts builds them partial). */
    interface StagedRow {
      accountId?: string | null;
      cwd: string;
      harness?: string;
      id: string;
      parentInstanceId?: string | null;
      title: string;
    }
    const rows = [
      ...staged.instances,
      staged.openCodeSession,
    ] as unknown as StagedRow[];
    const now = Date.now();
    for (const row of rows) {
      const values: Record<string, string | number | null> = {
        id: row.id,
        machine_id: MACHINE,
        cwd: row.cwd,
        launch_dir: row.cwd,
        status: "running",
        harness: row.harness ?? "claude",
        title: row.title,
        account_id: row.accountId ?? null,
        parent_instance_id: row.parentInstanceId ?? null,
        session_id: `${row.id}-session`,
        created_at: now,
        updated_at: now,
      };
      for (const column of columns) {
        if (column.name in values) {
          continue;
        }
        if (column.notnull && column.dflt_value === null) {
          values[column.name] = column.type.toUpperCase().includes("INT")
            ? 0
            : "";
        }
      }
      const known = Object.keys(values).filter((name) =>
        columns.some((c) => c.name === name)
      );
      db.query(
        `INSERT INTO instances (${known.map((k) => `"${k}"`).join(", ")}) VALUES (${known.map(() => "?").join(", ")})`
      ).run(...known.map((k) => values[k] ?? null));
    }
  } finally {
    db.close();
  }
}

// The hub makes its database, stops, takes the sessions, and starts again.
fleet.launch("hub");
await fleet.hubUp();
await fleet.stop("hub");
writeSessions();
fleet.launch("hub");
await fleet.hubUp();
console.log(`… hub at ${hubBase}`);

const STAGED_IDS = () =>
  new Set([...staged.instances, staged.openCodeSession].map((row) => row.id));

/** Marks the staged sessions running wherever a row of them goes by. */
function running(value: unknown, ids: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((one) => running(one, ids));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, one] of Object.entries(value)) {
      out[key] = running(one, ids);
    }
    if (
      typeof out.id === "string" &&
      ids.has(out.id) &&
      out.status === "unknown"
    ) {
      out.status = "running";
    }
    return out;
  }
  return value;
}

function accountsView() {
  return {
    accounts: staged.accounts,
    signins: [],
    routing: [
      {
        ...staged.routing,
        atLimit: {
          move: false,
          moveWholeUnderK: 0,
          prepareAtPct: 90,
          waitMinutes: 0,
        },
      },
    ],
    readings: [],
    bench: [],
    catalogs: [],
    rebalances: [],
  };
}

function limits() {
  return {
    machines: [
      {
        machineId: MACHINE,
        hostname: MACHINE,
        limits: {
          error: null,
          fetchedAt: staged.now,
          stale: false,
          subscription: "max",
          windows: [],
        },
        openCodeGo: {
          error: null,
          fetchedAt: staged.now,
          stale: false,
          windows: staged.go,
        },
      },
    ],
  };
}

/** What the web's rings.ts says of the stage at `now`: the comparison table's web side. */
function web(now: number) {
  const rings = claudeRings({
    accounts: staged.accounts,
    bench: [],
    forecast: staged.forecast,
    instances: staged.instances,
    now,
    routing: staged.routing,
  });
  const claude = {
    ...rings,
    accounts: rings.accounts.filter((r) => r.w5 || r.week),
  };
  const go = openCodeRing(
    { fetchedAt: staged.now, windows: staged.go },
    [staged.openCodeSession],
    now,
    claude.accounts.map((r) => r.hue)
  );
  const names = shownNames(claude.accounts, go);
  const nameOf = (r: RingAccount) => {
    const n = names.get(r.id);
    return n ? `${n.local}${n.domain}` : r.name;
  };
  const room = (r: RingAccount) =>
    (r.bind === "week" ? r.week?.left : r.w5?.left) ?? 0;
  const ranked = (list: RingAccount[]) =>
    [...list].sort((a, b) => {
      const la = a.state === "limit";
      const lb = b.state === "limit";
      if (la !== lb) {
        return la ? 1 : -1;
      }
      if (la) {
        return (
          (a.backAt ?? Number.POSITIVE_INFINITY) -
          (b.backAt ?? Number.POSITIVE_INFINITY)
        );
      }
      const sa = stopOf(a, claude, now) ?? Number.POSITIVE_INFINITY;
      const sb = stopOf(b, claude, now) ?? Number.POSITIVE_INFINITY;
      return sb - sa || room(b) - room(a);
    });
  /** The status slot's tip (UsageMeter.svelte `lineTwo`): at its limit only. */
  const statusTip = (time: ReturnType<typeof cellTime>): string | null => {
    if (time.kind !== "back") {
      return null;
    }
    return time.figure === null
      ? "At its limit."
      : `At its limit. Back in ${time.figure}.`;
  };
  const cell = (r: RingAccount, c: typeof claude | null) => {
    const time = cellTime(r, c, now);
    return {
      id: r.id,
      name: c ? nameOf(r) : "opencode Go",
      time: time.figure,
      kind: time.kind,
      guess: time.kind === "stop" && time.guess,
      week: weekLeft(r),
      sessions: r.sessions.length,
      dialTip: dialTip(r, c, now),
      statusTip: statusTip(time),
      delegateTip: c && r.id === c.delegate?.id ? delegateTip(c, r) : null,
      carry: c ? r.id === c.carry?.id : false,
    };
  };
  const groups = orgGroups(claude.accounts).map((group, i) => ({
    head: group.org ?? (i > 0 ? "Other" : null),
    cells: ranked(group.accounts).map((r) => cell(r, claude)),
  }));
  const end = now + 5 * 3_600_000;
  const byId = new Map(claude.accounts.map((r) => [r.id, r]));
  let at = now;
  const bands: string[] = [];
  for (const span of [...staged.forecast.yours].sort(
    (a, b) => a.from - b.from
  )) {
    const from = Math.max(span.from, at);
    const to = Math.min(span.to, end);
    if (to <= from) {
      continue;
    }
    const ring = span.accountId ? byId.get(span.accountId) : undefined;
    const start =
      ring?.state === "limit" ? Math.max(from, ring.backAt ?? end) : from;
    if (ring && start < to) {
      // Relay.svelte's `ahead` and `bandTip`.
      const ahead = (ms: number) => (fmt(ms) === "0m" ? "now" : `+${fmt(ms)}`);
      bands.push(
        `${nameOf(ring)} carries you from ${ahead(start - now)} to ${ahead(to - now)}`
      );
    }
    at = to;
  }
  return {
    stage: stageName,
    now,
    stop: stopFigure(claude, now, nameOf),
    caption: plain(caption(claude, now, nameOf)),
    stopInside: claude.stopAt !== null && claude.stopAt - now < 5 * 3_600_000,
    groups,
    go: cell(go, null),
    bands,
  };
}

const json = (body: unknown) => Response.json(body);

/** The proxy's own answers: its control routes and the stage the hub would serve; none for the rest. */
async function ownAnswer(
  request: Request,
  url: URL
): Promise<Response | undefined> {
  if (url.pathname === "/__stage") {
    const n = url.searchParams.get("n") === "20" ? 20 : 6;
    const stop = url.searchParams.get("stop");
    staged = stagedData(n, stop || null);
    stageName = `n=${n}${stop ? ` stop=${stop}` : ""}`;
    await fleet.stop("hub");
    writeSessions();
    fleet.launch("hub");
    await fleet.hubUp();
    return json({ stage: stageName, now: staged.now });
  }
  if (url.pathname === "/__web") {
    return json(web(Number(url.searchParams.get("now") ?? Date.now())));
  }
  if (request.method !== "GET") {
    return;
  }
  const served: Record<string, () => unknown> = {
    "/api/accounts": accountsView,
    "/api/accounts/forecast": () => staged.forecast,
    "/api/usage/limits": limits,
  };
  const read = served[url.pathname];
  return read ? json(read()) : undefined;
}

const server = Bun.serve<
  { upstream: WebSocket; queue: (string | Buffer<ArrayBuffer>)[] },
  never
>({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 0,
  async fetch(request, srv) {
    const url = new URL(request.url);
    const own = await ownAnswer(request, url);
    if (own) {
      return own;
    }
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const upstream = new WebSocket(`${hubWs}${url.pathname}${url.search}`);
      const queue: (string | Buffer<ArrayBuffer>)[] = [];
      if (srv.upgrade(request, { data: { upstream, queue } })) {
        return;
      }
      return new Response("upgrade failed", { status: 500 });
    }
    const upstream = await fetch(`${hubBase}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
    });
    if (url.pathname === "/api/instances" && upstream.ok) {
      return json(running(await upstream.json(), STAGED_IDS()));
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
  websocket: {
    open(socket) {
      const { upstream, queue } = socket.data;
      upstream.onmessage = (event) => {
        const text = typeof event.data === "string" ? event.data : null;
        if (text === null) {
          socket.send(event.data as ArrayBuffer);
          return;
        }
        try {
          socket.send(JSON.stringify(running(JSON.parse(text), STAGED_IDS())));
        } catch {
          socket.send(text);
        }
      };
      upstream.onclose = () => socket.close();
      upstream.onopen = () => {
        for (const message of queue.splice(0)) {
          upstream.send(message);
        }
      };
    },
    message(socket, message) {
      const { upstream, queue } = socket.data;
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(message);
      } else {
        queue.push(message);
      }
    },
    close(socket) {
      socket.data.upstream.close();
    },
  },
});
console.log(
  `STAGED ${stageName} at http://127.0.0.1:${server.port} (hub ${hubBase})`
);

const stopAll = async () => {
  server.stop(true);
  await fleet.close().catch(() => undefined);
  await fleet.clean(false);
  process.exit(0);
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
