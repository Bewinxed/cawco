/**
 * iOS: an event on a session's stream that this app cannot read is skipped
 * in its place, and the rest of the stream applies: no hole, no replay asked
 * for, no history read again, said once in the app's log (`HubNewer.skipped`).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with one session whose first turn ended, and the built app on
 * an iPhone simulator of its own (a mac-slot.sh slot, deleted at the end).
 * The app reaches the hub through a relay in this spec, which passes every
 * request and socket message through and, once, adds stand-ins to the hub's
 * own answer to the app's `stream.subscribe` for the session:
 *
 * - a backlog of four after the hub's: readable, a frame that is a string
 *   (no object: unreadable), one with no seq (placed by its neighbours),
 *   readable. The app applies through the fourth.
 * - then a lone `stream.event` whose frame is a number, and a readable one
 *   after it. The app skips the first in its place and applies the second.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-unreadable-event
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerWebSocket, Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const TITLE = "Unreadable event probe";
const LOG_HEAD = /^.*\] /;
const HTTP = /^http/;
/** A seq as the Ledger logs it: a Double, `13.000000`. */
const seq = (n: number): string => `seq ${n.toFixed(6)}`;
/** What a hole, a replay asked for or a history read again logs: none may follow the stand-ins. */
const TROUBLE =
  /resync|non-contiguous|past a hole|unreadable stream|read again|because (streamUnreadable|backlogBroken)/;
/** `launchctl list` in the simulator: the app's process, alive. */
const RUNNING = /\d+\s+\S+\s+UIKitApplication:dev\.cawco\.app/;
/** A transcript frame that changes nothing: readable, and applied. */
const EMPTY = { kind: "transcript", events: [] };

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

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

interface Relayed {
  /** The app's messages (text, as every one it sends) before the hub's socket opened. */
  held: string[];
  /** The hub's socket, once open; what the app sent before is held. */
  hub?: WebSocket;
  search: string;
}

/** Where the stand-ins went: the seqs the app should have reached. */
interface Injected {
  backlogThrough: number;
  lastEvent: number;
  skippedEvent: number;
}

