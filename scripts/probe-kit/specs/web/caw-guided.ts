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
 *    named for him (the caret in it at a desk); no plain input anywhere.
 *    On a desk the panel is docked: beside the page where it has the room
 *    (1440), under it across the column where it has not (680, the same
 *    margins as 1440's foot), never over the head, the empty board's
 *    words or a column; on a phone it is the kit's bottom sheet, full-bleed
 *    on the foot, his head its one header under the grabber, Close at its
 *    trailing edge. The rows: each reason 4.5:1 on its row, each row's edge 3:1 on the panel; curly
 *    apostrophes. The shell's Caw card stands shut behind its cut, never
 *    opened by itself. Nothing spills or covers text (journeys/scan.ts), and
 *    the panel's room ends over its composer.
 * 2. The head's Ask Caw (the views bar's "+" on a phone) opens the panel on
 *    a new thread, its composer taking the caret; no popover but Caw's is
 *    open, and no "First prompt" field is in the DOM. Spin off stays.
 * 3. A starter's words go in the composer; the send opens the project's
 *    Setup thread on the hub (a project made from a folder starts Caw's
 *    setup with its first words). Words he could not be woken for say why
 *    in one plain sentence, no workspace id or path in it, the hub's own
 *    words under Show details.
 * 4. A reply filing three tasks, landing while the thread is open: the head
 *    line and then each card start one step apart on one clock
 *    (min(--dur-stagger, --dur-cascade / n), --dur-pop); each card is part
 *    way at its middle and whole at its end; once the stagger is over no
 *    animation is left on any card. With the tasks on the board, at 1440
 *    and 680 the panel stands where it stood over the empty board and
 *    covers no column, and the name's start edge has not moved.
 * 5. A name with a word longer than its column breaks only at its spaces
 *    (1280, 390), never under the head's actions.
 * 6. New project lands on the project's page with Caw's panel open on its
 *    Setup thread.
 *
 *   bun scripts/probe-kit/run.ts web caw-guided
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { projectWords } from "../../../../packages/core/src/words/project";
import { spawnWords } from "../../../../packages/core/src/words/spawn";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { contrast, type Rgb } from "../../ink";
import { jevMock, jevOn } from "../../jev-mock";
import { scan } from "../../journeys/scan";
import {
  COMPOSER,
  type Kit,
  type KitFleet,
  open,
  readMotion,
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
interface Leg {
  name: string;
  view: View;
  width?: number;
}
const LEGS: Leg[] = [
  { name: "1440", view: "desk" },
  { name: "680", view: "desk", width: 680 },
  { name: "390", view: "phone" },
];
const FILED = [
  "Write the pricing page copy",
  "Changelog for 0.9",
  "Swap the hero photo for the harbour at dusk",
];
/** A workspace or place id as the hub's own errors name it ("23cf245e-caw"). */
const WORKSPACE_ID = /\b[0-9a-f]{8}\b/;
/** A machine path inside a sentence ("/home/…/bwrap"). */
const MACHINE_PATH = /(^|[\s(])\/[\w.~-]+\//;
/** A project's page, by its id. */
const PROJECT_PAGE = /\/project\/[0-9a-f-]{36}(\?.*)?$/;
/** A name whose second word is longer than a phone's name column (defensive-css: one unbroken word). */
const LONG_NAME = "Tidewater harbourfrontbookingsystemcooperative";

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
  fleet.standIns.typesafeUrl = jev.url;
  fleet.standIns.startersPace = { quiet: 1000, gap: 4000 };
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

/** A page at a leg's size. */
const legPage = async (kit: Kit, { view, width }: Leg, theme: Theme) => {
  const page = await kit.page(view, { theme });
  if (width) {
    await page.setViewportSize({ width, height: 900 });
  }
  return page;
};

/** The panel, its parts, the head and the board, as the engine lays them out. */
const readPanel = (page: Page) =>
  page.evaluate(
    ([panelSel, firstPromptLabel, spinOffLabel]) => {
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
      /** What of `el` shows: its box cut by every ancestor that clips (a scroller, overflow hidden). */
      const shownBox = (el: Element) => {
        const r = el.getBoundingClientRect();
        let { left, right, top, bottom } = r;
        for (let at = el.parentElement; at; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const c = at.getBoundingClientRect();
            left = Math.max(left, c.left);
            right = Math.min(right, c.right);
            top = Math.max(top, c.top);
            bottom = Math.min(bottom, c.bottom);
          }
        }
        return right > left && bottom > top
          ? {
              left,
              right,
              top,
              bottom,
              width: right - left,
              height: bottom - top,
            }
          : null;
      };
      // Computed colours as sRGB, through a canvas (ink.ts `colours`).
      const canvas = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      const rgb = (css: string): [number, number, number] => {
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = "#000";
        canvas.fillStyle = css;
        canvas.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      /** The fill under `el`: its own, else the nearest ancestor's that paints one. */
      const ground = (el: Element | null) => {
        for (let at = el; at; at = at.parentElement) {
          const fill = getComputedStyle(at).backgroundColor;
          if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
            return rgb(fill);
          }
          const before = getComputedStyle(at, "::before");
          if (
            before.content !== "none" &&
            before.backgroundColor !== "rgba(0, 0, 0, 0)"
          ) {
            return rgb(before.backgroundColor);
          }
        }
        return rgb("#fff");
      };
      const panel = document.querySelector(panelSel);
      const shell =
        panel?.closest(
          '[data-caw-dock], [data-slot="drawer-content"], [data-slot="popover-content"]'
        ) ?? null;
      const form = panel?.querySelector('form[data-slot="cin"]');
      const room = panel?.querySelector('[data-slot="room"]');
      const starters = [
        ...(panel?.querySelectorAll('[data-slot="starter"]') ?? []),
      ].map((el) => {
        const reason = el.querySelector('[data-slot="starter-reason"]');
        const style = getComputedStyle(el);
        const row = ground(el);
        return {
          box: box(el),
          text: words(el.querySelector('[data-slot="starter-text"]')),
          reason: words(reason),
          reasonContrast: reason
            ? { ink: rgb(getComputedStyle(reason).color), row }
            : null,
          edge: {
            width: Number.parseFloat(style.borderTopWidth),
            ink: rgb(style.borderTopColor),
            fill: row,
            panel: ground(el.closest('[data-slot="starter-cards"]')),
          },
        };
      });
      const column = panel?.querySelector('[data-slot="starter-cards"]');
      const active = document.activeElement;
      const pane = document.querySelector('[data-slot="pane"]');
      const paneStyle = pane ? getComputedStyle(pane) : null;
      const paneBox = box(pane);
      const before = shell ? getComputedStyle(shell, "::before") : null;
      const grabber = shell?.querySelector(
        ':scope > [data-slot="drawer-grabber"]'
      );
      const card = document.querySelector("[data-glass-card-frame]");
      return {
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
        panel: box(panel),
        shell: box(shell),
        greeting: words(
          panel?.querySelector(
            '[data-thread-hero] [data-slot="empty"] [data-slot="empty-title"]'
          )
        ),
        starters,
        column: box(column),
        composer: box(form),
        placeholder:
          form
            ?.querySelector("[data-placeholder]")
            ?.getAttribute("data-placeholder") ?? "",
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
        firstPrompt: document.body.innerText.includes(firstPromptLabel),
        empty: box(document.querySelector('[data-slot="caw-empty"]')),
        head: box(document.querySelector('[data-slot="project-head"]')),
        title: box(
          document.querySelector(
            '[data-slot="project-head"] [data-slot="name"]'
          )
        ),
        act: words(document.querySelector("[data-new-session]")),
        // Its label and its pending wording stand in one cell (DESIGN.md, Buttons).
        spinOff: [
          ...document.querySelectorAll('[data-slot="project-head"] button'),
        ].some((button) => words(button).startsWith(spinOffLabel)),
        // Each column of the board as it shows: a column scrolled past the
        // board's edge is cut by it.
        columns: [...document.querySelectorAll('[data-slot="column"]')]
          .map(shownBox)
          .filter((each) => each !== null),
        // The view's column: the pane less its inline padding.
        lane:
          paneBox && paneStyle
            ? {
                left: paneBox.left + Number.parseFloat(paneStyle.paddingLeft),
                right:
                  paneBox.right - Number.parseFloat(paneStyle.paddingRight),
              }
            : null,
        sheet: before
          ? {
              top: before.top,
              left: before.left,
              right: before.right,
              bottom: before.bottom,
              topLeft: before.borderTopLeftRadius,
              bottomLeft: before.borderBottomLeftRadius,
              bottomRight: before.borderBottomRightRadius,
              sides: before.borderLeftWidth,
            }
          : null,
        grabber: box(grabber),
        name: box(panel?.querySelector('[data-caw-head] [data-slot="name"]')),
        // The sheet's headers: the kit's own, and Close in his head.
        sheetHeads:
          shell?.querySelectorAll('[data-slot="drawer-header"]').length ?? 0,
        headClose: box(
          panel?.querySelector('[data-caw-head] [aria-label="Close"]')
        ),
        // The shell's Caw card, as it stands now: shown, or at rest up behind
        // its cut, inert (GlassCard, motion/hang).
        glassCard: card
          ? {
              shown: card.hasAttribute("data-shown"),
              inert: (card as HTMLElement).inert,
              state: card.getAttribute("data-state"),
              translate: getComputedStyle(card).translate,
              box: box(card),
            }
          : null,
      };
    },
    [PANEL, spawnWords.firstPrompt, projectWords.spinOff] as const
  );

type PanelRead = Awaited<ReturnType<typeof readPanel>>;
type Box = NonNullable<PanelRead["panel"]>;

/** Whether two boxes share any area. */
const meet = (a: Box | null, b: Box | null) =>
  a !== null &&
  b !== null &&
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

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

/** Where the panel stood over the empty board, and the name's start edge, by leg (light). */
const firstOpen = new Map<string, { dock: Box | null; title: Box | null }>();
/** The desk's room under the panel, 1440 light: 680's panel keeps it. */
let deskFoot: number | null = null;

/**
 * Docked, the panel shares no area with the head, the empty board's words
 * or any column of the board.
 */
const clear = (kit: Kit, tag: string, at: PanelRead) =>
  kit.check(
    `${tag}: the panel covers no column of the board, the head or the empty board's words`,
    at.shell !== null &&
      !meet(at.shell, at.head) &&
      !meet(at.shell, at.empty) &&
      at.columns.every((each) => !meet(at.shell, each)) &&
      at.shell.right <= at.vw,
    JSON.stringify({
      panel: at.shell,
      head: at.head,
      empty: at.empty,
      columns: at.columns,
    })
  );

/** The rows, on a leg: as wide as their words, their reasons and edges read, curly apostrophes. */
const rowChecks = (kit: Kit, tag: string, at: PanelRead) => {
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
  const reasons = at.starters
    .filter((row) => row.reasonContrast)
    .map((row) => ({
      text: row.reason,
      ratio: contrast(
        row.reasonContrast?.ink as Rgb,
        row.reasonContrast?.row as Rgb
      ),
    }));
  kit.check(
    `${tag}: every reason reads 4.5:1 on its row`,
    reasons.length > 0 && reasons.every((each) => each.ratio >= 4.5),
    JSON.stringify(reasons.map((each) => [each.text, each.ratio.toFixed(2)]))
  );
  const edges = at.starters.map((row) => ({
    width: row.edge.width,
    fill: contrast(row.edge.ink, row.edge.fill),
    panel: contrast(row.edge.ink, row.edge.panel),
  }));
  kit.check(
    `${tag}: every row has an edge, 3:1 on the panel and on its own fill`,
    edges.every((each) => each.width >= 1 && each.fill >= 3 && each.panel >= 3),
    JSON.stringify(
      edges.map((each) => ({
        width: each.width,
        fill: each.fill.toFixed(2),
        panel: each.panel.toFixed(2),
      }))
    )
  );
  const said = [
    at.greeting,
    ...at.starters.flatMap((row) => [row.text, row.reason]),
  ];
  kit.check(
    `${tag}: every apostrophe is curly`,
    said.every((words) => !words.includes("'")),
    said.filter((words) => words.includes("'")).join(" | ")
  );
};

/** A phone's panel: the kit's bottom sheet, full-bleed on the foot. */
const sheetChecks = (kit: Kit, tag: string, at: PanelRead) => {
  kit.check(
    `${tag}: the sheet is full-bleed on the foot, its top corners alone rounded`,
    at.shell !== null &&
      at.sheet !== null &&
      Math.abs(at.shell.left) < 0.5 &&
      Math.abs(at.shell.right - at.vw) < 0.5 &&
      Math.abs(at.shell.bottom - at.vh) < 0.5 &&
      at.sheet.left === "0px" &&
      at.sheet.right === "0px" &&
      at.sheet.bottom === "0px" &&
      at.sheet.sides === "0px" &&
      at.sheet.topLeft !== "0px" &&
      at.sheet.bottomLeft === "0px" &&
      at.sheet.bottomRight === "0px",
    JSON.stringify({
      sheet: at.shell,
      surface: at.sheet,
      vw: at.vw,
      vh: at.vh,
    })
  );
  const gap =
    at.grabber && at.name ? at.name.top - at.grabber.bottom : Number.NaN;
  kit.check(
    `${tag}: his name stands under the grabber, no band between them`,
    gap >= 0 && gap <= 20,
    JSON.stringify({ grabber: at.grabber, name: at.name, gap })
  );
  // DESIGN.md, Drawer: "A 100×6 grabber, then one header: the title in the
  // title role and Close at the trailing edge". His head is that one header.
  kit.check(
    `${tag}: his head is the sheet's one header, Close at its trailing edge`,
    at.sheetHeads === 0 &&
      at.headClose !== null &&
      at.headClose.width > 0 &&
      at.shell !== null &&
      at.headClose.right <= at.shell.right &&
      at.name !== null &&
      at.headClose.left > at.name.right,
    JSON.stringify({
      headers: at.sheetHeads,
      close: at.headClose,
      name: at.name,
    })
  );
};

/** A desk's panel: docked beside the page (1440) or across the column under it (680). */
const dockChecks = (
  kit: Kit,
  tag: string,
  name: string,
  theme: Theme,
  at: PanelRead
) => {
  kit.check(`${tag}: the caret is in his composer`, at.caretInComposer);
  clear(kit, tag, at);
  kit.check(
    `${tag}: the head's actions are Ask Caw and Spin off`,
    at.act === "Ask Caw" && at.spinOff,
    JSON.stringify({ act: at.act, spinOff: at.spinOff })
  );
  const foot = at.shell ? at.vh - at.shell.bottom : Number.NaN;
  if (name === "1440") {
    kit.check(
      `${tag}: the panel stands beside the page, its top on the name's`,
      at.shell !== null &&
        at.head !== null &&
        at.title !== null &&
        at.shell.left >= at.head.right - 0.5 &&
        Math.abs(at.shell.top - at.title.top) < 1,
      JSON.stringify({ panel: at.shell, head: at.head, name: at.title })
    );
    if (theme === "light") {
      deskFoot = foot;
    }
  } else {
    kit.check(
      `${tag}: the panel fits the column under the page, the desk's room under it`,
      at.shell !== null &&
        at.lane !== null &&
        deskFoot !== null &&
        Math.abs(at.shell.left - at.lane.left) < 1 &&
        Math.abs(at.shell.right - at.lane.right) < 1 &&
        Math.abs(foot - deskFoot) < 1,
      JSON.stringify({ panel: at.shell, lane: at.lane, foot, deskFoot })
    );
  }
  if (theme === "light") {
    firstOpen.set(name, { dock: at.shell, title: at.title });
  }
};

/** 1 and 2, on one leg. */
const leg = async (kit: Kit, setup: Setup, one: Leg, theme: Theme) => {
  const { name } = one;
  const tag = `${name} ${theme}`;
  const phone = one.view === "phone";
  const page = await legPage(kit, one, theme);
  await open(page, setup.url, PANEL);
  await settle(page, 400);
  const at = await readPanel(page);
  kit.check(
    `${tag}: the project opens with Caw's panel, his greeting and the Composer, no plain input`,
    at.panel !== null &&
      at.panel.height > 0 &&
      at.greeting === `What’s next for ${setup.project.name}?` &&
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
    `${tag}: his composer is named for him`,
    at.placeholder === "Message Caw…",
    at.placeholder
  );
  rowChecks(kit, tag, at);
  kit.check(
    `${tag}: the starters and his composer's field start on one edge`,
    at.starters.length > 0 &&
      at.composer !== null &&
      at.starters.every(
        (row) =>
          Math.abs((row.box?.left ?? -99) - (at.composer?.left ?? 0)) <= 1
      ),
    JSON.stringify({
      starters: at.starters.map((row) => row.box?.left),
      field: at.composer?.left,
    })
  );
  kit.check(
    `${tag}: the shell's Caw card stands shut behind its cut, not opened by itself`,
    at.glassCard === null ||
      (!at.glassCard.shown &&
        at.glassCard.inert &&
        at.glassCard.translate !== "none"),
    JSON.stringify(at.glassCard)
  );
  if (phone) {
    sheetChecks(kit, tag, at);
    // The sheet holds nothing (CawFloat): while it stands, the pane keeps
    // its height of room at its foot, whatever the view (the board's own
    // `pb-0` included), so the view's foot scrolls clear of it (b8eca881d).
    const foot = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-slot="pane"]');
      const probe = document.createElement("div");
      probe.style.height = "var(--c-sheet-max-h)";
      document.body.append(probe);
      const room = getComputedStyle(probe).height;
      probe.remove();
      return {
        view: pane?.dataset.view ?? null,
        padding: pane ? getComputedStyle(pane).paddingBottom : null,
        room,
      };
    });
    kit.check(
      `${tag}: the pane keeps the sheet's height of room at its foot, on the board too`,
      foot.padding !== null &&
        Math.abs(
          Number.parseFloat(foot.padding) - Number.parseFloat(foot.room)
        ) < 0.5,
      JSON.stringify(foot)
    );
  } else {
    dockChecks(kit, tag, name, theme, at);
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

  // 2. Put away, then Ask Caw: the panel on a new thread, no popover.
  await page.keyboard.press("Escape");
  await page.locator(PANEL).waitFor({ state: "detached" });
  if (phone) {
    await page.locator('[data-slot="view-bar"] [aria-label="Ask Caw"]').click();
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
    `${tag}: ${phone ? "the views bar's +" : "Ask Caw"} opens Caw's composer on a new thread, no popover form`,
    again.panel !== null &&
      again.greeting === `What’s next for ${setup.project.name}?` &&
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

/** The room's words, and what the not-woken note under your last words says. */
const roomWords = (page: Page) =>
  page.evaluate(
    (sel) =>
      document
        .querySelector(sel)
        ?.querySelector('[data-slot="room"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "",
    PANEL
  );

/**
 * Caw's turn after a send: his reply where a boundary can start him (the
 * host), else why he could not: for a project's first words, setup's
 * "could not start"; after them, a not-woken note past the `notes` already
 * in the room.
 */
const answerOf = (page: Page, notes: number | null = null) =>
  page
    .waitForFunction(
      ({ sel, before }) => {
        const room = document
          .querySelector(sel)
          ?.querySelector('[data-slot="room"]');
        const caw = [
          ...(room?.querySelectorAll('[data-turn-who] [data-slot="role"]') ??
            []),
        ].some((role) => role.textContent?.trim() === "Caw");
        const said = [...(room?.querySelectorAll("[data-not-woken]") ?? [])];
        if (caw) {
          return "reply";
        }
        if (before !== null && said.length > before) {
          return `not woken: ${said.at(-1)?.getAttribute("data-not-woken")}`;
        }
        return before === null &&
          room?.textContent?.includes("Caw · could not start")
          ? "could not start"
          : false;
      },
      { sel: PANEL, before: notes },
      { timeout: 90_000 }
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => "nothing");

/** The room's words naming a workspace id that show on screen: clipped, folded or hidden ones don't. */
const rawWordsShown = (page: Page) =>
  page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so every helper it uses lives inside it
    ({ sel, id }) => {
      const pattern = new RegExp(id);
      const room = document
        .querySelector(sel)
        ?.querySelector('[data-slot="room"]');
      const walker = document.createTreeWalker(
        room ?? document.body,
        NodeFilter.SHOW_TEXT
      );
      const shown: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!pattern.test(node.textContent ?? "")) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        let visible = r.width > 0 && r.height > 0;
        for (
          let at = node.parentElement;
          at && visible;
          at = at.parentElement
        ) {
          const style = getComputedStyle(at);
          if (style.display === "none" || style.visibility === "hidden") {
            visible = false;
          } else if (
            style.overflowX !== "visible" ||
            style.overflowY !== "visible"
          ) {
            const c = at.getBoundingClientRect();
            visible =
              Math.min(r.right, c.right) > Math.max(r.left, c.left) &&
              Math.min(r.bottom, c.bottom) > Math.max(r.top, c.top);
          }
        }
        if (visible) {
          shown.push((node.textContent ?? "").slice(0, 80));
        }
      }
      return shown;
    },
    { sel: PANEL, id: WORKSPACE_ID.source }
  );

