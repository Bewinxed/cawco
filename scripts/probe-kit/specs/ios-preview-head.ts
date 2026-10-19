/**
 * iOS: the preview panel's head keeps every control reachable at every width
 * the app gives it (PreviewController `placeHeadItems`): the controls it has
 * room for stand as buttons, each in a 44pt slot, by the head's priority;
 * the rest go to one More menu in the head's order (HIG Toolbars, "Add a More
 * menu to contain additional actions"), the mode stays on the head (its three
 * segments, or a pop-up of the three where they have no room), and Comments'
 * open count stays on More while More holds Comments. The name keeps its own
 * width up to 120pt. On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) and the built app, iOS 18.5 and 27.2, a
 * session of its own on each device makes a page whose script makes a pick,
 * so Send picks stands, and says when it stands loaded and in which theme:
 *
 * 1. The iPad 13" side card at its default share, the narrowest split
 *    (`cawco.preview.width.<session>` 0.3, the share's floor) and the panel
 *    expanded to the whole pane (`cawco.preview.expanded.<session>`); the
 *    iPhone 16 Pro's drawer at the phone's full width. At each, the app's
 *    `preview head room …` line: what stands and what More holds are every
 *    control the panel wants, once; each slot at least 44×44; the name at its
 *    floor or more; the mode on the head; Comments' count on the head or on
 *    More; nothing past the head's width; and no count over the glyphs beside
 *    it (`preview head counts …`). Captured light and dark once the page says
 *    it stands loaded in that theme and its card's picture has come.
 * 2. On the card, the narrowest split and the phone: More open (axe), its rows
 *    the head's overflow in the head's order, each at least 44pt tall; the
 *    mode's pop-up open, its rows the three modes in order. Each captured
 *    open, light and dark.
 * 3. On the iPad's card, a finger's tap on More and on its Reload: the page
 *    loads again, a document committed (`preview document`) with a new
 *    document clock (`preview doc origin=`).
 * 4. 12 open pins and then 120, written into the page's doc as a person's
 *    client writes them (`seedPins`): the count stands on the head, its box
 *    clear of More's dots, Close and Comments' glyph. Captured.
 * 5. On the phone: nothing on the screen runs past its edges.
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
import { seedPins } from "../artifact-doc";
import {
  closeMenu,
  type Named,
  named,
  type OpenMore,
  openMenuAt,
  openMore,
  runMoreItem,
} from "../head-more";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const IPAD = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB";
const IPHONE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro";
const RUNTIMES = [
  { tag: "ios-18.5", runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5" },
  // The newest runtime installed (`xcrun simctl list runtimes`, 2026-10-18).
  { tag: "ios-27.2", runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2" },
];
const THEMES = ["light", "dark"] as const;
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** PreviewController's `preview head room …` line. */
const ROOM =
  /^preview head room width=(\d+) title=(\d+) floor=(\d+) shown=(\S*) more=(\S+) badge=(\S+)$/;
/** PreviewController's `preview head counts …` line: the open count, the counts' boxes, the glyphs beside them, the mode's pop-up. */
const COUNTS =
  /^preview head counts open=(\d+) more-count=(\S+) dots=(\S+) pins-count=(\S+) pins-glyph=(\S+) close=(\S+) mode-pick=(\S+)$/;
/** PreviewController's `preview head open-tab=… more=…` line: where ↗ and More stand. */
const OPEN_TAB = /^preview head open-tab=/;
/** The web view's frame in PreviewController's `preview head comment=…` line. */
const WEB = / web=(-?\d+),(-?\d+),(\d+),(\d+)$/;
/** HomeCells' `home count <tab> <text> drawn=<bool> …` line. */
const HOME_COUNT = /^home count \w+ (\S*) ?drawn=(true|false) /;
/** A count's own text: a number above 0. */
const COUNTED = /^[1-9]\d*$/;
/** TopBar's `bar machines n=<n> drawn=<bool> value=<words|->` line. */
const MACHINES = /^bar machines n=(\d+) drawn=(true|false) value=(.+)$/;
/** ConfigureController's `config row <name> count=<n|unread> drawn=<bool> text=<text>` line. */
const CONFIG_ROW =
  /^config row (.+) count=(\d+|unread) drawn=(true|false) text=(\S+)$/;
