/**
 * The last item of every scroller under the house edge fade
 * (`.kit-edge-fade-block`, edge-fade.css) scrolls clear of the fade and
 * reads at full ink. The fade stays.
 *
 *   bun scripts/probe-kit/run.ts web edge-fade-end
 *
 * On a scratch fleet, two projects whose second stage holds `CARDS` tasks,
 * more than a column fits. On a desk, the one with a kept view placed on
 * its Board page beside the board (a block page: the pane scrolls the page
 * under its fade, and the board fills the pane's height while its columns
 * scroll inside it, BlockPage's `fill`: the owner's case); on a phone, the
 * one whose Board stands alone, the page its one scroller. On Chromium and
 * WebKit at 1440 and 390:
 *
 *  - the board: the long column's last card, its nearest scroller scrolled
 *    to its end (on a desk the column itself, on a phone the page), stands
 *    in the viewport, wholly clear of the foot's fade of every faded
 *    scroller round it: above
 *    `bottom - --fade-inset-end - --fade-end`, each read off the engine
 *    (`--fade-end` is the registered length the mask draws, so a fade lifted
 *    at the end reads 0px);
 *  - on a phone, a card halfway down that column revealed by
 *    `scrollIntoView` from the page's top: in view and clear of the foot's
 *    fade while it still stands (the page's scroll padding, --reveal-foot,
 *    is at least the run the fade covers, edge-fade.css `--fade-foot`);
 *  - the same on the Table view's last row, under the pane's fade on a desk
 *    and the project page's on a phone, two other faded scrollers;
 *  - the overflow sweep totals 0 (journeys/scan.ts), and the page logs no
 *    console error.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine and one width at a time, each on its own page
import type { Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { scan } from "../../journeys/scan";
import {
  type Engine,
  frames,
  type Kit,
  kitsOwnMessage,
  open,
  type Spec,
  settle,
} from "../../kit";

/** Cards in the long column: more than a column fits at any size here. */
const CARDS = 40;
const ENGINES: Engine[] = ["chromium", "webkit"];
const VIEWS = ["desk", "phone"] as const;
const VIEW = "spend";
const VIEW_SOURCE = `root = Column([title, table])
tasks = Query("tasks", {}, {rows: []})
title = Text("Spend per routine", "title")
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])`;
/** A sub-pixel: a box edge and a fade's edge drawn on the same line. */
const SAME_PX = 0.5;

interface Clear {
  /** Each faded scroller round the item: where its foot fade starts, and where it stands in its scroll. */
  fades: {
    bottom: number;
    fadeEnd: string;
    fadeTop: number;
    scroll: string;
    who: string;
  }[];
  /** The viewport's height. */
  innerHeight: number;
  /** The item's box, against the viewport. */
  item: { bottom: number; top: number };
}

/** Marks `selector`'s last match `data-probe-last` and scrolls its nearest scroller to its end. */
function scrollToEnd(selector: string): string {
  const last = [...document.querySelectorAll<HTMLElement>(selector)].at(-1);
  if (!last) {
    return "nothing matched";
  }
  for (const old of document.querySelectorAll("[data-probe-last]")) {
    old.removeAttribute("data-probe-last");
  }
  last.setAttribute("data-probe-last", "");
  for (let at = last.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      at.scrollHeight > at.clientHeight + 1
    ) {
      at.scrollTop = at.scrollHeight;
      return `${at.dataset.slot ?? at.tagName} to ${at.scrollTop} of ${at.scrollHeight - at.clientHeight}`;
    }
  }
  return "no scroller round it";
}

/**
 * Marks `selector`'s match at `index` `data-probe-last`, sets its nearest
 * scroller back to its top, and reveals it as the page's code does
 * (`scrollIntoView`, its foot at the scroller's foot less its
 * scroll-padding), mid-scroll.
 */