/** 3. A starter's words into the composer, the send opening the Setup thread, and why Caw could not read the next. */
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
      setup.fleet.api<{ id: string; title: string; setup: boolean }[]>(
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
  kit.check(
    "a project made from a folder starts Caw's setup with its first words",
    threads[0]?.setup === true &&
      threads[0]?.title === `Set up ${setup.project.name}`,
    JSON.stringify(threads[0])
  );
  const first = await answerOf(page);
  kit.check(
    "after the send, the panel shows Caw's reply, or why he could not start",
    first !== "nothing",
    `${first}: ${(await roomWords(page)).slice(0, 300)}`
  );

  // Setup's own note keeps the machine's words folded under its title.
  const rawShown = await rawWordsShown(page);
  kit.check(
    "setup's could-not-start note keeps the machine's words folded under its title",
    rawShown.length === 0,
    rawShown.join(" | ")
  );

  // Words he is not woken for: one plain sentence, the hub's under Show details.
  const next = "Start with the menus";
  await field.click();
  await field.fill(next);
  const notesBefore = await page.locator(`${PANEL} [data-not-woken]`).count();
  await field.press("Enter");
  const answered = await answerOf(page, notesBefore);
  const note = await page.evaluate((sel) => {
    const notes = [
      ...(document
        .querySelector(sel)
        ?.querySelectorAll<HTMLElement>("[data-not-woken]") ?? []),
    ];
    const last = notes.at(-1);
    return last
      ? {
          text: last.innerText.replace(/\s+/g, " ").trim(),
          details: last.querySelector("[data-details]") !== null,
        }
      : null;
  }, PANEL);
  kit.check(
    "a note he wasn't woken for says why in one plain sentence: no workspace id, no path",
    answered === "reply" ||
      (note !== null &&
        !WORKSPACE_ID.test(note.text) &&
        !MACHINE_PATH.test(note.text) &&
        note.text.length <= 160),
    `${answered}: ${JSON.stringify(note)}`
  );
  let raw = "";
  if (note?.details) {
    await page
      .locator(`${PANEL} [data-not-woken] [data-details]`)
      .last()
      .click();
    await settle(page, 200);
    raw = await page.evaluate(
      (sel) =>
        [
          ...(document
            .querySelector(sel)
            ?.querySelectorAll<HTMLElement>(
              '[data-not-woken] [data-slot="details"]'
            ) ?? []),
        ]
          .at(-1)
          ?.innerText.trim() ?? "",
      PANEL
    );
  }
  kit.check(
    "Show details holds the hub's own words",
    answered === "reply" || (note?.details === true && raw.length > 0),
    raw.slice(0, 300)
  );
  await page.close();
  return threads[0]?.id ?? "";
};

