/**
 * The project page on a phone (owner's pick on the phone-head preview, B:
 * "Do the 👍 bar"): the page is the one scroller, the head scrolls away
 * with the view, and the views, Needs you and New session stand in one bar
 * docked at the foot where a session docks its composer (ViewBar). Its
 * head carries no button but `⋯`, which holds Spin off, New task and Ask
 * Caw for a view (the owner's pin on Spin off; Apple HIG, Toolbars: "Create
 * a More menu to include additional items").
 *
 * On the built dashboard against a scratch fleet: a project on the
 * fleet's machine (its checkout, so Spin off stands), the code template's
 * stages, 16 tasks in ready, 2 in working and 2 in review (a `you` stage:
 * Needs you 2). At 390×844 and 430×932, light and dark:
 * - the bar: the viewport's width less --space-3 a side, --space-4 above
 *   the foot, the composer's field height plus its insets, 12px round; the
 *   pill, Needs you and "+" at 34px, concentric (5px);
 * - the head: no button in its row but `⋯`, no strip under it; its `⋯`
 *   lists Spin off, New task and Ask Caw for a view;
 * - scrolled, the page starts under the top bar (y 44) and the head has
 *   gone above it; scrolled to its end, the last column ends clear of the
 *   bar;
 * - the list: 8px over the bar, the bar's width, 44px rows; every view in
 *   it is reached by a pick, which closes it, says the view's name in the
 *   pill and takes the pane and the URL;
 * - Needs you filters the board to its column and back.
 * At 390 light, motion on the Animation domain's clock (anim.ts), read at
 * 0, 50 and 100%: the list rises --pop-rise from --pop-scale as it fades
 * in, on one clock (--dur-pop, --ease-drawer), and the chevron turns over
 * --dur-control; a pick runs the pill's width from the old name's to the
 * new one's with the word's morph, on one clock (--dur-morph, --ease-out).
 *
 *   bun scripts/probe-kit/run.ts web phone-head
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { Clock } from "../../anim";
import {
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type Theme,
} from "../../kit";

const NAME = "Harbour";
const READY = 16;
const WORKING = 2;
const REVIEW = 2;
const TASKS = READY + WORKING + REVIEW;
/** The views every project has, in the strip's order. */
const VIEWS = [
  { value: "board", label: "Board" },
  { value: "table", label: "Table" },
  { value: "pipeline", label: "Pipeline" },
  { value: "routines", label: "Routines" },
  { value: "decisions", label: "Decisions" },
] as const;
const LEGS = [
  { name: "390", view: "phone" },
  { name: "430", view: "phoneWide" },
] as const;
const FRACTIONS = [0, 0.5, 1];
/** The bar's numbers (tokens.css): --space-3, --space-4, the composer's field and inset, --radius-lg. */
const SIDE = 11;
const FOOT = 14;
const FIELD = 34;
const INSET = 7;
const BAR_H = FIELD + 2 * INSET + 2;
const RADIUS = 12;
const CONTROL_RADIUS = RADIUS - INSET;
const TOP_BAR = 44;
const near = (a: number, b: number, by = 0.75) => Math.abs(a - b) <= by;

interface Box {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

/** What the phone draws: the bar and its controls, the head, the page's scroll. */
const read = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      const n = (v: number) => Math.round(v * 100) / 100;
      return {
        top: n(r.top),
        bottom: n(r.bottom),
        left: n(r.left),
        right: n(r.right),
        width: n(r.width),
        height: n(r.height),
      };
    };
    const radius = (el: Element | null | undefined) =>
      el ? Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) : null;
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(el).visibility !== "hidden"
      );
    };
    const bar = document.querySelector(".view-bar");
    const pill = bar?.querySelector("[data-slot='select-trigger']");
    const needs = bar?.querySelector(".needs");
    const plus = bar?.querySelector("button[aria-label='New session']");
    const head = document.querySelector(".project-head");
    const scroller = document.querySelector<HTMLElement>(".project-page");
    const columns = [
      ...document.querySelectorAll(".project-page .board > .column"),
    ];
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      bar: box(bar),
      barRadius: radius(bar),
      barShell: bar ? getComputedStyle(bar).backdropFilter : null,
      pill: box(pill),
      pillRadius: radius(pill),
      pillWord: (pill?.textContent ?? "").trim(),
      needs: box(needs),
      needsRadius: radius(needs),
      needsOn: needs?.getAttribute("aria-pressed") ?? null,
      plus: box(plus),
      plusRadius: radius(plus),
      head: box(head),
      headActs: [...(head?.querySelectorAll(".acts > *") ?? [])]
        .filter(shown)
        .map(
          (el) => el.getAttribute("aria-label") ?? (el.textContent ?? "").trim()
        ),
      stripUnderHead: [
        ...document.querySelectorAll(".project-page .strip"),
      ].filter(shown).length,
      page: box(scroller),
      scroll: scroller
        ? {
            top: scroller.scrollTop,
            max: scroller.scrollHeight - scroller.clientHeight,
            overflow: getComputedStyle(scroller).overflowY,
          }
        : null,
      columns: columns.map(
        (el) => box(el) as NonNullable<ReturnType<typeof box>>
      ),
      columnNames: columns.map((el) =>
        (el.querySelector(".name")?.textContent ?? "").trim()
      ),
      cards: document.querySelectorAll(".project-page .task-card").length,
      view: document
        .querySelector(".project-page .pane")
        ?.getAttribute("data-view"),
      url: new URL(location.href).searchParams.get("view") ?? "board",
    };
  });

