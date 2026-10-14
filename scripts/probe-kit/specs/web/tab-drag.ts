/**
 * A tab dragged along its strip moves the tab itself, as Chrome's strip does
 * (owner: "right now it just shows a stale capture, which captures a bit of
 * the adjacent tab, it should work like the tab drag rearrange in chrome or
 * similar"), and an inactive tab's feet are the recipe's (owner: "it seems
 * the inactive tabs lost their foot"). On the built dashboard against a
 * scratch fleet with four real sessions, Alpha chosen first, Bravo, Charlie
 * and Delta working after it (the owner's order), a mouse in Chromium.
 *
 * Engine, never pictures:
 * - feet (owner: "A curved foot on inactive tabs: their sides curve out at
 *   the base like the chosen tab's"): every inactive tab's free side's rim
 *   is the chosen tab's flared path on that side, drawn whole, and its card
 *   ends on the chosen card's flared foot; its side under a neighbour folds
 *   both (DESIGN.md, Session tab status rim).
 * - follow: every pointermove puts the dragged tab's left edge where the
 *   pointer's travel says, within 1px, clamped to the strip's ends.
 * - no capture: nothing is added to the page during a drag that is an img,
 *   a canvas or a copy of a tab, no `dragstart` fires and no
 *   `setDragImage` is called.
 * - neighbour: crossing Charlie's middle starts one run, a `translate`
 *   transition on Charlie alone, scrubbed over the Animation domain at
 *   0/50/100%: rest → between → the slot Bravo left.
 * - release: the order is written once (the DOM's and the workspace's),
 *   every moving tab settles on the strip's slide on one clock, the chosen
 *   tab stays chosen, and the lift is gone once it lands.
 * - Escape: the order is as it was and every tab at rest.
 * - drops off the strip: a pane's edge splits it; another group's strip
 *   takes the tab at the place it is dropped; a pane's middle takes it into
 *   that group; nothing under the pointer changes nothing.
 * - less motion: a neighbour stands in its slot at once, no run started.
 * - a scrolling strip scrolls when the drag nears its end.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import type { Page } from "playwright-core";
import type { Seen } from "../../../scratch-fleet";
import { Clock } from "../../anim";
import { type Kit, open, type Spec } from "../../kit";
import { emulateMotion } from "../../motion";

const TITLES = ["Alpha", "Bravo", "Charlie", "Delta"];
const SLOW = "Keep working slowly";
/** Where an arc lands, at the end of its command. */
const LANDS = / \S+ \S+$/;
const STRIPS = "[data-strip]";
const near = (a: number, b: number, px = 1) => Math.abs(a - b) <= px;

/** The tab standing for session `id`, in whichever strip holds it. */
const tabSel = (id: string) => `${STRIPS} .tab:has([data-session-tab="${id}"])`;

/** A desk page with `tabs` open in one group, `active` in front. */
async function strip(
  kit: Kit,
  base: string,
  tabs: string[],
  active: string,
  reduced = false
): Promise<Page> {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  if (reduced) {
    await emulateMotion(page, "reduce");
  }
  const ws = {
    v: 1,
    root: { t: "l", id: "probe-leaf", tabs, active },
    focusedLeaf: "probe-leaf",
    ctx: {},
  };
  await page.context().addCookies([
    {
      name: "cawco-workspace",
      value: encodeURIComponent(JSON.stringify(ws)),
      url: base,
    },
  ]);
  await page.context().addInitScript((w) => {
    localStorage.setItem("cawco-workspace", JSON.stringify(w));
  }, ws);
  await page.context().addInitScript(watch);
  await open(page, `${base}/session/${active}`, `${tabSel(active)} .tclose`);
  await page.waitForFunction(
    (n) => document.querySelectorAll("[data-strip] .tab").length === n,
    tabs.length
  );
  await page.waitForTimeout(2500);
  return page;
}

/**
 * Installed before the page's own scripts: every element added to the page
 * that is an img, a canvas or carries a tab's session mark, every
 * `dragstart`, and every `setDragImage`, kept in `__drag`.
 */
function watch() {
  const w = window as unknown as {
    __drag: { added: string[]; dragstarts: number; images: number };
  };
  w.__drag = { added: [], dragstarts: 0, images: 0 };
  const set = DataTransfer.prototype.setDragImage;
  DataTransfer.prototype.setDragImage = function (...args) {
    w.__drag.images += 1;
    return set.apply(this, args);
  };
  window.addEventListener(
    "dragstart",
    () => {
      w.__drag.dragstarts += 1;
    },
    true
  );
  // The tabs on the page when the watch is reset: one moved to its new
  // place in the order (a keyed list moves its node) is not a copy.
  const known = new WeakSet<Element>();
  (window as unknown as { __known: WeakSet<Element> }).__known = known;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        const marks = [
          ...(node.matches("[data-session-tab]") ? [node] : []),
          ...node.querySelectorAll("[data-session-tab]"),
        ];
        if (
          node.matches("img, canvas") ||
          node.querySelector("img, canvas") ||
          marks.some((mark) => !known.has(mark))
        ) {
          w.__drag.added.push(node.outerHTML.slice(0, 80));
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

const watched = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __drag: { added: string[]; dragstarts: number; images: number };
        }
      ).__drag
  );
