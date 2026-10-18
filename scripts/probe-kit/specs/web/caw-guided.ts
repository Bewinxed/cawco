/**
 * A project just made opens on Caw, and work in it starts by telling him
 * (PRD §5.6; the owner on 10-18: "there's no way to see caw and have it
 * guide us through setting up the project, and you still have the stupid
 * plain input box"). On a scratch fleet whose Jev (a mock) writes the
 * project's starters, in the built dashboard, read from the engine:
 *
 * 1. At 1440, 680 and 390, light and dark, a project just made from a
 *    folder opens with Caw's panel: his greeting, the starters as
 *    suggestion rows each as wide as its words, and the session Composer
 *    (the caret in it at a desk); no plain input anywhere. On a desk the
 *    panel stands by the empty board, never over its words: beside them
 *    where there is room (1440), under them where there is not (680).
 *    Nothing on the page spills or covers text (journeys/scan.ts), and the
 *    panel's room ends over its composer.
 * 2. The head's New session (the views bar's "+" on a phone) opens the
 *    panel on a new thread, its composer taking the caret; no popover but
 *    Caw's is open, and no "First prompt" field is in the DOM. A starter's
 *    words go in the composer; a send lands on the hub as the thread's
 *    first message, and the panel then shows Caw's reply, or why he could
 *    not read it.
 * 3. A reply filing three tasks, landing while the thread is open: the head
 *    line and then each card start one step apart on one clock
 *    (min(--dur-stagger, --dur-cascade / n), --dur-pop); each card is part
 *    way at its middle and whole at its end; once the stagger is over no
 *    animation is left on any card.
 *
 *   bun scripts/probe-kit/run.ts web caw-guided
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { jevMock, jevOn } from "../../jev-mock";
import { scan } from "../../journeys/scan";
import {
  COMPOSER,
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

const PANEL = "[data-caw-panel]";
/** The dashboard's socket to the hub (client.svelte.ts `hubSocketUrl`). */
const HUB_SOCKET = /\/ws\/dashboard/;
const LEGS: { name: string; view: View; width?: number }[] = [
  { name: "1440", view: "desk" },
  { name: "680", view: "desk", width: 680 },
  { name: "390", view: "phone" },
];
const FILED = [
  "Write the pricing page copy",
  "Changelog for 0.9",
  "Swap the hero photo for the harbour at dusk",
];

interface Setup {
  base: string;
  fleet: KitFleet;
  jev: ReturnType<typeof jevMock>;
  project: { id: string; name: string };
  url: string;
}

const setUp = async (kit: Kit): Promise<Setup> => {
  const jev = jevMock();
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_TYPESAFE_URL = jev.url;
  fleet.env.CAWCO_STARTERS_PACE = "1000/4000";
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await jevOn(fleet.base);
  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "harbour");
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await mkdir(src, { recursive: true });
  await writeFile(
    join(src, "README.md"),
    "# Harbour site\n\nThe booking site for the harbour cafe: menus, bookings and the Friday launch.\n"
  );
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  // Made from a folder, as New Session's project chip makes one: no thread,
  // nothing on its board.
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Harbour site", machineId: MACHINE, cwd: src }
  );
  // Its starters, written for it by Jev (the mock), once the hub is quiet.
  const starters = await until(
    "Harbour site's starters",
    async () =>
      (
        await fleet.api<{ starters: { text: string }[] }>(
          `/api/projects/${project.id}/stages`
        )
      ).starters,
    (now) => now.length > 0,
    60_000
  ).catch(() => []);
  kit.check(
    "Jev wrote the project's starters",
    starters.length > 0,
    starters.map((each) => each.text).join(" | ")
  );
  const base = await fleet.dashboard();
  return { base, fleet, jev, project, url: `${base}/project/${project.id}` };
};

/** The panel, its parts and the empty board, as the engine lays them out. */
const readPanel = (page: Page) =>
  page.evaluate((panelSel) => {
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r
        ? {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          }
        : null;
    };
    const words = (el: Element | null | undefined) =>
      el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const panel = document.querySelector(panelSel);
    const shell = panel?.parentElement ?? null;
    const form = panel?.querySelector('form[data-slot="cin"]');
    const room = panel?.querySelector('[data-slot="room"]');
    const starters = [
      ...(panel?.querySelectorAll('[data-slot="starter"]') ?? []),
    ].map((el) => ({
      box: box(el),
      text: words(el.querySelector('[data-slot="starter-text"]')),
      reason: words(el.querySelector('[data-slot="starter-reason"]')),
      bg: getComputedStyle(el).backgroundColor,
    }));
    const column = panel?.querySelector('[data-slot="starter-cards"]');
    const active = document.activeElement;
    return {
      vw: document.documentElement.clientWidth,
      panel: box(panel),
      shell: box(shell),
      greeting: words(
        panel?.querySelector(
          '[data-thread-hero] [data-slot="empty"] .kit-empty-title'
        )
      ),
      starters,
      column: box(column),
      composer: box(form),
      room: box(room),
      caretInComposer: !!(form && active && form.contains(active)),
      plainInputs: [...document.querySelectorAll("input")]
        .filter((input) => {
          const r = input.getBoundingClientRect();
          return (
            r.width > 0 &&
            (input.placeholder === "What should this session do?" ||
              input.closest("[data-caw-panel]"))
          );
        })
        .map((input) => input.placeholder),
      firstPrompt: document.body.innerText.includes("First prompt"),
      empty: box(document.querySelector('[data-slot="caw-empty"]')),
    };
  }, PANEL);

