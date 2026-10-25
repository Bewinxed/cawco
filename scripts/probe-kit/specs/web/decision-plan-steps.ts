/**
 * The plan-steps decision page (apps/dashboard plan/proposal/page.oui) as
 * the owner sees it, through the hub's decision host with no hub
 * (decision-embeds.ts), as CawCo shows it (the overlay's bridge,
 * `CAWCO_BRIDGE`): its program as written, each Preview the live canvas of
 * its way's states file.
 *
 * On Chromium and WebKit (Safari's engine), at 1440×900, 680×900 and
 * 390×844, light and dark, each embed scrolled to as the owner would, read
 * on the page and in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Every embed draws the stories its Preview names: each frame drawn,
 *    with words in it.
 * 3. The plan card's lead says "Recommended: <its option>. …", the
 *    host naming the option before the program's why.
 * 4. The first view holds every way: its one drawing (Ways.stories.ts)
 *    says how many there are and stands them side by side, each named by
 *    its number and its option's label, in their order, every name above
 *    the fold at 1440×900 and 390×844 (the next one at the drawing's edge
 *    where the row runs past it).
 * 5. Each way draws one frame, the one the reader's screen shows: the
 *    desk's card under a mouse, the phone's sheet under a finger; its head
 *    is one row with no words in it (no title, count or task: The Title
 *    Bars Follow Liquid Glass Rule), Close a bare symbol in its glass; and
 *    every step's mark is its bare glyph, with no border or fill.
 * 6. Lanes stands the steps that run at the same time side by side, in
 *    columns.
 * 7. No line crosses a box: every connector, sampled along its length,
 *    stays off every tile, words, badge and time but its own two ends.
 * 8. Every drawing of the plan shows each of its to-dos, whole. Nothing
 *    is cut: no box clips its words without an ellipsis, and no
 *    clipping or scrolling box's top or foot runs through a line (words, a
 *    tile, a progress line); every row's words have room (64px, some eight
 *    characters); and every row stands at its place when read, no slide
 *    held on it.
 * 9. "Fixed from your pins" is a section with no pick, its first line
 *    "If one still looks wrong, pin it.", one drawing per fix: the date
 *    previews step opened to its description; the to-do that became a task,
 *    wearing the task's glyph and id, in sight; and a working delegate's
 *    pulse at three moments, each named (Start, Middle, End), its band at
 *    10%, 50% and 90% of the fill.
 * 10. No console error, the page's or its canvases'.
 * 11. Nothing scrolls the page sideways.
 *
 * A manifest of its cards (question, why, options, recommended), the
 * page's height and its options' places, what each embed drew, and every
 * check with its output goes to .probe/decision-pages.
 *
 *   bun scripts/probe-kit/run.ts web decision-plan-steps
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { planProposalWords } from "../../../../packages/core/src/words/plan-proposal";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-pages");
/** The screens each leg draws the page on: its name, and the frame each way should draw there. */
const SCREENS = {
  desk: { leg: "1440×900", want: "desk" },
  narrowDesk: { leg: "680×900", want: "desk" },
  phone: { leg: "390×844", want: "phone" },
} as const;
/** Each leg's engine and screen: Chromium and WebKit (Safari's engine) on all three. */
const LEGS = [
  { engine: "chromium", view: "desk", tag: "" },
  { engine: "chromium", view: "narrowDesk", tag: "" },
  { engine: "chromium", view: "phone", tag: "" },
  { engine: "webkit", view: "desk", tag: "WebKit " },
  { engine: "webkit", view: "narrowDesk", tag: "WebKit " },
  { engine: "webkit", view: "phone", tag: "WebKit " },
] as const;
const NAME = "plan-steps";
const PROPOSAL = "src/lib/cawco/plan/proposal";
const PROGRAM = readFileSync(join(APP, PROPOSAL, "page.oui"), "utf8");