const resetWatch = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __drag: { added: string[]; dragstarts: number; images: number };
    };
    w.__drag.added = [];
    w.__drag.dragstarts = 0;
    w.__drag.images = 0;
    const { __known } = window as unknown as { __known: WeakSet<Element> };
    for (const mark of document.querySelectorAll("[data-session-tab]")) {
      __known.add(mark);
    }
  });

interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}
const boxOf = (page: Page, sel: string): Promise<Box> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) {
      throw new Error(`nothing at ${s}`);
    }
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, sel);

/** The session ids in each strip, in order, as drawn. */
const strips = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-strip]")].map((s) => ({
      leaf: s.dataset.strip ?? "",
      tabs: [...s.querySelectorAll(".tab")]
        .filter((t) => !t.closest("[inert]"))
        .map(
          (t) =>
            t
              .querySelector("[data-session-tab]")
              ?.getAttribute("data-session-tab") ?? ""
        ),
    }))
  );

/** Every group's tabs as the workspace keeps them (localStorage). */
const stored = (page: Page) =>
  page.evaluate(() => {
    interface Node {
      kids?: Node[];
      t: string;
      tabs?: string[];
    }
    const raw = localStorage.getItem("cawco-workspace");
    const leaves: string[][] = [];
    const walk = (n: Node) => {
      if (n.t === "l") {
        leaves.push(n.tabs ?? []);
      }
      for (const k of n.kids ?? []) {
        walk(k);
      }
    };
    walk((JSON.parse(raw ?? "{}") as { root: Node }).root);
    return leaves;
  });

const chosen = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector("[data-strip] .ff-tab.selected [data-session-tab]")
        ?.getAttribute("data-session-tab") ?? null
  );

/** Waits for every finite run in the strips to land, then 100ms. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const runs = [...document.querySelectorAll("[data-strip]")]
      .flatMap((el) => el.getAnimations({ subtree: true }))
      .filter(
        (run) =>
          run.playState === "running" &&
          Number.isFinite(
            Number(run.effect?.getComputedTiming().endTime ?? Number.NaN)
          )
      );
    await Promise.race([
      Promise.all(runs.map((run) => run.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
  });
  await page.waitForTimeout(100);
}

/** Where the pointer takes hold of a tab: its title's middle. */
async function grip(page: Page, id: string) {
  const b = await boxOf(page, `${tabSel(id)} .label`);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

/** The lift and translate left on any tab: none at rest. */
const leftovers = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-strip] .tab")].flatMap(
      (t) =>
        t.hasAttribute("data-lifted") || t.style.translate
          ? [`${t.textContent?.trim().slice(0, 8)}: ${t.style.translate}`]
          : []
    )
  );

/* ── The feet ───────────────────────────────────────────────────────── */

/** Each tab in the strips: its name, rank, box, tokens and its path's outline. */
const shapes = (page: Page) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map((tab) => {
        const ff = tab.querySelector(".ff-tab") as HTMLElement;
        const style = getComputedStyle(ff);
        const svg = ff.querySelector("svg.fold");
        return {
          name: tab.querySelector(".label .text")?.textContent ?? "?",
          chosen: tab.hasAttribute("data-chosen"),
          z: Number(getComputedStyle(tab).zIndex),
          width: ff.offsetWidth,
          height: ff.offsetHeight,
          flare: Number.parseFloat(style.getPropertyValue("--flare")),
          radius: Number.parseFloat(style.getPropertyValue("--radius")),
          viewBox: svg?.getAttribute("viewBox") ?? "",
          d: svg?.querySelector("defs path")?.getAttribute("d") ?? "",
        };
      }),
    `${STRIPS} .tab`
  );
type Shape = Awaited<ReturnType<typeof shapes>>[number];

/**
 * A tab's path read against the geometry: its view box the tab's box one
 * flare wider each side, its feet the flare's quarter turn (radius
 * `--flare`) to the shelf at the box's outer edge, or a fold straight down
 * the tab's edge, its shoulders at `--radius`. Answers what is wrong.
 */
