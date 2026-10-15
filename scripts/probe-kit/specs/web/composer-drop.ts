/**
 * A drag inside the dashboard's own UI never drops its payload into a text
 * field as text; only files and text dragged in from outside reach the
 * composer (owner's composer, in the left pane of two, filled with the
 * workspace's layout JSON while he opened a second pane). On the built
 * dashboard against a scratch fleet, three sessions under one project (so
 * the rail lists their rows), a mouse in Chromium.
 *
 * Read before the page's scripts: every drag's types as it hovers, whether
 * the page refused the hover, every drop's types and data, every `input` on
 * a textarea with its `inputType`, and a stack for any textarea value that
 * comes to hold a layout's `"focusedLeaf"`.
 *
 * - tab: Bravo's tab carried down across the composer and on to the pane's
 *   right edge splits the pane, Bravo alone in the new group, and no field
 *   hears a drop or an input.
 * - row: Charlie's rail row (an HTML5 drag, a link) carries the private type
 *   and no text, link or HTML; over the left composer its hover is refused,
 *   and let go there the composer stays empty.
 * - row into a pane: the same row let go in the right pane's middle joins
 *   that group's tabs, as before.
 * - outside: text dragged in from outside (CDP's drag events) is not
 *   refused and lands in the composer; a file dropped on the composer is
 *   taken and becomes an attachment chip, as a pasted file does; a file
 *   dropped on a pane's empty area leaves the tab where it was.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec } from "../../kit";

const TITLES = ["Alpha", "Bravo", "Charlie"];
const STRIPS = "[data-strip]";
const tabSel = (id: string) => `${STRIPS} .tab:has([data-session-tab="${id}"])`;
const FIELD = 'form.cin textarea:not([aria-hidden="true"])';
const fieldOf = (leaf: string) => `[data-leaf="${leaf}"] ${FIELD}`;
/** The private type (apps/dashboard/src/lib/cawco/internal-drag.ts). */
const INTERNAL = "application/x-cawco-drag";
const TEXT_TYPES = ["text/plain", "text/uri-list", "text/html"];

interface Trace {
  /** Each drop: its types and data, and whether the page cancelled its default. */
  drops: {
    cancelled: boolean;
    data: Record<string, string>;
    types: string[];
  }[];
  /** Each hover anywhere but a text field: whether the page cancelled it with effect "none". */
  elsewhere: { refused: boolean; types: string[] }[];
  /** Each hover over a text field: its types and whether the page cancelled it with effect "none". */
  hovers: { refused: boolean; types: string[] }[];
  inputs: { data: string | null; inputType: string }[];
  layoutInField: string[];
}

function watch() {
  const w = window as unknown as { __trace: Trace };
  w.__trace = {
    drops: [],
    elsewhere: [],
    hovers: [],
    inputs: [],
    layoutInField: [],
  };
  window.addEventListener(
    "dragover",
    (e) => {
      const into =
        e.target instanceof HTMLTextAreaElement
          ? w.__trace.hovers
          : w.__trace.elsewhere;
      // What the page decided is read once the dispatch is over (a task
      // later: a microtask runs between one listener and the next); its
      // types now, while the data store can still be read.
      const types = [...(e.dataTransfer?.types ?? [])];
      setTimeout(() =>
        into.push({
          types,
          refused: e.defaultPrevented && e.dataTransfer?.dropEffect === "none",
        })
      );
    },
    true
  );
  window.addEventListener(
    "drop",
    (e) => {
      const dt = e.dataTransfer;
      const data: Record<string, string> = {};
      for (const type of dt?.types ?? []) {
        data[type] = (dt?.getData(type) ?? "").slice(0, 200);
      }
      const types = [...(dt?.types ?? [])];
      setTimeout(() =>
        w.__trace.drops.push({ types, data, cancelled: e.defaultPrevented })
      );
    },
    true
  );
  window.addEventListener(
    "input",
    (e) => {
      if (e.target instanceof HTMLTextAreaElement && e instanceof InputEvent) {
        w.__trace.inputs.push({ inputType: e.inputType, data: e.data });
      }
    },
    true
  );
  const desc = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  );
  Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
    ...desc,
    set(v: string) {
      if (String(v).includes('"focusedLeaf"')) {
        w.__trace.layoutInField.push(
          new Error("value").stack?.slice(0, 1200) ?? ""
        );
      }
      desc?.set?.call(this, v);
    },
  });
}

