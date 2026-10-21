/**
 * The page's stacking roles (DESIGN.md, Elevation & Depth: Stacking): at
 * each place two layers overlap, `document.elementsFromPoint` puts the one
 * whose role stands higher in the `layer` tokens first.
 *
 *   bun scripts/probe-kit/run.ts web layer-stack
 *
 * - The head-tint bench (desk): the bench (`--layer-bench`) over the shell's
 *   top bar; a tab's details card, opened from the strip, on the floating
 *   layer (`--layer-float`) over the bench and the bar under it.
 * - A session named in a transcript's words (head-tint, desk, the hub's
 *   board answering with one real session row): `[label](cawco:session/<id>)`
 *   draws as that session's chip with the row's title, never "[blocked]"; an
 *   id the board does not hold, and a kind the dashboard does not know, read
 *   as their labels; pressing the chip opens the house hover panel with
 *   "Open session" to the session, on the floating layer over the bench;
 *   Escape puts it away.
 * - A kit popover over a sticky table head (the overlays bench, desk): a
 *   sticky head on `--layer-sticky` set under the popover's place, and the
 *   popover first at that point.
 * - The skip link on focus (desk): first at its own centre, over the shell.
 * - The rail sheet under 900px (the lift bench, narrowDesk 680): the sheet over its scrim
 *   over the top bar, and the scrim over the bar beside the sheet.
 *
 * Each read is the chain at the point: every element `elementsFromPoint`
 * returns, from the top, named by the nearest `data-slot` (or its tag), with
 * the computed `z-index` of the stacked box it belongs to.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { InstancesFrame } from "../../../../packages/core/src/frames";
import type { Envelope } from "../../../../packages/core/src/index";
import { WIRE_PROTOCOL } from "../../../../packages/core/src/stream";
import { type Kit, open, type Spec, settle } from "../../kit";

/**
 * With `PROBE_UI_OBSERVER=<observer.browser.js>` (the ui-observer skill's
 * scanner), each open surface's rendered layout is measured in place and its
 * observations noted by kind: what the layer change could have moved.
 */
async function observe(kit: Kit, page: Page, what: string, scope: string) {
  const file = process.env.PROBE_UI_OBSERVER;
  if (!file) {
    return;
  }
  const source = readFileSync(file, "utf8");
  const read = await page.evaluate(
    ([src, sel]) => {
      // The scanner's own entry point, as its README runs it.
      const run = new Function(
        `${src}; return globalThis.__uiObserver({ scopeSel: ${JSON.stringify(sel)}, maxDepth: 10 });`
      ) as () => { observations?: { kind?: string; type?: string }[] };
      const found = run().observations ?? [];
      const kinds: Record<string, number> = {};
      for (const o of found) {
        const k = o.kind ?? o.type ?? "other";
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      return { total: found.length, kinds };
    },
    [source, scope] as const
  );
  kit.note(
    `ui-observer, ${what} (${scope}): ${read.total} observations ${JSON.stringify(read.kinds)}`
  );
}

interface Hit {
  name: string;
  z: string;
}

/**
 * The chain at a point, top first: each hit named, with its stack's `z-index`.
 * `elementsFromPoint` passes over a box with `pointer-events: none`, and an
 * open modal (bits-ui body-scroll-lock.svelte.js) writes that on <body>, so
 * the page under a sheet would not be listed: body's inline value is lifted
 * for the read and put back at once.
 */
const chainAt = (page: Page, x: number, y: number): Promise<Hit[]> =>
  page.evaluate(
    ([px, py]) => {
      const locked = document.body.style.getPropertyValue("pointer-events");
      document.body.style.removeProperty("pointer-events");
      /** The nearest box that sets a numeric z-index: the layer it stands on. */
      const stackOf = (el: Element): string => {
        for (let at: Element | null = el; at; at = at.parentElement) {
          const z = getComputedStyle(at).zIndex;
          if (z !== "auto") {
            return z;
          }
        }
        return "auto";
      };
      const nameOf = (el: Element): string => {
        const slotted = el.closest("[data-slot]");
        const slot = slotted?.getAttribute("data-slot");
        return slot ? `${slot}` : el.tagName.toLowerCase();
      };
      const seen: Hit[] = [];
      for (const el of document.elementsFromPoint(px, py)) {
        const hit = { name: nameOf(el), z: stackOf(el) };
        const last = seen.at(-1);
        if (!(last && last.name === hit.name && last.z === hit.z)) {
          seen.push(hit);
        }
      }
      if (locked) {
        document.body.style.setProperty("pointer-events", locked);
      }
      return seen;
    },
    [x, y]
  );

const said = (chain: Hit[]): string =>
  chain.map((h) => `${h.name}@${h.z}`).join(" > ");

/** The index of the first hit whose name is one of `names`, or -1. */
const firstOf = (chain: Hit[], ...names: string[]): number =>
  chain.findIndex((h) => names.includes(h.name));

const tokenOf = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );

