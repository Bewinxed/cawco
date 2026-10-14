/**
 * The empty board's Caw starters (The Empty Starts Work Rule), on a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model)
 * in the built dashboard, read from the engine and the hub's answers:
 *
 * 1. An empty social project shows the social template's four starters (the
 *    hub's, in its order) above the field, in the columns the recipe gives
 *    at the grid's width (one at 390; 3 + 1 at 680, where the board's
 *    column is narrower than four cards; four across at 768 and 1440),
 *    every card the same height and at least 56px.
 * 2. Pressing one puts its sentence in the field, focused with the caret at
 *    its end, and sends nothing (the hub's threads are as they were);
 *    pressing another replaces the words. The field's Send then sends it:
 *    the hub holds a thread whose first words are it.
 * 3. An empty code project shows the code starters.
 * 4. A project with a task shows no starters.
 *
 *   bun scripts/probe-kit/run.ts starters
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

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
];
const CODE = [
  "Triage the repo's open issues into Ready",
  "Turn the repo's spec into tasks",
  "Grill me on the next feature until it has a spec",
  "Find the riskiest bugs and file a task for each",
];

interface Layout {
  /** The last card's bottom is above the field's top. */
  above: boolean;
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
  page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>(".caw-starters .starter"),
    ];
    const boxes = cards.map((card) => card.getBoundingClientRect());
    const round = (n: number) => Math.round(n * 10) / 10;
    const field = document
      .querySelector(".caw-starters .caw-field")
      ?.getBoundingClientRect();
    const grid = document.querySelector(".caw-starters .cards");
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
      above:
        field !== undefined &&
        boxes.every((box) => box.bottom <= field.top + 0.5),
      texts: cards.map(
        (card) => card.querySelector(".starter-text")?.textContent?.trim() ?? ""
      ),
    };
  });

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
    "the hub serves each template's own four starters",
    same(await served(social.id), SOCIAL) && same(await served(code.id), CODE),
    `${(await served(social.id)).join(" | ")} // ${(await served(code.id)).join(" | ")}`
  );

  const base = await fleet.dashboard();
  const STARTERS = ".caw-starters .starter";

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
  // column holds that many: one on the phone, 3 + 1 at 680, four at 1440.
  for (const [width, read, columns] of [
    [390, at390, 1],
    [680, at680, 3],
    [768, at768, null],
    [1440, at1440, 4],
  ] as const) {
    kit.check(
      `1: at ${width}, the social starters stand above the field in the recipe's columns${columns ? ` (${columns})` : ""}, equal heights ≥ 56px`,
      same(read.texts, SOCIAL) &&
        read.above &&
        read.columns === read.fits &&
        (columns === null || read.columns === columns) &&
        read.rows === Math.ceil(read.texts.length / read.columns) &&
        new Set(read.heights).size === 1 &&
        (read.heights[0] ?? 0) >= 56,
      `grid ${read.width}px fits ${read.fits}: ${read.columns} col × ${read.rows} rows; heights ${read.heights.join(", ")}; above ${read.above}`
    );
  }

  // ── 2. a press fills the field; Send sends it ───────────────────────
  const threadCount = async () =>
    (await fleet.api<{ id: string }[]>(`/api/projects/${social.id}/threads`))
      .length;
  const before = await threadCount();
  const fieldState = () =>
    desk.evaluate(() => {
      const field = document.querySelector<HTMLTextAreaElement>(
        ".caw-starters textarea:not([aria-hidden])"
      );
      const active = document.activeElement;
      return {
        value: field?.value ?? "",
        focused: field !== null && active === field,
        caret: field?.selectionStart === field?.value.length,
        active: `${active?.tagName.toLowerCase()}.${String(active?.className).split(" ")[0]}`,
      };
    });
  await desk.locator(STARTERS, { hasText: SOCIAL[1] as string }).click();
  const first = await fieldState();
  const pressed = SOCIAL[0] as string;
  await desk.locator(STARTERS, { hasText: pressed }).click();
  // The field takes the focus once its words are drawn (the press awaits
  // Svelte's tick), a moment after the click has returned.
  await desk
    .waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector(".caw-starters textarea:not([aria-hidden])"),
      null,
      { timeout: 1000 }
    )
    .catch(() => undefined);
  const filled = await fieldState();
  // Long enough for a send the press must not have made to reach the hub.
  await desk.waitForTimeout(1500);
  const unsent = (await threadCount()) === before;
  kit.check(
    "2: a press puts its sentence in the field, focused, caret at the end, and sends nothing; another press replaces it",
    first.value === SOCIAL[1] &&
      filled.value === pressed &&
      filled.focused &&
      filled.caret &&
      unsent,
    `first “${first.value}”; then “${filled.value}”, focused ${filled.focused} (${filled.active}), caret at end ${filled.caret}; threads unchanged ${unsent}`
  );
  await desk.click(".caw-starters form.caw-field button[type='submit']");
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
    same(codeRead.texts, CODE),
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
