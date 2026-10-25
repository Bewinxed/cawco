/**
 * The project page cuts no label and stacks no header on another, at every
 * width from a phone's 320 to a desk's 1440, on a scratch fleet in the built
 * dashboard (the live audit's defects, report 0b676ac6 §4: the view tabs cut
 * to "Tab…" at 900 and "Canvas" at 1100, a card's tag badges cut by the
 * split beside the open task at 1100, the rail's "Finished 39" drawn over
 * "Working 1", the usage strip's "45m" cut 1px).
 *
 * The project is a working one: thirty tasks across its stages, two and
 * three tags each (`ready-for-agent`, `apple`, `bug`…, one tag longer than
 * a card), some after others (the Canvas tab), some set for a date
 * (Calendar), some that made something (Made), so the strip holds every
 * view; the rail holds one session working and a dozen finished, two-digit
 * counts; every answer carries the account's usage, so the usage strip says
 * its time. On Chromium and WebKit, at 320, 390, 680, 900, 1100 and 1440,
 * the board alone and with a task open (beside the board from 900, its own
 * page under it), and from 900 the board with the rail dragged to 216 and
 * 248 (where Working/Finished squeeze) and 420 (from 1100: under it the
 * widest rail leaves the strip no room for its own actions, a finding
 * apart), Finished chosen, read from the engine:
 *
 *  0. The page stands: its words read, its cards drawn, no error thrown.
 *  1. Every text node's range rects against every ancestor that clips it
 *     (overflow other than visible, clip-path, paint containment), walked by
 *     containing block, each clip cutting what the ones inside it left: no
 *     rect part shown and part cut, totalling zero cut labels. Not counted:
 *     text that ends in its own ellipsis or line clamp (DESIGN.md, The
 *     Truncate Inside Rule), and content a scroller has scrolled past along
 *     the axis it scrolls with the box it is drawn in (a column's cards
 *     under its foot, the sideways board), except a tab strip's, where a tab
 *     cut at rest is a cut label whatever scrolls it, and a tab's own
 *     ellipsis is one too, but for Working and Finished with the rail at its
 *     narrowest (216), where their labels give way by design (TabsList's
 *     `work` strip): said as a note there. Each card's tags stand
 *     inside the card. From 900, the usage strip says its time, and how far
 *     its glyphs reach above their line (what its clip had cut).
 *  2. No two header boxes overlap: within each tab strip, no tab's words
 *     over another's, and no tab's words or count under the sheet of a
 *     folder tab drawn over it; and the page's heads (the rail's head, the
 *     bar, the project's head, the view strip, a column's head, the task's
 *     head) each clear of the others, as drawn.
 *  3. Wherever the strip stands (640 and wider), its actions are toolbar
 *     items (DESIGN.md, Title bars follow Liquid Glass): the group drawn
 *     compact, no word of theirs drawn, none with a fill, edge or shadow
 *     of its own at rest, each named in its tooltip; it
 *     stands as many views as tabs as fit beside them, the rest in the ⋯,
 *     which says its views' count where one of them has one, as a Needs
 *     you mark (the attn badge: its Status dot before the figure in
 *     status-attn-ink, no fill; its name says "needs you") (a decision
 *     page waiting on picks makes Decisions' 1; JOURNEY.md, every view with
 *     something in it shows its count in the first view) (`stripFills`);
 *     from 900, with the rail where it rests, the chosen view is a tab (the
 *     owner: at 900 it showed only the ⋯). The overflow sweep
 *     (journeys/scan.ts) totals zero there.
 *  4. The project's head is one row at every width (DESIGN.md, The Title
 *     Bars Follow Liquid Glass Rule: "One bar, one row"): the name on one
 *     line, every control's centre within 1px of the row's, nothing
 *     wrapped; nothing in it on the coral (`action-surface`); its place and
 *     its capsule's items bare symbols, each named for a screen reader and,
 *     where a pointer rests (640 and wider), in its tooltip; under 640px the
 *     capsule holds More alone. The overflow sweep totals zero on the board
 *     at every width.
 *
 *   bun scripts/probe-kit/run.ts web project-clipped
 *   PROBE_CLIPPED_ENGINES=chromium bun scripts/probe-kit/run.ts web project-clipped
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one width at a time
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { commonWords } from "../../../../packages/core/src/words/common";
import { projectWords } from "../../../../packages/core/src/words/project";
import { viewsWords } from "../../../../packages/core/src/words/views";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { scan } from "../../journeys/scan";
import { type Engine, type Kit, open, type Spec, settle } from "../../kit";

const WORK = "WORK";
/** The account's usage on every answer: its 5-hour window back in 45 minutes (the usage strip's "45m"). */
const limits = (): Reply["limits"] => ({
  fiveHour: { resetsAt: Date.now() + 45 * 60_000, utilization: 0.62 },
  sevenDay: { resetsAt: Date.now() + 4 * 86_400_000, utilization: 0.31 },
});
const respond = (request: Seen): Reply =>
  request.tools && request.last.includes(WORK)
    ? {
        words: Array.from({ length: 600 }, (_, i) => `step ${i + 1}. `),
        everyMs: 500,
        limits: limits(),
      }
    : { words: ["Done."], everyMs: 20, limits: limits() };

const WIDTHS = (
  process.env.PROBE_CLIPPED_WIDTHS ?? "320,390,680,900,1037,1100,1440"
)
  .split(",")
  .map(Number);
const ENGINES: Engine[] = (
  process.env.PROBE_CLIPPED_ENGINES ?? "chromium,webkit"
).split(",") as Engine[];
const FINISHED = Number(process.env.PROBE_CLIPPED_FINISHED ?? 12);
/** The rail's narrowest and a wide drag (Shell's RAIL_MIN, toward its RAIL_MAX). */
const RAIL_MIN = 216;
const RAILS = [RAIL_MIN, 248, 420] as const;
/** Under this window the widest rail leaves the page too little for the strip's own actions (a finding, not this spec's). */
const WIDE_RAIL_FROM = 1100;