function geometry(s: Shape, fold: readonly [boolean, boolean]): string[] {
  const out: string[] = [];
  const { width: w, height: h, flare: f, radius: r } = s;
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const [vx, vy, vw, vh] = s.viewBox.split(" ").map(Number);
  if (
    !(
      vx === 0 &&
      vy === 0 &&
      near(vw ?? 0, w + 2 * f, 0.5) &&
      near(vh ?? 0, h, 0.5)
    )
  ) {
    out.push(`view box ${s.viewBox}, not 0 0 ${w + 2 * f} ${h}`);
  }
  const start = fold[0]
    ? `M ${n(f)} ${n(h)} L ${n(f)} ${n(h - f)}`
    : `M 0 ${n(h)} A ${n(f)} ${n(f)} 0 0 0 ${n(f)} ${n(h - f)}`;
  const end = fold[1]
    ? `L ${n(f + w)} ${n(h)}`
    : `A ${n(f)} ${n(f)} 0 0 0 ${n(2 * f + w)} ${n(h)}`;
  if (!s.d.startsWith(start)) {
    out.push(`start ${s.d.slice(0, 40)}, not ${start}`);
  }
  if (!s.d.endsWith(end)) {
    out.push(`end …${s.d.slice(-40)}, not ${end}`);
  }
  const shoulders = s.d.match(/A (\S+) \S+ 0 0 1/g) ?? [];
  if (
    shoulders.length !== 2 ||
    shoulders.some((a) => a !== `A ${n(r)} ${n(r)} 0 0 1`)
  ) {
    out.push(`shoulders ${shoulders.join(", ")}, not two of radius ${r}`);
  }
  return out;
}

async function feet(kit: Kit, page: Page, ids: string[]) {
  const read = await shapes(page);
  kit.check(
    "feet: the tab's flare is 8px on the desk (--flare, radius-sm)",
    read.every((s) => s.flare === 8),
    read.map((s) => `${s.flare}px`).join(" ")
  );
  // The owner's order: Alpha chosen first, every other tab under the one
  // before it, its end side free.
  read.forEach((s, i) => {
    const fold: [boolean, boolean] = [i > 0, false];
    const wrong = geometry(s, fold);
    kit.check(
      `feet: ${s.name}'s path is its box's outline, ${fold[0] ? "its start folded under its neighbour" : "its start flared"}, its end flared on the flare's own quarter turn`,
      wrong.length === 0,
      wrong.join("; ") || s.d
    );
  });
  const front = read.find((s) => s.chosen);
  /** A path's end foot: its last arc, and the same less where it lands. */
  const endArc = (d: string) => d.slice(d.lastIndexOf("A"));
  const turn = (s: Shape) => endArc(s.d).replace(LANDS, "");
  kit.check(
    "feet: every inactive tab's free foot is the chosen tab's curve (the same radius and turn)",
    read
      .filter((s) => !s.chosen)
      .every((s) => front && turn(s) === turn(front)),
    read.map((s) => `${s.name}: ${endArc(s.d)}`).join("; ")
  );
  kit.check(
    "feet: the stack ranks the chosen tab on top, each tab above those farther from it",
    read.every((s, i) => i === 0 || (read[i - 1]?.z ?? 0) > s.z),
    read.map((s) => `${s.name} ${s.z}`).join(", ")
  );
  kit.note(`feet read on ${ids.length} tabs`);
}

/* ── The drag along the strip ───────────────────────────────────────── */

/** One drag along the strip, its tabs' places at rest, and where the hand is. */
interface Along {
  ids: string[];
  page: Page;
  rest: Record<"alpha" | "bravo" | "charlie" | "delta", Box>;
  start: { x: number; y: number };
  x: number;
}

/** Follow: Bravo carried in 6px steps to just short of Charlie's middle. */
async function follow(kit: Kit, at: Along) {
  const { page, rest, start } = at;
  const bravo = at.ids[1] as string;
  const charlieMid = rest.charlie.left + rest.charlie.width / 2;
  const short = charlieMid - (rest.bravo.left + rest.bravo.width / 2) - 3;
  const misses: string[] = [];
  while (at.x - start.x + 6 < short) {
    at.x += 6;
    await page.mouse.move(at.x, start.y);
    const b = await boxOf(page, tabSel(bravo));
    const want = rest.bravo.left + (at.x - start.x);
    if (!near(b.left, want)) {
      misses.push(
        `${(at.x - start.x).toFixed(0)}: ${b.left.toFixed(2)} not ${want.toFixed(2)}`
      );
    }
  }
  kit.check(
    "follow: each pointermove puts Bravo's left edge on the pointer's travel, ±1px",
    misses.length === 0,
    misses.join("; ") || `${Math.round((at.x - start.x) / 6)} moves, all on`
  );
  const lifted = await page.evaluate(
    (sel) => document.querySelector(sel)?.hasAttribute("data-lifted") ?? false,
    tabSel(bravo)
  );
  const now = await shapes(page);
  const held = now[1] as Shape;
  const top = Math.max(...now.filter((s) => s !== held).map((s) => s.z));
  const heldWrong = geometry(held, [false, false]);
  kit.check(
    "lift: the dragged tab stands over every tab, in front of both neighbours (both its feet flared)",
    lifted && held.z > top && heldWrong.length === 0,
    `lifted ${lifted}, rank ${held.z} over ${top}; ${heldWrong.join("; ") || "both feet flared"}`
  );
  const others = await Promise.all(
    [at.ids[0], at.ids[2], at.ids[3]].map((id) =>
      boxOf(page, tabSel(id as string))
    )
  );
  kit.check(
    "follow: short of Charlie's middle, no other tab has moved",
    near(others[0]?.left ?? 0, rest.alpha.left, 0.5) &&
      near(others[1]?.left ?? 0, rest.charlie.left, 0.5) &&
      near(others[2]?.left ?? 0, rest.delta.left, 0.5),
    others.map((b) => b.left.toFixed(1)).join(" ")
  );
  await settle(page);
}

