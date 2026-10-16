/**
 * The project page's view strip in the shell's bar (owner, on the desk:
 * "why is the titlebar there? waste of space and it duplicates the
 * project's title anyways (we already removed the titlebar in sessions in a
 * previous run)"). On the built dashboard against a scratch fleet, a
 * project with five kept views (eight tabs) and one session.
 *
 * Desk 1440, desk 1024 and a tablet held sideways (1024×768, touch):
 * - the bar holds the strip (its tablist inside the bar's box), and no
 *   text in the bar equals the project's name;
 * - no strip row stands under the head, and the pane starts as much higher
 *   as that row was tall (against `before.json`, read on main);
 * - a track that overflows draws its fade at each edge with tabs past it;
 * - a view chosen from the bar by a click, and by ArrowRight, takes the
 *   URL (`?view=`) and the pane (`data-view`).
 * Desk 1440, motion on the Animation domain's clock (anim.ts): to a
 * session and back, the slot's two strips trade on one clock: the one
 * leaving fades out of the row, the one arriving comes down 6px as it
 * fades in, read at 0, 25, 50, 75 and 100%.
 * Phone 390: the page's boxes are main's (`before.json`), the crumb with
 * them. Its entry was read again on main at fe73d0f7b: the name in the head
 * stands in a 1px edge, clear at rest (7817bf0a8), 1.99px taller.
 *
 * CAUTION: the wide legs' entries (desk 1440, desk 1024, tablet 1024
 * sideways) are the page from before the strip moved into the bar: they
 * hold its row, which no longer exists. Approving them from any run since
 * loses what the row-gone checks read against. Approve a leg by its name:
 * `--approve project-bar:phone-390` rewrites that entry of `before.json`
 * alone, every other leg left as it is to the byte. A bare
 * `--approve project-bar` rewrites every leg.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { format, resolveConfig } from "prettier";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { Clock } from "../../anim";
import { type Kit, open, ROOT, type Spec, settle } from "../../kit";

const NAME = "Routines";
const VIEWS = [
  "weekly-review",
  "release-notes",
  "on-call-rota",
  "launch-plan",
  "bug-bash",
];
const TABS = 3 + VIEWS.length;
const TABLIST = "[role='tablist'][aria-label='Views']";
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

interface Rect {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** What the page lays out: the bar, the head, the page's own strip row, the pane, and the bar's words. */
interface Layout {
  barStrip: Rect | null;
  barTabs: number;
  crumbs: string[];
  head: Rect | null;
  namedInBar: number;
  pane: Rect | null;
  row: Rect | null;
  rowTabs: Rect[];
  top: Rect | null;
}

const layout = (page: Page, name: string): Promise<Layout> =>
  page.evaluate(
    ([list, project]) => {
      const rect = (el: Element | null | undefined) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        const round = (n: number) => Math.round(n * 100) / 100;
        return {
          left: round(r.left),
          top: round(r.top),
          width: round(r.width),
          height: round(r.height),
        };
      };
      const top = document.querySelector("header.top");
      const shown = (el: Element) =>
        !el.closest("[inert], .away") &&
        getComputedStyle(el).visibility !== "hidden";
      const barList = [...(top?.querySelectorAll(list) ?? [])].find(shown);
      const row = document.querySelector(".project-page .strip");
      return {
        top: rect(top),
        barStrip: rect(barList),
        barTabs: barList?.querySelectorAll("[role='tab']").length ?? 0,
        crumbs: [...(top?.querySelectorAll(".crumb") ?? [])].map((el) =>
          (el.textContent ?? "").trim()
        ),
        // The words, not their wrappers: the innermost element that reads
        // the name, so a span the words are drawn in is not a second name.
        namedInBar: [...(top?.querySelectorAll("*") ?? [])].filter(
          (el) =>
            shown(el) &&
            (el as HTMLElement).innerText?.trim() === project &&
            el.getBoundingClientRect().width > 0 &&
            ![...el.children].some(
              (child) => (child as HTMLElement).innerText?.trim() === project
            )
        ).length,
        head: rect(document.querySelector(".project-head")),
        row: rect(row),
        rowTabs: [...(row?.querySelectorAll("[role='tab']") ?? [])].map(
          (el) => rect(el) as Rect
        ),
        pane: rect(document.querySelector(".project-page .pane")),
      };
    },
    [TABLIST, name] as const
  );

