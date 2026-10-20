/**
 * Files: every artifact and attachment of a conversation in one place
 * (owner: "there's currently no way to view all the previous artifacts or
 * files for a session easily"), its pins held to the built dashboard.
 *
 *   bun scripts/probe-kit/run.ts web files-panel
 *
 * A scratch fleet; three sessions: one with nothing, one with one page, and
 * one with 42 pages (one with a 63-character name, one whose words hold
 * "pricing tiers", one whose kept picture won't decode, two never pictured)
 * and nine attachments (texts and pictures, over three sends). Seeded
 * through the hub's own routes, as the dashboard and the pane write them.
 * At 1440 (desk), 680 and 390, light and dark:
 *
 *  1. desk: the Files control stands inside the bar's glass group, and its
 *     count's box is no wider or taller than the folder's (pin 1, 9);
 *  2. desk: Files floats (a fixed box, the page's height unchanged);
 *  3. desk: each region scrolls on its own (scrollHeight > clientHeight on
 *     the region's scroller, the page not growing) (pin 2);
 *  4. desk: the rule between the regions is the vermillion token,
 *     `brand-solid`, whole (pin 4, review-4 item 1);
 *  5. desk: an overflowing region says how many more, the count of its
 *     items standing past its foot (review-4 item 3);
 *  6. desk: search finds by title and by the words on a page, marks the
 *     hit, and says when nothing matches (pin 4);
 *  7. desk: a picked artifact opens floating on Files' left, its edge the
 *     row-outline token (pin 2, review-4 item 2);
 *  8. a picture that won't load, and a page never pictured, stand as their
 *     kind's glyph in the well;
 *  9. phone and 680: Files is the vaul drawer from the sidebar's row, with
 *     Artifacts | Attachments tabs (pins 3, 11);
 * 10. none, one, the list unreadable (offline): each says so in place;
 * 11. the overflow sweep (journeys/scan.ts) over every state totals zero;
 * 12. no console error.
 *
 * One capture per state at 390 and 1440, light and dark, in caps/files-panel/.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, in order
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, until } from "../../../scratch-fleet";
import { tokenColour } from "../../geom";
import { scan } from "../../journeys/scan";
import {
  COMPOSER,
  type Kit,
  open,
  ROOT,
  type Spec,
  THEMES,
  type Theme,
  type View,
} from "../../kit";

const CAPS = join(ROOT, "caps", "files-panel");
const MANY = 42;
const LONG_NAME =
  "a-page-whose-name-runs-on-and-on-to-the-very-end-of-what-it-may";
const PRICING = "pricing-notes";
const BROKEN = "broken-picture";
const UNPICTURED = ["never-pictured", "also-unpictured"];
const ATTACHMENT_SENDS = 3;

/** The session's artifact list read, which the offline leg refuses. */
const ARTIFACT_LIST = /\/api\/instances\/[^/]+\/artifacts$/;
/** Files' search of a session's artifacts. */
const SEARCH_READ = /\/artifacts\/search\?/;
/** The session's attachments read. */
const ATTACHMENT_LIST = /\/api\/instances\/[^/]+\/attachments$/;
/** How long the slow legs hold each list read back: past the grace, so the skeleton stands. */
const HELD_MS = 2500;
/** The sidebar row's name once its count stands. */
const FILES_COUNTED = /Files, \d+/;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** Every console error and page error, by page. */
const errors = new Map<Page, string[]>();
const watch = (page: Page) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on("console", (message) => {
    if (message.type() === "error") {
      seen.push(message.text());
    }
  });
  page.on("pageerror", (error) => seen.push(String(error)));
};

/** The overflow sweep's findings, summed over every state. */
const sweeps: { state: string; findings: string[] }[] = [];
const sweep = async (page: Page, state: string) => {
  sweeps.push({ state, findings: await page.evaluate(scan) });
};

const shot = async (page: Page, name: string) => {
  await mkdir(CAPS, { recursive: true });
  await page.screenshot({ path: join(CAPS, `${name}.png`) });
};

/** The page's own scroll height against its viewport: Files never grows the page. */
const pageGrows = (page: Page) =>
  page.evaluate(
    () =>
      (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight + 1
  );

/** Opens a session's conversation with the workspace holding it alone. */
const openSession = async (
  kit: Kit,
  base: string,
  view: View,
  theme: Theme,
  id: string,
  before?: (page: Page) => Promise<void>
): Promise<Page> => {
  const page = await kit.page(view, { theme });
  watch(page);
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [id] as const
  );
  await before?.(page);
  await open(page, `${base}/session/${id}`, '[data-slot="pane"]');
  return page;
};

/**
 * Seeds a session's artifacts through the dashboard's origin (the hub's
 * routes, as the dashboard and the pane call them): pages, and for each
 * the thumbnail a pane would keep, drawn on a canvas at its own shape.
 */
const seed = (page: Page, id: string, names: string[]) =>
  page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, every seed in it
    async ({ instanceId, names: all, pricing, broken, unpictured }) => {
      const made: string[] = [];
      for (const [i, name] of all.entries()) {
        const words =
          name === pricing
            ? "The pricing tiers for the hub, and what each plan carries."
            : `Page ${i} of the session's work.`;
        const response = await fetch(
          `/api/instances/${encodeURIComponent(instanceId)}/artifacts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "page",
              name,
              does: "judge",
              ask: `Judge ${name}: pin anything that reads wrong`,
              html: `<!doctype html><html><body><h1>${name}</h1><p>${words}</p></body></html>`,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(
            `create ${name}: ${response.status} ${await response.text()}`
          );
        }
        const { id: artifactId } = (await response.json()) as { id: string };
        made.push(artifactId);
        if (unpictured.includes(name)) {
          continue;
        }
        let light: string;
        if (name === broken) {
          // A PNG's signature and header, and nothing a decoder can draw.
          const bytes = new Uint8Array(64);
          bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
          bytes.set(
            [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 160],
            8
          );
          light = btoa(String.fromCharCode(...bytes));
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = [200, 240, 427, 180][i % 4] ?? 200;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = `oklch(0.94 0.03 ${(i * 37) % 360})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#222";
            ctx.font = "bold 22px sans-serif";
            ctx.fillText(name.slice(0, 22), 16, 40);
            ctx.fillStyle = "#888";
            for (let row = 0; row < 6; row += 1) {
              ctx.fillRect(16, 64 + row * 18, 240 - row * 20, 8);
            }
          }
          light = canvas.toDataURL("image/png").split(",")[1] ?? "";
        }
        const kept = await fetch(
          `/api/instances/${encodeURIComponent(instanceId)}/artifacts/${encodeURIComponent(artifactId)}/thumbnail`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ light, dark: null, single: true }),
          }
        );
        if (!kept.ok) {
          throw new Error(
            `thumbnail ${name}: ${kept.status} ${await kept.text()}`
          );
        }
      }
      return made;
    },
    {
      instanceId: id,
      names,
      pricing: PRICING,
      broken: BROKEN,
      unpictured: UNPICTURED,
    }
  );

