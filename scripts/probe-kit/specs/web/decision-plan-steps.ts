/**
 * The plan-steps decision page (apps/dashboard plan/proposal/page.oui) as
 * the owner sees it, through the hub's decision host with no hub
 * (decision-embeds.ts), as CawCo shows it (the overlay's bridge,
 * `CAWCO_BRIDGE`): its program as written, each Preview the live canvas of
 * its way's states file.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would, read on the page and in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Every embed draws the stories its Preview names: each frame drawn,
 *    with words in it, shot where the owner sees it (canvas-shots.ts).
 * 3. The plan card's lead says "Recommended: <its option>, because …".
 * 4. Each option's drawing stands right under its own chip, in its cell.
 * 5. Each option draws one frame, the one the reader's screen shows: the
 *    desk's card under a mouse, the phone's sheet under a finger.
 * 6. Lanes stands the steps that run at the same time side by side, in
 *    columns.
 * 7. No line crosses a box: every connector, sampled along its length,
 *    stays off every tile, words, badge and time but its own two ends.
 * 8. Nothing is cut: no box clips its words without an ellipsis, and no
 *    clipping or scrolling box's top or foot runs through a line (words, a
 *    tile, a progress line); every row's words have room (64px, some eight
 *    characters); and every row stands at its place when read, no slide
 *    held on it.
 * 9. "Fixed from your pins" is a section with no pick, its first line
 *    "If one still looks wrong, pin it.", one drawing per fix: the date
 *    picker opened to its description; the to-do that became a task,
 *    wearing the task's glyph and id, in sight; and a working delegate's
 *    pulse at three moments, each named (Start, Middle, End), its band at
 *    10%, 50% and 90% of the fill.
 * 10. No console error, the page's or its canvases'.
 * 11. Nothing scrolls the page sideways.
 * 12. The page's own capture paints every embed (decision-embeds.ts
 *    `capturePage`: the page pictured window by window as the person
 *    scrolls it), and is files a delegate can hand over: RGB, each within
 *    the hub's 1 MiB (a tall page in numbered sections cut between its
 *    cards), read back pixel for pixel (`captureFaults`).
 *
 * Each leg's picture goes to .probe/decision-pages as its files, beside a
 * manifest of its cards (question, why, options, recommended), the page's
 * height and its options' places, what each embed drew, and every check
 * with its output.
 *
 *   bun scripts/probe-kit/run.ts web decision-plan-steps
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { FOLDER_FILE_LIMIT } from "../../../../packages/hub/src/project-folder";
import {
  APP,
  blankEmbeds,
  CAWCO_BRIDGE,
  captureFaults,
  capturePage,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-pages");
const SHOTS = join(OUT, "plan-steps-frames");
const NAME = "plan-steps";
const PROPOSAL = "src/lib/cawco/plan/proposal";
const PROGRAM = readFileSync(join(APP, PROPOSAL, "page.oui"), "utf8");

/** Each way's canvas, by the artifact id its Preview names, and the states file it draws. */
const CANVASES: Record<string, readonly string[]> = {
  "0d0429d6-606f-48fa-89cf-dfbb05968c65": [`${PROPOSAL}/OneList.stories.ts`],
  "02d5597b-58da-4157-be36-8806f1278d1d": [`${PROPOSAL}/Lanes.stories.ts`],
  "b8f93d08-75a2-4323-8ca8-11f50c8f662c": [`${PROPOSAL}/CrewFirst.stories.ts`],
};

/** Each Preview's stories, as the program writes them: `Preview("id", caption, ["A", "B"])`. */
const PREVIEWS = [
  ...PROGRAM.matchAll(
    /Preview\("[^"]+",\s*(?:null|"[^"]*"),\s*\[([^\]]*)\]\)/g
  ),
].map(([, stories = ""]) =>
  [...stories.matchAll(/"([^"]+)"/g)].map((one) => one[1] ?? "").join(",")
);
/** A task's id as the board writes it ("tsk-14"). */
const TASK_ID = /^tsk-\d+$/;
/** The pins section's pulse: each moment's name, and where its band's centre stands along the fill. */
const MOMENTS = [
  { label: "Start", centre: 0.1 },
  { label: "Middle", centre: 0.5 },
  { label: "End", centre: 0.9 },
] as const;
/** The pins section as the page writes it. */
const PINS_TITLE = "Fixed from your pins";
const PINS_LEAD = "If one still looks wrong, pin it.";