const TAGS = [
  ["ready-for-agent", "apple", "bug"],
  ["waiting-on-the-app-store-review-team", "apple"],
  ["apple", "bug"],
  ["ready-for-agent", "design"],
  ["bug", "needs-review", "apple"],
  ["infrastructure", "ready-for-agent"],
];
const TITLES = [
  "Tide tables read the harbour feed in GMT",
  "Calendar shows all fourteen sessions",
  "Push the release notes to the landing page",
  "Fix the widget's timezone on the lock screen",
  "Sync the tracker when a task moves",
  "Draw the tide curve on the watch face",
  "Check the push certificate before it expires",
  "Rename the export menu",
  "Move the settings into one sheet",
  "Cache the feed for an offline morning",
];
const TASKS = 30;

interface Setup {
  url: string;
}

const setUp = async (kit: Kit): Promise<Setup> => {
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
  const src = join(fleet.sandbox, "tidewater");
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && git remote add origin https://github.com/probe/tidewater.git && echo t > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Tidewater",
    machineId: MACHINE,
    cwd: src,
  });
  const stages = await fleet.api<{
    stages: { kind: string; name: string }[];
  }>(`/api/projects/${project.id}/stages`);
  const placed = stages.stages
    .filter((stage) => stage.kind !== "dropped")
    .map((stage) => stage.name);
  for (let n = 1; n <= TASKS; n += 1) {
    const day = String(1 + (n % 27)).padStart(2, "0");
    await fleet.api(`/api/projects/${project.id}/tasks`, {
      title: `${TITLES[n % TITLES.length]}${n > TITLES.length ? ` (${n})` : ""}`,
      stage: placed[n % placed.length],
      labels: TAGS[n % TAGS.length],
      ...(n > 3 && n % 4 === 0 ? { after: [`tsk-${n - 3}`] } : {}),
      ...(n % 5 === 0 ? { fields: { due: `2026-11-${day}` } } : {}),
      ...(n % 7 === 0 ? { outputs: ["notes.md"] } : {}),
      ...(n % 3 === 0 ? { todos: ["Read the feed", "Write the table"] } : {}),
    });
  }
  // A decision page waiting on picks: Decisions' count, the ⋯'s once
  // Decisions is in it.
  const writer = await fleet.spawn("claude", "Pick the tide source", src, {
    projectId: project.id,
  });
  await fleet.api(`/api/instances/${writer}/artifacts`, {
    kind: "page",
    does: "pick",
    ask: "Pick the tide source",
    name: "tide-source",
    program: `root = Decisions("Tide source", [feed])
feed = Decision("feed", "Which feed do the tide tables read?", [harbour, admiralty], "The harbour feed is in GMT.")
harbour = Option("harbour", "The harbour's own feed", "Local, every six minutes.", true, [], "Its times are GMT.")
admiralty = Option("admiralty", "The admiralty tables", "Published a year ahead.", false, [], "No live readings.")`,
  });
  // The rail: one session working, a dozen finished (two-digit counts).
  const working = await fleet.spawn("claude", "Tide feed rework", src);
  await fleet.send(working, `${WORK} for a while.`);
  const finished: string[] = [];
  for (let n = 1; n <= FINISHED; n += 1) {
    const id = await fleet.spawn("claude", `Finished session ${n}`, src);
    await fleet.send(id, "Say done.");
    finished.push(id);
  }
  const turns = () =>
    finished.map(
      (id) =>
        fleet.query<{ turn_open_at: number | null }>(
          "SELECT turn_open_at FROM instances WHERE id = ?",
          id
        )[0]
    );
  await until(
    "every short session's turn ended",
    turns,
    (rows) => rows.every((row) => row && !row.turn_open_at),
    180_000
  );
  const base = await fleet.dashboard();
  return { url: `${base}/project/${project.id}` };
};

interface Cut {
  axis: "x" | "y";
  by: string;
  lost: number;
  text: string;
  where: string;
}
interface Overlap {
  a: string;
  b: string;
  by: number;
}
interface Read {
  /** The task cards drawn, and how many words it read: what a pass stands on. */
  cards: number;
  cuts: Cut[];
  /** The usage strip's time, and how far its glyphs reach above its 16px line. */
  digits: { above: number; text: string } | null;
  overlaps: Overlap[];
  read: number;
  scrolled: string[];
  /** Tag badges standing past their card's edge. */
  spills: string[];
  truncated: string[];
}