/** A small PNG, base64, a picture an attachment carries. */
const PICTURE =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHElEQVR4nGP8z8Dwn4GBgYGJgYGBgYmBgYEBAD8+Ag7Q2s8bAAAAAElFTkSuQmCC";

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();

  const many = await fleet.spawn("claude", "files many", fleet.repo);
  const one = await fleet.spawn("claude", "files one", fleet.repo);
  const none = await fleet.spawn("claude", "files none", fleet.repo);
  const noneOpenCode = await fleet.spawn(
    "opencode",
    "files none opencode",
    fleet.repo
  );

  // The seeds, through the dashboard's origin.
  const seeder = await openSession(kit, base, "desk", "light", many);
  const names = [
    ...Array.from(
      { length: MANY - 4 - UNPICTURED.length },
      (_, i) => `page-${i + 1}`
    ),
    LONG_NAME,
    PRICING,
    BROKEN,
    "tall-board",
    ...UNPICTURED,
  ];
  await seed(seeder, many, names);
  await seed(seeder, one, ["the-only-page"]);
  await seeder.close();
  // Three sends, each carrying two texts and a picture.
  for (let i = 0; i < ATTACHMENT_SENDS; i += 1) {
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: MACHINE,
      sessionId: many,
      payload: {
        instanceId: many,
        attachments: [
          {
            kind: "text",
            name: `brief-${i + 1}.md`,
            content: `# Brief ${i + 1}\n\nWhat the panel should hold.`,
          },
          {
            kind: "text",
            name: `notes-${i + 1}.txt`,
            content: `Notes ${i + 1}`,
          },
        ],
        images: [{ mediaType: "image/png", data: PICTURE }],
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: `Files, send ${i + 1}` },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
  }

  await reviewLegs(kit, base, { many, one });
  await askLegs(kit, base, none, noneOpenCode);
  await roundThree(kit, base, fleet, { many, one, none });
  for (const theme of THEMES) {
    await desk(kit, base, theme, { many, one, none });
    for (const view of ["phone", "narrowDesk"] as const) {
      await narrowLeg(kit, base, view, theme, many);
    }
  }

  const total = sweeps.reduce((sum, swept) => sum + swept.findings.length, 0);
  kit.check(
    "11: the overflow sweep over every state totals zero",
    total === 0,
    sweeps
      .filter((swept) => swept.findings.length > 0)
      .map((swept) => `${swept.state}: ${swept.findings.join(" | ")}`)
      .join("; ") || `${sweeps.length} states swept`
  );
  const logged = [...errors.values()].flat();
  kit.check(
    "12: no console error on any page",
    logged.length === 0,
    logged.slice(0, 6).join(" | ")
  );
};