function revealMidPage([selector, index]: [string, number]): string {
  const item = document.querySelectorAll<HTMLElement>(selector)[index];
  if (!item) {
    return "nothing matched";
  }
  for (const old of document.querySelectorAll("[data-probe-last]")) {
    old.removeAttribute("data-probe-last");
  }
  item.setAttribute("data-probe-last", "");
  for (let at = item.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      at.scrollHeight > at.clientHeight + 1
    ) {
      at.scrollTop = 0;
      item.scrollIntoView({ block: "end", behavior: "instant" });
      return `${at.dataset.slot ?? at.tagName} revealed it at ${at.scrollTop} of ${at.scrollHeight - at.clientHeight}`;
    }
  }
  return "no scroller round it";
}

/** The marked item against every faded block scroller round it. */
function readClear(): Clear | null {
  const item = document.querySelector<HTMLElement>("[data-probe-last]");
  if (!item) {
    return null;
  }
  const tenth = (n: number) => Math.round(n * 10) / 10;
  const r = item.getBoundingClientRect();
  const fades: Clear["fades"] = [];
  for (let at = item.parentElement; at; at = at.parentElement) {
    if (!at.classList.contains("kit-edge-fade-block")) {
      continue;
    }
    // Its `--fade-inset-end`, read off a box that length tall.
    const ruler = document.createElement("div");
    ruler.style.cssText =
      "position:absolute;inline-size:0;block-size:var(--fade-inset-end, 0px)";
    at.append(ruler);
    const inset = ruler.getBoundingClientRect().height;
    ruler.remove();
    const fadeEnd = getComputedStyle(at).getPropertyValue("--fade-end").trim();
    // The mask draws against the scroller's border box.
    const box = at.getBoundingClientRect();
    fades.push({
      who: at.dataset.slot ?? at.tagName,
      bottom: tenth(box.bottom),
      fadeEnd,
      fadeTop: tenth(box.bottom - inset - (Number.parseFloat(fadeEnd) || 0)),
      scroll: `${at.scrollTop} of ${at.scrollHeight - at.clientHeight}`,
    });
  }
  return {
    innerHeight,
    item: { top: tenth(r.top), bottom: tenth(r.bottom) },
    fades,
  };
}

