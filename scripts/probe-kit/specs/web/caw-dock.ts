/**
 * Caw's dock beside a project's page (CawDock), read from the engine, on a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model) in the built dashboard, at the desk (1440×900, mouse), the iPad
 * (1024×1366, touch) and the phone (390×844, touch). The owner's pins on the
 * caw-dock preview (2026-10-15), each as an assertion:
 *
 * - no spend: no element in the dock, or in Caw's settings, whose words are
 *   a currency amount or "spend"/"spent"/"cost";
 * - no dropdown to switch flows and no settings in the dock: no `<select>`,
 *   no combobox, listbox or select trigger, no switch; the one popup
 *   trigger is the threads menu, which is a menu;
 * - the hero on an empty thread: Caw at 80 over the title, the project's
 *   starters as cards with their glyphs, Caw not on the composer meanwhile;
 * - every menu item has its glyph: the threads menu's and the head's `⋯`
 *   (where Caw's settings are);
 * - styled from the tokens: every colour the dock's own elements draw (ink
 *   and fill) is a token's colour, and every gap, padding and margin on
 *   them a token's length (or 0).
 *
 * At each size the dock, the hero and the composer are measured: the dock
 * inside the viewport, the hero centred in it, the cards inside it.
 *
 *   bun scripts/probe-kit/run.ts web caw-dock
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one viewport, one step at a time.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the token read runs in the page, one self-contained pass (page.evaluate takes no outer helpers).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle, type View } from "../../kit";
import { openCawSettings } from "./caw-seat-pop";

const DOCK = "[data-caw-dock]";
/** The hero's question, the project named in it. */
const HERO_TITLE = /^What's next for .+\?$/;
/**
 * A spacing reading in the menu's rows: the kit's menu item recipe and its
 * mark-line trim are the kit's own, so only its colours are this spec's.
 */
const SPACING_PROP = /(padding|margin|gap)/;
const HERO = `${DOCK} [data-thread-hero]`;

/** A tag in your words that the mock Caw answers by name: `PROBE-REPLY-<tag>`. */
const REPLY_TAG = /PROBE-REPLY-(\w+)/g;

/**
 * The mock model: a title for a side call; a turn that read tagged words
 * answers the newest tag in plain text (posted in its thread as his reply,
 * caw.ts `answerUnreplied`), any other "Ready.".
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Plan the launch"] };
  }
  const tag = [...request.last.matchAll(REPLY_TAG)].at(-1)?.[1];
  return { everyMs: 5, words: [tag ? `Answer ${tag}` : "Ready."] };
};

/** Words that say money or spend: a currency amount, or the words themselves. */
const MONEY = String.raw`[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP)\b|\bspen[dt]\b|\bcosts?\b`;

/** What the page draws in `root` that says money or spend: each element's own words. */
const moneyIn = (page: Page, within: string) =>
  page.evaluate(
    ({ root, pattern }) => {
      const re = new RegExp(pattern, "i");
      const hits: string[] = [];
      for (const scope of document.querySelectorAll(root)) {
        for (const el of [scope, ...scope.querySelectorAll("*")]) {
          const own = [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join(" ");
          const label = el.getAttribute("aria-label") ?? "";
          const words = `${own} ${label}`.trim();
          if (words && re.test(words)) {
            hits.push(words.slice(0, 80));
          }
        }
      }
      return hits;
    },
    { root: within, pattern: MONEY }
  );

/**
 * The dock's pickers and popups: anything that drops down, or a setting.
 * The composer's message field is a `<textarea role="combobox">` (its `/`
 * and `@` suggestions, the ARIA combobox pattern for a text field): words
 * are typed into it, nothing is picked from it, so a text field's combobox
 * is not a picker. Every popup trigger is named by what it is: the threads
 * menu, or the composer's Attach (`+`: Attach a file, Draw), the composer
 * every thread draws.
 */
const pickersIn = (page: Page) =>
  page.evaluate((dock) => {
    const root = document.querySelector(dock);
    if (!root) {
      return null;
    }
    const all = (sel: string) => [...root.querySelectorAll(sel)];
    const combos = all(
      '[role="combobox"], [role="listbox"], [data-slot="select-trigger"]'
    );
    return {
      selects: all("select").length,
      textFields: combos.filter((el) => el instanceof HTMLTextAreaElement)
        .length,
      pickers: combos
        .filter((el) => !(el instanceof HTMLTextAreaElement))
        .map((el) => `${el.tagName} ${el.className}`),
      switches: all('[role="switch"], input[type="checkbox"]').length,
      popups: all("[aria-haspopup]").map((el) => ({
        kind: el.getAttribute("aria-haspopup"),
        what: el.classList.contains("threads-trigger")
          ? "threads"
          : (el.getAttribute("aria-label") ?? el.className),
      })),
    };
  }, DOCK);

/** The open menu's items: each one's words and whether it draws an svg glyph. */
const menuItems = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="menu"][data-state="open"] [role="menuitem"]'
      ),
    ].map((item) => ({
      words: (item.textContent ?? "").replace(/\s+/g, " ").trim(),
      svg: item.querySelector("svg") !== null,
    }))
  );

