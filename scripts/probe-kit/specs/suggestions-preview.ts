/**
 * The suggestions preview (design-previews/suggestions/, built by its
 * app/build.ts): a state machine, one state at a time at its production
 * width beside its switcher, every state a link (`?__state=…`). Served as a
 * folder and read on Chromium and WebKit at a desk (1440 × 900). The spec
 * walks every state the switcher offers, as its links name them: each
 * direction (Today, Unsent drafts, The ledger, The tray), each of its
 * Where entries, each of its Data entries, light and dark.
 *
 * 1. Every state renders the owner's own starters at its width: the stage
 *    names the state, the frame stands at the Where's width (380, 725 or
 *    390), the theme is the state's, the switcher's groups are links with
 *    one chosen each, the state draws as many of his suggestions as it
 *    should (none, one, three, four of seven with "3 more", seven), and
 *    every sentence and reason drawn is one the hub wrote for him
 *    (app/starters.tsv): nothing made up. A loading state draws its
 *    placeholders and no suggestion, and holds still until the switcher
 *    moves.
 * 2. The overflow sweep (journeys/scan.ts: nothing spills, no control
 *    covers text) totals zero over every state.
 * 3. No console or page error.
 * 4. The press moments, each held on the clock (the DevTools Animation
 *    domain on Chromium, the page's own held clock on WebKit) and sought
 *    through: the drafts' travel into the box, the ledger's pencil→check,
 *    the tray's lift. Every run a press starts at one moment shares one
 *    start, one duration and one easing (one clock), on the house's
 *    tokens; and the press ends with his words in the box, the caret after
 *    them, and the live region saying "In the message box, ready to edit".
 *
 *   bun scripts/probe-kit/run.ts suggestions-preview
 *   SUGGESTIONS_ENGINES=chromium bun scripts/probe-kit/run.ts suggestions-preview
 */
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec } from "../kit";
import { ROOT, readMotion } from "../kit";

const DIR = join(ROOT, "design-previews", "suggestions");
const WIDTH: Record<string, number> = {
  thread: 380,
  board: 725,
  phone: 390,
  keyboard: 390,
};
/** His starters as the hub wrote them: every sentence and every reason. */
const HIS = (() => {
  const [, ...rows] = readFileSync(join(DIR, "app", "starters.tsv"), "utf8")
    .trim()
    .split("\n");
  const cells = rows.map((row) => row.split("\t"));
  return {
    texts: cells.map((c) => c[4] ?? ""),
    reasons: cells.map((c) => c[5] ?? ""),
  };
})();
/** The press each new direction makes, and the house duration its clock runs on. */
const PRESSES: [string, string, string][] = [
  ["drafts", "the drafts' travel into the box", "--dur-morph"],
  ["ledger", "the ledger's pencil→check", "--dur-control"],
  ["tray", "the tray's lift", "--dur-exit"],
];

/** How many of his suggestions a state draws, and whether it draws placeholders. */
function expected(
  direction: string,
  where: string,
  data: string
): { items: number; placeholders: boolean } {
  const total =
    { one: 1, "seven-collapsed": 7, "seven-expanded": 7, seven: 7 }[data] ?? 3;
  const shown =
    { one: 1, "seven-collapsed": 4, "seven-expanded": 7, seven: 7 }[data] ?? 3;
  if (data === "loading") {
    // The drafts stand down while the keyboard is up, placeholders and all.
    return {
      items: 0,
      placeholders: !(direction === "drafts" && where === "keyboard"),
    };
  }
  if (data === "none") {
    return { items: 0, placeholders: false };
  }
  switch (direction) {
    case "drafts":
      return {
        items: where === "keyboard" || data === "typing" ? 0 : shown,
        placeholders: false,
      };
    case "ledger":
      return data === "refresh"
        ? { items: 0, placeholders: true }
        : { items: shown, placeholders: false };
    case "tray": {
      if (data === "sent") {
        return { items: 0, placeholders: false };
      }
      // Words in the box (or the keyboard up): the tray is its chip row, every one of his.
      const chips =
        where === "keyboard" || data === "filled" || data === "scrolled";
      return { items: chips ? total : shown, placeholders: false };
    }
    default:
      return { items: shown, placeholders: false };
  }
}

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** Two frames past the last change, every finite run let go to its end. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
    for (const run of document.getAnimations()) {
      const end = run.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end)) {
        run.finish();
      }
    }
    await new Promise((done) => requestAnimationFrame(done));
  });
}

/**
 * A state opened by its link, as a person opens one: the page loaded at its
 * address. (Moving in place by the history API, as the switcher itself
 * does, WebKit refuses past a hundred moves in ten seconds.)
 */