/**
 * Every cut label and every overlapping header on the page as drawn. One
 * function serialized into the page, everything it needs inside it.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page
function readPage(giveWay: boolean): Read {
  const SLACK = 0.5;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const PAINT = /paint|strict|content/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const CONTAINS = /paint|layout|strict|content/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const WILL_HOLD = /transform|filter|perspective/;
  interface Box {
    bottom: number;
    left: number;
    right: number;
    top: number;
  }
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let known = styles.get(el);
    if (!known) {
      known = getComputedStyle(el);
      styles.set(el, known);
    }
    return known;
  };
  const shown = (el: Element): boolean => {
    for (let up: Element | null = el; up; up = up.parentElement) {
      const s = style(up);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.visibility === "collapse" ||
        Number(s.opacity) === 0 ||
        s.contentVisibility === "hidden"
      ) {
        return false;
      }
    }
    return true;
  };
  const clips = (s: CSSStyleDeclaration) =>
    s.overflowX !== "visible" ||
    s.overflowY !== "visible" ||
    s.clipPath !== "none" ||
    PAINT.test(s.contain);
  const holdsFixed = (s: CSSStyleDeclaration) =>
    s.transform !== "none" ||
    s.filter !== "none" ||
    s.perspective !== "none" ||
    (s.backdropFilter ?? "none") !== "none" ||
    CONTAINS.test(s.contain) ||
    WILL_HOLD.test(s.willChange);
  const clippers = (el: Element): Element[] => {
    const list: Element[] = [];
    let { position } = style(el);
    for (
      let up = el.parentElement;
      up && up !== document.documentElement && up !== document.body;
      up = up.parentElement
    ) {
      const s = style(up);
      let holds = true;
      if (position === "fixed") {
        holds = holdsFixed(s);
      } else if (position === "absolute") {
        holds = s.position !== "static" || holdsFixed(s);
      }
      if (holds) {
        if (clips(s)) {
          list.push(up);
        }
        ({ position } = s);
      }
    }
    return list;
  };
  const inner = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    const own = el as HTMLElement;
    const sx = own.offsetWidth > 0 ? r.width / own.offsetWidth : 1;
    const sy = own.offsetHeight > 0 ? r.height / own.offsetHeight : 1;
    const s = style(el);
    const left = r.left + el.clientLeft * sx;
    const top = r.top + el.clientTop * sy;
    return {
      left: s.overflowX === "visible" ? r.left : left,
      top: s.overflowY === "visible" ? r.top : top,
      right: s.overflowX === "visible" ? r.right : left + el.clientWidth * sx,
      bottom: s.overflowY === "visible" ? r.bottom : top + el.clientHeight * sy,
    };
  };
  /** `box` as drawn: cut by every clip in `by`, or null where none of it shows. */
  const seen = (box: Box, by: Element[]): Box | null => {
    let r = box;
    for (const clip of by) {
      const c = inner(clip);
      r = {
        left: Math.max(r.left, c.left),
        top: Math.max(r.top, c.top),
        right: Math.min(r.right, c.right),
        bottom: Math.min(r.bottom, c.bottom),
      };
      if (r.right - r.left <= SLACK || r.bottom - r.top <= SLACK) {
        return null;
      }
    }
    return r;
  };
  const name = (el: Element) => {
    const slot = el.getAttribute("data-slot");
    const cls = [...el.classList].slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""}${!slot && cls ? `.${cls}` : ""}`;
  };
  const path = (el: Element) => {
    const parts: string[] = [];
    for (
      let up: Element | null = el;
      up && up !== document.body && parts.length < 4;
      up = up.parentElement
    ) {
      parts.unshift(name(up));
    }
    return parts.join(" > ");
  };
  const words = (text: string) => {
    const one = text.replace(/\s+/g, " ").trim();
    return one.length > 40 ? `${one.slice(0, 38)}…` : one;
  };
  /** Text its own box truncates by design: an ellipsis or a line clamp. */
  const truncates = (el: Element) => {
    const s = style(el);
    return (
      s.textOverflow === "ellipsis" ||
      (s.getPropertyValue("-webkit-line-clamp") || "none") !== "none"
    );
  };
  /** Room to scroll on `axis`: what a scroller cuts there is scrolled, not cut. */
  const scrolls = (el: Element, axis: "x" | "y") => {
    const s = style(el);
    const o = axis === "x" ? s.overflowX : s.overflowY;
    if (!(o === "auto" || o === "scroll")) {
      return false;
    }
    return axis === "x"
      ? el.scrollWidth > el.clientWidth + 1
      : el.scrollHeight > el.clientHeight + 1;
  };

  /** The block the words are drawn in: the nearest one with a fill, an edge or a shadow. */
  const holderOf = (el: Element, within: Element): Element | null => {
    for (
      let up: Element | null = el;
      up && up !== within;
      up = up.parentElement
    ) {
      const s = style(up);
      const painted =
        (s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          s.backgroundColor !== "transparent") ||
        s.boxShadow !== "none" ||
        (Number.parseFloat(s.borderTopWidth) > 0 &&
          s.borderTopStyle !== "none");
      if (painted && !s.display.startsWith("inline")) {
        return up;
      }
    }
    return null;
  };
  /** The words' own block is cut by `clip` on `axis` too: scrolled, not spilled. */
  const scrolledWith = (el: Element, clip: Element, axis: "x" | "y") => {
    const holder = holderOf(el, clip);
    if (!holder) {
      return true;
    }
    const h = holder.getBoundingClientRect();
    const c = inner(clip);
    return axis === "x"
      ? h.left < c.left - SLACK || h.right > c.right + SLACK
      : h.top < c.top - SLACK || h.bottom > c.bottom + SLACK;
  };
  const cuts: Cut[] = [];
  const scrolled = new Set<string>();
  let read = 0;
  const truncated: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (
      !(parent && text.data.trim()) ||
      parent.closest("script, style, noscript, template, svg, .sr-only") ||
      !shown(parent)
    ) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = [...range.getClientRects()].filter(
      (r) => r.width > SLACK && r.height > SLACK
    );
    if (rects.length === 0) {
      continue;
    }
    const own = clips(style(parent)) ? [parent] : [];
    const by = [...own, ...clippers(parent)];
    const chrome = parent.closest('[role="tablist"]') !== null;
    read += 1;
    for (const rect of rects) {
      // Wholly cut away somewhere (scrolled off, folded shut): not drawn.
      if (seen(rect, by) === null) {
        continue;
      }
      // Each clip, nearest first, cuts what the ones inside it left: a cut
      // is said once, by the box that made it.
      let r: Box = rect;
      for (const clip of by) {
        const c = inner(clip);
        const x = Math.max(0, c.left - r.left) + Math.max(0, r.right - c.right);
        const y = Math.max(0, c.top - r.top) + Math.max(0, r.bottom - c.bottom);
        for (const [axis, lost] of [
          ["x", x],
          ["y", y],
        ] as const) {
          if (lost <= SLACK) {
            continue;
          }
          // Its own ellipsis or clamp (on its box or the block it ends in):
          // the design's truncation, said apart; a tab's is a cut tab, but
          // for Working and Finished on the rail at its narrowest, whose
          // labels give way inside their ellipsis there by design
          // (TabsList's `work` strip, DESIGN.md "the name gives way first").
          if (
            truncates(clip) &&
            (!chrome || (giveWay && parent.closest("[data-work-tabs]")))
          ) {
            truncated.push(`“${words(text.data)}” (${path(parent)})`);
            continue;
          }
          // Content a scroller has scrolled past, on the axis it scrolls:
          // the box the words are drawn in is past the edge with them.
          // Words that ran out of their own box (a tag wider than its card)
          // are cut whatever scrolls them.
          if (
            !chrome &&
            scrolls(clip, axis) &&
            scrolledWith(parent, clip, axis)
          ) {
            scrolled.add(`“${words(text.data)}” past ${name(clip)}`);
            continue;
          }
          cuts.push({
            text: words(text.data),
            where: path(parent),
            by: `${path(clip)} (overflow ${style(clip).overflowX}/${style(clip).overflowY}, ${Math.round(c.right - c.left)}×${Math.round(c.bottom - c.top)})`,
            axis,
            lost: Math.round(lost * 10) / 10,
          });
        }
        r = {
          left: Math.max(r.left, c.left),
          top: Math.max(r.top, c.top),
          right: Math.min(r.right, c.right),
          bottom: Math.min(r.bottom, c.bottom),
        };
      }
    }
  }

  // Headers: within each tab strip, each tab's words; and the page's heads.
  const overlaps: Overlap[] = [];
  const meet = (a: Box, b: Box) =>
    Math.max(
      0,
      Math.min(
        Math.min(a.right, b.right) - Math.max(a.left, b.left),
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      )
    ) *
    (Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
      ? 1
      : 0);
  const textBoxes = (el: Element): Box[] => {
    const boxes: Box[] = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (
        !(p && (n as Text).data.trim()) ||
        p.closest(".sr-only") ||
        !shown(p)
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(n);
      const by = [...(clips(style(p)) ? [p] : []), ...clippers(p)];
      for (const r of range.getClientRects()) {
        const drawn = seen(r, by);
        if (drawn) {
          boxes.push(drawn);
        }
      }
    }
    return boxes;
  };
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    if (!shown(list)) {
      continue;
    }
    const tabs = [...list.querySelectorAll('[data-slot="ff-tab"]')].filter(
      shown
    );
    /** Where a tab stacks: folder tabs overlap, the higher drawn over the lower. */
    const rank = (tab: Element) => Number(style(tab).zIndex) || 0;
    for (const [i, a] of tabs.entries()) {
      for (const b of tabs.slice(i + 1)) {
        let most = 0;
        for (const x of textBoxes(a)) {
          for (const y of textBoxes(b)) {
            most = Math.max(most, meet(x, y));
          }
        }
        // The lower tab's words and counts under the higher tab's sheet
        // (its box): folder tabs overlap, the chosen one drawn over all.
        const [under, over] = rank(a) < rank(b) ? [a, b] : [b, a];
        if (rank(a) !== rank(b)) {
          const sheet = over.getBoundingClientRect();
          const marks = [
            ...under.querySelectorAll(
              '[data-slot="count"], [data-slot="badge"]'
            ),
          ].map((mark) => mark.getBoundingClientRect());
          for (const x of [...textBoxes(under), ...marks]) {
            most = Math.max(most, meet(x, sheet));
          }
        }
        if (most > SLACK) {
          overlaps.push({
            a: `tab “${words(over.textContent ?? "")}”`,
            b: `tab “${words(under.textContent ?? "")}”`,
            by: Math.round(most * 10) / 10,
          });
        }
      }
    }
  }
  const heads = [
    ...document.querySelectorAll(
      '[data-slot="head"], [data-slot="strip"], [data-slot="project-head"], header'
    ),
  ].filter((el) => shown(el) && el.getBoundingClientRect().width > 0);
  for (const [i, a] of heads.entries()) {
    for (const b of heads.slice(i + 1)) {
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const x = seen(a.getBoundingClientRect(), clippers(a));
      const y = seen(b.getBoundingClientRect(), clippers(b));
      const most = x && y ? meet(x, y) : 0;
      if (most > SLACK) {
        overlaps.push({
          a: path(a),
          b: path(b),
          by: Math.round(most * 10) / 10,
        });
      }
    }
  }
  return {
    cuts,
    overlaps,
    cards: document.querySelectorAll("[data-task-card]").length,
    // A card's tags stand inside the card, whatever scrolls the card.
    spills: [...document.querySelectorAll("[data-task-card]")].flatMap(
      (card) => {
        const c = card.getBoundingClientRect();
        return [...card.querySelectorAll('[data-slot="badge"]')].flatMap(
          (badge) => {
            const b = badge.getBoundingClientRect();
            const past = Math.max(c.left - b.left, b.right - c.right);
            return past > SLACK
              ? [
                  `“${words(badge.textContent ?? "")}” ${Math.round(past * 10) / 10}px past its card ${card.getAttribute("data-task")}`,
                ]
              : [];
          }
        );
      }
    ),
    digits: (() => {
      // The usage strip's time, and how far its glyphs reach above its line.
      const el = document.querySelector("[data-strip-digits]");
      const line = el?.parentElement;
      if (!(el && line && shown(el) && el.textContent?.trim())) {
        return null;
      }
      const range = document.createRange();
      range.selectNodeContents(el);
      const top = Math.min(...[...range.getClientRects()].map((r) => r.top));
      return {
        text: el.textContent.trim(),
        above: Math.round((line.getBoundingClientRect().top - top) * 10) / 10,
      };
    })(),
    read,
    scrolled: [...scrolled],
    truncated: [...new Set(truncated)],
  };
}

const leg = async (
  kit: Kit,
  { url }: Setup,
  engine: Engine,
  width: number,
  withTask: boolean,
  rail: number | null = null
) => {
  const phone = width <= 390;
  const page: Page = await kit.page(phone ? "phone" : "desk", {
    engine,
    // The rail as dragged (Shell's `cawco-rail-width`), read before the body
    // parses, with Finished chosen (`cawco-home-tab`): the chosen folder tab
    // stands over Working's end.
    init:
      rail === null
        ? []
        : [
            {
              content: `localStorage.setItem("cawco-rail-width", "${rail}"); localStorage.setItem("cawco-home-tab", JSON.stringify("finished"))`,
            },
          ],
  });
  await page.setViewportSize({ width, height: phone ? 844 : 900 });
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => said.push(String(error).slice(0, 300)));
  await open(
    page,
    withTask ? `${url}?task=tsk-1` : url,
    withTask ? "[data-task-card], [data-slot=project-page]" : "[data-task-card]"
  );
  await page.waitForTimeout(600);
  await settle(page, 300);
  const read = await page.evaluate(readPage, rail === RAIL_MIN);
  const tag = `${engine} ${width}${withTask ? " task open" : " board"}${rail === null ? "" : `, rail ${rail}, Finished chosen`}`;
  // The page stands as read: its board drawn (the task its own page under
  // 900), no error thrown.
  const board = !withTask || width >= 900;
  kit.check(
    `${tag}: the page stands (${read.read} words read, ${read.cards} cards, no error)`,
    read.read > 50 && (read.cards > 0 || !board) && said.length === 0,
    `${await page.evaluate(() => `${location.href} “${document.body.innerText.slice(0, 120).replace(/\s+/g, " ")}”`)}; ${said.join(" | ")}`
  );
  kit.check(
    `${tag}: no label cut by a container`,
    read.cuts.length === 0,
    read.cuts
      .slice(0, 8)
      .map(
        (cut) =>
          `“${cut.text}” (${cut.where}) ${cut.lost}px ${cut.axis} by ${cut.by}`
      )
      .join("; ")
  );
  kit.check(
    `${tag}: every card's tags stand inside the card`,
    read.spills.length === 0,
    read.spills.slice(0, 4).join("; ")
  );
  if (width >= 900) {
    kit.check(
      `${tag}: the usage strip says its time (${read.digits?.text ?? "none"}, its glyphs ${read.digits?.above ?? "?"}px above their line)`,
      read.digits !== null
    );
  }
  kit.check(
    `${tag}: no two headers overlap`,
    read.overlaps.length === 0,
    read.overlaps
      .slice(0, 6)
      .map((o) => `${o.a} over ${o.b} by ${o.by}px`)
      .join("; ")
  );
  if (read.scrolled.length > 0) {
    kit.note(
      `${tag}: ${read.scrolled.length} words stand past a scroller's edge with the box they are drawn in (scrolled, not counted): ${read.scrolled.slice(0, 3).join(", ")}`
    );
  }
  if (read.truncated.length > 0) {
    kit.note(
      `${tag}: ${read.truncated.length} words end in their own ellipsis or clamp (not counted): ${read.truncated.slice(0, 4).join(", ")}`
    );
  }
  // The strip stands from 640, over the board (a task under 900 is its own page).
  if (!phone && board) {
    await stripFills(kit, page, tag, width >= 900 && rail === null);
    await viewsMenu(kit, page, tag, !withTask && rail === null);
  }
  await headRow(kit, page, tag, width, withTask || rail !== null);
  await page.close();
};