const centre = async (
  page: Page,
  selector: string
): Promise<{ x: number; y: number }> => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`${selector}: no box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function headTint(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/head-tint`, "[data-head-tint]", 120_000);
  await settle(page, 300);
  const bench = await tokenOf(page, "--layer-bench");
  const float = await tokenOf(page, "--layer-float");
  const bar = await centre(page, 'header[data-slot="top"]');
  const overBar = await chainAt(page, bar.x, bar.y);
  kit.note(`head-tint, the bar's centre: ${said(overBar)}`);
  kit.check(
    `head-tint: the bench (--layer-bench ${bench}) stands over the shell's top bar`,
    overBar[0]?.z === bench && firstOf(overBar, "top", "slot", "burger") > 0
  );
  // A mouse resting on a tab opens its details card (PaneTabs hoverTab).
  const tab = page.locator('[data-head-tint] [data-slot="tab"]').first();
  await tab.hover();
  const card = "[data-session-details-popover]";
  await page.waitForSelector(`${card}[data-state="open"]`, { timeout: 15_000 });
  await settle(page, 400);
  const at = await centre(page, card);
  const overCard = await chainAt(page, at.x, at.y);
  kit.note(`head-tint, the details card's centre: ${said(overCard)}`);
  const benchAt = overCard.findIndex((h) => h.z === bench);
  kit.check(
    `head-tint: the details card (--layer-float ${float}) stands over the bench (${bench}) and the bar under it`,
    overCard[0]?.z === float && benchAt > 0
  );
  await observe(
    kit,
    page,
    "the details card open",
    "[data-session-details-popover]"
  );
  await page.close();
}

/** The head-tint bench's first session (its `ids[0]`), and the title its board row gives it. */
const NAMED = "1a2b3c4d-0000-4000-8000-000000000001";
const NAMED_TITLE = "Cap the tray chip at its pane";
/** The session whose transcript the bench shows first (`?at=1`). */
const SHOWN = "1a2b3c4d-0000-4000-8000-000000000002";
/** An id no row holds. */
const GONE = "00000000-dead-4000-8000-000000000000";
const SAID_ID = "reference-chip-said";
/** The markdown the answer is drawn in: an agent's row carries no message id of its own. */
const MESSAGE = `[data-pane="${SHOWN}"] [data-slot="md"]:has([data-session-chip])`;
/** The answer's box (the markdown root is `display: contents`). */
const MESSAGE_BOX = `[data-pane="${SHOWN}"] [data-slot="msg"]:has([data-session-chip])`;
const SAID = `Handed the cap to [the tray chip work](cawco:session/${NAMED}). The earlier run, [an earlier try](cawco:session/${GONE}), is gone, and [a pin](cawco:pin/p1) is a kind of its own.`;

/**
 * The hub's board, as its first frame on the socket says it: one session
 * row, NAMED, beside the bench's own state (its pulses and transcripts).
 */
const BOARD: Envelope<InstancesFrame> = {
  verb: "frames",
  machineId: "hub",
  payload: {
    kind: "instances",
    agents: [],
    continuations: [],
    formerIds: {},
    handoffs: {},
    hubBuild: { startedAt: 0, version: "0.0.0" },
    instances: [
      {
        cwd: "/bench",
        harness: "claude",
        id: NAMED,
        kind: "mainline",
        launchDir: "known",
        machineId: "bench",
        sessionId: null,
        status: "running",
        title: NAMED_TITLE,
      },
    ],
    moves: [],
    noticesSeen: [],
    protocol: WIRE_PROTOCOL,
    pulses: {},
  },
};

