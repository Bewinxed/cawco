/**
 * iOS: the preview panel's head keeps every control reachable at every width
 * the app gives it (PreviewController `placeHeadItems`): the controls it has
 * room for stand as buttons, each in a 44pt slot, by the head's priority;
 * the rest go to one More menu in the head's order (HIG Toolbars, "Add a More
 * menu to contain additional actions"), the mode stays on the head (its three
 * segments, or the chosen one's pick where they have no room), and Comments'
 * open count rides on More while More holds Comments, drawn only above 0
 * (The Earned Count Rule). The name keeps its own
 * width up to 120pt. On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) and the built app, iOS 18.5 and 27.2, a
 * session of its own on each device makes a page whose script makes a pick,
 * so Send picks stands:
 *
 * 1. The iPad 13" side card at its default share, the narrowest split
 *    (`cawco.preview.width.<session>` 0.3, the share's floor) and the panel
 *    expanded to the whole pane (`cawco.preview.expanded.<session>`); the
 *    iPhone 16 Pro's drawer at the phone's full width. At each, the app's
 *    `preview head room …` line: what stands and what More holds are every
 *    control the panel wants, once; each slot at least 44×44; the name at its
 *    floor or more; the mode on the head; the page holds no pins, so More
 *    draws no count; and nothing past the head's width. The head is captured light and
 *    dark.
 * 2. On the iPad's card, a finger's tap on More and on its Reload (axe):
 *    the page loads again, a document committed (`preview document`) with a
 *    new document clock (`preview doc origin=`).
 * 3. Once the session has run its turn (so the board has work and its tabs
 *    stand), The Earned Count Rule beyond the head: the
 *    board's work tabs (`home count`), on the iPad the bar's Machines (`bar
 *    machines`) and Configure's counted rows (`config row`, after
 *    `-open-configure`) draw a count only above 0, its number the count, a
 *    row not read yet "—"; the run says which states it reached.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-preview-head
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim, type SimChoice } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { runMoreItem } from "../head-more";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const IPAD = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB";
const IPHONE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro";
const RUNTIMES = [
  { tag: "ios-18.5", runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5" },
  // The newest runtime installed (`xcrun simctl list runtimes`, 2026-10-18).
  { tag: "ios-27.2", runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2" },
];
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
/** PreviewController's `preview head room …` line. */
const ROOM =
  /^preview head room width=(\d+) title=(\d+) floor=(\d+) shown=(\S*) more=(\S+) badge=(\S+)$/;
/** HomeCells' `home count <tab> <text> drawn=<bool> …` line. */
const HOME_COUNT = /^home count \w+ (\S*) ?drawn=(true|false) /;
/** HomeViewController's counts once the session's last turn has ended unseen: on Finished, off Working. */
const ENDED_UNSEEN = /^home counts: working=0 finished=[1-9]/;
/** A count's own text: a number above 0. */
const COUNTED = /^[1-9]\d*$/;
/** TopBar's `bar machines n=<n> drawn=<bool> value=<words|->` line. */
const MACHINES = /^bar machines n=(\d+) drawn=(true|false) value=(.+)$/;
/** ConfigureController's `config row <name> count=<n|unread> drawn=<bool> text=<text>` line. */
const CONFIG_ROW =
  /^config row (.+) count=(\d+|unread) drawn=(true|false) text=(\S+)$/;
const SLOT = /^(\w+):(\d+)x(\d+)$/;
const DOC = /^preview doc origin=(\d+) /;
const CREATE = "mcp__cawco__artifact_create";
/** The page's name: longer than the name's floor, so the floor is what it keeps. */
const NAME = "pricing-page-draft";
/** PreviewController `nameFloor`: what a name this long keeps while controls go to More. */
const NAME_FLOOR = 120;
/** A page that makes a pick once it stands (`cawco.choose`), so the head's Send picks stands. */
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Pricing</title>
<style>body { font: 17px system-ui; padding: 24px }</style></head>
<body><h1>Which plan?</h1><p>Pro, picked by the page itself.</p>
<script>
window.addEventListener("load", () => setTimeout(() => window.cawco?.choose("plan", "pro"), 800));
</script></body></html>`;
/** What the panel wants in its head for a page, beside the side and the drawer. */
const WANTED = ["send", "newCanvas", "openTab", "mode", "comments", "reload"];

/** Where the captures go: outside the workspace, for the parent's capture review. */
const keep = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-captures",
  "prd-parity",
  "preview-head"
);

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

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

let n = 0;

/** The session calls `name` with `input`; answers the tool's result as the model read it. */
async function call(
  fleet: KitFleet,
  session: string,
  name: string,
  input: object
): Promise<string> {
  n += 1;
  const marker = String(n);
  asks.set(marker, { name, input });
  await fleet.send(session, `PROBE-CALL:${marker}`);
  return (await until(
    `${name}'s answer (${marker})`,
    () => answered.get(marker),
    Boolean,
    240_000
  )) as string;
}