/** How far a control's touch area may reach past the screen's edge (`c-bar-phone-edge`: "in a 44px touch area" reaching into it). */
const EDGE_REACH = 2;
/** What the page says of itself: loaded, in the theme the overlay set on it. */
const LOADED = /^preview page loaded=1 theme=(\w+)/;
const CAPTURED = /^preview captured .*bytes=(\d+)/;
const SLOT = /^(\w+):(\d+)x(\d+)$/;
const DOC = /^preview doc origin=(\d+) /;
const CREATE = "mcp__cawco__artifact_create";
/** The page's name: longer than the name's floor, so the floor is what it keeps. */
const NAME = "pricing-page-draft";
/** PreviewController `nameFloor`: what a name this long keeps while controls go to More. */
const NAME_FLOOR = 120;
/**
 * A page that makes a pick once it stands (`cawco.choose`), so the head's
 * Send picks stands, and says it stands loaded and in which theme (the
 * overlay's `data-theme`), on load and at each theme the host sends.
 */
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Pricing</title>
<style>body { font: 17px system-ui; padding: 24px }</style></head>
<body><h1>Which plan?</h1><p>Pro, picked by the page itself.</p>
<script>
const say = () => window.parent.postMessage({
  type: "cawco:probe",
  state: "loaded=1 theme=" + (document.documentElement.dataset.theme || "none"),
  rects: {},
}, "*");
new MutationObserver(say).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.addEventListener("load", () => {
  say();
  setTimeout(() => window.cawco?.choose("plan", "pro"), 800);
});
</script></body></html>`;
/** What the panel wants in its head for a page, beside the side and the drawer. */
const WANTED = ["send", "newCanvas", "openTab", "mode", "comments", "reload"];
/** Each head control's row in More, by its name (PreviewController `overflowMenu`). */
const TITLES: Record<string, string[]> = {
  send: ["Send picks"],
  newCanvas: ["New canvas"],
  undock: ["Undock"],
  openTab: ["Open in new tab"],
  inspect: ["Inspect"],
  mode: ["Interact", "Comment", "Draw"],
  comments: ["Comments"],
  reload: ["Reload"],
  expand: ["Expand"],
};
const MODES = ["Interact", "Comment", "Draw"];

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

/** One device's run: its simulator, its session, its page and what its app said. */
interface On {
  artifact: string;
  fleet: KitFleet;
  heard: string[];
  kit: Kit;
  /** Where in `heard` the app's last launch begins. */
  launched: number;
  /** The open pins written so far. */
  pins: number;
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
function roomFaults(room: Room, wanted: string[], pins: number): string[] {
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
  // A count above 0 stands on Comments, or on More while More holds Comments.
  if (pins > 0 && !standing.includes("comments") && room.badge === "-") {
    faults.push("Comments' count is nowhere on the head");
  }
  // A count of none is not drawn, on More as on Comments (countFaults).
  if (pins === 0 && room.badge !== "-") {
    faults.push(`More draws a count of ${room.badge} with no open pins`);
  }
  const used =
    room.title + room.shown.reduce((sum, slot) => sum + slot.width, 0);
  if (used > room.width + 8) {
    faults.push(`laid ${used} in ${room.width}`);
  }
  return faults;
}

type Box = [number, number, number, number];

const boxOf = (said: string | undefined): Box | undefined =>
  said && said !== "none" ? (said.split(",").map(Number) as Box) : undefined;

/** Whether two boxes share any area. */
const meets = (a: Box | undefined, b: Box | undefined) =>
  !!a &&
  !!b &&
  a[0] < b[0] + b[2] &&
  b[0] < a[0] + a[2] &&
  a[1] < b[1] + b[3] &&
  b[1] < a[1] + a[3];

/** Where a count stands over a glyph beside it (`preview head counts …`); empty when none does. */
function countFaults(line: string | undefined, pins: number): string[] {
  const m = line?.match(COUNTS);
  if (!m) {
    return ["no head counts line"];
  }
  const [moreCount, dots, pinsCount, pinsGlyph, close] = m
    .slice(2, 7)
    .map(boxOf);
  const faults: string[] = [];
  if (pins === 0 && (moreCount || pinsCount)) {
    faults.push(
      `${moreCount ? "More's" : "Comments'"} count is drawn with no open pins`
    );
  }
  if (meets(moreCount, dots) || meets(moreCount, close)) {
    faults.push("More's count meets its dots or Close");
  }
  if (
    meets(pinsCount, pinsGlyph) ||
    meets(pinsCount, close) ||
    meets(pinsCount, dots)
  ) {
    faults.push("Comments' count meets its glyph, More's dots or Close");
  }
  return faults;
}

const lastOf = (on: On, pattern: RegExp, from = 0) =>
  on.heard.slice(from).findLast((line) => pattern.test(line));

/** The newest head room line after `mark` that has Send picks in it (standing or in More). */
function roomAfter(
  on: On,
  mark: number,
  tag: string
): Promise<Room | undefined> {
  return until(
    `${tag}: the head with Send picks`,
    () => readRoom(lastOf(on, ROOM, mark)),
    (room) =>
      !!room &&
      (room.more.includes("send") ||
        room.shown.some((slot) => slot.name === "send")),
    120_000
  ).catch(() => readRoom(lastOf(on, ROOM, mark)));
}

/** The simulator in `theme`, once the page says it stands loaded in it after `from`. Answers a fault, or nothing. */
async function themed(
  on: On,
  theme: string,
  from: number
): Promise<string | undefined> {
  await sh(`xcrun simctl ui ${on.udid} appearance ${theme}`);
  const loaded = await until(
    `${on.tag}: the page loaded in ${theme}`,
    () =>
      on.heard
        .slice(from)
        .findLast((line) => line.match(LOADED)?.[1] === theme),
    Boolean,
    60_000
  ).catch(() => undefined);
  // What stands beside the page (the transcript's cards) takes the theme with it.
  await Bun.sleep(1500);
  return loaded ? undefined : `the page never said it stood loaded in ${theme}`;
}

/** The screen, light and dark, once the page stands loaded in each and its card's picture has come. Answers what did not settle. */
async function capture(on: On, read: string): Promise<string[]> {
  const faults: string[] = [];
  const pictured = await until(
    `${on.tag} ${read}: the card's picture`,
    () => on.heard.slice(on.launched).find((line) => CAPTURED.test(line)),
    (line) => Number(line?.match(CAPTURED)?.[1] ?? 0) > 0,
    60_000
  ).catch(() => undefined);
  if (!pictured) {
    faults.push("the card's picture never came");
  }
  for (const theme of THEMES) {
    // The page's last word since its launch counts for the theme it already has.
    const from = theme === "light" ? on.launched : on.heard.length;
    // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
    const unsettled = await themed(on, theme, from);
    if (unsettled) {
      faults.push(unsettled);
    }
    await sh(
      `xcrun simctl io ${on.udid} screenshot "${join(on.shots, `${read}-${theme}.png`)}" >/dev/null`
    );
  }
  await themed(on, "light", on.heard.length);
  return faults;
}

