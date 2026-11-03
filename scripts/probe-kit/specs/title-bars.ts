/**
 * Every bar that heads a surface follows The Title Bars Follow Liquid Glass
 * Rule (DESIGN.md): one row, no ground, its controls floating glass groups
 * of bare symbols, the content under it blurring in from the first scroll.
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a project in a git folder, read by the house rules at 390,
 * 680, 1440 and 2529, light and dark, in each state the brief names:
 *
 * Caw's column: the hero (no conversation), a conversation (at rest at its
 * top, and scrolled under the bar), Caw off and on, the phone sheet with
 * its Close. Each read saves its picture under the spec's output folder.
 *
 *   bun scripts/probe-kit/run.ts title-bars
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { HOUR_MS } from "../../../packages/core/src/time";
import { commentWords } from "../../../packages/core/src/words/comments";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { HouseRules } from "../house-rules";
import { type Kit, open, type Spec, type View } from "../kit";
import { writePagePins } from "../pins";

/** A long answer: the conversation scrolls under the bar. */
const ANSWER = Array.from(
  { length: 24 },
  (_, i) =>
    `Step ${i + 1}: the glass groups float over the transcript, and the rows pass under them as you scroll.\n\n`
);

/** What a peeked session is asked: it answers slowly, so it is still working when peeked. */
const SLOW = "Take your time over the glass bars.";

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Glass bars"] };
  }
  return request.last.includes(SLOW)
    ? { everyMs: 1500, words: Array.from({ length: 6 }, () => ANSWER).flat() }
    : { everyMs: 2, words: ANSWER };
};

const WIDTHS: { view: View; label: string }[] = [
  { view: "phone", label: "390" },
  { view: "narrowDesk", label: "680" },
  { view: "desk", label: "1440" },
  { view: "desk2529", label: "2529" },
];
const THEMES = ["light", "dark"] as const;
/** Comments as More lists it, its open count after it. */
const COMMENTS_ITEM = /^Comments/u;