async function sessionChip(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (hubSide) => {
      hubSide.send(JSON.stringify(BOARD));
    }
  );
  await open(page, `${base}/motion/head-tint`, "[data-head-tint]", 120_000);
  await page.waitForFunction(() => "__ht" in window);
  // The agent's answer lands in the shown session's transcript, as a frame
  // would put it there.
  await page.evaluate(
    ([shown, id, words]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              sessions: Record<string, { messages: Record<string, unknown>[] }>;
            };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[shown];
      session.messages = [
        ...session.messages,
        {
          id,
          instanceId: shown,
          type: "assistant",
          content: words,
          timestamp: new Date().toISOString(),
        },
      ];
    },
    [SHOWN, SAID_ID, SAID] as const
  );
  const message = MESSAGE;
  const chip = `${message} [data-session-chip="${NAMED}"]`;
  await page.waitForSelector(chip, { timeout: 15_000 });
  await settle(page, 300);
  const read = await page.evaluate(
    ([m, c]) => {
      const row = document.querySelector(m);
      const button = document.querySelector<HTMLElement>(c);
      const anchors = [...(row?.querySelectorAll("a") ?? [])].map(
        (a) => a.textContent?.trim() ?? ""
      );
      // The chip's line, from the text before it to the line after.
      // Lines counted by the paragraph's own words, outside the chip.
      const para = button?.closest("p");
      const tops = new Set<number>();
      const walk = para
        ? document.createTreeWalker(para, NodeFilter.SHOW_TEXT)
        : null;
      for (let node = walk?.nextNode(); node; node = walk?.nextNode()) {
        if (!(node.textContent?.trim() && !button?.contains(node))) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          tops.add(Math.round(rect.top));
        }
      }
      const lines = [...tops];
      const lineHeight = para
        ? Number.parseFloat(getComputedStyle(para).lineHeight)
        : 0;
      return {
        paraHeight: para?.getBoundingClientRect().height ?? 0,
        lineHeight,
        lineCount: lines.length,
        title:
          button?.querySelector('[data-slot="title"]')?.textContent?.trim() ??
          null,
        tag: button?.tagName.toLowerCase() ?? null,
        height: button?.getBoundingClientRect().height ?? 0,
        words: row?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        anchors,
        blockedEls: document.querySelectorAll("[data-streamdown-link-blocked]")
          .length,
        blockedText: document.body.innerText.includes("[blocked]"),
      };
    },
    [message, chip] as const
  );
  kit.note(`session chip, the message reads: ${read.words}`);
  // For the review item: the answer as drawn, and below with the panel open.
  mkdirSync(kit.out, { recursive: true });
  await page
    .locator(MESSAGE_BOX)
    .screenshot({ path: join(kit.out, "session-chip-message.png") });
  kit.check(
    `session-chip: cawco:session/<id> of a board row draws as its chip, titled as the row is ("${NAMED_TITLE}")`,
    read.tag === "button" && read.title === NAMED_TITLE && read.height > 0,
    JSON.stringify({ tag: read.tag, title: read.title, height: read.height })
  );
  kit.check(
    "session-chip: the chip's line keeps the text's own height (the paragraph is its lines × its line-height)",
    read.lineHeight > 0 &&
      Math.abs(read.paraHeight - read.lineCount * read.lineHeight) < 0.5,
    JSON.stringify({
      height: read.paraHeight,
      lines: read.lineCount,
      lineHeight: read.lineHeight,
    })
  );
  kit.check(
    "session-chip: the words after the chip follow it with no space of the chip's own",
    read.words.includes(`${NAMED_TITLE}. The earlier run`),
    read.words
  );
  kit.check(
    "session-chip: an id no row holds, and a kind the dashboard does not know, read as their labels, drawn as no link",
    read.words.includes("The earlier run, an earlier try, is gone") &&
      read.words.includes("and a pin is a kind") &&
      read.anchors.length === 0,
    JSON.stringify({ anchors: read.anchors })
  );
  kit.check(
    'session-chip: "[blocked]" is drawn nowhere on the page',
    !read.blockedText && read.blockedEls === 0,
    JSON.stringify({ text: read.blockedText, elements: read.blockedEls })
  );

  await page.locator(chip).click();
  const panelId = await page.locator(chip).getAttribute("aria-controls");
  const panel = `[id="${panelId}"]`;
  await page.waitForSelector(panel, { timeout: 5000 });
  await settle(page, 400);
  const opened = await page.evaluate(
    ([p, c]) => {
      const el = document.querySelector(p);
      const action = el?.querySelector<HTMLAnchorElement>(
        '[data-slot="acts"] a'
      );
      return {
        expanded: document.querySelector(c)?.getAttribute("aria-expanded"),
        role: el?.getAttribute("role") ?? null,
        title:
          el
            ?.querySelector('[data-slot="head"] [data-slot="title"]')
            ?.textContent?.trim() ?? null,
        action: action?.textContent?.trim() ?? null,
        href: action?.getAttribute("href") ?? null,
      };
    },
    [panel, chip] as const
  );
  kit.check(
    "session-chip: pressed, it opens the house hover panel: the session's card and Open session to it",
    opened.expanded === "true" &&
      opened.role === "dialog" &&
      opened.title === NAMED_TITLE &&
      opened.action === "Open session" &&
      opened.href === `/session/${NAMED}`,
    JSON.stringify(opened)
  );
  const bench = await tokenOf(page, "--layer-bench");
  const float = await tokenOf(page, "--layer-float");
  const at = await centre(page, panel);
  const over = await chainAt(page, at.x, at.y);
  kit.note(`session chip, the panel's centre: ${said(over)}`);
  const shot = await page.locator(MESSAGE_BOX).boundingBox();
  const panelBox = await page.locator(panel).boundingBox();
  if (shot && panelBox) {
    const x = Math.min(shot.x, panelBox.x) - 16;
    const y = Math.min(shot.y, panelBox.y) - 16;
    await page.screenshot({
      path: join(kit.out, "session-chip-open.png"),
      clip: {
        x,
        y,
        width:
          Math.max(shot.x + shot.width, panelBox.x + panelBox.width) - x + 16,
        height:
          Math.max(shot.y + shot.height, panelBox.y + panelBox.height) - y + 16,
      },
    });
  }
  kit.check(
    `session-chip: the panel (--layer-float ${float}) stands over the bench (${bench})`,
    over[0]?.z === float && over.findIndex((h) => h.z === bench) > 0
  );
  await page.keyboard.press("Escape");
  await settle(page, 400);
  const shut = await page.evaluate(
    ([p, c]) => ({
      panel: document.querySelector(p) !== null,
      expanded: document.querySelector(c)?.getAttribute("aria-expanded"),
      focused: document.activeElement === document.querySelector(c),
    }),
    [panel, chip] as const
  );
  kit.check(
    "session-chip: Escape puts the panel away and focus goes back to the chip",
    !shut.panel && shut.expanded === "false" && shut.focused,
    JSON.stringify(shut)
  );
  await page.close();
}