/** The project page with Caw's panel open: it opens by itself on an empty board, else from his seat. */
const openPanel = async (page: Page, url: string) => {
  await open(page, url, '[data-slot="caw-seat"]');
  await page.waitForTimeout(800);
  if ((await page.locator(PANEL).count()) === 0) {
    await page.locator('[data-slot="caw-seat"]').first().click();
  }
  await page.locator(PANEL).waitFor();
};

/** The overflow sweep (journeys/scan.ts) over the page with the panel open. */
const sweep = (page: Page) => page.evaluate(scan);

const shot = (kit: Kit, page: Page, name: string) =>
  page.screenshot({ path: join(kit.out, `${name}.png`) });

type PanelRead = Awaited<ReturnType<typeof readPanel>>;

/**
 * By the empty board, never over its words: beside them where the screen has
 * the room (1440), under them where it has not (680).
 */
const placement = (kit: Kit, tag: string, beside: boolean, at: PanelRead) =>
  kit.check(
    `${tag}: the panel stands ${beside ? "beside" : "under"} the empty board's words, not over them`,
    at.empty !== null &&
      at.shell !== null &&
      (beside
        ? at.shell.left >= at.empty.right - 0.5
        : at.shell.top >= at.empty.bottom - 0.5) &&
      at.shell.right <= at.vw,
    JSON.stringify({ empty: at.empty, panel: at.shell, vw: at.vw })
  );

/** 1 and 2, on one leg. */
const leg = async (
  kit: Kit,
  setup: Setup,
  { name, view, width }: (typeof LEGS)[number],
  theme: Theme
) => {
  const tag = `${name} ${theme}`;
  const phone = view === "phone";
  const page = await kit.page(view, { theme });
  if (width) {
    await page.setViewportSize({ width, height: 900 });
  }
  await open(page, setup.url, PANEL);
  await settle(page, 400);
  const at = await readPanel(page);
  kit.check(
    `${tag}: the project opens with Caw's panel, his greeting and the Composer, no plain input`,
    at.panel !== null &&
      at.panel.height > 0 &&
      at.greeting === `What's next for ${setup.project.name}?` &&
      at.composer !== null &&
      at.composer.height > 0 &&
      at.plainInputs.length === 0 &&
      !at.firstPrompt,
    JSON.stringify({
      greeting: at.greeting,
      composer: at.composer,
      plain: at.plainInputs,
      firstPrompt: at.firstPrompt,
    })
  );
  kit.check(
    `${tag}: the starters are suggestion rows, each as wide as its words`,
    at.starters.length > 0 &&
      at.column !== null &&
      at.starters.every(
        (row) =>
          row.box !== null &&
          row.box.height > 0 &&
          row.text.length > 0 &&
          row.box.right <= (at.column?.right ?? 0) + 0.5
      ) &&
      at.starters.some(
        (row) => (row.box?.width ?? 0) < (at.column?.width ?? 0) - 1
      ),
    JSON.stringify({
      column: at.column?.width,
      rows: at.starters.map((row) => [
        Math.round(row.box?.width ?? 0),
        row.text,
        row.reason,
      ]),
    })
  );
  if (!phone) {
    kit.check(`${tag}: the caret is in his composer`, at.caretInComposer);
    placement(kit, tag, name === "1440", at);
  }
  kit.check(
    `${tag}: the room ends over the composer: nothing scrolls under it`,
    at.room !== null &&
      at.composer !== null &&
      at.room.bottom <= at.composer.top + 0.5,
    JSON.stringify({ room: at.room, composer: at.composer })
  );
  const spill = await sweep(page);
  kit.check(
    `${tag}: nothing spills or covers text`,
    spill.length === 0,
    spill.join(" | ")
  );
  await shot(kit, page, `${name}-${theme}-first-open`);

  // 2. Put away, then New session: the panel on a new thread, no popover.
  await page.keyboard.press("Escape");
  await page.locator(PANEL).waitFor({ state: "detached" });
  if (phone) {
    await page
      .locator('[data-slot="view-bar"] [aria-label="New session"]')
      .click();
  } else {
    await page.locator("[data-new-session]").click();
  }
  await page.locator(PANEL).waitFor();
  await settle(page, 400);
  const again = await readPanel(page);
  // A popover drawn outside Caw's panel holding a form or a field: main's
  // New session popover was one (its "First prompt" field), named by its
  // class and words where one stands.
  const popovers = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll('[data-slot="popover-content"]')]
        .filter((pop) => {
          const r = pop.getBoundingClientRect();
          const style = getComputedStyle(pop);
          return (
            !pop.querySelector(sel) &&
            pop.querySelector("form, input") !== null &&
            r.width > 0 &&
            r.height > 0 &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0
          );
        })
        .map(
          (pop) =>
            `${pop.className}: ${pop.textContent?.replace(/\s+/g, " ").trim().slice(0, 80)}`
        ),
    PANEL
  );
  kit.check(
    `${tag}: ${phone ? "the views bar's +" : "New session"} opens Caw's composer on a new thread, no popover form`,
    again.panel !== null &&
      again.greeting === `What's next for ${setup.project.name}?` &&
      again.composer !== null &&
      (phone || again.caretInComposer) &&
      popovers.length === 0 &&
      again.plainInputs.length === 0 &&
      !again.firstPrompt,
    JSON.stringify({
      greeting: again.greeting,
      caret: again.caretInComposer,
      popovers,
    })
  );
  await page.close();
};

