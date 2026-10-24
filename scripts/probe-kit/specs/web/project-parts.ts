/**
 * The project page's four parts fixed from the owner's pins on
 * "project-surfaces-today", drawn in the real components on the
 * /motion/project-parts bench (tidewater's fixtures, its hub reads answered
 * in the page), read from the engine at 390, 680 and 1440 on Chromium and
 * WebKit:
 *
 * 1. The board card says its status in one line under its title (Working,
 *    Retrying, Failed, Can't start, After tsk-14 +1, its date); a card in
 *    Review, in Done or with nothing to say has no state line; no badge and
 *    no glyph under 16px stands on a card; a failure's mark is solid (no
 *    half-ink layer); a forty-word title clamps to two lines inside its card.
 * 2. The empty board and the empty Decisions tab stand in the work column:
 *    centred in the room at 1440 within 1px, the room's own width at 390
 *    and 680; Caw, the title, the line and the starters on its start edge
 *    within 1px; every starter card one size, with one, four, and four with
 *    a forty-word one; four across at 1440.
 * 3. The empty Routines block holds no composer and no second title: its
 *    line, then its starters and Ask Caw for a routine, every card one size,
 *    the line and the first card on one edge.
 * 4. The project head has no Spin off; at 680 and 1440 New session stands
 *    outlined beside Ask Caw; at 390 neither stands in the head and the ⋯
 *    menu holds New session first. A forty-word name stands inside the
 *    head, clear of its actions.
 * 5. The task pane, in each state (Review, Working, To do, Done, Failed,
 *    Can't start, a forty-word title): its stage said once in its head and
 *    no Working twice; its tabs Review (while there is one) · Session ·
 *    Details · Activity, each led by its glyph and read whole; no hairline
 *    on its content, its review's bands or its parts' heads; each Details
 *    heading led by its glyph; in Review the decision follows the review,
 *    Approve's arrow on its words' centre line within 0.5px, the decision
 *    its session asks first, and More; Failed and Can't start say why and
 *    offer Try again; Working opens on the Session tab, read in place.
 *
 * Every page is swept (journeys/scan.ts: nothing spills, nothing overlaps)
 * and the page never scrolls sideways; the sweep's findings total zero.
 *
 *   bun scripts/probe-kit/run.ts web project-parts
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one part at a time
import type { Page } from "playwright-core";
import { projectWords } from "../../../../packages/core/src/words/project";
import { scan } from "../../journeys/scan";
import { type Engine, type Kit, open, type Spec, settle } from "../../kit";

const LEGS = [
  { name: "390", view: "phone", width: 390 },
  { name: "680", view: "narrowDesk", width: 680 },
  { name: "1440", view: "desk", width: 1440 },
] as const;
const ENGINES: Engine[] = process.env.PP_ENGINES
  ? (process.env.PP_ENGINES.split(",") as Engine[])
  : ["chromium", "webkit"];
const BENCH = "/motion/project-parts";

/** What the sweep found on every page, for the total. */
const swept: string[] = [];

/** The page swept for spills and overlaps, and its sideways scroll. */
async function sweep(kit: Kit, page: Page, tag: string): Promise<void> {
  const findings = await page.evaluate(scan);
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  const all = [...findings, ...(sideways > 0 ? [`scrolls ${sideways}px`] : [])];
  swept.push(...all.map((one) => `${tag}: ${one}`));
  kit.check(
    `${tag}: nothing spills, overlaps or scrolls sideways`,
    all.length === 0,
    all.join(" | ")
  );
}

// --- 1. the board card -------------------------------------------------------------