const trace = (page: Page) =>
  page.evaluate(() => (window as unknown as { __trace: Trace }).__trace);
const resetTrace = (page: Page) =>
  page.evaluate(() => {
    const t = (window as unknown as { __trace: Trace }).__trace;
    t.drops = [];
    t.elsewhere = [];
    t.hovers = [];
    t.inputs = [];
    t.layoutInField = [];
  });

/** Every composer field's value, by its group. */
const fields = (page: Page) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>("[data-leaf]")].map((g) => ({
        leaf: g.dataset.leaf ?? "",
        value: g.querySelector<HTMLTextAreaElement>(sel)?.value ?? null,
      })),
    FIELD
  );

const strips = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-strip]")].map((s) => ({
      leaf: s.dataset.strip ?? "",
      tabs: [...s.querySelectorAll(".tab")]
        .filter((t) => !t.closest("[inert]"))
        .map(
          (t) =>
            t
              .querySelector("[data-session-tab]")
              ?.getAttribute("data-session-tab") ?? ""
        ),
    }))
  );

interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}
const boxOf = (page: Page, sel: string): Promise<Box> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) {
      throw new Error(`nothing at ${s}`);
    }
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, sel);

const mid = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

/** Long enough for a split's or a move's motion to land. */
const settle = (page: Page) => page.waitForTimeout(900);

/** A desk page with `tabs` in one group, `active` in front. */
async function desk(kit: Kit, base: string, tabs: string[], active: string) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  const ws = {
    v: 1,
    root: { t: "l", id: "probe-leaf", tabs, active },
    focusedLeaf: "probe-leaf",
    ctx: {},
  };
  await page.context().addCookies([
    {
      name: "cawco-workspace",
      value: encodeURIComponent(JSON.stringify(ws)),
      url: base,
    },
  ]);
  await page.context().addInitScript((w) => {
    localStorage.setItem("cawco-workspace", JSON.stringify(w));
  }, ws);
  await page.context().addInitScript(watch);
  await open(page, `${base}/session/${active}`, FIELD);
  await page.waitForTimeout(2500);
  return page;
}

/** Moves the pressed mouse from `a` to `b` in `steps`. */
async function sweep(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
  steps = 12
) {
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      a.x + ((b.x - a.x) * i) / steps,
      a.y + ((b.y - a.y) * i) / steps
    );
  }
}

const order = (now: { tabs: string[] }[], ids: string[]) =>
  now
    .map((s) => s.tabs.map((id) => TITLES[ids.indexOf(id)]).join(","))
    .join(" | ");

/** Bravo's tab down across the composer, on to the pane's right edge. */
async function tabAcross(kit: Kit, page: Page, ids: string[], leaf: string) {
  const bravo = ids[1] as string;
  const field = await boxOf(page, fieldOf(leaf));
  const pane = await boxOf(page, `[data-drop-leaf="${leaf}"]`);
  await resetTrace(page);
  const g = mid(await boxOf(page, `${tabSel(bravo)} .label`));
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 8, g.y + 2);
  await sweep(page, { x: g.x + 8, y: g.y + 2 }, mid(field));
  await sweep(page, mid(field), {
    x: pane.left + pane.width - 20,
    y: pane.top + pane.height / 2,
  });
  await page.mouse.up();
  await settle(page);
  const now = await strips(page);
  const values = await fields(page);
  const t = await trace(page);
  kit.check(
    "tab: Bravo carried across the composer to the pane's edge splits it, Bravo alone in the new group",
    now.length === 2 &&
      JSON.stringify(now[1]?.tabs) === JSON.stringify([bravo]),
    order(now, ids)
  );
  kit.check(
    "tab: every composer stays empty, no field hears a drop or an input",
    values.every((f) => f.value === "") &&
      t.drops.length === 0 &&
      t.inputs.length === 0 &&
      t.layoutInField.length === 0,
    `${JSON.stringify(values)}; ${JSON.stringify(t)}`
  );
  return now;
}