/**
 * The project's head, read off the engine: its row (the header's box, the
 * title's lines, each control's centre), anything in it on the coral, and
 * its bare symbols (the place, and the capsule's items) with their names.
 */
const readHead = (page: Page) =>
  page.evaluate(() => {
    const head = document.querySelector<HTMLElement>(
      '[data-slot="project-head"]'
    );
    if (!head) {
      return null;
    }
    const shown = (el: Element) =>
      el.checkVisibility({ visibilityProperty: true }) &&
      el.getBoundingClientRect().width > 0;
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (r.top + r.bottom) / 2;
    };
    const title = head.querySelector('[data-slot="title"]');
    const name = head.querySelector<HTMLElement>('[data-slot="name"]');
    const range = document.createRange();
    if (name) {
      range.selectNodeContents(name);
    }
    const lines = new Set(
      [...range.getClientRects()].map((r) => Math.round(r.top))
    ).size;
    const controls = [
      ...head.querySelectorAll<HTMLElement>(
        'button, a[href], [data-slot="tools"]'
      ),
    ].filter(shown);
    const row = mid(head.querySelector('[data-slot="who"]') ?? head);
    // The coral, by its token: what wears its class, or paints its fill
    // (`action-surface` is a gradient: the fill is its background image).
    const probe = document.createElement("div");
    probe.style.backgroundImage = "var(--action-surface)";
    document.body.append(probe);
    const coral = getComputedStyle(probe).backgroundImage;
    probe.remove();
    const onCoral = [head, ...head.querySelectorAll<HTMLElement>("*")]
      .filter(
        (el) =>
          (el.getAttribute("class") ?? "").includes("action-surface") ||
          (coral !== "none" &&
            shown(el) &&
            getComputedStyle(el).backgroundImage === coral)
      )
      .map((el) => el.outerHTML.slice(0, 120));
    const capsule = head.querySelector('[data-slot="tools"]');
    const symbols = [...head.querySelectorAll<HTMLElement>("[data-bar-item]")]
      .filter(shown)
      .map((el) => ({
        name: el.getAttribute("aria-label") ?? "",
        inCapsule: capsule?.contains(el) ?? false,
        words: (el.textContent ?? "").trim(),
        symbol: el.querySelector("svg") !== null,
      }));
    return {
      height: head.getBoundingClientRect().height,
      lines,
      titleTop: title?.getBoundingClientRect().top ?? null,
      off: controls
        .map((el) => ({
          what:
            el.getAttribute("aria-label") ??
            el.dataset.slot ??
            el.textContent?.trim().slice(0, 30) ??
            el.tagName,
          by: Math.round(Math.abs(mid(el) - row) * 10) / 10,
        }))
        .filter((one) => one.by > 1),
      coral,
      onCoral,
      symbols,
    };
  });