/** A simulator with the app installed, its Probe lines heard as they come. */
async function openSim(
  choice: SimChoice,
  app: string
): Promise<{ heard: string[]; sim: MacSim; stream: Subprocess }> {
  const sim = await macSim(choice);
  const { udid } = sim;
  await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const heard: string[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Probe" OR category == "HomeProbe")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    const reader = stream.stdout.getReader();
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
          heard.push(line.replace(LOG_HEAD, ""));
        }
      }
    }
  })().catch(() => undefined);
  await Bun.sleep(1500);
  return { sim, stream, heard };
}

/** One device's run: its simulator, its session and what its app said. */
interface On {
  fleet: KitFleet;
  heard: string[];
  kit: Kit;
  session: string;
  shots: string;
  tag: string;
  udid: string;
}

/** A head room line, read. */
interface Room {
  badge: string;
  floor: number;
  line: string;
  more: string[];
  shown: { height: number; name: string; width: number }[];
  title: number;
  width: number;
}

function readRoom(line: string | undefined): Room | undefined {
  const m = line?.match(ROOM);
  if (!(line && m)) {
    return;
  }
  const shown = (m[4] ?? "")
    .split(",")
    .map((slot) => slot.match(SLOT))
    .filter((slot): slot is RegExpMatchArray => !!slot)
    .map((slot) => ({
      name: slot[1] ?? "",
      width: Number(slot[2]),
      height: Number(slot[3]),
    }));
  return {
    line,
    width: Number(m[1]),
    title: Number(m[2]),
    floor: Number(m[3]),
    shown,
    more: m[5] === "-" ? [] : (m[5] ?? "").split(","),
    badge: m[6] ?? "-",
  };
}

/** What a head read gets wrong, against the controls the panel wants; empty when it holds. */
function roomFaults(room: Room, wanted: string[]): string[] {
  const faults: string[] = [];
  const standing = room.shown
    .map((slot) => (slot.name === "modePick" ? "mode" : slot.name))
    .filter((name) => name !== "more" && name !== "close");
  const reached = [...standing, ...room.more].sort();
  if (reached.join() !== [...wanted].sort().join()) {
    faults.push(
      `reached ${reached.join(",")} for ${[...wanted].sort().join(",")}`
    );
  }
  const small = room.shown.filter(
    (slot) => slot.width < 44 || slot.height < 44
  );
  if (small.length > 0) {
    faults.push(`under 44pt: ${small.map((slot) => slot.name).join(",")}`);
  }
  const moreStands = room.shown.some((slot) => slot.name === "more");
  if (moreStands !== room.more.length > 0) {
    faults.push(`More ${moreStands ? "stands empty" : "missing"}`);
  }
  if (!room.shown.some((slot) => slot.name === "close")) {
    faults.push("no Close");
  }
  // The page's name is longer than the floor: the floor is the whole of it.
  if (room.floor !== NAME_FLOOR || room.title < room.floor - 1) {
    faults.push(
      `name ${room.title} against its floor ${room.floor} (${NAME_FLOOR} for this name)`
    );
  }
  if (!standing.includes("mode")) {
    faults.push("the mode is off the head");
  }
  // The page holds no pins: a count of none is drawn nowhere (The Earned Count Rule).
  if (room.badge !== "-") {
    faults.push(`More draws a count of ${room.badge} with no open pins`);
  }
  const used =
    room.title + room.shown.reduce((sum, slot) => sum + slot.width, 0);
  if (used > room.width + 8) {
    faults.push(`laid ${used} in ${room.width}`);
  }
  return faults;
}

/** The newest head room line after `mark` that has Send picks in it (standing or in More). */
function roomAfter(
  on: On,
  mark: number,
  tag: string
): Promise<Room | undefined> {
  return until(
    `${tag}: the head with Send picks`,
    () => readRoom(on.heard.slice(mark).findLast((line) => ROOM.test(line))),
    (room) =>
      !!room &&
      (room.more.includes("send") ||
        room.shown.some((slot) => slot.name === "send")),
    120_000
  ).catch(() =>
    readRoom(on.heard.slice(mark).findLast((line) => ROOM.test(line)))
  );
}

/** The screen light and dark, named for the read. */
async function capture(on: On, read: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
    await sh(`xcrun simctl ui ${on.udid} appearance ${theme}`);
    await Bun.sleep(2000);
    await sh(
      `xcrun simctl io ${on.udid} screenshot "${join(on.shots, `${read}-${theme}.png`)}" >/dev/null`
    );
  }
  await sh(`xcrun simctl ui ${on.udid} appearance light`);
  await Bun.sleep(1000);
}