async function go(page: Page, base: string, href: string): Promise<void> {
  await page.goto(new URL(href, base).href);
  await page.waitForSelector('[data-slot="stage"]');
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/** The switcher's links for one group, as the page draws them. */
async function links(
  page: Page,
  group: string
): Promise<{ value: string; href: string }[]> {
  return await page.evaluate(
    (g) =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          `[data-group="${g}"] a[data-entry]`
        ),
      ].map((a) => ({
        value: a.dataset.entry ?? "",
        href: a.getAttribute("href") ?? "",
      })),
    group
  );
}

interface StateRead {
  dark: boolean;
  groups: string[];
  items: number;
  key: string;
  placeholders: number;
  strangers: string[];
  width: number;
}

/** What the state draws, read in the page. */
function readStage(his: { texts: string[]; reasons: string[] }): StateRead {
  const stage = document.querySelector<HTMLElement>('[data-slot="stage"]');
  const frame = stage?.querySelector<HTMLElement>(".frame");
  const drawn = (el: Element) => el.getClientRects().length > 0;
  const items = [
    ...(stage?.querySelectorAll('[data-slot="suggestion"]') ?? []),
  ].filter(drawn);
  const strangers: string[] = [];
  for (const run of stage?.querySelectorAll('[data-slot="suggestion-text"]') ??
    []) {
    const text = run.textContent?.trim() ?? "";
    if (!his.texts.includes(text)) {
      strangers.push(text);
    }
  }
  for (const run of stage?.querySelectorAll(
    '[data-slot="suggestion-reason"]'
  ) ?? []) {
    const text = run.textContent?.trim() ?? "";
    if (!his.reasons.includes(text)) {
      strangers.push(text);
    }
  }
  return {
    key: stage?.dataset.state ?? "",
    width: Math.round(frame?.getBoundingClientRect().width ?? 0),
    dark: document.documentElement.classList.contains("dark"),
    groups: [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="switcher"] [data-group]'
      ),
    ].map((group) => {
      const all = group.querySelectorAll("a[href^='?__state=']").length;
      const on = group.querySelectorAll("a[aria-current='page']").length;
      return `${group.dataset.group}:${all}:${on}`;
    }),
    items: items.length,
    placeholders: [
      ...(stage?.querySelectorAll('[data-slot="skeleton"]') ?? []),
    ].filter(drawn).length,
    strangers,
  };
}

/** Leg 4: a press's runs held on the clock and sought through: one clock per moment, his words in the box after it. */
async function pressLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: string,
  [direction, name, token]: [string, string, string]
) {
  await go(
    page,
    base,
    `?__state=direction:${direction},where:thread,data:three,theme:light`
  );
  const item = page
    .locator('[data-slot="stage"] button[data-slot="suggestion"]')
    .first();
  const words = (
    (await item.locator('[data-slot="suggestion-text"]').textContent()) ?? ""
  ).trim();
  const held = await readMotion(
    page,
    () => item.click(),
    '[data-slot="stage"]',
    {
      fractions: [0, 0.5, 1],
    }
  );
  const wants = await page.evaluate(
    (t) => ({
      duration: getComputedStyle(document.documentElement)
        .getPropertyValue(t)
        .trim(),
      easing: getComputedStyle(document.documentElement)
        .getPropertyValue("--ease-out")
        .trim(),
    }),
    token
  );
  const ms = wants.duration.endsWith("ms")
    ? Number.parseFloat(wants.duration)
    : Number.parseFloat(wants.duration) * 1000;
  // The press's own runs (its Web Animations), in the moments they start together.
  const runs = held.runs.filter((run) => run.type === "WebAnimation");
  const moments = new Map<string, typeof runs>();
  for (const run of runs) {
    const at = run.start === null ? "held" : String(Math.round(run.start));
    moments.set(at, [...(moments.get(at) ?? []), run]);
  }
  const bad: string[] = [];
  for (const [at, group] of moments) {
    const lengths = new Set(
      group.map((run) => Math.round(run.end - run.delay))
    );
    const curves = new Set(group.map((run) => run.easing.replaceAll(" ", "")));
    if (
      group.length < 2 ||
      lengths.size !== 1 ||
      curves.size !== 1 ||
      !lengths.has(Math.round(ms)) ||
      !group.every((run) => run.ended)
    ) {
      bad.push(
        `at ${at}: ${group.length} runs, ${[...lengths].join("/")}ms, ${[...curves].join(" | ")}, ended ${group.map((run) => run.ended).join(",")}`
      );
    }
  }
  kit.check(
    `${engine} ${direction}: ${name} runs on one clock, ${moments.size} moment(s), ${runs.length} runs, each ${ms}ms on the house ease-out (${token}), held and sought on the ${held.by === "clock" ? "DevTools Animation domain" : "page's held clock"}`,
    runs.length >= 2 && bad.length === 0,
    `${bad.join(" | ")} ${JSON.stringify(runs.map((r) => [r.target, r.start, r.end, r.easing]))} want ${wants.easing}`
  );
  await settle(page);
  const after = await page.evaluate(() => {
    const field = document.querySelector<HTMLTextAreaElement>(
      '[data-slot="stage"] [data-slot="composer-field"]'
    );
    return {
      value: field?.value ?? "",
      caret: field ? field.selectionStart === field.value.length : false,
      said:
        document
          .querySelector('[data-slot="stage"] [aria-live="polite"]')
          ?.textContent?.trim() ?? "",
    };
  });
  kit.check(
    `${engine} ${direction}: after the press his words are in the box, the caret after them, and the live region says "${after.said}"`,
    after.value === words &&
      after.caret &&
      after.said === "In the message box, ready to edit",
    JSON.stringify(after)
  );
}