/**
 * Every colour the dock's own elements draw (ink and fill) and every gap,
 * padding and margin on them, against the token set: each `--*` declared
 * in the page's stylesheets resolved as a colour and as a length. A value
 * that is not a token's is named with its element.
 */
const offTokens = (page: Page, own: string[]) =>
  page.evaluate((selectors) => {
    const names = new Set<string>();
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          for (const prop of rule.style) {
            if (prop.startsWith("--")) {
              names.add(prop);
            }
          }
        }
        if ("cssRules" in rule && rule.cssRules) {
          walk(rule.cssRules as CSSRuleList);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A sheet from elsewhere: not the house's.
      }
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    document.querySelector(selectors[0])?.append(probe);
    const colours = new Set<string>();
    const lengths = new Set<number>([0]);
    for (const name of names) {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = `var(${name})`;
      const colour = getComputedStyle(probe).backgroundColor;
      if (colour && colour !== "rgba(0, 0, 0, 0)") {
        colours.add(colour);
      }
      probe.style.width = "";
      probe.style.width = `var(${name})`;
      const width = Number.parseFloat(getComputedStyle(probe).width);
      if (Number.isFinite(width)) {
        lengths.add(Math.round(width * 100) / 100);
      }
    }
    probe.remove();
    const off: string[] = [];
    let read = 0;
    const SPACING = [
      "row-gap",
      "column-gap",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        read += 1;
        const style = getComputedStyle(el);
        const tag = `${sel}`;
        for (const prop of ["color", "background-color"]) {
          const value = style.getPropertyValue(prop);
          if (value !== "rgba(0, 0, 0, 0)" && !colours.has(value)) {
            off.push(`${tag} ${prop} ${value}`);
          }
        }
        for (const prop of SPACING) {
          const raw = style.getPropertyValue(prop);
          if (raw === "normal" || raw === "auto") {
            continue;
          }
          const px = Math.round(Number.parseFloat(raw) * 100) / 100;
          // A negative margin pulls back by a token's length.
          if (Number.isFinite(px) && !lengths.has(Math.abs(px))) {
            off.push(`${tag} ${prop} ${raw}`);
          }
        }
      }
    }
    return {
      off,
      read,
      tokens: { colours: colours.size, lengths: lengths.size },
    };
  }, own);

/** The dock's own elements (CawDock, ThreadsMenu, ThreadPane's hero, StarterCards). */
const OWN_HERO = [
  `${DOCK}`,
  `${DOCK} .side-card`,
  `${DOCK} .side-head`,
  `${DOCK} .hero .kit-empty`,
  `${DOCK} .hero .kit-empty-title`,
  `${DOCK} .caw-80`,
  `${DOCK} .starter-cards .cards`,
  `${DOCK} .starter`,
];