type Read = Awaited<ReturnType<typeof read>>;

const scrollTo = (page: Page, y: number | "end") =>
  page.evaluate((to) => {
    const scroller = document.querySelector<HTMLElement>(".project-page");
    if (scroller) {
      scroller.scrollTop = to === "end" ? scroller.scrollHeight : to;
    }
  }, y);

/** The open list: its box, its state, its rows. */
const list = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector(".kit-pop.view-list");
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      state: el.getAttribute("data-state"),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      width: r.width,
      rows: [...el.querySelectorAll("[data-slot='select-item']")].map((row) => {
        const b = row.getBoundingClientRect();
        return {
          label: (row.textContent ?? "").trim(),
          top: b.top,
          height: b.height,
          selected: row.hasAttribute("data-selected"),
        };
      }),
    };
  });

async function openList(page: Page) {
  await page.locator(".view-bar [data-slot='select-trigger']").click();
  await page.waitForSelector(".kit-pop.view-list[data-state='open']");
  await page.waitForFunction(() =>
    [
      ...(document.querySelector(".kit-pop.view-list")?.getAnimations() ?? []),
    ].every((run) => run.playState !== "running")
  );
  await settle(page);
}

async function openLeg(
  kit: Kit,
  view: "phone" | "phoneWide",
  theme: Theme,
  url: string
): Promise<Page> {
  const page = await kit.page(view, { theme });
  page.setDefaultTimeout(60_000);
  await open(page, url, ".view-bar");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".project-page .task-card").length >= n,
    TASKS
  );
  await page.waitForSelector(".view-bar .needs");
  await settle(page);
  return page;
}

function checkBar(kit: Kit, tag: string, at: Read) {
  const bar = at.bar as Box;
  kit.check(
    `${tag}: the bar is the viewport less ${SIDE}px a side, ${FOOT}px over the foot, ${BAR_H}px tall, ${RADIUS}px round, on the panel's glass`,
    near(bar.left, SIDE) &&
      near(bar.right, at.vw - SIDE) &&
      near(bar.bottom, at.vh - FOOT) &&
      near(bar.height, BAR_H) &&
      at.barRadius === RADIUS &&
      (at.barShell ?? "none") !== "none",
    `${bar.left}–${bar.right} of ${at.vw}, ${bar.top}–${bar.bottom} of ${at.vh}, ${bar.height}px, ${at.barRadius}px, ${at.barShell}`
  );
  const controls = [
    ["pill", at.pill, at.pillRadius],
    ["Needs you", at.needs, at.needsRadius],
    ["+", at.plus, at.plusRadius],
  ] as const;
  const plus = at.plus as Box;
  kit.check(
    `${tag}: the pill, Needs you and "+" stand ${FIELD}px tall at ${CONTROL_RADIUS}px, inside the bar; "+" is ${FIELD}px square at its end`,
    controls.every(
      ([, b, r]) =>
        b !== null &&
        near(b.height, FIELD) &&
        r === CONTROL_RADIUS &&
        near(b.top, bar.top + 1 + INSET)
    ) &&
      near(plus.width, FIELD) &&
      near(plus.right, bar.right - 1 - INSET),
    controls
      .map(([n, b, r]) => `${n} ${b?.width}×${b?.height} r${r} @${b?.top}`)
      .join("; ")
  );
}