/** One width's read: the head as the app last laid it out, checked and captured. */
async function readAt(
  on: On,
  read: string,
  wanted: string[]
): Promise<Room | undefined> {
  const room = await roomAfter(on, on.launched, `${on.tag} ${read}`);
  const more = lastOf(on, OPEN_TAB);
  const counts = lastOf(on, COUNTS);
  const faults = room
    ? [...roomFaults(room, wanted, on.pins), ...countFaults(counts, on.pins)]
    : ["no head room line"];
  // With no head, what the app last said of its preview, and how much it said at all.
  const said = room
    ? ""
    : `; heard ${on.heard.length - on.launched} line(s), the preview's last: ${
        on.heard
          .slice(on.launched)
          .filter((line) => line.startsWith("preview"))
          .slice(-6)
          .join(" | ") || "none"
      }`;
  const unsettled = await capture(on, read);
  on.kit.check(
    `${on.tag} ${read}: every control the head wants stands in a 44pt slot or is in More, the name keeps its floor, the mode and Comments' count stay on the head, and each capture waited for the page`,
    faults.length === 0 && unsettled.length === 0,
    `${room?.line ?? "no head room line"}; ${more ?? "no More line"}; ${counts ?? "no counts line"}${[...faults, ...unsettled].map((fault) => `; ${fault}`).join("")}${said}`
  );
  return room;
}