/** Each way's canvas, by the artifact id its Preview names, and the states file it draws. */
const CANVASES: Record<string, readonly string[]> = {
  "aa65e685-a698-46a6-94f2-7ac1c8950af9": [`${PROPOSAL}/Ways.stories.ts`],
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
/** A task's id as the board writes it ("tsk-26"). */
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
  /** CSS zoom in effect on an element: the product of every computed `zoom` up its document (Safari lacks `currentCSSZoom` before 26.4). */
  const zoomOf = (el: Element) => {
    let zoom = 1;
    for (let at: Element | null = el; at; at = at.parentElement) {
      const own = Number.parseFloat(getComputedStyle(at).zoom);
      if (own > 0) {
        zoom *= own;
      }
    }
    return zoom;
  };
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const kinds = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="plan-frame"][data-kind]'
    ),
  ]
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
            label:
              moment
                .querySelector('[data-slot="moment-label"]')
                ?.textContent?.trim() ?? "",
            centre:
              Math.round(
                ((r.left + r.width / 2 - box.left) / box.width) * 100
              ) / 100,
          },
        ]
      : [];
  });
  // The previews step, its description drawn open.
  const opened = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-row="previews"] [data-slot="description"]'
    ),
  ].some((el) => el.getBoundingClientRect().height > 8);
  // Each sheet's head: the words it shows, and its glass group's symbols.
  const heads = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="side-head"], [data-slot="drawer-header"]'
    ),
  ]
    .filter(shown)
    .map((head) => {
      const tools = head.querySelector<HTMLElement>('[data-slot="tools"]');
      const box = tools?.getBoundingClientRect();
      return {
        words: head.innerText.replace(/\s+/g, " ").trim(),
        symbols: [...(tools?.querySelectorAll("button") ?? [])].map(
          (one) =>
            `${one.getAttribute("aria-label")}${one.innerText.trim() ? ` "${one.innerText.trim()}"` : ""}`
        ),
        glass: !!tools,
        rows: box ? Math.round(box.height) : 0,
      };
    });
  // Every step mark's own box: its edge and its fill.
  const marks = [
    ...new Set(
      [...document.querySelectorAll<HTMLElement>('[data-slot="step-tile"]')]
        .filter(shown)
        .map((mark) => {
          const style = getComputedStyle(mark);
          return `${style.borderTopWidth} ${style.borderTopStyle} ${style.backgroundColor}`;
        })
    ),
  ];
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
      const room = words.getBoundingClientRect().width / zoomOf(words);
      return room < 64
        ? [
            `${words.closest("[data-row]")?.getAttribute("data-row")} "${(words.textContent ?? "").trim().slice(0, 30)}" in ${Math.round(room)}px`,
          ]
        : [];
    });
  return {
    kinds,
    bands,
    badges,
    sweeps,
    opened,
    moving,
    squeezed,
    heads,
    marks,
  };
}

/**
 * Each held moment of the pulse: the band's ink (its gradient's middle
 * stop) and the fill's, each as the engine resolves it, and their relative
 * luminances (WCAG 2.2's), so the band is read brighter than the fill, not
 * judged by eye. In the page.
 */