/** A page whose dashboard socket lets the spec hand it a hub frame (`payload`). */
const hubFrames = async (page: Page) => {
  let inject: ((data: string) => void) | null = null;
  await page.routeWebSocket(HUB_SOCKET, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((data) => server.send(data));
    server.onMessage((data) => ws.send(data));
    inject = (data) => ws.send(data);
  });
  return (payload: unknown) =>
    (inject as ((data: string) => void) | null)?.(
      JSON.stringify({ verb: "frames", machineId: "hub", payload })
    );
};

/** A page whose socket brings it Caw's reply filing `ids`, as the hub's frame does. */
const withSocket = async (page: Page) => {
  const send = await hubFrames(page);
  return (threadId: string, ids: string[]) =>
    send({
      kind: "thread.message",
      threadId,
      message: {
        id: crypto.randomUUID(),
        threadId,
        author: "caw",
        body: "Three things, filed for Friday.",
        tasks: ids,
        createdAt: Date.now(),
      },
    });
};

/**
 * The head's and each filed card's run while the clock holds it, in the
 * page's order: its delay, length and curve, and each card sought through
 * its own run (its delay, then its length): its opacity at its start,
 * middle and end.
 */
function uncovering(sel: string) {
  const of = (el: Element | null) => {
    const [run] = el?.getAnimations() ?? [];
    const t = run?.effect?.getTiming();
    return run && t
      ? {
          run,
          delay: Number(t.delay),
          duration: Number(t.duration),
          easing: String(t.easing),
        }
      : null;
  };
  const head = of(document.querySelector(`${sel} [data-tasks-head]`));
  const cards = [
    ...document.querySelectorAll(`${sel} [data-slot=filed-task]`),
  ].map((card) => {
    const timed = of(card);
    if (!timed) {
      return null;
    }
    const { run, ...timing } = timed;
    const at = (fraction: number) => {
      run.currentTime = timing.delay + timing.duration * fraction;
      return Number(getComputedStyle(card).opacity);
    };
    return { ...timing, start: at(0), middle: at(0.5), end: at(0.999) };
  });
  return {
    head: head
      ? { delay: head.delay, duration: head.duration, easing: head.easing }
      : null,
    cards,
  };
}