/** The rows of an open menu that are `titles`, in their order on screen, as `title@height`. */
function rowsOf(open: OpenMore, titles: string[]): string[] {
  const isRow = (label: string | undefined, title: string) =>
    label === title || !!label?.startsWith(`${title},`);
  return open.rows.flatMap((row) => {
    const title = titles.find((one) => isRow(row.label, one));
    return title ? [`${title}@${Math.round(row.frame?.height ?? 0)}`] : [];
  });
}

/**
 * The runtime draws a UIMenu's rows a touch target tall. UIKit sets a row's
 * height itself and offers no API for it (UIMenu `preferredElementSize` only
 * picks the side-by-side or full-width layout): iOS 18 draws 44pt rows, iOS
 * 26 and later 38pt on an iPad and 42pt on an iPhone, read and reported.
 */
const tallRows = (on: On) => on.tag.startsWith("ios-18");

/** Whether a menu read holds `titles` once each, in order, every row at least 44pt tall where the runtime draws them so. */
function menuHolds(rows: string[], titles: string[], tall: boolean): boolean {
  return (
    rows.map((row) => row.split("@")[0]).join("|") === titles.join("|") &&
    (!tall || rows.every((row) => Number(row.split("@")[1]) >= 44))
  );
}

/** A point no menu covers: the page's foot, by its leading edge, where a tap in Interact lands on nothing. */
function away(on: On): [number, number] {
  const web = lastOf(on, WEB)?.match(WEB)?.slice(1).map(Number);
  if (!web) {
    throw new Error("the head never said where the page stands");
  }
  const [x = 0, y = 0, , height = 0] = web;
  return [x + 24, y + height - 40];
}

/** One menu opened in each theme, read in light, captured open in both. Answers the light read. */
async function menuRead(
  on: On,
  shot: string,
  titles: string[],
  open: () => Promise<OpenMore>
): Promise<{ rows: string[]; said: string }> {
  let read: { rows: string[]; said: string } = { rows: [], said: "" };
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
    await themed(on, theme, theme === "light" ? on.launched : on.heard.length);
    const menu = await open();
    if (theme === "light") {
      read = {
        rows: rowsOf(menu, titles),
        said: menu.rows
          .map((row: Named) => row.label)
          .join(" | ")
          .slice(0, 300),
      };
    }
    await sh(
      `xcrun simctl io ${on.udid} screenshot "${join(on.shots, `${shot}-${theme}.png`)}" >/dev/null`
    );
    await closeMenu(on.udid, away(on));
  }
  await themed(on, "light", on.heard.length);
  return read;
}