function pulseInkIn() {
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  const rgbOf = (color: string): number[] => {
    if (!paint) {
      return [0, 0, 0];
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const luminance = (color: string) => {
    const [r = 0, g = 0, b = 0] = rgbOf(color).map((c) => {
      const v = c / 255;
      return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return [
    ...document.querySelectorAll<HTMLElement>('[data-slot="pulse-moment"]'),
  ].map((moment) => {
    const band = moment.querySelector<HTMLElement>('[data-slot="sweep"]');
    const fill = moment.querySelector<HTMLElement>('[data-slot="fill"]');
    const ink = band
      ? getComputedStyle(band).getPropertyValue("--tw-gradient-via").trim()
      : "";
    const under = fill ? getComputedStyle(fill).backgroundColor : "";
    const bandL = ink ? luminance(ink) : 0;
    const fillL = under ? luminance(under) : 1;
    return {
      label:
        moment
          .querySelector('[data-slot="moment-label"]')
          ?.textContent?.trim() ?? "",
      ink,
      fill: under,
      ratio: Math.round(((bandL + 0.05) / (fillL + 0.05)) * 100) / 100,
    };
  });
}

/**
 * Each plan's to-dos (its step rows, sub-steps under a step aside) and the
 * ones its drawing shows: a row drawn whole inside its scroller and its
 * frame, none past an edge. In the page.
 */
function todosIn() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="plan"]')].map(
    (plan) => {
      const rows = [
        ...plan.querySelectorAll<HTMLElement>(
          'li[data-row] > [data-slot="plan-row"]'
        ),
      ].filter(
        (row) =>
          row.querySelector(':scope > [data-lead] [data-slot="step-tile"]') &&
          !row.closest('.kit-nest, [data-slot="fold-body"]')
      );
      const clip = (row: Element) =>
        [
          row.closest('[data-slot="plan-scroll"]'),
          row.closest('[data-slot="side-card"], [data-slot="phone-screen"]'),
        ].flatMap((one) => (one ? [one.getBoundingClientRect()] : []));
      const missing = rows.flatMap((row) => {
        const r = row.getBoundingClientRect();
        const whole =
          r.height > 0 &&
          clip(row).every(
            (box) => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5
          );
        return whole
          ? []
          : [row.parentElement?.getAttribute("data-row") ?? "?"];
      });
      return { total: rows.length, missing };
    }
  );
}

/**
 * Where each drawing's sheet closes under its plan: the space from the
 * plan's last row to the sheet's inner foot, and what the sheet's own
 * bottom padding is there (each box's between the plan and the sheet, its
 * padding and border under what it holds). In the page.
 */
function footsIn() {
  /** CSS zoom in effect on an element: the product of every computed `zoom` up its document (Safari lacks `currentCSSZoom` before 26.4). */
  const zoomOf = (el: Element) => {
    let zoom = 1;
    for (let at: Element | null = el; at; at = at.parentElement) {
      const own = Number.parseFloat(getComputedStyle(at).zoom);
      if (own > 0) {
        zoom *= own;
      }
    }
    return zoom;
  };
  return [
    ...document.querySelectorAll<HTMLElement>('[data-slot="plan"]'),
  ].flatMap((plan) => {
    const sheet = plan.closest<HTMLElement>(
      '[data-slot="side-card"], [data-slot="phone-screen"]'
    );
    if (!sheet) {
      return [];
    }
    const zoom = zoomOf(sheet);
    let padding = 0;
    for (
      let at: HTMLElement | null = plan.parentElement;
      at && sheet.contains(at);
      at = at.parentElement
    ) {
      const style = getComputedStyle(at);
      padding +=
        Number.parseFloat(style.paddingBottom) +
        (at === sheet ? 0 : Number.parseFloat(style.borderBottomWidth));
    }
    const foot =
      sheet.getBoundingClientRect().bottom -
      Number.parseFloat(getComputedStyle(sheet).borderBottomWidth) * zoom;
    const space = (foot - plan.getBoundingClientRect().bottom) / zoom;
    return [
      {
        space: Math.round(space * 10) / 10,
        padding: Math.round(padding * 10) / 10,
      },
    ];
  });
}

/**
 * Where each plan's top-level step rows stand their status tiles and their
 * words: every x each takes (Lanes' bands of side-by-side steps aside, a
 * column of their own by design; delegates and sub-steps nested under a
 * step aside). In the page.
 */
function columnsIn() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="plan"]')].map(
    (plan) => {
      const rows = [
        ...plan.querySelectorAll<HTMLElement>(
          'li[data-row] > [data-slot="plan-row"]'
        ),
      ].filter(
        (row) =>
          row.querySelector(':scope > [data-lead] [data-slot="step-tile"]') &&
          !row.closest(
            '[data-slot="band"], .kit-nest, [data-slot="fold-body"]'
          ) &&
          row.getBoundingClientRect().height > 0
      );
      const xs = (selector: string) => [
        ...new Set(
          rows.flatMap((row) => {
            const el = row.querySelector(selector);
            return el ? [Math.round(el.getBoundingClientRect().left)] : [];
          })
        ),
      ];
      return {
        rows: rows.length,
        tiles: xs(':scope > [data-lead] [data-slot="step-tile"]'),
        words: xs(':scope > [data-slot="words"]'),
      };
    }
  );
}

