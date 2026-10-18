/**
 * iOS: a project's custom views stand in the app's project strip after
 * Board, Table and Pipeline, kept then drafted, a draft tagged `draft` as
 * the web tags it; under 640pt they join the ⋯ menu's view list. A view
 * opens in a web view drawing the dashboard's chromeless route, its data
 * live from the hub; a draft's Keep and Discard answer in place; a task
 * tapped in a view opens the app's own task sheet (tsk-11, PRD §5.2).
 *
 * A scratch hub (CAWCO_NO_MDNS=1) and the built dashboard against it, named
 * in the hub's `/health` (`dashboard`), with one project whose folder is on
 * the hub: three tasks, one kept view (`probe-week`: the tasks' count and a
 * table of them) and two drafts (`probe-draft`, kept here; `probe-scrap`,
 * discarded here). Then the app, built for the simulator, on an iPhone 16
 * Pro and an iPad Pro 11-inch (M4), iOS 18.5, each in a mac-slot.sh slot of
 * its own (booted headless, deleted at the end), launched onto the project
 * with `-views-probe`; every step is a real touch (axe) at the point the
 * app's log names, and every reading is the app's log (ViewsProbe), the
 * page's words read through the app's web view, and the hub's own list:
 *
 *  a. the strip lists Board, Table, Pipeline, Probe week, then Probe draft
 *     and Probe scrap tagged draft; on the iPhone the ⋯ menu's view list
 *     says the same;
 *  b. Probe week opens: the page is its route, and its words are the hub's
 *     live data (every task's title, the count of three);
 *  c. Probe draft opens under its bar ("Caw drafted the Probe draft view",
 *     Keep, Discard); Keep: the bar goes, the tab loses its tag, the view
 *     stays on screen, and the hub lists it kept;
 *  d. Probe scrap opens under its bar; Discard: its tab goes, the board
 *     comes back, and the hub lists it no more;
 *  e. a task tapped in Probe week opens the app's task sheet on that task.
 *
 * Then the Projects tabs (prd-audit B3), on a second project seeded with the
 * decision pages the dashboard's preview uses (scripts/decisions-preview
 * seed: landing 5 of 12 picked, pricing decided, onboarding 2 of 5 picked),
 * each written by a session of its own on a scratch machine:
 *
 *  decisions. The strip's Decisions tab counts the pages waiting on picks as
 *     the hub lists them; its grid's tiles say each page's figure ("5 of 12
 *     picked"); a tile opens its page in place, live, with I'm done picking;
 *     I'm done picking reaches the page's writer session (the hub answers
 *     `to: session`), and the hub then holds the page as sent.
 *  routines. The Routines tab stands its three blocks in their order, a
 *     seeded routine in its ledger with the hub's runs; Run now from its ⋯
 *     makes a run row, the hub's newest run.
 *  made. With a task that made a note and a post, the strip carries Made;
 *     its tile draws the note as words and the post as a post card, and
 *     its head opens the task.
 *  ask. Ask Caw for a view (the strip's, or the ⋯'s on a phone) opens his
 *     Composer; the words typed and sent go to him as a view request, in a
 *     thread the hub then holds.
 *
 * On the iPhone each view is chosen from the ⋯ menu (the strip is wider
 * than the screen), on the iPad from the strip.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-views
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { seedDecisions } from "../../decisions-preview/seed";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];
const PROJECT = "Views probe";
const TITLES = ["Probe alpha", "Probe beta", "Probe gamma"];
const KEPT = "probe-week";
const KEEP = "probe-draft";
const SCRAP = "probe-scrap";
/** The kept view: the tasks' count and a table of them, each title a link to its task. */
const WEEK = `root = Column([title, figures, table])
tasks = Query("tasks", {}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("Probe week", "title")
figures = Row([StatTile("All tasks", stages.total), StatTile("Waiting on you", stages.byKind.you, "attn")])
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])`;
const draftOf = (words: string) => `root = Column([title, table])
tasks = Query("tasks", {}, {rows: []})
title = Text("${words}", "title")
table = Table(tasks.rows, [{label: "Task", field: "title"}])`;
/** The strip as every reading of it starts: the fixed tabs, the kept view, the drafts. */
const WANTED_STRIP =
  "Board,Table,Pipeline,Routines,Decisions,Probe week,Probe draft+draft,Probe scrap+draft";
const WANTED_MENU =
  "Board*,Table,Pipeline,Routines,Decisions,Probe week,Probe draft+draft,Probe scrap+draft";
/** The tab's own items before the views: how many the strip must list before a reading counts. */
const FIXED_TABS = 5;
const DECISIONS_PROJECT = "Decisions probe";
/** The page each device sends on: one still picked on, so each device's send is its own. */
const SENDS_ON: Record<string, string> = {
  iPhone: "landing",
  iPad: "onboarding",
};
const DECISIONS_PANE = /decisions pane what=(\S+) waiting=(\d+) tiles=(.*)$/;
const DECISIONS_PAGE =
  /decisions page name=(\S+) state=(\S*) figure=(.*?) pill=(.*?) body=(\S+) act=(.*)$/;