async function cards(kit: Kit, page: Page, tag: string): Promise<void> {
  const read = await page.evaluate(() => {
    const cardsOf = [...document.querySelectorAll("[data-task-card]")];
    return cardsOf.map((card) => {
      const box = card.getBoundingClientRect();
      const title = card.querySelector('[data-slot="title"]');
      const titleBox = title?.getBoundingClientRect();
      const state = card.querySelector('[data-slot="state"]');
      // A session's mark is one 18px tile, its sprite drawn inside it.
      const glyphs = [...card.querySelectorAll("svg")]
        .filter((svg) => !svg.closest("[data-tree-mark]"))
        .map((svg) => {
        const r = svg.getBoundingClientRect();
        return Math.min(r.width, r.height);
      });
      const failed = state?.querySelector('[data-tone="fail"]');
      return {
        id: card.getAttribute("data-task"),
        first: card.firstElementChild === title,
        state: state
          ? (state.textContent ?? "").replace(/\s+/g, " ").trim()
          : null,
        badges: card.querySelectorAll('[data-slot="badge"]').length,
        least: glyphs.length > 0 ? Math.min(...glyphs) : 16,
        halfInk: failed
          ? failed.querySelectorAll('[opacity="0.5"]').length
          : null,
        titleLines: titleBox
          ? Math.round(
              titleBox.height /
                Number.parseFloat(
                  getComputedStyle(title as Element).lineHeight
                )
            )
          : 0,
        inside:
          !!titleBox &&
          titleBox.left >= box.left - 0.5 &&
          titleBox.right <= box.right + 0.5,
      };
    });
  });
  const of = (id: string) => read.find((one) => one.id === id);
  kit.check(
    `${tag}: every card leads with its title, has no badge and no glyph under 16px`,
    read.length === 10 &&
      read.every((one) => one.first && one.badges === 0 && one.least >= 15.5),
    JSON.stringify(read.map(({ id, first, badges, least }) => ({ id, first, badges, least })))
  );
  const lines: [string, (state: string | null) => boolean][] = [
    ["tsk-14", (s) => s?.startsWith(projectWords.working) ?? false],
    ["tsk-18", (s) => s === `${projectWords.retrying} · ${projectWords.attempt(2)}`],
    ["tsk-21", (s) => s?.startsWith(projectWords.failed) ?? false],
    ["tsk-20", (s) => s?.startsWith(projectWords.cantStart) ?? false],
    ["tsk-17", (s) => s === `${projectWords.afterTask("tsk-14")} · +1`],
    ["tsk-15", (s) => s === "Thu 09:30"],
    ["tsk-16", (s) => s === null],
    ["tsk-12", (s) => s === null],
    ["tsk-19", (s) => s === null],
  ];
  kit.check(
    `${tag}: each card says its status in one line, Review, Done and a quiet card none`,
    lines.every(([id, ok]) => ok(of(id)?.state ?? null)),
    JSON.stringify(read.map(({ id, state }) => [id, state]))
  );
  kit.check(
    `${tag}: a failure's mark is solid, no half-ink layer`,
    of("tsk-21")?.halfInk === 0,
    JSON.stringify(of("tsk-21"))
  );
  kit.check(
    `${tag}: a forty-word title clamps to two lines inside its card`,
    (of("tsk-22")?.titleLines ?? 0) === 2 && of("tsk-22")?.inside === true,
    JSON.stringify(of("tsk-22"))
  );
}

// --- 2. the empty board and Decisions ------------------------------------------------

