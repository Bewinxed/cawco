/**
 * A project's row in the rail is a link to its page (owner: "also on the
 * sidebar i need to be able to click on the project to open it, right now
 * i'm only able to do that via rightclick"). Its mark is the separate
 * switch that folds its sessions, as a session's mark folds its delegates.
 * On the built dashboard against a scratch fleet, one project with two
 * sessions.
 *
 * Desk 1440:
 * - (a) a click on the project's name lands on /project/<id>, the row is the
 *   active one (aria-current, data-active), and the fold is unchanged;
 * - (b) a click on the mark flips its aria-expanded and mounts or unmounts
 *   the session rows, the URL unchanged;
 * - (c) Enter on the focused row navigates; Enter and Space on the focused
 *   mark each flip the fold, the URL unchanged.
 * Phone 390: a tap on the row in the sheet navigates and the sheet closes.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const NAME = "Harbour";
const SESSIONS = ["Alpha", "Beta"];

/** The row, the mark's switch, and what the row's tree shows now. */
const state = (page: Page, href: string, scope: string) =>
  page.evaluate(
    ([want, within]) => {
      const row = document.querySelector<HTMLAnchorElement>(
        `${within} a[data-sidebar="menu-button"][href="${want}"]`
      );
      const item = row?.closest("li");
      const hit = row?.querySelector(".tree-mark .hit");
      return {
        path: location.pathname,
        row: row !== null,
        rowExpanded: row?.getAttribute("aria-expanded") ?? null,
        current: row?.getAttribute("aria-current") ?? null,
        active: row?.getAttribute("data-active") ?? null,
        expanded: hit?.getAttribute("aria-expanded") ?? null,
        label: hit?.getAttribute("aria-label") ?? null,
        sessions:
          item?.querySelectorAll(
            "[data-slot='sidebar-menu-sub'] a[href^='/session/']"
          ).length ?? 0,
      };
    },
    [href, scope] as const
  );

type State = Awaited<ReturnType<typeof state>>;
const line = (s: State) => JSON.stringify(s);