const DECISIONS_SENT = /decisions sent (\S+) to=(\S+)/;
const TAB_COUNT = /#(\d+)$/;
/** The count tile over the tasks: the `stages` tool's total, as the page's words read. */
const ALL_THREE = /All tasks\s*\|?\s*3/;
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const POINT = /^(\d+),(\d+)$/;
const STRIP_LINE =
  /views strip chosen=(.*?) phone=(true|false) room=(-?\d+)-(-?\d+) items=(\S.*?)(?: ask=(\d+),(\d+))?(?: more=(\d+),(\d+) menu=(.*))?$/;
/** How far inside the strip's room a tab's centre must stand for a touch to land on it. */
const ROOM_MARGIN = 24;
const PAGE_LINE = /views page name=(\S+) href=(\S*) task=(\S+) text=(.*)$/;
const PANE_LINE = /views pane name=(\S+) draft=(true|false) bar=(.*)$/;
const OPEN_TASK = /views open-task (\S+)/;
/** `<links>@<x>,<y>`: how many task links the page has, and the first one's centre in the window. */
const LINK = /^(\d+)@(\d+),(\d+)$/;

interface Listed {
  draft: boolean;
  name: string;
}

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  label?: string;
}

/** `views strip …`: the chosen tab, whether it is a phone, each item's words and centre, the menu's list. */
interface Strip {
  /** Ask Caw for a view's centre in the window, wider than a phone while Caw can start. */
  ask?: [number, number];
  chosen: string;
  items: {
    at: [number, number];
    /** The count after its name (Decisions: the pages waiting on picks); null with none. */
    count: number | null;
    draft: boolean;
    label: string;
  }[];
  menu: string[];
  /** ⋯'s centre in the window, on a phone. */
  more?: [number, number];
  phone: boolean;
  /** The strip's scroller in the window, left and right: a tab outside it is scrolled out of reach. */
  room: [number, number];
}

interface Page {
  href: string;
  task: string;
  text: string;
}

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

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

function stripOf(line: string): Strip | undefined {
  const match = STRIP_LINE.exec(line);
  if (!match) {
    return;
  }
  const items = (match[5] ?? "").split(";").map((part) => {
    const [said = "", at = "0,0"] = part.split("@");
    const [x = 0, y = 0] = at.split(",").map(Number);
    // `<label>[+draft][#<count>]`: a draft's tag, or the count after the name (Decisions).
    const counted = TAB_COUNT.exec(said);
    const words = counted ? said.slice(0, counted.index) : said;
    return {
      label: words.replace("+draft", ""),
      draft: words.endsWith("+draft"),
      count: counted ? Number(counted[1]) : null,
      at: [x, y] as [number, number],
    };
  });
  return {
    chosen: match[1] ?? "",
    phone: match[2] === "true",
    room: [Number(match[3]), Number(match[4])],
    items,
    ask: match[6] ? [Number(match[6]), Number(match[7])] : undefined,
    more: match[8] ? [Number(match[8]), Number(match[9])] : undefined,
    menu: match[10] ? match[10].split(";") : [],
  };
}

const labelsOf = (strip: Strip | undefined) =>
  strip?.items
    .map((item) => `${item.label}${item.draft ? "+draft" : ""}`)
    .join(",") ?? "?";

const centre = (box: NonNullable<Node["frame"]>): [number, number] => [
  Math.round(box.x + box.width / 2),
  Math.round(box.y + box.height / 2),
];

/** What every step on one simulator reads and does. */
interface Device {
  /** An open menu's row, by its words. */
  /** A control by its words, once it holds still: a menu's row, or with `narrow` a button or a field. */
  choose: (label: string, narrow?: boolean) => Promise<void>;
  /** The app's ViewsProbe lines so far. */
  heard: string[];
  /** The newest line since `since` that `read` makes something of, waited for. */
  next: <T>(
    what: string,
    since: number,
    read: (line: string) => T | undefined,
    ms?: number
  ) => Promise<T>;
  /** A view chosen as a person does here: on the iPhone from ⋯, on the iPad from the strip. */
  pick: (label: string) => Promise<void>;
  /** The app launched again, onto another project. */
  relaunch: (projectId: string) => Promise<void>;
  tag: string;
  tap: (point: [number, number]) => Promise<string>;
  /** Words typed where the caret is. */
  type: (text: string) => Promise<void>;
}

/** What the steps know of the project. */
interface Project {
  id: string;
  listed: () => Promise<Listed[]>;
  tasks: { id: string; title: string }[];
}

const stripSince = (
  device: Device,
  since: number,
  accept: (strip: Strip) => boolean,
  what: string
) =>
  device.next(what, since, (line) => {
    const strip = stripOf(line);
    return strip && accept(strip) ? strip : undefined;
  });

const pageSince = (
  device: Device,
  name: string,
  since: number,
  accept: (text: string) => boolean,
  what: string
) =>
  device.next<Page>(
    what,
    since,
    (line) => {
      const match = PAGE_LINE.exec(line);
      return match && match[1] === name && accept(match[4] ?? "")
        ? { href: match[2] ?? "", task: match[3] ?? "", text: match[4] ?? "" }
        : undefined;
    },
    90_000
  );

