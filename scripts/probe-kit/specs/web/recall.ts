/**
 * The composer's recall wheel (transcript/RecallWheel, DESIGN.md "Recall
 * wheel", "The grown shape"), on the recall bench (/motion/recall, no hub:
 * the real Composer over a conversation of sixty sent messages), on the
 * desk and the phone, light and dark. Owner: "Can we make the swipe hover
 * history thing much taller? Like to 1/2 of the screen to show more
 * entries? Remove the history button", "on phone 1/2 and on desktop an
 * appropriate height", "Everywhere".
 *
 *  - no history button anywhere in the composer; the field names ↑
 *    (`aria-keyshortcuts`) and is described by "Press Up to show what you
 *    sent" (engine);
 *  - ↑ in the empty field brings the wheel up; on the phone a press held on
 *    the pill does too (engine);
 *  - its growth caught on the clock (anim.ts) and sought to 0, 50 and 100%:
 *    the rows fade in and the pill's buttons slide into their deck one way,
 *    with no NaN written anywhere (motion by seek);
 *  - grown, the shape's top stands no lower than the reach (half the
 *    window's height up on the phone, 40% on the desk) plus one row, with
 *    at least five rows over the line (three on the phone) (geometry);
 *  - each row over the line, bottom up: its lean (`rotate`), narrowing
 *    (`scale`), blur and opacity move one way, and the top row's are the
 *    fifth row's of before (the third's on the phone): 30°, 0.89, 0.1px,
 *    0.94 (18°, 0.934, 0.06px, 0.955) (engine). The blur is DESIGN.md's
 *    "Recall wheel" 0.1px (0.06px compact): down from 1.5px (0.9px) so every
 *    row holds 4.5:1 as drawn (995697ce);
 *  - two seconds of rolling (↑ held at the key's repeat) with no long task
 *    and no frame over 20ms (frames.ts).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step, one reading at a time.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each view and step is read in order.
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { longest, tell, watch, watched } from "../../frames";
import { r2 } from "../../geom";
import { type Kit, open, type Spec, settle, THEMES } from "../../kit";

const ROUTE = "/motion/recall";
const FIELD = "textarea[role='combobox']";
const WHEEL = ".ghosts[role='listbox']";
/** Where the depth ends: the fifth row's of before, the third's on the phone. */
const END = {
  desk: { rotate: 30, scale: 0.89, blur: 0.1, opacity: 0.94, rows: 5 },
  phone: { rotate: 18, scale: 0.934, blur: 0.06, opacity: 0.955, rows: 3 },
} as const;
const REACH = { desk: 0.4, phone: 0.5 } as const;

/** The wheel's rows over the line, bottom up, as the engine computes them. */
const rowsNow = (page: Page) =>
  page.evaluate((wheel) => {
    const list = document.querySelector(wheel);
    const picked = Number(
      list?.querySelector<HTMLElement>("[aria-selected='true']")?.dataset.k ??
        Number.NaN
    );
    return [...(list?.querySelectorAll<HTMLElement>(".ghost") ?? [])]
      .map((row) => {
        const s = getComputedStyle(row);
        // biome-ignore lint/performance/useTopLevelRegex: runs in the page, which has no module scope
        const blur = /blur\(([\d.]+)px\)/.exec(s.filter);
        // `rotate` computes as "x 30deg": the angle after the axis.
        const angle = s.rotate.split(" ").at(-1) ?? "0";
        return {
          k: Number(row.dataset.k),
          shown: s.visibility === "visible",
          rotate: Number.parseFloat(angle) || 0,
          scale: Number.parseFloat(s.scale) || 1,
          blur: blur ? Number(blur[1]) : 0,
          opacity: Number(s.opacity),
          top: row.getBoundingClientRect().top,
        };
      })
      .filter((row) => row.k > picked && row.shown && row.opacity > 0.01)
      .sort((a, b) => a.k - b.k);
  }, WHEEL);