/** 4. A reply filing three tasks, landing live: the stagger, and nothing left running after it. */
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
  const reply = await withSocket(page);
  await openPanel(page, setup.url);
  await settle(page, 500);
  // The arrival as the kit reads motion (kit.ts `readMotion`): every run
  // the reply starts in the panel, its delay, length and curve, the clock
  // held while each card is sought through its own run.
  const arrival = await readMotion(
    page,
    async () => {
      reply(threadId, ids);
      await page
        .locator(`${PANEL} [data-slot=filed-task]`)
        .nth(2)
        .waitFor({ timeout: 20_000 });
    },
    PANEL,
    { fractions: [0], read: () => page.evaluate(uncovering, PANEL), ms: 20_000 }
  );
  const step = await page.evaluate((sel) => {
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
    const cards = document.querySelectorAll(
      `${sel} [data-slot=filed-task]`
    ).length;
    return Math.min(stagger, cascade / (cards + 1));
  }, PANEL);
  const held = arrival.at[0]?.value;
  const timing = {
    by: arrival.by,
    step,
    head: held?.head ?? null,
    cards: held?.cards ?? [],
  };
  const steps = timing.cards.map((each) => each?.delay ?? -1);
  kit.check(
    `filed: the head and then each card start one step apart on one clock (--dur-pop; read by ${arrival.by})`,
    timing.head?.delay === 0 &&
      steps.length === FILED.length &&
      steps.every(
        (delay, at) => Math.abs(delay - (at + 1) * timing.step) < 0.5
      ) &&
      [timing.head, ...timing.cards].every(
        (each) => each?.duration === timing.cards[0]?.duration
      ),
    JSON.stringify(timing)
  );
  // Each card sought to its own run's start, middle and end: rising in.
  const mid = held?.cards;
  kit.check(
    "filed: each card is uncovered (opacity 0 at its start, part-way at its middle, whole by its end)",
    mid !== undefined &&
      mid.length === FILED.length &&
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
            "[data-arrive], [data-tasks-head]"
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
  await page.close();
  return ids;
};