async function popoverOverSticky(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/overlays?only=popover`, "[data-open]");
  await page.locator('[data-open="popover"]').click();
  const pop = '[data-slot="popover-content"][data-state="open"]';
  await page.waitForSelector(pop);
  await settle(page, 400);
  const box = await page.locator(pop).boundingBox();
  if (!box) {
    kit.check("popover-over-sticky: the popover opens", false);
    await page.close();
    return;
  }
  // A sticky head as the tool matrix draws one (`sticky z-(--layer-sticky)`),
  // set across the popover's place in the page's flow.
  await page.evaluate(
    ({ top, height }) => {
      const scroller = document.createElement("div");
      scroller.dataset.slot = "probe-scroller";
      scroller.className = "overflow-auto";
      scroller.style.cssText = `position:absolute;inset-inline:0;top:${top}px;height:${height}px`;
      const head = document.createElement("div");
      head.dataset.slot = "probe-sticky-head";
      head.className = "sticky z-(--layer-sticky) h-auto bg-surface-raised";
      head.style.cssText = `top:0;height:${height}px`;
      scroller.append(head);
      document.querySelector("main")?.append(scroller);
    },
    { top: box.y, height: box.height }
  );
  const sticky = await tokenOf(page, "--layer-sticky");
  const float = await tokenOf(page, "--layer-float");
  const z = await page
    .locator('[data-slot="probe-sticky-head"]')
    .evaluate((el) => getComputedStyle(el).zIndex);
  const chain = await chainAt(
    page,
    box.x + box.width / 2,
    box.y + box.height / 2
  );
  kit.note(`popover over a sticky head, the popover's centre: ${said(chain)}`);
  const head = firstOf(chain, "probe-sticky-head");
  kit.check(
    `popover-over-sticky: the sticky head computes --layer-sticky (${sticky}) and the popover (--layer-float ${float}) stands over it`,
    z === sticky && chain[0]?.z === float && head > 0
  );
  await page.close();
}

