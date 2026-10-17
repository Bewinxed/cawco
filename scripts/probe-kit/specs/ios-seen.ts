/**
 * iOS: a turn that ends while the owner has its session in front is marked
 * seen on the hub (`POST /api/seen` with `look`) within a few seconds, every
 * time; and while he reads it, scrolling, with the keyboard up or a sheet
 * open, the app's presence beat keeps saying active on that session.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own (a
 * mac-slot.sh slot, deleted at the end), in order:
 *
 * 1. One session ends a first turn; the app opens it (`-open-session`): the
 *    opening look marks it seen.
 * 2. Three turns end with it in front, each a few seconds long, as the
 *    owner's do: after each, the hub's `seen_at` reaches its
 *    `turn_ended_at` within LOOK_MS, and the app logs `seen look <id>: marked`.
 * 3. He reads it for READ_MS (past the hub's 60 s presence TTL): scrolling,
 *    then the keyboard up (a turn ends then too), then its details card
 *    open over it from its tab (and another turn ends). The hub logged `[presence] ios <id8>: active on
 *    <session>` and no `inactive` or `lapsed` line for the client until he
 *    leaves; the app's beat went out every 30 s through it; each turn that
 *    ended was looked at.
 * 4. He leaves (Home): the hub logs the client inactive.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts ios-seen
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/**
 * iOS 18.5, the app's oldest target, where axe reaches the simulator from a
 * workspace: on iOS 27 its automation socket is refused there
 * ("testmanagerd.remote-automation.uds: Operation not permitted").
 */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
/** The invariant's "within a few seconds": the hub's mark after the turn's end. */
const LOOK_MS = 5000;
/** How long he reads the session: past the hub's 60 s presence TTL. */
const READ_MS = 90_000;
/** A prompt the mock answers slowly: a turn of a few seconds, watched as it runs. */
const SLOW = "SLOW";
/** The session's title: its tab says it. */
const TITLE = "Seen probe";
/** A log line's stamp, process and category, up to what it says. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** The app's socket: `… after the heartbeat, read <s> seconds after asking`. */
const READ_AFTER = /after the heartbeat, read ([\d.]+) seconds after asking/;
/** HubConnection `heartbeatDeadline`: how long it sleeps before reading what it heard. */
const HEARTBEAT_DEADLINE_S = 10;
/** A SQLite column type that takes a number. */
const NUMERIC = /INT|REAL|NUM/i;

const pause = (ms: number) => Bun.sleep(ms);

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** The session's row as the hub keeps it: when it was seen, when its turn ended. */
interface Marks {
  seen_at: number | null;
  turn_ended_at: number | null;
}

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
  role?: string;
}

/** The checkout's simulator app, only when it was built from this tree (scripts/lib/apple-app.ts). */
const appPath = () => freshApp(ROOT);

const respond = (request: Seen): Reply =>
  request.tools && request.last.startsWith(SLOW)
    ? {
        words: Array.from({ length: 24 }, (_, i) => `step ${i + 1}. `),
        everyMs: 200,
      }
    : { words: ["Done."], everyMs: 20 };

/**
 * The app's main actor kept up: its socket asks the hub for a heartbeat and
 * reads what it heard after sleeping HEARTBEAT_DEADLINE_S on the main actor
 * (HubConnection `keepAlive`), and its line says how long after asking that
 * read came: the sleep plus however long the main actor was held. A stall
 * there holds the beat's timer with it.
 */
