/**
 * iOS: while the hub restarts for an update it announced, the app says it
 * is updating, not that the hub is unreachable, until the deadline the hub
 * gave; past it, the outage; back inside it, "CawCo updated to <build>."
 * (the dashboard's HubBand, the app's status line).
 *
 * A scratch fleet's hub (no machine) and the built app on an iPhone
 * simulator of its own (a mac-slot.sh slot, deleted at the end). What the
 * app's status line says is read from its DEBUG log (StatusLineView
 * `status line: <words>|<action>`), never from a capture. In order:
 *
 * 1. Back inside the deadline: the hub's own machine says it is installing
 *    (`PUT /api/binary-updates/machines/scratch-fleet/state`), so the hub
 *    tells the app (`hub.restart`) and the line says the update; the hub
 *    stops, and for as long as it is away the line says only the update;
 *    it starts again, and once the app has read it the line says
 *    "CawCo updated to 9.9.9-probe." within seconds of the hub answering
 *    (the app retries every second while the update stands), then leaves.
 * 2. Not back by the deadline (core binary-updates.ts UPDATE_TRIAL_MS): the
 *    same announcement and stop; the line says only the update until the
 *    deadline, and the outage ("Hub unreachable") from it; the hub starts
 *    again and the app reads it, with no word of an update (past its
 *    deadline the return is any return, as the dashboard's band says it).
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts ios-hub-update
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another:
 * then its tree is only noted, so a build from main can be run red).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { UPDATE_TRIAL_MS } from "../../../packages/core/src/binary-updates";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const VERSION = "9.9.9-probe";
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** StatusLineView's DEBUG line: its words, then its action when it shows one. */
const STATUS = /status line: (.*)\|(.*)$/;
const UPDATING = new RegExp(
  `^CawCo is updating to ${VERSION.replaceAll(".", "\\.")}\\b\\.$`
);
const UPDATED = `CawCo updated to ${VERSION}.`;
const AWAY = /unreachable|retrying|reconnect/i;
/** The home's DEBUG line as the status line's row is taken away. */
const GONE = "home status line gone";
/** HubConnection's line once the board is read on a connection. */
const READ = "fleet read:";
/** What the hub's machine says as its update helper is about to restart it. */
const installing = {
  phase: "installing",
  hostsHub: true,
  installedVersion: "0.0.1",
  availableVersion: VERSION,
  channel: "stable",
};

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

/** Polls `seen` every 250 ms until it answers, or `ms` passes; whether it did. */
async function within(seen: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (seen()) {
      return true;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a poll, one look at a time
    await Bun.sleep(250);
  }
  return seen();
}

/** The app's log, each line with when it was heard, pushed to `heard` as it comes. */
function follow(udid: string, heard: Heard[]): Subprocess {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Hub" OR category == "HomeProbe")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
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
  return child;
}

interface Heard {
  at: number;
  line: string;
}
interface Said {
  action: string;
  at: number;
  words: string;
}

/** The app's log read for what its status line and its hub said. */
function reading(heard: Heard[]) {
  /** Every status line said from `start` on: its words, and when. */
  const said = (start: number): Said[] =>
    heard.slice(start).flatMap((h) => {
      const found = STATUS.exec(h.line);
      return found ? [{ at: h.at, words: found[1], action: found[2] }] : [];
    });
  return {
    said,
    /**
     * What the line said over a window that starts at `start`: the line
     * standing then (it is logged only when its words change), and each
     * one after.
     */
    standing: (start: number): Said[] => {
      const last = heard
        .slice(0, start)
        .map((h) => STATUS.exec(h.line))
        .filter((found) => found !== null)
        .at(-1);
      return [
        ...(last ? [{ at: 0, words: last[1], action: last[2] }] : []),
        ...said(start),
      ];
    },
    logged: (start: number, text: string) =>
      heard.slice(start).find((h) => h.line.includes(text)),
  };
}

const show = (lines: Said[]) =>
  lines
    .map((l) => `"${l.words}"${l.action ? ` [${l.action}]` : ""}`)
    .join(" → ") || "nothing";
/** Only the update's words, nothing of an outage. */
const calm = (lines: Said[]) =>
  lines.length > 0 &&
  lines.every(
    (l) => UPDATING.test(l.words) && !AWAY.test(`${l.words} ${l.action}`)
  );
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface Round {
  /** The hub's machine says it is installing; the PUT's status. */
  announce: () => Promise<number>;
  fleet: KitFleet;
  heard: Heard[];
  kit: Kit;
  read: ReturnType<typeof reading>;
}