/** Charlie's rail row let go on the left composer, then in the right pane. */
async function rowAcross(
  kit: Kit,
  page: Page,
  ids: string[],
  left: string,
  right: string
) {
  const charlie = ids[2] as string;
  const rowSel = `[data-rail-row][data-share="session:${charlie}"]`;
  await resetTrace(page);
  let row = mid(await boxOf(page, rowSel));
  await page.mouse.move(row.x, row.y);
  await page.mouse.down();
  await sweep(page, row, mid(await boxOf(page, fieldOf(left))), 16);
  await page.mouse.up();
  await settle(page);
  let values = await fields(page);
  let t = await trace(page);
  const types = t.hovers[0]?.types ?? [];
  kit.check(
    "row: the rail row's drag carries the private type and no text, link or HTML",
    t.hovers.length > 0 &&
      types.includes(INTERNAL) &&
      !types.some((type) => TEXT_TYPES.includes(type)),
    `${t.hovers.length} hovers over the field; types ${types.join(", ")}`
  );
  kit.check(
    "row: over the composer every hover is refused (effect none)",
    t.hovers.length > 0 && t.hovers.every((h) => h.refused),
    t.hovers.map((h) => (h.refused ? "refused" : "taken")).join(",")
  );
  kit.check(
    "row: let go on the composer, every composer stays empty and nothing is input",
    values.every((f) => f.value === "") &&
      t.inputs.length === 0 &&
      t.layoutInField.length === 0,
    `${JSON.stringify(values)}; drops ${JSON.stringify(t.drops)}; inputs ${JSON.stringify(t.inputs)}`
  );

  await resetTrace(page);
  row = mid(await boxOf(page, rowSel));
  await page.mouse.move(row.x, row.y);
  await page.mouse.down();
  await sweep(
    page,
    row,
    mid(await boxOf(page, `[data-drop-leaf="${right}"]`)),
    16
  );
  await page.mouse.up();
  await settle(page);
  const now = await strips(page);
  values = await fields(page);
  t = await trace(page);
  kit.check(
    "row into a pane: let go in the right pane's middle, Charlie joins that group's tabs",
    now.find((s) => s.leaf === right)?.tabs.at(-1) === charlie,
    order(now, ids)
  );
  kit.check(
    "row into a pane: every composer stays empty",
    values.every((f) => f.value === "") && t.inputs.length === 0,
    JSON.stringify(values)
  );
}

async function drag(
  cdp: CDPSession,
  at: { x: number; y: number },
  steps: ("dragEnter" | "dragOver" | "drop" | "dragCancel")[],
  data: {
    dragOperationsMask: number;
    files?: string[];
    items: { data: string; mimeType: string }[];
  }
) {
  for (const type of steps) {
    await cdp.send("Input.dispatchDragEvent", { type, x: at.x, y: at.y, data });
  }
}

