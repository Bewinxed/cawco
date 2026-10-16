/**
 * The project's details, changed where they are shown (project head ›
 * ProjectDetails; the owner, 10-15: "should be able to just click on the
 * title"), on a scratch fleet in the built dashboard, read from the page's
 * engine and the hub's own record:
 *
 * 1. At 1440 and 390, light and dark: the head's place line and ⋯ › Project
 *    details… both unfold the tray under the head, inside the page's width,
 *    indented by the head's own leading padding (--space-7 at the desk,
 *    --space-5 on a phone), its tile the scheme's raised surface, labels
 *    beside their values at the desk and over them on a phone; the board
 *    under it still scrolls and takes a press (a card opens its task; on a
 *    phone the task's own page, and Back finds the tray waiting); Escape
 *    folds it.
 * 2. Each row changes at the hub, and a second context (390, dark) sees it
 *    live: Work lands (the hub's `lands`), Review before done, Caw's lead
 *    switch, a place added by its machine and folder, and removed. The
 *    repository is read from the folder's remote, said so.
 * 3. The primary place says it can't be removed and has no Remove.
 * 4. Refusals, in the hub's own words, under the row that asked, the row
 *    back at its value: a place whose folder is not absolute (the typed
 *    folder kept); and, for a project the hub no longer records, a landing
 *    and a Review change (404 "This project is no longer recorded").
 *
 *   bun scripts/probe-kit/run.ts web project-details
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  THEMES,
  type Theme,
  type View,
} from "../../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const TRAY = "[data-project-details]";
const LINE = "[data-place-line]";
const LEGS = [
  { name: "1440", view: "desk" },
  { name: "390", view: "phone" },
] as const;
const TASKS = 18;

/** The tray's geometry against the head and the page, and what each row shows. */
const readTray = (page: Page) =>
  page.evaluate((selector) => {
    const tray = document.querySelector(selector);
    const tile = tray?.querySelector('[data-slot="tile"]');
    const head = document.querySelector('[data-slot="project-head"]');
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r
        ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        : null;
    };
    const words = (el: Element | null | undefined) =>
      el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const rows = [...(tray?.querySelectorAll("[data-detail]") ?? [])].map(
      (row) => {
        const label = row
          .querySelector(
            ':is([data-slot="trigger-menu-label"], [data-task-labels-label], [data-slot="switch-field-label"], [data-slot="memory-editor-label"], [data-field-label], [data-slot="section-row-label"], [data-slot="picker-chip-label"], [data-slot="config-rail-label"], [data-slot="release-notes-label"], [data-slot="relay-label"], [data-slot="rings-key-label"], [data-slot="limits-block-label"], [data-slot="record-card-label"], [data-slot="decision-group-label"], [data-slot="view-pipeline-label"], [data-slot="mk-switch-label"], [data-slot="mk-input-label"], [data-slot="account-setup-label"], [data-slot="order-list-label"], [data-slot="project-details-label"], [data-slot="message-row-label"], [data-slot="peer-label"], [data-slot="thinking-label"], [data-slot="find-peek-label"], [data-slot="memory-body-label"], [data-slot="thinking-step-label"], [data-slot="tab-item-label"])'
          )
          ?.getBoundingClientRect();
        const value = row
          .querySelector(':is([data-slot="value"], [data-where-it-goes-value])')
          ?.getBoundingClientRect();
        return label && value ? value.top >= label.bottom - 0.5 : null;
      }
    );
    const probe = document.createElement("div");
    probe.style.background = "var(--surface-raised)";
    probe.style.paddingLeft = "var(--space-7)";
    probe.style.paddingRight = "var(--space-5)";
    document.body.append(probe);
    const probed = getComputedStyle(probe);
    const tokens = {
      raised: probed.backgroundColor,
      space7: Number.parseFloat(probed.paddingLeft),
      space5: Number.parseFloat(probed.paddingRight),
    };
    probe.remove();
    return {
      vw: document.documentElement.clientWidth,
      tray: box(tray),
      tile: box(tile),
      head: box(head),
      tileBg: tile ? getComputedStyle(tile).backgroundColor : null,
      tokens,
      stacked: rows,
      lands: words(
        tray?.querySelector("[data-slot='toggle-group-item'][data-state='on']")
      ),
      review:
        tray
          ?.querySelector("[data-review-switch]")
          ?.getAttribute("aria-checked") ?? null,
      caw:
        tray
          ?.querySelector("[data-caw-lead-switch]")
          ?.getAttribute("aria-checked") ?? null,
      places: [...(tray?.querySelectorAll("li[data-place]") ?? [])].map(
        (li) => ({
          path: words(li.querySelector('[data-slot="path"]')) ?? "",
          remove: li.querySelector("[data-remove-place]") !== null,
          kept: words(li.querySelector("[data-place-kept]")),
        })
      ),
      repository:
        words(
          tray?.querySelector(
            "[data-detail='repository'] :is([data-slot=\"value\"], [data-where-it-goes-value])"
          )
        ) ?? "",
      placeWords: words(tray?.querySelector("[data-place-words]")) ?? "",
      placeCut: (() => {
        const el = tray?.querySelector<HTMLElement>("[data-place-words]");
        return el ? el.scrollWidth > el.clientWidth + 1 : null;
      })(),
    };
  }, TRAY);