/** Measured at a size: the dock, the hero, its cards and the composer. */
const measure = (page: Page) =>
  page.evaluate(
    ({ dock, hero }) => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x * 10) / 10,
          y: Math.round(r.y * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        };
      };
      const cards = [...document.querySelectorAll(`${dock} .starter`)].map(
        (el) => el.getBoundingClientRect()
      );
      const card = document.querySelector(`${dock} .side-card`);
      return {
        vw: document.documentElement.clientWidth,
        vh: window.innerHeight,
        dock: box(`${dock} .side-card`),
        hero: box(`${hero} .kit-empty`),
        caw: box(`${dock} .caw-80`),
        title: box(`${hero} .kit-empty-title`),
        composer: box(`${dock} .composer-dock textarea`),
        cardsInside: card
          ? cards.every((r) => {
              const c = card.getBoundingClientRect();
              return r.left >= c.left - 0.5 && r.right <= c.right + 0.5;
            })
          : false,
        cards: cards.length,
        titleFont: (() => {
          const el = document.querySelector(`${hero} .kit-empty-title`);
          return el ? getComputedStyle(el).fontSize : null;
        })(),
        seatOnComposer: document.querySelectorAll(
          `${dock} .composer-dock .seat`
        ).length,
      };
    },
    { dock: DOCK, hero: HERO }
  );

/** The hero's assertions, at `name`. */
async function checkHero(kit: Kit, page: Page, name: string) {
  const shown = await page
    .waitForSelector(HERO, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(`${name}: an empty thread opens on the hero`, shown);
  if (!shown) {
    return;
  }
  await page.waitForSelector(`${DOCK} .starter`, { timeout: 15_000 });
  await settle(page, 400);
  const at = await measure(page);
  kit.note(`${name} measured: ${JSON.stringify(at)}`);
  // For the critique, read after the engine's checks.
  await page.screenshot({
    path: join(kit.out, `${name.replace(/[^a-z0-9]+/gi, "-")}.png`),
  });
  const hero = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return {
      title: root?.querySelector(".kit-empty-title")?.textContent?.trim() ?? "",
      starters: [...(root?.querySelectorAll(".starter") ?? [])].map(
        (el) => el.querySelector("svg") !== null
      ),
    };
  }, HERO);
  kit.check(
    `${name}: the hero is Caw at 80 over its title, as the New project page's`,
    !!at.caw &&
      at.caw.w >= 80 &&
      at.caw.h >= 80 &&
      !!at.title &&
      at.caw.y + at.caw.h <= at.title.y + 0.5 &&
      HERO_TITLE.test(hero.title),
    `caw ${JSON.stringify(at.caw)}, title ${JSON.stringify(at.title)} “${hero.title}” at ${at.titleFont}`
  );
  kit.check(
    `${name}: the project's starters stand under it as cards, each with its glyph`,
    hero.starters.length > 0 && hero.starters.every(Boolean),
    JSON.stringify(hero.starters)
  );
  kit.check(
    `${name}: Caw stands on the hero, not on the composer, until the first words`,
    at.seatOnComposer === 0 && !!at.composer,
    `seats on the composer ${at.seatOnComposer}, composer ${JSON.stringify(at.composer)}`
  );
  const { dock } = at;
  kit.check(
    `${name}: the dock stands inside the viewport, the hero centred in it and the cards inside it`,
    !!dock &&
      !!at.hero &&
      dock.x >= -0.5 &&
      dock.x + dock.w <= at.vw + 0.5 &&
      dock.y + dock.h <= at.vh + 0.5 &&
      Math.abs(at.hero.x + at.hero.w / 2 - (dock.x + dock.w / 2)) <= 1 &&
      at.cardsInside,
    JSON.stringify({ dock, hero: at.hero, vw: at.vw, vh: at.vh })
  );
  const tokens = await offTokens(page, OWN_HERO);
  kit.check(
    `${name}: the hero's and the dock's colours and spacing are tokens' (${tokens.read} elements, ${tokens.tokens.colours} token colours, ${tokens.tokens.lengths} token lengths)`,
    tokens.read > 0 && tokens.off.length === 0,
    tokens.off.join("; ")
  );
}