/** The desk legs, at 1440, in one theme. */
const desk = async (
  kit: Kit,
  base: string,
  theme: Theme,
  ids: { many: string; one: string; none: string }
) => {
  const page = await openSession(kit, base, "desk", theme, ids.many);
  const control = page.locator("[data-files-control]");
  await control.waitFor();
  await until(
    "the Files count",
    () => page.locator("[data-files-count]").count(),
    (n) => n > 0,
    60_000
  );
  // 1. The control in the group, and its count no larger than its folder.
  const bar = await page.evaluate(() => {
    const item = document.querySelector("[data-files-control]");
    const glyph = document.querySelector("[data-files-glyph]");
    const count = document.querySelector("[data-files-count]");
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    return {
      inGroup: !!item?.closest("[data-bar-group]"),
      glyph: rect(glyph),
      count: rect(count),
      overlap:
        glyph && count
          ? Math.max(
              0,
              Math.min(
                glyph.getBoundingClientRect().right,
                count.getBoundingClientRect().right
              ) -
                Math.max(
                  glyph.getBoundingClientRect().left,
                  count.getBoundingClientRect().left
                )
            )
          : -1,
      said: count?.textContent,
    };
  });
  kit.check(
    `1 (${theme}): Files stands in the bar's glass group, its count's box no wider or taller than the folder's and clear of its ink`,
    bar.inGroup &&
      !!bar.glyph &&
      !!bar.count &&
      bar.count.w <= bar.glyph.w &&
      bar.count.h <= bar.glyph.h &&
      bar.overlap === 0,
    JSON.stringify(bar)
  );
  await shot(page, `closed-1440-${theme}`);
  await sweep(page, `closed 1440 ${theme}`);

  const heightBefore = await page.evaluate(
    () => document.scrollingElement?.scrollHeight ?? 0
  );
  await control.click();
  const panel = page.locator("[data-glass-card-frame='files-pop']");
  await panel.waitFor();
  await page.locator("[data-files-card]").first().waitFor();
  await page.waitForTimeout(600);

  // 2. It floats.
  const floats = await page.evaluate(() => {
    const pop = document.querySelector<HTMLElement>("[data-glass-card-frame='files-pop']");
    let positioned = "";
    for (let at: HTMLElement | null = pop; at; at = at.parentElement) {
      const { position } = getComputedStyle(at);
      if (position === "fixed" || position === "absolute") {
        positioned = position;
        break;
      }
    }
    return { positioned, height: document.scrollingElement?.scrollHeight ?? 0 };
  });
  kit.check(
    `2 (${theme}): Files floats: a fixed or absolute box, the page's height unchanged`,
    floats.positioned !== "" &&
      floats.height === heightBefore &&
      !(await pageGrows(page)),
    `${JSON.stringify(floats)}, before ${heightBefore}`
  );

  // 3. Each region scrolls on its own.
  const regions = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".files-pop [data-files-region]"
      ),
    ].map((region) => {
      const scroller = region.querySelector<HTMLElement>("[data-files-scroll]");
      return {
        region: region.dataset.filesRegion,
        scrollHeight: scroller?.scrollHeight ?? 0,
        clientHeight: scroller?.clientHeight ?? 0,
        overflowY: scroller ? getComputedStyle(scroller).overflowY : "",
      };
    })
  );
  kit.check(
    `3 (${theme}): each region scrolls on its own (scrollHeight > clientHeight on both, overflow-y auto), the page not growing`,
    regions.length === 2 &&
      regions.every(
        (one) => one.scrollHeight > one.clientHeight && one.overflowY === "auto"
      ) &&
      !(await pageGrows(page)),
    JSON.stringify(regions)
  );

  // 4. The vermillion rule.
  const rule = await page.evaluate(() => {
    const second = document.querySelector<HTMLElement>(
      ".files-pop [data-files-rule]"
    );
    const style = second ? getComputedStyle(second) : null;
    return style
      ? {
          color: style.borderTopColor,
          width: style.borderTopWidth,
          styleName: style.borderTopStyle,
        }
      : null;
  });
  const vermillion = await tokenColour(page, "--brand-solid", ".files-pop");
  kit.check(
    `4 (${theme}): the rule between the regions is the vermillion token, brand-solid, whole`,
    rule?.color === vermillion &&
      rule.width === "1px" &&
      rule.styleName === "solid",
    `rule ${JSON.stringify(rule)}, brand-solid ${vermillion}`
  );

  // 5. The more sign, by region, against the items standing past its foot.
  const more = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".files-pop [data-files-region]"
      ),
    ].map((region) => {
      const scroller = region.querySelector<HTMLElement>("[data-files-scroll]");
      const foot = scroller?.getBoundingClientRect().bottom ?? 0;
      const items = [
        ...(scroller?.querySelectorAll("[data-files-card], [data-files-row]") ??
          []),
      ];
      return {
        region: region.dataset.filesRegion,
        past: items.filter(
          (item) => item.getBoundingClientRect().bottom > foot + 1
        ).length,
        sign:
          region.querySelector<HTMLElement>("[data-files-more]")?.dataset
            .filesMore ?? null,
        words:
          region.querySelector("[data-files-more]")?.textContent?.trim() ??
          null,
      };
    })
  );
  kit.check(
    `5 (${theme}): an overflowing region says how many more, the count of its items past its foot`,
    more.length === 2 &&
      more.every(
        (one) =>
          one.past > 0 &&
          one.sign === String(one.past) &&
          one.words === `${one.past} more`
      ),
    JSON.stringify(more)
  );

  // 8. Pictures that don't load, and pages never pictured, stand as glyphs.
  const glyphs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-card]")]
      .filter((card) => card.querySelector('[data-files-thumb="glyph"]'))
      .map((card) => card.title)
  );
  kit.check(
    `8 (${theme}): a picture that won't decode stands as its kind's glyph in the well`,
    glyphs.includes(BROKEN),
    JSON.stringify(glyphs)
  );
  // The long name gives way with an ellipsis, inside its card.
  const long = await page.evaluate((name) => {
    const card = [
      ...document.querySelectorAll<HTMLElement>("[data-files-card]"),
    ].find((one) => one.title === name);
    const words = card?.querySelector<HTMLElement>(".name");
    return words
      ? {
          cut: words.scrollWidth > words.clientWidth,
          inside:
            words.getBoundingClientRect().right <=
            (card?.getBoundingClientRect().right ?? 0) + 0.5,
        }
      : null;
  }, LONG_NAME);
  kit.check(
    `long name (${theme}): a 63-character name gives way inside its card`,
    !!long?.cut && long.inside,
    JSON.stringify(long)
  );
  await shot(page, `open-many-1440-${theme}`);
  await sweep(page, `open many 1440 ${theme}`);

  // 6. Search: by title, by the words on a page, and nothing.
  const field = page.locator("[data-files-search] input");
  // "tiers" is only on the page; "pricing" is in its name too, and the
  // engine scores a word by its best field (the title's).
  await field.fill("tiers");
  await until(
    "the search's hits",
    () => page.locator("[data-files-within]").count(),
    (n) => n > 0,
    15_000
  ).catch(() => 0);
  const byContent = await page.evaluate(() => ({
    cards: [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
      (card) => card.title
    ),
    marked: [...document.querySelectorAll("[data-files-within] mark")].map(
      (mark) => mark.textContent
    ),
  }));
  await shot(page, `search-content-1440-${theme}`);
  await sweep(page, `search content 1440 ${theme}`);
  await field.fill("tall board");
  await until(
    "the title's hit",
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
          (card) => card.title
        )
      ),
    // Until the hub answers, the cards stand unfiltered: wait for its answer.
    (titles) => titles.length === 1 && titles[0] === "tall-board",
    15_000
  ).catch(() => 0);
  const byTitle = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
      (card) => card.title
    )
  );
  await field.fill("invoice");
  await until(
    "nothing matching",
    () => page.locator("[data-files-none]").count(),
    (n) => n >= 2,
    15_000
  ).catch(() => 0);
  const nothing = await page.locator("[data-files-none]").allTextContents();
  await shot(page, `search-none-1440-${theme}`);
  await sweep(page, `search none 1440 ${theme}`);
  kit.check(
    `6 (${theme}): search finds by the words on a page (marked), by title, and says when nothing matches`,
    byContent.cards[0] === PRICING &&
      byContent.marked.some((word) =>
        word?.toLowerCase().startsWith("tiers")
      ) &&
      byTitle.length === 1 &&
      byTitle[0] === "tall-board" &&
      nothing.some((line) => line.includes("No artifacts match")) &&
      nothing.some((line) => line.includes("No attachments match")),
    `content ${JSON.stringify(byContent)}; title ${JSON.stringify(byTitle)}; none ${JSON.stringify(nothing)}`
  );
  await field.fill("");

  // 7. A picked artifact floats on Files' left.
  await page.locator(`[data-files-card][title="${PRICING}"]`).click();
  const float = page.locator("[data-files-float]");
  await float.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const picked = await page.evaluate(() => {
    const pop = document
      .querySelector("[data-glass-card-frame='files-pop']")
      ?.getBoundingClientRect();
    const box = document.querySelector<HTMLElement>("[data-files-float]");
    const rect = box?.getBoundingClientRect();
    const swatch = document.createElement("span");
    swatch.style.color = "var(--border-row-outline)";
    document.body.append(swatch);
    const outline = getComputedStyle(swatch).color;
    swatch.remove();
    return pop && rect && box
      ? {
          leftOf: rect.right <= pop.left,
          topsAligned: Math.abs(rect.top - pop.top) <= 1,
          position: getComputedStyle(box).position,
          edge: getComputedStyle(box).borderTopColor,
          outline,
          splitDocked: document.querySelectorAll(".transcript-pane ~ * iframe")
            .length,
        }
      : null;
  });
  kit.check(
    `7 (${theme}): a picked artifact opens floating on Files' left, the tops on one line, its edge the row outline`,
    !!picked &&
      picked.leftOf &&
      picked.topsAligned &&
      picked.position === "fixed" &&
      picked.edge === picked.outline &&
      !(await pageGrows(page)),
    JSON.stringify(picked)
  );
  await shot(page, `picked-1440-${theme}`);
  await sweep(page, `picked 1440 ${theme}`);
  await page.keyboard.press("Escape");
  await page.close();

  // 10. None, one, and the list unreadable.
  for (const [state, id] of [
    ["none", ids.none],
    ["one", ids.one],
  ] as const) {
    const each = await openSession(kit, base, "desk", theme, id);
    await each.locator("[data-files-control]").click();
    await each.locator("[data-glass-card-frame='files-pop']").waitFor();
    await each.waitForTimeout(600);
    const said = await each.evaluate(() => ({
      empty: !!document.querySelector("[data-files-empty]"),
      cards: document.querySelectorAll("[data-files-card]").length,
    }));
    kit.check(
      `10 ${state} (${theme}): ${state === "none" ? "a session with nothing says so" : "a session with one page shows its one card"}`,
      state === "none"
        ? said.empty && said.cards === 0
        : !said.empty && said.cards === 1,
      JSON.stringify(said)
    );
    await shot(each, `${state}-1440-${theme}`);
    await sweep(each, `${state} 1440 ${theme}`);
    await each.close();
  }
  const offline = await openSession(kit, base, "desk", theme, ids.many, (p) =>
    p
      .route(ARTIFACT_LIST, (route) => route.abort("internetdisconnected"))
      .then(() => undefined)
  );
  // The aborted read is the state proven, not an error of the page's.
  errors.set(offline, []);
  await offline.locator("[data-files-control]").click();
  await offline.locator("[data-files-failed]").waitFor({ timeout: 30_000 });
  const failedSaid = await offline.locator("[data-files-failed]").textContent();
  kit.check(
    `10 offline (${theme}): the list unread says so in Artifacts' place, with Try again, the attachments still listed`,
    !!failedSaid?.includes("Couldn't read") &&
      (await offline
        .locator('[data-files-region="attachments"] [data-files-row]')
        .count()) > 0,
    failedSaid ?? ""
  );
  await shot(offline, `offline-1440-${theme}`);
  await sweep(offline, `offline 1440 ${theme}`);
  errors.delete(offline);
  await offline.close();
};

/** The active element, said for a check: its tag, its data and its name. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el
      ? {
          tag: el.tagName,
          card: el.dataset.artifact ?? null,
          trigger: el.hasAttribute("data-artifact-trigger"),
          inFloat: !!el.closest("[data-files-float]"),
          slot: el.dataset.slot ?? null,
        }
      : null;
  });

/**
 * The review's legs (one theme, light): the hub reads' states and the
 * skeleton's timing; the masonry's DOM order; the rings; the earned counts;
 * the focus moves; the edge strips; 320px, a short window and 200% zoom;
 * the lightbox.
 */
