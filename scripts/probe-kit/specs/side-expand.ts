/**
 * The side surface expands over the whole session area, in place (owner:
 * "i need to be able to open the preview all the way in the page, so i
 * don't have to switch pages esp to analyze desktop-size stuff"). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which calls the hub's MCP tools as each PROBE-CALL message says)
 * and the built dashboard, read from the engine, never pixels:
 *
 * 1. The head's Expand stands before Close. Pressed at 1440, the split
 *    slides on one clock (every run's start, length and easing equal),
 *    scrubbed through the DevTools Animation domain at 0, 50 and 100%: the
 *    side pane's width is the kept width at 0, between at 50, the split's at
 *    100.
 * 2. Expanded at 1440: the page's frame is the session area's width (±1px),
 *    the conversation's pane is 0 wide, the handle stands on the far edge
 *    (to drag the conversation back out), the composer is put away, and the
 *    control reads Back to conversation.
 * 3. Esc in order: an open pin card closes first, then Comment mode, then
 *    the expansion.
 * 4. Back, the side pane's size is the kept width (±0.5%).
 * 5. Dragged (CDP mouse) to the session area's far edge, the conversation's
 *    pane is 0, the head reads Back to conversation and the frame fills the
 *    width (±1px); dragged back to the middle, the split follows the pointer
 *    (±1%); Expand then Esc gives back that dragged width (±0.5%).
 * 6. A reload keeps the expansion; a second session is not expanded.
 * 7. At 1280 (a pane still 900px or wider) the kept expansion fills the
 *    session area (±1px). At 1024 (the tablet) the rail leaves the pane
 *    under 900px: the preview is the sheet, with no Expand.
 * 8. No console error.
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { Clock } from "../anim";
import { type Kit, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = '.side-split .side-pane iframe[title="Preview"]';
const EXPAND = '.side-head button[aria-label="Expand"]';
/** A width the reader kept that is not the default 45%. */
const KEPT = 52.5;

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Wide</title></head>
  <body>
    <h1>A page at desktop size</h1>
    <p id="para">Read at the session area's full width.</p>
  </body>
</html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** What the split on screen reads: widths, its pane's size, its state. */
const measure = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const split = [...document.querySelectorAll(".side-split")].find((one) => {
      const r = one.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.left < innerWidth;
    });
    const width = (selector: string) =>
      split?.querySelector(selector)?.getBoundingClientRect().width ?? null;
    const side = split?.querySelector(".side-pane");
    const handle = split?.querySelector(".side-divider");
    // The group's composer dock (PaneLeaf), not a transcript's own `.dock`:
    // the one of the group the split stands in.
    const box = split?.getBoundingClientRect();
    const dock = [...document.querySelectorAll("[data-leaf] > .dock")].find(
      (one) => {
        const leaf = one.parentElement?.getBoundingClientRect();
        return (
          !!(leaf && box) &&
          box.left + 1 >= leaf.left &&
          box.right - 1 <= leaf.right
        );
      }
    );
    return {
      pane: split?.closest(".pane")?.getBoundingClientRect().width ?? null,
      sheet: !!document.querySelector('.preview-sheet iframe[title="Preview"]'),
      split: split?.getBoundingClientRect().width ?? null,
      transcript: width(".transcript-pane"),
      frame: width('.side-pane iframe[title="Preview"]'),
      side: width(".side-pane"),
      size: side ? Number.parseFloat(getComputedStyle(side).flexGrow) : null,
      expanded: !!split?.classList.contains("expanded"),
      handle: handle ? getComputedStyle(handle).display : null,
      dock: dock ? getComputedStyle(dock).visibility : null,
      kept: localStorage.getItem(`cawco.preview.width.${id}`),
      keptExpanded: localStorage.getItem(`cawco.preview.expanded.${id}`),
      control:
        split
          ?.querySelector(
            '.side-head button[aria-label="Expand"], .side-head button[aria-label="Back to conversation"]'
          )
          ?.getAttribute("aria-label") ?? null,
      beforeClose:
        split
          ?.querySelector('.side-head button[aria-label="Close"]')
          ?.previousElementSibling?.getAttribute("aria-label") ?? null,
    };
  }, sid);