/** One width in one scheme: the bar, the head, the scroll, the list, the filter. */
async function leg(
  kit: Kit,
  view: "phone" | "phoneWide",
  name: string,
  theme: Theme,
  url: string
) {
  const tag = `${name} ${theme}`;
  const page = await openLeg(kit, view, theme, url);
  const rest = await read(page);
  checkBar(kit, tag, rest);
  kit.check(
    `${tag}: the head's row holds ⋯ alone, and no strip stands under it`,
    rest.headActs.length === 1 &&
      (rest.headActs[0] ?? "").startsWith("More for") &&
      rest.stripUnderHead === 0,
    `[${rest.headActs.join(", ")}], ${rest.stripUnderHead} strip(s)`
  );
  await page.locator(".project-head [aria-label^='More for']").click();
  const menu = page.locator("[data-slot='dropdown-menu-content']");
  await menu.waitFor();
  const items = (await menu.locator("[role='menuitem']").allInnerTexts()).map(
    (text) => text.trim()
  );
  // The phone's own rows lead, Filter tasks… (the task tracker's) among them.
  const phoneRows = items.slice(0, 4);
  kit.check(
    `${tag}: ⋯ opens with Spin off, then New task and Ask Caw for a view among the phone's rows`,
    items[0] === "Spin off" &&
      phoneRows.includes("New task") &&
      phoneRows.includes("Ask Caw for a view"),
    items.join(" | ")
  );
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });

  await scrollTo(page, 260);
  await settle(page);
  const scrolled = await read(page);
  const under = await page.evaluate(
    ([x, y]) =>
      Boolean(
        document.elementFromPoint(x as number, y as number)?.closest(".pane")
      ),
    [rest.vw / 2, TOP_BAR + 6] as const
  );
  kit.check(
    `${tag}: scrolled, the page is the scroller, starts at y ${TOP_BAR}, the head has gone above it and the view stands there`,
    scrolled.scroll?.overflow === "auto" &&
      near((scrolled.page as Box).top, TOP_BAR) &&
      (scrolled.head as Box).bottom <= TOP_BAR &&
      under,
    `page at ${scrolled.page?.top}, scrollTop ${scrolled.scroll?.top}/${scrolled.scroll?.max}, head ends ${scrolled.head?.bottom}, the pane under y ${TOP_BAR + 6}: ${under}`
  );
  kit.check(
    `${tag}: the bar has not moved`,
    JSON.stringify(scrolled.bar) === JSON.stringify(rest.bar),
    `${rest.bar?.top} → ${scrolled.bar?.top}`
  );
  await scrollTo(page, "end");
  await settle(page);
  const end = await read(page);
  const last = Math.max(...end.columns.map((c) => c.bottom));
  kit.check(
    `${tag}: scrolled to the end, the last column ends clear of the bar`,
    end.columns.length > 0 && last <= (end.bar as Box).top,
    `last column ends ${last}, the bar starts ${end.bar?.top}`
  );
  await scrollTo(page, 0);
  await settle(page);

  await openList(page);
  const shown = await list(page);
  const bar = rest.bar as Box;
  const labels = shown?.rows.map((row) => row.label) ?? [];
  kit.check(
    `${tag}: the list stands 8px over the bar at its width, every view in it, 44px rows, Board chosen`,
    shown !== null &&
      near(shown.bottom, bar.top - 8) &&
      near(shown.left, bar.left) &&
      near(shown.width, bar.width) &&
      VIEWS.every((v) => labels.includes(v.label)) &&
      shown.rows.every((row) => near(row.height, 44) && row.top >= 0) &&
      shown.rows.find((row) => row.selected)?.label === "Board",
    shown
      ? `${shown.top}–${shown.bottom} (bar ${bar.top}), x ${shown.left} w ${shown.width} (bar ${bar.left} w ${bar.width}); ${shown.rows.map((r) => `${r.label} ${r.height}`).join(", ")}`
      : "no list"
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector(".kit-pop.view-list", { state: "detached" });
  for (const each of [...VIEWS.slice(1), VIEWS[0]]) {
    await openList(page);
    await page
      .locator(".kit-pop.view-list [data-slot='select-item']", {
        hasText: each.label,
      })
      .click();
    await page.waitForFunction(
      (want) =>
        document
          .querySelector(".project-page .pane")
          ?.getAttribute("data-view") === want &&
        !document.querySelector(".kit-pop.view-list"),
      each.value
    );
    await settle(page, 400);
    const now = await read(page);
    kit.check(
      `${tag}: ${each.label} picked from the list closes it, says "${each.label}" in the pill, takes the pane and the URL`,
      now.pillWord === each.label &&
        now.view === each.value &&
        now.url === each.value,
      `pill "${now.pillWord}", pane ${now.view}, ?view=${now.url}`
    );
  }

  await page.locator(".view-bar .needs").click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".project-page .board > .column").length === 1
  );
  await settle(page);
  const filtered = await read(page);
  kit.check(
    `${tag}: Needs you on: pressed, the board is its column alone, ${REVIEW} cards`,
    filtered.needsOn === "true" &&
      filtered.columnNames.length === 1 &&
      filtered.cards === REVIEW,
    `${filtered.needsOn}; columns [${filtered.columnNames.join(", ")}], ${filtered.cards} cards`
  );
  await page.locator(".view-bar .needs").click();
  await page.waitForFunction(
    (n) => document.querySelectorAll(".project-page .task-card").length === n,
    TASKS
  );
  const back = await read(page);
  kit.check(
    `${tag}: Needs you off: every column and card again`,
    back.needsOn === "false" && back.cards === TASKS,
    `${back.needsOn}; ${back.columnNames.length} columns, ${back.cards} cards`
  );
  await page.close();
}