/** The grown shape's top (its outline's box) and one row, against the window. */
const shapeNow = (page: Page) =>
  page.evaluate(() => {
    const halo = document.querySelector(".grown-halo");
    const field = document.querySelector<HTMLElement>(
      "textarea[role='combobox']"
    );
    const row = Number.parseFloat(
      getComputedStyle(field ?? document.body).getPropertyValue(
        "--c-composer-field"
      )
    );
    return {
      top: halo?.getBoundingClientRect().top ?? Number.NaN,
      row: row || 34,
      height: innerHeight,
    };
  });

/** Puts the wheel away and leaves the field empty and unfocused. */
async function putAway(page: Page) {
  if (await page.$(WHEEL)) {
    // Esc rolls back to the draft, and Esc there folds it away.
    await page.keyboard.press("Escape");
    await settle(page, 300);
    if (await page.$(WHEEL)) {
      await page.keyboard.press("Escape");
    }
    await page.waitForSelector(WHEEL, { state: "detached", timeout: 5000 });
  }
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  await settle(page, 200);
}

async function readAt(kit: Kit, view: "desk" | "phone", theme: string) {
  const where = `${view} ${theme}`;
  const page = await kit.page(view, {
    theme: theme as "light" | "dark",
    init: [watch],
  });
  await open(
    page,
    `${await kit.bench()}${ROUTE}?theme=${theme}`,
    FIELD,
    120_000
  );
  await settle(page, 400);

  const access = await page.evaluate((sel) => {
    const field = document.querySelector<HTMLTextAreaElement>(sel);
    const hint = document.getElementById(
      field?.getAttribute("aria-describedby") ?? ""
    );
    return {
      button: document.querySelector(
        ".history-btn, [aria-label='Show what you sent here']"
      ),
      keys: field?.getAttribute("aria-keyshortcuts") ?? null,
      hint: hint?.textContent?.trim() ?? null,
    };
  }, FIELD);
  kit.check(
    `${where}: no history button; the field names ↑ and says how to use it`,
    access.button === null &&
      access.keys === "ArrowUp" &&
      access.hint === "Press Up to show what you sent",
    JSON.stringify(access)
  );

  // ↑ in the empty field, its growth caught on the clock.
  const clock = await Clock.on(page);
  await page.focus(FIELD);
  await clock.catchRuns(() => page.keyboard.press("ArrowUp"), ".shell");
  const seeks: {
    ghosts: number;
    deck: number;
    open: boolean;
  }[] = [];
  for (const pct of [0, 50, 100]) {
    await clock.seek(pct / 100);
    seeks.push(
      await page.evaluate((wheel) => {
        const ghosts = document.querySelector(wheel);
        // How far the pill's buttons have slid toward Send: the farthest.
        const slid = [
          ...document.querySelectorAll<HTMLElement>(".ctrls > *"),
        ].map((card) =>
          Math.abs(Number.parseFloat(getComputedStyle(card).translate) || 0)
        );
        return {
          open: ghosts !== null,
          ghosts: ghosts ? Number(getComputedStyle(ghosts).opacity) : 0,
          deck: Math.max(0, ...slid),
        };
      }, WHEEL)
    );
  }
  await clock.release();
  await settle(page, 500);
  const { nan } = await watched(page);
  const ghostsUp = seeks.every(
    (s, i) => i === 0 || s.ghosts >= (seeks[i - 1]?.ghosts ?? 0) - 0.001
  );
  const deckOneWay =
    (seeks.at(-1)?.deck ?? 0) > 0 &&
    seeks.every(
      (s, i) => i === 0 || s.deck >= (seeks[i - 1]?.deck ?? 0) - 0.01
    );
  kit.check(
    `${where}: ↑ brings the wheel up; its growth sought to 0, 50 and 100% moves one way, no NaN written`,
    seeks.every((s) => s.open) &&
      ghostsUp &&
      (seeks.at(-1)?.ghosts ?? 0) > 0.99 &&
      deckOneWay &&
      nan.length === 0,
    `rows' fade ${seeks.map((s) => r2(s.ghosts)).join(" → ")}; deck ${seeks.map((s) => r2(s.deck)).join(" → ")}px; NaN ${nan.length}`
  );

  // Grown and still.
  const shape = await shapeNow(page);
  const reach = shape.height * (1 - REACH[view]);
  const rows = await rowsNow(page);
  const end = END[view];
  kit.check(
    `${where}: the shape's top reaches ${REACH[view] * 100}% of the window's height, within a row, with at least ${end.rows} rows over the line`,
    shape.top <= reach + shape.row && rows.length >= end.rows,
    `top ${r2(shape.top)}px, reach ${r2(reach)}px, a row ${shape.row}px; ${rows.length} rows over the line`
  );
  const oneWay = (pick: (r: (typeof rows)[number]) => number, up: boolean) =>
    rows.every(
      (r, i) =>
        i === 0 ||
        (up
          ? pick(r) >= pick(rows[i - 1] as (typeof rows)[number]) - 0.001
          : pick(r) <= pick(rows[i - 1] as (typeof rows)[number]) + 0.001)
    );
  const top = rows.at(-1);
  kit.check(
    `${where}: the rows' depth moves one way up the wheel and ends at the ${end.rows === 5 ? "fifth" : "third"} row's of before`,
    !!top &&
      oneWay((r) => r.rotate, true) &&
      oneWay((r) => r.scale, false) &&
      oneWay((r) => r.blur, true) &&
      oneWay((r) => r.opacity, false) &&
      Math.abs(top.rotate - end.rotate) < 0.05 &&
      Math.abs(top.scale - end.scale) < 0.001 &&
      Math.abs(top.blur - end.blur) < 0.011 &&
      Math.abs(top.opacity - end.opacity) < 0.001,
    rows
      .map((r) => `${r2(r.rotate)}° ×${r.scale} ${r.blur}px ${r2(r.opacity)}`)
      .join(" | ")
  );

  // Two seconds of rolling: ↑ at the key's repeat, the spring always moving.
  await tell(page, { rafs: [], cadence: true });
  const since = await page.evaluate(() => performance.now());
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);
  }
  await tell(page, { cadence: false });
  const seen = await watched(page);
  const rafs = seen.rafs.filter((t) => t >= since);
  const worst = Math.max(
    0,
    ...rafs.slice(1).map((t, i) => t - (rafs[i] as number))
  );
  const tasks = longest(seen.tasks, since);
  kit.check(
    `${where}: two seconds of rolling, no long task and no frame over 20ms`,
    tasks.count === 0 && worst < 20 && rafs.length > 60,
    `${rafs.length} frames, worst ${r2(worst)}ms; long tasks ${tasks.count} (longest ${r2(tasks.ms)}ms)`
  );
  await putAway(page);

  if (view === "phone") {
    // A press held on the pill, the keyboard down: the wheel comes up under it.
    const at = await page.evaluate((sel) => {
      const box = document.querySelector(sel)?.getBoundingClientRect();
      return box ? { x: box.left + 24, y: box.top + box.height / 2 } : null;
    }, FIELD);
    const cdp = await page.context().newCDPSession(page);
    const point = { x: at?.x ?? 0, y: at?.y ?? 0, id: 1 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.waitForTimeout(600);
    const held = (await page.$(WHEEL)) !== null;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await settle(page, 300);
    const stays = (await page.$(WHEEL)) !== null;
    kit.check(
      `${where}: a press held on the pill brings the wheel up, and it stays up as the press lifts`,
      held && stays,
      `up while held ${held}, after ${stays}`
    );
    await cdp.detach();
    await putAway(page);
  }
  await page.close();
}

const spec: Spec = {
  name: "recall",
  run: async (kit) => {
    for (const view of ["desk", "phone"] as const) {
      for (const theme of THEMES) {
        await readAt(kit, view, theme);
      }
    }
  },
};
export default spec;