/** The page in the side pane's frame, its bridge up. */
const pageUp = async (page: Page): Promise<Frame> => {
  const frame = await until(
    "the page in the side pane's frame",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  );
  if (!frame) {
    throw new Error("no frame");
  }
  await until(
    "the page's bridge up",
    () =>
      frame.evaluate(
        () => !!(window as unknown as { cawcoArtifact?: object }).cawcoArtifact
      ),
    Boolean,
    30_000
  );
  await settle(page);
  return frame;
};

const near = (a: number | null, b: number | null, by: number) =>
  a !== null && b !== null && Math.abs(a - b) <= by;

/** Writes pin 1 into the page's doc, as the overlay writes one. */
const pinOne = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
          };
        };
      }
    ).cawcoArtifact;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    doc.getMap("pins").set(id, {
      id,
      number: 1,
      kind: "comment",
      by: "person",
      at: now,
      anchor: { selector: "h1", source: null, text: "A page at desktop size" },
      elements: [],
      thread: [
        { id: crypto.randomUUID(), by: "person", text: "Wider", at: now },
      ],
    });
  });

/** 3: Esc in order, expanded: the pin card, Comment mode, then the expansion. */
const escOrder = async (
  kit: Kit,
  desk: Page,
  frame: Frame,
  sid: string
): Promise<void> => {
  await pinOne(frame);
  await desk.locator('.pin-list .pin-row[data-pin-row="1"]').click();
  const card = desk.locator('.pin-card[data-pin-card="1"]');
  await card.waitFor({ timeout: 20_000 });
  const commentButton = desk.locator('.side-head button[title="Comment (C)"]');
  await commentButton.click();
  await desk.locator('.pin-list .pin-row[data-pin-row="1"]').focus();
  const state = async () => ({
    card: await card.count(),
    commenting: await commentButton.getAttribute("aria-pressed"),
    expanded: (await measure(desk, sid)).expanded,
  });
  const steps = [await state()];
  for (let i = 0; i < 3; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each Esc after the last has landed
    await desk.keyboard.press("Escape");
    await settle(desk);
    steps.push(await state());
  }
  const want = [
    { card: 1, commenting: "true", expanded: true },
    { card: 0, commenting: "true", expanded: true },
    { card: 0, commenting: "false", expanded: true },
    { card: 0, commenting: "false", expanded: false },
  ];
  kit.check(
    "3: Esc closes the pin card first, then Comment mode, then the expansion",
    JSON.stringify(steps) === JSON.stringify(want),
    JSON.stringify(steps)
  );
};

/** 7: the tablet, at 1024. */
const onTablet = async (
  kit: Kit,
  url: string,
  sid: string,
  errors: string[]
): Promise<void> => {
  const tablet = await kit.page("tablet");
  tablet.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await open(tablet, url, ".side-split", 120_000);
  // The split's own surface, or the sheet a pane under 900px draws instead.
  const drawn = await until(
    "the preview on the tablet, beside or as a sheet",
    () => measure(tablet, sid),
    (m) => m.frame !== null || m.sheet,
    60_000
  );
  await settle(tablet);
  kit.check(
    "7: at 1024 the pane is under 900px: the preview is the sheet, with no Expand",
    drawn.sheet &&
      drawn.frame === null &&
      (drawn.pane ?? 0) < 900 &&
      (await tablet.locator(EXPAND).count()) === 0,
    JSON.stringify(drawn)
  );
};

/** Drags the split's handle by the mouse (CDP Input) to `x`, in steps. */
const dragHandle = async (page: Page, x: number): Promise<number> => {
  // Where a pointer takes the handle: the first point across it, out to
  // its hit area, that the hit test answers with the handle itself (on the
  // far edge the sidebar's grip covers the line).
  const grab = await page.evaluate(() => {
    const handle = document.querySelector(".side-split .side-divider");
    if (!handle) {
      return null;
    }
    const r = handle.getBoundingClientRect();
    const y = r.top + r.height / 2;
    for (let at = r.left - 8; at <= r.right + 12; at += 0.5) {
      if (document.elementFromPoint(at, y) === handle) {
        return { at, line: r.left, y };
      }
    }
    return null;
  });
  if (!grab) {
    throw new Error("no point on the split's handle takes the pointer");
  }
  await page.mouse.move(grab.at, grab.y);
  await page.mouse.down();
  await page.mouse.move(x, grab.y, { steps: 24 });
  await page.mouse.up();
  await settle(page);
  // Where the line stands now: the pointer, less where it took the handle.
  return x - (grab.at - grab.line);
};