/** 1. The hub away for 15 s of its 180 s, then back. */
async function backInTime({ announce, fleet, heard, kit, read }: Round) {
  const { said, standing, logged } = read;
  let from = heard.length;
  const put = await announce();
  const told = await within(
    () => said(from).some((l) => UPDATING.test(l.words)),
    10_000
  );
  kit.check(
    "the hub's machine installing: the app's line says the update",
    told,
    `PUT ${put}; ${show(said(from))}`
  );
  from = heard.length;
  await fleet.stop("hub");
  const stopped = Date.now();
  await Bun.sleep(15_000);
  const away = standing(from);
  const dropped = logged(from, "hub socket closed") !== undefined;
  kit.check(
    "the hub away inside its deadline: the line says the update, never the outage",
    dropped && calm(away),
    `${dropped ? "socket closed" : "no socket close logged"}; ${seconds(Date.now() - stopped)} away: ${show(away)}`
  );
  from = heard.length;
  fleet.launch("hub");
  await fleet.hubUp();
  const answering = Date.now();
  await within(() => said(from).some((l) => l.words === UPDATED), 60_000);
  const backLines = said(from);
  const heardBack = backLines.find((l) => l.words === UPDATED)?.at;
  kit.check(
    `the hub back inside its deadline: the line says "${UPDATED}"`,
    heardBack !== undefined &&
      !backLines.some((l) => AWAY.test(`${l.words} ${l.action}`)),
    show(backLines)
  );
  // Its tries are a second apart while the update stands, not a backoff
  // grown to 16 s over the hub's 15 s away; the read waits 1 s after the open.
  kit.check(
    "the hub's return is heard within 5s of it answering",
    heardBack !== undefined && heardBack - answering <= 5000,
    heardBack === undefined
      ? "never heard"
      : `${seconds(heardBack - answering)} after the hub answered`
  );
  // Its leaving is the home's status line gone (HomeViewController's
  // DEBUG line): the words stand still, the row is taken away.
  const goneAfter = () =>
    heard
      .slice(from)
      .find((h) => h.at >= (heardBack ?? 0) && h.line.includes(GONE))?.at;
  await within(() => goneAfter() !== undefined, 10_000);
  const goneAt = goneAfter();
  kit.check(
    "the return's words leave after their hold",
    heardBack !== undefined && goneAt !== undefined,
    heardBack !== undefined && goneAt !== undefined
      ? `"${UPDATED}" stood ${seconds(goneAt - heardBack)}, then the home's status line went`
      : `${heardBack ? "said" : "never said"}; ${show(said(from))}`
  );
}

/** 2. The hub away past its deadline, then back. */
async function backLate({ announce, fleet, heard, kit, read }: Round) {
  const { said, logged } = read;
  const from = heard.length;
  const announced = Date.now();
  const put = await announce();
  const told = await within(
    () => said(from).some((l) => UPDATING.test(l.words)),
    10_000
  );
  kit.check(
    "announced again: the line says the update",
    told,
    `PUT ${put}; ${show(said(from))}`
  );
  await fleet.stop("hub");
  const deadline = announced + UPDATE_TRIAL_MS;
  // Its last seconds are left out: the frame's deadline counts from the hub's send.
  await Bun.sleep(Math.max(0, deadline - 3000 - Date.now()));
  // From the announcement on: round 1's line stood before it, and is gone.
  const before = said(from);
  kit.check(
    "until its deadline the line says only the update",
    calm(before),
    `${seconds(Date.now() - announced)} after the announcement: ${show(before)}`
  );
  const outFrom = heard.length;
  const outAt = () =>
    said(outFrom).find((l) => l.words.startsWith("Hub unreachable"))?.at;
  await within(() => outAt() !== undefined, 15_000);
  const out = outAt();
  kit.check(
    "past its deadline the line says the outage",
    out !== undefined && out >= deadline - 1000,
    `${out ? `${seconds(out - announced)} after the announcement (deadline ${UPDATE_TRIAL_MS / 1000}s)` : "no outage said"}: ${show(said(outFrom))}`
  );
  const lateFrom = heard.length;
  fleet.launch("hub");
  await fleet.hubUp();
  const lateRead = await within(
    () => logged(lateFrom, READ) !== undefined,
    60_000
  );
  await Bun.sleep(3000);
  const late = said(lateFrom);
  kit.check(
    "back past its deadline: the app reads the hub, and says no update",
    lateRead && !late.some((l) => l.words.startsWith("CawCo updated")),
    `${lateRead ? "read" : "not read"}: ${show(late)}`
  );
}

async function run(kit: Kit): Promise<void> {
  const named = process.env.PROBE_IOS_APP !== undefined;
  const { path: app, problem } = freshApp(ROOT);
  if (named && problem) {
    kit.note(`the named app is not this tree's: ${problem}`);
  } else if (
    !kit.check("the app is built from this tree", !problem, problem ?? app)
  ) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("hub");
  await fleet.hubUp();

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: Heard[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    stream = follow(udid, heard);
    await Bun.sleep(1500);
    const read = reading(heard);
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} >/dev/null`
    );
    const reached = await within(
      () => read.logged(0, READ) !== undefined,
      60_000
    );
    if (
      !kit.check(
        "the app reads the hub",
        reached,
        read.logged(0, READ)?.line ?? "no fleet read logged"
      )
    ) {
      return;
    }
    const announce = () =>
      fetch(`${fleet.base}/api/binary-updates/machines/${MACHINE}/state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(installing),
      }).then((r) => r.status);
    const round: Round = { announce, fleet, heard, kit, read };
    await backInTime(round);
    await backLate(round);
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stream?.kill();
    await sim?.release();
  }
}

export default { name: "ios-hub-update", run } satisfies Spec;