const paneSince = (
  device: Device,
  name: string,
  since: number,
  draft: boolean
) =>
  device.next(`${name}'s pane, draft ${draft}`, since, (line) => {
    const match = PANE_LINE.exec(line);
    return match && match[1] === name && (match[2] === "true") === draft
      ? (match[3] ?? "")
      : undefined;
  });

/** Keep's or Discard's centre in the bar's line. */
const pointIn = (bar: string, what: "keep" | "discard"): [number, number] => {
  const part =
    bar
      .split("|")
      .find((one) => one.startsWith(`${what}=`))
      ?.slice(what.length + 1) ?? "";
  const match = POINT.exec(part);
  if (!match) {
    throw new Error(`no ${what} in the bar: ${bar}`);
  }
  return [Number(match[1]), Number(match[2])];
};

const hubSays = (views: Listed[]) =>
  views.map((view) => `${view.name}${view.draft ? "+draft" : ""}`).join(",");

// ── a. the strip, and on the iPhone the ⋯ menu ───────────────────────────
async function theStrip(kit: Kit, device: Device): Promise<boolean> {
  const first = await stripSince(
    device,
    0,
    (strip) => strip.items.length >= FIXED_TABS + 3,
    "the strip lists the views"
  ).catch(() => undefined);
  kit.check(
    `${device.tag} a: the strip lists Board, Table, Pipeline, the kept view, then the drafts tagged draft`,
    first !== undefined &&
      labelsOf(first) === WANTED_STRIP &&
      first.chosen === "Board",
    first
      ? `${labelsOf(first)}; chosen ${first.chosen}`
      : device.heard.slice(-6).join(" / ")
  );
  if (!first) {
    return false;
  }
  if (device.tag === "iPhone") {
    kit.check(
      "iPhone a: under 640pt the ⋯ menu lists the same views, the board checked, the drafts tagged",
      first.phone && first.menu.join(",") === WANTED_MENU,
      `phone ${first.phone}; menu ${first.menu.join(",")}`
    );
  } else {
    kit.check(
      "iPad a: at its width the strip is not the phone's",
      !first.phone,
      `phone ${first.phone}`
    );
  }
  return true;
}

// ── b. the kept view, with the hub's live data ───────────────────────────
async function theKeptView(
  kit: Kit,
  device: Device,
  project: Project
): Promise<void> {
  const since = device.heard.length;
  await device.pick("Probe week");
  const week = await pageSince(
    device,
    KEPT,
    since,
    (text) =>
      TITLES.every((title) => text.includes(title)) && ALL_THREE.test(text),
    "Probe week's page with every task and the count"
  ).catch(() => undefined);
  const bar = await paneSince(device, KEPT, since, false).catch(
    () => undefined
  );
  kit.check(
    `${device.tag} b: the kept view opens on its route with the hub's live data, no draft bar`,
    week !== undefined &&
      week.href === `/project/${project.id}/view/${KEPT}` &&
      bar === "none",
    week
      ? `${week.href}: “${week.text.slice(0, 200)}”; bar ${bar}`
      : device.heard.slice(-6).join(" / ")
  );
}

// ── c. Keep, in place ────────────────────────────────────────────────────
async function keepInPlace(
  kit: Kit,
  device: Device,
  project: Project
): Promise<void> {
  let since = device.heard.length;
  await device.pick("Probe draft");
  const bar = await paneSince(device, KEEP, since, true).catch(() => undefined);
  const page = await pageSince(
    device,
    KEEP,
    since,
    (text) => text.includes("Probe draft"),
    "Probe draft's page"
  ).catch(() => undefined);
  if (!(
    kit.check(
      `${device.tag} c: a draft opens under its bar, its words and Keep and Discard`,
      bar?.startsWith("Caw drafted the Probe draft view|keep=") === true &&
        page !== undefined,
      `bar ${bar}; page “${page?.text.slice(0, 120)}”`
    ) && bar
  )) {
    return;
  }
  since = device.heard.length;
  await device.tap(pointIn(bar, "keep"));
  const kept = await device
    .next("Keep answered", since, (line) =>
      line.includes(`views keep ${KEEP}`) ? line : undefined
    )
    .catch(() => undefined);
  const after = await paneSince(device, KEEP, since, false).catch(
    () => undefined
  );
  const strip = await stripSince(
    device,
    since,
    (one) =>
      one.items.some((item) => item.label === "Probe draft" && !item.draft),
    "the strip after Keep"
  ).catch(() => undefined);
  const hub = await project.listed();
  kit.check(
    `${device.tag} c: Keep answers in place: the bar goes, the tab loses its tag, the view stays, the hub keeps it`,
    kept?.endsWith("ok") === true &&
      after === "none" &&
      strip?.chosen === "Probe draft" &&
      hub.some((view) => view.name === KEEP && !view.draft),
    `${kept}; bar ${after}; strip ${labelsOf(strip)} chosen ${strip?.chosen}; hub ${hubSays(hub)}`
  );
}