/**
 * 4, every leg with the tasks on the board and his reply's cards in the
 * panel: on a desk the panel stands where it stood over the empty board,
 * covering no column, and the name's start edge is where it was.
 */
const filedLegs = async (
  kit: Kit,
  setup: Setup,
  threadId: string,
  ids: string[]
) => {
  for (const one of LEGS) {
    for (const theme of THEMES) {
      const tag = `filed ${one.name} ${theme}`;
      const page = await legPage(kit, one, theme);
      const reply = await withSocket(page);
      await openPanel(page, setup.url);
      await settle(page, 400);
      reply(threadId, ids);
      await page
        .locator(`${PANEL} [data-slot=filed-task]`)
        .nth(2)
        .waitFor({ timeout: 20_000 });
      await settle(page, 600);
      const at = await readPanel(page);
      if (one.view !== "phone") {
        clear(kit, tag, at);
        kit.check(
          `${tag}: the board stands beside or over the panel, its columns in sight`,
          at.columns.length > 0 &&
            at.columns.some((each) => each !== null && each.height > 0),
          JSON.stringify(at.columns)
        );
        const was = firstOpen.get(one.name);
        if (theme === "light") {
          kit.check(
            `${tag}: the panel stands where it stood over the empty board`,
            was !== undefined &&
              was.dock !== null &&
              at.shell !== null &&
              Math.abs(at.shell.left - was.dock.left) < 0.5 &&
              Math.abs(at.shell.top - was.dock.top) < 0.5 &&
              Math.abs(at.shell.width - was.dock.width) < 0.5,
            JSON.stringify({ empty: was?.dock, filed: at.shell })
          );
          kit.check(
            `${tag}: the name's start edge has not moved`,
            was !== undefined &&
              was.title !== null &&
              at.title !== null &&
              Math.abs(at.title.left - was.title.left) < 0.5,
            JSON.stringify({ empty: was?.title, filed: at.title })
          );
        }
      }
      const spill = await sweep(page);
      kit.check(
        `${tag}: nothing spills or covers text`,
        spill.length === 0,
        spill.join(" | ")
      );
      await page.close();
    }
  }
};