const reviewLegs = async (
  kit: Kit,
  base: string,
  ids: { many: string; one: string }
) => {
  // 13. Both reads held back past the grace: nothing, then the skeleton, then the read.
  const slow = await openSession(
    kit,
    base,
    "desk",
    "light",
    ids.many,
    async (p) => {
      for (const read of [ARTIFACT_LIST, ATTACHMENT_LIST]) {
        await p.route(read, async (route) => {
          await new Promise((done) => setTimeout(done, HELD_MS));
          await route.continue();
        });
      }
    }
  );
  await recordIntros(
    slow,
    '[data-files-region="artifacts"] [data-files-scroll]'
  );
  await slow.locator("[data-files-control]").click();
  await slow.locator("[data-glass-card-frame='files-pop']").waitFor();
  const opened = Date.now();
  const atOpen = await slow.evaluate(() => ({
    waits: document.querySelectorAll("[data-files-wait]").length,
    counts: document.querySelectorAll(".files-pop [data-files-head-count]")
      .length,
    none: document.querySelectorAll(".files-pop .files-none").length,
  }));
  await slow.waitForTimeout(Math.max(0, 1500 - (Date.now() - opened)));
  const pastGrace = await slow.evaluate(() => ({
    artifactsWait: !!document.querySelector('[data-files-wait="artifacts"]'),
    ghostCards: document.querySelectorAll("[data-files-ghost]").length,
    attachmentsWait: !!document.querySelector(
      '[data-files-wait="attachments"]'
    ),
    counts: document.querySelectorAll(".files-pop [data-files-head-count]")
      .length,
  }));
  await slow.locator("[data-files-card]").first().waitFor({ timeout: 15_000 });
  await slow.waitForTimeout(400);
  const arrival = await introsOf(slow);
  const crossMs = await durationOf(slow, "--dur-control");
  kit.check(
    "13: until the hub answers, Files claims nothing (no count, no nothing-line, no skeleton inside the grace); past the grace the skeleton cards stand in the masonry and the attachment rows; the read takes the skeleton's place in one cross-fade over --dur-control (crossIn)",
    atOpen.waits === 0 &&
      atOpen.counts === 0 &&
      atOpen.none === 0 &&
      pastGrace.artifactsWait &&
      pastGrace.ghostCards > 0 &&
      pastGrace.attachmentsWait &&
      pastGrace.counts === 0 &&
      arrival.includes(crossMs),
    `at open ${JSON.stringify(atOpen)}; past the grace ${JSON.stringify(pastGrace)}; arrival animations ${JSON.stringify(arrival)} (--dur-control ${crossMs})`
  );
  await slow.close();

  // 14. The attachments read refused: its region says so, the artifacts stand.
  const refused = await openSession(kit, base, "desk", "light", ids.many, (p) =>
    p
      .route(ATTACHMENT_LIST, (route) => route.abort("internetdisconnected"))
      .then(() => undefined)
  );
  errors.set(refused, []);
  await refused.locator("[data-files-control]").click();
  await refused
    .locator('[data-files-region="attachments"] [data-files-failed]')
    .waitFor({ timeout: 30_000 });
  const refusedSaid = await refused.evaluate(() => ({
    fault: document
      .querySelector('[data-files-region="attachments"] [data-files-failed]')
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
    cards: document.querySelectorAll("[data-files-card]").length,
    count: document.querySelector("[data-files-count]")?.textContent ?? null,
  }));
  kit.check(
    "14: the attachments read refused says so in its region (RowFault, Try again), the artifacts still listed, and the bar claims no count",
    !!refusedSaid.fault?.includes("Couldn't read this session's attachments") &&
      !!refusedSaid.fault.includes("Try again") &&
      refusedSaid.cards > 0 &&
      refusedSaid.count === null,
    JSON.stringify(refusedSaid)
  );
  errors.delete(refused);
  await refused.close();

  // 15. The masonry in list order; 16. the rings; 17. the focus moves.
  const page = await openSession(kit, base, "desk", "light", ids.many);
  // Opened from the keyboard at once, while the glass's card may still be
  // rehearsing its open (GlassCard): the focus still goes into Files.
  await page.locator("[data-files-control]").focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-files-card]").first().waitFor();
  await page.waitForTimeout(400);
  const order = await page.evaluate(async (id) => {
    const listed = (await (
      await fetch(`/api/instances/${encodeURIComponent(id)}/artifacts`)
    ).json()) as { id: string }[];
    const cards = [
      ...document.querySelectorAll<HTMLElement>("[data-files-card]"),
    ];
    const lanes = cards.map((item) => getComputedStyle(item).gridColumnStart);
    const columns = Number(
      getComputedStyle(
        document.querySelector("[data-files-cards]") as Element
      ).gridTemplateColumns.split(" ").length
    );
    return {
      same:
        cards.map((item) => item.dataset.artifact).join() ===
        listed.map((one) => one.id).join(),
      oneGrid: new Set(cards.map((item) => item.parentElement)).size === 1,
      topRow: new Set(lanes.slice(0, columns)).size === columns,
      columns,
    };
  }, ids.many);
  kit.check(
    "15: the cards are drawn once, in one grid, in the hub's order (newest first), the first row across every column",
    order.same && order.oneGrid && order.topRow,
    JSON.stringify(order)
  );
  const ring = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>(
      ".files-pop [data-slot='finder-field']"
    );
    const swatch = document.createElement("span");
    swatch.style.color = "var(--focus-ring)";
    document.body.append(swatch);
    const want = getComputedStyle(swatch).color;
    swatch.remove();
    const style = field ? getComputedStyle(field) : null;
    return {
      inputFocused:
        document.activeElement?.closest("[data-files-search]") !== null,
      outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
      color: style?.outlineColor ?? null,
      want,
    };
  });
  await page.keyboard.press("Tab");
  let card = await focused(page);
  for (let i = 0; i < 6 && !card?.card; i += 1) {
    await page.keyboard.press("Tab");
    card = await focused(page);
  }
  const cardRing = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? getComputedStyle(el).outlineOffset : null;
  });
  kit.check(
    "16: the search field draws the focus ring when its input has keyboard focus, and a card's ring stands inside its own edge (outline-offset = --focus-ring-inset)",
    ring.inputFocused &&
      ring.outline === "solid 2px" &&
      ring.color === ring.want &&
      !!card?.card &&
      cardRing === "-2px",
    `field ${JSON.stringify(ring)}; card ${JSON.stringify(card)} offset ${cardRing}`
  );
  // A keyboard pick: the focus goes to the panel's name in the float.
  const pickedId = card?.card ?? "";
  await page.keyboard.press("Enter");
  await page
    .locator("[data-files-float][data-state='open']")
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const afterPick = await focused(page);
  const floatRole = await page.evaluate(() => {
    const float = document.querySelector<HTMLElement>("[data-files-float]");
    return {
      // A named <section> is a region.
      role:
        float?.tagName === "SECTION" ? "region" : float?.getAttribute("role"),
      label: float?.getAttribute("aria-label"),
      afterFiles:
        !!float &&
        !!document.querySelector("[data-glass-card-frame='files-pop']") &&
        (
          document.querySelector("[data-glass-card-frame='files-pop']") as Element
        ).compareDocumentPosition(float) === Node.DOCUMENT_POSITION_FOLLOWING,
    };
  });
  await page
    .locator("[data-files-float] button[title='Close']")
    .first()
    .click();
  await page
    .locator("[data-files-float]")
    .waitFor({ state: "detached", timeout: 10_000 });
  await page.waitForTimeout(200);
  const afterClose = await focused(page);
  kit.check(
    "17: a keyboard pick moves the focus to the panel's name in the float (a region named for the artifact, after Files in the page); its Close gives it back to the artifact's card",
    afterPick?.trigger === true &&
      afterPick.inFloat &&
      floatRole.role === "region" &&
      !!floatRole.label &&
      floatRole.afterFiles &&
      afterClose?.card === pickedId,
    `after pick ${JSON.stringify(afterPick)} ${JSON.stringify(floatRole)}; after close ${JSON.stringify(afterClose)} (picked ${pickedId})`
  );
  // 18. A press inside a picture's lightbox is not outside Files.
  await page
    .locator('[data-files-region="attachments"] button.attachment-row')
    .first()
    .click();
  await page.waitForTimeout(800);
  const lightboxOpen = await page.evaluate(
    () => !!document.querySelector(".pswp, [role='dialog'] img")
  );
  await page.mouse.click(720, 450);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const stillOpen = await page.evaluate(
    () => !!document.querySelector("[data-glass-card-frame='files-pop'][data-state='open']")
  );
  kit.check(
    "18: a picture opened from Files shows in the lightbox, and pressing in it and putting it away leaves Files open",
    lightboxOpen && stillOpen,
    `lightbox ${lightboxOpen}, Files still open ${stillOpen}`
  );
  // 19. A short window: both heads in sight, nothing spills.
  await page.setViewportSize({ width: 1440, height: 520 });
  await page.waitForTimeout(400);
  const short = await page.evaluate(() => {
    const pop = document
      .querySelector("[data-glass-card-frame='files-pop']")
      ?.getBoundingClientRect();
    const heads = [...document.querySelectorAll(".files-pop .files-head")].map(
      (head) => head.getBoundingClientRect()
    );
    return {
      pop: pop ? { top: pop.top, bottom: pop.bottom } : null,
      heads: heads.map((head) => ({ top: head.top, bottom: head.bottom })),
      inside:
        !!pop &&
        heads.length === 2 &&
        heads.every((head) => head.top >= pop.top && head.bottom <= pop.bottom),
    };
  });
  await sweep(page, "short window 1440x520");
  kit.check(
    "19: on a 1440×520 window Files keeps both heads in sight inside its card",
    short.inside && !(await pageGrows(page)),
    JSON.stringify(short)
  );
  await page.close();

  // 20. 200% zoom of a 1440×900 desk: a 720×450 window, the drawer.
  const zoomed = await openSession(kit, base, "narrowDesk", "light", ids.many);
  await zoomed.setViewportSize({ width: 720, height: 450 });
  await zoomed.locator('[data-slot="burger"]').click();
  await zoomed.locator("[data-sidebar-files]").click();
  await zoomed
    .locator("[data-files-card]")
    .first()
    .waitFor({ timeout: 30_000 });
  await zoomed.waitForTimeout(600);
  const zoomSaid = await zoomed.evaluate(() => {
    const list = document.querySelector(
      '[data-files-region="artifacts"] [data-files-scroll]'
    );
    return {
      segments: document.querySelectorAll("[data-files-segment]").length,
      scrolls: list ? list.scrollHeight > list.clientHeight : false,
      listHeight: list?.clientHeight ?? 0,
    };
  });
  await sweep(zoomed, "200% zoom 720x450 drawer");
  kit.check(
    "20: at 200% zoom (720×450) Files is the drawer, its list scrolling within it, the page not growing",
    zoomSaid.segments === 2 &&
      zoomSaid.scrolls &&
      zoomSaid.listHeight > 0 &&
      !(await pageGrows(zoomed)),
    JSON.stringify(zoomSaid)
  );
  await zoomed.close();

  // 21. The phone: earned counts, the burger's focus, the strips, Send, 320px.
  const phone = await openSession(kit, base, "phone", "light", ids.one);
  // Both strips stand once the conversation on screen is known, and Send with its composer.
  await phone
    .locator('[data-slot="edge-pull"]')
    .nth(1)
    .waitFor({ state: "attached" });
  await phone.locator('[aria-label="Send message"]').first().waitFor();
  const strips = await phone.evaluate(() => {
    const send = document
      .querySelector<HTMLElement>('[aria-label="Send message"]')
      ?.getBoundingClientRect();
    return {
      strips: [
        ...document.querySelectorAll<HTMLElement>('[data-slot="edge-pull"]'),
      ].map((strip) => {
        const box = strip.getBoundingClientRect();
        return {
          side: strip.dataset.side,
          touchAction: getComputedStyle(strip).touchAction,
          coversSend:
            !!send &&
            box.left < send.right &&
            box.right > send.left &&
            box.top < send.bottom &&
            box.bottom > send.top,
        };
      }),
      send: send ? { left: send.left, right: send.right, top: send.top } : null,
    };
  });
  kit.check(
    "21a: both edge strips let a finger going down scroll (touch-action pan-y), and neither covers the composer's Send",
    strips.strips.length === 2 &&
      strips.strips.every(
        (strip) => strip.touchAction === "pan-y" && !strip.coversSend
      ),
    JSON.stringify(strips)
  );
  await phone.locator('[data-slot="burger"]').click();
  await phone.locator("[data-sidebar-files]").click();
  await phone.locator("[data-files-sheet]").waitFor();
  await phone.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  const segmentCounts = await phone.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-segment]")].map(
      (segment) => ({
        segment: segment.dataset.filesSegment,
        count:
          segment.querySelector("[data-files-head-count]")?.textContent ?? null,
      })
    )
  );
  kit.check(
    "21b: a segment counts only above 0 (one page, no attachments)",
    segmentCounts.length === 2 &&
      segmentCounts[0]?.count === "1" &&
      segmentCounts[1]?.count === null,
    JSON.stringify(segmentCounts)
  );
  await phone.keyboard.press("Escape");
  await phone
    .locator("[data-files-sheet]")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  await phone.waitForTimeout(400);
  const burgerFocus = await focused(phone);
  kit.check(
    "21c: Files opened from the sidebar's row gives the focus back to the burger when it closes",
    burgerFocus?.slot === "burger",
    JSON.stringify(burgerFocus)
  );
  await phone.close();
  const narrow = await openSession(kit, base, "phone", "light", ids.many);
  await narrow.setViewportSize({ width: 320, height: 640 });
  await narrow.locator('[data-slot="burger"]').click();
  await narrow.locator("[data-sidebar-files]").click();
  await narrow
    .locator("[data-files-card]")
    .first()
    .waitFor({ timeout: 30_000 });
  await narrow.locator("[data-files-search] input").fill("brief");
  await narrow.waitForTimeout(500);
  const fit = await narrow.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-segment]")].map(
      (segment) => ({
        text: segment.textContent?.replace(/\s+/g, " ").trim(),
        fits: segment.scrollWidth <= segment.clientWidth,
      })
    )
  );
  await sweep(narrow, "320 drawer searching");
  kit.check(
    '22: at 320px the segments\' words and counts ("Attachments 3 of 9") fit their segments (scrollWidth ≤ clientWidth)',
    fit.length === 2 &&
      fit.every((one) => one.fits) &&
      fit.some((one) => one.text?.includes(" of ")),
    JSON.stringify(fit)
  );
  await narrow.close();
};