/** The strip's own slide, as the page's tokens say it. */
const panelSlide = (page: Page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const d = s.getPropertyValue("--dur-panel").trim();
    return {
      ms: d.endsWith("ms") ? Number.parseFloat(d) : Number.parseFloat(d) * 1000,
      easing: s.getPropertyValue("--ease-drawer").trim(),
    };
  });
const curve = (easing: string) =>
  (easing.match(/[\d.]+/g) ?? []).map(Number).join(",");

/** Which tabs a paused `translate` transition moves now. */
const translating = (page: Page) =>
  page.evaluate(() =>
    window
      .kitRuns()
      .filter(
        (run) =>
          run instanceof CSSTransition &&
          run.transitionProperty === "translate" &&
          run.playState === "paused"
      )
      .map(
        (run) =>
          ((run.effect as KeyframeEffect | null)?.target as Element | null)
            ?.closest(".tab")
            ?.querySelector(".label .text")?.textContent ?? "?"
      )
  );

/** Crossing Charlie's middle: one run, Charlie's translate, scrubbed. */
async function neighbour(kit: Kit, at: Along) {
  const { page, rest } = at;
  const charlie = at.ids[2] as string;
  const clock = await Clock.on(page);
  at.x += 10;
  await clock.catchRuns(() => page.mouse.move(at.x, at.start.y), STRIPS);
  // What the crossing started (a status's endless pulse restarting is not
  // the crossing's), and whose tab each translate moves.
  const caught = clock.runs.filter((run) => !run.loop);
  const moving = await translating(page);
  kit.check(
    "neighbour: crossing Charlie's middle starts exactly one run, Charlie's translate",
    caught.length === 1 &&
      caught[0]?.name === "translate" &&
      JSON.stringify(moving) === JSON.stringify(["Charlie"]),
    `${caught.map((r) => `${r.type} ${r.name} ${r.end}ms ${r.easing}`).join(", ") || "none"}; translating: ${moving.join(", ") || "none"}`
  );
  const slot = rest.bravo.left;
  const lefts: number[] = [];
  for (const f of [0, 0.5, 1]) {
    await clock.seek(f);
    lefts.push((await boxOf(page, tabSel(charlie))).left);
  }
  const [l0, l50, l100] = lefts as [number, number, number];
  kit.check(
    `neighbour: Charlie slides into Bravo's slot, ${rest.charlie.left.toFixed(1)} → ${slot.toFixed(1)}, at 0/50/100%`,
    near(l0, rest.charlie.left, 0.5) &&
      near(l100, slot, 0.5) &&
      l50 < rest.charlie.left - 1 &&
      l50 > slot + 1,
    lefts.map((v) => v.toFixed(1)).join(" → ")
  );
  const panel = await panelSlide(page);
  const [slide] = caught;
  kit.check(
    "neighbour: its slide is the strip's own (--dur-panel, --ease-drawer)",
    slide?.end === panel.ms &&
      curve(slide?.easing ?? "") === curve(panel.easing),
    `${slide?.end}ms ${slide?.easing} against ${panel.ms}ms ${panel.easing}`
  );
  await clock.release();
  await settle(page);
}

/**
 * Release with Charlie still sliding back into Bravo's slot (the hand went
 * back over its middle and on again): Bravo and Charlie settle on one clock,
 * and the order is written once.
 */