interface Checked {
  check: string;
  output: string;
  passed: boolean;
}

/** What one embed's own frame shows, read in it. */
function frameFacts() {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const kinds = [...document.querySelectorAll<HTMLElement>(".frame[data-kind]")]
    .filter(shown)
    .map((one) => one.dataset.kind ?? "");
  // Lanes: each band's columns, where their rows stand.
  const bands = [...document.querySelectorAll('[data-slot="band"]')].map(
    (band) =>
      [...band.querySelectorAll(":scope > ul > li")].map((li) => {
        const r = li.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left) };
      })
  );
  // The task's badge, and whether it stands inside what its scroller shows.
  const badges = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="task-badge"]'),
  ]
    .filter(shown)
    .map((badge) => {
      const r = badge.getBoundingClientRect();
      const scroller = badge.closest(".kit-edge-fade-block");
      const s = scroller?.getBoundingClientRect();
      return {
        glyph: badge.querySelector("svg") !== null,
        id:
          badge.querySelector('[data-slot="task-id"]')?.textContent?.trim() ??
          "",
        // Drawn alone (no scroller), it is in sight whole.
        inSight: !s || (r.top >= s.top && r.bottom <= s.bottom),
      };
    });
  // Each held moment of the pulse: its name, and where its band's centre
  // stands along the fill, a share of it.
  const sweeps = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="pulse-moment"]'),
  ].flatMap((moment) => {
    const band = moment.querySelector('[data-slot="sweep"]');
    const box = band?.parentElement?.getBoundingClientRect();
    const r = band?.getBoundingClientRect();
    return band && box && r && box.width > 0
      ? [
          {
            label: moment.querySelector(".label")?.textContent?.trim() ?? "",
            centre:
              Math.round(
                ((r.left + r.width / 2 - box.left) / box.width) * 100
              ) / 100,
          },
        ]
      : [];
  });
  // The date picker, its description drawn open.
  const opened = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-row="a2"] [data-slot="description"]'
    ),
  ].some((el) => el.getBoundingClientRect().height > 8);
  // Each row drawn off its place: a slide's translate held, or a run on it.
  const moving = [...document.querySelectorAll<HTMLElement>("[data-row]")]
    .filter(shown)
    .flatMap((row) => {
      const { translate } = getComputedStyle(row);
      const runs = row
        .getAnimations()
        .map(
          (run) =>
            `${run.playState} ${Math.round(Number(run.currentTime ?? 0))}ms`
        );
      return translate !== "none" || runs.length > 0
        ? [`${row.dataset.row} ${translate} ${runs.join("+")}`]
        : [];
    });
  // Each row's words and the room they stand in, in the drawing's own
  // pixels: a column squeezed to a few letters breaks every word.
  const squeezed = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="words"]'),
  ]
    .filter(shown)
    .flatMap((words) => {
      const room = words.getBoundingClientRect().width / words.currentCSSZoom;
      return room < 64
        ? [
            `${words.closest("[data-row]")?.getAttribute("data-row")} "${(words.textContent ?? "").trim().slice(0, 30)}" in ${Math.round(room)}px`,
          ]
        : [];
    });
  return { kinds, bands, badges, sweeps, opened, moving, squeezed };
}

/**
 * Every connector in an embed's frame, sampled along its run in its
 * layer's own pixels, against every box but its own two ends. In the page.
 */