/** The legs read, each a viewport. */
const LEGS = [
  { name: "desk 1440", view: "desk", size: null },
  { name: "desk 1024", view: "desk", size: { width: 1024, height: 768 } },
  {
    name: "tablet 1024 sideways",
    view: "tablet",
    size: { width: 1024, height: 768 },
  },
  { name: "phone 390", view: "phone", size: null },
] as const;
type Leg = (typeof LEGS)[number];

async function openLeg(kit: Kit, leg: Leg, url: string): Promise<Page> {
  const page = await kit.page(leg.view);
  if (leg.size) {
    await page.setViewportSize(leg.size);
  }
  page.setDefaultTimeout(60_000);
  await open(page, url, ".project-head");
  await page.waitForFunction(
    ([list, n]) =>
      [...document.querySelectorAll(list as string)].some(
        (el) =>
          !el.closest("[inert], .away") &&
          el.querySelectorAll("[role='tab']").length >= (n as number)
      ),
    [TABLIST, TABS] as const
  );
  await page.waitForTimeout(600);
  await settle(page);
  return page;
}

/** The track's edges: tabs past each, and the fade drawn there. */
const edges = (page: Page) =>
  page.evaluate((list) => {
    const el = [
      ...document.querySelectorAll<HTMLElement>(`header.top ${list}`),
    ].find((one) => !one.closest("[inert], .away"));
    if (!el) {
      return null;
    }
    const style = getComputedStyle(el);
    const len = (name: string) => {
      const v = Number.parseFloat(style.getPropertyValue(name));
      return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
    };
    return {
      start: el.scrollLeft > 0.5,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 0.5,
      fadeStart: Math.min(len("--fade-start"), len("--fade-cap-start")),
      fadeEnd: Math.min(len("--fade-end"), len("--fade-cap-end")),
    };
  }, TABLIST);

const viewOf = (page: Page) =>
  page.evaluate(() => ({
    url: new URL(location.href).searchParams.get("view") ?? "board",
    pane: document
      .querySelector(".project-page .pane")
      ?.getAttribute("data-view"),
    chosen:
      document
        .querySelector(
          "header.top [role='tab'][aria-selected='true'], .project-page .strip [role='tab'][aria-selected='true']"
        )
        ?.textContent?.trim() ?? "",
  }));

async function chosenIs(page: Page, view: string) {
  await page.waitForFunction(
    (want) =>
      new URL(location.href).searchParams.get("view") === want &&
      document
        .querySelector(".project-page .pane")
        ?.getAttribute("data-view") === want,
    view,
    { timeout: 10_000 }
  );
  await settle(page);
}