async function letGo(kit: Kit, at: Along) {
  const { page, rest, start } = at;
  const [alpha, bravo, charlie, delta] = at.ids as [
    string,
    string,
    string,
    string,
  ];
  await page.mouse.move(at.x - 24, start.y);
  // On past the middle again, and 50px on, still short of Delta's: let go
  // there, a way from the slot it settles into.
  at.x += 50;
  await page.mouse.move(at.x, start.y);
  const clock = await Clock.on(page);
  await clock.catchRuns(() => page.mouse.up(), STRIPS);
  const slides = clock.runs.filter((run) => run.name === "tab-slide");
  const [lead] = slides;
  const astray = slides.filter(
    (run) =>
      run.start === null ||
      lead?.start === null ||
      Math.abs((run.start ?? 0) - (lead?.start ?? 0)) > 0.5 ||
      run.end !== lead?.end ||
      run.easing !== lead?.easing
  );
  const panel = await panelSlide(page);
  const settled: number[] = [];
  for (const f of [0, 0.5, 1]) {
    await clock.seek(f, "tab-slide");
    settled.push((await boxOf(page, tabSel(bravo))).left);
  }
  await clock.release();
  await settle(page);
  const after = await strips(page);
  const kept = await stored(page);
  const want = JSON.stringify([alpha, charlie, bravo, delta]);
  kit.check(
    "release: the strip's order and the workspace's are Alpha Charlie Bravo Delta",
    JSON.stringify(after[0]?.tabs) === want && JSON.stringify(kept[0]) === want,
    `drawn ${after[0]?.tabs.map((id) => at.ids.indexOf(id)).join(",")}; kept ${kept[0]?.map((id) => at.ids.indexOf(id)).join(",")}`
  );
  const now = await boxOf(page, tabSel(bravo));
  const [s0, s50, s100] = settled as [number, number, number];
  kit.check(
    "release: Bravo settles from where it was let go into its slot, at 0/50/100%",
    near(s0, rest.bravo.left + (at.x - start.x), 1) &&
      near(s100, now.left, 0.5) &&
      s50 > Math.min(s0, s100) + 1 &&
      s50 < Math.max(s0, s100) - 1,
    `${settled.map((v) => v.toFixed(1)).join(" → ")}, rests at ${now.left.toFixed(1)}`
  );
  kit.check(
    "release: Bravo and Charlie settle on the strip's slide, on one clock",
    slides.length === 2 &&
      astray.length === 0 &&
      lead?.end === panel.ms &&
      curve(lead?.easing ?? "") === curve(panel.easing),
    `${slides.length} tab-slide runs, ${lead?.start}+${lead?.end}ms ${lead?.easing}; ${astray.map((run) => `${run.start}+${run.end} ${run.easing}`).join("; ") || "one clock"}`
  );
  kit.check(
    "release: the chosen tab stays chosen, and no lift or translate is left",
    (await chosen(page)) === alpha && (await leftovers(page)).length === 0,
    `chosen ${at.ids.indexOf((await chosen(page)) ?? "")}; ${(await leftovers(page)).join(", ") || "none left"}`
  );
}

/** Clamped at the strip's ends; then Escape sends it back. */
async function endsAndEscape(kit: Kit, at: Along) {
  const { page, rest } = at;
  const [alpha, bravo, , delta] = at.ids as [string, string, string, string];
  const g = await grip(page, bravo);
  const lastRight = await boxOf(page, tabSel(delta));
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 10, g.y);
  await page.mouse.move(g.x + 400, g.y);
  const right = await boxOf(page, tabSel(bravo));
  await page.mouse.move(g.x - 900, g.y);
  const left = await boxOf(page, tabSel(bravo));
  kit.check(
    "clamp: the tab stops at the strip's last tab's right edge and its first tab's left edge",
    near(right.left + right.width, lastRight.left + lastRight.width, 0.5) &&
      near(left.left, rest.alpha.left, 0.5),
    `past the end its right ${(right.left + right.width).toFixed(1)} (last tab's ${(lastRight.left + lastRight.width).toFixed(1)}); past the start ${left.left.toFixed(1)} (first tab ${rest.alpha.left.toFixed(1)})`
  );
  const before = await strips(page);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await settle(page);
  const back = await strips(page);
  const was = JSON.stringify(before[0]?.tabs);
  kit.check(
    "Escape: the order is as it was, every tab at rest, the chosen tab still chosen",
    JSON.stringify(back[0]?.tabs) === was &&
      JSON.stringify((await stored(page))[0]) === was &&
      (await leftovers(page)).length === 0 &&
      (await chosen(page)) === alpha,
    `${back[0]?.tabs.map((id) => at.ids.indexOf(id)).join(",")}; ${(await leftovers(page)).join(", ") || "at rest"}`
  );
}

