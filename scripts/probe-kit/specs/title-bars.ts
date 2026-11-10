/**
 * Every bar that heads a surface follows The Title Bars Follow Liquid Glass
 * Rule (DESIGN.md): one row, no ground, its controls floating glass groups
 * of bare symbols, the content under it blurring in from the first scroll.
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a project in a git folder, read by the rendered checks at 390,
 * 680, 1440 and 2529, light and dark, in each state the brief names:
 *
 * Caw's column: the hero (no conversation), a conversation (at rest at its
 * top, and scrolled under the bar), Caw off and on, the phone sheet with
 * its Close; the peek; Configure's Back on a phone; the artifact panel's
 * head, and expanded; Configure › Models, Usage and Who decides with no
 * page head under the bar; the kit's sheet and drawer, Close leading. Each
 * read saves its picture under the spec's output folder.
 *
 *   bun scripts/probe-kit/run.ts title-bars
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { BAR_ITEM } from "../../../apps/dashboard/src/lib/components/ui/bar-glass/marks";
import { cawPanelWords } from "../../../packages/core/src/words/onboarding";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import { open } from "../kit";
import { RenderedChecks } from "../rendered-checks";
import type { Kit, Spec, View } from "../spec";

/** A long answer: the conversation scrolls under the bar. */
const ANSWER = Array.from(
  { length: 24 },
  (_, i) =>
    `Step ${i + 1}: the glass groups float over the transcript, and the rows pass under them as you scroll.\n\n`
);

/** What a peeked session is asked: it answers slowly, so it is still working when peeked, and is done (~110s) before the pages after the peek are read, which wait for a page standing still. */
const SLOW = "Take your time over the glass bars.";

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Glass bars"] };
  }
  return request.last.includes(SLOW)
    ? { everyMs: 1500, words: Array.from({ length: 3 }, () => ANSWER).flat() }
    : { everyMs: 2, words: ANSWER };
};

const WIDTHS: { view: View; label: string }[] = [
  { view: "phone", label: "390" },
  { view: "narrowDesk", label: "680" },
  { view: "desk", label: "1440" },
  { view: "desk2529", label: "2529" },
];
const THEMES = ["light", "dark"] as const;