/** Each fraction's computed values of `selector`'s `props`. */
const values = (page: Page, selector: string, props: string[]) =>
  page.evaluate(
    ([sel, names]) => {
      const el = document.querySelector(sel as string);
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el);
      return Object.fromEntries(
        (names as string[]).map((n) => [n, s.getPropertyValue(n)])
      );
    },
    [selector, props] as const
  );

/** The motion tokens the bar runs on, as the page computes them. */
const tokensOf = (page: Page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const ms = (name: string) => {
      const raw = root.getPropertyValue(name).trim();
      const n = Number.parseFloat(raw);
      return raw.endsWith("ms") ? n : n * 1000;
    };
    return {
      pop: ms("--dur-pop"),
      control: ms("--dur-control"),
      morph: ms("--dur-morph"),
      rise: Number.parseFloat(root.getPropertyValue("--pop-rise")),
      scale: Number.parseFloat(root.getPropertyValue("--pop-scale")),
    };
  });
type Tokens = Awaited<ReturnType<typeof tokensOf>>;

/** The list opening, and the chevron turning with it. */
async function opening(kit: Kit, page: Page, tokens: Tokens) {
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => page.locator(".view-bar [data-slot='select-trigger']").click(),
    ".view-list, .view-bar [data-mark='chevron']",
    10_000
  );
  // The list's own: the highlight's ghost appearing in it runs its own.
  const listRuns = clock.runs.filter((run) =>
    ["opacity", "scale", "translate"].includes(run.name)
  );
  const turn = clock.runs.find((run) => run.name === "rotate");
  const at: Record<string, string>[] = [];
  for (const f of FRACTIONS) {
    await clock.seek((f * tokens.pop) / clock.length());
    at.push(
      (await values(page, ".kit-pop.view-list", [
        "opacity",
        "scale",
        "translate",
      ])) ?? {}
    );
  }
  const turning: string[] = [];
  for (const f of FRACTIONS) {
    await clock.seek((f * tokens.control) / clock.length());
    turning.push(
      (await values(page, ".view-bar [data-mark='chevron']", ["rotate"]))
        ?.rotate ?? "?"
    );
  }
  await clock.release();
  await settle(page, 400);
  const [o0, o5, o1] = at.map((v) => Number(v.opacity));
  const scaleAt = (v: Record<string, string> | undefined) =>
    v?.scale === "none" ? 1 : Number.parseFloat(v?.scale ?? "NaN");
  const riseAt = (v: Record<string, string> | undefined) =>
    v?.translate === "none"
      ? 0
      : Number.parseFloat((v?.translate ?? "0 NaN").split(" ")[1] ?? "NaN");
  kit.check(
    `the list opens on one clock (${tokens.pop}ms, --ease-drawer): opacity, translate and scale`,
    listRuns.length === 3 &&
      listRuns.every(
        (run) =>
          near(run.end, tokens.pop, 1) &&
          run.easing === "cubic-bezier(0.32, 0.72, 0, 1)"
      ),
    listRuns.map((run) => `${run.name} ${run.end}ms ${run.easing}`).join(" | ")
  );
  kit.check(
    `the list rises ${tokens.rise}px from ${tokens.scale} as it fades in (0 / 50 / 100%)`,
    o0 === 0 &&
      (o5 ?? 0) > 0 &&
      (o5 ?? 1) < 1 &&
      o1 === 1 &&
      near(scaleAt(at[0]), tokens.scale, 0.001) &&
      scaleAt(at[1]) > tokens.scale &&
      scaleAt(at[1]) < 1 &&
      scaleAt(at[2]) === 1 &&
      near(riseAt(at[0]), tokens.rise, 0.01) &&
      riseAt(at[1]) > 0 &&
      riseAt(at[1]) < tokens.rise &&
      riseAt(at[2]) === 0,
    at.map((v) => `${v.opacity} ${v.scale} ${v.translate}`).join(" → ")
  );
  kit.check(
    `the chevron turns over --dur-control (${tokens.control}ms), 0 → 180deg`,
    turn !== undefined &&
      near(turn.end, tokens.control, 1) &&
      (turning[0] === "none" || turning[0] === "0deg") &&
      turning[2] === "180deg" &&
      turning[1] !== turning[0] &&
      turning[1] !== turning[2],
    `${turn ? `${turn.end}ms ${turn.easing}` : "no run"}: ${turning.join(" → ")}`
  );
}