// ── d. Discard, in place ─────────────────────────────────────────────────
async function discardInPlace(
  kit: Kit,
  device: Device,
  project: Project
): Promise<void> {
  let since = device.heard.length;
  await device.pick("Probe scrap");
  const bar = await paneSince(device, SCRAP, since, true).catch(
    () => undefined
  );
  if (!(
    kit.check(
      `${device.tag} d: the other draft opens under its bar`,
      bar?.startsWith("Caw drafted the Probe scrap view|") === true,
      `bar ${bar}`
    ) && bar
  )) {
    return;
  }
  since = device.heard.length;
  await device.tap(pointIn(bar, "discard"));
  const discarded = await device
    .next("Discard answered", since, (line) =>
      line.includes(`views discard ${SCRAP}`) ? line : undefined
    )
    .catch(() => undefined);
  const strip = await stripSince(
    device,
    since,
    (one) => !one.items.some((item) => item.label === "Probe scrap"),
    "the strip after Discard"
  ).catch(() => undefined);
  const hub = await project.listed();
  kit.check(
    `${device.tag} d: Discard answers in place: the tab goes, the board comes back, the hub lists it no more`,
    discarded?.endsWith("ok") === true &&
      strip?.chosen === "Board" &&
      !hub.some((view) => view.name === SCRAP),
    `${discarded}; strip ${labelsOf(strip)} chosen ${strip?.chosen}; hub ${hubSays(hub)}`
  );
}

// ── e. a task in a view opens the app's sheet ────────────────────────────
async function taskOpens(
  kit: Kit,
  device: Device,
  project: Project
): Promise<void> {
  let since = device.heard.length;
  await device.pick("Probe week");
  const page = await pageSince(
    device,
    KEPT,
    since,
    (text) => TITLES.every((title) => text.includes(title)),
    "Probe week's page again"
  ).catch(() => undefined);
  const link = page ? LINK.exec(page.task) : null;
  since = device.heard.length;
  if (link) {
    await device.tap([Number(link[2]), Number(link[3])]);
  }
  const opened = await device
    .next("a task opened", since, (line) => OPEN_TASK.exec(line)?.[1])
    .catch(() => undefined);
  kit.check(
    `${device.tag} e: a task tapped in the view opens the app's task sheet on it`,
    opened !== undefined && project.tasks.some((task) => task.id === opened),
    `link ${page?.task}; opened ${opened}`
  );
}

/** The app on a simulator of its own, launched onto the project: what the steps drive it with. */
async function launch(
  tag: string,
  udid: string,
  app: string,
  hub: string,
  projectId: string
): Promise<{ device: Device; stream: Subprocess }> {
  await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const heard: string[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "ViewsProbe"'`,
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

  const tap = (point: [number, number]) =>
    sh(`${AXE} tap -x ${point[0]} -y ${point[1]} --udid ${udid}`);
  /** What axe last said when it would not read the screen. */
  let axeRefused = "none";
  const tree = async (): Promise<Node[]> => {
    const out: Node[] = [];
    const walk = (node: Record<string, unknown>) => {
      out.push({
        label: (node.AXLabel ?? node.label) as string | undefined,
        frame: node.frame as Node["frame"],
      });
      for (const kid of (node.children as
        Record<string, unknown>[] | undefined) ?? []) {
        walk(kid);
      }
    };
    const said = await sh(`${AXE} describe-ui --udid ${udid}`).catch(
      (error: unknown) => {
        axeRefused = String(error).slice(0, 300);
        throw error;
      }
    );
    const tops = JSON.parse(said) as Record<string, unknown>[];
    for (const top of tops) {
      walk(top);
    }
    return out;
  };
  const next = async <T>(
    what: string,
    since: number,
    read: (line: string) => T | undefined,
    ms = 60_000
  ): Promise<T> =>
    (await until<T | undefined>(
      `${tag}: ${what}`,
      () => {
        for (const line of heard.slice(since).reverse()) {
          const found = read(line);
          if (found !== undefined) {
            return found;
          }
        }
      },
      (found) => found !== undefined,
      ms
    )) as T;
  /** The tab, swiped into the strip's room as a finger brings it, then tapped. */
  const tapInStrip = async (label: string) => {
    for (let swipes = 0; swipes < 4; swipes += 1) {
      const since = heard.length;
      // biome-ignore lint/performance/noAwaitInLoops: each swipe reads where the last one left the strip
      const strip = await next("a strip line", 0, stripOf);
      const item = strip.items.find((one) => one.label === label);
      if (!item) {
        throw new Error(`${tag}: no ${label} in the strip`);
      }
      const [left, right] = strip.room;
      const [x, y] = item.at;
      if (x >= left + ROOM_MARGIN && x <= right - ROOM_MARGIN) {
        await tap(item.at);
        return;
      }
      // Past the right edge the strip is pulled left, past the left edge right.
      const [from, to] =
        x > right ? [right - 16, left + 16] : [left + 16, right - 16];
      await sh(
        `${AXE} swipe --start-x ${from} --start-y ${y} --end-x ${to} --end-y ${y} --duration 0.5 --udid ${udid}`
      );
      // A strip the swipe left where it was says nothing new: the next pass reads it again.
      await next(
        "the strip at rest after a swipe",
        since,
        stripOf,
        10_000
      ).catch(() => undefined);
    }
    throw new Error(`${tag}: ${label} never came into the strip's room`);
  };
  const pick = async (label: string) => {
    const strip = await next("a strip line", 0, stripOf);
    if (!strip.phone) {
      await tapInStrip(label);
      return;
    }
    if (!strip.more) {
      throw new Error(`${tag}: the strip line names no ⋯`);
    }
    await tap(strip.more);
    // The menu's row, not the strip's tab of the same name: a row spans the menu's width.
    const inStrip = new Set(strip.items.map((item) => item.at.join(",")));
    const entry = await until<Node | undefined>(
      `${tag}: ${label} in the ⋯ menu`,
      async () =>
        (await tree()).find(
          (node) =>
            node.frame !== undefined &&
            (node.label === label ||
              node.label?.startsWith(`${label},`) === true) &&
            !inStrip.has(centre(node.frame).join(",")) &&
            node.frame.width > 120
        ),
      Boolean,
      15_000
    ).catch((error: unknown) => {
      throw new Error(`${error}; axe's last refusal: ${axeRefused}`);
    });
    await tap(centre(entry?.frame as NonNullable<Node["frame"]>));
  };

  const relaunch = async (project: string) => {
    await until(
      `${tag}: the app launched onto ${project}`,
      () =>
        sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -open-project ${project} -views-probe >/dev/null`
        ).then(() => true),
      Boolean,
      60_000
    );
  };
  /**
   * A control by its words, once it holds still: by default an open menu's
   * row, which spans the menu's width; `narrow` for a button or a field.
   */
  const choose = async (label: string, narrow = false) => {
    /** What the screen last named, for a row that never came. */
    let seen: string[] = [];
    /** Where the row stood at the last read: a menu still opening moves it, and takes no tap. */
    let was = "";
    const entry = await until<Node | undefined>(
      `${tag}: ${label} in the open menu, at rest`,
      async () => {
        const nodes = await tree();
        seen = nodes.flatMap((node) =>
          node.label && node.frame
            ? [
                `${node.label}@${centre(node.frame).join(",")}/${node.frame.width}`,
              ]
            : []
        );
        const found = nodes.find(
          (node) =>
            node.frame !== undefined &&
            node.label === label &&
            (narrow || node.frame.width > 120)
        );
        const at = found?.frame ? JSON.stringify(found.frame) : "";
        const still = at !== "" && at === was;
        was = at;
        return still ? found : undefined;
      },
      Boolean,
      15_000
    ).catch((error: unknown) => {
      throw new Error(
        `${error}; axe's last refusal: ${axeRefused}; on screen: ${seen.slice(-30).join(" | ")}`
      );
    });
    await tap(centre(entry?.frame as NonNullable<Node["frame"]>));
  };
  /** Words typed where the caret is. */
  const type = async (text: string) => {
    await sh(`${AXE} type ${JSON.stringify(text)} --udid ${udid}`);
  };

  await relaunch(projectId);
  return {
    device: { tag, heard, next, pick, relaunch, tap, choose, type },
    stream,
  };
}