/** 5: the handle dragged to the far edge and back to the middle; Expand, Esc. */
const dragAcross = async (kit: Kit, desk: Page, sid: string): Promise<void> => {
  const start = await measure(desk, sid);
  const area = await desk
    .locator(".side-split")
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });
  await dragHandle(desk, area.left);
  const edge = await measure(desk, sid);
  kit.check(
    "5: dragged to the far edge, the conversation's pane is 0, the head reads Back to conversation and the frame fills the width (±1px)",
    edge.expanded &&
      near(edge.transcript, 0, 0.5) &&
      edge.control === "Back to conversation" &&
      near(edge.frame, edge.split, 1),
    JSON.stringify({ start, edge })
  );
  const line = await dragHandle(desk, area.left + area.width / 2);
  const back = await measure(desk, sid);
  // The divider's 1px is outside the panes' percentages.
  const want = ((area.right - line - 1) / (area.width - 1)) * 100;
  kit.check(
    "5: dragged back to the middle, the split follows the pointer (±1%)",
    !back.expanded &&
      near(back.size, want, 1) &&
      back.control === "Expand" &&
      // The pane's flex-grow is drawn to a tenth; the kept width is exact.
      near(Number(back.kept), back.size, 0.1),
    `want ${want.toFixed(2)}%; ${JSON.stringify(back)}`
  );
  await desk.locator(EXPAND).click();
  await settle(desk);
  const full = await measure(desk, sid);
  await desk.keyboard.press("Escape");
  await settle(desk);
  const after = await measure(desk, sid);
  kit.check(
    "5: Expand then Esc gives back the dragged width (±0.5%)",
    full.expanded && !after.expanded && near(after.size, back.size, 0.5),
    JSON.stringify({ dragged: back.size, full: full.size, after: after.size })
  );
};

