/**
 * Every bar that heads a surface follows The Title Bars Follow Liquid Glass
 * Rule (DESIGN.md): one row, no ground, its controls floating glass groups
 * of bare symbols, the content under it blurring in from the first scroll.
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a project in a git folder, read by the house rules at 390,
 * 680, 1440 and 2529, light and dark, in each state the brief names:
 *
 * Caw's column: the hero (no conversation), a conversation (at rest at its
 * top, and scrolled under the bar), Caw off and on, the phone sheet with
 * its Close. Each read saves its picture under the spec's output folder.
 *
 *   bun scripts/probe-kit/run.ts title-bars
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import { HouseRules } from "../house-rules";
import { type Kit, open, type Spec, type View } from "../kit";

/** A long answer: the conversation scrolls under the bar. */
const ANSWER = Array.from(
  { length: 24 },
  (_, i) =>
    `Step ${i + 1}: the glass groups float over the transcript, and the rows pass under them as you scroll.\n\n`
);

const respond = (request: Seen): Reply =>
  request.tools
    ? { everyMs: 2, words: ANSWER }
    : { everyMs: 5, words: ["Glass bars"] };

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
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
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
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Glass bars",
    machineId: MACHINE,
    cwd: src,
  });
  const at = `${base}/project/${project.id}`;
  const house = new HouseRules(kit, "title-bars", {});
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
  const items = desk.locator(`${PANEL} [data-slot="bar"] [data-bar-item]`);
  const n = await items.count();
  kit.check(
    "Caw's column: its bar holds Session details, New conversation and Open as tab as bare items",
    n === 3,
    `${n} item(s)`
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
  await desk.mouse.move(10, 10);
  await desk.keyboard.press("Escape");
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

  house.report();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "title-bars",
  run,
};
export default spec;
