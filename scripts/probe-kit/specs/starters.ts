/**
 * The empty board's Caw starters (The Empty Starts Work Rule), on a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model)
 * in the built dashboard, read from the engine and the hub's answers:
 *
 * 1. An empty social project shows the social template's starters as the
 *    hub serves them (every one, in its order: five today) under Caw on the
 *    empty board, in the columns the recipe gives at the grid's width (one
 *    at 390; three at 680, where the board's column is narrower than four
 *    cards; four at 768 and 1440), every card the same height and at least
 *    56px.
 * 2. Pressing one opens Caw's floating panel (CawFloat) with its sentence
 *    in the panel Composer's field, focused with the caret at its end, and
 *    sends nothing (the hub's threads are as they were); pressing another
 *    replaces the words. The Composer's Send then sends it: the hub holds a
 *    thread whose first words are it.
 * 3. An empty code project shows the code starters.
 * 4. A project with a task shows no starters.
 *
 *   bun scripts/probe-kit/run.ts starters
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER_FIELD, type Kit, open, type Spec, settle } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

/** What the hub's stages.ts gives each template: the spec holds it to them. */
const SOCIAL = [
  "Draft this week's posts in our voice",
  "Write ten post ideas into Idea",
  "Draft replies to this week's mentions",
  "Plan two weeks of posts on the calendar",
  "Build a design system from our site and code",
];
const CODE = [
  "Triage the repo's open issues into Ready",
  "Turn the repo's spec into tasks",
  "Grill me on the next feature until it has a spec",
  "Find the riskiest bugs and file a task for each",
];

/** The empty board's starter cards (StarterCards under Caw at 80). */
const STARTERS = ".caw-empty .starter";
/** Caw's floating panel (CawThread) and its Composer's field and Send. */
const PANEL = "[data-caw-panel]";
const FIELD = `${PANEL} ${COMPOSER_FIELD}[aria-label="Message the project"]`;
const SEND = `${PANEL} button[aria-label="Send message"]`;

interface Layout {
  columns: number;
  /**
   * The columns the recipe gives at the grid's width: one under 30rem, else
   * as many --c-starter-w columns and their gaps as fit, four at most.
   */
  fits: number;
  /** Every card's height, rounded to a tenth of a px. */
  heights: number[];
  rows: number;
  texts: string[];
  /** The grid's width, px. */
  width: number;
}