/** 2. More open, and the mode's pop-up where it stands: their rows, in order, each a touch target tall. */
async function menusStep(on: On, read: string, room: Room): Promise<void> {
  const titles = room.more.flatMap((item) => TITLES[item] ?? [item]);
  const more = await menuRead(on, `${read}-more-open`, titles, () =>
    openMore(on.udid, on.heard, (rows) =>
      rows.some((row) => row.label?.startsWith(titles.at(-1) ?? "-"))
    )
  ).catch((error: Error) => ({ rows: [], said: error.message }));
  // Comments in More: its row says the open count above 0, and none at 0.
  const labels = more.said.split(" | ");
  const counted =
    !room.more.includes("comments") ||
    (on.pins > 0
      ? labels.includes(`Comments, ${on.pins} open`)
      : labels.includes("Comments"));
  on.kit.check(
    `${on.tag} ${read} More: its rows are the head's overflow in the head's order${tallRows(on) ? ", each at least 44pt tall" : " (row heights the system's)"}, Comments' row with its open count above 0 and none at 0`,
    menuHolds(more.rows, titles, tallRows(on)) && counted,
    `rows ${more.rows.join(", ") || "none"} for ${titles.join(", ")}; the menu: ${more.said}`
  );
  if (!room.shown.some((slot) => slot.name === "modePick")) {
    return;
  }
  const at = lastOf(on, COUNTS)?.match(COUNTS)?.[7]?.split(",").map(Number);
  const mode = await menuRead(on, `${read}-mode-open`, MODES, () => {
    if (!(at && at.length === 2)) {
      throw new Error("the head said the mode's pop-up does not stand");
    }
    return openMenuAt(on.udid, [at[0] ?? 0, at[1] ?? 0], (rows) =>
      rows.some((row) => row.label === "Draw")
    );
  }).catch((error: Error) => ({ rows: [], said: error.message }));
  on.kit.check(
    `${on.tag} ${read} mode: the mode's pop-up holds Interact, Comment and Draw in order${tallRows(on) ? ", each at least 44pt tall" : " (row heights the system's)"}`,
    menuHolds(mode.rows, MODES, tallRows(on)),
    `rows ${mode.rows.join(", ") || "none"}; the menu: ${mode.said}`
  );
}

/** 3. Reload through More: the page loads again, its document clock new. */
async function reloadStep(on: On): Promise<void> {
  const { heard, kit, tag, udid } = on;
  const before = lastOf(on, DOC)?.match(DOC)?.[1];
  const mark = heard.length;
  const tapped = await runMoreItem(udid, heard, "Reload").catch(
    (error: Error) => `More: ${error.message}`
  );
  const after = await until(
    `${tag}: the page loaded again`,
    () => lastOf(on, DOC, mark),
    (line) => !!line && line.match(DOC)?.[1] !== before,
    30_000
  ).catch(() => lastOf(on, DOC, mark));
  const committed = heard
    .slice(mark)
    .filter((line) => line === "preview document").length;
  const origin = after?.match(DOC)?.[1];
  kit.check(
    `${tag} 3: a finger's tap on More and on its Reload loads the page again: a document committed, its clock new`,
    !!before && !!origin && origin !== before && committed > 0,
    `${tapped.slice(0, 400)}; origin ${before ?? "-"} → ${origin ?? "-"}; documents committed ${committed}`
  );
}