/**
 * The project's head is one row (DESIGN.md, The Title Bars Follow Liquid
 * Glass Rule), nothing in it on the coral, and its bare symbols named, each
 * in its tooltip where a pointer rests (640 and wider). Under 640px its
 * capsule holds More alone. Then the overflow sweep over the board.
 */
const headRow = async (
  kit: Kit,
  page: Page,
  tag: string,
  width: number,
  /** A task open or the rail dragged: the board alone reads the head. */
  aside: boolean
) => {
  if (aside) {
    return;
  }
  const head = await readHead(page);
  if (!head) {
    kit.check(`${tag}: the project's head stands`, false, "no project-head");
    return;
  }
  kit.check(
    `${tag}: the head is one row: the name on one line, every control centred on the row (${head.height.toFixed(1)}px tall)`,
    head.lines === 1 && head.off.length === 0,
    JSON.stringify({ lines: head.lines, off: head.off })
  );
  kit.check(
    `${tag}: nothing in the head is on the coral (action-surface)`,
    head.coral.startsWith("linear-gradient") && head.onCoral.length === 0,
    `coral read as ${head.coral.slice(0, 60)}; ${head.onCoral.slice(0, 3).join(" | ")}`
  );
  const capsule = head.symbols.filter((one) => one.inCapsule);
  const more = commonWords.moreFor("Tidewater");
  const want =
    width < 640 ? [more] : [projectWords.askCaw, projectWords.spinOff, more];
  kit.check(
    `${tag}: the head's symbols are bare and named (${head.symbols.map((one) => one.name).join(", ")}); the capsule holds ${want.join(", ")}`,
    head.symbols.every(
      (one) => one.name !== "" && one.words === "" && one.symbol
    ) &&
      head.symbols.some(
        (one) => !one.inCapsule && one.name === projectWords.details
      ) &&
      capsule.map((one) => one.name).join("|") === want.join("|"),
    JSON.stringify(head.symbols)
  );
  if (width >= 640) {
    // Each named in its tooltip: the pointer rests on it, the tip says it.
    const tips: { name: string; tip: string }[] = [];
    for (const one of head.symbols) {
      const item = page
        .locator('[data-slot="project-head"] [data-bar-item]')
        .filter({ visible: true })
        .and(page.locator(`[aria-label="${one.name}"]`));
      await item.hover();
      const content = page.locator('[data-slot="tooltip-content"]').last();
      const tip = await content
        .waitFor({ state: "visible", timeout: 3000 })
        .then(async () => ((await content.textContent()) ?? "").trim())
        .catch(() => "");
      tips.push({ name: one.name, tip });
      await page.mouse.move(0, 0);
      await content
        .waitFor({ state: "hidden", timeout: 3000 })
        .catch(() => undefined);
    }
    kit.check(
      `${tag}: each of the head's symbols is named in its tooltip (${tips.map((one) => `${one.name}: “${one.tip}”`).join("; ")})`,
      tips.every((one) =>
        one.name === projectWords.details
          ? one.tip !== ""
          : one.tip === one.name
      ),
      JSON.stringify(tips)
    );
  }
  const spills = await page.evaluate(scan);
  kit.check(
    `${tag}: the overflow sweep over the board totals ${spills.length}`,
    spills.length === 0,
    spills.slice(0, 6).join(" | ")
  );
};