// ── routines: the tab's three blocks, a routine, Run now ─────────────────
const ROUTINE = "Probe triage";
const ROUTINES_PANE =
  /routines pane routines=(.*?) sources=(\d+) actions=(\d+)$/;
const BLOCKS_PAGE = /blocks page=(\S+) blocks=(.*)$/;

interface RoutineRow {
  last: string;
  menu: [number, number] | null;
  name: string;
  on: boolean;
  runs: number;
}

const routinesOf = (said: string): RoutineRow[] =>
  said
    .split(";")
    .filter(Boolean)
    .map((part) => {
      const [name = "", on = "", runs = "", last = ""] = part.split("|");
      const [lastState = "", at = "none"] = last
        .replace("last=", "")
        .split("@");
      const point = POINT.exec(at);
      return {
        name,
        on: on === "on",
        runs: Number(runs.replace("runs=", "")),
        last: lastState,
        menu: point ? [Number(point[1]), Number(point[2])] : null,
      };
    });

interface HubRoutine {
  id: string;
  name: string;
  runs: { id: string; state: string }[];
}

// ── made: a task's outputs, drawn small, its head opening it ─────────────
const MADE_TITLE = "Probe launch kit";
const MADE_NOTE = "notes.md";
const MADE_POST = "hero.post.json";
const MADE_PANE = /made pane columns=(\d+) tiles=(.*)$/;

// ── ask: Ask Caw for a view files a view request ─────────────────────────
const ASKED = /views asked (\S+)/;