type Tray = Awaited<ReturnType<typeof readTray>>;

/** A Work lands segment, by its words. */
const segment = (page: Page, words: string) =>
  page.locator(`${TRAY} [data-slot='toggle-group-item']`, { hasText: words });

/** The board's scroller under a card (the first ancestor that scrolls), marked; null: none. */
const markScroller = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector(
      '[data-slot="project-page"] :is([data-slot="task-card"], [data-side-surface-class~="task-card"])'
    );
    for (let at = card?.parentElement; at; at = at.parentElement) {
      const flow = getComputedStyle(at).overflowY;
      if (
        (flow === "auto" || flow === "scroll") &&
        at.scrollHeight > at.clientHeight + 1
      ) {
        at.setAttribute("data-probe-scroller", "");
        return at.scrollTop;
      }
    }
    return null;
  });

/** Opens `url` on `page` and the tray from the place line. */
const openTray = async (page: Page, url: string) => {
  await open(page, url, LINE);
  await page.locator(LINE).click();
  await page.locator(TRAY).waitFor();
  await settle(page, 300);
};

interface Setup {
  base: string;
  fleet: KitFleet;
  gone: string;
  project: { id: string; name: string };
  second: string;
  url: string;
}

const setUp = async (kit: Kit): Promise<Setup> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  const second = join(fleet.sandbox, "second");
  const gone = join(fleet.sandbox, "gone");
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  // `second` is another checkout of Details' repository; `gone` is its own
  // (a folder of the same remote joins the project that has it).
  for (const [dir, repo] of [
    [src, "details"],
    [second, "details"],
    [gone, "gone"],
  ] as const) {
    await mkdir(dir, { recursive: true });
    const origin = `https://github.com/probe/${repo}.git`;
    await Bun.$`git init -q -b main && git remote add origin ${origin} && echo d > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(dir)
      .env({ ...process.env, HOME: home })
      .quiet();
  }
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Details", machineId: MACHINE, cwd: src }
  );
  for (let n = 1; n <= TASKS; n += 1) {
    await fleet.api(`/api/projects/${project.id}/tasks`, {
      title: `Task ${n}`,
    });
  }
  const base = await fleet.dashboard();
  return {
    base,
    fleet,
    gone,
    project,
    second,
    url: `${base}/project/${project.id}`,
  };
};

/** 1. Both ways in, its frame, and the board live under it, on one leg. */
const leg = async (
  kit: Kit,
  { project, url }: Setup,
  view: View,
  name: string,
  theme: Theme
) => {
  const tag = `${name} ${theme}`;
  const desk = view === "desk";
  const page = await kit.page(view, { theme });
  await openTray(page, url);
  const at = await readTray(page);
  const inset = (at.tile?.left ?? 0) - (at.head?.left ?? 0);
  const indent = desk ? at.tokens.space7 : at.tokens.space5;
  kit.check(
    `${tag}: the place line unfolds the tray under the head, inside the page`,
    at.tray !== null &&
      at.head !== null &&
      at.tray.top >= at.head.bottom - 1 &&
      (at.tile?.right ?? Number.POSITIVE_INFINITY) <= at.vw &&
      (at.tile?.left ?? -1) >= 0,
    JSON.stringify({ tray: at.tray, head: at.head, vw: at.vw })
  );
  kit.check(
    `${tag}: indented by the head's own leading padding (${indent}px)`,
    Math.abs(inset - indent) <= 0.5,
    `${inset.toFixed(2)}px from the head's edge`
  );
  kit.check(
    `${tag}: its tile is the scheme's raised surface, labels ${desk ? "beside" : "over"} their values`,
    at.tileBg === at.tokens.raised &&
      at.stacked.length === 5 &&
      at.stacked.every((stacked) => stacked === !desk),
    `${at.tileBg} vs ${at.tokens.raised}; stacked ${JSON.stringify(at.stacked)}`
  );
  kit.check(
    `${tag}: the Place row says the whole folder the head's line cuts short`,
    at.placeWords.endsWith("/src") && at.placeCut === false,
    `“${at.placeWords}”, cut ${at.placeCut}`
  );
  // The board under it: it scrolls, and a press on a card opens its task.
  const before = await markScroller(page);
  const after = await page
    .locator("[data-probe-scroller]")
    .evaluate((el) => {
      el.scrollTop += 200;
      return el.scrollTop;
    })
    .catch(() => null);
  const card = page
    .locator(
      '[data-slot="project-page"] :is([data-slot="task-card"], [data-side-surface-class~="task-card"])'
    )
    .first();
  const taskId = (await card.getAttribute("data-task")) ?? "\0";
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForURL((href) => href.href.includes(taskId), {
    timeout: 15_000,
  });
  // A phone opens the task as its own page: Back finds the tray waiting.
  if (!desk) {
    await page.goBack();
    await page.locator(LINE).waitFor();
  }
  const standing = await page.locator(TRAY).count();
  kit.check(
    `${tag}: the board under the tray still scrolls and takes a press, the tray standing`,
    before !== null && after !== null && after > before && standing === 1,
    `scroll ${before} → ${after}; task ${taskId}; ${standing} tray`
  );
  if (theme === "light") {
    await page.screenshot({ path: join(kit.out, `${name}-${theme}-open.png`) });
  }
  // Escape folds it; ⋯ › Project details… opens it again.
  await page.locator(`${TRAY} [data-details-done]`).focus();
  await page.keyboard.press("Escape");
  await page.locator(TRAY).waitFor({ state: "detached" });
  await page.locator(`[aria-label="More for ${project.name}"]`).click();
  await page.getByRole("menuitem", { name: "Project details…" }).click();
  await page.locator(TRAY).waitFor();
  await settle(page, 300);
  kit.check(
    `${tag}: Escape folds it, and ⋯ › Project details… opens it again`,
    (await page.locator(TRAY).count()) === 1
  );
  if (theme === "dark") {
    await page.screenshot({ path: join(kit.out, `${name}-${theme}-open.png`) });
  }
  await page.close();
};