/**
 * Each act a delegate's row offers (Answer, Retry): inside its own row's
 * box, and on a line of its own, at that line's start, under where the
 * row's state starts. In the page.
 */
function actsIn() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="act"]')]
    .filter((act) => act.getBoundingClientRect().width > 0)
    .map((act) => {
      const row = act
        .closest('[data-slot="plan-row"]')
        ?.getBoundingClientRect();
      const state = act.parentElement
        ?.querySelector('[data-slot="wait"]')
        ?.getBoundingClientRect();
      const under = act.parentElement?.getBoundingClientRect();
      const r = act.getBoundingClientRect();
      const ownLine = !!state && r.top >= state.bottom - 1;
      return {
        row: act.closest("[data-row]")?.getAttribute("data-row") ?? "",
        inRow: !!row && r.left >= row.left - 1 && r.right <= row.right + 1,
        ownLine,
        atStart: !ownLine || (!!under && Math.abs(r.left - under.left) <= 1),
      };
    });
}

/**
 * Each dependency a lanes layer's rows name (a step's `data-after`), and the
 * wire drawn for it: one wire per dependency, each painted (its svg
 * rendered, a box of its own; its path long, stroked, at full opacity, its
 * dash at rest). In the page.
 */
function wiresIn() {
  const out: { expected: string[]; drawn: string[]; unpainted: string[] } = {
    expected: [],
    drawn: [],
    unpainted: [],
  };
  /** A wire's length: WebKit throws on a path with no segments yet, which draws nothing. */
  const lengthOf = (wire: SVGPathElement) => {
    try {
      return wire.getTotalLength();
    } catch {
      return 0;
    }
  };
  /** Why a wire draws nothing, if it does not: its svg not rendered, no length, no stroke, seen through, its dash away. */
  const unpaintedOf = (wire: SVGPathElement, box: DOMRect | undefined) => {
    const style = getComputedStyle(wire);
    const rendered = !!box && box.width > 0 && box.height > 0;
    return [
      rendered ? "" : `svg ${box?.width ?? 0}×${box?.height ?? 0}`,
      lengthOf(wire) > 0 ? "" : "no length",
      style.stroke === "none" ? "no stroke" : "",
      Number.parseFloat(style.strokeWidth) > 0 ? "" : "no width",
      Number(style.opacity) < 1 ? `opacity ${style.opacity}` : "",
      Math.abs(Number.parseFloat(style.strokeDashoffset) || 0) > 0.01
        ? `dash at ${style.strokeDashoffset}`
        : "",
    ].filter(Boolean);
  };
  /** Each dependency the layer's rows name, between two rows it holds. */
  const dependenciesOf = (host: HTMLElement) => {
    const rows = new Set(
      [...host.querySelectorAll<HTMLElement>("[data-row]")].map(
        (row) => row.dataset.row ?? ""
      )
    );
    return [...host.querySelectorAll<HTMLElement>("[data-after]")].flatMap(
      (row) =>
        (row.dataset.after ?? "")
          .split(" ")
          .filter((from) => from && rows.has(from))
          .map((from) => `${from}>${row.dataset.row}`)
    );
  };
  for (const host of document.querySelectorAll<HTMLElement>(
    '[data-slot="lanes"]'
  )) {
    out.expected.push(...dependenciesOf(host));
    const svg = host.querySelector<SVGSVGElement>(
      ':scope > svg[data-slot="connectors"]'
    );
    const box = svg?.getBoundingClientRect();
    for (const wire of svg?.querySelectorAll<SVGPathElement>(
      'path[data-slot="wire"][data-kind="after"]'
    ) ?? []) {
      const name = `${wire.dataset.from}>${wire.dataset.to}`;
      out.drawn.push(name);
      const why = unpaintedOf(wire, box);
      if (why.length > 0) {
        out.unpainted.push(`${name}: ${why.join(", ")}`);
      }
    }
  }
  return out;
}