async function column(
  kit: Kit,
  page: Page,
  tag: string,
  width: number,
  starters: number
): Promise<void> {
  const read = await page.evaluate(() => {
    const room = document.querySelector("[data-room]");
    const col = document.querySelector("[data-work-column]");
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } : null;
    };
    const style = room ? getComputedStyle(room) : null;
    const content = room
      ? {
          left:
            room.getBoundingClientRect().left +
            Number.parseFloat(style?.paddingLeft ?? "0"),
          right:
            room.getBoundingClientRect().right -
            Number.parseFloat(style?.paddingRight ?? "0"),
        }
      : null;
    return {
      content,
      column: box(col),
      caw: box(col?.querySelector('[data-slot="caw-80"]')),
      title: box(col?.querySelector('[data-slot="empty-title"]')),
      line: box(col?.querySelector('[data-slot="empty-line"]')),
      cards: [...(col?.querySelectorAll('[data-slot="starter"]') ?? [])].map(
        (card) => box(card)
      ),
    };
  });
  const c = read.column;
  const room = read.content;
  const leftGap = c && room ? c.left - room.left : Number.NaN;
  const rightGap = c && room ? room.right - c.right : Number.NaN;
  kit.check(
    width === 1440
      ? `${tag}: the work column is 720 wide, centred in the room within 1px`
      : `${tag}: the work column is the room's own width`,
    width === 1440
      ? Math.abs((c?.width ?? 0) - 720) <= 0.5 && Math.abs(leftGap - rightGap) <= 1
      : Math.abs(leftGap) <= 0.5 && Math.abs(rightGap) <= 0.5,
    JSON.stringify({ leftGap, rightGap, column: c?.width })
  );
  const edge = c?.left ?? Number.NaN;
  const starts = [read.caw, read.title, read.line, read.cards[0]].map((b) =>
    b ? b.left : Number.NaN
  );
  kit.check(
    `${tag}: Caw, the title, the line and the starters share the column's start edge`,
    starts.every((left) => Math.abs(left - edge) <= 1),
    JSON.stringify({ edge, starts })
  );
  const sizes = read.cards.map((b) => `${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)}`);
  kit.check(
    `${tag}: ${starters} starter cards, every one one size`,
    read.cards.length === starters && new Set(sizes).size === 1,
    JSON.stringify(sizes)
  );
  if (width === 1440 && starters === 4) {
    kit.check(
      `${tag}: four across`,
      new Set(read.cards.map((b) => Math.round(b?.top ?? 0))).size === 1,
      JSON.stringify(read.cards.map((b) => b?.top))
    );
  }
}

// --- 3. the empty Routines block -----------------------------------------------------