/** A wide leg: the strip in the bar, the row gone, the views chosen from it. */
async function wide(kit: Kit, leg: Leg, url: string, was: Layout) {
  const page = await openLeg(kit, leg, url);
  const now = await layout(page, NAME);
  const top = now.top as Rect;
  const strip = now.barStrip;
  kit.check(
    `${leg.name}: the bar holds the view strip, all ${TABS} tabs, inside the bar's box`,
    strip !== null &&
      now.barTabs === TABS &&
      strip.top >= top.top - 0.5 &&
      strip.top + strip.height <= top.top + top.height + 0.5,
    strip
      ? `${now.barTabs} tabs; strip ${strip.top}–${strip.top + strip.height}, bar ${top.top}–${top.top + top.height}`
      : "no strip in the bar"
  );
  kit.check(
    `${leg.name}: no crumb, and no text in the bar equals the project's name`,
    now.crumbs.length === 0 && now.namedInBar === 0,
    `crumbs [${now.crumbs.join(", ")}]; ${now.namedInBar} element(s) reading "${NAME}"`
  );
  const head = now.head as Rect;
  const pane = now.pane as Rect;
  // Read from the head's end, so a head that is taller or shorter for its
  // own reasons is not the row's height: the pane stood the row below it.
  const below = (h: Rect | null, p: Rect | null) =>
    (p?.top ?? Number.NaN) - ((h?.top ?? Number.NaN) + (h?.height ?? 0));
  const gained = below(was.head, was.pane) - below(head, pane);
  const rowWas = was.row?.height ?? Number.NaN;
  kit.check(
    `${leg.name}: no strip row under the head; the pane starts the row's height higher (${gained.toFixed(1)}px gained)`,
    now.row === null &&
      Math.abs(gained - rowWas) <= 0.5 &&
      Math.abs(pane.top - (head.top + head.height)) <= 0.5,
    `pane below the head ${below(was.head, was.pane).toFixed(2)} → ${below(head, pane).toFixed(2)}px; the row was ${rowWas}px; head ends ${head.top + head.height}`
  );
  const edge = await edges(page);
  if (edge && (edge.start || edge.end)) {
    kit.check(
      `${leg.name}: the bar's track overflows, and each edge with tabs past it draws its fade (≥ 8px)`,
      (!edge.start || edge.fadeStart >= 8) && (!edge.end || edge.fadeEnd >= 8),
      JSON.stringify(edge)
    );
  } else {
    kit.note(`${leg.name}: the bar's track holds every tab (no overflow)`);
  }
  const bar = (label: string) =>
    page.locator(`header.top ${TABLIST} [role='tab']`, { hasText: label });
  await bar("Pipeline").first().click();
  await chosenIs(page, "pipeline");
  const clicked = await viewOf(page);
  kit.check(
    `${leg.name}: Pipeline clicked in the bar takes the URL and the pane`,
    clicked.url === "pipeline" &&
      clicked.pane === "pipeline" &&
      clicked.chosen === "Pipeline",
    JSON.stringify(clicked)
  );
  await bar("Board").first().click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".project-page .pane")
        ?.getAttribute("data-view") === "board"
  );
  await settle(page);
  await bar("Board").first().focus();
  await page.keyboard.press("ArrowRight");
  await chosenIs(page, "table");
  const keyed = await viewOf(page);
  kit.check(
    `${leg.name}: ArrowRight on Board in the bar chooses Table, the URL and the pane with it`,
    keyed.url === "table" && keyed.pane === "table" && keyed.chosen === "Table",
    JSON.stringify(keyed)
  );
  await page.close();
}

/** The slot's two strips at one moment: opacity, the vertical offset, and whether each is out of the row. */
const slot = (page: Page) =>
  page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el);
      const m = new DOMMatrixReadOnly(
        s.transform === "none" ? "" : s.transform
      );
      return {
        opacity: Math.round(Number(s.opacity) * 1000) / 1000,
        y: Math.round(m.m42 * 100) / 100,
        lifted: s.position === "absolute",
        runs: el.getAnimations().map((run) => {
          const t = run.effect?.getTiming();
          return `${t?.duration}ms ${t?.easing}`;
        }),
      };
    };
    return { strip: read(".slot-strip"), tabs: read(".slot-tabs") };
  });

type Slot = Awaited<ReturnType<typeof slot>>;

/**
 * One swap, held on the clock: `act` navigates; the fades in the slot are
 * caught and read at each fraction of --dur-control.
 */
