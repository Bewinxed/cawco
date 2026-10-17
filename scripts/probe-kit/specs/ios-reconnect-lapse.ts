/**
 * iOS: a session pane whose machine stopped answering says "reconnecting"
 * only for the window the hub gives (its 503's `Retry-After`), a deadline
 * read against the clock. At that deadline the pane reads its data again by
 * itself (`because deadline`) and shows the real state; a machine back
 * inside it shows the transcript again.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own (a
 * mac-slot.sh slot, deleted at the end), in order:
 *
 * 1. Back inside the window: the agent stops and the hub restarts, the app opens the session
 *    fresh, and the pane says "This machine is reconnecting"; the agent
 *    starts again before the window ends, and the transcript is read and
 *    drawn (`page adopted`), the pane's fault gone.
 * 2. Never back: the agent stops and the hub restarts, the app opens the session fresh, and the
 *    pane says "This machine is reconnecting" with the app's log naming the
 *    window; when it lapses the app reads again (`because deadline`)
 *    and the pane says "This machine is offline", with nothing else asked of it.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-reconnect-lapse
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5: where axe reaches the simulator from a workspace (ios-seen.ts). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
/** PaneState's titles for a read that found the machine away. */
const RECONNECTING = "This machine is reconnecting";
const OFFLINE = "This machine is offline";
/** The hub's longest window (core handover.ts RECONNECTING_MS), and slack past it. */
const WINDOW_MS = 60_000;
const SLACK_MS = 20_000;
const TITLE = "Reconnect probe";
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** The app's line as it schedules the lapse: `… lapses in <n> seconds`. */
const LAPSES_IN = /reconnecting window lapses in ([\d.]+) seconds/;

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

/** The checkout's simulator app, only when it was built from this tree (scripts/lib/apple-app.ts). */
const appPath = () => freshApp(ROOT);

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

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: { at: number; line: string }[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Transcript"'`,
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

    const labels = async (): Promise<string[]> => {
      const out: string[] = [];
      const walk = (node: Record<string, unknown>) => {
        // The pane's title is a text view (WrapLabel, a ProseView): its words
        // are its accessibility value, a label's are its label.
        for (const said of [node.AXLabel ?? node.label, node.AXValue]) {
          if (typeof said === "string" && said) {
            out.push(said);
          }
        }
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
    /** When the pane said `title` (its labels hold it), or undefined; what it showed instead is kept. */
    const says = async (title: string, ms: number, name: string) => {
      let last: string[] = [];
      const at = await until(
        `the pane says "${title}"`,
        async () => {
          last = await labels();
          return last;
        },
        (shown) => shown.some((label) => label.includes(title)),
        ms
      )
        .then(() => Date.now())
        .catch(() => undefined);
      if (at === undefined) {
        await writeFile(
          join(kit.out, `${name}-labels.json`),
          JSON.stringify(last, null, 2)
        );
      }
      return at;
    };
    const logged = (from: number, text: string) =>
      heard.slice(from).find((h) => h.line.includes(text));
    /** The app opened fresh on the session: nothing held, so a fault takes the pane. */
    const openFresh = () =>
      until(
        "the app launched",
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );

    /**
     * The machine goes away: its agent stops, and the hub restarts, so it
     * holds no page in memory and a read asks the machine (`storedEntries`),
     * which is away: a 503 naming it, reconnecting for what is left of the
     * window since the hub last heard from it (its database keeps that).
     * The agent registers afresh first, so that word is written just before
     * it goes, as a machine that drops is heard from moments before.
     */
    const machineAway = async () => {
      await fleet.stop("agent");
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.stop("agent");
      await fleet.stop("hub");
      fleet.launch("hub");
      await fleet.hubUp();
    };

    // ── 1. Back inside the window ────────────────────────────────────────
    await machineAway();
    const backFrom = heard.length;
    await openFresh();
    const backWaiting = await says(RECONNECTING, 30_000, "back-reconnecting");
    const window = LAPSES_IN.exec(
      logged(backFrom, "reconnecting window lapses in")?.line ?? ""
    )?.[1];
    kit.check(
      "back inside the window: the pane says reconnecting, with the hub's window",
      backWaiting !== undefined && window !== undefined,
      `${backWaiting ? "reconnecting shown" : "no reconnecting title"}; window ${window ?? "not logged"}s`
    );
    fleet.launch("agent");
    await fleet.agentUp();
    const adopted = await until(
      "the transcript read once the machine is back",
      () => Promise.resolve(logged(backFrom, `page adopted for ${session}`)),
      Boolean,
      WINDOW_MS
    ).catch(() => undefined);
    const shownBack = await labels();
    const backCause = heard
      .slice(backFrom)
      .filter((h) => h.line.includes(" because "))
      .map((h) => h.line.slice(h.line.indexOf("read ")))
      .join(" | ");
    kit.check(
      "back inside the window: the transcript is read and drawn, the fault gone",
      adopted !== undefined &&
        !shownBack.some((label) => label.includes(RECONNECTING)) &&
        !shownBack.some((label) => label.includes(OFFLINE)) &&
        !logged(backFrom, "because deadline"),
      `${adopted ? "page adopted" : "no page adopted"}; reads: ${backCause}`
    );

    // ── 2. Never back ────────────────────────────────────────────────────
    await machineAway();
    const goneFrom = heard.length;
    await openFresh();
    const waiting = await says(RECONNECTING, 30_000, "gone-reconnecting");
    const offline = await says(OFFLINE, WINDOW_MS + SLACK_MS, "gone-offline");
    const lapsed = logged(goneFrom, "because deadline");
    // The window this app process set last before its read again: the one that lapsed.
    const scheduled = heard
      .slice(goneFrom)
      .filter(
        (h) =>
          h.line.includes("reconnecting window lapses in") &&
          h.at <= (lapsed?.at ?? Number.POSITIVE_INFINITY)
      )
      .at(-1);
    const lapse = Number(
      LAPSES_IN.exec(scheduled?.line ?? "")?.[1] ?? Number.NaN
    );
    kit.check(
      "never back: the pane says reconnecting, the window named",
      waiting !== undefined && lapse > 0 && lapse <= WINDOW_MS / 1000,
      `${waiting ? "reconnecting shown" : "no reconnecting title"}; ${scheduled?.line ?? "no window logged"}`
    );
    kit.check(
      "never back: when the window lapses it reads again by itself and says offline",
      offline !== undefined &&
        lapsed !== undefined &&
        scheduled !== undefined &&
        lapsed.at - scheduled.at >= lapse * 1000 - 1500 &&
        lapsed.at - scheduled.at <= lapse * 1000 + 5000,
      `${lapsed ? `deadline read ${((lapsed.at - (scheduled?.at ?? lapsed.at)) / 1000).toFixed(1)}s after the window was set (${lapse}s)` : "no deadline read"}; ${offline ? "offline shown" : "no offline title"}`
    );
    // Offline waits for the machine: nothing reads again on its own after.
    await pause(15_000);
    const after = heard
      .slice(goneFrom)
      .filter(
        (h) =>
          h.line.includes(" because ") &&
          h.at > (lapsed?.at ?? Number.POSITIVE_INFINITY)
      );
    kit.check(
      "never back: once offline, no read is made until the machine is back",
      after.length === 0,
      after.map((h) => h.line).join(" | ") || "no read after offline"
    );
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stream?.kill();
    await sim?.release();
  }
}

const pause = (ms: number) => Bun.sleep(ms);

export default { name: "ios-reconnect-lapse", run } satisfies Spec;