/** What every size checks on the dock as it stands: no money, no pickers. */
async function checkDock(kit: Kit, page: Page, name: string) {
  const money = await moneyIn(page, DOCK);
  kit.check(
    `${name}: nothing in the dock says money or spend`,
    money.length === 0,
    money.join(" | ")
  );
  const pickers = await pickersIn(page);
  kit.check(
    `${name}: no <select>, picker combobox, listbox, select trigger or switch in the dock (the composer's text field aside); its popups are the threads menu and the composer's Attach, both menus`,
    !!pickers &&
      pickers.selects === 0 &&
      pickers.pickers.length === 0 &&
      pickers.switches === 0 &&
      pickers.popups.every(
        (one) =>
          one.kind === "menu" &&
          (one.what === "threads" || one.what === "Attach or draw")
      ),
    JSON.stringify(pickers)
  );
  // The composer's Attach menu: its items carry their glyphs too.
  const attach = page.locator(`${DOCK} [aria-label="Attach or draw"]`);
  if (await attach.count()) {
    await attach.click();
    await page.waitForSelector('[role="menu"][data-state="open"]', {
      timeout: 10_000,
    });
    await settle(page, 300);
    const items = await menuItems(page);
    kit.check(
      `${name}: the composer's Attach menu items each have their glyph`,
      items.length > 0 && items.every((item) => item.svg),
      JSON.stringify(items)
    );
    await page.keyboard.press("Escape");
    await settle(page, 300);
  }
}

/** The threads menu, opened: every item has its glyph; New thread opens the hero. */
async function checkThreadsMenu(kit: Kit, page: Page, name: string) {
  await page.waitForSelector(`${DOCK} .threads-trigger`, { timeout: 60_000 });
  await page.click(`${DOCK} .threads-trigger`);
  await page.waitForSelector('[role="menu"][data-state="open"]', {
    timeout: 10_000,
  });
  await settle(page, 300);
  const items = await menuItems(page);
  kit.check(
    `${name}: the threads menu is the kit's menu, New thread then the threads, each item with its glyph`,
    items.length >= 2 &&
      items[0]?.words === "New thread" &&
      items.every((item) => item.svg),
    JSON.stringify(items)
  );
  const tokens = await offTokens(page, [
    ".threads-list .thread-row",
    ".threads-list .row-name",
  ]);
  kit.check(
    `${name}: the threads menu's rows draw tokens' colours`,
    tokens.off.filter((one) => !SPACING_PROP.test(one)).length === 0,
    tokens.off.join("; ")
  );
  await page.getByRole("menuitem", { name: "New thread" }).click();
  await settle(page, 400);
}

/** The head's ⋯: every item with its glyph; Caw's settings there say no money. */
async function checkSettings(kit: Kit, page: Page, name: string) {
  await page.click('.project-head [aria-label^="More for"]');
  await page.waitForSelector('[role="menu"][data-state="open"]', {
    timeout: 10_000,
  });
  await settle(page, 300);
  const items = await menuItems(page);
  kit.check(
    `${name}: the head's ⋯ holds Caw settings…, every item with its glyph`,
    items.some((item) => item.words === "Caw settings…") &&
      items.every((item) => item.svg),
    JSON.stringify(items)
  );
  await page.keyboard.press("Escape");
  await settle(page, 300);
  await openCawSettings(page);
  await settle(page, 400);
  const money = await moneyIn(page, ".caw-panel");
  kit.check(
    `${name}: Caw's settings say no money or spend`,
    money.length === 0,
    money.join(" | ")
  );
  await page.keyboard.press("Escape");
  await settle(page, 400);
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A git checkout in the sandbox for a project of its own. */
async function checkout(fleet: Fleet, name: string): Promise<string> {
  const src = join(fleet.sandbox, name);
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  return src;
}

/** The composer's field (its measuring twin is aria-hidden). */
const FIELD = 'textarea[aria-label="Message the project"]:not([aria-hidden])';

/** What the page's sockets received that carries a `thread.message` frame, as sent. */
function threadFrames(page: Page): string[] {
  const heard: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const words = typeof payload === "string" ? payload : payload.toString();
      if (words.includes('"thread.message"')) {
        heard.push(words);
      }
    });
  });
  return heard;
}