async function desk(kit: Kit, base: string, href: string) {
  const RAIL = "aside.rail";
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  const row = page.locator(
    `${RAIL} a[data-sidebar="menu-button"][href="${href}"]`
  );
  const mark = row.locator(".tree-mark .hit");
  await open(page, `${base}/session`, `${RAIL} a[href="${href}"]`);
  await settle(page);
  // Open it first, so its sessions are there to stay or go.
  if ((await state(page, href, RAIL)).expanded !== "true") {
    await mark.click();
    await settle(page);
  }
  await page.waitForFunction(
    ([want, n]) =>
      (document
        .querySelector(`a[data-sidebar="menu-button"][href="${want}"]`)
        ?.closest("li")
        ?.querySelectorAll(
          "[data-slot='sidebar-menu-sub'] a[href^='/session/']"
        ).length ?? 0) >= (n as number),
    [href, SESSIONS.length] as const
  );
  const before = await state(page, href, RAIL);
  kit.check(
    "desk 1440: the row is a link with no aria-expanded; its mark is the named switch, open, the two sessions under it",
    before.rowExpanded === null &&
      before.expanded === "true" &&
      before.label === `Hide ${NAME}'s sessions` &&
      before.sessions === SESSIONS.length &&
      before.current === null,
    line(before)
  );

  // (a) The name.
  await row.locator("span.truncate").click();
  await page.waitForURL(`**${href}`);
  await settle(page);
  const named = await state(page, href, RAIL);
  kit.check(
    "desk 1440 (a): a click on the name lands on the project page, the row active, the fold unchanged",
    named.path === href &&
      named.current === "page" &&
      named.active === "true" &&
      named.expanded === "true" &&
      named.sessions === SESSIONS.length,
    line(named)
  );

  // (b) The mark, both ways.
  await mark.click();
  await settle(page);
  const shut = await state(page, href, RAIL);
  await mark.click();
  await settle(page);
  const reopened = await state(page, href, RAIL);
  kit.check(
    "desk 1440 (b): a click on the mark folds the sessions away and back, the URL unchanged",
    shut.expanded === "false" &&
      shut.sessions === 0 &&
      shut.label === `Show ${NAME}'s sessions` &&
      shut.path === href &&
      reopened.expanded === "true" &&
      reopened.sessions === SESSIONS.length &&
      reopened.path === href,
    `shut ${line(shut)}; reopened ${line(reopened)}`
  );

  // (c) The keys. Enter on the row, from the fleet board.
  await page.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
  await row.waitFor();
  await settle(page);
  await row.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**${href}`);
  await settle(page);
  const entered = await state(page, href, RAIL);
  kit.check(
    "desk 1440 (c): Enter on the focused row opens the project page, the fold unchanged",
    entered.path === href &&
      entered.current === "page" &&
      entered.expanded === "true",
    line(entered)
  );
  await mark.focus();
  await page.keyboard.press("Enter");
  await settle(page);
  const byEnter = await state(page, href, RAIL);
  await page.keyboard.press(" ");
  await settle(page);
  const bySpace = await state(page, href, RAIL);
  kit.check(
    "desk 1440 (c): Enter on the focused mark folds the sessions, Space opens them, the URL unchanged",
    byEnter.expanded === "false" &&
      byEnter.sessions === 0 &&
      byEnter.path === href &&
      bySpace.expanded === "true" &&
      bySpace.sessions === SESSIONS.length &&
      bySpace.path === href,
    `Enter ${line(byEnter)}; Space ${line(bySpace)}`
  );
  await page.close();
}

async function phone(kit: Kit, base: string, href: string) {
  const SHEET = ".rail-sheet";
  const page = await kit.page("phone");
  page.setDefaultTimeout(60_000);
  await open(page, `${base}/session`, ".burger");
  await settle(page);
  await page.click(".burger");
  const row = page.locator(
    `${SHEET} a[data-sidebar="menu-button"][href="${href}"]`
  );
  await row.waitFor();
  await settle(page);
  // The mark's switch under a finger: its touch area (`.touch-hit::after`)
  // reaches sideways to the name and no further.
  const reach = await row.evaluate((el) => {
    const hit = el.querySelector(".tree-mark .hit") as HTMLElement;
    const name = el.querySelector("span.truncate") as HTMLElement;
    const box = hit.getBoundingClientRect();
    const after = getComputedStyle(hit, "::after");
    const left = box.left + Number.parseFloat(after.left);
    const width = Number.parseFloat(after.width);
    return {
      width,
      right: Math.round((left + width) * 100) / 100,
      name: Math.round(name.getBoundingClientRect().left * 100) / 100,
    };
  });
  kit.check(
    "phone 390: the mark's touch area is wider than the tile and ends at the name",
    reach.width >= 30 && Math.abs(reach.right - reach.name) <= 0.5,
    JSON.stringify(reach)
  );
  await row.locator("span.truncate").tap();
  await page.waitForURL(`**${href}`);
  await page.waitForSelector(SHEET, { state: "hidden", timeout: 10_000 });
  await settle(page);
  const after = await page.evaluate(
    (sel) => ({
      path: location.pathname,
      sheet: [...document.querySelectorAll(sel)].some(
        (el) => el.getBoundingClientRect().width > 0
      ),
    }),
    SHEET
  );
  kit.check(
    "phone 390: a tap on the row in the sheet opens the project page and the sheet closes",
    after.path === href && !after.sheet,
    JSON.stringify(after)
  );
  await page.close();
}

const spec: Spec = {
  name: "project-row",
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
    for (const title of SESSIONS) {
      await fleet.spawn("claude", title, fleet.repo, { projectId: project.id });
    }
    const base = await fleet.dashboard();
    const href = `/project/${project.id}`;
    await desk(kit, base, href);
    await phone(kit, base, href);
  },
};
export default spec;