/** One width's read: the head as the app last laid it out, checked and captured. */
async function readAt(
  on: On,
  read: string,
  mark: number,
  wanted: string[]
): Promise<void> {
  const room = await roomAfter(on, mark, `${on.tag} ${read}`);
  const more = on.heard.findLast((line) =>
    line.startsWith("preview head open-tab=")
  );
  const faults = room ? roomFaults(room, wanted) : ["no head room line"];
  // With no head, what the app last said of its preview, and how much it said at all.
  const said = room
    ? ""
    : `; heard ${on.heard.length - mark} line(s), the preview's last: ${
        on.heard
          .slice(mark)
          .filter((line) => line.startsWith("preview"))
          .slice(-6)
          .join(" | ") || "none"
      }`;
  on.kit.check(
    `${on.tag} ${read}: every control the head wants stands in a 44pt slot or is in More, the name keeps its floor, the mode stays on the head, and More draws no count of none`,
    faults.length === 0,
    `${room?.line ?? "no head room line"}; ${more ?? "no More line"}${faults.length > 0 ? `; ${faults.join("; ")}` : ""}${said}`
  );
  await capture(on, read);
}

/** 2. Reload through More: the page loads again, its document clock new. */
async function reloadStep(on: On): Promise<void> {
  const { heard, kit, tag, udid } = on;
  const before = heard.findLast((line) => DOC.test(line))?.match(DOC)?.[1];
  const mark = heard.length;
  const tapped = await runMoreItem(udid, heard, "Reload").catch(
    (error: Error) => `More: ${error.message}`
  );
  const after = await until(
    `${tag}: the page loaded again`,
    () => heard.slice(mark).findLast((line) => DOC.test(line)),
    (line) => !!line && line.match(DOC)?.[1] !== before,
    30_000
  ).catch(() => heard.slice(mark).findLast((line) => DOC.test(line)));
  const committed = heard
    .slice(mark)
    .filter((line) => line === "preview document").length;
  const origin = after?.match(DOC)?.[1];
  kit.check(
    `${tag} 2: a finger's tap on More and on its Reload loads the page again: a document committed, its clock new`,
    !!before && !!origin && origin !== before && committed > 0,
    `${tapped.slice(0, 400)}; origin ${before ?? "-"} → ${origin ?? "-"}; documents committed ${committed}`
  );
}

/**
 * 3. The Earned Count Rule beyond the head (DESIGN.md): on the board, each
 * work tab's count (HomeCells), and on a wide screen the bar's Machines
 * (TopBar), drawn only above 0, its number the count; on Configure, each
 * counted row's count drawn above 0 or as "—" while unread, and gone at 0.
 * Says which states the run reached: a 0 and a count above it, where the
 * fleet gives both.
 */