/** 5. A long name breaks only at its spaces, and never under the actions. */
const longName = async (kit: Kit, setup: Setup) => {
  for (const one of [
    { name: "1280", view: "desk", width: 1280 },
    { name: "390", view: "phone" },
  ] satisfies Leg[]) {
    const page = await legPage(kit, one, "light");
    await openPanel(page, setup.url);
    await page.evaluate(
      async ({ id, name }) => {
        await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      },
      { id: setup.project.id, name: LONG_NAME }
    );
    await page.waitForFunction(
      (name) =>
        document
          .querySelector('[data-slot="project-head"] [data-slot="name"]')
          ?.textContent?.trim() === name,
      LONG_NAME
    );
    await settle(page, 400);
    const read = await page.evaluate(() => {
      const name = document.querySelector(
        '[data-slot="project-head"] [data-slot="name"]'
      );
      const text = [...(name?.childNodes ?? [])].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      const words = text?.textContent ?? "";
      const range = document.createRange();
      // Each character's line, by its box's top.
      const tops = [...words].map((_, at) => {
        range.setStart(text as Node, at);
        range.setEnd(text as Node, at + 1);
        return Math.round(range.getBoundingClientRect().top);
      });
      const breaks = tops
        .map((top, at) => (at > 0 && top > (tops[at - 1] ?? top) ? at : -1))
        .filter((at) => at > 0)
        .map((at) => ({ before: words[at - 1], at: words.slice(at, at + 6) }));
      const box = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r
          ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
          : null;
      };
      return {
        breaks,
        name: box(name),
        acts: box(document.querySelector('[data-slot="acts"]')),
        tip: name?.getAttribute("title") ?? "",
      };
    });
    const apart =
      read.name !== null &&
      read.acts !== null &&
      (read.name.right <= read.acts.left + 0.5 ||
        read.name.bottom <= read.acts.top + 0.5 ||
        read.acts.bottom <= read.name.top + 0.5);
    kit.check(
      `${one.name}: the name breaks only at its spaces, never under the actions, its whole text in its tip`,
      read.breaks.every((each) => each.before === " ") &&
        apart &&
        read.tip.includes(LONG_NAME),
      JSON.stringify(read)
    );
    await page.close();
  }
};