/** Text and a file dragged in from outside the page, over CDP. */
async function outside(kit: Kit, page: Page, leaf: string, right: string) {
  const cdp = await page.context().newCDPSession(page);
  const at = mid(await boxOf(page, fieldOf(leaf)));
  await resetTrace(page);
  await drag(cdp, at, ["dragEnter", "dragOver", "drop"], {
    items: [{ mimeType: "text/plain", data: "outside words" }],
    dragOperationsMask: 1,
  });
  await settle(page);
  const values = await fields(page);
  let t = await trace(page);
  kit.check(
    "outside: text dragged in is not refused and lands in the composer",
    t.hovers.length > 0 &&
      t.hovers.every((h) => !h.refused) &&
      values.find((f) => f.leaf === leaf)?.value === "outside words",
    `${JSON.stringify(values)}; hovers ${JSON.stringify(t.hovers)}`
  );

  const file = join(kit.out, "dropped.txt");
  await writeFile(file, "a file's words\n");
  const chip = 'button[aria-label="Remove dropped.txt"]';
  const navigated: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigated.push(frame.url());
    }
  });
  const url = page.url();
  await resetTrace(page);
  await drag(cdp, at, ["dragEnter", "dragOver", "drop"], {
    items: [],
    files: [file],
    dragOperationsMask: 1,
  });
  await settle(page);
  t = await trace(page);
  const chips = await page.locator(chip).count();
  const after = await fields(page);
  kit.check(
    "outside: a file dropped on the composer is taken (effect copy) and becomes one attachment chip, the field's words unchanged",
    t.hovers.length > 0 &&
      t.hovers.every((h) => !h.refused && h.types.includes("Files")) &&
      chips === 1 &&
      after.find((f) => f.leaf === leaf)?.value === "outside words" &&
      page.url() === url,
    `${chips} chips; ${JSON.stringify(after)}; hovers ${JSON.stringify(t.hovers)}; url ${page.url()}`
  );

  // A pane's empty area: the right pane's transcript, well above its composer.
  await resetTrace(page);
  const pane = await boxOf(page, `[data-drop-leaf="${right}"]`);
  await drag(
    cdp,
    { x: pane.left + pane.width / 2, y: pane.top + pane.height * 0.3 },
    ["dragEnter", "dragOver", "drop"],
    { items: [], files: [file], dragOperationsMask: 1 }
  );
  await page.waitForTimeout(1500);
  t = await trace(page);
  // What the browser's default (opening the file in the tab) waits on: a
  // hover nobody cancelled, or a drop nobody cancelled.
  kit.check(
    "outside: over a pane's empty area every file hover is refused (effect none), and no drop goes uncancelled",
    t.elsewhere.length > 0 &&
      t.elsewhere.every((h) => h.refused && h.types.includes("Files")) &&
      t.drops.every((d) => d.cancelled),
    `hovers ${JSON.stringify(t.elsewhere)}; drops ${JSON.stringify(t.drops.map((d) => ({ types: d.types, cancelled: d.cancelled })))}`
  );
  kit.check(
    "outside: a file dropped on a pane's empty area leaves the tab where it was, no chip added",
    page.url() === url &&
      navigated.length === 0 &&
      (await page.locator(chip).count()) === 1,
    `url ${page.url()} (was ${url}); navigations ${JSON.stringify(navigated)}; ${await page.locator(chip).count()} chips`
  );
  await cdp.detach();
}

const spec: Spec = {
  name: "composer-drop",
  async run(kit) {
    const fleet = await kit.fleet((_request: Seen) => ({
      everyMs: 20,
      words: ["Ready."],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Drops",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const ids: string[] = [];
    for (const title of TITLES) {
      ids.push(
        await fleet.spawn("claude", title, fleet.repo, {
          projectId: project.id,
        })
      );
    }
    const base = await fleet.dashboard();
    const [alpha, bravo] = ids as [string, string];
    const page = await desk(kit, base, [alpha, bravo], alpha);
    await page.locator(FIELD).first().click();
    const left = (await strips(page))[0]?.leaf ?? "";
    const split = await tabAcross(kit, page, ids, left);
    const right = split[1]?.leaf ?? "";
    await rowAcross(kit, page, ids, left, right);
    await outside(kit, page, left, right);
    await page.close();
  },
};
export default spec;