const layout = (page: Page): Promise<Layout> =>
  page.evaluate((starters) => {
    const cards = [...document.querySelectorAll<HTMLElement>(starters)];
    const boxes = cards.map((card) => card.getBoundingClientRect());
    const round = (n: number) => Math.round(n * 10) / 10;
    const grid = document.querySelector(".caw-empty .starter-cards .cards");
    const width = grid?.getBoundingClientRect().width ?? 0;
    const rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const min =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--c-starter-w"
        )
      ) * rem;
    const gap = grid ? Number.parseFloat(getComputedStyle(grid).columnGap) : 0;
    return {
      width: round(width),
      fits:
        width < 30 * rem
          ? 1
          : Math.min(cards.length, Math.floor((width + gap) / (min + gap))),
      columns: new Set(boxes.map((box) => round(box.left))).size,
      rows: new Set(boxes.map((box) => round(box.top))).size,
      heights: boxes.map((box) => round(box.height)),
      texts: cards.map(
        (card) => card.querySelector(".starter-text")?.textContent?.trim() ?? ""
      ),
    };
  }, STARTERS);

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((each, i) => each === b[i]);

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

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  /** A project of its own folder, made from `template`, Caw on. */
  const project = async (name: string, template: string) => {
    const src = join(fleet.sandbox, name);
    await mkdir(src, { recursive: true });
    await Bun.$`git init -q -b main && echo ${name} > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    return fleet.api<{ id: string; name: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: src,
      caw: true,
      template,
    });
  };
  const social = await project("social", "social");
  const code = await project("code", "code");
  const busy = await project("busy", "social");
  await fleet.api(`/api/projects/${busy.id}/tasks`, { title: "A task" });

  const served = async (id: string) =>
    (
      await fleet.api<{ starters: { text: string }[] }>(
        `/api/projects/${id}/stages`
      )
    ).starters.map((each) => each.text);
  kit.check(
    "the hub serves each template's own starters",
    same(await served(social.id), SOCIAL) && same(await served(code.id), CODE),
    `${(await served(social.id)).join(" | ")} // ${(await served(code.id)).join(" | ")}`
  );

  /** What the board must show: the hub's starters, every one, in its order. */
  const socialServed = await served(social.id);
  const codeServed = await served(code.id);

  const base = await fleet.dashboard();

  // ── 1. an empty social project at 390, 768 and 1440 ─────────────────
  const phone = await kit.page("phone");
  await open(phone, `${base}/project/${social.id}`, STARTERS);
  await settle(phone);
  await phone.screenshot({ path: join(kit.out, "social-390.png") });
  const at390 = await layout(phone);

  const desk = await kit.page("desk");
  await desk.setViewportSize({ width: 768, height: 1024 });
  await open(desk, `${base}/project/${social.id}`, STARTERS);
  await settle(desk);
  await desk.screenshot({ path: join(kit.out, "social-768.png") });
  const at768 = await layout(desk);

  await desk.setViewportSize({ width: 1440, height: 900 });
  await settle(desk);
  await desk.screenshot({ path: join(kit.out, "social-1440.png") });
  const at1440 = await layout(desk);

  await desk.setViewportSize({ width: 680, height: 900 });
  await settle(desk);
  await desk.screenshot({ path: join(kit.out, "social-680.png") });
  const at680 = await layout(desk);

  // The columns are the recipe's at the grid's width; where the board's
  // column holds that many: one on the phone, three at 680, four at 1440,
  // the rows as many as the hub's starters fill.
  // Open question for the owner: the social template's fifth starter (the
  // design-system one, 513a6fd8e) lays the cards out 4 + 1 at 1440 and
  // 3 + 2 at 680. Whether that stays is his call; this asserts what the
  // grid recipe gives today.
  for (const [width, read, columns] of [
    [390, at390, 1],
    [680, at680, 3],
    [768, at768, null],
    [1440, at1440, 4],
  ] as const) {
    kit.check(
      `1: at ${width}, the social starters stand under Caw in the recipe's columns${columns ? ` (${columns})` : ""}, equal heights ≥ 56px`,
      same(read.texts, socialServed) &&
        read.columns === read.fits &&
        (columns === null || read.columns === columns) &&
        read.rows === Math.ceil(read.texts.length / read.columns) &&
        new Set(read.heights).size === 1 &&
        (read.heights[0] ?? 0) >= 56,
      `grid ${read.width}px fits ${read.fits}: ${read.columns} col × ${read.rows} rows; heights ${read.heights.join(", ")}`
    );
  }

  // ── 2. a press opens Caw's panel with its words; Send sends them ────
  const threadCount = async () =>
    (await fleet.api<{ id: string }[]>(`/api/projects/${social.id}/threads`))
      .length;
  const before = await threadCount();
  /** The panel Composer's field: its words, focus, and a caret (Selection) collapsed at its end. */
  const readField = (selector: string) => {
    const field = document.querySelector<HTMLElement>(selector);
    const active = document.activeElement;
    const selection = getSelection();
    let caret = false;
    if (field && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const head = document.createRange();
      head.selectNodeContents(field);
      head.setEnd(range.endContainer, range.endOffset);
      caret =
        range.collapsed &&
        field.contains(range.endContainer) &&
        head.toString() === (field.textContent ?? "");
    }
    return {
      value: field?.textContent ?? "",
      focused: field !== null && active === field,
      caret,
      active: `${active?.tagName.toLowerCase()}.${String(active?.className).split(" ")[0]}`,
    };
  };
  /**
   * The field once a press has settled: its words drawn, the focus taken
   * and the caret placed after them (the Composer places it on the tick
   * after the words are drawn), or as it stands after 5s.
   */
  const pressedRead = (words: string) =>
    until(
      `the field settled on “${words}”`,
      () => desk.evaluate(readField, FIELD),
      (seen) => seen.value === words && seen.focused && seen.caret,
      5000
    ).catch(() => desk.evaluate(readField, FIELD));
  const firstWords = socialServed[1] as string;
  await desk.locator(STARTERS, { hasText: firstWords }).click();
  const first = await pressedRead(firstWords);
  const pressed = socialServed[0] as string;
  await desk.locator(STARTERS, { hasText: pressed }).click();
  const filled = await pressedRead(pressed);
  // Long enough for a send the press must not have made to reach the hub.
  await desk.waitForTimeout(1500);
  const unsent = (await threadCount()) === before;
  kit.check(
    "2: a press opens Caw's panel with its sentence in the Composer, focused, caret at the end, and sends nothing; another press replaces it",
    first.value === firstWords &&
      filled.value === pressed &&
      filled.focused &&
      filled.caret &&
      unsent,
    `first “${first.value}”, caret at end ${first.caret}; then “${filled.value}”, focused ${filled.focused} (${filled.active}), caret at end ${filled.caret}; threads unchanged ${unsent}`
  );
  await desk.click(SEND);
  const thread = await until(
    "a thread opened by the starter",
    async () => {
      const threads = await fleet.api<{ id: string }[]>(
        `/api/projects/${social.id}/threads`
      );
      for (const each of threads) {
        // biome-ignore lint/performance/noAwaitInLoops: a project's few threads, one read each
        const read = await fleet.api<{
          messages: { author: string; body?: string }[];
        }>(`/api/projects/${social.id}/threads/${each.id}`);
        const opening = read.messages.find((m) => m.author === "you");
        if (opening?.body === pressed) {
          return each.id;
        }
      }
    },
    Boolean,
    60_000
  );
  kit.check(
    "2: Send opens the project's thread with those words",
    Boolean(thread),
    `thread ${thread}`
  );

  // ── 3. an empty code project shows the code starters ────────────────
  await open(desk, `${base}/project/${code.id}`, STARTERS);
  const codeRead = await layout(desk);
  kit.check(
    "3: an empty code project shows the code starters",
    same(codeRead.texts, codeServed),
    codeRead.texts.join(" | ")
  );

  // ── 4. a project with a task shows none ─────────────────────────────
  await open(desk, `${base}/project/${busy.id}`, "[data-share^='task:']");
  await settle(desk);
  kit.check(
    "4: a project with a task shows no starters",
    (await desk.locator(STARTERS).count()) === 0
  );
};

export default { name: "starters", run } satisfies Spec;