function crossingsIn(): string[] {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    // What a person sees: a closed fold's rows are laid out under their
    // step, at no opacity, clipped.
    if (
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    ) {
      return false;
    }
    return r.width > 0 && r.height > 0;
  };
  // Every connector, sampled along its run in its layer's own pixels,
  // against every box but its own two ends.
  const crossings: string[] = [];
  for (const svg of document.querySelectorAll<SVGSVGElement>(
    '[data-slot="connectors"]'
  )) {
    const host = svg.parentElement;
    if (!host) {
      continue;
    }
    const origin = host.getBoundingClientRect();
    const z = host.currentCSSZoom;
    const boxes = [
      ...host.querySelectorAll<HTMLElement>(
        '[data-tile], [data-slot="words"], [data-slot="task-badge"], [data-slot="time"], [data-slot="chevron"]'
      ),
    ]
      .filter(shown)
      .map((el) => {
        const r = el.getBoundingClientRect();
        // A line may meet its own two tiles at their edges; every other box,
        // its own step's words too, it stays off.
        const tile = el.dataset.tile ?? "";
        const row = el.closest("[data-row]")?.getAttribute("data-row") ?? "";
        return {
          what: `${el.dataset.slot ?? "tile"} of ${tile || row}`,
          own: tile,
          left: (r.left - origin.left) / z + 1,
          right: (r.right - origin.left) / z - 1,
          top: (r.top - origin.top) / z + 1,
          bottom: (r.bottom - origin.top) / z - 1,
        };
      });
    for (const wire of svg.querySelectorAll<SVGPathElement>("path.wire")) {
      const ends = [wire.dataset.from ?? "", wire.dataset.to ?? ""];
      const length = wire.getTotalLength();
      for (let at = 0; at <= length; at += 2) {
        const p = wire.getPointAtLength(at);
        const hit = boxes.find(
          (box) =>
            !(box.own && ends.includes(box.own)) &&
            p.x > box.left &&
            p.x < box.right &&
            p.y > box.top &&
            p.y < box.bottom
        );
        if (hit) {
          crossings.push(
            `${ends.join(">")} through the ${hit.what} at (${Math.round(p.x)}, ${Math.round(p.y)}), its box ${[hit.left, hit.top, hit.right, hit.bottom].map(Math.round).join(",")}, the line ${wire.getAttribute("d")}`
          );
          break;
        }
      }
    }
  }
  return crossings;
}

/** Words in an embed's frame a box clips across with no ellipsis: a line of text in sight past a clipping box's side. In the page. */
function sideCutIn(): string[] {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cut: string[] = [];
  const range = document.createRange();
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const style = getComputedStyle(el);
    if (
      !["hidden", "clip"].includes(style.overflowX) ||
      style.textOverflow === "ellipsis" ||
      el.closest(".sr-only") ||
      !shown(el)
    ) {
      continue;
    }
    const box = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement;
      if (!(
        holder &&
        (node.textContent ?? "").trim() &&
        holder.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      )) {
        continue;
      }
      range.selectNodeContents(node);
      const past = [...range.getClientRects()].find(
        (r) => r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)
      );
      if (past) {
        cut.push(
          `"${(node.textContent ?? "").trim().slice(0, 40)}" in ${holder.tagName.toLowerCase()}.${[...holder.classList][0] ?? ""} past the side of ${el.tagName.toLowerCase()}.${[...el.classList][0] ?? ""} (${Math.round(box.left)}–${Math.round(box.right)}) by ${Math.round(Math.max(past.right - box.right, box.left - past.left))}px`
        );
        break;
      }
    }
  }
  return cut;
}

/**
 * Lines in an embed's frame a clipping or scrolling box's top or foot runs
 * through: a line of words, a tile or a progress line shown in half. In
 * the page.
 */