/** What the hub answered your words with: Caw's reply, or its note that he was not woken. */
type Answered =
  | { kind: "reply"; id: string; threadId: string }
  | { kind: "not-woken"; id: string; threadId: string; why: string };

/** The hub's answer to your message `yours`, once it has stored one. */
const answerTo = (fleet: Fleet, yours: string, tag: string) =>
  until<Answered>(
    `the hub's answer to ${tag}`,
    () => {
      const [reply] = fleet.query<{ id: string; threadId: string }>(
        "SELECT id, thread_id AS threadId FROM thread_messages WHERE author = 'caw' AND body = ?",
        `Answer ${tag}`
      );
      if (reply) {
        return { kind: "reply", ...reply };
      }
      const [note] = fleet.query<{ id: string; threadId: string; why: string }>(
        "SELECT id, thread_id AS threadId, json_extract(event, '$.notWoken.words') AS why FROM thread_messages WHERE author = 'event' AND json_extract(event, '$.notWoken.message') = ?",
        yours
      );
      return note ? { kind: "not-woken", ...note } : undefined;
    },
    Boolean,
    90_000
  ).catch(() => undefined);

/** Whether `root` shows `words` with the thread's turn over (no Stop), within a second. */
const showsSettled = (page: Page, root: string, words: string) =>
  page
    .waitForFunction(
      ({ sel, want }) => {
        const view = document.querySelector(sel);
        return (
          !!view?.textContent?.includes(want) &&
          !view.querySelector('button[aria-label="Stop the agent"]')
        );
      },
      { sel: root, want: words },
      { timeout: 1000 }
    )
    .then(
      () => true,
      () => false
    );

/** Whether `root` draws every not-woken note its thread holds (RowFault `data-not-woken`), within a second. */
const notesDrawn = (
  fleet: Fleet,
  page: Page,
  root: string,
  threadId: string
) => {
  const [{ n } = { n: 0 }] = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM thread_messages WHERE thread_id = ? AND json_extract(event, '$.notWoken.message') IS NOT NULL",
    threadId
  );
  return page
    .waitForFunction(
      ({ sel, want }) =>
        document.querySelectorAll(`${sel} [data-not-woken]`).length === want,
      { sel: root, want: n },
      { timeout: 1000 }
    )
    .then(
      () => `yes (${n})`,
      () => `no (${n} in the thread)`
    );
};

/**
 * Your words sent from the composer in `root`, tagged; the mock Caw answers
 * them in plain text and the hub stores it as his reply. Within a second of
 * the hub storing it, `root` shows it with his turn over, with no reload: a
 * reply that streamed in this view settles under the live row's key
 * (rows.ts `keepLive`), so it is read by its words, and with the turn over
 * those words are the stored message's, since the frame that ends the turn
 * also drops the live words (caw.ts `said`, then the thread's row). Answers
 * the thread it went to.
 */