async function along(kit: Kit, base: string, ids: string[]) {
  const [alpha, bravo, charlie, delta] = ids as [
    string,
    string,
    string,
    string,
  ];
  const page = await strip(kit, base, ids, alpha);
  await feet(kit, page, ids);
  // The strip at rest, for a reviewer: its feet as drawn.
  await page.screenshot({ path: `${kit.out}/rest.png` });
  await resetWatch(page);
  const start = await grip(page, bravo);
  const at: Along = {
    ids,
    page,
    start,
    x: start.x,
    rest: {
      alpha: await boxOf(page, tabSel(alpha)),
      bravo: await boxOf(page, tabSel(bravo)),
      charlie: await boxOf(page, tabSel(charlie)),
      delta: await boxOf(page, tabSel(delta)),
    },
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await follow(kit, at);
  await neighbour(kit, at);
  await letGo(kit, at);
  await endsAndEscape(kit, at);
  const seen = await watched(page);
  kit.check(
    "no capture: no img, canvas or copy of a tab added, no dragstart, no setDragImage",
    seen.added.length === 0 && seen.dragstarts === 0 && seen.images === 0,
    `${seen.added.length} added (${seen.added.slice(0, 3).join(" | ")}), ${seen.dragstarts} dragstart, ${seen.images} setDragImage`
  );
  await page.close();
}

/* ── Drops off the strip ────────────────────────────────────────────── */

/** Presses `id`'s tab and carries it to (x, y), past the start slop. */
async function carryTo(page: Page, id: string, x: number, y: number) {
  const g = await grip(page, id);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 8, g.y + 2);
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      g.x + 8 + ((x - g.x - 8) * i) / steps,
      g.y + 2 + ((y - g.y - 2) * i) / steps
    );
  }
}

/** The pane of group `leaf`. */
const paneOf = (page: Page, leaf: string) =>
  boxOf(page, `[data-drop-leaf="${leaf}"]`);

async function off(kit: Kit, base: string, ids: string[]) {
  const [alpha, bravo, charlie, delta] = ids as [
    string,
    string,
    string,
    string,
  ];
  const page = await strip(kit, base, ids, alpha);
  await resetWatch(page);
  const first = (await strips(page))[0]?.leaf ?? "";

  // A pane's edge: Delta to the pane's right edge splits it.
  let pane = await paneOf(page, first);
  await carryTo(
    page,
    delta,
    pane.left + pane.width - 20,
    pane.top + pane.height / 2
  );
  const hinted = await page.evaluate(
    () => document.querySelectorAll(".drop-preview").length
  );
  await page.mouse.up();
  await settle(page);
  let now = await strips(page);
  kit.check(
    "pane edge: Delta dropped at the pane's right edge splits it, Delta alone in the new group",
    now.length === 2 &&
      JSON.stringify(now[0]?.tabs) ===
        JSON.stringify([alpha, bravo, charlie]) &&
      JSON.stringify(now[1]?.tabs) === JSON.stringify([delta]),
    `${now.map((s) => s.tabs.map((id) => ids.indexOf(id)).join(",")).join(" | ")}; split preview drawn while hovering: ${hinted}`
  );
  const second = now[1]?.leaf ?? "";

  // Another group's strip: Charlie into the second strip, before Delta.
  const deltaTab = await boxOf(page, tabSel(delta));
  await carryTo(
    page,
    charlie,
    deltaTab.left + 6,
    deltaTab.top + deltaTab.height / 2
  );
  const caret = await page.evaluate(
    (sel) => document.querySelector(sel)?.classList.contains("drop-before"),
    tabSel(delta)
  );
  await page.mouse.up();
  await settle(page);
  now = await strips(page);
  kit.check(
    "another strip: Charlie dropped before Delta in the other group's strip lands there, first",
    JSON.stringify(now.find((s) => s.leaf === second)?.tabs) ===
      JSON.stringify([charlie, delta]) &&
      JSON.stringify(now.find((s) => s.leaf === first)?.tabs) ===
        JSON.stringify([alpha, bravo]),
    `${now.map((s) => s.tabs.map((id) => ids.indexOf(id)).join(",")).join(" | ")}; caret before Delta while hovering: ${caret}`
  );

  // A pane's middle: Bravo into the second group's pane.
  pane = await paneOf(page, second);
  await carryTo(
    page,
    bravo,
    pane.left + pane.width / 2,
    pane.top + pane.height / 2
  );
  await page.mouse.up();
  await settle(page);
  now = await strips(page);
  kit.check(
    "pane middle: Bravo dropped in the other group's pane joins its tabs at the end",
    JSON.stringify(now.find((s) => s.leaf === second)?.tabs) ===
      JSON.stringify([charlie, delta, bravo]),
    now.map((s) => s.tabs.map((id) => ids.indexOf(id)).join(",")).join(" | ")
  );

  // Nothing under the pointer: the sidebar.
  const was = await strips(page);
  await carryTo(page, charlie, 40, 400);
  await page.mouse.up();
  await settle(page);
  now = await strips(page);
  kit.check(
    "nowhere: a tab dropped on the sidebar changes nothing and comes to rest",
    JSON.stringify(now) === JSON.stringify(was) &&
      (await leftovers(page)).length === 0,
    `${now.map((s) => s.tabs.map((id) => ids.indexOf(id)).join(",")).join(" | ")}; ${(await leftovers(page)).join(", ") || "at rest"}`
  );
  const seen = await watched(page);
  kit.check(
    "drops off the strip: no dragstart, no setDragImage",
    seen.dragstarts === 0 && seen.images === 0,
    `${seen.dragstarts} dragstart, ${seen.images} setDragImage`
  );
  await page.close();
}