/** The composer's words, whether it has the focus, and whether the caret stands after the last of them. */
const composerSaid = (page: Page) =>
  page.evaluate((selector) => {
    const field = document.querySelector<HTMLElement>(selector);
    const selection = getSelection();
    let caretAtEnd = false;
    if (
      field &&
      selection &&
      selection.rangeCount > 0 &&
      selection.isCollapsed
    ) {
      const rest = document.createRange();
      rest.selectNodeContents(field);
      const at = selection.getRangeAt(0);
      rest.setStart(at.endContainer, at.endOffset);
      caretAtEnd = rest.toString() === "";
    }
    return {
      text: field?.textContent ?? null,
      focused:
        !!field &&
        (field === document.activeElement ||
          field.contains(document.activeElement)),
      caretAtEnd,
    };
  }, COMPOSER);

/** Whether the ask's words stand anywhere on the page outside the composer: a send would put them in the transcript. */
const sentAnywhere = (page: Page, words: string) =>
  page.evaluate(
    ([selector, text]) =>
      [...document.querySelectorAll<HTMLElement>('[data-slot="pane"]')].some(
        (pane) => {
          const copy = pane.cloneNode(true) as HTMLElement;
          for (const field of copy.querySelectorAll(selector)) {
            field.closest("form")?.remove();
          }
          return copy.textContent?.includes(text) ?? false;
        }
      ),
    [COMPOSER, words] as const
  );

/** The ask's words (files.svelte.ts ASK_FOR_A_PAGE). */
const ASK_WORDS = "Make a page that shows what we've done so far";