/**
 * Every connector in an embed's frame, sampled along its run in its
 * layer's own pixels, against every box but its own two ends. In the page.
 */
function crossingsIn(): string[] {
  /** CSS zoom in effect on an element: the product of every computed `zoom` up its document (Safari lacks `currentCSSZoom` before 26.4). */
  const zoomOf = (el: Element) => {
    let zoom = 1;
    for (let at: Element | null = el; at; at = at.parentElement) {
      const own = Number.parseFloat(getComputedStyle(at).zoom);
      if (own > 0) {
        zoom *= own;
      }
    }
    return zoom;
  };
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
  // against every box but its own two ends. A path with no segments yet
  // (WebKit throws on its length) draws nothing to cross.
  const lengthOf = (wire: SVGPathElement) => {
    try {
      return wire.getTotalLength();
    } catch {
      return 0;
    }
  };
  const crossings: string[] = [];
  for (const svg of document.querySelectorAll<SVGSVGElement>(
    '[data-slot="connectors"]'
  )) {
    const host = svg.parentElement;
    if (!host) {
      continue;
    }
    const origin = host.getBoundingClientRect();
    const z = zoomOf(host);
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
    for (const wire of svg.querySelectorAll<SVGPathElement>(
      'path[data-slot="wire"]'
    )) {
      const ends = [wire.dataset.from ?? "", wire.dataset.to ?? ""];
      const length = lengthOf(wire);
      if (length === 0) {
        continue;
      }
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
      // Words for a screen reader alone (`sr-only`) are clipped to nothing
      // by their own box: no one sees them cut.
      if (!(
        holder &&
        !holder.closest(".sr-only") &&
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
    // A tile and all it draws (its corner dot stands past its own box).
    for (const one of document.querySelectorAll<Element>(
      '[data-tile], [data-tile] *, [data-slot="progress-line"]'
    )) {
      if (shown(one)) {
        const tile = one.closest<HTMLElement>("[data-tile]")?.dataset.tile;
        const what = tile ? `tile ${tile}` : "progress line";
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
  wires: ReturnType<typeof wiresIn>;
  pulseInk: ReturnType<typeof pulseInkIn>;
  columns: ReturnType<typeof columnsIn>;
  todos: ReturnType<typeof todosIn>;
  foots: ReturnType<typeof footsIn>;
  acts: ReturnType<typeof actsIn>;
  cut: string[];
};

/**
 * The plan card's lead, its recommended option, its options' labels, and
 * its drawings: the card's own media (decisions/host Decision.svelte
 * `decision-media`), one under another at the card body's full width, each
 * captioned with its option's keycap and label.
 */
function pageFacts() {
  const card = document.querySelector<HTMLElement>("#decision-plan");
  const labelOf = (cell: Element | null | undefined) =>
    cell?.querySelector('[data-slot="option-label"]')?.textContent?.trim() ??
    "";
  const recommended = card
    ?.querySelector('[data-slot="option-cell"] [id$="-tag"]')
    ?.closest<HTMLElement>('[data-slot="option-cell"]');
  const labels = [
    ...(card?.querySelectorAll('[data-slot="option-cell"]') ?? []),
  ].map(labelOf);
  const media = card?.querySelector<HTMLElement>(
    '[data-slot="decision-media"]'
  );
  const body = media?.getBoundingClientRect();
  const drawings = [
    ...(media?.querySelectorAll<HTMLElement>('[data-slot="media"]') ?? []),
  ].map((figure) => {
    const f = figure.getBoundingClientRect();
    const frame = figure.querySelector("iframe")?.getBoundingClientRect();
    return {
      caption:
        figure
          .querySelector('[data-slot="media-caption"]')
          ?.textContent?.trim() ?? "",
      top: Math.round(f.top + scrollY),
      width: Math.round(f.width),
      full: !!body && Math.abs(f.width - body.width) <= 1,
      tall: frame ? Math.round(frame.height) : 0,
    };
  });
  return {
    lead: card?.querySelector('[data-slot="why"]')?.textContent?.trim() ?? "",
    label: labelOf(recommended),
    labels,
    body: body ? Math.round(body.width) : 0,
    drawings,
    height: document.documentElement.scrollHeight,
  };
}

/**
 * The page's first view, scrolled to its top: the side-by-side drawing's
 * count line and each way's name, where the person sees them (the frame's
 * box on the page plus each box's in the frame), whether each name starts
 * inside the frame's box, and where the plan card's option chips stand.
 */
async function firstView(page: Page) {
  // The page at its top: the window, and every box that scrolls it (the
  // host's own scroller), back at their start, as the page opens.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll<HTMLElement>("body, body *")) {
      if (el.scrollTop > 0) {
        el.scrollTop = 0;
      }
    }
  });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  const fold = await page.evaluate(() => innerHeight);
  const chips = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>("#decision-plan [data-option]"),
    ].map((chip) => Math.round(chip.getBoundingClientRect().top))
  );
  let count: { text: string; bottom: number } | null = null;
  let ways: { name: string; left: number; top: number; inView: boolean }[] = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    if (
      !((await handle.getAttribute("src")) ?? "").includes("Ways.stories.ts")
    ) {
      continue;
    }
    const box = await handle.boundingBox();
    const frame = await handle.contentFrame();
    if (!(box && frame)) {
      continue;
    }
    const inside = await frame.evaluate(() => {
      const rect = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r ? { left: r.left, top: r.top, bottom: r.bottom } : null;
      };
      const line = document.querySelector('[data-slot="ways-count"]');
      return {
        count: line
          ? { text: line.textContent?.trim() ?? "", ...rect(line) }
          : null,
        ways: [
          ...document.querySelectorAll<HTMLElement>('[data-slot="way-name"]'),
        ].map((name) => ({
          name: name.textContent?.replace(/\s+/g, " ").trim() ?? "",
          ...rect(name),
        })),
      };
    });
    count = inside.count
      ? {
          text: inside.count.text,
          bottom: Math.round(box.y + (inside.count.bottom ?? 0)),
        }
      : null;
    ways = inside.ways.map((one) => ({
      name: one.name,
      left: Math.round(box.x + (one.left ?? 0)),
      top: Math.round(box.y + (one.top ?? 0)),
      inView: (one.left ?? 0) >= 0 && (one.left ?? 0) < box.width,
    }));
  }
  return { fold, count, ways, chips };
}