async function askViewLeg(
  kit: Kit,
  device: Device,
  projectId: string,
  read: <T>(path: string) => Promise<T>
): Promise<void> {
  const words = `A view of the routines, asked from the ${device.tag}`;
  const strip = await device
    .next("a strip line", 0, stripOf)
    .catch(() => undefined);
  let since = device.heard.length;
  // From the strip wider than a phone; from the head's ⋯ on one.
  if (strip?.ask) {
    await device.tap(strip.ask);
  } else if (strip?.more) {
    await device.tap(strip.more);
    await device.choose("Ask Caw for a view");
  }
  const opened = await device
    .next("the ask's popover", since, (line) =>
      line.includes("views ask open") ? line : undefined
    )
    .catch(() => undefined);
  if (
    !kit.check(
      `${device.tag} ask: Ask Caw for a view opens his Composer${strip?.ask ? " from the strip" : " from the ⋯"}`,
      opened !== undefined,
      opened ?? `strip ask ${strip?.ask}, more ${strip?.more}`
    )
  ) {
    return;
  }
  await device.choose("Message Caw", true);
  await device.type(words);
  since = device.heard.length;
  await device.choose("Send message", true);
  const thread = await device
    .next(
      "the hub's thread for the ask",
      since,
      (line) => ASKED.exec(line)?.[1]
    )
    .catch(() => undefined);
  const threads = await read<{ id: string; title?: string | null }[]>(
    `/api/projects/${projectId}/threads`
  ).catch(() => []);
  kit.check(
    `${device.tag} ask: the words go to Caw as a view request, in a thread the hub holds`,
    thread !== undefined && threads.some((one) => one.id === thread),
    `thread ${thread}; hub threads ${threads.map((one) => one.id).join(",")}`
  );
}

async function madeLeg(
  kit: Kit,
  device: Device,
  taskId: string
): Promise<void> {
  let since = device.heard.length;
  await device.pick("Made");
  const tile = await device
    .next("the Made tile with both outputs drawn", since, (line) => {
      const match = MADE_PANE.exec(line);
      const found = (match?.[2] ?? "")
        .split(";")
        .find((part) => part.startsWith(`${taskId}=`));
      if (!found) {
        return;
      }
      // The head's centre follows the last `@` (a post's account carries one too).
      const said = found.slice(taskId.length + 1);
      const split = said.lastIndexOf("@");
      const drawn = said.slice(0, split);
      const point = POINT.exec(said.slice(split + 1));
      return drawn.includes(`${MADE_NOTE}:markdown:`) &&
        drawn.includes(`${MADE_POST}:post:@cawco`) &&
        point
        ? {
            drawn,
            head: [Number(point[1]), Number(point[2])] as [number, number],
          }
        : undefined;
    })
    .catch(() => undefined);
  kit.check(
    `${device.tag} made: the Made tab shows the task's tile, its note drawn as words and its post as a post card`,
    tile !== undefined,
    tile ? tile.drawn : device.heard.slice(-4).join(" / ")
  );
  if (!tile) {
    return;
  }
  since = device.heard.length;
  await device.tap(tile.head);
  const opened = await device
    .next(
      "the task opened from its tile",
      since,
      (line) => OPEN_TASK.exec(line)?.[1]
    )
    .catch(() => undefined);
  kit.check(
    `${device.tag} made: the tile's head opens its task`,
    opened === taskId,
    `opened ${opened}`
  );
}

async function routinesLeg(
  kit: Kit,
  device: Device,
  projectId: string,
  read: <T>(path: string) => Promise<T>
): Promise<void> {
  const listed = async () =>
    (
      await read<HubRoutine[]>(
        `/api/routines?projectId=${encodeURIComponent(projectId)}`
      )
    ).find((one) => one.name === ROUTINE);
  const before = await listed();
  let since = device.heard.length;
  await device.pick("Routines");
  const shown = await device
    .next("the Routines page with the seeded routine", since, (line) => {
      const match = ROUTINES_PANE.exec(line);
      const row = match
        ? routinesOf(match[1] ?? "").find((one) => one.name === ROUTINE)
        : undefined;
      return row?.menu ? row : undefined;
    })
    .catch(() => undefined);
  const page = await device
    .next("the Routines page's blocks", since, (line) => {
      const match = BLOCKS_PAGE.exec(line);
      return match?.[1] === "routines" ? (match[2] ?? "") : undefined;
    })
    .catch(() => undefined);
  const blockIds = (page ?? "")
    .split(";")
    .map((part) => part.split("/")[0])
    .join(",");
  kit.check(
    `${device.tag} routines: the tab's three blocks stand in their order, the seeded routine in its ledger with the hub's runs`,
    shown !== undefined &&
      blockIds === "routines,sources,actions" &&
      shown.on &&
      shown.runs === (before?.runs.length ?? -1),
    `blocks ${blockIds}; row ${shown ? `${shown.name} on=${shown.on} runs=${shown.runs} last=${shown.last}` : device.heard.slice(-4).join(" / ")}; hub runs ${before?.runs.length}`
  );
  if (!shown?.menu) {
    return;
  }
  since = device.heard.length;
  await device.tap(shown.menu);
  await device.choose("Run now");
  const after = await device
    .next("the routine's new run", since, (line) => {
      const match = ROUTINES_PANE.exec(line);
      const row = match
        ? routinesOf(match[1] ?? "").find((one) => one.name === ROUTINE)
        : undefined;
      return row && row.runs > shown.runs ? row : undefined;
    })
    .catch(() => undefined);
  const hub = await listed();
  kit.check(
    `${device.tag} routines: Run now makes a run row, the hub's newest run`,
    after !== undefined &&
      hub !== undefined &&
      hub.runs.length === after.runs &&
      hub.runs[0]?.id !== before?.runs[0]?.id,
    `app runs ${after?.runs} last=${after?.last}; hub runs ${hub?.runs.length}, newest ${hub?.runs[0]?.id} (${hub?.runs[0]?.state}), before ${before?.runs[0]?.id}`
  );
}