/**
 * 23. The Empty Starts Work Rule, a session's own case: Files with nothing
 * in it offers "Ask Claude Code for a page", shown only once the read has
 * answered empty; pressed, the words stand in the session's composer with
 * the caret after them and nothing is sent. On the phone, its touch area
 * is 44px.
 */
const askLegs = async (
  kit: Kit,
  base: string,
  none: string,
  noneOpenCode: string
) => {
  // The label names the session's own agent: an OpenCode session's.
  const other = await openSession(kit, base, "desk", "light", noneOpenCode);
  await other.locator("[data-files-control]").click();
  await other.locator("[data-files-ask]").waitFor({ timeout: 15_000 });
  const otherLabel = (
    await other.locator("[data-files-ask]").textContent()
  )?.trim();
  kit.check(
    '23a (OpenCode): an OpenCode session\'s empty Files asks its own agent by name: "Ask OpenCode for a page"',
    otherLabel === "Ask OpenCode for a page",
    JSON.stringify(otherLabel)
  );
  await other.close();

  const onDesk = await openSession(kit, base, "desk", "light", none);
  await onDesk.locator("[data-files-control]").click();
  await onDesk.locator("[data-glass-card-frame='files-pop']").waitFor();
  const before = await onDesk.evaluate(() => ({
    ask:
      document.querySelector("[data-files-ask]")?.textContent?.trim() ?? null,
    empty: !!document.querySelector("[data-files-empty]"),
  }));
  await onDesk.locator("[data-files-ask]").waitFor({ timeout: 15_000 });
  const label = (
    await onDesk.locator("[data-files-ask]").textContent()
  )?.trim();
  await onDesk.locator("[data-files-ask]").click();
  await onDesk
    .locator("[data-glass-card-frame='files-pop'][data-state='open']")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  await onDesk.waitForTimeout(800);
  const deskSaid = await composerSaid(onDesk);
  await onDesk.waitForTimeout(1500);
  const deskSent = await sentAnywhere(onDesk, ASK_WORDS);
  kit.check(
    '23a (desk): Files with nothing in it offers "Ask Claude Code for a page" once the read answered; pressed, Files goes, the words stand in the session\'s composer with the focus and the caret after them, and nothing is sent',
    label === "Ask Claude Code for a page" &&
      deskSaid.text === ASK_WORDS &&
      deskSaid.focused &&
      deskSaid.caretAtEnd &&
      !deskSent,
    `before the read ${JSON.stringify(before)}; label ${JSON.stringify(label)}; composer ${JSON.stringify(deskSaid)}; sent ${deskSent}`
  );
  await onDesk.close();

  const phone = await openSession(kit, base, "phone", "light", none);
  await phone.locator('[data-slot="burger"]').click();
  await phone.locator("[data-sidebar-files]").click();
  const ask = phone.locator("[data-files-sheet] [data-files-ask]");
  await ask.waitFor({ timeout: 15_000 });
  await phone.waitForTimeout(600);
  const hit = await ask.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    const box = el.getBoundingClientRect();
    const left = Number.parseFloat(after.left);
    const right = Number.parseFloat(after.right);
    const top = Number.parseFloat(after.top);
    const bottom = Number.parseFloat(after.bottom);
    return {
      width: box.width - left - right,
      height: box.height - top - bottom,
    };
  });
  await ask.click();
  await phone
    .locator("[data-files-sheet]")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  await phone.waitForTimeout(800);
  const phoneSaid = await composerSaid(phone);
  await phone.waitForTimeout(1500);
  const phoneSent = await sentAnywhere(phone, ASK_WORDS);
  kit.check(
    "23b (phone): the ask's touch area is at least 44×44, and pressed, the drawer goes and the words stand in the composer with the focus and the caret after them, nothing sent",
    hit.width >= 44 &&
      hit.height >= 44 &&
      phoneSaid.text === ASK_WORDS &&
      phoneSaid.focused &&
      phoneSaid.caretAtEnd &&
      !phoneSent,
    `touch area ${JSON.stringify(hit)}; composer ${JSON.stringify(phoneSaid)}; sent ${phoneSent}`
  );
  await phone.close();
};

/** A duration token in ms, as it is written ("120ms" or "0.12s"). */
const durationOf = async (page: Page, token: string): Promise<number> => {
  const said = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token
  );
  return said.endsWith("ms")
    ? Number.parseFloat(said)
    : Number.parseFloat(said) * 1000;
};

/**
 * Records the durations of the animations each element matching `selector`
 * runs as it mounts, read a frame after it is added (a 120ms intro is
 * gone before a later read).
 */
const recordIntros = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const seen: number[] = [];
    (window as unknown as { __intros: number[] }).__intros = seen;
    new MutationObserver(() => {
      for (const el of document.querySelectorAll(sel)) {
        if ((el as HTMLElement).dataset.introRead) {
          continue;
        }
        (el as HTMLElement).dataset.introRead = "1";
        requestAnimationFrame(() => {
          for (const one of el.getAnimations()) {
            seen.push(one.effect?.getTiming().duration as number);
          }
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }, selector);

const introsOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __intros: number[] }).__intros);

/**
 * The third review round's legs (light):
 *  24. D: each region's scrollbar and Show's touch area stand inside the
 *      region, with a mouse and under a finger;
 *  25. B: a keystroke never flashes the whole grid back while the hub's
 *      answer is held;
 *  26. C: a streamed reply with no attachment reads no attachments again;
 *  27. A: a new attachment keeps the focus on the row it was on;
 *  28. Attach a file opens the composer's own picker, and Files goes;
 *  29. E: narrowed under the panel's least width, the float hands the pick
 *      to the session's panel and Files goes;
 *  30. Jump's field draws the house ring (FindField);
 *  31. the skeleton gives its place to the empty state in one cross-fade.
 */