/** Every way in the first view: counted, named, side by side, above the fold. */
function firstViewCheck(
  leg: string,
  first: Awaited<ReturnType<typeof firstView>>,
  zooms: number[],
  labels: string[],
  check: (name: string, passed: boolean, output: string) => void
): void {
  const names = first.ways.map((one) => one.name);
  check(
    `${leg}: the first view says how many ways there are and stands them side by side, every one named above the fold (${first.count ? `"${first.count.text}" to ${first.count.bottom}` : "no count"}; ${first.ways.map((one) => `"${one.name}" at x ${one.left}, y ${one.top}${one.inView ? "" : " (at the edge, scrolls in)"}`).join(", ")}; fold ${first.fold}; drawn at ${zooms.join(", ")}; the options' chips at ${first.chips.join(", ")})`,
    !!first.count &&
      first.count.bottom <= first.fold &&
      first.ways.every((one) => one.top >= 0) &&
      first.count.text === planProposalWords.waysCount(WAYS) &&
      names.join("|") === WAYS.map((one, i) => `${i + 1} ${one}`).join("|") &&
      names.join("|") === labels.map((one, i) => `${i + 1} ${one}`).join("|") &&
      first.ways.every(
        (one, i) =>
          one.top <= first.fold &&
          Math.abs(one.top - (first.ways[0]?.top ?? 0)) <= 2 &&
          (i === 0 || one.left > (first.ways[i - 1]?.left ?? 0))
      ) &&
      first.ways.some((one) => one.inView),
    JSON.stringify({ first, zooms, labels })
  );
}