async function countsStep(on: On, pad: boolean, hub: string): Promise<void> {
  const open = async (extra: string) => {
    const mark = on.heard.length;
    await sh(
      `xcrun simctl launch --terminate-running-process ${on.udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -preview-probe ${extra} >/dev/null`
    );
    await Bun.sleep(9000);
    return on.heard.slice(mark);
  };
  // The board on screen, the session runs one more turn: it works, then ends
  // unseen, so Working and then Finished each count it above 0.
  const mark = on.heard.length;
  await open("");
  await on.fleet.send(on.session, "One more turn, please.");
  await until(
    `${on.tag}: the session's turn on the board`,
    () => on.heard.slice(mark).findLast((line) => ENDED_UNSEEN.test(line)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const board = on.heard.slice(mark);
  // Every state a launch passes through counts, the first read's 0s among them, not only the last.
  const tabs = ["working", "finished"].map((tab) => {
    const lines = board
      .filter((line) => line.startsWith(`home count ${tab} `))
      .map((line) => line.match(HOME_COUNT))
      .filter((m): m is RegExpMatchArray => !!m);
    const broken = lines.filter(
      ([, text = "", drawn]) =>
        drawn !== String(text !== "") || !(text === "" || COUNTED.test(text))
    );
    // The last drawn is the last count the board was told.
    const told = board.findLast((line) =>
      line.startsWith("home counts: working=")
    );
    const held = Number(told?.match(new RegExp(`${tab}=(\\d+)`))?.[1] ?? -1);
    const last = lines.at(-1)?.[1] ?? "-";
    return {
      tab,
      zero: lines.some(([, text]) => text === ""),
      above: lines.some(([, text = ""]) => COUNTED.test(text)),
      ok:
        lines.length > 0 &&
        broken.length === 0 &&
        last === (held > 0 ? String(held) : ""),
      said: `${tab}: ${lines.map(([, text, drawn]) => `${text || "none"}/${drawn}`).join(" → ") || "no line"}, told ${held}${broken.map((one) => `; broken ${one[0]}`).join("")}`,
    };
  });
  const machines = pad
    ? board
        .filter((line) => MACHINES.test(line))
        .map((line) => line.match(MACHINES) as RegExpMatchArray)
    : [];
  const machinesBroken = machines.filter(
    ([, known, drawn, value]) =>
      drawn !== String(Number(known) > 0) ||
      Number(known) > 0 === (value === "-")
  );
  const machinesOk =
    !pad || (machines.length > 0 && machinesBroken.length === 0);
  const configure = await open("-open-configure");
  const rows = configure
    .filter((line) => CONFIG_ROW.test(line))
    .map((line) => line.match(CONFIG_ROW) as RegExpMatchArray);
  const rowFaults = rows.filter(([, , count, drawn, text]) => {
    const shouldDraw = count === "unread" || Number(count) > 0;
    const says = count === "unread" ? "—" : count;
    return drawn !== String(shouldDraw) || (shouldDraw && text !== says);
  });
  const both = (zero: boolean, above: boolean) =>
    [zero ? "at 0" : "", above ? "above 0" : ""]
      .filter(Boolean)
      .join(" and ") || "neither";
  const reached = [
    ...tabs.map((one) => `${one.tab} ${both(one.zero, one.above)}`),
    ...(pad
      ? [
          `machines ${both(
            machines.some(([, known]) => known === "0"),
            machines.some(([, known]) => Number(known) > 0)
          )}`,
        ]
      : []),
    `config rows at 0: ${rows.filter((row) => row[2] === "0").length}, above 0: ${rows.filter((row) => Number(row[2]) > 0).length}, unread: ${rows.filter((row) => row[2] === "unread").length}`,
  ];
  on.kit.check(
    `${on.tag} 3: a count is drawn only above 0 beyond the head: the work tabs${pad ? ", the bar's Machines" : ""} and Configure's rows, their number the count`,
    tabs.every((one) => one.ok) &&
      machinesOk &&
      rows.length > 0 &&
      rowFaults.length === 0,
    `reached ${reached.join("; ")}; ${tabs.map((one) => one.said).join(" | ")}; ${pad ? machines.map((one) => one[0]).join(" → ") || "no bar machines line" : "no Machines on a phone"}; ${rowFaults.map((row) => row[0]).join(" | ") || `${rows.length} config rows hold the rule`}`
  );
}

/** The device on `runtime`: a session, its page, and the head read at each of its widths. */
async function onDevice(
  kit: Kit,
  fleet: KitFleet,
  app: string,
  { device, runtime, tag }: { device: string; runtime: string; tag: string }
): Promise<void> {
  const pad = device === IPAD;
  const label = `${tag}-${pad ? "ipad" : "iphone"}`;
  const session = await fleet.spawn("claude", `Head ${label}`, fleet.repo);
  const shots = join(keep, label);
  await mkdir(shots, { recursive: true });
  let sim: Awaited<ReturnType<typeof openSim>> | undefined;
  try {
    sim = await openSim({ runtime, device }, app);
    const on: On = {
      fleet,
      heard: sim.heard,
      kit,
      session,
      shots,
      tag: label,
      udid: sim.sim.udid,
    };
    const launch = (extra: string) =>
      sh(
        `xcrun simctl launch --terminate-running-process ${on.udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe ${extra} >/dev/null`
      );
    let mark = on.heard.length;
    await launch("");
    await Bun.sleep(4000);
    const made = await call(fleet, session, CREATE, {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: NAME,
      html: PAGE,
    });
    console.log(`  ${label} artifact_create: ${made.slice(0, 240)}`);
    if (!pad) {
      // The phone's drawer: no Expand.
      await readAt(on, "drawer", mark, WANTED);
      await countsStep(on, pad, fleet.base);
      return;
    }
    await readAt(on, "card", mark, [...WANTED, "expand"]);
    await reloadStep(on);
    const widths: [string, string][] = [
      ["split-floor", `-cawco.preview.width.${session} 0.3`],
      ["expanded", `-cawco.preview.expanded.${session} 1`],
    ];
    for (const [read, extra] of widths) {
      mark = on.heard.length;
      // biome-ignore lint/performance/noAwaitInLoops: one launch at a time, on the one simulator
      await launch(extra);
      await readAt(on, read, mark, [...WANTED, "expand"]);
    }
    console.log(`  captures: ${shots}`);
    await countsStep(on, pad, fleet.base);
  } finally {
    await Bun.write(
      join(kit.out, `ios-preview-head-${label}.log`),
      (sim?.heard ?? []).join("\n")
    );
    sim?.stream.kill();
    await sim?.sim.release();
  }
}

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
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
  for (const { runtime, tag } of RUNTIMES) {
    for (const device of [IPAD, IPHONE]) {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, as the Mac's slots hold them
      await onDevice(kit, fleet, app, { device, runtime, tag });
    }
  }
};

const spec: Spec = { name: "ios-preview-head", run };
export default spec;