function edgeCutIn(): string[] {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      !el.closest(".sr-only") &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  };
  const named = (el: Element) =>
    `${el.tagName.toLowerCase()}.${[...el.classList][0] ?? ""}`;
  /** Every line drawn: each line of words, each tile, each progress line. */
  const linesIn = () => {
    const lines: { el: Element; what: string; r: DOMRect }[] = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const holder = node.parentElement;
      if (!(holder && (node.textContent ?? "").trim() && shown(holder))) {
        continue;
      }
      range.selectNodeContents(node);
      const what = `"${(node.textContent ?? "").trim().slice(0, 40)}" in ${named(holder)}`;
      for (const r of range.getClientRects()) {
        lines.push({ el: holder, what, r });
      }
    }
    for (const one of document.querySelectorAll<HTMLElement>(
      '[data-tile], [data-slot="progress-line"]'
    )) {
      if (shown(one)) {
        const what = one.dataset.tile
          ? `tile ${one.dataset.tile}`
          : "progress line";
        lines.push({
          el: one,
          what: `the ${what}`,
          r: one.getBoundingClientRect(),
        });
      }
    }
    return lines;
  };
  const lines = linesIn();
  // Every box that clips or scrolls what it holds, and where it stands.
  const clippers = new Map<Element, DOMRect>();
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    if (getComputedStyle(el).overflowY !== "visible" && shown(el)) {
      clippers.set(el, el.getBoundingClientRect());
    }
  }
  /** What of a line the clipping boxes inside `outer` leave in sight. */
  const seenIn = (outer: Element, one: Element, r: DOMRect) => {
    let { top, bottom } = r;
    for (
      let at: Element | null = one;
      at && at !== outer;
      at = at.parentElement
    ) {
      const clip = clippers.get(at);
      if (clip) {
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    return { top, bottom };
  };
  // A line's box overshoots its element's by a glyph's ascent at most: an
  // edge further inside it than this runs through it.
  const through = (edge: number, r: { top: number; bottom: number }) =>
    r.top + 3 < edge && r.bottom - 3 > edge;
  const cut: string[] = [];
  for (const [el, box] of clippers) {
    const crossed = lines
      .filter(({ el: one, r }) => r.width > 0 && el !== one && el.contains(one))
      .map((line) => ({ ...line, seen: seenIn(el, line.el, line.r) }))
      .find(({ seen }) => through(box.top, seen) || through(box.bottom, seen));
    if (crossed) {
      const at = through(box.top, crossed.seen) ? "top" : "foot";
      cut.push(
        `${crossed.what} cut by the ${at} of ${named(el)} (${Math.round(box.top)}–${Math.round(box.bottom)}), the line ${Math.round(crossed.seen.top)}–${Math.round(crossed.seen.bottom)} in sight`
      );
    }
  }
  return cut;
}

type Facts = ReturnType<typeof frameFacts> & {
  crossings: string[];
  cut: string[];
};

/** The plan card's lead, its recommended option, and each option's chip and drawing on the page. */
function pageFacts() {
  const card = document.querySelector<HTMLElement>("#decision-plan");
  const recommended = card
    ?.querySelector(".dp-tag")
    ?.closest<HTMLElement>("[data-option]");
  const label =
    recommended?.querySelector("b > :not(.dp-kc)")?.textContent?.trim() ?? "";
  const cells = [
    ...(card?.querySelectorAll<HTMLElement>(".dp-optcell") ?? []),
  ].map((cell) => {
    const c = cell.getBoundingClientRect();
    const chip = cell.querySelector(".dp-opt")?.getBoundingClientRect();
    const media = cell
      .querySelector(".dp-optmedia iframe")
      ?.getBoundingClientRect();
    return {
      option:
        cell.querySelector<HTMLElement>("[data-option]")?.dataset.option ?? "",
      chip: chip ? Math.round(chip.bottom + scrollY) : 0,
      drawing: media ? Math.round(media.top + scrollY) : 0,
      gap: chip && media ? Math.round(media.top - chip.bottom) : -1,
      inCell: !!media && media.left >= c.left - 1 && media.right <= c.right + 1,
      tall: media ? Math.round(media.height) : 0,
    };
  });
  return {
    lead: card?.querySelector(".dp-why")?.textContent?.trim() ?? "",
    label,
    cells,
    height: document.documentElement.scrollHeight,
  };
}

/** The cards as the person reads them. */
function cardsOf() {
  return [...document.querySelectorAll<HTMLElement>(".dp-card")].map(
    (card) => ({
      question: card.querySelector("h2")?.textContent?.trim() ?? "",
      why: card.querySelector(".dp-why")?.textContent?.trim() ?? "",
      options: [...card.querySelectorAll<HTMLElement>("[data-option]")].map(
        (option) => ({
          id: option.dataset.option ?? "",
          text: option.innerText.replace(/\s+/g, " ").trim(),
          recommended: option.querySelector(".dp-tag") !== null,
        })
      ),
    })
  );
}

/** What each embed's own frame shows, by its states file and the stories it names. */
async function readFrames(page: Page): Promise<Map<string, Facts>> {
  const facts = new Map<string, Facts>();
  for (const handle of await page.$$(EMBED_FRAME)) {
    await handle.scrollIntoViewIfNeeded();
    const src = new URL((await handle.getAttribute("src")) ?? "");
    const key = `${(src.searchParams.get("file") ?? "").split("/").at(-1)}:${src.searchParams.getAll("story").join(",")}`;
    const frame = await handle.contentFrame();
    if (frame) {
      facts.set(key, {
        ...(await frame.evaluate(frameFacts)),
        crossings: await frame.evaluate(crossingsIn),
        cut: [
          ...(await frame.evaluate(sideCutIn)),
          ...(await frame.evaluate(edgeCutIn)),
        ],
      });
    }
  }
  return facts;
}

const way = (file: string) => `${file}.stories.ts:Device`;
/** The pins section's drawings, one per fix. */
const PIN = {
  opened: "CrewFirst.stories.ts:Opened",
  badge: "CrewFirst.stories.ts:Badge",
  pulse: "CrewFirst.stories.ts:Pulse",
} as const;
const WAYS = ["OneList", "Lanes", "CrewFirst"] as const;

/** The checks one leg reads off its embeds' frames. */
function frameChecks(
  leg: string,
  view: "desk" | "phone",
  facts: Map<string, Facts>,
  check: (name: string, passed: boolean, output: string) => void
): void {
  const want = view === "desk" ? "desk" : "phone";
  const kinds = WAYS.map(
    (one) => `${one} ${facts.get(way(one))?.kinds.join("+") || "nothing"}`
  );
  check(
    `${leg}: each option draws one frame, the one this screen shows, the ${want}'s (${kinds.join(", ")})`,
    WAYS.every((one) => facts.get(way(one))?.kinds.join() === want),
    kinds.join("\n    ")
  );
  const bands = facts.get(way("Lanes"))?.bands ?? [];
  const sideBySide = bands.filter(
    (band) =>
      band.length > 1 &&
      band.every((one) => Math.abs(one.top - (band[0]?.top ?? 0)) <= 2) &&
      new Set(band.map((one) => one.left)).size === band.length
  );
  check(
    `${leg}: Lanes stands the steps that run at the same time side by side (${bands.map((band) => `${band.length} columns at x ${band.map((one) => one.left).join(", ")}, tops ${band.map((one) => one.top).join(", ")}`).join("; ") || "no band"})`,
    bands.length > 0 && sideBySide.length === bands.length,
    JSON.stringify(bands)
  );
  const all = [...facts.entries()];
  const crossings = all.flatMap(([key, one]) =>
    one.crossings.map((c) => `${key}: ${c}`)
  );
  check(
    `${leg}: no line crosses a box, in any drawing (${all.reduce((n, [, one]) => n + one.crossings.length, 0)} crossings)`,
    crossings.length === 0,
    crossings.slice(0, 8).join("\n    ") || "none"
  );
  const cut = all.flatMap(([key, one]) => one.cut.map((c) => `${key}: ${c}`));
  check(
    `${leg}: no words are cut without an ellipsis, in any drawing`,
    cut.length === 0,
    cut.slice(0, 8).join("\n    ") || "none"
  );
  const squeezed = all.flatMap(([key, one]) =>
    one.squeezed.map((m) => `${key}: ${m}`)
  );
  check(
    `${leg}: every row's words have at least 64px of room, in every drawing (${squeezed.length} squeezed)`,
    squeezed.length === 0,
    squeezed.slice(0, 8).join("\n    ") || "none"
  );
  const moving = all.flatMap(([key, one]) =>
    one.moving.map((m) => `${key}: ${m}`)
  );
  check(
    `${leg}: every row in every drawing stands at its place when read, no slide held on it (${moving.length} off their places)`,
    moving.length === 0,
    moving.slice(0, 8).join("\n    ") || "none"
  );
  pinChecks(leg, facts, check);
}

/** The checks one leg reads off the pins section's drawings. */
function pinChecks(
  leg: string,
  facts: Map<string, Facts>,
  check: (name: string, passed: boolean, output: string) => void
): void {
  const opened = facts.get(PIN.opened)?.opened ?? false;
  check(
    `${leg}: the pins section's first fix draws the date picker opened to its description (${opened ? "open" : "shut"})`,
    opened,
    JSON.stringify({ opened })
  );
  const badges = facts.get(PIN.badge)?.badges ?? [];
  const [badge] = badges;
  check(
    `${leg}: the pins section's second fix draws the to-do that became a task wearing the task's glyph and id, in sight (${badge ? `${badge.glyph ? "glyph" : "no glyph"} ${badge.id || "no id"}${badge.inSight ? " in sight" : " out of sight"}` : "no badge"})`,
    !!badge && badge.glyph && TASK_ID.test(badge.id) && badge.inSight,
    JSON.stringify(badges)
  );
  const sweeps = facts.get(PIN.pulse)?.sweeps ?? [];
  check(
    `${leg}: the pins section's third fix draws the pulse at three named moments, its band at 10%, 50% and 90% of the fill (${sweeps.map((one) => `${one.label || "unnamed"} ${Math.round(one.centre * 100)}%`).join(", ") || "none"})`,
    sweeps.length === MOMENTS.length &&
      MOMENTS.every(
        (moment, i) =>
          sweeps[i]?.label === moment.label &&
          Math.abs((sweeps[i]?.centre ?? -1) - moment.centre) <= 0.02
      ),
    JSON.stringify(sweeps)
  );
}

/** The pins section as the page draws it: its heading, its first line, its drawings, and no pick in it. */
function pinsFacts(title: string) {
  const section = [...document.querySelectorAll<HTMLElement>("section")].find(
    (one) => one.querySelector("h2")?.textContent?.trim() === title
  );
  const words = [...(section?.querySelectorAll<HTMLElement>("p") ?? [])].map(
    (one) => one.textContent?.trim() ?? ""
  );
  return {
    found: !!section,
    first: words[0] ?? "",
    quotes: [
      ...(section?.querySelectorAll<HTMLElement>('p[data-role="label"]') ?? []),
    ].map((one) => one.textContent?.trim() ?? ""),
    drawings: section?.querySelectorAll("iframe").length ?? 0,
    picks: section?.querySelectorAll("[data-option], .dp-card").length ?? 0,
    pinsCard: !!document.querySelector("#decision-pins"),
  };
}

/** The page's capture into .probe/decision-pages, and its two checks: files a delegate can hand over, every embed painted. */
async function captured(
  page: Page,
  leg: string,
  at: string,
  check: (name: string, passed: boolean, output: string) => void
) {
  const capture = await capturePage(page, join(OUT, `${NAME}-${at}.png`));
  const { paints } = capture;
  const faults = captureFaults(capture);
  check(
    `${leg}: the page's capture is files a delegate can hand over, each RGB and at most ${FOLDER_FILE_LIMIT / 1024 / 1024} MiB, its whole picture pixel for pixel (${capture.files.map((f) => `${basename(f.path)} ${(f.bytes / 1024).toFixed(0)} KiB, rows ${f.rows.from}–${f.rows.to}`).join(", ")}; ${capture.picture.width}×${capture.picture.height})`,
    capture.files.length > 0 && faults.length === 0,
    faults.join("\n    ") || "every file whole and within the limit"
  );
  const blank = blankEmbeds(paints);
  check(
    `${leg}: the page's own capture paints every embed (${paints.map((one) => `${Math.round(one.flat * 1000) / 10}%`).join(", ")} their commonest colour)`,
    paints.length === PREVIEWS.length && blank.length === 0,
    blank.join("\n    ") ||
      `${paints.length} of ${PREVIEWS.length} embeds painted`
  );
  return capture;
}

const spec: Spec = {
  name: "decision-plan-steps",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(SHOTS, { recursive: true });
    const checks: Checked[] = [];
    const check = (name: string, passed: boolean, output: string) => {
      checks.push({ check: name, passed, output });
      kit.check(name, passed, output);
    };

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    check(
      "the hub's check keeps the program",
      refusal === "",
      refusal || "kept"
    );

    const stage = await startDecisionStage(
      new Map([[NAME, PROGRAM]]),
      CANVASES
    );
    const legs: Record<string, unknown> = {};
    let cards: unknown = [];
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const size = view === "desk" ? "1440" : "390";
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );
          await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
          await page.waitForSelector(".dp-card", { timeout: 30_000 });
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: PREVIEWS.length, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(SHOTS, `${size}-${theme}`)
          );
          const named = (e: Embed) => e.named.join(",");
          const drawn = [
            ...embeds.flatMap((e) => embedDrawFaults(e)),
            ...undrawn,
          ];
          check(
            `${leg}: every embed draws the stories its Preview names (${embeds.map((e) => `${e.file} ${e.frames.map((f) => `${f.story} ${f.state}`).join(" + ") || "none"}`).join("; ")})`,
            embeds.map(named).sort().join("|") ===
              [...PREVIEWS].sort().join("|") && drawn.length === 0,
            drawn.join("\n    ") ||
              `${embeds.length} of ${PREVIEWS.length} embeds, each its named stories drawn`
          );

          const at = await page.evaluate(pageFacts);
          const lead = `Recommended: ${at.label}, because `;
          check(
            `${leg}: the plan card's lead opens "${lead}…"`,
            at.label !== "" && at.lead.startsWith(lead),
            at.lead
          );
          check(
            `${leg}: each option's drawing stands right under its own chip (${at.cells.map((one) => `${one.option} ${one.gap}px under`).join(", ")}; the page ${at.height}px tall)`,
            at.cells.length === 3 &&
              at.cells.every(
                (one) => one.gap >= 0 && one.gap <= 80 && one.inCell
              ),
            JSON.stringify(at.cells)
          );

          const pins = await page.evaluate(pinsFacts, PINS_TITLE);
          check(
            `${leg}: "${PINS_TITLE}" is a section with no pick, its first line "${PINS_LEAD}", ${pins.quotes.length} pins quoted, ${pins.drawings} drawings`,
            pins.found &&
              pins.first === PINS_LEAD &&
              pins.quotes.length === 4 &&
              pins.drawings === 3 &&
              pins.picks === 0 &&
              !pins.pinsCard,
            JSON.stringify(pins)
          );

          const facts = await readFrames(page);
          frameChecks(leg, view, facts, check);

          check(
            `${leg}: no console errors, the page and its canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ") || "none"
          );
          const sideways = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            view: innerWidth,
          }));
          check(
            `${leg}: nothing scrolls the page sideways (${sideways.scroll} wide in ${sideways.view})`,
            sideways.scroll <= sideways.view,
            `${sideways.scroll}px of content in a ${sideways.view}px view`
          );

          cards = await page.evaluate(cardsOf);
          const capture = await captured(page, leg, `${size}-${theme}`, check);
          legs[leg] = {
            height: at.height,
            options: at.cells,
            files: capture.files.map((one) => one.path.replace(`${ROOT}/`, "")),
            embeds: embeds.map((e) => ({
              file: e.file,
              named: e.named,
              box: e.box,
              tall: e.tall,
              frames: e.frames,
            })),
            frames: Object.fromEntries(facts),
          };
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    writeFileSync(
      join(OUT, `${NAME}-manifest.json`),
      `${JSON.stringify({ page: NAME, cards, legs, checks }, null, 2)}\n`
    );
  },
};

export default spec;