const spec: Spec = {
  name: "suggestions-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine and every state the switcher offers, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (
        process.env.SUGGESTIONS_ENGINES ?? "chromium,webkit"
      ).split(",") as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
        const page = await kit.page("desk", { engine, scale: 1 });
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text());
          }
        });
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(base);
        await page.waitForSelector('[data-slot="stage"]');
        await page.evaluate(() => document.fonts.ready);
        let states = 0;
        let spills = 0;
        const bad: string[] = [];
        const strangers = new Set<string>();
        const stillBad: string[] = [];
        for (const direction of await links(page, "direction")) {
          // biome-ignore lint/performance/noAwaitInLoops: one direction's states at a time, as the switcher offers them
          await go(page, base, direction.href);
          for (const where of await links(page, "where")) {
            // biome-ignore lint/performance/noAwaitInLoops: one place at a time
            await go(page, base, where.href);
            for (const data of await links(page, "data")) {
              for (const theme of ["light", "dark"]) {
                const key = `direction:${direction.value},where:${where.value},data:${data.value},theme:${theme}`;
                // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
                await go(page, base, `?__state=${key}`);
                const read = await page.evaluate(readStage, HIS);
                states += 1;
                const want = expected(direction.value, where.value, data.value);
                const groupsOk =
                  read.groups.length === 4 &&
                  read.groups.every(
                    (g) => g.endsWith(":1") && !g.includes(":0:")
                  );
                if (
                  read.key !== key ||
                  read.width !== WIDTH[where.value] ||
                  read.dark !== (theme === "dark") ||
                  !groupsOk ||
                  read.items !== want.items ||
                  read.placeholders > 0 !== want.placeholders
                ) {
                  bad.push(
                    `${key}: drew ${read.items} (want ${want.items}), placeholders ${read.placeholders} (want ${want.placeholders}), width ${read.width}, dark ${read.dark}, key ${read.key}, groups ${read.groups.join(" ")}`
                  );
                }
                for (const one of read.strangers) {
                  strangers.add(one);
                }
                const findings = await page.evaluate(scan);
                spills += findings.length;
                if (findings.length > 0) {
                  kit.note(
                    `${engine} ${key}: ${findings.slice(0, 3).join(" | ")}`
                  );
                }
                // A loading state holds still until the switcher moves.
                if (
                  data.value === "loading" &&
                  where.value === "thread" &&
                  theme === "light"
                ) {
                  await page.waitForTimeout(1500);
                  const later = await page.evaluate(readStage, HIS);
                  if (
                    later.items !== 0 ||
                    later.placeholders !== read.placeholders
                  ) {
                    stillBad.push(
                      `${key}: ${later.items} items, ${later.placeholders} placeholders after 1.5s`
                    );
                  }
                }
              }
            }
          }
        }
        kit.check(
          `${engine}: every direction × where × data × theme renders the owner's starters at its width, each switcher group a set of links with one chosen (${states} states)`,
          bad.length === 0 && states > 0,
          bad.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: every sentence and reason drawn is one the hub wrote for him (none made up)`,
          strangers.size === 0,
          [...strangers].slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: a loading state holds still until the switcher moves`,
          stillBad.length === 0,
          stillBad.join(" | ")
        );
        kit.check(
          `${engine}: the overflow sweep over all ${states} states totals ${spills}`,
          spills === 0
        );
        for (const press of PRESSES) {
          // biome-ignore lint/performance/noAwaitInLoops: one press at a time under one mouse
          await pressLeg(kit, page, base, engine, press);
        }
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
        await page.close();
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