/* ── Less motion, and a strip that scrolls ──────────────────────────── */

/* ── A switch: the shuffle ──────────────────────────────────────────── */

/** Each tab's left edge as drawn (its slide in it), rank and folds. */
const drawn = (page: Page) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map((tab) => {
        const d =
          tab.querySelector("svg.fold defs path")?.getAttribute("d") ?? "";
        return {
          left: tab.getBoundingClientRect().left,
          z: Number(getComputedStyle(tab).zIndex),
          foldStart: d.startsWith("M 0") ? 0 : 1,
          // A flared end is the path's last arc; a folded one a line.
          foldEnd: d.lastIndexOf("A") > d.lastIndexOf("L") ? 0 : 1,
          pick: Number(
            getComputedStyle(tab.querySelector(".ff-tab") as Element)
              .getPropertyValue("--pick")
              .trim()
          ),
        };
      }),
    `${STRIPS} .tab`
  );

/**
 * Alpha chosen, Bravo clicked: Bravo slides out away from Alpha, past
 * Alpha's foot (the overlap, the flare and --space-1), comes in front at
 * the furthest point, and slides back, now in front; one run of translate,
 * scrubbed over the Animation domain. With less motion the swap is instant.
 */
async function shuffled(kit: Kit, base: string, ids: string[]) {
  const [alpha, bravo] = ids as [string, string];
  const page = await strip(kit, base, ids, alpha);
  const rest = await drawn(page);
  const out = await page.evaluate(() => {
    const s = getComputedStyle(
      document.querySelector(".ff-tabs-list") as Element
    );
    const px = (n: string) => Number.parseFloat(s.getPropertyValue(n)) || 0;
    return px("--overlap") + px("--flare") + px("--space-1");
  });
  const clock = await Clock.on(page);
  const at = await grip(page, bravo);
  await clock.catchRuns(() => page.mouse.click(at.x, at.y), STRIPS);
  const shuffle = clock.runs.find((run) => run.name === "tab-shuffle");
  const picks = clock.runs.filter((run) => run.name === "--pick");
  kit.check(
    "shuffle: the switch is one run of translate on Bravo (tab-shuffle) with the tabs' --pick on its clock (one start, one length)",
    Boolean(shuffle) &&
      picks.length >= 2 &&
      picks.every(
        (run) =>
          run.start !== null &&
          shuffle?.start !== null &&
          Math.abs((run.start ?? 0) - (shuffle?.start ?? 0)) <= 0.5 &&
          run.end === shuffle?.end
      ),
    `${clock.runs.map((run) => `${run.type} ${run.name} ${run.start}+${run.end}`).join(", ")}`
  );
  const frames: string[] = [];
  const at50: Awaited<ReturnType<typeof drawn>>[] = [];
  const rows: Record<number, Awaited<ReturnType<typeof drawn>>> = {};
  for (const f of [0, 0.25, 0.49, 0.5, 0.75, 1]) {
    await clock.seek(f, "tab-shuffle");
    const now = await drawn(page);
    rows[f] = now;
    if (f === 0.5) {
      at50.push(now);
    }
    const [a, b] = now as [(typeof now)[number], (typeof now)[number]];
    frames.push(
      `${f * 100}%: Bravo +${(b.left - (rest[1]?.left ?? 0)).toFixed(1)}px, z Alpha ${a.z} Bravo ${b.z}, Bravo start ${b.foldStart ? "folded" : "flared"}, pick ${a.pick.toFixed(2)}/${b.pick.toFixed(2)}`
    );
  }
  await clock.release();
  const offset = (f: number) =>
    (rows[f]?.[1]?.left ?? 0) - (rest[1]?.left ?? 0);
  const front = (f: number) => (rows[f]?.[1]?.z ?? 0) > (rows[f]?.[0]?.z ?? 0);
  kit.check(
    `shuffle: Bravo slides out away from Alpha to the furthest point at 50% (${out}px: the overlap, the flare and --space-1) and back to its slot`,
    near(offset(0), 0, 0.5) &&
      offset(0.25) > 1 &&
      offset(0.25) < out - 1 &&
      near(offset(0.5), out, 0.5) &&
      offset(0.75) > 1 &&
      offset(0.75) < out - 1 &&
      near(offset(1), 0, 0.5),
    frames.join(" | ")
  );
  kit.check(
    "shuffle: the stack swaps at the furthest point: Bravo behind Alpha to 49%, in front from 50%, its start foot flared once in front",
    !(front(0) || front(0.25) || front(0.49)) &&
      front(0.5) &&
      front(0.75) &&
      front(1) &&
      rows[0.49]?.[1]?.foldStart === 1 &&
      rows[0.5]?.[1]?.foldStart === 0 &&
      rows[0.5]?.[0]?.foldEnd === 1,
    frames.join(" | ")
  );
  await settle(page);
  const after = await shapes(page);
  const wrong = after.flatMap((s, i) =>
    geometry(s, [i > 1, i === 0]).map((w) => `${s.name}: ${w}`)
  );
  kit.check(
    "shuffle: landed, every path is its box's outline: Alpha's end folded under Bravo, Bravo both flared, the rest folded toward Bravo",
    wrong.length === 0 && (await leftovers(page)).length === 0,
    wrong.join("; ") || "all on the geometry"
  );
  await page.close();

  const calm = await strip(kit, base, ids, alpha, true);
  const g = await grip(calm, bravo);
  await calm.mouse.click(g.x, g.y);
  await calm.waitForTimeout(100);
  const runs = await calm.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .flatMap((el) => el.getAnimations({ subtree: true }))
        .filter((run) => run.id === "tab-shuffle").length,
    STRIPS
  );
  const now = await drawn(calm);
  kit.check(
    "shuffle, less motion: an instant swap, no slide, Bravo in front",
    runs === 0 &&
      (now[1]?.z ?? 0) > (now[0]?.z ?? 0) &&
      near(now[1]?.left ?? 0, rest[1]?.left ?? 0, 0.5),
    `${runs} tab-shuffle runs; z Alpha ${now[0]?.z} Bravo ${now[1]?.z}`
  );
  await calm.close();
}