const roundThree = async (
  kit: Kit,
  base: string,
  fleet: Awaited<ReturnType<Kit["fleet"]>>,
  ids: { many: string; one: string; none: string }
) => {
  // 24. D, with a mouse (desk) and under a finger (an iPad's regular width).
  for (const view of ["desk", "ipadWide"] as const) {
    const page = await openSession(kit, base, view, "light", ids.many);
    await page.locator("[data-files-control]").click();
    await page.locator("[data-files-row]").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    const read = await page.evaluate(() => {
      /** Where a control's touch area ends: its ::after's trailing edge, or its own. */
      const touchRight = (el: HTMLElement | null) => {
        if (!el) {
          return null;
        }
        const after = getComputedStyle(el, "::after");
        const r = el.getBoundingClientRect();
        const inset = Number.parseFloat(after.right);
        return after.content === "none" || Number.isNaN(inset)
          ? r.right
          : r.right - inset;
      };
      /** The nearest ancestor that clips: its computed overflow is not `visible`. */
      const clipperOf = (el: HTMLElement) => {
        for (let at = el.parentElement; at; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const box = at.getBoundingClientRect();
            return {
              name: `${at.tagName.toLowerCase()}.${[...at.classList].filter((one) => !one.startsWith("svelte-")).join(".")}`,
              overflow: `${style.overflowX} ${style.overflowY}`,
              paddingEnd: style.paddingInlineEnd,
              // Its padding box's trailing edge: what it clips at.
              right: box.right - Number.parseFloat(style.borderRightWidth),
            };
          }
        }
        return null;
      };
      return [
        ...document.querySelectorAll<HTMLElement>(
          ".files-pop [data-files-region]"
        ),
      ].map((region) => {
        const head = region
          .querySelector<HTMLElement>(".files-head")
          ?.getBoundingClientRect();
        const scroller = region.querySelector<HTMLElement>(
          "[data-files-scroll]"
        );
        const cards = [
          ...region.querySelectorAll<HTMLElement>("[data-files-card]"),
        ].map((card) => card.getBoundingClientRect());
        const top = Math.min(...cards.map((card) => card.top));
        const topRow = cards.filter((card) => Math.abs(card.top - top) < 1);
        const row = region
          .querySelector<HTMLElement>("[data-files-row]")
          ?.getBoundingClientRect();
        const showRight = touchRight(
          region.querySelector<HTMLElement>("[data-files-show]")
        );
        return {
          region: region.dataset.filesRegion,
          headRight: head?.right ?? null,
          lastCardRight:
            topRow.length > 0
              ? Math.max(...topRow.map((card) => card.right))
              : null,
          rowRight: row?.right ?? null,
          scrollerRight: scroller?.getBoundingClientRect().right ?? null,
          showRight,
          clipper: scroller ? clipperOf(scroller) : null,
        };
      });
    });
    const flush = read.every((one) => {
      const end = one.region === "artifacts" ? one.lastCardRight : one.rowRight;
      return (
        one.headRight !== null &&
        end !== null &&
        Math.abs(end - one.headRight) <= 0.5
      );
    });
    // No ancestor that clips: nothing can cut the scroller or Show's area.
    // And none of it stands past Files' card, the surface it is drawn on.
    const unclipped = read.every(
      (one) =>
        one.scrollerRight !== null &&
        (one.clipper === null ||
          (one.scrollerRight <= one.clipper.right + 0.5 &&
            (one.showRight === null ||
              one.showRight <= one.clipper.right + 0.5)))
    );
    // Files' card, drawn round the regions: its trailing edge and its inline-end padding.
    const filesCard: {
      right: number;
      paddingEnd: string;
      overflow: string;
    } | null = await page.evaluate(() => {
      const pop = document.querySelector<HTMLElement>("[data-glass-card-frame='files-pop']");
      if (!pop) {
        return null;
      }
      const style = getComputedStyle(pop);
      return {
        right: pop.getBoundingClientRect().right,
        paddingEnd: style.paddingInlineEnd,
        overflow: `${style.overflowX} ${style.overflowY}`,
      };
    });
    kit.check(
      `24a (${view}): the top row's last card and an attachment row end on their region head's trailing edge (±0.5)`,
      flush,
      JSON.stringify(read.map(({ clipper: _clipper, ...rest }) => rest))
    );
    const onCard =
      !!filesCard &&
      read.every(
        (one) =>
          one.scrollerRight !== null &&
          one.scrollerRight <= filesCard.right + 0.5 &&
          (one.showRight === null || one.showRight <= filesCard.right + 0.5)
      );
    kit.check(
      `24b (${view}): the scroller's trailing edge and Show's touch area lie inside the nearest ancestor that clips (named), and none of it past Files' card`,
      unclipped && onCard,
      `${JSON.stringify(
        read.map((one) => ({
          region: one.region,
          scrollerRight: one.scrollerRight,
          showRight: one.showRight,
          clipper: one.clipper ?? "none: every ancestor's overflow is visible",
        }))
      )}; Files' card ${JSON.stringify(filesCard)}`
    );
    await page.close();
  }

  // 25. B: the answer to the second keystroke held; the grid never returns whole.
  const search = await openSession(kit, base, "desk", "light", ids.many);
  /** Holds the search's answers once the first is in. */
  const holding = new Set<"answers">();
  await search.route(SEARCH_READ, async (route) => {
    if (holding.has("answers")) {
      await new Promise((done) => setTimeout(done, 2000));
    }
    await route.continue();
  });
  await search.locator("[data-files-control]").click();
  await search.locator("[data-files-card]").first().waitFor();
  const field = search.locator("[data-files-search] input");
  await field.type("pr");
  await until(
    "the first answer",
    () => search.locator("[data-files-card]").count(),
    (n) => n < 42,
    15_000
  ).catch(() => 0);
  holding.add("answers");
  await field.type("i");
  const counts: number[] = [];
  let busy = false;
  for (let i = 0; i < 15; i += 1) {
    counts.push(await search.locator("[data-files-card]").count());
    busy ||= await search.evaluate(
      () =>
        document
          .querySelector('[data-files-region="artifacts"] [data-files-scroll]')
          ?.getAttribute("aria-busy") === "true"
    );
    await search.waitForTimeout(100);
  }
  kit.check(
    "25: while the hub's answer to the next keystroke is held, the last answer's cards stand (never the whole grid back) and the scroller says it is busy",
    counts.every((n) => n < 42) && busy,
    `counts ${JSON.stringify(counts)}, busy ${busy}`
  );
  await search.close();

  // 26. C: a streamed reply with no attachment reads no attachments again.
  const quiet = await openSession(kit, base, "desk", "light", ids.many);
  let reads = 0;
  quiet.on("request", (request) => {
    if (ATTACHMENT_LIST.test(new URL(request.url()).pathname)) {
      reads += 1;
    }
  });
  await quiet.waitForTimeout(2000);
  const before = reads;
  await fleet.send(ids.many, "A word with nothing attached");
  await quiet.waitForTimeout(5000);
  kit.check(
    "26: a message and its streamed reply that carry no attachment read the session's attachments 0 times",
    reads - before === 0,
    `attachments reads before ${before}, after ${reads}`
  );
  await quiet.close();

  // 27. A: focus on a row, a new attachment arrives above it, the focus stays.
  const steady = await openSession(kit, base, "desk", "light", ids.many);
  await steady.locator("[data-files-control]").click();
  await steady.locator("[data-files-row]").first().waitFor({ timeout: 30_000 });
  const rowsBefore = await steady.locator("[data-files-row]").count();
  const held = steady.locator("[data-files-row] .attachment-row").first();
  const heldName = await held.getAttribute("title");
  await held.focus();
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: ids.many,
    payload: {
      instanceId: ids.many,
      attachments: [
        { kind: "text", name: "arrived-later.md", content: "Later." },
      ],
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "One more file" },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });
  await until(
    "the new attachment listed",
    () => steady.locator("[data-files-row]").count(),
    (n) => n > rowsBefore,
    30_000
  ).catch(() => 0);
  const stillOn = await steady.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.closest("[data-files-row]") ? el.getAttribute("title") : null;
  });
  kit.check(
    "27: a new attachment listed above the focused row keeps the focus on that row (rows keyed by the hub's own ids)",
    (await steady.locator("[data-files-row]").count()) > rowsBefore &&
      stillOn === heldName,
    `focused ${JSON.stringify(stillOn)}, was ${JSON.stringify(heldName)}`
  );
  await steady.close();

  // 28. Attach a file: the composer's own picker, and Files goes.
  const attach = await openSession(kit, base, "desk", "light", ids.one);
  await attach.locator("[data-files-control]").click();
  const attachButton = attach.locator("[data-files-attach]");
  await attachButton.waitFor({ timeout: 30_000 });
  const [chooser] = await Promise.all([
    attach.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null),
    attachButton.click(),
  ]);
  await attach.waitForTimeout(600);
  const attachSaid = await attach.evaluate(() => ({
    filesOpen: !!document.querySelector(
      "[data-glass-card-frame='files-pop'][data-state='open']"
    ),
    composerInput: !!document.querySelector(
      'form[data-slot="cin"] input[type="file"]'
    ),
  }));
  kit.check(
    "28: an empty Attachments offers Attach a file; pressed, the session composer's own file picker opens and Files goes",
    !!chooser &&
      !!(await chooser
        .element()
        .evaluate(
          (input) => !!(input as Element).closest('form[data-slot="cin"]')
        )) &&
      !attachSaid.filesOpen,
    `chooser ${!!chooser}; ${JSON.stringify(attachSaid)}`
  );
  await attach.close();

  // 29. E: the float narrowed past the panel's least width.
  const narrowing = await openSession(kit, base, "desk", "light", ids.many);
  await narrowing.locator("[data-files-control]").click();
  await narrowing.locator(`[data-files-card][title="${PRICING}"]`).click();
  await narrowing
    .locator("[data-files-float][data-state='open']")
    .waitFor({ timeout: 30_000 });
  // Still a desk (900px and up), but Files' card leaves the float under
  // the panel's 320px least width beside the rail (about 270px at 920).
  await narrowing.setViewportSize({ width: 920, height: 900 });
  await narrowing.waitForTimeout(1200);
  const narrowed = await narrowing.evaluate(() => ({
    float: !!document.querySelector("[data-files-float]"),
    filesOpen: !!document.querySelector(
      "[data-glass-card-frame='files-pop'][data-state='open']"
    ),
    panel: [...document.querySelectorAll('iframe[title="Preview"]')].some(
      (frame) => !frame.closest("[data-files-float]")
    ),
  }));
  kit.check(
    "29: narrowed under the panel's least width, the float hands the pick to the session's panel (open beside the conversation) and Files goes: never a sliver",
    !(narrowed.float || narrowed.filesOpen) && narrowed.panel,
    JSON.stringify(narrowed)
  );
  await narrowing.close();

  // 30. Jump's field draws the house ring.
  const jump = await openSession(kit, base, "desk", "light", ids.many);
  await jump.waitForTimeout(1500);
  await jump.keyboard.press("Control+KeyK");
  await jump
    .locator(".jump-pop [data-slot='finder-field'] input")
    .waitFor({ timeout: 10_000 });
  await jump.waitForTimeout(300);
  const jumpRing = await jump.evaluate(() => {
    const ringed = document.querySelector<HTMLElement>(
      ".jump-pop [data-slot='finder-field']"
    );
    const style = ringed ? getComputedStyle(ringed) : null;
    const swatch = document.createElement("span");
    swatch.style.color = "var(--focus-ring)";
    document.body.append(swatch);
    const want = getComputedStyle(swatch).color;
    swatch.remove();
    return {
      outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
      color: style?.outlineColor ?? null,
      want,
      focused: !!document.activeElement?.closest("[data-slot='finder-field']"),
    };
  });
  kit.check(
    "30: Jump's field draws the house focus ring when its input has keyboard focus (the ring lives in FindField)",
    jumpRing.focused &&
      jumpRing.outline === "solid 2px" &&
      jumpRing.color === jumpRing.want,
    JSON.stringify(jumpRing)
  );
  await jump.close();

  // 32. The pages no pane had a picture of are drawn unseen by Files, and
  // kept by the hub; neither is shown in the session's panel for it.
  const drawn = await openSession(kit, base, "desk", "light", ids.many);
  await drawn.locator("[data-files-control]").click();
  await drawn.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  const pictured = await until(
    "the never-pictured pages drawn",
    () =>
      drawn.evaluate(
        (names) =>
          names.map(
            (name) =>
              document
                .querySelector(
                  `[data-files-card][title="${name}"] [data-files-thumb]`
                )
                ?.getAttribute("data-files-thumb") ?? null
          ),
        UNPICTURED
      ),
    (thumbs) => thumbs.every((one) => one === "picture"),
    60_000
  ).catch(() => null);
  const kept = await drawn.evaluate(
    async ({ id, names }) => {
      const listed = (await (
        await fetch(`/api/instances/${encodeURIComponent(id)}/artifacts`)
      ).json()) as { id: string; name: string; thumbnail: unknown }[];
      return Promise.all(
        listed
          .filter((one) => names.includes(one.name))
          .map(async (one) => {
            const found = (await (
              await fetch(`/api/artifacts/${encodeURIComponent(one.id)}`)
            ).json()) as { shown: boolean };
            return {
              name: one.name,
              thumbnail: one.thumbnail !== null,
              shown: found.shown,
            };
          })
      );
    },
    { id: ids.many, names: UNPICTURED }
  );
  kit.check(
    "32: a page no pane had a picture of is drawn unseen by Files and kept by the hub, its card taking the picture, and it is never shown in the session's panel for it",
    pictured !== null &&
      kept.length === UNPICTURED.length &&
      kept.every((one) => one.thumbnail && !one.shown),
    `cards ${JSON.stringify(pictured)}; hub ${JSON.stringify(kept)}`
  );
  await drawn.close();

  // 31. The skeleton gives its place to the empty state in one cross-fade.
  const emptied = await openSession(
    kit,
    base,
    "desk",
    "light",
    ids.none,
    async (p) => {
      for (const read of [ARTIFACT_LIST, ATTACHMENT_LIST]) {
        await p.route(read, async (route) => {
          await new Promise((done) => setTimeout(done, HELD_MS));
          await route.continue();
        });
      }
    }
  );
  await recordIntros(emptied, ".files-empty-place");
  await emptied.locator("[data-files-control]").click();
  await emptied
    .locator("[data-files-wait]")
    .first()
    .waitFor({ timeout: 10_000 });
  await emptied.locator("[data-files-empty]").waitFor({ timeout: 15_000 });
  await emptied.waitForTimeout(400);
  const emptyIntro = await introsOf(emptied);
  const emptyCross = await durationOf(emptied, "--dur-control");
  kit.check(
    "31: the skeleton gives its place to the empty state in one cross-fade over --dur-control",
    emptyIntro.includes(emptyCross),
    `intros ${JSON.stringify(emptyIntro)} (--dur-control ${emptyCross})`
  );
  await emptied.close();
};