/** A name of 120 characters and no space stays inside the head, ellipsed (320, 1440). */
const unbrokenName = async (kit: Kit, setup: Setup) => {
  const name = "Tidewater".padEnd(120, "harbourfront");
  for (const one of [
    { name: "1440", view: "desk" },
    { name: "320", view: "phone", width: 320 },
  ] satisfies Leg[]) {
    const page = await legPage(kit, one, "light");
    await openPanel(page, setup.url);
    await page.evaluate(
      async ({ id, to }) => {
        await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: to }),
        });
      },
      { id: setup.project.id, to: name }
    );
    await page.waitForFunction(
      (to) =>
        document
          .querySelector('[data-slot="project-head"] [data-slot="name"]')
          ?.textContent?.trim() === to,
      name
    );
    await settle(page, 400);
    const read = await page.evaluate(() => {
      const of = (el: Element | null) =>
        el
          ? {
              scroll: el.scrollWidth,
              client: el.clientWidth,
              right: el.getBoundingClientRect().right,
            }
          : null;
      const nameEl = document.querySelector(
        '[data-slot="project-head"] [data-slot="name"]'
      );
      return {
        head: of(document.querySelector('[data-slot="project-head"]')),
        title: of(
          document.querySelector(
            '[data-slot="project-head"] [data-slot="title"]'
          )
        ),
        name: of(nameEl),
        ellipsis: nameEl ? getComputedStyle(nameEl).textOverflow : "",
      };
    });
    kit.check(
      `${one.name}: a 120-character name with no space stays inside the head, ellipsed`,
      read.head !== null &&
        read.title !== null &&
        read.name !== null &&
        read.head.scroll <= read.head.client &&
        read.title.scroll <= read.title.client &&
        read.name.scroll > read.name.client &&
        read.name.right <= read.head.right + 0.5 &&
        read.ellipsis === "ellipsis",
      JSON.stringify(read)
    );
    await page.close();
  }
};