async function swap(
  kit: Kit,
  page: Page,
  what: string,
  act: () => Promise<unknown>,
  leaving: "strip" | "tabs"
) {
  const arriving = leaving === "strip" ? "tabs" : "strip";
  // A registered time computes in seconds ("0.12s"), an unregistered one as authored.
  const fade = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--dur-control")
      .trim();
    const n = Number.parseFloat(raw);
    return raw.endsWith("ms") ? n : n * 1000;
  });
  const clock = await Clock.on(page);
  await clock.catchRuns(act, ".slot", 10_000);
  const at: Slot[] = [];
  for (const f of FRACTIONS) {
    // Every caught run at f of the fade (a longer one, past it, is not read).
    await clock.seek((f * fade) / clock.length());
    at.push(await slot(page));
  }
  await clock.release();
  await settle(page);
  const out = at.map((s) => s[leaving]);
  const into = at.map((s) => s[arriving]);
  const line = (xs: typeof out) =>
    xs.map((x) => (x ? `${x.opacity}@${x.y}` : "none")).join(" → ");
  const rising = (xs: number[]) =>
    xs.every((x, i) => i === 0 || x >= (xs[i - 1] ?? x));
  const outOp = out.map((x) => x?.opacity ?? Number.NaN);
  const inOp = into.map((x) => x?.opacity ?? Number.NaN);
  const inY = into.map((x) => x?.y ?? Number.NaN);
  kit.check(
    `${what}: leaving, the ${leaving === "strip" ? "project strip" : "session tabs"}: out of the row, opacity 1 → 0`,
    out.every((x) => x?.lifted) &&
      outOp[0] === 1 &&
      outOp.at(-1) === 0 &&
      rising(outOp.map((x) => -x)) &&
      (outOp[2] ?? 0) > 0 &&
      (outOp[2] ?? 1) < 1,
    line(out)
  );
  kit.check(
    `${what}: arriving, the ${arriving === "strip" ? "project strip" : "session tabs"}: down 6px, opacity 0 → 1`,
    inOp[0] === 0 &&
      inOp.at(-1) === 1 &&
      rising(inOp) &&
      (inOp[2] ?? 0) > 0 &&
      (inOp[2] ?? 1) < 1 &&
      Math.abs((inY[0] ?? 0) + 6) <= 0.01 &&
      inY.at(-1) === 0 &&
      rising(inY),
    line(into)
  );
  const runs = [...(at[0]?.strip?.runs ?? []), ...(at[0]?.tabs?.runs ?? [])];
  kit.check(
    `${what}: the two fades run on one clock (--dur-control, --ease-out)`,
    runs.length === 2 &&
      runs[0] === runs[1] &&
      runs[0]?.startsWith(`${fade}ms`),
    runs.join(" | ")
  );
}

/** To a session (Jump) and back (history), the slot swapping each way. */
async function motion(kit: Kit, url: string) {
  const [desk] = LEGS;
  const page = await openLeg(kit, desk, url);
  // What the dashboard reports as a client error (hooks.client): the
  // strip a page leaving in the bar once read the next route's data.
  const reported: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/dashboard-errors")) {
      reported.push(
        (JSON.parse(r.postData() ?? "{}") as { message?: string }).message ??
          "?"
      );
    }
  });
  // Alpha's row the chosen one before Enter: the rows are the hub's answer
  // to the query, and the list before it can name Alpha with another row
  // chosen (JumpPalette `names`).
  const toSession = async () => {
    await page.keyboard.press("Control+k");
    const jump = page.locator(".glass-face[data-face='jump']");
    const field = jump.locator("input");
    await field.waitFor();
    await field.fill("Alpha");
    await jump
      .locator("[data-slot='command-item'][data-selected]", {
        has: page.getByText("Alpha", { exact: true }),
      })
      .waitFor();
  };
  // The first visit mounts the session's surface, and its strip with it.
  await toSession();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".slot-tabs:not(.away) .tab");
  await settle(page);
  await page.goBack();
  await page.waitForSelector(".slot-strip:not(.away) [role='tab']");
  await settle(page);
  await toSession();
  await swap(
    kit,
    page,
    "to a session",
    () => page.keyboard.press("Enter"),
    "strip"
  );
  await swap(kit, page, "back to the project", () => page.goBack(), "tabs");
  const back = await layout(page, NAME);
  kit.check(
    "back on the project: the bar holds its strip again, no crumb",
    back.barTabs === TABS && back.crumbs.length === 0,
    `${back.barTabs} tabs, crumbs [${back.crumbs.join(", ")}]`
  );
  kit.check(
    "to a session and back twice: the dashboard reports no client error",
    reported.length === 0,
    reported.join(" | ") || "none"
  );
  await page.close();
}