/** Whether the second context comes to show what `test` asks within 15s. */
const comesTo = async (page: Page, test: (now: Tray) => boolean) => {
  try {
    await until("the second context", () => readTray(page), test, 15_000);
    return true;
  } catch {
    return false;
  }
};

/** 2 and 3: each row at the hub, seen live by a second context; the primary kept. */
const rows = async (kit: Kit, { fleet, project, second, url }: Setup) => {
  const record = () =>
    fleet.query<{ lands: string; review: number; caw: number }>(
      "SELECT lands, review, caw FROM projects WHERE id = ?",
      project.id
    )[0];
  const placesAtHub = () =>
    fleet
      .query<{ path: string }>(
        "SELECT path FROM project_places WHERE project_id = ?",
        project.id
      )
      .map((one) => one.path);
  const page = await kit.page("desk");
  const other = await kit.page("phone", { theme: "dark" });
  await openTray(page, url);
  await openTray(other, url);

  const { repository } = await readTray(page);
  kit.check(
    "the repository is read from the folder's remote, and says so",
    repository.includes("probe/details") &&
      repository.includes("From the folder's remote"),
    repository
  );

  await segment(page, "Pull request").click();
  await until(
    "the hub's lands",
    () => record()?.lands,
    (v) => v === "pr"
  );
  kit.check(
    "Work lands: Pull request is the hub's, and the second context shows it live",
    (await readTray(page)).lands === "Pull request" &&
      (await comesTo(other, (now) => now.lands === "Pull request"))
  );

  const reviewWas = record()?.review === 1;
  await page.locator(`${TRAY} [data-review-switch]`).click();
  await until(
    "the hub's review",
    () => record()?.review === 1,
    (v) => v !== reviewWas
  );
  kit.check(
    "Review before done flips at the hub, and the second context shows it live",
    await comesTo(other, (now) => now.review === String(!reviewWas)),
    `hub review ${record()?.review}`
  );

  const cawWas = record()?.caw === 1;
  await page.locator(`${TRAY} [data-caw-lead-switch]`).click();
  // Off over his own work asks first (CawLeadSwitch): let it finish.
  const finish = page
    .locator(
      "[data-caw-turn-line] button:has-text('Let him finish'), [data-stop-other]"
    )
    .first();
  await finish
    .waitFor({ timeout: 3000 })
    .then(() => finish.click())
    .catch(() => undefined);
  await until(
    "Caw flipped at the hub",
    () => record()?.caw === 1,
    (v) => v !== cawWas,
    30_000
  );
  kit.check(
    "Caw's lead switch flips him at the hub, and the second context's switch follows",
    await comesTo(other, (now) => now.caw === String(!cawWas)),
    `hub caw ${record()?.caw}`
  );

  await page.locator(`${TRAY} [data-places-toggle]`).click();
  await settle(page, 300);
  const listed = (await readTray(page)).places;
  const primary = listed.find((one) => one.path.endsWith("/src"));
  kit.check(
    "the primary place says it can't be removed, and offers no Remove",
    primary !== undefined &&
      !primary.remove &&
      (primary.kept ?? "").includes("can't be removed"),
    JSON.stringify(listed)
  );

  // A refused add: the hub's words under the fields, the typed folder kept.
  await page.locator(`${TRAY} [data-add-place]`).click();
  const field = page.locator(`${TRAY} [data-add-place-form] input`);
  const submit = page.locator(
    `${TRAY} [data-add-place-form] button[type='submit']`
  );
  await field.fill("relative/folder");
  await submit.click();
  const addFault = page.locator(
    `${TRAY} [data-add-fault] :is([data-slot="reason"], [data-delegate-tail-kind~="reason"])`
  );
  await addFault.waitFor({ timeout: 15_000 });
  const addWords = (await addFault.textContent())?.trim() ?? "";
  kit.check(
    "a refused place: the hub's words under the fields, the typed folder kept",
    addWords.length > 0 &&
      !addWords.startsWith("Not added: the hub answered") &&
      (await field.inputValue()) === "relative/folder",
    addWords
  );

  await field.fill(second);
  await submit.click();
  await until("the place at the hub", placesAtHub, (paths) =>
    paths.includes(second)
  );
  await other.locator(`${TRAY} [data-places-toggle]`).click();
  const lists = (now: Tray) => now.places.some((one) => one.path === second);
  const addedHere = await comesTo(page, lists);
  const addedThere = await comesTo(other, lists);
  kit.check(
    "a place added by machine and folder is the hub's, and both contexts list it",
    addedHere && addedThere,
    `this page ${addedHere}; the second ${addedThere}`
  );
  await page
    .locator(`${TRAY} li[data-place]`, { hasText: second })
    .locator("[data-remove-place]")
    .click();
  await until(
    "the place gone at the hub",
    placesAtHub,
    (paths) => !paths.includes(second)
  );
  // The hub's record goes before the page's own read of the projects lands.
  const dropped = (now: Tray) => !now.places.some((one) => one.path === second);
  const here = await comesTo(page, dropped);
  const there = await comesTo(other, dropped);
  kit.check(
    "Remove takes the place off at the hub, and both contexts drop it",
    here && there,
    `this page ${here ? "dropped it" : "still lists it"}; the second ${there ? "dropped it" : "still lists it"}`
  );
  await other.close();
  await page.close();
};