async function still(kit: Kit, base: string, ids: string[]) {
  const [alpha, bravo, charlie] = ids as [string, string, string];
  const page = await strip(kit, base, ids, alpha, true);
  const rest = {
    bravo: await boxOf(page, tabSel(bravo)),
    charlie: await boxOf(page, tabSel(charlie)),
  };
  const g = await grip(page, bravo);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 8, g.y);
  const past =
    rest.charlie.left +
    rest.charlie.width / 2 -
    (rest.bravo.left + rest.bravo.width / 2) +
    6;
  await page.mouse.move(g.x + past, g.y);
  const read = await page.evaluate((sel) => {
    const t = document.querySelector(sel) as HTMLElement;
    return {
      left: t.getBoundingClientRect().left,
      runs: t.getAnimations().length,
    };
  }, tabSel(charlie));
  kit.check(
    "less motion: Charlie stands in Bravo's slot at once, with no run",
    near(read.left, rest.bravo.left, 0.5) && read.runs === 0,
    `left ${read.left.toFixed(1)} (slot ${rest.bravo.left.toFixed(1)}), ${read.runs} runs`
  );
  await page.mouse.up();
  await page.close();
}

async function scrolls(kit: Kit, base: string, ids: string[], more: string[]) {
  const all = [...ids, ...more];
  const page = await strip(kit, base, all, all[0] as string);
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(800);
  const track = await page.evaluate(() => {
    const t = document.querySelector(
      "[data-strip] .ff-tabs-list"
    ) as HTMLElement;
    const r = t.getBoundingClientRect();
    return {
      over: t.scrollWidth - t.clientWidth,
      right: r.right,
      left: t.scrollLeft,
    };
  });
  const id = all[1] as string;
  const g = await grip(page, id);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 8, g.y);
  await page.mouse.move(track.right - 4, g.y);
  await page.waitForTimeout(600);
  const scrolled = await page.evaluate(
    () =>
      (document.querySelector("[data-strip] .ff-tabs-list") as HTMLElement)
        .scrollLeft
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  kit.check(
    "scroll: held near an overflowing strip's end, the drag scrolls it",
    track.over > 0 && scrolled > track.left + 20,
    `overflow ${track.over.toFixed(0)}px; scrollLeft ${track.left} → ${scrolled.toFixed(0)}`
  );
  await page.close();
}

const spec: Spec = {
  name: "tab-drag",
  async run(kit) {
    const fleet = await kit.fleet((request: Seen) =>
      request.last.includes(SLOW)
        ? { everyMs: 3000, words: Array.from({ length: 120 }, () => "slowly") }
        : { everyMs: 20, words: ["Ready."] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const ids = await Promise.all(
      TITLES.map((title) => fleet.spawn("claude", title))
    );
    const more = await Promise.all(
      ["Echo", "Foxtrot", "Golf", "Hotel"].map((title) =>
        fleet.spawn("claude", title)
      )
    );
    for (const id of ids.slice(1)) {
      await fleet.send(id, SLOW);
    }
    const base = await fleet.dashboard();
    await along(kit, base, ids);
    await off(kit, base, ids);
    await shuffled(kit, base, ids);
    await still(kit, base, ids);
    await scrolls(kit, base, ids, more);
  },
};
export default spec;