/** The cards as the person reads them. */
function cardsOf() {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-slot="decision"]'),
  ].map((card) => ({
    question: card.querySelector("h2")?.textContent?.trim() ?? "",
    why: card.querySelector('[data-slot="why"]')?.textContent?.trim() ?? "",
    options: [
      ...card.querySelectorAll<HTMLElement>('[data-slot="option-cell"]'),
    ].map((cell) => ({
      id:
        cell.querySelector<HTMLElement>("[data-option]")?.dataset.option ?? "",
      text: cell.innerText.replace(/\s+/g, " ").trim(),
      recommended: cell.querySelector('[id$="-tag"]') !== null,
    })),
  }));
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
        wires: await frame.evaluate(wiresIn),
        pulseInk: await frame.evaluate(pulseInkIn),
        columns: await frame.evaluate(columnsIn),
        todos: await frame.evaluate(todosIn),
        foots: await frame.evaluate(footsIn),
        acts: await frame.evaluate(actsIn),
        cut: [
          ...(await frame.evaluate(sideCutIn)),
          ...(await frame.evaluate(edgeCutIn)),
        ],
      });
    }
  }
  return facts;
}

/** The one drawing that stands the three ways side by side. */
const SIDE = "Ways.stories.ts:Side";
/** The pins section's drawings, one per fix. */
const PIN = {
  opened: "CrewFirst.stories.ts:Opened",
  badge: "CrewFirst.stories.ts:Badge",
  pulse: "CrewFirst.stories.ts:Pulse",
} as const;
const WAYS = ["One list", "Lanes", "Crew first"] as const;

/** Each way's head and every step's mark, read off the drawings. */
function chromeChecks(
  leg: string,
  facts: Map<string, Facts>,
  check: (name: string, passed: boolean, output: string) => void
): void {
  const side = facts.get(SIDE);
  const heads = side?.heads ?? [];
  check(
    `${leg}: each way's head is one row with no words, Close a bare symbol in its glass (${heads.map((one) => `"${one.words}" [${one.symbols.join(", ")}] ${one.rows}px`).join("; ") || "no head"})`,
    heads.length === WAYS.length &&
      heads.every(
        (one) =>
          one.words === "" &&
          one.glass &&
          one.symbols.includes("Close") &&
          one.symbols.every((symbol) => !symbol.includes('"'))
      ),
    JSON.stringify(heads)
  );
  const marks = [...new Set([...facts.values()].flatMap((one) => one.marks))];
  check(
    `${leg}: every step's mark is its bare glyph, no edge and no fill (${marks.join("; ") || "no marks"})`,
    marks.length > 0 &&
      marks.every(
        (one) => one.startsWith("0px") && one.endsWith("rgba(0, 0, 0, 0)")
      ),
    JSON.stringify(marks)
  );
}