/**
 * The routines' empty view: its starter chips stand on its composer field's
 * start edge, at 1280 and on each side of the drawer line (900, 899), where
 * the Composer's own margins change.
 */
const routinesEdge = async (kit: Kit, setup: Setup, width: number) => {
  const page = await legPage(
    kit,
    { name: String(width), view: "desk", width },
    "light"
  );
  // Its starters, as the hub's frame brings a set Jev wrote: inside a
  // workspace's boundary Caw never answers, so nothing he did gives Jev a
  // routine to offer.
  const send = await hubFrames(page);
  await open(
    page,
    `${setup.url}?view=routines`,
    '[data-slot="ask-caw"] form[data-slot="cin"]'
  );
  send({
    kind: "starters.changed",
    place: "routines",
    projectId: setup.project.id,
    starters: [
      {
        glyph: "triage",
        text: "Every Monday, triage the week’s new bookings",
        reason: "Bookings come in every week.",
        sources: [],
      },
      {
        glyph: "routine",
        text: "Every Friday, write the launch changelog",
        reason: "The launch is on Friday.",
        sources: [],
      },
    ],
  });
  await page
    .locator('[data-slot="routine-starters"] button')
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await settle(page, 400);
  const read = await page.evaluate(() => ({
    chips: [
      ...document.querySelectorAll('[data-slot="routine-starters"] button'),
    ].map((chip) => chip.getBoundingClientRect().left),
    field:
      document
        .querySelector('[data-slot="ask-caw"] form[data-slot="cin"]')
        ?.getBoundingClientRect().left ?? null,
  }));
  kit.check(
    `${width} routines: the starter chips and the composer's field start on one edge`,
    read.field !== null &&
      read.chips.length > 0 &&
      Math.abs((read.chips[0] ?? -99) - read.field) <= 1,
    JSON.stringify(read)
  );
  await page.close();
};

/** 6. New project lands on the project's page with his panel open on its Setup thread. */
const newProject = async (kit: Kit, setup: Setup) => {
  const page = await kit.page("desk", { theme: "light" });
  await open(page, `${setup.base}/project/new`, COMPOSER);
  await settle(page, 300);
  const edge = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('[data-slot="chips"] button')].map(
      (chip) => chip.getBoundingClientRect().left
    ),
    field:
      document
        .querySelector('[data-slot="new-page-field"] form[data-slot="cin"]')
        ?.getBoundingClientRect().left ?? null,
  }));
  kit.check(
    "New project: its starter chips and the composer's field start on one edge",
    edge.field !== null &&
      edge.chips.length > 0 &&
      Math.abs((edge.chips[0] ?? -99) - edge.field) <= 1,
    JSON.stringify(edge)
  );
  const words = "A ferry timetable site for the island";
  const field = page.locator(COMPOSER).first();
  await field.click();
  await field.fill(words);
  await field.press("Enter");
  await page.waitForURL(PROJECT_PAGE, {
    timeout: 30_000,
  });
  await page.locator(PANEL).waitFor({ timeout: 30_000 });
  await settle(page, 400);
  const landed = await page.evaluate(
    (sel) => ({
      url: location.pathname,
      room:
        document
          .querySelector(sel)
          ?.querySelector('[data-slot="room"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim()
          .slice(0, 300) ?? "",
      hero: document.querySelector(`${sel} [data-thread-hero]`) !== null,
    }),
    PANEL
  );
  kit.check(
    "New project lands on the project's page with Caw's panel open on its Setup thread",
    landed.url.startsWith("/project/") &&
      !landed.hero &&
      landed.room.includes(words),
    JSON.stringify(landed)
  );
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
    const ids = await filedTasks(kit, setup, threadId);
    await filedLegs(kit, setup, threadId, ids);
    for (const width of [1280, 900, 899]) {
      await routinesEdge(kit, setup, width);
    }
    await longName(kit, setup);
    await unbrokenName(kit, setup);
    await newProject(kit, setup);
  } finally {
    setup.jev.stop();
  }
};

export default { name: "caw-guided", run } satisfies Spec;