/**
 * The strip's views: the tabs that stand, every view (the ruler's), the
 * chosen tab, the ⋯ while any view is not a tab, and the one menu that holds
 * them all where no tab has room (what its trigger says).
 */
const readStrip = (page: Page) =>
  page.evaluate(() => {
    const strip = document.querySelector('[data-slot="views"]');
    const shown = ':scope > div:not([data-views-ruler]) > [data-slot="tabs"]';
    const label = (tab: Element) =>
      tab.querySelector('[data-slot="text"]')?.textContent?.trim() ?? "";
    return {
      tabs: [
        ...(strip?.querySelectorAll(`${shown} [data-slot="ff-tab"]`) ?? []),
      ].map(label),
      views: [
        ...(strip?.querySelectorAll(
          '[data-views-ruler] [data-slot="ff-tab"]'
        ) ?? []),
      ].map(label),
      chosen:
        strip
          ?.querySelector(`${shown} [data-tab-item-selected]`)
          ?.textContent?.trim() ?? "",
      more: Boolean(strip?.querySelector("[data-views-more]")),
      picker:
        strip
          ?.querySelector("[data-views-picker]")
          ?.getAttribute("aria-label") ?? null,
      /** What the one menu's trigger shows: the view's name, or the ⋯ alone. */
      face:
        strip?.querySelector("[data-views-picker]")?.textContent?.trim() || "⋯",
    };
  });

/**
 * What the strip gives its views, read off its boxes: the room its own
 * width leaves beside everything else it holds, the views' box, the next
 * view in order that is not a tab and its width as a tab (the ruler's), the
 * count the hidden views hold and the one the ⋯ says, and its actions: the
 * group's form, and each control's name, tooltip and the words it draws.
 */