async function routines(kit: Kit, page: Page, tag: string): Promise<void> {
  const read = await page.evaluate(() => {
    const block = document.querySelector('[data-block="routines"]');
    const cards = [...(block?.querySelectorAll('[data-slot="starter"]') ?? [])];
    return {
      composer: block?.querySelector('form[data-slot="cin"]') !== null,
      titles: block?.querySelectorAll('[data-slot="empty-title"]').length ?? -1,
      glyphs: block?.querySelectorAll('[data-slot="empty-mark"]').length ?? -1,
      line:
        block
          ?.querySelector('[data-slot="work-column-line"]')
          ?.getBoundingClientRect().left ?? null,
      lefts: cards.map((card) => card.getBoundingClientRect().left),
      sizes: cards.map((card) => {
        const r = card.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
      last: cards.at(-1)?.textContent?.trim() ?? "",
    };
  });
  kit.check(
    `${tag}: no composer, no second title or glyph in the empty Routines block`,
    !read.composer && read.titles === 0 && read.glyphs === 0,
    JSON.stringify(read)
  );
  kit.check(
    `${tag}: its line, its two starters and Ask Caw for a routine, every card one size, on one edge`,
    read.lefts.length === 3 &&
      read.line !== null &&
      Math.abs((read.lefts[0] ?? -99) - read.line) <= 1 &&
      new Set(read.sizes).size === 1 &&
      read.last === projectWords.askForRoutine,
    JSON.stringify(read)
  );
}

// --- 4. the project head -------------------------------------------------------------

async function head(
  kit: Kit,
  page: Page,
  tag: string,
  width: number
): Promise<void> {
  const read = await page.evaluate(() => {
    const head = document.querySelector('[data-slot="project-head"]');
    const words = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const shown = (el: Element | null) =>
      !!el && el.getBoundingClientRect().width > 0;
    const form = head?.querySelector("[data-new-session-form]") ?? null;
    const name = head?.querySelector('[data-slot="name"]')?.getBoundingClientRect();
    const acts = head?.querySelector('[data-slot="acts"]')?.getBoundingClientRect();
    const box = head?.getBoundingClientRect();
    return {
      spinOff: [...(head?.querySelectorAll("button") ?? [])].some((b) =>
        words(b).startsWith("Spin off")
      ),
      newSession: shown(form) ? words(form) : null,
      outlined: form ? form.getAttribute("data-variant") : null,
      askCaw: shown(head?.querySelector("[data-new-session]") ?? null),
      nameInside:
        !!name && !!box && name.left >= box.left && name.right <= box.right + 0.5,
      clear:
        !!name &&
        !!acts &&
        (name.bottom <= acts.top + 0.5 ||
          name.right <= acts.left + 0.5 ||
          acts.bottom <= name.top + 0.5),
    };
  });
  kit.check(`${tag}: no Spin off in the head`, !read.spinOff, JSON.stringify(read));
  kit.check(
    width >= 640
      ? `${tag}: New session stands outlined beside Ask Caw`
      : `${tag}: neither Ask Caw nor New session stands in the head`,
    width >= 640
      ? read.newSession === projectWords.newSession &&
          read.askCaw &&
          read.outlined === "outline"
      : read.newSession === null && !read.askCaw,
    JSON.stringify(read)
  );
  kit.check(
    `${tag}: the name stands inside the head, clear of its actions`,
    read.nameInside && read.clear,
    JSON.stringify(read)
  );
  if (width < 640) {
    await page
      .getByRole("button", { name: /^More for / })
      .first()
      .click();
    await page.waitForSelector('[role="menu"]', { timeout: 10_000 });
    await settle(page, 400);
    const first = await page.evaluate(
      () =>
        document
          .querySelector('[role="menu"] [role="menuitem"]')
          ?.textContent?.trim() ?? ""
    );
    kit.check(
      `${tag}: the ⋯ menu holds New session first`,
      first === projectWords.newSession,
      first
    );
    await page.keyboard.press("Escape");
    await settle(page, 300);
  }
}

// --- 5. the task pane ----------------------------------------------------------------

const PANES = [
  { task: "tsk-16", state: "review", stage: "Review" },
  { task: "tsk-14", state: "working", stage: "Working" },
  { task: "tsk-19", state: "todo", stage: "Ready" },
  { task: "tsk-12", state: "done", stage: "Done" },
  { task: "tsk-21", state: "failed", stage: "Working" },
  { task: "tsk-20", state: "cant-start", stage: "Ready" },
  { task: "tsk-22", state: "long", stage: "Review" },
] as const;

async function pane(
  kit: Kit,
  page: Page,
  tag: string,
  one: (typeof PANES)[number]
): Promise<void> {
  const read = await page.evaluate((stage) => {
    const pane = document.querySelector("[data-task-pane]");
    const head = pane?.querySelector('[data-slot="head"]');
    const words = (el: Element | null | undefined) =>
      el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    // The head's words, its tabs left out: a stage named Review shares
    // its name with the Review tab.
    const headCopy = head?.cloneNode(true) as Element | undefined;
    headCopy?.querySelector('[role="tablist"]')?.remove();
    const headWords = words(headCopy);
    const count = (text: string, of: string) =>
      of.split(text).length - 1;
    const tabs = [...(pane?.querySelectorAll('[role="tab"]') ?? [])].map(
      (tab) => ({
        label: words(tab),
        glyph: tab.querySelector("svg") !== null,
        whole: [...tab.querySelectorAll("span")].every(
          (span) => span.scrollWidth <= span.clientWidth + 1
        ),
      })
    );
    const ruled = [
      ...(pane?.querySelectorAll(
        '[data-slot="content"], [data-slot="content"] [data-band], [data-slot="content"] h3, [data-slot="content"] section'
      ) ?? []),
    ]
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          (Number.parseFloat(s.borderTopWidth) > 0 &&
            s.borderTopStyle !== "none") ||
          (Number.parseFloat(s.borderBottomWidth) > 0 &&
            s.borderBottomStyle !== "none")
        );
      })
      .map((el) => el.getAttribute("data-slot") ?? el.tagName);
    const content = pane?.querySelector('[data-slot="content"]');
    const foot = pane?.querySelector('[data-slot="foot"]');
    const approve = foot?.querySelector("[data-approve]");
    const arrow = approve?.querySelector("[data-arrow-mark]");
    // Its words beside the arrow: the stage it goes to, a trimmed run of
    // the button's mark line (app.css .mark-line).
    const label = approve?.querySelector(":scope > span:last-of-type");
    const centre = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : Number.NaN;
    };
    const heads = [
      ...(pane?.querySelectorAll('[data-slot="task-body"] h3') ?? []),
    ].filter((h) => !h.classList.contains("sr-only"));
    return {
      tab: pane?.getAttribute("data-tab") ?? null,
      stageTimes: count(stage, headWords),
      workingTimes: count("Working", headWords),
      tabs,
      ruled,
      foot: foot
        ? {
            gap:
              (foot.getBoundingClientRect().top ?? 0) -
              (content?.getBoundingClientRect().bottom ?? 0),
            approve: approve ? words(approve) : null,
            arrowOff:
              arrow && label ? Math.abs(centre(arrow) - centre(label)) : null,
            asked: foot.querySelector("[data-asked]") !== null,
            more: foot.querySelector("[data-decide-more]") !== null,
            tryAgain: foot.querySelector("[data-try-again]") !== null,
          }
        : null,
      sessionWord: words(head?.querySelector('[data-slot="session-word"]')),
      refusal: words(head?.querySelector('[data-slot="refusal"]')),
      ended: words(head?.querySelector('[data-slot="ended"]')),
      sessionTab: pane?.querySelector("[data-session-tab]") !== null,
      detailHeads: heads.map((h) => h.querySelector("svg") !== null),
    };
  }, one.stage);
  kit.check(
    `${tag}: its stage said once in its head, no Working twice`,
    read.stageTimes === 1 && read.workingTimes <= 1,
    JSON.stringify({ stage: read.stageTimes, working: read.workingTimes })
  );
  const want = [
    ...(["review", "failed", "long", "done"].includes(one.state)
      ? ["Review"]
      : []),
    "Session",
    "Details",
    "Activity",
  ];
  kit.check(
    `${tag}: its tabs ${want.join(" · ")}, each led by its glyph and read whole`,
    JSON.stringify(read.tabs.map((t) => t.label)) === JSON.stringify(want) &&
      read.tabs.every((t) => t.glyph && t.whole),
    JSON.stringify(read.tabs)
  );
  kit.check(
    `${tag}: no hairline on its content`,
    read.ruled.length === 0,
    JSON.stringify(read.ruled)
  );
  if (one.state === "review" || one.state === "long") {
    kit.check(
      `${tag}: opens on Review, the decision under it within 48px, Approve's arrow on its words' centre within 0.5px, More`,
      read.tab === "review" &&
        read.foot !== null &&
        read.foot.gap <= 48 &&
        read.foot.approve === "Approve Done" &&
        read.foot.arrowOff !== null &&
        read.foot.arrowOff <= 0.5 &&
        read.foot.more,
      JSON.stringify(read.foot)
    );
  }
  if (one.state === "review") {
    kit.check(
      `${tag}: the decision its session asks stands over Approve`,
      read.foot?.asked === true,
      JSON.stringify(read.foot)
    );
  }
  if (one.state === "working") {
    kit.check(
      `${tag}: opens on the Session tab, read in place; no foot`,
      read.tab === "session" && read.sessionTab && read.foot === null,
      JSON.stringify(read)
    );
  }
  if (one.state === "failed") {
    kit.check(
      `${tag}: its session row says Failed and how it ended; Try again and More`,
      read.sessionWord === projectWords.failed &&
        read.ended.length > 0 &&
        read.foot?.tryAgain === true &&
        read.foot.more,
      JSON.stringify(read)
    );
  }
  if (one.state === "cant-start") {
    kit.check(
      `${tag}: the hub's words whole under its stage; Try again`,
      read.refusal.startsWith(projectWords.cantStart) &&
        read.refusal.includes("online") &&
        read.foot?.tryAgain === true,
      JSON.stringify(read)
    );
  }
  if (one.state === "todo") {
    await page.getByRole("tab", { name: "Details" }).click();
    await settle(page, 400);
    const heads = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="task-body"] h3')]
        .filter((h) => !h.classList.contains("sr-only"))
        .map((h) => ({
          words: h.textContent?.replace(/\s+/g, " ").trim(),
          glyph: h.querySelector("svg") !== null,
          ruled: Number.parseFloat(getComputedStyle(h).borderBottomWidth) > 0,
        }))
    );
    kit.check(
      `${tag}: each Details heading led by its glyph, no hairline under it`,
      heads.length >= 5 && heads.every((h) => h.glyph && !h.ruled),
      JSON.stringify(heads)
    );
  }
  if (one.state === "done") {
    kit.check(`${tag}: no foot`, read.foot === null, JSON.stringify(read.foot));
  }
}