/** 7: a narrower desk, 1280, where the pane is still 900px or wider. */
const at1280 = async (
  kit: Kit,
  desk: Page,
  url: string,
  sid: string
): Promise<void> => {
  await desk.setViewportSize({ width: 1280, height: 900 });
  await open(desk, url, FRAME, 120_000);
  await pageUp(desk);
  const kept = await measure(desk, sid);
  kit.check(
    "7: at 1280 the kept expansion fills the session area (±1px), the conversation's pane 0",
    (kept.pane ?? 0) >= 900 &&
      kept.expanded &&
      near(kept.frame, kept.split, 1) &&
      near(kept.transcript, 0, 0.5),
    JSON.stringify(kept)
  );
};

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
  const first = await fleet.spawn("claude", "Expand", fleet.repo);
  const second = await fleet.spawn("claude", "Beside", fleet.repo);

  let sent = 0;
  const call = async (
    session: string,
    tool: string,
    input: object
  ): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  for (const session of [first, second]) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's turn at a time
    const made = await call(session, CREATE, {
      kind: "page",
      name: "wide",
      html: PAGE,
    });
    if (!ANSWERED_ID.test(made)) {
      kit.check("artifact_create answers an id", false, made);
      return;
    }
  }
  const base = await fleet.dashboard();

  const errors: string[] = [];
  const desk = await kit.page("desk");
  desk.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  desk.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  // The reader's kept width, so going back is read against a width of their
  // own, not the default.
  await desk.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await desk.evaluate(
    ([a, b, kept]) => {
      localStorage.setItem(`cawco.preview.width.${a}`, kept);
      localStorage.setItem(`cawco.preview.width.${b}`, kept);
    },
    [first, second, String(KEPT)] as const
  );
  await open(desk, `${base}/session/${first}`, FRAME, 120_000);
  const frame = await pageUp(desk);

  // ── 1. Expand, before Close; the slide on one clock ──────────────────
  const before = await measure(desk, first);
  kit.check(
    "1: the head's Expand stands before Close, the split at the kept width",
    before.control === "Expand" &&
      before.beforeClose === "Expand" &&
      near(before.size, KEPT, 0.5),
    JSON.stringify(before)
  );
  const clock = await Clock.on(desk);
  const runs = await clock.catchRuns(
    () => desk.locator(EXPAND).click(),
    ".side-split"
  );
  // The slide's clock is the split's: the pressed control's own hover
  // background (120ms, the head's control recipe) is the press's feedback,
  // not the slide.
  clock.runs = clock.runs.filter((r) => r.name !== "background-color");
  const one = clock.oneClock();
  kit.check(
    "1: every run of the slide shares one clock (start, length, easing)",
    one.faults.length === 0 && runs.some((r) => r.name === "flex-grow"),
    `${one.runs} runs: ${runs.map((r) => `${r.name} ${r.end}ms ${r.easing}`).join(", ")}; ${one.faults.join(" | ") || "no faults"}`
  );
  const at: Record<string, number | null> = {};
  for (const fraction of [0, 0.5, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time on the held clock
    await clock.seek(fraction);
    at[fraction] = (await measure(desk, first)).side;
  }
  const full = before.split;
  kit.check(
    "1: scrubbed, the side pane is the kept width at 0%, between at 50%, the split at 100%",
    near(at[0] ?? null, before.side, 1) &&
      (at[0.5] ?? 0) > (before.side ?? 0) + 1 &&
      (at[0.5] ?? 0) < (full ?? 0) - 1 &&
      near(at[1] ?? null, full, 1),
    `kept ${before.side}px, split ${full}px; 0%: ${at[0]}, 50%: ${at[0.5]}, 100%: ${at[1]}`
  );
  await clock.release();
  await settle(desk);

  // ── 2. Expanded at the desk ─────────────────────────────────────────
  const wide = await measure(desk, first);
  kit.check(
    "2: expanded at 1440, the frame is the session area's width (±1px) and the conversation's pane is 0",
    wide.expanded &&
      near(wide.frame, wide.split, 1) &&
      near(wide.transcript, 0, 0.5) &&
      wide.handle !== "none",
    JSON.stringify(wide)
  );
  kit.check(
    "2: the composer is put away and the control reads Back to conversation",
    wide.dock === "hidden" &&
      wide.control === "Back to conversation" &&
      wide.keptExpanded === "1",
    JSON.stringify(wide)
  );

  await escOrder(kit, desk, frame, first);

  // ── 4. Back at the kept width ───────────────────────────────────────
  const back = await measure(desk, first);
  kit.check(
    "4: back, the side pane's size is the kept width (±0.5%) and the composer is back",
    !back.expanded &&
      near(back.size, KEPT, 0.5) &&
      near(Number(back.kept), KEPT, 0.5) &&
      back.keptExpanded === null &&
      back.dock === "visible" &&
      back.handle !== "none",
    JSON.stringify(back)
  );

  await dragAcross(kit, desk, first);

  // ── 6. A reload keeps it; a second session is not expanded ──────────
  await desk.locator(EXPAND).click();
  await settle(desk);
  await desk.reload({ waitUntil: "domcontentloaded" });
  await desk.waitForSelector(FRAME, { timeout: 60_000 });
  await pageUp(desk);
  const reloaded = await measure(desk, first);
  kit.check(
    "6: a reload keeps the expansion, the frame at the session area's width (±1px)",
    reloaded.expanded &&
      near(reloaded.frame, reloaded.split, 1) &&
      near(reloaded.transcript, 0, 0.5),
    JSON.stringify(reloaded)
  );
  await open(desk, `${base}/session/${second}`, FRAME, 120_000);
  await pageUp(desk);
  const other = await until(
    "the second session's split on screen",
    () => measure(desk, second),
    (m) => m.control !== null,
    20_000
  );
  kit.check(
    "6: a second session is not expanded",
    !other.expanded &&
      other.control === "Expand" &&
      other.keptExpanded === null &&
      near(other.size, KEPT, 0.5),
    JSON.stringify(other)
  );

  await at1280(kit, desk, `${base}/session/${first}`, first);
  await onTablet(kit, `${base}/session/${second}`, second, errors);
  kit.check(
    "8: no console error",
    errors.length === 0,
    errors.slice(0, 6).join(" | ") || "none"
  );
};

const spec: Spec = { name: "side-expand", run };
export default spec;