// ── decisions: the tab, a tile, its page, I'm done picking ───────────────
interface Tile {
  at: [number, number] | null;
  figure: string;
  name: string;
  state: string;
}

const tilesOf = (said: string): Tile[] =>
  said
    .split(";")
    .filter(Boolean)
    .map((part) => {
      const [named = "", rest = ""] = part.split("=", 2) as [string, string];
      const [words = "", at = "none"] = rest.split("@");
      const [figure = "", state = ""] = words.split("|");
      const point = POINT.exec(at);
      return {
        name: named,
        figure,
        state,
        at: point ? [Number(point[1]), Number(point[2])] : null,
      };
    });

interface DecisionsHub {
  pages: { name: string; picked: number; cards: number; state: string }[];
}

async function decisionsLeg(
  kit: Kit,
  device: Device,
  projectId: string,
  read: <T>(path: string) => Promise<T>
): Promise<void> {
  const page = SENDS_ON[device.tag] ?? "landing";
  let since = device.heard.length;
  await device.relaunch(projectId);
  await stripSince(
    device,
    since,
    (one) => one.items.length >= FIXED_TABS,
    "the decisions project's strip"
  ).catch(() => undefined);
  const listed = await read<DecisionsHub>(
    `/api/projects/${projectId}/decisions`
  );
  const waiting = listed.pages.filter((one) => one.state === "picking").length;
  since = device.heard.length;
  await device.pick("Decisions");
  const pane = await device
    .next("the Decisions grid with its tiles", since, (line) => {
      const match = DECISIONS_PANE.exec(line);
      const tiles = match ? tilesOf(match[3] ?? "") : [];
      return match?.[1] === "grid" &&
        tiles.length === listed.pages.length &&
        tiles.every((each) => each.at)
        ? { waiting: Number(match[2]), tiles }
        : undefined;
    })
    .catch(() => undefined);
  const strip = await device
    .next("the strip at Decisions", 0, (line) => {
      const found = stripOf(line);
      return found?.chosen === "Decisions" ? found : undefined;
    })
    .catch(() => undefined);
  const tab = strip?.items.find((item) => item.label === "Decisions");
  const landing = pane?.tiles.find((each) => each.name === "landing");
  const hubLanding = listed.pages.find((one) => one.name === "landing");
  kit.check(
    `${device.tag} decisions: the tab counts the ${waiting} pages waiting on picks, and the tiles say the hub's figures ("5 of 12 picked")`,
    pane !== undefined &&
      pane.waiting === waiting &&
      tab !== undefined &&
      tab.count === (waiting === 0 ? null : waiting) &&
      landing?.figure ===
        `${hubLanding?.picked} of ${hubLanding?.cards} picked` &&
      landing.figure === "5 of 12 picked",
    `pane ${pane ? `waiting ${pane.waiting}, ${pane.tiles.map((each) => `${each.name}=${each.figure}|${each.state}`).join("; ")}` : device.heard.slice(-4).join(" / ")}; strip ${tab ? `${tab.label} ${tab.count ?? "no count"}` : "no Decisions"}; hub waiting ${waiting}`
  );
  const tile = pane?.tiles.find((one) => one.name === page);
  if (!tile?.at) {
    return;
  }
  since = device.heard.length;
  await device.tap(tile.at);
  const opened = await device
    .next(`${page}'s page, live, with I'm done picking`, since, (line) => {
      const match = DECISIONS_PAGE.exec(line);
      return match?.[1] === page &&
        match[2] === "picking" &&
        match[5] === "live" &&
        match[6]?.startsWith("I'm done picking@")
        ? { body: match[5] ?? "", act: match[6] ?? "" }
        : undefined;
    })
    .catch(() => undefined);
  const point = opened ? POINT.exec(opened.act.split("@")[1] ?? "") : null;
  if (!(
    kit.check(
      `${device.tag} decisions: a tile opens its page in place, live from its session's preview, with I'm done picking`,
      opened !== undefined && point !== null,
      opened
        ? `body ${opened.body}, act ${opened.act}`
        : device.heard.slice(-4).join(" / ")
    ) && point
  )) {
    return;
  }
  since = device.heard.length;
  await device.tap([Number(point[1]), Number(point[2])]);
  const sent = await device
    .next("the hub's answer to I'm done picking", since, (line) => {
      const match = DECISIONS_SENT.exec(line);
      return match?.[1] === page ? match[2] : undefined;
    })
    .catch(() => undefined);
  const after = await device
    .next(`${page}'s page, sent`, since, (line) => {
      const match = DECISIONS_PAGE.exec(line);
      return match?.[1] === page && match[2] === "sent"
        ? (match[4] ?? "")
        : undefined;
    })
    .catch(() => undefined);
  const hubPage = await read<{ state: string; sentAt: string | null }>(
    `/api/projects/${projectId}/decisions/${page}`
  );
  kit.check(
    `${device.tag} decisions: I'm done picking reaches ${page}'s writer session, and the hub holds the page as sent`,
    sent === "session" &&
      after !== undefined &&
      hubPage.state === "sent" &&
      hubPage.sentAt !== null,
    `heard by ${sent}; page pill ${after}; hub ${hubPage.state}, sent at ${hubPage.sentAt}`
  );
}

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = appPath();
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  // A machine for the decision pages' writer sessions.
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  // The hub names the dashboard in `/health` as it starts: served first, then the hub again with its address.
  const dashboard = await fleet.dashboard();
  fleet.env.CAWCO_DASHBOARD_URL = dashboard;
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const health = (await (await fetch(`${fleet.base}/health`)).json()) as {
    dashboard?: string;
  };
  if (
    !kit.check(
      "the hub names the dashboard",
      health.dashboard === dashboard,
      `${health.dashboard} vs ${dashboard}`
    )
  ) {
    return;
  }

  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // The decision pages, each published by a session of its own (scripts/decisions-preview).
  const decisions = await seedDecisions(fleet, {
    cwd: fleet.repo,
    machineId: MACHINE,
    name: DECISIONS_PROJECT,
  });
  // A routine on the same project: Caw is off there, so each run is skipped, never a session.
  await fleet.api("/api/routines", {
    projectId: decisions.projectId,
    name: ROUTINE,
    cron: "0 9 * * 1-5",
    timeZone: "UTC",
    target: "lead",
    prompt: "Triage the inbox.",
    keep: true,
  });
  // A task that made something: a note and a post, where the hub serves outputs from.
  const madeTask = await fleet.api<{ id: string }>(
    `/api/projects/${decisions.projectId}/tasks`,
    { title: MADE_TITLE, outputs: [MADE_NOTE, MADE_POST] }
  );
  for (const [name, content] of [
    [MADE_NOTE, "# Launch notes\n\nThe hero leads with the fleet at a glance."],
    [
      MADE_POST,
      JSON.stringify({
        kind: "x-post",
        account: "@cawco",
        text: "The fleet at a glance.",
      }),
    ],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each file is a commit in the project's folder
    const wrote = await fetch(
      `${fleet.base}/api/projects/${decisions.projectId}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: `assets/${madeTask.id}/${name}`,
          content,
        }),
      }
    );
    if (!wrote.ok) {
      throw new Error(`writing ${name}: ${wrote.status} ${await wrote.text()}`);
    }
  }

  const made = await fleet.api<{ id: string }>("/api/projects", {
    name: PROJECT,
    caw: false,
  });
  const at = `/api/projects/${made.id}`;
  const project: Project = {
    id: made.id,
    listed: () => fleet.api<Listed[]>(`${at}/views`),
    tasks: await Promise.all(
      TITLES.map((title) =>
        fleet.api<{ id: string; title: string }>(`${at}/tasks`, { title })
      )
    ),
  };
  const put = async (path: string, content: string) => {
    const response = await fetch(`${fleet.base}${at}/folder/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
    if (!response.ok) {
      throw new Error(
        `writing ${path}: ${response.status} ${await response.text()}`
      );
    }
  };
  const remove = (path: string) =>
    fetch(`${fleet.base}${at}/folder/file?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
  /** One kept view and two drafts, whatever the device before left. */
  const reset = async () => {
    await remove(`views/${KEEP}.oui`);
    await remove(`views/drafts/${SCRAP}.oui`);
    await put(`views/${KEPT}.oui`, WEEK);
    await put(`views/drafts/${KEEP}.oui`, draftOf("Probe draft"));
    await put(`views/drafts/${SCRAP}.oui`, draftOf("Probe scrap"));
    return project.listed();
  };

  for (const { tag, type } of DEVICES) {
    const views = hubSays(
      // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, on the same project
      await reset()
    );
    if (
      !kit.check(
        `${tag}: the hub lists one kept view and two drafts`,
        views === `${KEPT},${KEEP}+draft,${SCRAP}+draft`,
        views
      )
    ) {
      continue;
    }
    let sim: MacSim | undefined;
    let stream: Subprocess | undefined;
    let device: Device | undefined;
    try {
      sim = await macSim({ runtime: RUNTIME, device: type });
      console.log(`  ${tag}: simulator ${sim.udid}`);
      ({ device, stream } = await launch(
        tag,
        sim.udid,
        app,
        fleet.base,
        project.id
      ));
      if (await theStrip(kit, device)) {
        await theKeptView(kit, device, project);
        await keepInPlace(kit, device, project);
        await discardInPlace(kit, device, project);
        await taskOpens(kit, device, project);
      }
      await decisionsLeg(kit, device, decisions.projectId, (path) =>
        fleet.api(path)
      );
      await routinesLeg(kit, device, decisions.projectId, (path) =>
        fleet.api(path)
      );
      await madeLeg(kit, device, madeTask.id);
      await askViewLeg(kit, device, decisions.projectId, (path) =>
        fleet.api(path)
      );
    } finally {
      await writeFile(
        join(kit.out, `${tag}.log`),
        device?.heard.join("\n") ?? ""
      ).catch(() => undefined);
      stream?.kill();
      await sim?.release();
    }
  }
}

const spec: Spec = { name: "ios-views", run };
export default spec;