const spec: Spec = {
  name: "project-parts",
  async run(kit) {
    const bench = await kit.bench();
    for (const engine of ENGINES) {
      for (const leg of LEGS) {
        const page = await kit.page(leg.view, { engine, theme: "light" });
        const at = (query: string) => `${bench}${BENCH}?${query}`;
        const tag = (part: string) => `${engine} ${leg.name} ${part}`;

        await open(page, at("part=cards"), "[data-task-card]");
        await settle(page, 400);
        await cards(kit, page, tag("cards"));
        await sweep(kit, page, tag("cards"));

        for (const [part, starters] of [
          ["board", "one"],
          ["board", "four"],
          ["board", "long"],
          ["decisions", "four"],
        ] as const) {
          await open(
            page,
            at(`part=${part}&starters=${starters}`),
            '[data-slot="starter"]'
          );
          await settle(page, 400);
          const count = starters === "one" ? 1 : 4;
          await column(kit, page, tag(`${part} ${starters}`), leg.width, count);
          await sweep(kit, page, tag(`${part} ${starters}`));
        }

        await open(page, at("part=routines"), "[data-bench]");
        await page
          .waitForSelector('[data-block="routines"] [data-slot="starter"]', {
            timeout: 20_000,
          })
          .catch(async () => {
            kit.note(
              `${tag("routines")}: ${(await page.evaluate(() => document.querySelector("[data-bench]")?.innerHTML ?? "")).slice(0, 3000)}`
            );
          });
        await settle(page, 400);
        await routines(kit, page, tag("routines"));
        await sweep(kit, page, tag("routines"));

        for (const name of ["short", "long"] as const) {
          await open(
            page,
            at(`part=head&name=${name}`),
            '[data-slot="project-head"]'
          );
          await settle(page, 400);
          await sweep(kit, page, tag(`head ${name}`));
          await head(kit, page, tag(`head ${name}`), leg.width);
        }

        for (const one of PANES) {
          await open(
            page,
            at(`part=pane&task=${one.task}`),
            '[data-task-pane] [role="tab"]'
          );
          await page
            .waitForSelector('[data-task-pane] [data-slot="content"]', {
              timeout: 20_000,
            })
            .catch(() => undefined);
          await settle(page, 600);
          await sweep(kit, page, tag(`pane ${one.state}`));
          await pane(kit, page, tag(`pane ${one.state}`), one);
        }
        await page.close();
      }
    }
    kit.check(
      `the overflow sweep totals zero over every page (${swept.length})`,
      swept.length === 0,
      swept.slice(0, 12).join(" | ")
    );
  },
};

export default spec;