/** A pick from the open list: the pill's width runs with its word. */
async function picking(kit: Kit, page: Page, tokens: Tokens) {
  const before = await read(page);
  const pick = await Clock.on(page);
  await pick.catchRuns(
    () =>
      page
        .locator(".kit-pop.view-list [data-slot='select-item']", {
          hasText: "Pipeline",
        })
        .click(),
    ".view-bar [data-slot='select-trigger']",
    10_000
  );
  // The width and the word's letters are Web Animations; the chevron
  // turning back as the list closes is its own transition.
  const morphs = pick.runs.filter((run) => run.type === "WebAnimation");
  const back = pick.runs.find((run) => run.name === "rotate");
  const [first] = morphs;
  const oneStart = morphs.every(
    (run) =>
      run.start !== null &&
      typeof first?.start === "number" &&
      Math.abs(run.start - first.start) <= 0.5 &&
      near(run.end, tokens.morph, 1) &&
      run.easing === "cubic-bezier(0.23, 1, 0.32, 1)"
  );
  const runsSaid = pick.runs
    .map((run) => `${run.type} ${run.name || "-"} ${run.start}+${run.end}`)
    .join(", ");
  const widths: number[] = [];
  for (const f of FRACTIONS) {
    await pick.seek((f * tokens.morph) / pick.length());
    widths.push(
      await page.evaluate(
        () =>
          document
            .querySelector(".view-bar [data-slot='select-trigger']")
            ?.getBoundingClientRect().width ?? Number.NaN
      )
    );
  }
  await pick.release();
  await settle(page, 400);
  const after = await read(page);
  const [w0, w5, w1] = widths;
  kit.check(
    `a pick runs the pill's width from "Board" to "Pipeline" with the word's morph, on one clock (${tokens.morph}ms, --ease-out), 0 / 50 / 100%`,
    morphs.length > 1 &&
      oneStart &&
      near(w0 ?? 0, (before.pill as Box).width, 0.5) &&
      near(w1 ?? 0, (after.pill as Box).width, 0.5) &&
      (w5 ?? 0) > (w0 ?? 0) &&
      (w5 ?? 0) < (w1 ?? 0) &&
      after.pillWord === "Pipeline",
    `${runsSaid}; width ${widths.map((w) => w.toFixed(1)).join(" → ")} (rest ${before.pill?.width} → ${after.pill?.width}); "${after.pillWord}"`
  );
  kit.check(
    `the chevron turns back over --dur-control (${tokens.control}ms) as the list closes`,
    back !== undefined && near(back.end, tokens.control, 1),
    back ? `${back.end}ms ${back.easing}` : "no run"
  );
}

async function motion(kit: Kit, url: string) {
  const page = await openLeg(kit, "phone", "light", url);
  const tokens = await tokensOf(page);
  await opening(kit, page, tokens);
  await picking(kit, page, tokens);
  await page.close();
}

const spec: Spec = {
  name: "phone-head",
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
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: NAME,
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const titles = [
      ...Array.from({ length: READY }, (_, i) => ({
        title: `Ready task ${i + 1}: the sheet's long title runs on to a second line`,
        stage: "ready",
      })),
      ...Array.from({ length: WORKING }, (_, i) => ({
        title: `Working task ${i + 1}`,
        stage: "working",
      })),
      ...Array.from({ length: REVIEW }, (_, i) => ({
        title: `Review task ${i + 1}`,
        stage: "review",
      })),
    ];
    for (const task of titles) {
      await fleet.api(`/api/projects/${project.id}/tasks`, task);
    }
    const base = await fleet.dashboard();
    const url = `${base}/project/${project.id}`;
    for (const { name, view } of LEGS) {
      for (const theme of THEMES) {
        await leg(kit, view, name, theme, url);
      }
    }
    await motion(kit, url);
  },
};
export default spec;