async function checkClear(
  kit: Kit,
  page: Page,
  at: string,
  what: string,
  selector: string,
  /** Revealed by `scrollIntoView` mid-scroll, this match of `selector`; else its last, scrolled to its end. */
  reveal?: number
): Promise<void> {
  const scrolled =
    reveal === undefined
      ? await page.evaluate(scrollToEnd, selector)
      : await page.evaluate(revealMidPage, [selector, reveal] as [
          string,
          number,
        ]);
  // A scroll timeline moves its fade at the next frame.
  await settle(page, 300);
  await frames(page);
  const read = await page.evaluate(readClear);
  const clear =
    read !== null &&
    read.fades.length > 0 &&
    read.item.top >= 0 &&
    read.item.bottom <= read.innerHeight &&
    read.fades.every((fade) => read.item.bottom <= fade.fadeTop + SAME_PX) &&
    // Mid-page: the fade still stands at the foot, not lifted at the end.
    (reveal === undefined ||
      read.fades.every((fade) => Number.parseFloat(fade.fadeEnd) > 0));
  kit.check(
    `${at}: ${what}, ${reveal === undefined ? "scrolled to its end" : "revealed by scrollIntoView mid-page"}, stands wholly in view and clear of every edge fade round it`,
    clear,
    read === null
      ? `nothing marked (${scrolled})`
      : `scrolled ${scrolled}; item ${read.item.top}..${read.item.bottom}; ${
          read.fades
            .map(
              (fade) =>
                `${fade.who}'s foot fade from ${fade.fadeTop} (--fade-end ${fade.fadeEnd}, box to ${fade.bottom}, scrolled ${fade.scroll})`
            )
            .join("; ") || "no faded scroller round it"
        }`
  );
}

const spec: Spec = {
  name: "edge-fade-end",
  async run(kit: Kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    /** A project whose second stage holds `CARDS` tasks: that stage's name and the project. */
    const longProject = async (name: string) => {
      const { id } = await fleet.api<{ id: string }>("/api/projects", {
        name,
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      });
      const { stages } = await fleet.api<{
        stages: { kind: string; name: string }[];
      }>(`/api/projects/${id}/stages`);
      // The second stage: no New task form under its cards, so the column
      // runs to the board's foot, as the owner's did.
      const stage = stages.filter((one) => one.kind !== "dropped")[1]?.name;
      if (!stage) {
        throw new Error(
          `the project has no second stage: ${JSON.stringify(stages)}`
        );
      }
      for (let i = 0; i < CARDS; i += 1) {
        await fleet.api(`/api/projects/${id}/tasks`, {
          title: `Make a session at its limit read as a short wait (${i})`,
          stage,
        });
      }
      return { id, stage };
    };
    // On a desk, the Board with a view placed beside it: the pane scrolls
    // the block page under its fade and the board fills the pane.
    const framed = await longProject("long-column");
    const hub = fleet.base;
    const written = await fetch(
      `${hub}/api/projects/${framed.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: `views/${VIEW}.oui`,
          content: VIEW_SOURCE,
        }),
      }
    );
    const placed = await fetch(
      `${hub}/api/projects/${framed.id}/blocks/board`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blocks: [
            { block: "board", width: "wide", hidden: false },
            { block: `view:${VIEW}`, width: "narrow", hidden: false },
          ],
        }),
      }
    );
    if (!(written.ok && placed.ok)) {
      throw new Error(
        `the view: ${written.status} ${await written.text()}; its place on the Board: ${placed.status} ${await placed.text()}`
      );
    }
    // On a phone, the Board alone: the page is its one scroller, under its
    // fade, and ends with the board (a view placed under it would run on
    // past the column's last card).
    const plain = await longProject("long-column-alone");
    const OF = { desk: framed, phone: plain } as const;
    const base = await fleet.dashboard();
    for (const engine of ENGINES) {
      for (const view of VIEWS) {
        const at = `${engine} ${view}`;
        const { id: project, stage } = OF[view];
        const longColumn = `[data-slot="column"][aria-label^="${stage}" i] [data-slot="cards"] > li`;
        const page = await kit.page(view, { engine });
        page.setDefaultTimeout(60_000);
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error" && !kitsOwnMessage(message.text())) {
            errors.push(message.text());
          }
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await open(
          page,
          `${base}/project/${project}`,
          `${longColumn}:nth-child(${CARDS})`
        );
        await settle(page, 600);
        const where = await page.evaluate(
          () =>
            document.querySelector<HTMLElement>('[data-slot="pane"]')?.dataset
              .view
        );
        kit.check(
          view === "desk"
            ? `${at}: the Board stands as a block page, the view placed beside the board`
            : `${at}: the Board stands alone`,
          where === (view === "desk" ? "blocks" : "board"),
          `the pane's view: ${where}`
        );
        await checkClear(
          kit,
          page,
          at,
          "the board's long column's last card",
          longColumn
        );
        if (view === "phone") {
          // A card halfway down the column, revealed as the page's own
          // code reveals one: it lands above the page's scroll padding
          // (--reveal-foot), which stands clear of the foot's fade.
          await checkClear(
            kit,
            page,
            at,
            "a card halfway down the long column",
            longColumn,
            Math.floor(CARDS / 2)
          );
        }
        let found = await page.evaluate(scan);
        kit.check(
          `${at} board: the overflow sweep totals 0 (${found.length})`,
          found.length === 0,
          found.join("\n    ")
        );
        await open(
          page,
          `${base}/project/${project}?view=table`,
          '[data-slot="ledger"] tbody tr'
        );
        await settle(page, 600);
        await checkClear(
          kit,
          page,
          at,
          "the Table view's last row",
          '[data-slot="ledger"] tbody tr'
        );
        found = await page.evaluate(scan);
        kit.check(
          `${at} table: the overflow sweep totals 0 (${found.length})`,
          found.length === 0,
          found.join("\n    ")
        );
        kit.check(
          `${at}: the page logs no console error`,
          errors.length === 0,
          errors.join(" | ")
        );
        await page.context().close();
      }
    }
  },
};

export default spec;