const shot = async (kit: Kit, page: Page, name: string) => {
  const dir = join(kit.out, "shots");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const src = join(fleet.sandbox, "glass");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo here > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Glass bars",
    machineId: MACHINE,
    cwd: src,
  });
  const at = `${base}/project/${project.id}`;
  const house = new HouseRules(kit, "title-bars", {
    except: [
      {
        rule: "coral",
        selector: '[data-slot="pin-row"] .mark-cell, [data-slot="head-pill"]',
        reason:
          "a comment's pill on its state's face, filled action-solid once sent and ringed in it until then (DESIGN.md, A pin's pill): what the comment is, not an act",
      },
      {
        rule: "coral",
        selector: '[data-slot="pin-row"] mark',
        reason:
          "Find's matching words marked in `selection` (DESIGN.md, The Comments rail)",
      },
    ],
  });
  const SEAT = '[data-slot="caw-seat"]';
  const PANEL = "[data-caw-panel]";

  /** Caw's panel opened from his seat, pressed again until the page has hydrated and hears it. */
  const openPanel = async (tab: Page, ready: string): Promise<void> => {
    await open(tab, at, SEAT, 90_000);
    for (let tries = 0; tries < 10; tries += 1) {
      await tab.waitForTimeout(1500);
      if ((await tab.locator(ready).filter({ visible: true }).count()) > 0) {
        return;
      }
      await tab.locator(SEAT).first().click();
    }
    await tab.waitForSelector(ready, { timeout: 5000 });
  };

  /** Each width and scheme: the project page, Caw's panel opened from his seat. */
  const each = async (
    state: string,
    then?: (page: Page) => Promise<void>
  ): Promise<void> => {
    for (const theme of THEMES) {
      for (const { view, label } of WIDTHS) {
        const page = await kit.page(view, { theme });
        await openPanel(page, PANEL).catch(async (error: unknown) => {
          await shot(kit, page, `no-panel-${state}-${label}-${theme}`);
          throw error;
        });
        await page.waitForTimeout(800);
        await then?.(page);
        const where = `${state} ${label} ${theme}`;
        await house.at(page, where);
        await shot(kit, page, where.replaceAll(" ", "-"));
        await page.context().close();
      }
    }
  };

  // The hero: no conversation yet, Caw off (a new project's switch).
  await each("caw hero off");

  // A conversation running, with Caw on: read at the tail (rows under the
  // bar) and at its top (at rest).
  fleet.write("UPDATE projects SET events_on = 1 WHERE id = ?", project.id);
  const talk = await fleet.spawn("claude", "Glass bars", src, {
    projectId: project.id,
  });
  await fleet.send(talk, "Walk me through the glass bars, step by step.");
  await each("caw conversation tail", async (page) => {
    await page
      .locator(`${PANEL} [data-slot="tr"]`)
      .first()
      .waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
  });
  await each("caw conversation top", async (page) => {
    const tr = page.locator(`${PANEL} [data-slot="tr"]`).first();
    await tr.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await tr.evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(800);
  });

  // Each control of the bar: hover, pressed and focus, at the desk.
  const desk = await kit.page("desk");
  await openPanel(desk, PANEL);
  await desk.waitForTimeout(1500);
  const items = desk.locator(`${PANEL} [data-slot="bar"] [data-bar-item]`);
  const n = await items.count();
  kit.check(
    "Caw's column: its bar holds Session details, New conversation and Open as tab as bare items",
    n === 3,
    `${n} item(s)`
  );
  for (let i = 0; i < n; i += 1) {
    const item = items.nth(i);
    const name = (await item.getAttribute("aria-label")) ?? `item ${i}`;
    await item.hover();
    await desk.waitForTimeout(300);
    await shot(kit, desk, `caw-hover-${i}`);
    const hovered = await item.evaluate(
      (node) => getComputedStyle(node).backgroundColor
    );
    kit.check(
      `Caw's column: ${name} takes a fill on hover`,
      hovered !== "rgba(0, 0, 0, 0)",
      hovered
    );
  }
  await desk.mouse.move(10, 10);
  await desk.keyboard.press("Escape");
  await items.first().focus();
  await desk.keyboard.press("Tab");
  await desk.waitForTimeout(300);
  await shot(kit, desk, "caw-focus");
  const ring = await desk.evaluate(
    () => getComputedStyle(document.activeElement as Element).outlineStyle ?? ""
  );
  kit.check(
    "Caw's column: a key's focus on a bar item draws its ring",
    ring !== "none",
    ring
  );

  // The phone sheet with its Close: the sheet's bar, then Close puts it away.
  const phone = await kit.page("phone");
  await openPanel(phone, "[data-caw-float-sheet]");
  await phone.waitForTimeout(1200);
  await shot(kit, phone, "caw-sheet");
  const close = phone.locator(
    '[data-caw-float-sheet] [data-slot="bar"] [aria-label="Close"]'
  );
  kit.check(
    "Caw's phone sheet: Close is a bare symbol in the sheet's bar",
    (await close.count()) === 1
  );
  await close.click();
  await phone.waitForTimeout(800);
  kit.check(
    "Caw's phone sheet: Close puts the sheet away",
    (await phone.locator("[data-caw-float-sheet]").count()) === 0
  );

  // The other surfaces cut over, each at the widths it stands at.
  /** One read of `url` at each width and scheme, once `ready` stands; `then` puts it in its state. */
  const surface = async (
    state: string,
    url: string,
    ready: string,
    widths: typeof WIDTHS,
    then?: (tab: Page) => Promise<void>,
    /** The surface the rules read: the one cut over, not the page round it. */
    scope?: string
  ): Promise<void> => {
    for (const theme of THEMES) {
      for (const { view, label } of widths) {
        const tab = await kit.page(view, { theme });
        const where = `${state} ${label} ${theme}`;
        try {
          await open(tab, url, ready, 90_000);
          // A working session's mark echoes three loops (7.2s), then stills.
          await tab.waitForTimeout(7500);
          await then?.(tab);
          await tab.waitForTimeout(800);
          await house.at(tab, where, scope ? { scope } : {});
        } catch (error) {
          kit.check(`${where}: the surface stands`, false, String(error));
        }
        await shot(kit, tab, where.replaceAll(" ", "-"));
        await tab.context().close();
      }
    }
  };
  const WIDE = WIDTHS.filter(
    ({ view }) => view === "desk" || view === "desk2529"
  );

  // The peek, from the rail's Working row (wide layouts only), of a
  // session still at work, beside a conversation (SessionSurface holds it).
  const busy = await fleet.spawn("claude", "Peek me", src, {
    projectId: project.id,
  });
  await fleet.send(busy, SLOW);
  await surface(
    "peek",
    `${base}/session/${talk}`,
    "[data-session-row-peek]",
    WIDE,
    async (tab) => {
      // Peek rises at the row's end under a resting pointer.
      const peek = tab.locator("[data-session-row-peek]").first();
      const box = await peek.boundingBox();
      if (box) {
        await tab.mouse.move(box.x - 120, box.y + box.height / 2);
        await tab.waitForTimeout(400);
      }
      await peek.click();
      await tab.waitForSelector('[data-peek-sheet] [data-slot="peek"]', {
        timeout: 30_000,
      });
      // The session mark's working echo plays its three loops, then stills.
      await tab.waitForTimeout(7500);
    },
    "[data-peek-sheet]"
  );

  // Configure's Back on a phone: the chevron alone in its glass group.
  await surface(
    "configure back",
    `${base}/config/models`,
    '[data-slot="crumb"] [data-bar-item]',
    WIDTHS.filter(({ view }) => view === "phone"),
    undefined,
    '[data-slot="top"]'
  );

  // The Comments rail beside a page artifact whose name is a slug, opened
  // from the panel's head.
  await fleet.api(`/api/instances/${talk}/artifacts`, {
    kind: "page",
    does: "judge",
    ask: "Judge the glass bars page",
    name: "glass-page",
    html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Glass bars</title></head><body><h1 id="head">Glass bars</h1><p id="one">Every bar floats its controls in glass.</p></body></html>',
  });
  const RAIL = '[data-slot="comment-rail"]';
  const SESSION = `${base}/session/${talk}`;
  /** The rail opened from the panel's head. */
  const railOpen = async (tab: Page): Promise<void> => {
    // Comments on the head, or in More where the head has no room for it:
    // the head refits as the count arrives, so each press is tried again.
    for (let tries = 0; tries < 5; tries += 1) {
      if ((await tab.locator(RAIL).count()) > 0) {
        break;
      }
      const toggle = tab
        .locator('[data-slot="side-head"] [data-slot="comments"]')
        .filter({ visible: true });
      const pressed =
        (await toggle.count()) > 0
          ? await toggle
              .first()
              .click({ timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          : await tab
              .locator('[data-slot="side-head"] [data-slot="more"]')
              .click({ timeout: 3000 })
              .then(() =>
                tab
                  .getByRole("menuitem", { name: COMMENTS_ITEM })
                  .click({ timeout: 3000 })
              )
              .then(() => true)
              .catch(() => false);
      if (!pressed) {
        await tab.keyboard.press("Escape");
      }
      await tab.waitForTimeout(800);
    }
    await tab.waitForSelector(RAIL, { timeout: 30_000 });
  };
  await surface(
    "comments rail empty",
    SESSION,
    '[data-slot="side-head"]',
    WIDTHS,
    async (tab) => {
      await railOpen(tab);
      const empty = await tab
        .locator(`${RAIL} [data-slot="pin-list-empty"]`)
        .innerText({ timeout: 20_000 })
        .catch(() => "");
      kit.check(
        `comments rail empty ${tab.viewportSize()?.width}: the empty line is "${commentWords.noneOpen}" alone`,
        empty.trim() === commentWords.noneOpen,
        JSON.stringify(empty)
      );
    },
    RAIL
  );

  /** Three comments on the page, the third resolved, written into its doc as the overlay writes them. */
  const pinsOn = async (tab: Page): Promise<Frame> => {
    const frame = await until(
      "the page in the pane",
      async () =>
        (await (
          await tab.locator('iframe[title="Preview"]').elementHandle()
        )?.contentFrame()) ?? null,
      Boolean,
      60_000
    );
    await (frame as Frame).waitForFunction(
      () =>
        !!(window as { cawcoArtifact?: { doc?: unknown } }).cawcoArtifact?.doc,
      undefined,
      { timeout: 30_000 }
    );
    const when = new Date(Date.now() - HOUR_MS).toISOString();
    const made = [
      { number: 1, text: "The glass group floats over the rows here." },
      { number: 2, text: "Search should open in the bar, not a row." },
      { number: 3, text: "The old band is gone.", resolved: true },
    ].map((one) => {
      const id = `00000000-0000-4000-8000-${String(one.number).padStart(12, "0")}`;
      return {
        id,
        number: one.number,
        kind: "comment" as const,
        anchor: {
          selector: one.number === 1 ? "#one" : "#head",
          source: null,
          text: one.number === 1 ? "Every bar floats" : "Glass bars",
        },
        at: when,
        by: "person" as const,
        elements: [],
        // His words alone: an agent's reply is comment_reply's, never the page's.
        thread: [
          { id: `${id}-1`, by: "person" as const, text: one.text, at: when },
          {
            id: `${id}-2`,
            by: "person" as const,
            text: "And keep the rows starting at the top.",
            at: when,
          },
        ],
        ...(one.resolved ? { resolvedAt: when } : {}),
      };
    });
    await writePagePins(frame as Frame, ...(made as never[]));
    return frame as Frame;
  };
  /** The rail open on its rows. */
  const railRows = async (tab: Page): Promise<void> => {
    await pinsOn(tab);
    await railOpen(tab);
    await tab
      .locator(`${RAIL} [data-slot="pin-row"]`)
      .first()
      .waitFor({ timeout: 30_000 });
  };
  const railStates: [string, (tab: Page) => Promise<void>][] = [
    ["comments rail rows", railRows],
    [
      "comments rail resolved",
      async (tab) => {
        await railRows(tab);
        await tab
          .locator(RAIL)
          .getByRole("tab", { name: commentWords.resolved })
          .click();
        await tab.waitForTimeout(600);
      },
    ],
    [
      "comments rail search matches",
      async (tab) => {
        await railRows(tab);
        await tab.locator(`${RAIL} [data-slot="search-open"]`).click();
        const field = tab.locator(`${RAIL} input[data-slot="search"]`);
        await field.waitFor({ timeout: 5000 });
        await field.fill("glass");
        await tab.waitForTimeout(800);
        const marks = await tab.locator(`${RAIL} [data-pin-row] mark`).count();
        kit.check(
          `comments rail search ${tab.viewportSize()?.width}: Search opens its field in the bar, and Find marks the matching words`,
          (await field.evaluate((el) => !!el.closest('[data-slot="bar"]'))) &&
            marks > 0,
          `${marks} mark(s)`
        );
      },
    ],
    [
      "comments rail search none",
      async (tab) => {
        await railRows(tab);
        await tab.keyboard.press("Escape");
        await tab.locator(`${RAIL} [data-slot="search-open"]`).click();
        const field = tab.locator(`${RAIL} input[data-slot="search"]`);
        await field.fill("zebra");
        await tab.waitForTimeout(800);
        const none = await tab
          .locator(`${RAIL} [data-slot="pin-list-empty"]`)
          .innerText()
          .catch(() => "");
        await field.press("Escape");
        await tab.waitForTimeout(300);
        const folded =
          (await tab.locator(`${RAIL} input[data-slot="search"]`).count()) ===
          0;
        await tab.locator(`${RAIL} [data-slot="search-open"]`).click();
        await tab.locator(`${RAIL} input[data-slot="search"]`).fill("zebra");
        await tab.waitForTimeout(800);
        kit.check(
          `comments rail search none ${tab.viewportSize()?.width}: "${commentWords.noMatch("zebra")}", and Esc folds the field back into Search`,
          none.trim() === commentWords.noMatch("zebra") && folded,
          JSON.stringify({ none, folded })
        );
      },
    ],
  ];
  for (const [state, then] of railStates) {
    await surface(
      state,
      SESSION,
      '[data-slot="side-head"]',
      WIDTHS,
      then,
      RAIL
    );
  }

  // A comment's thread: open, resolved, with Delete asking, and its peek
  // (a mouse resting on its pill; no peek under a finger).
  const CARD = ':is([data-slot="pin-card"], [data-slot="thread-sheet"])';
  const threadOf = async (tab: Page, resolved: boolean): Promise<void> => {
    await railRows(tab);
    if (resolved) {
      await tab
        .locator(RAIL)
        .getByRole("tab", { name: commentWords.resolved })
        .click();
      await tab.waitForTimeout(400);
    }
    await tab
      .locator(
        `${RAIL} [data-slot="pin-row"][data-pin-row="${resolved ? 3 : 1}"]`
      )
      .click();
    await tab.locator(CARD).first().waitFor({ timeout: 10_000 });
    await tab.waitForTimeout(800);
    const groups = await tab
      .locator(`${CARD} [data-slot="bar"] [data-slot="tools"]`)
      .count();
    const bands = await tab.locator(`${CARD} header`).count();
    kit.check(
      `comments thread ${tab.viewportSize()?.width}: its actions float as two glass groups (Close in its own) with no head band`,
      groups === 2 && bands === 0,
      JSON.stringify({ groups, bands })
    );
  };
  const threadStates: [string, typeof WIDTHS, (tab: Page) => Promise<void>][] =
    [
      ["comments thread open", WIDTHS, (tab) => threadOf(tab, false)],
      ["comments thread resolved", WIDTHS, (tab) => threadOf(tab, true)],
      [
        "comments thread delete asking",
        WIDTHS,
        async (tab) => {
          await threadOf(tab, false);
          await tab.locator(`${CARD} [data-slot="delete"]`).click();
          await tab
            .locator(`${CARD} [data-ask="delete"]`)
            .waitFor({ timeout: 5000 });
        },
      ],
      [
        "comments thread peek",
        WIDTHS.filter(({ view }) => view !== "phone"),
        async (tab) => {
          const frame = await pinsOn(tab);
          const face = frame
            .locator('svg[data-cawco-pins] g[data-pin="1"] [data-face]')
            .first();
          await face.waitFor({ timeout: 20_000 });
          const box = await face.boundingBox();
          if (box) {
            await tab.mouse.move(
              box.x + box.width / 2,
              box.y + box.height / 2,
              {
                steps: 3,
              }
            );
          }
          await tab
            .locator('[data-slot="pin-peek"]')
            .waitFor({ timeout: 5000 });
          kit.check(
            `comments thread peek ${tab.viewportSize()?.width}: the peek floats no actions`,
            (await tab
              .locator('[data-slot="pin-peek"] [data-slot="tools"]')
              .count()) === 0
          );
        },
      ],
    ];
  for (const [state, widths, then] of threadStates) {
    await surface(
      state,
      SESSION,
      '[data-slot="side-head"]',
      widths,
      then,
      state.endsWith("peek") ? '[data-slot="pin-peek"]' : CARD
    );
  }

  // The artifact panel with the rail open, and expanded, read whole.
  await surface(
    "artifact panel rail open",
    SESSION,
    '[data-slot="side-head"]',
    WIDTHS,
    async (tab) => {
      await railRows(tab);
      const closes = await tab
        .locator(`${RAIL} [aria-label="${commentWords.closeComments}"]`)
        .count();
      const sheet = (await tab.locator('[data-slot="rail-sheet"]').count()) > 0;
      kit.check(
        `artifact panel rail open ${tab.viewportSize()?.width}: the rail has its own Close only as the foot sheet`,
        closes === (sheet ? 1 : 0),
        JSON.stringify({ closes, sheet })
      );
    },
    '[data-slot="side-card"]'
  );
  await surface(
    "artifact panel expanded",
    SESSION,
    '[data-slot="side-head"]',
    WIDTHS,
    async (tab) => {
      const expand = tab.locator(
        '[data-slot="side-head"] [aria-label="Expand"]'
      );
      if (await expand.isVisible().catch(() => false)) {
        await expand.click();
        await tab.waitForTimeout(900);
      }
    },
    '[data-slot="side-card"]'
  );

  // The split's edge: nothing at rest, its grip under the pointer.
  const deskEdge = await kit.page("desk");
  await open(deskEdge, SESSION, '[data-slot="side-head"]', 90_000);
  await deskEdge.waitForTimeout(2000);
  const edge = deskEdge.locator("[data-side-divider]").first();
  const inkOf = () =>
    edge.evaluate((node) => getComputedStyle(node).backgroundColor);
  const atRest = await inkOf();
  const edgeBox = await edge.boundingBox();
  if (edgeBox) {
    await deskEdge.mouse.move(
      edgeBox.x + edgeBox.width / 2,
      edgeBox.y + edgeBox.height / 2
    );
  }
  await deskEdge.waitForTimeout(400);
  const hovered = await inkOf();
  await shot(kit, deskEdge, "split-edge-hover");
  kit.check(
    "the split's edge draws no line at rest and its grip under the pointer",
    atRest === "rgba(0, 0, 0, 0)" && hovered !== atRest,
    JSON.stringify({ atRest, hovered })
  );
  await deskEdge.context().close();

  // The artifact panel's head (the mode centred, the trailing glass, Close
  // in its own) beside the conversation, read whole: the top bar's shelf and
  // its session tabs with it.
  await surface(
    "artifact head",
    `${base}/session/${talk}`,
    '[data-slot="side-head"]',
    WIDTHS
  );

  // Pages with no head of their own under the bar.
  await surface(
    "configure models",
    `${base}/config/models`,
    '[data-slot="lead"]',
    WIDTHS
  );
  await surface("usage", `${base}/usage`, '[data-slot="col"]', WIDTHS);
  await surface(
    "who decides",
    `${base}/project/${project.id}/decides`,
    '[data-slot="page-head"]',
    WIDTHS
  );

  house.report();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "title-bars",
  run,
};
export default spec;