async function skipLink(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/overlays`, "[data-open]");
  await page.keyboard.press("Tab");
  const skip = '[data-slot="skip"]';
  const focused = await page.evaluate(
    (s) => document.activeElement === document.querySelector(s),
    skip
  );
  const at = await centre(page, skip);
  const chain = await chainAt(page, at.x, at.y);
  const want = await tokenOf(page, "--layer-skip");
  kit.note(`the skip link on focus, its centre: ${said(chain)}`);
  kit.check(
    `skip: focused, the skip link (--layer-skip ${want}) is first at its centre`,
    focused && chain[0]?.name === "skip" && chain[0]?.z === want
  );
  await page.close();
}

async function railSheet(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("narrowDesk");
  // The lift bench: a page in the shell with nothing laid over the bar (the
  // overlays bench's full-screen "page" button covers the burger).
  await open(page, `${base}/motion/lift`, '[data-slot="burger"]');
  await page.locator('[data-slot="burger"]').click();
  const sheet = '[data-rail-sheet][data-state="open"]';
  await page.waitForSelector(sheet);
  await settle(page, 400);
  const float = await tokenOf(page, "--layer-float");
  const box = await page.locator(sheet).boundingBox();
  const bar = await page.locator('header[data-slot="top"]').boundingBox();
  if (!(box && bar)) {
    kit.check("rail-sheet: the sheet and the bar have boxes", false);
    await page.close();
    return;
  }
  const y = bar.y + bar.height / 2;
  const onSheet = await chainAt(page, box.x + box.width / 2, y);
  const beside = await chainAt(page, box.x + box.width + 40, y);
  kit.note(`rail sheet at 680, over the bar: ${said(onSheet)}`);
  kit.note(`rail sheet at 680, beside it over the bar: ${said(beside)}`);
  // The sheet's own rows are named by their own slots: every hit above
  // `sheet-content` is inside it, on its layer.
  const content = firstOf(onSheet, "sheet-content");
  const scrimUnder = firstOf(onSheet, "sheet-overlay");
  const barUnder = firstOf(onSheet, "top", "burger", "slot");
  kit.check(
    `rail-sheet: the sheet (--layer-float ${float}) stands over its scrim and the top bar`,
    content >= 0 &&
      onSheet.slice(0, content + 1).every((h) => h.z === float) &&
      scrimUnder > content &&
      barUnder > scrimUnder
  );
  const scrim = firstOf(beside, "sheet-overlay");
  const barBeside = firstOf(beside, "top", "burger", "slot");
  kit.check(
    "rail-sheet: beside the sheet, its scrim stands over the top bar",
    scrim === 0 && barBeside > scrim
  );
  await observe(kit, page, "the rail sheet open at 680", "[data-rail-sheet]");
  await page.close();
}

const spec: Spec = {
  name: "layer-stack",
  async run(kit) {
    const base = await kit.bench();
    for (const scene of [
      headTint,
      sessionChip,
      popoverOverSticky,
      skipLink,
      railSheet,
    ]) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one scene at a time
        await scene(kit, base);
      } catch (error) {
        kit.check(`${scene.name}: runs`, false, String(error));
      }
    }
  },
};
export default spec;