async function replyLands(
  kit: Kit,
  fleet: Fleet,
  page: Page,
  heard: string[],
  name: string,
  root: string,
  tag: string
): Promise<string | undefined> {
  const words = `Live check: reply with PROBE-REPLY-${tag}.`;
  const field = page.locator(`${root} ${FIELD}`);
  await field.fill(words);
  await field.press("Enter");
  const yours = await until(
    `your words ${tag} in the hub`,
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM thread_messages WHERE author = 'you' AND body = ?",
        words
      )[0]?.id,
    Boolean,
    30_000
  ).catch(() => undefined);
  if (!kit.check(`${name}: the hub stores your words`, !!yours)) {
    return;
  }
  const answer = await answerTo(fleet, yours as string, tag);
  const framed = (id: string) => heard.some((frame) => frame.includes(id));
  const tail = async () =>
    (
      await page.evaluate(
        (sel) => document.querySelector(sel)?.textContent?.slice(-240) ?? "",
        root
      )
    ).replace(/\s+/g, " ");
  if (answer?.kind !== "reply") {
    // Caw could not start: the hub's note says so through the same frame,
    // and the view draws every such note the thread holds.
    const noted =
      answer && (await notesDrawn(fleet, page, root, answer.threadId));
    kit.check(
      `${name}: the hub stores Caw's reply`,
      false,
      answer
        ? `Caw was not woken: ${answer.why}; the hub's note ${answer.id} reached the page: ${framed(answer.id)}; the view draws the thread's not-woken notes within a second: ${noted}`
        : "the hub stored neither his reply nor a note"
    );
    return answer?.threadId;
  }
  const drawn = await showsSettled(page, root, `Answer ${tag}`);
  kit.check(
    `${name}: Caw's reply renders in the open view within a second of the hub storing it, no reload`,
    drawn,
    `reply ${answer.id} in thread ${answer.threadId}; its thread.message frame reached the page: ${framed(answer.id)}; the view ends “${await tail()}”`
  );
  return answer.threadId;
}

/** Picks from the dock's threads menu: New thread, or the thread titled `title`. */
async function pickThread(page: Page, title: string) {
  await page.click(`${DOCK} .threads-trigger`);
  await page.waitForSelector('[role="menu"][data-state="open"]', {
    timeout: 10_000,
  });
  await page.getByRole("menuitem", { name: title }).first().click();
  await settle(page, 400);
}

/**
 * The invariant: a message Caw posts to a thread appears in every open view
 * of it within a second of the hub storing it, with no reload, including a
 * thread the view itself made by sending its first message. In the dock: its
 * New thread (the owner's live case, 2026-10-16), the thread it then shows,
 * a thread chosen from its menu, and New thread with Caw on; in a thread
 * tab: a new thread, then the thread it made.
 */
async function checkReplies(kit: Kit, fleet: Fleet, base: string) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw replies",
    machineId: MACHINE,
    cwd: await checkout(fleet, "replies"),
    caw: false,
  });
  // A task on the board: Caw sits in the head (his seat), not over it.
  await fleet.api(`/api/projects/${project.id}/tasks`, { title: "A task" });
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  const heard = threadFrames(page);
  // What the page threw, or said failed: a pane that throws as it mounts is
  // taken down by its region's boundary (a thread reopened in the dock,
  // 2026-10-16), and nothing of its thread shows.
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  page.on("console", (line) => {
    if (line.type() === "error") {
      thrown.push(line.text().slice(0, 300));
    }
  });
  const seat = ".project-head button.caw-seat";
  await open(page, `${base}/project/${project.id}`, seat);
  await settle(page, 400);
  await page.click(seat);
  await page.waitForSelector(`${DOCK} ${FIELD}`, { timeout: 30_000 });
  // A thread to come back to, so the dock has a menu to pick New thread from.
  await fleet.api(`/api/projects/${project.id}/threads`, {
    body: "First thread",
  });
  await page.waitForSelector(`${DOCK} .threads-trigger`, { timeout: 30_000 });
  await pickThread(page, "New thread");
  await page.waitForSelector(HERO, { timeout: 15_000 });
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "dock, New thread, Caw off",
    DOCK,
    "DOCKNEW"
  );
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "dock, the thread its first words made",
    DOCK,
    "DOCKMADE"
  );
  await pickThread(page, "First thread");
  await page.waitForSelector(`${DOCK} .tx-columns`, { timeout: 30_000 });
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "dock, a thread chosen from its menu",
    DOCK,
    "DOCKPICKED"
  );
  const on = await fetch(`${fleet.base}/api/projects/${project.id}/caw`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ on: true }),
  });
  if (kit.check("Caw turned on", on.ok, `${on.status}`)) {
    await pickThread(page, "New thread");
    await page.waitForSelector(HERO, { timeout: 15_000 });
    await replyLands(
      kit,
      fleet,
      page,
      heard,
      "dock, New thread, Caw on",
      DOCK,
      "DOCKON"
    );
  }
  kit.check(
    "the dock threw nothing as its threads were made, answered and switched",
    thrown.length === 0,
    thrown.join(" | ")
  );
  // A thread tab: its first message makes the thread and re-addresses it.
  const tab = await kit.page("desk");
  tab.setDefaultTimeout(60_000);
  const tabHeard = threadFrames(tab);
  await open(tab, `${base}/session/thread:new:${project.id}`, FIELD, 90_000);
  await replyLands(
    kit,
    fleet,
    tab,
    tabHeard,
    "thread tab, a new thread",
    "body",
    "TABNEW"
  );
  await replyLands(
    kit,
    fleet,
    tab,
    tabHeard,
    "thread tab, the thread it made",
    "body",
    "TABMADE"
  );
}