const readFill = (page: Page) =>
  page.evaluate(() => {
    const views = document.querySelector<HTMLElement>('[data-slot="views"]');
    const strip = views?.parentElement;
    if (!(views && strip)) {
      return null;
    }
    const px = (value: string) => Number.parseFloat(value) || 0;
    const style = getComputedStyle(strip);
    const children = [...strip.children].filter(
      (child) => getComputedStyle(child).display !== "none"
    );
    const room =
      strip.clientWidth -
      px(style.paddingInlineStart) -
      px(style.paddingInlineEnd) -
      children
        .filter((child) => child !== views)
        .reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) -
      px(style.columnGap) * Math.max(0, children.length - 1);
    const label = (tab: Element) =>
      tab.querySelector('[data-slot="text"]')?.textContent?.trim() ?? "";
    const shown = new Set(
      [
        ...views.querySelectorAll(
          ':scope > div:not([data-views-ruler]) [data-slot="ff-tab"]'
        ),
      ].map(label)
    );
    const ruled = [
      ...views.querySelectorAll('[data-views-ruler] [data-slot="ff-tab"]'),
    ].map((tab) => ({
      label: label(tab),
      width: tab.getBoundingClientRect().width,
      count: Number(
        tab.querySelector('[data-slot="tab-num"]')?.textContent?.trim() ?? 0
      ),
    }));
    const rest = ruled.filter((one) => !shown.has(one.label));
    const list = views.querySelector<HTMLElement>(
      ':scope > div:not([data-views-ruler]) [data-slot="ff-tabs-list"]'
    );
    const more = views.querySelector<HTMLElement>("[data-views-more]");
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    const WORD = /\p{L}/u;
    const COLOUR = /(?:rgba?|oklch|oklab|lab|lch|hsla?|color)\([^)]*\)/g;
    /** A computed colour that draws: its alpha above 0 (`rgba(…, a)`, `… / a)`). */
    const seen = (colour: string) => {
      if (colour === "transparent") {
        return false;
      }
      const slash = colour.lastIndexOf("/");
      if (slash >= 0) {
        return Number.parseFloat(colour.slice(slash + 1)) > 0;
      }
      const parts = colour.slice(colour.indexOf("(") + 1, -1).split(",");
      return parts.length < 4 || Number.parseFloat(parts[3] ?? "1") > 0;
    };
    const group = strip.querySelector<HTMLElement>(
      ':scope > div:not([data-slot="views"])'
    );
    /** The words a control draws: its visible text that holds a letter. */
    const wordsOf = (one: Element) => {
      const words: string[] = [];
      const walker = document.createTreeWalker(one, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node as Text).data.trim();
        if (
          WORD.test(text) &&
          node.parentElement?.checkVisibility({ visibilityProperty: true })
        ) {
          words.push(text);
        }
      }
      return words;
    };
    /**
     * What a control draws of its own at rest: a fill, a gradient with a
     * stop that shows (the kit button's highlight layer is transparent to
     * transparent off the coral), an edge that shows, a shadow.
     */
    const restOf = (one: Element) => {
      const look = getComputedStyle(one);
      const image = look.backgroundImage;
      const edges = (["Top", "Right", "Bottom", "Left"] as const).filter(
        (side) =>
          look[`border${side}Style`] !== "none" &&
          Number.parseFloat(look[`border${side}Width`]) > 0 &&
          seen(look[`border${side}Color`])
      );
      return {
        fill: seen(look.backgroundColor) ? look.backgroundColor : "",
        image:
          image.includes("url(") || (image.match(COLOUR) ?? []).some(seen)
            ? image
            : "",
        edge: edges.map((side) => `${side} ${look[`border${side}Color`]}`),
        shadow: look.boxShadow === "none" ? "" : look.boxShadow,
      };
    };
    /** A token's colour as the engine computes it, read off a probe of it. */
    const tokenColour = (token: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      document.body.append(probe);
      const { color } = getComputedStyle(probe);
      probe.remove();
      return color;
    };
    /** The ⋯'s count as drawn: its name and tooltip, its ink, its fill, its dot. */
    const markOf = (one: Element | null) => {
      const count = one?.querySelector<HTMLElement>('[data-slot="more-count"]');
      const dot = count?.querySelector<HTMLElement>('[data-slot="badge-dot"]');
      const words = count?.lastElementChild;
      return {
        name: one?.getAttribute("aria-label") ?? "",
        title: one?.getAttribute("title") ?? "",
        ink: words ? getComputedStyle(words).color : "",
        fill: count && seen(getComputedStyle(count).backgroundColor),
        dot: dot ? getComputedStyle(dot).backgroundColor : "",
        dotFirst:
          dot !== null && dot !== undefined && count?.firstElementChild === dot,
        dotDrawn: dot ? dot.getBoundingClientRect().width > 0 : false,
        attnInk: tokenColour("--status-attn-ink"),
        attnGlyph: tokenColour("--status-attn-glyph"),
      };
    };
    const actions = [...(group?.querySelectorAll("button") ?? [])]
      .filter((one) => one.checkVisibility())
      .map((one) => ({
        name: one.getAttribute("aria-label") ?? "",
        title: one.getAttribute("title") ?? "",
        words: wordsOf(one),
        ...restOf(one),
      }));
    return {
      room,
      compact: group?.dataset.form === "compact",
      actions,
      box: views.getBoundingClientRect().width,
      gap: list ? px(getComputedStyle(list).columnGap) : 0,
      // The ⋯ and the gap before it, which go once the last view is a tab.
      more: more
        ? more.getBoundingClientRect().width +
          px(getComputedStyle(views).columnGap)
        : 0,
      held: rest.reduce((sum, one) => sum + one.count, 0),
      says:
        more?.querySelector('[data-slot="more-count"]')?.textContent?.trim() ??
        "",
      mark: markOf(more),
      next: rest[0] ?? null,
      left: rest.length,
      tabs: shown.size,
      views: ruled.length,
    };
  });

/**
 * The strip is a toolbar (DESIGN.md, Title bars follow Liquid Glass): its
 * actions' group is drawn compact, none of them draws a word, and each is
 * named in its tooltip. It stands as many views as tabs as fit beside them,
 * and only those that don't go into the ⋯ (owner: at 900px it showed only
 * the ⋯): the views' box fits its room, and the next view as a tab would
 * not. The ⋯ says what waits in the views it holds, their counts' sum, and
 * nothing when none waits. With `chosen` (900px and wider), the chosen view
 * stands as a tab. Then the overflow sweep (journeys/scan.ts): nothing
 * spills, no control covers text.
 */
