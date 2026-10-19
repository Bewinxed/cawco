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
  const panel = page.locator(".kit-pop.files-pop");
  await panel.waitFor();
  await page.locator("[data-files-card]").first().waitFor();
  await page.waitForTimeout(600);

  // 2. It floats.
  const floats = await page.evaluate(() => {
    const pop = document.querySelector<HTMLElement>(".kit-pop.files-pop");
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
    `8 (${theme}): the undecodable picture and the pages never pictured stand as their kind's glyph in the well`,
    [...UNPICTURED, BROKEN].every((name) => glyphs.includes(name)),
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
    (titles) => titles.includes("tall-board"),
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
        word?.toLowerCase().startsWith("pricing")
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
      .querySelector(".kit-pop.files-pop")
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
    await each.locator(".kit-pop.files-pop").waitFor();
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