/** The drawer's legs at 390 and 680, in one theme. */
const narrowLeg = async (
  kit: Kit,
  base: string,
  view: "phone" | "narrowDesk",
  theme: Theme,
  id: string
) => {
  const width = view === "phone" ? 390 : 680;
  const page = await openSession(kit, base, view, theme, id);
  await page.locator('[data-slot="burger"]').click();
  const row = page.locator("[data-sidebar-files]");
  await row.waitFor();
  await until(
    "the sidebar's Files count",
    () => row.getAttribute("aria-label"),
    (label) => !!label && FILES_COUNTED.test(label),
    60_000
  ).catch(() => null);
  if (view === "phone") {
    await shot(page, `sidebar-${width}-${theme}`);
  }
  await row.click();
  const sheet = page.locator("[data-files-sheet]");
  await sheet.waitFor();
  await page.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  const drawer = await page.evaluate(() => ({
    // The kit's drawer content is vaul's (components/ui/drawer).
    vaul: !!document.querySelector(
      '[data-files-sheet][data-slot="drawer-content"]'
    ),
    segments: [
      ...document.querySelectorAll<HTMLElement>("[data-files-segment]"),
    ].map((one) => one.textContent?.replace(/\s+/g, " ").trim()),
    regions: document.querySelectorAll(".files-pop").length,
  }));
  kit.check(
    `9 (${width} ${theme}): Files is the vaul drawer, Artifacts | Attachments tabs`,
    drawer.vaul &&
      drawer.segments.length === 2 &&
      !!drawer.segments[0]?.startsWith("Artifacts") &&
      !!drawer.segments[1]?.startsWith("Attachments") &&
      drawer.regions === 0 &&
      !(await pageGrows(page)),
    JSON.stringify(drawer)
  );
  if (view === "phone") {
    await shot(page, `drawer-artifacts-${width}-${theme}`);
  }
  await sweep(page, `drawer artifacts ${width} ${theme}`);
  await page.locator('[data-files-segment="attachments"]').click();
  await page.locator("[data-files-row]").first().waitFor();
  if (view === "phone") {
    await shot(page, `drawer-attachments-${width}-${theme}`);
  }
  await sweep(page, `drawer attachments ${width} ${theme}`);
  await page.locator("[data-files-search] input").fill("invoice");
  await page.locator("[data-files-none]").first().waitFor({ timeout: 15_000 });
  if (view === "phone") {
    await shot(page, `drawer-search-none-${width}-${theme}`);
  }
  await sweep(page, `drawer search none ${width} ${theme}`);
  await page.close();
};

const spec: Spec = { name: "files-panel", run };
export default spec;