/**
 * Writes the legs `--approve` names into `before.json` from this run, every
 * other leg kept as it stands, in the legs' order, formatted as the
 * repository formats it (prettier on its `.prettierrc`), so a leg not named
 * keeps its text to the byte.
 */
async function approveLegs(
  kit: Kit,
  file: string,
  read: Record<string, Layout>
): Promise<void> {
  const kept = existsSync(file)
    ? (JSON.parse(await readFile(file, "utf8")) as Record<string, Layout>)
    : {};
  const next: Record<string, Layout> = {};
  const written: string[] = [];
  for (const leg of LEGS) {
    if (kit.approves(leg.name)) {
      next[leg.name] = read[leg.name] as Layout;
      written.push(leg.name);
    } else if (kept[leg.name]) {
      next[leg.name] = kept[leg.name] as Layout;
    }
  }
  if (written.length === 0) {
    return;
  }
  // The config is the repository's whatever folder the file is in (a
  // scratch copy too): resolved from a file at its root.
  const config = await resolveConfig(join(ROOT, "package.json"));
  // Laid out first as the file is (an object prettier finds broken over
  // lines it keeps broken), then formatted.
  const text = await format(`${JSON.stringify(next, null, 2)}\n`, {
    ...config,
    parser: "json",
  });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  kit.note(`wrote ${written.join(", ")} into ${file}`);
}

const spec: Spec = {
  name: "project-bar",
  async run(kit) {
    const fleet = await kit.fleet((_: Seen) => ({
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
    await fleet.spawn("claude", "Alpha");
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: NAME,
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    for (const name of VIEWS) {
      const put = await fetch(
        `${fleet.base}/api/projects/${project.id}/folder/file`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: `views/${name}.oui`,
            content: 'root = Text("Kept")\n',
            message: `Keep the view ${name}`,
          }),
        }
      );
      if (!put.ok) {
        throw new Error(`views/${name}.oui: ${put.status} ${await put.text()}`);
      }
    }
    const base = await fleet.dashboard();
    const url = `${base}/project/${project.id}`;

    const read: Record<string, Layout> = {};
    for (const leg of LEGS) {
      const page = await openLeg(kit, leg, url);
      read[leg.name] = await layout(page, NAME);
      await page.close();
    }
    const baseline = join(kit.baselines, "before.json");
    if (kit.approve) {
      await approveLegs(kit, baseline, read);
      return;
    }
    if (!existsSync(baseline)) {
      kit.check("before.json exists (approve on main)", false, baseline);
      return;
    }
    const before = JSON.parse(await readFile(baseline, "utf8")) as Record<
      string,
      Layout
    >;
    const phone = LEGS[3].name;
    const onPhone = read[phone] as Layout;
    const same = JSON.stringify(onPhone) === JSON.stringify(before[phone]);
    kit.check(
      "phone 390: the page's geometry is main's (bar, head, strip row, its tabs, pane, crumb)",
      same,
      same
        ? `row at ${onPhone.row?.top}, pane at ${onPhone.pane?.top}, crumb [${onPhone.crumbs.join(", ")}]`
        : `now ${JSON.stringify(onPhone)} against ${JSON.stringify(before[phone])}`
    );
    for (const leg of LEGS.slice(0, 3)) {
      await wide(kit, leg, url, before[leg.name] as Layout);
    }
    await motion(kit, url);
  },
};
export default spec;