function heartbeatReads(
  lines: { at: number; line: string }[],
  from: number
): { longest: number; stalls: string[] } {
  const stalls: string[] = [];
  let longest = 0;
  for (const h of lines) {
    const read = READ_AFTER.exec(h.line);
    if (!read) {
      continue;
    }
    const gap = Number(read[1]);
    longest = Math.max(longest, gap);
    if (gap > HEARTBEAT_DEADLINE_S + 5) {
      stalls.push(
        `${gap.toFixed(0)}s at +${((h.at - from) / 1000).toFixed(0)}s`
      );
    }
  }
  return { longest, stalls };
}

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = appPath();
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const marks = (): Marks =>
    fleet.query<Marks>(
      "SELECT seen_at, turn_ended_at FROM instances WHERE id = ?",
      session
    )[0] ?? {
      seen_at: null,
      turn_ended_at: null,
    };
  /**
   * A work item running under `parent`, as a delegate's is, with a workspace
   * row for it: each column the schema requires and gives no default is
   * filled, so the row stands whatever columns a migration adds.
   */
  const delegateUnder = (parent: string) => {
    const fill = (table: string, given: Record<string, string | number>) => {
      const columns = fleet.query<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }>(`PRAGMA table_info(${table})`);
      const row = Object.fromEntries(
        Object.entries(given).filter(([name]) =>
          columns.some((column) => column.name === name)
        )
      );
      for (const column of columns) {
        if (
          column.notnull &&
          column.dflt_value === null &&
          !(column.name in row)
        ) {
          row[column.name] = NUMERIC.test(column.type)
            ? Date.now()
            : `probe-${column.name}`;
        }
      }
      const names = Object.keys(row);
      fleet.write(
        `INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        ...names.map((n) => row[n] as string | number)
      );
    };
    const workspace = `probe-ws-${crypto.randomUUID().slice(0, 8)}`;
    fill("workspaces", {
      id: workspace,
      machine_id: "scratch-fleet",
      state: "active",
    });
    fill("work_items", {
      id: `probe-item-${crypto.randomUUID().slice(0, 8)}`,
      workspace_id: workspace,
      parent_instance_id: parent,
      // A session the hub has a row for: an item whose session is gone is
      // failed by its 30 s sweep (work-items.ts `followSessions`).
      instance_id: delegateSession,
      harness: "claude",
      state: "running",
    });
  };
  const session = await fleet.spawn("claude", TITLE);
  /** The session each delegate's work item runs in: one that stays idle. */
  const delegateSession = await fleet.spawn("claude", `${TITLE} delegate`);
  await fleet.send(session, "Say hello.");
  await until(
    "the first turn ended",
    () => marks().turn_ended_at ?? 0,
    (at) => at > 0,
    120_000
  );

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: { at: number; line: string }[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    // Booted is not ready: SpringBoard refuses a launch until boot finishes.
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Seen" OR category == "Presence" OR category == "Hub")'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes("dev.cawco.app")) {
            heard.push({ at: Date.now(), line: line.replace(LOG_HEAD, "") });
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);

    const tree = async (): Promise<Node[]> => {
      const out: Node[] = [];
      const walk = (node: Record<string, unknown>) => {
        out.push({
          id: node.AXUniqueId as string | undefined,
          label: (node.AXLabel ?? node.label) as string | undefined,
          role: node.role as string | undefined,
          frame: node.frame as Node["frame"],
        });
        for (const kid of (node.children as
          Record<string, unknown>[] | undefined) ?? []) {
          walk(kid);
        }
      };
      const roots = JSON.parse(
        await sh(`${AXE} describe-ui --udid ${udid}`)
      ) as Record<string, unknown>[];
      for (const root of roots) {
        walk(root);
      }
      return out;
    };
    const tap = async (node: Node | undefined, what: string) => {
      const f = node?.frame;
      if (!f) {
        throw new Error(`nothing to tap for ${what}`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };
    const swipe = (fromY: number, toY: number) =>
      sh(
        `${AXE} swipe --start-x 200 --start-y ${fromY} --end-x 200 --end-y ${toY} --duration 0.6 --udid ${udid}`
      );

    // SpringBoard can still refuse the first launch just after boot: asked again.
    await until(
      "the app launched",
      () =>
        sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} >/dev/null`
        ).then(() => true),
      Boolean,
      60_000
    );
    // The session in front, as the app tells the hub (its presence), read
    // from the app's own log: the turns below need nothing on screen.
    await until(
      "the app has the session in front",
      () =>
        heard.find((h) =>
          h.line.includes(`presence front: active true session ${session}`)
        ),
      Boolean,
      120_000
    );

    const marked = (from: number) =>
      heard
        .slice(from)
        .find((h) => h.line.includes(`seen look ${session}: marked`));
    const opened = await until(
      "the opening look",
      () =>
        (marks().seen_at ?? 0) >=
          (marks().turn_ended_at ?? Number.POSITIVE_INFINITY) || undefined,
      Boolean,
      30_000
    ).catch(() => false);
    kit.check(
      "opening the finished session marks it seen",
      opened === true && marked(0) !== undefined,
      JSON.stringify(marks())
    );

    /** What the board says runs under the session now. */
    const delegatesRunning = async () =>
      (
        await fleet.api<{ id: string; runningDelegates?: number }[]>(
          "/api/instances"
        )
      ).find((row) => row.id === session)?.runningDelegates ?? 0;

    /**
     * One turn ending with the session in front: the hub's mark follows
     * within LOOK_MS. With `delegate`, a delegate runs under the session as
     * the turn ends, as the owner's sessions end theirs with work handed off
     * (the board counts the session working, `runningDelegates`), and the
     * check holds only if the board counted it at the end.
     */
    const turnInFront = async (label: string, delegate = false) => {
      if (delegate) {
        delegateUnder(session);
      }
      const before = marks().turn_ended_at ?? 0;
      const from = heard.length;
      await fleet.send(session, `${SLOW}: ${label}, count the steps.`);
      const ended = await until(
        `${label}: the turn ended`,
        () => marks().turn_ended_at ?? 0,
        (at) => at > before,
        120_000
      );
      const endedAt = Date.now();
      const running = delegate ? await delegatesRunning() : 0;
      const seen = await until(
        `${label}: seen on the hub`,
        () => marks().seen_at ?? 0,
        (at) => at >= ended,
        LOOK_MS
      ).catch(() => undefined);
      // The app logs its look once the hub has answered it: after the mark.
      const line = await until(
        `${label}: the app's look`,
        () => marked(from),
        Boolean,
        LOOK_MS
      ).catch(() => undefined);
      kit.check(
        `${label}: the turn that ended in front is marked seen within ${LOOK_MS / 1000}s`,
        seen !== undefined && line !== undefined && (!delegate || running > 0),
        `turn_ended_at=${ended} seen_at=${marks().seen_at}${seen ? ` (+${seen - ended}ms)` : ""}${delegate ? `; runningDelegates=${running} at its end` : ""}; app: ${line?.line ?? `no "seen look" line in ${((Date.now() - endedAt) / 1000).toFixed(1)}s`}`
      );
    };

    for (const n of [1, 2, 3]) {
      // biome-ignore lint/performance/noAwaitInLoops: one turn after another, as the owner's go
      await turnInFront(`turn ${n}`);
    }
    for (const n of [1, 2, 3]) {
      // biome-ignore lint/performance/noAwaitInLoops: one turn after another, as the owner's go
      await turnInFront(`turn ${n} with a delegate running`, true);
    }

    // ── Reading it: scrolling, the keyboard up, a sheet open ─────────────
    const shown = await tree();
    await writeFile(
      join(kit.out, "session-tree.json"),
      JSON.stringify(shown, null, 2)
    );
    const field = shown.find((n) => n.id === "steer-message");
    /** The hub's `[presence]` lines for an iOS client, in the order it said them. */
    const presence = async () =>
      (await fleet.logs("hub"))
        .split("\n")
        .filter((l) => l.includes("[presence] ios "));
    const appFrom = heard.length;
    const readStart = Date.now();
    /** Where the reading is, on its clock: a stall is placed by these. */
    const phase = (what: string) =>
      console.log(
        `  +${((Date.now() - readStart) / 1000).toFixed(1)}s ${what}`
      );
    const scrollUntil = readStart + READ_MS / 3;
    phase("scrolling");
    while (Date.now() < scrollUntil) {
      // biome-ignore lint/performance/noAwaitInLoops: one gesture after another
      await swipe(300, 650);
      await swipe(650, 300);
    }
    phase("scrolled; the composer tapped");
    await tap(field, "the composer");
    await pause(1500);
    phase("reading the keyboard");
    const keyboard = (await tree()).some(
      (n) =>
        n.role === "AXKeyboard" || n.label === "space" || n.label === "Return"
    );
    kit.check("the keyboard is up", keyboard, "the composer tapped");
    phase("keyboard up");
    const keyboardTurn = turnInFront("keyboard up", true);
    await pause(Math.max(0, readStart + (2 * READ_MS) / 3 - Date.now()));
    await keyboardTurn;
    await sh(`${AXE} key 41 --udid ${udid}`).catch(() => undefined);
    // The keyboard down: the session's details card over it, from its tab
    // in the bar (TabDetails: the chosen tab's tap opens it).
    const nodes = await tree();
    await writeFile(
      join(kit.out, "keyboard-tree.json"),
      JSON.stringify(nodes, null, 2)
    );
    const opener = nodes.find(
      (n) => n.label?.includes(TITLE) && (n.frame?.y ?? 999) < 200
    );
    phase("the session's tab tapped");
    await tap(opener, "the session's tab");
    await pause(1500);
    const card = await tree();
    await writeFile(
      join(kit.out, "sheet-tree.json"),
      JSON.stringify(card, null, 2)
    );
    kit.check(
      "the session's details card is open over it",
      card.some((n) => n.label === "Session details"),
      "its tab tapped"
    );
    await turnInFront("details card open", true);
    await pause(Math.max(0, readStart + READ_MS - Date.now()));
    const readFor = Date.now() - readStart;

    const all = await presence();
    // From the session first in front until he leaves: the turns and the
    // reading alike, so a stale inactive landing after the active is caught.
    const during = all.slice(
      Math.max(
        0,
        all.findIndex((l) => l.endsWith(`active on ${session}`))
      )
    );
    const beats = heard
      .slice(appFrom)
      .filter(
        (h) =>
          h.line.includes("presence beat:") && h.line.includes("answered 200")
      );
    kit.check(
      `the hub said the client active on the session, and nothing else from its opening through ${(readFor / 1000).toFixed(0)}s of reading`,
      all.some((l) => l.endsWith(`active on ${session}`)) &&
        during.every((l) => !(l.includes("inactive") || l.includes("lapsed"))),
      during.join(" | ") || "no [presence] line"
    );
    const { longest, stalls } = heartbeatReads(heard.slice(appFrom), readStart);
    kit.check(
      "the app's main actor kept up through it",
      longest > 0 && stalls.length === 0,
      `the longest heartbeat read took ${longest.toFixed(1)}s (its sleep is ${HEARTBEAT_DEADLINE_S}s)${stalls.length ? `; held: ${stalls.join(", ")}` : ""}`
    );
    kit.check(
      "the app's beat went out every 30 s through it",
      beats.length >= Math.floor(readFor / 30_000) - 1 && beats.length >= 2,
      `${beats.length} beats in ${(readFor / 1000).toFixed(0)}s: ${beats.map((b) => `+${((b.at - readStart) / 1000).toFixed(0)}s`).join(", ")}`
    );

    // ── A beat that lands late ────────────────────────────────────────────
    // Two beats on two connections can land reversed: the hub keeps the
    // newest said, so a late inactive leaves the client active.
    const said = Date.now();
    const beat = (active: boolean, saidAt: number) =>
      fleet.api("/api/presence", {
        clientId: "probe-late-beat",
        client: "web",
        sessionId: session,
        active,
        saidAt,
      });
    await beat(true, said);
    await beat(false, said - 1000);
    const lateRead = async () =>
      (await fleet.logs("hub"))
        .split("\n")
        // The probe client's id is its own: every line for it is this check's.
        .filter((l) => l.includes("[presence] web probe-la"));
    const lateLines = await until(
      "the late beat's line",
      lateRead,
      (lines) => lines.some((l) => l.includes("landed late")),
      5000
    ).catch(lateRead);
    kit.check(
      "a beat said before the one kept is dropped, and the client stays active",
      lateLines.some((l) => l.includes("landed late; dropped")) &&
        !lateLines.some((l) => l.includes("inactive")),
      lateLines.join(" | ") || "no [presence] line for the probe client"
    );

    // ── Leaving ──────────────────────────────────────────────────────────
    const leftFrom = (await presence()).length;
    await sh(`${AXE} button home --udid ${udid}`);
    const left = await until(
      "the hub hears him leave",
      async () =>
        (await presence()).slice(leftFrom).find((l) => l.includes("inactive")),
      Boolean,
      15_000
    ).catch(() => undefined);
    kit.check(
      "leaving, the hub says the client inactive",
      left !== undefined,
      left ?? "no inactive line"
    );
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    await writeFile(
      join(kit.out, "hub-presence.txt"),
      (await fleet.logs("hub"))
        .split("\n")
        .filter((l) => l.includes("[presence]") || l.includes("[notify]"))
        .join("\n")
    );
    stream?.kill();
    await sim?.release();
  }
}

export default { name: "ios-seen", run } satisfies Spec;