const spec: Spec = {
  name: "caw-dock",
  async run(kit) {
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
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const src = await checkout(fleet, "src");
    const base = await fleet.dashboard();
    await checkReplies(kit, fleet, base);
    const project = await fleet.api<{ id: string; name: string }>(
      "/api/projects",
      { name: "Caw dock", machineId: MACHINE, cwd: src, caw: false }
    );
    // A task on the board: Caw sits in the head (his seat), not over it.
    await fleet.api(`/api/projects/${project.id}/tasks`, { title: "A task" });
    const url = `${base}/project/${project.id}`;
    const seat = ".project-head button.caw-seat";

    const sizes: { view: View; name: string }[] = [
      { view: "desk", name: "desk 1440" },
      { view: "tablet", name: "iPad 1024" },
      { view: "phone", name: "phone 390" },
    ];
    let threaded = false;
    for (const { view, name } of sizes) {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      await open(page, url, seat);
      await settle(page, 400);
      await page.click(seat);
      const docked = await page
        .waitForSelector(DOCK, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!kit.check(`${name}: pressing Caw's seat opens his dock`, docked)) {
        continue;
      }
      await settle(page, 600);
      if (threaded) {
        // The dock opens on the project's newest thread; New thread, the hero.
        await page.waitForSelector(`${DOCK} .tx-columns`, { timeout: 30_000 });
        await checkDock(kit, page, `${name}, a thread`);
        await checkThreadsMenu(kit, page, name);
      }
      await checkHero(kit, page, name);
      await checkDock(kit, page, `${name}, the hero`);
      if (!threaded) {
        // The project's first thread: the dock, on the hero, takes it as
        // the newest once it lands.
        await fleet.api(`/api/projects/${project.id}/threads`, {
          body: "Hello",
        });
        await until(
          "the thread",
          () =>
            fleet.query<{ n: number }>(
              "SELECT COUNT(*) AS n FROM project_threads WHERE project_id = ?",
              project.id
            )[0]?.n ?? 0,
          (n) => n > 0,
          30_000
        );
        threaded = true;
        const moved = await page
          .waitForSelector(`${DOCK} .threads-trigger`, { timeout: 30_000 })
          .then(() => true)
          .catch(() => false);
        kit.check(
          `${name}: the dock on the hero moves to the project's first thread once it lands`,
          moved
        );
        if (moved) {
          await checkDock(kit, page, `${name}, a thread`);
          await checkThreadsMenu(kit, page, name);
          await checkHero(kit, page, `${name}, New thread`);
        }
      }
      await page.keyboard.press("Escape");
      await settle(page, 300);
      // The dock goes; Caw's settings are the project's, under ⋯.
      if (await page.locator(DOCK).count()) {
        await page.click(`${DOCK} .side-head button.close`).catch(() => {
          // The sheet's own dismissal took it.
        });
        await settle(page, 400);
      }
      await checkSettings(kit, page, name);
    }
  },
};
export default spec;