async function run(kit: Kit): Promise<void> {
  const { path: bundle, problem } = freshApp(ROOT);
  if (
    !kit.check("the app is built from this tree", !problem, problem ?? bundle)
  ) {
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
  const session = await fleet.spawn("claude", TITLE);
  await fleet.send(session, "Say hello.");
  await until(
    "the first turn ended",
    () =>
      fleet.query<{ turn_ended_at: number | null }>(
        "SELECT turn_ended_at FROM instances WHERE id = ?",
        session
      )[0]?.turn_ended_at ?? 0,
    (at) => at > 0,
    120_000
  );

  // The relay: the hub's routes and socket, with the stand-ins added once.
  let afterSeq: number | undefined;
  let armed = false;
  let injected: Injected | undefined;
  const hubSocket = fleet.base.replace(HTTP, "ws");
  const relay = Bun.serve<Relayed>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (
        url.pathname === "/ws/dashboard" &&
        server.upgrade(request, { data: { held: [], search: url.search } })
      ) {
        return;
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      const answer = await fetch(`${fleet.base}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.arrayBuffer(),
        redirect: "manual",
      });
      // fetch hands the body on decoded: its encoding and length no longer hold.
      const out = new Headers(answer.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      return new Response(answer.body, { status: answer.status, headers: out });
    },
    websocket: {
      open(app: ServerWebSocket<Relayed>) {
        const hub = new WebSocket(
          `${hubSocket}/ws/dashboard${app.data.search}`
        );
        hub.onopen = () => {
          app.data.hub = hub;
          for (const message of app.data.held.splice(0)) {
            hub.send(message);
          }
        };
        hub.onmessage = (event) => {
          const text =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          app.send(stand(text, app));
        };
        hub.onclose = () => app.close();
      },
      message(app, message) {
        const text = typeof message === "string" ? message : message.toString();
        if (
          !injected &&
          text.includes('"stream.subscribe"') &&
          text.includes(session)
        ) {
          const { afterSeq: from } = JSON.parse(text) as { afterSeq?: number };
          afterSeq = from;
          armed = true;
        }
        if (app.data.hub) {
          app.data.hub.send(text);
        } else {
          app.data.held.push(text);
        }
      },
      close(app) {
        app.data.hub?.close();
      },
    },
  });

  /** The hub's answer to the subscribe, with the stand-ins after its own events. */
  const stand = (text: string, app: ServerWebSocket<Relayed>): string => {
    if (
      !armed ||
      injected ||
      !text.includes('"stream.backlog"') ||
      !text.includes(session)
    ) {
      return text;
    }
    const backlog = JSON.parse(text) as {
      type: string;
      sessionId: string;
      events: { seq: number }[];
    };
    if (backlog.type !== "stream.backlog" || backlog.sessionId !== session) {
      return text;
    }
    const last = Math.max(
      afterSeq ?? 0,
      ...backlog.events.map((event) => event.seq)
    );
    backlog.events.push(
      { seq: last + 1, sessionId: session, frame: EMPTY } as never,
      {
        seq: last + 2,
        sessionId: session,
        frame: "a stand-in frame this app cannot read",
      } as never,
      { sessionId: session, frame: EMPTY } as never,
      { seq: last + 4, sessionId: session, frame: EMPTY } as never
    );
    injected = {
      backlogThrough: last + 4,
      skippedEvent: last + 5,
      lastEvent: last + 6,
    };
    console.log(
      `  stand-ins: backlog ${last + 1}…${last + 4} after the hub's ${backlog.events.length - 4}, then events ${last + 5}, ${last + 6}`
    );
    setTimeout(() => {
      app.send(
        JSON.stringify({
          type: "stream.event",
          event: { seq: last + 5, sessionId: session, frame: 42 },
        })
      );
      app.send(
        JSON.stringify({
          type: "stream.event",
          event: { seq: last + 6, sessionId: session, frame: EMPTY },
        })
      );
    }, 1500);
    return JSON.stringify(backlog);
  };

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: { at: number; line: string }[] = [];
  try {
    sim = await macSim();
    const { udid } = sim;
    console.log(`  simulator ${udid}, relay ${relay.port} → ${fleet.base}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${bundle}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Ledger" OR category == "Hub" OR category == "Sessions" OR category == "Transcript")'`,
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
    await Bun.sleep(1500);
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${relay.port} -open-session ${session} >/dev/null`
    );
    const logged = (text: string) => heard.find((h) => h.line.includes(text));

    const at = await until(
      "the stand-ins went out",
      () => Promise.resolve(injected),
      Boolean,
      90_000
    ).catch(() => undefined);
    kit.check(
      "the app subscribed to the session, and the stand-ins went out with the hub's backlog",
      at !== undefined
    );
    if (!at) {
      return;
    }
    const through = await until(
      "the backlog applied",
      () =>
        Promise.resolve(
          logged(`applied through ${at.backlogThrough.toFixed(6)}`)
        ),
      Boolean,
      30_000
    ).catch(() => undefined);
    const followed = await until(
      "the event after the unreadable one applied",
      () => Promise.resolve(logged(`${seq(at.lastEvent)} applied`)),
      Boolean,
      30_000
    ).catch(() => undefined);
    // Whatever would follow a hole or a failed read has had time to show.
    await Bun.sleep(10_000);
    const since = heard.findIndex((h) => h.line.includes("backlog for"));
    const after = heard.slice(Math.max(0, since)).map((h) => h.line);
    const bad = after.filter((line) => TROUBLE.test(line));
    const running = await sh(`xcrun simctl spawn ${udid} launchctl list`).then(
      (list) => RUNNING.test(list)
    );

    kit.check(
      "the backlog applies through its last event: the unreadable frame and the seq-less event skipped in their places",
      through !== undefined &&
        logged(`${seq(at.backlogThrough - 2)} skipped`) !== undefined &&
        logged(`${seq(at.backlogThrough - 1)} skipped`) !== undefined,
      `${through?.line ?? `no "applied through ${at.backlogThrough}"`}`
    );
    kit.check(
      "each kind of skip is said once, as the hub being newer",
      logged("at .events[*].frame in stream.backlog") !== undefined &&
        logged("at .events[*].seq in stream.backlog") !== undefined &&
        logged("at .event.frame in stream.event") !== undefined,
      after.filter((line) => line.includes("read without it")).join(" | ") ||
        "no skip lines"
    );
    kit.check(
      "a lone unreadable event keeps its place: the next one applies",
      logged(`${seq(at.skippedEvent)} skipped`) !== undefined &&
        logged(`${seq(at.skippedEvent)} applied`) === undefined &&
        followed !== undefined,
      `${logged(`${seq(at.skippedEvent)} skipped`)?.line ?? "no skip"}; ${followed?.line ?? "no apply"}`
    );
    kit.check(
      "no hole, no replay, no history read again, and the app still runs",
      bad.length === 0 && running,
      `${bad.join(" | ") || "no hole, replay or read"}; ${running ? "running" : "not running"}`
    );
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stream?.kill();
    await sim?.release();
    relay.stop(true);
  }
}

export default { name: "ios-unreadable-event", run } satisfies Spec;