/** A starter's words into the composer, and the send landing on the hub. */
const starterSends = async (kit: Kit, setup: Setup) => {
  const page = await kit.page("desk", { theme: "light" });
  await open(page, setup.url, PANEL);
  await settle(page, 300);
  const row = page.locator(`${PANEL} [data-slot="starter"]`).first();
  const words =
    (await row.locator('[data-slot="starter-text"]').textContent())?.trim() ??
    "";
  await row.click();
  await settle(page, 200);
  const field = page.locator(`${PANEL} ${COMPOSER}`);
  const typed = (await field.textContent())?.trim() ?? "";
  kit.check(
    "a starter puts its words in his composer, nothing sent",
    words.length > 0 && typed === words,
    `“${words}” → “${typed}”`
  );
  await field.press("Enter");
  const threads = await until(
    "the starter's thread",
    () =>
      setup.fleet.api<{ id: string; title: string }[]>(
        `/api/projects/${setup.project.id}/threads`
      ),
    (now) => now.length > 0,
    20_000
  );
  const read = await setup.fleet.api<{
    messages: { author: string; body: string }[];
  }>(`/api/projects/${setup.project.id}/threads/${threads[0]?.id}`);
  kit.check(
    "the send lands on the hub as the thread's first message",
    read.messages[0]?.author === "you" && read.messages[0]?.body === words,
    JSON.stringify(read.messages.slice(0, 2))
  );
  // What follows is Caw's turn: his reply streams where a boundary can start
  // him (the host); inside a workspace's boundary none can, and the note
  // under your words says why, with Try again.
  const answered = await page
    .waitForFunction(
      (sel) => {
        const room = document
          .querySelector(sel)
          ?.querySelector('[data-slot="room"]');
        const caw = [
          ...(room?.querySelectorAll('[data-slot="who"] [data-slot="role"]') ??
            []),
        ].some((role) => role.textContent?.trim() === "Caw");
        const note = room?.querySelector("[data-not-woken]");
        if (caw) {
          return "reply";
        }
        return note
          ? `not woken: ${note.getAttribute("data-not-woken")}`
          : false;
      },
      PANEL,
      { timeout: 90_000 }
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => "nothing");
  const after = await page.evaluate(
    (sel) =>
      document
        .querySelector(sel)
        ?.querySelector('[data-slot="room"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 400) ?? "",
    PANEL
  );
  kit.check(
    "after the send, the panel shows Caw's reply, or why he could not read it",
    answered !== "nothing",
    `${answered}: ${after}`
  );
  await shot(kit, page, "1440-light-sent");
  await page.close();
  return threads[0]?.id ?? "";
};

/** 3. A reply filing three tasks, landing live: the stagger, and nothing left running after it. */
const filedTasks = async (kit: Kit, setup: Setup, threadId: string) => {
  const ids: string[] = [];
  for (const title of FILED) {
    const made = await setup.fleet.api<{ id: string }>(
      `/api/projects/${setup.project.id}/tasks`,
      { title }
    );
    ids.push(made.id);
  }

  const page = await kit.page("desk", { theme: "light" });
  // The reply reaches the page as the hub's frame does, on its socket.
  let inject: ((data: string) => void) | null = null;
  await page.routeWebSocket(HUB_SOCKET, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((data) => server.send(data));
    server.onMessage((data) => ws.send(data));
    inject = (data) => ws.send(data);
  });
  await openPanel(page, setup.url);
  await settle(page, 500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  const message = {
    id: crypto.randomUUID(),
    threadId,
    author: "caw",
    body: "Three things, filed for Friday.",
    tasks: ids,
    createdAt: Date.now(),
  };
  (inject as ((data: string) => void) | null)?.(
    JSON.stringify({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "thread.message", threadId, message },
    })
  );
  await page
    .locator(`${PANEL} [data-slot=filed-task]`)
    .nth(2)
    .waitFor({ timeout: 20_000 });
  const timing = await page.evaluate((sel) => {
    const probe = document.createElement("div");
    probe.style.transitionDuration = "var(--dur-stagger), var(--dur-cascade)";
    document.body.append(probe);
    const [stagger, cascade] = getComputedStyle(probe)
      .transitionDuration.split(",")
      .map(
        (each) =>
          Number.parseFloat(each) * (each.trim().endsWith("ms") ? 1 : 1000)
      );
    probe.remove();
    const cards0 = document.querySelectorAll(
      `${sel} [data-slot=filed-task]`
    ).length;
    const step = Math.min(stagger, cascade / (cards0 + 1));
    const head = document.querySelector(`${sel} [data-tasks-head]`);
    const cards = [
      ...document.querySelectorAll(`${sel} [data-slot=filed-task]`),
    ];
    const of = (el: Element | null) => {
      const run = el?.getAnimations()[0];
      const t = run?.effect?.getTiming();
      return t
        ? {
            delay: Number(t.delay),
            duration: Number(t.duration),
            easing: String(t.easing),
          }
        : null;
    };
    return { step, head: of(head), cards: cards.map(of) };
  }, PANEL);
  const steps = timing.cards.map((each) => each?.delay ?? -1);
  kit.check(
    "filed: the head and then each card start one step apart on one clock (--dur-pop)",
    timing.head?.delay === 0 &&
      steps.every(
        (delay, at) => Math.abs(delay - (at + 1) * timing.step) < 0.5
      ) &&
      [timing.head, ...timing.cards].every(
        (each) => each?.duration === timing.cards[0]?.duration
      ),
    JSON.stringify(timing)
  );
  // Seek each to the middle of its own run, then to its end: rising in.
  const mid = await page.evaluate((sel) => {
    const cards = [
      ...document.querySelectorAll(`${sel} [data-slot=filed-task]`),
    ];
    return cards.map((card) => {
      const [run] = card.getAnimations();
      const t = run?.effect?.getTiming();
      if (!(run && t)) {
        return null;
      }
      const at = (fraction: number) => {
        run.currentTime = Number(t.delay) + Number(t.duration) * fraction;
        return Number(getComputedStyle(card).opacity);
      };
      return { start: at(0), middle: at(0.5), end: at(0.999) };
    });
  }, PANEL);
  kit.check(
    "filed: each card is uncovered (opacity 0 at its start, part-way at its middle, whole by its end)",
    mid.every(
      (at) =>
        at !== null &&
        at.start === 0 &&
        at.middle > 0 &&
        at.middle < 1 &&
        at.end > 0.99
    ),
    JSON.stringify(mid)
  );
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await settle(page, 600);
  const after = await page.evaluate((sel) => {
    const words = (el: Element | null | undefined) =>
      el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const cards = [
      ...document.querySelectorAll(`${sel} [data-slot=filed-task]`),
    ];
    return {
      cards: cards.map((card) => ({
        height: card.getBoundingClientRect().height,
        title: words(card.querySelector('[data-slot="title"]')),
        opacity: Number(getComputedStyle(card).opacity),
      })),
      // `backwards`: done, no animation is left in effect on a card.
      running: document
        .getAnimations()
        .filter((anim) =>
          (anim.effect as KeyframeEffect | null)?.target?.closest?.(
            ".arrive, [data-tasks-head]"
          )
        ).length,
    };
  }, PANEL);
  kit.check(
    "filed: done, each card stands whole with its title, and no animation is left on any",
    after.cards.length === 3 &&
      after.cards.every(
        (card, at) =>
          card.height > 0 && card.title === FILED[at] && card.opacity === 1
      ) &&
      after.running === 0,
    JSON.stringify(after)
  );
  const spill = await sweep(page);
  kit.check(
    "filed: nothing spills or covers text",
    spill.length === 0,
    spill.join(" | ")
  );
  await shot(kit, page, "1440-light-filed");
  await page.close();
};

const run = async (kit: Kit) => {
  const setup = await setUp(kit);
  try {
    for (const one of LEGS) {
      for (const theme of THEMES) {
        await leg(kit, setup, one, theme);
      }
    }
    const threadId = await starterSends(kit, setup);
    await filedTasks(kit, setup, threadId);
  } finally {
    setup.jev.stop();
  }
};

export default { name: "caw-guided", run } satisfies Spec;