/** 4: a project the hub no longer records refuses each change, in its words. */
const refusals = async (kit: Kit, { base, fleet, gone }: Setup) => {
  const doomed = await fleet.api<{ id: string }>("/api/projects", {
    name: "Gone",
    machineId: MACHINE,
    cwd: gone,
  });
  const page = await kit.page("desk", { theme: "dark" });
  await openTray(page, `${base}/project/${doomed.id}`);
  const forgot = await fetch(`${fleet.base}/api/projects/${doomed.id}`, {
    method: "DELETE",
  });
  kit.check(
    "the second project is forgotten at the hub",
    forgot.ok,
    `${forgot.status}`
  );
  await segment(page, "Branch").click();
  const landsFault = page.locator(
    `${TRAY} [data-lands-fault] :is([data-slot="reason"], [data-delegate-tail-kind~="reason"])`
  );
  await landsFault.waitFor({ timeout: 15_000 });
  await settle(page, 300);
  const afterLands = await readTray(page);
  const landsWords = (await landsFault.textContent())?.trim() ?? "";
  kit.check(
    "a refused landing: the hub's words under Work lands, the segment back on Main",
    landsWords.includes("no longer recorded") && afterLands.lands === "Main",
    `“${landsWords}”; on ${afterLands.lands}`
  );
  await page.locator(`${TRAY} [data-review-switch]`).click();
  const reviewFault = page.locator(
    `${TRAY} [data-review-fault] :is([data-slot="reason"], [data-delegate-tail-kind~="reason"])`
  );
  await reviewFault.waitFor({ timeout: 15_000 });
  await settle(page, 300);
  const reviewWords = (await reviewFault.textContent())?.trim() ?? "";
  const afterReview = (await readTray(page)).review;
  kit.check(
    "a refused Review: the hub's words under the row, the switch back where it was",
    reviewWords.includes("no longer recorded") &&
      afterReview === afterLands.review,
    `“${reviewWords}”; ${afterLands.review} → ${afterReview}`
  );
  await page.screenshot({ path: join(kit.out, "1440-dark-refused.png") });
  await page.close();
};

const run = async (kit: Kit) => {
  const setup = await setUp(kit);
  for (const { view, name } of LEGS) {
    for (const theme of THEMES) {
      await leg(kit, setup, view, name, theme);
    }
  }
  await rows(kit, setup);
  await refusals(kit, setup);
};

export default { name: "project-details", run } satisfies Spec;