/** 4. The page's doc holds `total` open pins: the count on the head, clear of the glyphs beside it. */
async function pinsStep(
  on: On,
  read: string,
  total: number,
  wanted: string[]
): Promise<void> {
  const held = await seedPins(
    on.fleet.base,
    on.session,
    on.artifact,
    total - on.pins
  ).catch((error: Error) => error.message);
  on.pins = total;
  const shown = await until(
    `${on.tag}: ${total} open pins on the head`,
    () => lastOf(on, COUNTS),
    (line) => line?.match(COUNTS)?.[1] === String(total),
    60_000
  ).catch(() => lastOf(on, COUNTS));
  await Bun.sleep(1500);
  const room = readRoom(lastOf(on, ROOM));
  const counts = lastOf(on, COUNTS);
  const faults = [
    ...(room ? roomFaults(room, wanted, total) : ["no head room line"]),
    ...countFaults(counts, total),
  ];
  if (shown?.match(COUNTS)?.[1] !== String(total)) {
    faults.push(`the head says ${shown?.match(COUNTS)?.[1] ?? "no"} open pins`);
  }
  const unsettled = await capture(on, `${read}-${total}-pins`);
  on.kit.check(
    `${on.tag} ${read} ${total} pins: the open count stands on the head, its box clear of More's dots, Close and Comments' glyph`,
    faults.length === 0 && unsettled.length === 0,
    `the doc holds ${held}; ${room?.line ?? "no head room line"}; ${counts ?? "no counts line"}${[...faults, ...unsettled].map((fault) => `; ${fault}`).join("")}`
  );
}

/** 5. On the phone: what on its screen runs past the screen's edges, by name and frame. */
async function edgeStep(on: On): Promise<void> {
  const all = await named(on.udid);
  const screen = all[0]?.frame;
  const past = all.filter(
    ({ frame }) =>
      !!(frame && screen) &&
      frame.width > 0 &&
      (frame.x < screen.x - EDGE_REACH ||
        frame.x + frame.width > screen.x + screen.width + EDGE_REACH)
  );
  on.kit.check(
    `${on.tag} 5: nothing on the phone's screen runs past its edges`,
    !!screen && past.length === 0,
    past
      .map(
        ({ frame, label }) =>
          `${label ?? "unnamed"} at ${frame?.x},${frame?.y},${frame?.width},${frame?.height}`
      )
      .join(" | ") || `nothing past the screen's ${screen?.width ?? "?"}pt`
  );
}

/**
 * 6. The Earned Count Rule beyond the head (DESIGN.md): on the board, each
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
  const board = await open("");
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
    `${on.tag} 6: a count is drawn only above 0 beyond the head: the work tabs${pad ? ", the bar's Machines" : ""} and Configure's rows, their number the count`,
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
      artifact: "",
      fleet,
      heard: sim.heard,
      kit,
      launched: sim.heard.length,
      pins: 0,
      session,
      shots,
      tag: label,
      udid: sim.sim.udid,
    };
    const launch = async (extra: string) => {
      on.launched = on.heard.length;
      await sh(
        `xcrun simctl launch --terminate-running-process ${on.udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe ${extra} >/dev/null`
      );
    };
    await sh(`xcrun simctl ui ${on.udid} appearance light`);
    await countsStep(on, pad, fleet.base);
    await launch("");
    await Bun.sleep(4000);
    const made = await call(fleet, session, CREATE, {
      kind: "page",
      name: NAME,
      html: PAGE,
    });
    on.artifact = made.match(ANSWERED_ID)?.[1] ?? "";
    console.log(`  ${label} artifact_create: ${made.slice(0, 240)}`);
    // The phone's drawer has no Expand.
    const wanted = pad ? [...WANTED, "expand"] : WANTED;
    const first = pad ? "card" : "drawer";
    const room = await readAt(on, first, wanted);
    if (!pad) {
      await edgeStep(on);
    }
    if (room) {
      await menusStep(on, first, room);
    }
    if (pad) {
      await reloadStep(on);
    }
    await pinsStep(on, first, 12, wanted);
    await pinsStep(on, first, 120, wanted);
    if (!pad) {
      return;
    }
    const widths: [string, string][] = [
      ["split-floor", `-cawco.preview.width.${session} 0.3`],
      ["expanded", `-cawco.preview.expanded.${session} 1`],
    ];
    for (const [read, extra] of widths) {
      // biome-ignore lint/performance/noAwaitInLoops: one launch at a time, on the one simulator
      await launch(extra);
      const at = await readAt(on, read, wanted);
      if (at && read === "split-floor") {
        await menusStep(on, read, at);
      }
    }
    console.log(`  captures: ${shots}`);
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