const stripFills = async (
  kit: Kit,
  page: Page,
  tag: string,
  chosen: boolean
) => {
  const fill = await readFill(page);
  const strip = await readStrip(page);
  if (!fill) {
    kit.check(`${tag}: the view strip stands`, false, "no [data-slot=views]");
    return;
  }
  const SLACK = 0.5;
  kit.check(
    `${tag}: no strip action draws a fill, edge or shadow at rest`,
    fill.actions.every(
      (one) =>
        one.fill === "" &&
        one.image === "" &&
        one.edge.length === 0 &&
        one.shadow === ""
    ),
    JSON.stringify(
      fill.actions.map(({ name, fill: ground, image, edge, shadow }) => ({
        name,
        ground,
        image,
        edge,
        shadow,
      }))
    )
  );
  kit.check(
    `${tag}: the strip's ${fill.actions.length} actions are bare symbols, each named in its tooltip (${fill.actions.map((one) => one.title).join(", ")})`,
    fill.compact &&
      fill.actions.length >= 3 &&
      fill.actions.every(
        (one) => one.words.length === 0 && one.title !== "" && one.name !== ""
      ),
    JSON.stringify({ compact: fill.compact, actions: fill.actions })
  );
  /** The views' box with the next view a tab beside the rest. */
  const withNext = fill.next
    ? fill.box + fill.gap + fill.next.width - (fill.left === 1 ? fill.more : 0)
    : 0;
  const said = `${fill.tabs} of ${fill.views} tabs in ${fill.box.toFixed(1)}px of ${fill.room.toFixed(1)}px room${fill.next ? `; next, “${fill.next.label}”, ${withNext.toFixed(1)}px` : ""}`;
  kit.check(
    `${tag}: the strip stands every view as a tab that fits beside its actions (${said})`,
    fill.box <= fill.room + SLACK &&
      (fill.next === null || withNext > fill.room + SLACK),
    JSON.stringify({ fill, strip })
  );
  if (fill.left > 0) {
    kit.check(
      `${tag}: the ⋯ says what waits in its ${fill.left} views (${fill.held > 0 ? `“${fill.says}” of ${fill.held}` : "none waits, no count"})`,
      fill.held > 0 ? fill.says === String(fill.held) : fill.says === "",
      JSON.stringify({ held: fill.held, says: fill.says, strip })
    );
    if (fill.held > 0) {
      const { mark } = fill;
      kit.check(
        `${tag}: the ⋯'s count is a Needs you mark: its Status dot first in status-attn-glyph, its figure in status-attn-ink, no fill, named “${mark.name}”`,
        mark.dotFirst &&
          mark.dotDrawn &&
          mark.dot === mark.attnGlyph &&
          mark.ink === mark.attnInk &&
          mark.fill === false &&
          mark.name === viewsWords.moreNeedsYou(fill.held) &&
          mark.title === mark.name,
        JSON.stringify(mark)
      );
    }
  }
  if (chosen) {
    kit.check(
      `${tag}: the chosen view stands as a tab (“${strip.chosen}”)`,
      strip.picker === null && strip.chosen !== "" && fill.tabs > 0,
      JSON.stringify(strip)
    );
  }
  const spills = await page.evaluate(scan);
  kit.check(
    `${tag}: the overflow sweep totals ${spills.length}`,
    spills.length === 0,
    spills.slice(0, 6).join(" | ")
  );
};

/**
 * Every view is reachable from the strip: a tab, or an item of the ⋯ that
 * stands whenever one is not a tab, or of the one menu that holds them all
 * where not even the chosen tab has room beside the ⋯. On the board alone, a
 * view picked from the menu stands as the chosen tab (or the one menu says
 * it), and the page cuts no label after (the read again).
 */
const viewsMenu = async (kit: Kit, page: Page, tag: string, pick: boolean) => {
  const strip = await readStrip(page);
  const how =
    strip.picker === null
      ? `${strip.tabs.length} of ${strip.views.length} tabs${strip.more ? ", ⋯" : ""}`
      : `one menu, “${strip.picker}”, showing “${strip.face}”`;
  kit.check(
    `${tag}: every view a tab or in a menu (${how})`,
    strip.views.length >= 6 &&
      strip.tabs.every((tab) => strip.views.includes(tab)) &&
      (strip.tabs.length === strip.views.length ||
        strip.more ||
        (strip.picker !== null && strip.tabs.length === 0)),
    JSON.stringify(strip)
  );
  if (!(pick && (strip.more || strip.picker !== null))) {
    return;
  }
  const last = strip.views.at(-1) ?? "";
  if (strip.picker === null) {
    await page.locator("[data-views-more]").click();
    await page.getByRole("menuitem", { name: last }).click();
  } else {
    await page.locator("[data-views-picker]").click();
    await page.getByRole("menuitemradio", { name: last }).click();
  }
  await page.waitForTimeout(600);
  await settle(page, 300);
  const after = await readStrip(page);
  const read = await page.evaluate(readPage, false);
  kit.check(
    `${tag}: “${last}” picked from the menu stands as the chosen view, no label cut`,
    (after.picker === null
      ? after.chosen.startsWith(last) && after.tabs.includes(last)
      : after.picker.endsWith(last)) && read.cuts.length === 0,
    `${JSON.stringify(after)}; ${read.cuts.map((one) => `“${one.text}” ${one.lost}px by ${one.by}`).join(", ")}`
  );
};

const run = async (kit: Kit) => {
  const setup = await setUp(kit);
  for (const engine of ENGINES) {
    for (const width of WIDTHS) {
      await leg(kit, setup, engine, width, false);
      await leg(kit, setup, engine, width, true);
      // From 900 the rail stands beside the page: at its narrowest and
      // dragged wide (the strip's least room).
      if (width >= 900) {
        for (const rail of RAILS.filter(
          (each) => each < 400 || width >= WIDE_RAIL_FROM
        )) {
          await leg(kit, setup, engine, width, false, rail);
        }
      }
    }
  }
};

export default { name: "project-clipped", run } satisfies Spec;