/** The checks one leg reads off its embeds' frames. */
function frameChecks(
  leg: string,
  view: "desk" | "phone",
  facts: Map<string, Facts>,
  check: (name: string, passed: boolean, output: string) => void
): void {
  const want = view === "desk" ? "desk" : "phone";
  const side = facts.get(SIDE);
  const kinds = side?.kinds ?? [];
  check(
    `${leg}: each way draws one frame, the one this screen shows, the ${want}'s (${kinds.join(", ") || "nothing"})`,
    kinds.length === WAYS.length && kinds.every((one) => one === want),
    kinds.join("\n    ")
  );
  chromeChecks(leg, facts, check);
  const bands = side?.bands ?? [];
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
  const columns = WAYS.map((one, i) => ({
    one,
    at: side?.columns[i],
  }));
  check(
    `${leg}: each way's steps stand their status tiles in one column and their words in one (${columns.map(({ one, at }) => `${one} ${at?.rows ?? 0} rows, tiles at ${at?.tiles.join("/") ?? "none"}, words at ${at?.words.join("/") ?? "none"}`).join("; ")})`,
    columns.every(
      ({ at }) =>
        !!at && at.rows > 0 && at.tiles.length === 1 && at.words.length === 1
    ),
    JSON.stringify(columns)
  );
  const todos = [...facts.entries()].flatMap(([key, one]) =>
    one.todos.map((plan) => ({ key: key.replace(".stories.ts", ""), ...plan }))
  );
  check(
    `${leg}: every drawing of the plan shows each of its to-dos (${todos.map((one) => `${one.key} ${one.total - one.missing.length} of ${one.total}`).join(", ")})`,
    todos.length >= WAYS.length &&
      todos.every((one) => one.total > 0 && one.missing.length === 0),
    JSON.stringify(todos.filter((one) => one.missing.length > 0))
  );
  const foots = [...facts.entries()].flatMap(([key, one]) =>
    one.foots.map((foot) => ({ key: key.replace(".stories.ts", ""), ...foot }))
  );
  check(
    `${leg}: every drawing's sheet closes on its plan's last row, the space under it the sheet's own bottom padding (${foots.map((one) => `${one.key} ${one.space}px for ${one.padding}px`).join(", ")})`,
    foots.length >= WAYS.length &&
      foots.every((one) => Math.abs(one.space - one.padding) <= 1),
    JSON.stringify(foots)
  );
  // None of the plan's delegates waits on him or failed, so none offers
  // Answer or Retry; any that does stands on its own row.
  const acts = side?.acts ?? [];
  check(
    `${leg}: every Answer and Retry stands on its own row, at its line's start where it takes a line of its own (${acts.map((one) => `${one.row}${one.ownLine ? " own line" : ""}${one.inRow && one.atStart ? "" : " OFF"}`).join(", ") || "none offered"})`,
    acts.every((one) => one.inRow && one.atStart),
    JSON.stringify(acts)
  );
  const wires = side?.wires;
  const missing = (wires?.expected ?? []).filter(
    (one) => !wires?.drawn.includes(one)
  );
  check(
    `${leg}: Lanes draws a line for each step's dependency, each one painted (${wires?.drawn.length ?? 0} lines for ${wires?.expected.length ?? 0} dependencies, ${wires?.unpainted.length ?? 0} unpainted)`,
    !!wires &&
      wires.expected.length > 0 &&
      missing.length === 0 &&
      wires.unpainted.length === 0,
    JSON.stringify({ missing, unpainted: wires?.unpainted })
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
    `${leg}: the pins section's first fix draws the previews step opened to its description (${opened ? "open" : "shut"})`,
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
  const inks = facts.get(PIN.pulse)?.pulseInk ?? [];
  check(
    `${leg}: the pulse is light running along the line, its band brighter than the fill at every moment (${inks.map((one) => `${one.label} ${one.ratio}:1`).join(", ") || "none"})`,
    inks.length === MOMENTS.length && inks.every((one) => one.ratio >= 1.5),
    JSON.stringify(inks)
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
    picks:
      section?.querySelectorAll('[data-option], [data-slot="decision"]')
        .length ?? 0,
    pinsCard: !!document.querySelector("#decision-pins"),
  };
}

const spec: Spec = {
  name: "decision-plan-steps",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
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
      for (const { engine, view, tag } of LEGS) {
        const screen = SCREENS[view];
        for (const theme of THEMES) {
          const leg = `${tag}${screen.leg} ${theme}`;
          const page = await kit.page(view, {
            engine,
            theme,
            init: [CAWCO_BRIDGE],
          });
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
          await page.waitForSelector('[data-slot="decision"]', {
            timeout: 30_000,
          });
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: PREVIEWS.length, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(page);
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
          const lead = `Recommended: ${at.label}. `;
          check(
            `${leg}: the plan card's lead opens "${lead}…"`,
            at.label !== "" && at.lead.startsWith(lead),
            at.lead
          );
          // Every way in the first view: the drawing's count line and each
          // way's name, side by side, above the fold, read where the
          // person sees them (the frame's place on the page plus each
          // box's place in it), the page at its top.
          const first = await firstView(page);
          const zooms = embeds
            .filter((e) => named(e) === "Side")
            .flatMap((e) => e.frames.map((f) => f.zoom));
          firstViewCheck(leg, first, zooms, at.labels, check);

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
          frameChecks(leg, screen.want, facts, check);

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
          legs[leg] = {
            first,
            height: at.height,
            drawings: at.drawings,
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
