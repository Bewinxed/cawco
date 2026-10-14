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
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, the app's oldest target, where axe reaches the simulator from a workspace. */
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
  "Board,Table,Pipeline,Probe week,Probe draft+draft,Probe scrap+draft";
const WANTED_MENU =
  "Board*,Table,Pipeline,Probe week,Probe draft+draft,Probe scrap+draft";
/** The count tile over the tasks: the `stages` tool's total, as the page's words read. */
const ALL_THREE = /All tasks\s*\|?\s*3/;
const LOG_HEAD = /^.*\] /;
const POINT = /^(\d+),(\d+)$/;
const STRIP_LINE =
  /views strip chosen=(.*?) phone=(true|false) room=(-?\d+)-(-?\d+) items=(\S.*?)(?: more=(\d+),(\d+) menu=(.*))?$/;
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
  chosen: string;
  items: { at: [number, number]; draft: boolean; label: string }[];
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
    const [words = "", at = "0,0"] = part.split("@");
    const [x = 0, y = 0] = at.split(",").map(Number);
    return {
      label: words.replace("+draft", ""),
      draft: words.endsWith("+draft"),
      at: [x, y] as [number, number],
    };
  });
  return {
    chosen: match[1] ?? "",
    phone: match[2] === "true",
    room: [Number(match[3]), Number(match[4])],
    items,
    more: match[6] ? [Number(match[6]), Number(match[7])] : undefined,
    menu: match[8] ? match[8].split(";") : [],
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
  tag: string;
  tap: (point: [number, number]) => Promise<string>;
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
    (strip) => strip.items.length >= 6,
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
  if (
    !(
      kit.check(
        `${device.tag} c: a draft opens under its bar, its words and Keep and Discard`,
        bar?.startsWith("Caw drafted the Probe draft view|keep=") === true &&
          page !== undefined,
        `bar ${bar}; page “${page?.text.slice(0, 120)}”`
      ) && bar
    )
  ) {
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
  if (
    !(
      kit.check(
        `${device.tag} d: the other draft opens under its bar`,
        bar?.startsWith("Caw drafted the Probe scrap view|") === true,
        `bar ${bar}`
      ) && bar
    )
  ) {
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
        | Record<string, unknown>[]
        | undefined) ?? []) {
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

  await until(
    `${tag}: the app launched`,
    () =>
      sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -open-project ${projectId} -views-probe >/dev/null`
      ).then(() => true),
    Boolean,
    60_000
  );
  return { device: { tag, heard, next, pick, tap }, stream };
}

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = appPath();
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
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