const shot = async (kit: Kit, page: Page, name: string) => {
  const dir = join(kit.out, "shots");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  await fleet.up();
  const base = await fleet.dashboard();
  const src = join(fleet.sandbox, "glass");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo here > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Glass bars",
      machineId: MACHINE,
      cwd: src,
    })
  );
  const at = `${base}/project/${project.id}`;
  const house = new RenderedChecks(kit, "title-bars");
  const SEAT = '[data-slot="caw-seat"]';
  const PANEL = "[data-caw-panel]";

  /** Caw's panel opened from his seat, pressed again until the page has hydrated and hears it. */
  const openPanel = async (tab: Page, ready: string): Promise<void> => {
    await open(tab, at, SEAT, 90_000);
    for (let tries = 0; tries < 10; tries += 1) {
      await tab.waitForTimeout(1500);
      if ((await tab.locator(ready).filter({ visible: true }).count()) > 0) {
        return;
      }
      await tab.locator(SEAT).first().click();
    }
    await tab.waitForSelector(ready, { timeout: 5000 });
  };

  /** Each width and scheme: the project page, Caw's panel opened from his seat. */
  const each = async (
    state: string,
    then?: (page: Page) => Promise<void>
  ): Promise<void> => {
    for (const theme of THEMES) {
      for (const { view, label } of WIDTHS) {
        const page = await kit.page(view, { theme });
        await openPanel(page, PANEL).catch(async (error: unknown) => {
          await shot(kit, page, `no-panel-${state}-${label}-${theme}`);
          throw error;
        });
        await page.waitForTimeout(800);
        await then?.(page);
        const where = `${state} ${label} ${theme}`;
        await house.at(page, where);
        await shot(kit, page, where.replaceAll(" ", "-"));
        await page.context().close();
      }
    }
  };

  // The hero: no conversation yet, Caw off (a new project's switch).
  await each("caw hero off");

  // A conversation running, with Caw on: read at the tail (rows under the
  // bar) and at its top (at rest).
  fleet.write("UPDATE projects SET events_on = 1 WHERE id = ?", project.id);
  const talk = await fleet.spawn("claude", "Glass bars", src, {
    projectId: project.id,
  });
  // Named as his panel's start names it (client `nameConversation`): the
  // conversation the project's row names is the one his panel shows.
  await fleet.api((hub) =>
    hub.api.projects({ id: project.id }).caw.conversation.post({
      instanceId: talk,
    })
  );
  await fleet.send(talk, "Walk me through the glass bars, step by step.");
  await each("caw conversation tail", async (page) => {
    await page
      .locator(`${PANEL} [data-slot="tr"]`)
      .first()
      .waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
  });
  await each("caw conversation top", async (page) => {
    const tr = page.locator(`${PANEL} [data-slot="tr"]`).first();
    await tr.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await tr.evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(800);
  });

  // Each control of the bar: hover, pressed and focus, at the desk.
  const desk = await kit.page("desk");
  await openPanel(desk, PANEL);
  await desk.waitForTimeout(1500);
  const items = desk.locator(`${PANEL} [data-slot="bar"] ${BAR_ITEM}`);
  const n = await items.count();
  // Docked beside the board, its Close (Hide panel) stands in a glass of
  // its own after the session's three.
  const closeAlone = await desk
    .locator(`${PANEL} [data-slot="bar"] [data-slot="tools"]`)
    .filter({ has: desk.locator("[data-caw-close]") })
    .locator(BAR_ITEM)
    .count();
  kit.check(
    "Caw's column: its bar holds Session details, New conversation and Open as tab as bare items, and its Close in a glass of its own",
    n === 4 && closeAlone === 1,
    `${n} item(s), ${closeAlone} in Close's glass`
  );
  for (let i = 0; i < n; i += 1) {
    const item = items.nth(i);
    const name = (await item.getAttribute("aria-label")) ?? `item ${i}`;
    await item.hover();
    await desk.waitForTimeout(300);
    await shot(kit, desk, `caw-hover-${i}`);
    const hovered = await item.evaluate(
      (node) => getComputedStyle(node).backgroundColor
    );
    kit.check(
      `Caw's column: ${name} takes a fill on hover`,
      hovered !== "rgba(0, 0, 0, 0)",
      hovered
    );
  }
  // The pointer leaves; Escape puts away Session details' card, and the
  // panel with it where Escape closes the panel: it is opened again.
  await desk.mouse.move(10, 10);
  await desk.keyboard.press("Escape");
  await desk.waitForTimeout(500);
  if ((await items.count()) === 0) {
    await openPanel(desk, PANEL);
    await items.first().waitFor({ timeout: 10_000 });
  }
  await items.first().focus();
  await desk.keyboard.press("Tab");
  await desk.waitForTimeout(300);
  await shot(kit, desk, "caw-focus");
  const ring = await desk.evaluate(
    () => getComputedStyle(document.activeElement as Element).outlineStyle ?? ""
  );
  kit.check(
    "Caw's column: a key's focus on a bar item draws its ring",
    ring !== "none",
    ring
  );

  // The phone sheet with its Close: the sheet's bar, then Close puts it away.
  const phone = await kit.page("phone");
  await openPanel(phone, "[data-caw-float-sheet]");
  await phone.waitForTimeout(1200);
  await shot(kit, phone, "caw-sheet");
  const close = phone.locator(
    '[data-caw-float-sheet] [data-slot="bar"] [aria-label="Close"]'
  );
  kit.check(
    "Caw's phone sheet: Close is a bare symbol in the sheet's bar",
    (await close.count()) === 1
  );
  await close.click();
  await phone.waitForTimeout(800);
  kit.check(
    "Caw's phone sheet: Close puts the sheet away",
    (await phone.locator("[data-caw-float-sheet]").count()) === 0
  );

  // The other surfaces cut over, each at the widths it stands at.
  /** One read of `url` at each width and scheme, once `ready` stands; `then` puts it in its state. */
  const surface = async (
    state: string,
    url: string,
    ready: string,
    widths: typeof WIDTHS,
    then?: (tab: Page) => Promise<void>,
    /** The surface the rules read: the one cut over, not the page round it. */
    scope?: string
  ): Promise<void> => {
    for (const theme of THEMES) {
      for (const { view, label } of widths) {
        const tab = await kit.page(view, { theme });
        const where = `${state} ${label} ${theme}`;
        try {
          await open(tab, url, ready, 90_000);
          // A working session's mark echoes three loops (7.2s), then stills.
          await tab.waitForTimeout(7500);
          await then?.(tab);
          await tab.waitForTimeout(800);
          await house.at(tab, where, scope ? { scope } : {});
        } catch (error) {
          kit.check(`${where}: the surface stands`, false, String(error));
        }
        await shot(kit, tab, where.replaceAll(" ", "-"));
        await tab.context().close();
      }
    }
  };
  const WIDE = WIDTHS.filter(
    ({ view }) => view === "desk" || view === "desk2529"
  );

  // The peek, from the rail's Working row (wide layouts only), of a
  // session still at work, beside a conversation (SessionSurface holds it).
  const busy = await fleet.spawn("claude", "Peek me", src, {
    projectId: project.id,
  });
  await fleet.send(busy, SLOW);
  await surface(
    "peek",
    `${base}/session/${talk}`,
    "[data-session-row-peek]",
    WIDE,
    async (tab) => {
      // Peek rises at the row's end under a resting pointer.
      const peek = tab.locator("[data-session-row-peek]").first();
      const box = await peek.boundingBox();
      if (box) {
        await tab.mouse.move(box.x - 120, box.y + box.height / 2);
        await tab.waitForTimeout(400);
      }
      await peek.click();
      await tab.waitForSelector('[data-peek-sheet] [data-slot="peek"]', {
        timeout: 30_000,
      });
      // The session mark's working echo plays its three loops, then stills.
      await tab.waitForTimeout(7500);
    },
    "[data-peek-sheet]"
  );

  // Configure's Back on a phone: the chevron alone in its glass group.
  await surface(
    "configure back",
    `${base}/config/models`,
    `[data-slot="crumb"] ${BAR_ITEM}`,
    WIDTHS.filter(({ view }) => view === "phone"),
    undefined,
    '[data-slot="top"]'
  );

  // A page artifact in the session's panel, for its head.
  await fleet.api((hub) =>
    hub.api.instances({ id: talk }).artifacts.post({
      kind: "page",
      does: "judge",
      ask: "Judge the glass bars page",
      name: "glass-page",
      title: "Glass bars page",
      html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Glass bars</title></head><body><h1 id="head">Glass bars</h1><p id="one">Every bar floats its controls in glass.</p></body></html>',
    })
  );
  const SESSION = `${base}/session/${talk}`;

  // Caw's column at its fullest bar: the conversation on show (the
  // project's newest, Peek me; caw-lead `conversation`) shows an artifact,
  // so Assistant | Preview stands in the trailing side beside its three
  // items (and, on a phone, Close). Every width reads it, and the bar's ink
  // stays on the screen (BarFloat gives its trailing side its whole width).
  // Its slow answer ends first: a page whose transcript still streams never
  // stands still to be read.
  for (const end = Date.now() + 240_000; Date.now() < end;) {
    const row = fleet.instance(busy);
    if (row?.turn_open_at === null && row.status === "running") {
      break;
    }
    await Bun.sleep(1000);
  }
  const shown = await fleet.api((hub) =>
    hub.api.instances({ id: busy }).artifacts.post({
      kind: "page",
      does: "judge",
      ask: "Judge the fullest bar",
      name: "fullest-bar",
      title: "Fullest bar",
      html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fullest bar</title></head><body><h1>Fullest bar</h1></body></html>',
    })
  );
  await fleet.api((hub) =>
    hub.api
      .instances({ id: busy })
      .artifacts({ artifact: shown.id })
      .show.post({})
  );
  await each("caw preview shown", async (page) => {
    // Showing brings Preview to the front, where the pane's own bar is the
    // panel's; Assistant is pressed back for the column's bar.
    const tabs = page.locator(`${PANEL} [data-slot="caw-tabs"]`).first();
    await tabs.waitFor({ timeout: 60_000 });
    if ((await page.locator(`${PANEL}[data-caw-tab="preview"]`).count()) > 0) {
      await tabs.getByRole("tab", { name: cawPanelWords.assistant }).click();
    }
    await page
      .locator(`${PANEL} [data-slot="bar"] [role="tablist"]`)
      .first()
      .waitFor({ timeout: 20_000 });
    // The shown artifact's mark echoes three loops (7.2s), then stills.
    await page.waitForTimeout(7500);
    const edge = await page.evaluate(
      ({ panel, item }) => {
        const bar = [
          ...document.querySelectorAll<HTMLElement>(
            `${panel} [data-slot="bar"]`
          ),
        ].find((one) => one.getClientRects().length > 0);
        const ink = [
          ...(bar?.querySelectorAll<HTMLElement>(`${item}, [role="tab"]`) ??
            []),
        ].map((one) => one.getBoundingClientRect());
        return {
          right: Math.max(...ink.map((one) => one.right)),
          left: Math.min(...ink.map((one) => one.left)),
          count: ink.length,
          width: window.innerWidth,
        };
      },
      { panel: PANEL, item: BAR_ITEM }
    );
    kit.check(
      `Caw's column ${edge.width}: its fullest bar (${edge.count} items and tabs) stands on the screen`,
      edge.count >= 5 && edge.left >= 0 && edge.right <= edge.width,
      `${Math.round(edge.left)}..${Math.round(edge.right)} of ${edge.width}`
    );
  });
  await surface(
    "artifact panel expanded",
    SESSION,
    '[data-slot="side-head"]',
    WIDTHS,
    async (tab) => {
      const expand = tab.locator(
        '[data-slot="side-head"] [aria-label="Expand"]'
      );
      if (await expand.isVisible().catch(() => false)) {
        await expand.click();
        await tab.waitForTimeout(900);
      }
    },
    '[data-slot="side-card"]'
  );

  // The artifact panel's head (the mode centred, the trailing glass, Close
  // in its own, the ask never a line under the name) beside the
  // conversation, read whole: the top bar's shelf and its session tabs
  // with it.
  await surface(
    "artifact head",
    `${base}/session/${talk}`,
    '[data-slot="side-head"]',
    WIDTHS
  );

  // Pages with no head of their own under the bar.
  await surface(
    "configure models",
    `${base}/config/models`,
    '[data-slot="lead"]',
    WIDTHS
  );
  await surface("usage", `${base}/usage`, '[data-slot="col"]', WIDTHS);
  await surface(
    "configure who decides",
    `${base}/config/decides`,
    '[data-slot="lead"]',
    WIDTHS
  );

  // The kit's sheet and drawer heads: Close leads, before the title
  // (DESIGN.md, Sheet), a bare symbol in its glass group.
  for (const kind of ["sheet", "drawer"] as const) {
    await surface(
      `kit ${kind}`,
      `${base}/motion/overlays`,
      `[data-open="${kind}"]`,
      WIDTHS,
      async (tab) => {
        await tab.locator(`[data-open="${kind}"]`).click();
        const header = tab.locator(`[data-slot="${kind}-header"]`);
        await header.waitFor({ timeout: 10_000 });
        await tab.waitForTimeout(600);
        const order = await header.evaluate(
          (node, { of, item }) => {
            const shut = node.querySelector(item);
            const title = node.querySelector(`[data-slot="${of}-title"]`);
            return shut && title
              ? {
                  close: shut.getBoundingClientRect().left,
                  title: title.getBoundingClientRect().left,
                  name: shut.getAttribute("aria-label"),
                }
              : null;
          },
          { of: kind, item: BAR_ITEM }
        );
        kit.check(
          `kit ${kind} ${tab.viewportSize()?.width}: Close leads its header, before the title`,
          !!order && order.close < order.title && order.name === "Close",
          JSON.stringify(order)
        );
      },
      `[data-slot="${kind}-content"]`
    );
  }

  house.report();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "title-bars",
  run,
};
export default spec;
