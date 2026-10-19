/**
 * The component canvas page and its artifact panel's head, held to
 * DESIGN.md at every width and in both schemes (the design review of the
 * canvas, eight findings). Read from the engine: boxes, hit tests, computed
 * colours measured against the tokens they name, contrast from the colours
 * as drawn. On a stage host over the dashboard's own states files, as the
 * daemon starts one (minus the workspace boundary), and the `/motion/
 * artifact-head` bench holding the real PreviewPane on that canvas.
 *
 * The canvas page at 390 and 523 (a phone's: one frame and its strip, under
 * a finger) and 1024 (the desk), light and dark:
 * 1. The strip stands under the band: their boxes don't overlap, and
 *    Outline and Reset layout are what a press at their centres lands on.
 * 2. The page is the well (`surface-well`), the head's foot its edge
 *    (`border-well`).
 * 3. The frame in view is said by its label row (`selected-bg`,
 *    `selected-ink`, 4.5:1); the inspector's story by one solid
 *    `focus-ring` ring that meets neither its label nor its status.
 * 4. A pressed ghost is `surface-pressed`, the current outline row
 *    `selected-bg` with `selected-ink`.
 * 5. The state chips are 30px at `radius-sm` with a 44px touch area under a
 *    finger, the chosen one edged in `brand-solid` (3:1 on the strip); the
 *    story picker is the input recipe, edged in `border-button-outline`
 *    (3:1), with the sort-vertical glyph.
 * 6. An unnamed story's label says "Unnamed" in meta, upright; a label never
 *    repeats its name under it; a section's file is set in code under its
 *    title; the steps lead and end with Solar's chevrons, no ◀ ▶.
 * 7. The house faces load: `document.fonts.check('500 13px "Figtree
 *    Variable"')` and JetBrains Mono's.
 *
 * The panel (the bench) at 390, 523 and 720, light and dark:
 * 8. (330 too, where the mode stands as one button; and 8h, at 330 with
 *    Send picks standing, Comments in More at 0 and 2 open pins.)
 *    The name is whole or ellipsed, never under another control; every
 *    head control is 44px tall or reaches 44px through its ::after under a
 *    finger; the controls past the head's room stand in More, in head
 *    order; no path line stands under the name.
 *
 * Captures for a second review (never read here) go to `$TMPDIR/caps/`:
 * `canvas-{390,523,desk}-{light,dark}.png`, the panel's pane at 2×.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type { CanvasSpec } from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const DASHBOARD = join(ROOT, "apps/dashboard");
/** The artifact's live doc on the dashboard's own origin (artifact-doc.ts `joinArtifact`). */
const ARTIFACT_SOCKET = /\/ws\/artifact\//;
/** More's name while it holds Comments: native's words (PreviewController.swift). */
const MORE_COUNT = /^More, Comments [1-9]\d* open$/;
/** The crumb's words: which frame of how many. */
const FRAME_COUNT = /^Frame \d+ of \d+$/;
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");
/** A states file of the probe's own, in the stage's git-ignored folder: one story with no doc comment. */
const UNNAMED_FILE = ".cawco/probe/Unnamed.stories.ts";
const FILES = [
  "src/lib/cawco/StatTile.stories.ts",
  "src/lib/cawco/turn/Who.stories.ts",
  UNNAMED_FILE,
];
const CANVAS: CanvasSpec = {
  name: "Dashboard parts",
  about: "The stat tile, the speaker line and an unnamed story",
  dials: [
    {
      name: "radius",
      label: "Radius",
      kind: "number",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      target: { cssVar: "--radius-md" },
    },
  ],
  // Edges a straight route would cross frames on: one skips a row, one crosses a whole sheet.
  edges: [
    {
      from: "src/lib/cawco/turn/Who.stories.ts:Agent",
      to: "src/lib/cawco/turn/Who.stories.ts:Grouped",
      label: "skips a row",
    },
    {
      from: "src/lib/cawco/StatTile.stories.ts:Spend",
      to: `${UNNAMED_FILE}:One`,
      label: "across sheets",
    },
  ],
};
/** Every arrow or chevron a text could draw: the chrome draws Solar's glyphs or words instead. */
const ARROWS = /[→›←‹◀▶]/;

interface Stage {
  base: string;
  port: number;
  stop: () => void;
}

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The stage host over the dashboard, started as the daemon starts one. */
async function stageOf(): Promise<Stage> {
  mkdirSync(join(DASHBOARD, ".cawco/stage"), { recursive: true });
  mkdirSync(join(DASHBOARD, ".cawco/probe"), { recursive: true });
  writeFileSync(
    join(DASHBOARD, UNNAMED_FILE),
    `import StatTile from "../../src/lib/cawco/StatTile.svelte";
export default { component: StatTile, args: { label: "Spend", value: "1.00" } };
export const One = { args: {} };

/** The figure moves on. */
export const Two = {
  args: { value: "2.00" },
  from: "One",
  play: async ({ update }) => {
    await update({ value: "2.00" });
  },
};
`
  );
  writeFileSync(
    join(DASHBOARD, ".cawco/stage/host.mjs"),
    await buildStageHost()
  );
  const port = await freePort();
  const child: ChildProcess = spawn(
    "bun",
    [join(DASHBOARD, ".cawco/stage/host.mjs")],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "0",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  child.stdout?.on("data", hear);
  child.stderr?.on("data", hear);
  await until(
    "the stage's ready",
    () => words,
    (text) => text.includes('"cawco":"ready"'),
    90_000
  );
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    stop: () => {
      child.kill("SIGTERM");
      rmSync(join(DASHBOARD, ".cawco/probe"), { recursive: true, force: true });
    },
  };
}

const canvasPath = () =>
  `/@cawco/canvas?${FILES.map((file) => `file=${encodeURIComponent(file)}`).join("&")}&spec=${encodeURIComponent(JSON.stringify(CANVAS))}`;

/** Every frame drawn and the page quiet. */
async function drawn(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as {
          __cawcoCanvas?: { report: { sections: unknown[] } | null };
        }
      ).__cawcoCanvas;
      return !!state?.report && state.report.sections.length > 0;
    },
    null,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(1200);
}

/** Read in the page: colours as drawn (sRGB bytes through a canvas), tokens resolved on a probe element, contrast. */
const PAINT = () => {
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgb = (color: string): number[] => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "#000";
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data];
  };
  const lum = (color: string) => {
    const [r, g, b] = rgb(color).map((v) => {
      const c = v / 255;
      return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const w = window as unknown as Record<string, unknown>;
  w.__rgb = (color: string) => rgb(color).slice(0, 3).join(",");
  w.__contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };
  /** A token's colour as drawn in `host`'s scheme. */
  w.__token = (name: string, host: Element, prop = "background-color") => {
    const probe = document.createElement("span");
    probe.style.setProperty(prop, `var(${name})`);
    host.append(probe);
    const said = getComputedStyle(probe).getPropertyValue(prop);
    probe.remove();
    return (w.__rgb as (c: string) => string)(said);
  };
};

interface PageRead {
  bandStrip: string;
  bandStripApart: boolean;
  bodyFont: string;
  canvasWell: [string, string];
  chip: {
    after: number;
    h: number;
    radius: string;
    edge: number;
    fill: [string, string];
  } | null;
  current: {
    bg: [string, string];
    ink: [string, string];
    ratio: number;
  } | null;
  faces: { figtree: boolean; mono: boolean };
  footEdge: [string, string];
  hits: { name: string; ok: boolean }[];
  /** `surface-hover` as drawn: what pressed must not read as. */
  hover: string;
  pick: {
    edge: [string, string];
    ratio: number;
    glyph: boolean;
    h: number;
  } | null;
  pressed: [string, string];
  repeats: string[];
  ring: { clear: boolean; style: string; color: [string, string] } | null;
  row: { bg: [string, string]; ink: [string, string] } | null;
  sectionFile: { font: string; text: string; title: string } | null;
  steps: { glyphs: number; arrows: boolean } | null;
  unnamed: { text: string; style: string; font: string; small: string } | null;
}

/** One page's reading of every finding on the canvas. */
async function readCanvas(page: Page): Promise<PageRead> {
  // Outline open: the frame in view takes its mark, the outline its current row.
  await page.evaluate(() => {
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    const outline = [...root.querySelectorAll("button")].find(
      (one) => one.textContent === "Outline"
    );
    outline?.click();
    dispatchEvent(
      new CustomEvent("cawco:story-select", { detail: { story: "Spend" } })
    );
  });
  await page.waitForTimeout(600);
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one reading of the page in the page, every finding's boxes and colours at once
  return page.evaluate(() => {
    const w = window as unknown as {
      __rgb: (c: string) => string;
      __contrast: (a: string, b: string) => number;
      __token: (name: string, host: Element, prop?: string) => string;
    };
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    const head = root.querySelector(".head") as HTMLElement;
    const band = root.querySelector(".band") as HTMLElement;
    const strip = root.querySelector(".strip") as HTMLElement;
    const b = band.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const apart = s.height === 0 || s.top >= b.bottom - 0.5;
    const hits = [...root.querySelectorAll<HTMLElement>(".tools .ghost")].map(
      (one) => {
        const r = one.getBoundingClientRect();
        const at = root.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2
        );
        return { name: one.textContent ?? "", ok: at === one };
      }
    );
    const canvas = document.querySelector(".cawco-canvas") as HTMLElement;
    const pressed = root.querySelector<HTMLElement>(
      '.ghost[aria-pressed="true"]'
    );
    const row = root.querySelector<HTMLElement>('.row[aria-current="true"]');
    const label = document.querySelector<HTMLElement>(
      ".cawco-frame[data-cawco-current] > .cawco-frame-label"
    );
    const words = label?.querySelector(".cawco-frame-words") as Element;
    const selected = document.querySelector<HTMLElement>(
      ".cawco-frame[data-cawco-selected]"
    );
    let ring: PageRead["ring"] = null;
    if (selected) {
      const body = selected.querySelector(".cawco-frame-body") as HTMLElement;
      const style = getComputedStyle(body);
      const reach =
        Number.parseFloat(style.outlineWidth) +
        Number.parseFloat(style.outlineOffset);
      const r = body.getBoundingClientRect();
      const top = r.top - reach;
      const bottom = r.bottom + reach;
      const l = (
        selected.querySelector(".cawco-frame-label") as Element
      ).getBoundingClientRect();
      const st = (
        selected.querySelector(".cawco-frame-status") as Element
      ).getBoundingClientRect();
      ring = {
        clear: l.bottom <= top + 0.01 && st.top >= bottom - 0.01,
        style: style.outlineStyle,
        color: [
          w.__rgb(style.outlineColor),
          w.__token("--focus-ring", body, "color"),
        ],
      };
    }
    const chips = [...root.querySelectorAll<HTMLElement>(".chip")];
    const chosen = chips.find((one) => one.ariaPressed === "true");
    let chip: PageRead["chip"] = null;
    if (chosen) {
      const after = getComputedStyle(chosen, "::after");
      const shadow = getComputedStyle(chosen).boxShadow;
      // biome-ignore lint/performance/useTopLevelRegex: read in the page, where no module scope reaches
      const edge = shadow.match(/(rgb|oklch|color|lab)\([^)]*\)/)?.[0] ?? "";
      chip = {
        h: chosen.getBoundingClientRect().height,
        radius: getComputedStyle(chosen).borderTopLeftRadius,
        after:
          after.content === "none" ? 0 : Number.parseFloat(after.height) || 0,
        edge: w.__contrast(edge, getComputedStyle(head).backgroundColor),
        // The option chip's recessed fill (DESIGN.md, Permission gate: "a recessed fill"), never a toggle's pressed step.
        fill: [
          w.__rgb(getComputedStyle(chosen).backgroundColor),
          w.__token("--surface-recess", chosen),
        ],
      };
    }
    const select = root.querySelector<HTMLSelectElement>(".pick select");
    const pick = select
      ? {
          edge: [
            w.__rgb(getComputedStyle(select).borderTopColor),
            w.__token("--border-button-outline", select, "color"),
          ] as [string, string],
          ratio: w.__contrast(
            getComputedStyle(select).borderTopColor,
            getComputedStyle(head).backgroundColor
          ),
          glyph: !!root.querySelector(".pick svg"),
          h: select.getBoundingClientRect().height,
        }
      : null;
    const unnamedLabel = document.querySelector<HTMLElement>(
      ".cawco-frame-label[data-cawco-unnamed]"
    );
    const unnamedWords = unnamedLabel?.querySelector(
      ".cawco-frame-words"
    ) as HTMLElement | null;
    const repeats = [
      ...document.querySelectorAll<HTMLElement>(".cawco-frame-label"),
    ]
      .filter((one) => {
        const said = one.querySelector(".cawco-frame-words")?.textContent;
        const small = one.querySelector(".cawco-frame-small")?.textContent;
        return !!said && !!small && small.split(" · ")[0] === said;
      })
      .map((one) => one.textContent ?? "");
    const file = document.querySelector<HTMLElement>(".cawco-section-file");
    const steps = root.querySelector(".steps");
    const stepWords = steps?.textContent ?? "";
    return {
      bandStrip: `band ${Math.round(b.top)}–${Math.round(b.bottom)}, strip ${Math.round(s.top)}–${Math.round(s.bottom)}`,
      bandStripApart: apart,
      bodyFont: getComputedStyle(band).fontFamily,
      canvasWell: [
        w.__rgb(getComputedStyle(canvas).backgroundColor),
        w.__token("--surface-well", canvas),
      ],
      chip,
      current:
        label && words
          ? {
              bg: [
                w.__rgb(getComputedStyle(label).backgroundColor),
                w.__token("--selected-bg", label),
              ],
              ink: [
                w.__rgb(getComputedStyle(words).color),
                w.__token("--selected-ink", label, "color"),
              ],
              ratio: w.__contrast(
                getComputedStyle(words).color,
                getComputedStyle(label).backgroundColor
              ),
            }
          : null,
      faces: {
        figtree: document.fonts.check('500 13px "Figtree Variable"'),
        mono: document.fonts.check('400 12px "JetBrains Mono Variable"'),
      },
      footEdge: [
        w.__rgb(getComputedStyle(head).borderBottomColor),
        w.__token("--border-well", head, "color"),
      ],
      hits,
      pick,
      hover: w.__token("--surface-hover", head),
      pressed: pressed
        ? [
            w.__rgb(getComputedStyle(pressed).backgroundColor),
            w.__token("--surface-pressed", pressed),
          ]
        : ["none", "none"],
      repeats,
      ring,
      row: row
        ? {
            bg: [
              w.__rgb(getComputedStyle(row).backgroundColor),
              w.__token("--selected-bg", row),
            ],
            ink: [
              w.__rgb(getComputedStyle(row).color),
              w.__token("--selected-ink", row, "color"),
            ],
          }
        : null,
      sectionFile: file
        ? {
            font: getComputedStyle(file).fontFamily,
            text: file.textContent ?? "",
            title:
              file.parentElement?.querySelector(".cawco-section-title")
                ?.textContent ?? "",
          }
        : null,
      steps: steps
        ? {
            glyphs: steps.querySelectorAll("svg").length,
            arrows: stepWords.includes("◀") || stepWords.includes("▶"),
          }
        : null,
      unnamed:
        unnamedLabel && unnamedWords
          ? {
              text: unnamedWords.textContent ?? "",
              style: getComputedStyle(unnamedWords).fontStyle,
              font: `${getComputedStyle(unnamedWords).fontSize} ${getComputedStyle(unnamedWords).color}`,
              small:
                unnamedLabel.querySelector(".cawco-frame-small")?.textContent ??
                "",
            }
          : null,
    };
  });
}

const same = ([a, b]: [string, string]) => a === b;

/** The canvas page at one width and scheme. */
async function canvasLeg(
  kit: Kit,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<void> {
  const phone = width < 640;
  const page = await kit.page(phone ? "phone" : "desk", {
    init: [PAINT],
    theme,
  });
  await page.setViewportSize({ width, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${stage.base}${canvasPath()}`);
  await drawn(page);
  const read = await readCanvas(page);
  const leg = `${width} ${theme}`;
  await reviewLeg(kit, page, leg, phone, theme);
  kit.check(
    `1: ${leg}: the strip stands under the band, and Outline and Reset layout take a press at their centres`,
    read.bandStripApart && read.hits.every((one) => one.ok),
    `${read.bandStrip}; ${read.hits.map((one) => `${one.name} ${one.ok}`).join(", ")}`
  );
  kit.check(
    `2: ${leg}: the page is surface-well, the head's foot border-well`,
    same(read.canvasWell) && same(read.footEdge),
    `well ${read.canvasWell.join(" vs ")}; edge ${read.footEdge.join(" vs ")}`
  );
  kit.check(
    `3a: ${leg}: the frame in view says so by its label row, selected-bg and selected-ink at 4.5:1`,
    !!read.current &&
      same(read.current.bg) &&
      same(read.current.ink) &&
      read.current.ratio >= 4.5,
    JSON.stringify(read.current)
  );
  kit.check(
    `3b: ${leg}: the inspector's story wears one solid focus-ring ring clear of its label and status`,
    !!read.ring &&
      read.ring.clear &&
      read.ring.style === "solid" &&
      same(read.ring.color),
    JSON.stringify(read.ring)
  );
  kit.check(
    `4: ${leg}: pressed Outline is surface-pressed (a drawn fill, not the hover's), the current row selected-bg with selected-ink`,
    same(read.pressed) &&
      read.pressed[0] !== "0,0,0" &&
      read.pressed[0] !== read.hover &&
      !!read.row &&
      same(read.row.bg) &&
      same(read.row.ink),
    `pressed ${read.pressed.join(" vs ")}, hover ${read.hover}; row ${JSON.stringify(read.row)}`
  );
  if (phone) {
    kit.check(
      `5a: ${leg}: the chosen chip is 30px at radius-sm, 44px to a finger, on the option chip's surface-recess, its brand-solid edge 3:1 on the strip`,
      !!read.chip &&
        Math.round(read.chip.h) === 30 &&
        read.chip.radius === "8px" &&
        read.chip.after >= 44 &&
        read.chip.edge >= 3 &&
        same(read.chip.fill),
      JSON.stringify(read.chip)
    );
    kit.check(
      `5b: ${leg}: the story picker is edged in border-button-outline at 3:1, with its glyph, 44px to a finger`,
      !!read.pick &&
        same(read.pick.edge) &&
        read.pick.ratio >= 3 &&
        read.pick.glyph &&
        read.pick.h >= 44,
      JSON.stringify(read.pick)
    );
    kit.check(
      `6c: ${leg}: the steps lead and end with chevrons, no ◀ ▶`,
      !!read.steps && read.steps.glyphs >= 1 && !read.steps.arrows,
      JSON.stringify(read.steps)
    );
  }
  if (!phone) {
    kit.check(
      `6a: ${leg}: an unnamed story says "Unnamed" in meta, upright; no label repeats its name under it`,
      read.unnamed?.text === "Unnamed" &&
        read.unnamed.style === "normal" &&
        read.unnamed.font.startsWith("12px") &&
        read.repeats.length === 0,
      `${JSON.stringify(read.unnamed)}; repeats ${read.repeats.join(" | ") || "none"}`
    );
  }
  kit.check(
    `6b: ${leg}: a section's file is set in code under its title`,
    !!read.sectionFile &&
      read.sectionFile.font.includes("JetBrains Mono") &&
      read.sectionFile.text.endsWith(".stories.ts"),
    JSON.stringify(read.sectionFile)
  );
  kit.check(
    `7: ${leg}: the house faces load in the page`,
    read.faces.figtree && read.faces.mono,
    `${JSON.stringify(read.faces)}; band ${read.bodyFont}`
  );
  kit.check(
    `9: ${leg}: no page errors`,
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** The second review's findings on one canvas page: the band's tools, its words, the arrows, the edges, the dials and the move's timeline. */
async function reviewLeg(
  kit: Kit,
  page: Page,
  leg: string,
  phone: boolean,
  theme: "light" | "dark"
): Promise<void> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one reading of the page in the page
  const read = await page.evaluate((arrows) => {
    const w = window as unknown as {
      __rgb: (c: string) => string;
      __token: (name: string, host: Element, prop?: string) => string;
    };
    const ARROW = new RegExp(arrows);
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    const band = root.querySelector(".band") as HTMLElement;
    const style = getComputedStyle(band);
    const b = band.getBoundingClientRect();
    const t = (root.querySelector(".tools") as Element).getBoundingClientRect();
    const lines =
      (b.top +
        Number.parseFloat(style.paddingTop) +
        b.bottom -
        Number.parseFloat(style.paddingBottom)) /
      2;
    const texts: string[] = [];
    const walk = (node: Node) => {
      // Sheets and scripts are not drawn.
      if (node.nodeName === "STYLE" || node.nodeName === "SCRIPT") {
        return;
      }
      if (
        node.nodeType === Node.TEXT_NODE &&
        ARROW.test(node.textContent ?? "")
      ) {
        texts.push(node.textContent ?? "");
      }
      for (const kid of node.childNodes) {
        walk(kid);
      }
    };
    walk(root);
    for (const el of document.querySelectorAll(
      ".cawco-edges, .dialkit-root, .cawco-section-head, .cawco-frame-label, .cawco-colhead"
    )) {
      walk(el);
    }
    // What an edge may not cross: every drawn part of a frame (its label, body and status) and the section heads.
    const obstacles = [
      ...document.querySelectorAll(
        ".cawco-frame-label, .cawco-frame-body, .cawco-frame-status, .cawco-section-head"
      ),
    ]
      .map((one) => ({ one, r: one.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const inside = (x: number, y: number) =>
      obstacles.find(
        ({ r }) =>
          x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1
      );
    const crossing: string[] = [];
    // Each stroke sampled every 2px along its length: a box test cannot tell a lane round a frame from one through it.
    for (const path of document.querySelectorAll<SVGPathElement>(
      ".cawco-edges path.cawco-edge"
    )) {
      const ctm = path.getScreenCTM();
      const length = path.getTotalLength();
      for (let at = 0; ctm && at <= length; at += 2) {
        const p = path.getPointAtLength(at).matrixTransform(ctm);
        const hit = inside(p.x, p.y);
        if (hit) {
          crossing.push(
            `${path.dataset.cawcoFrom} edge at ${Math.round(p.x)},${Math.round(p.y)} inside ${hit.one.className}`
          );
          break;
        }
      }
    }
    for (const text of document.querySelectorAll<SVGTextElement>(
      ".cawco-edges text"
    )) {
      const r = text.getBoundingClientRect();
      const hit = obstacles.find(
        (o) =>
          Math.min(r.right, o.r.right) - Math.max(r.left, o.r.left) > 0.5 &&
          Math.min(r.bottom, o.r.bottom) - Math.max(r.top, o.r.top) > 0.5
      );
      if (hit) {
        crossing.push(`label "${text.textContent}" over ${hit.one.className}`);
      }
    }
    const name = root.querySelector(".name") as HTMLElement;
    const panel = document.querySelector<HTMLElement>(
      ".cawco-dock-dials .dialkit-panel-inner"
    );
    const dialRoot = document.querySelector<HTMLElement>(
      ".cawco-dock-dials .dialkit-root"
    );
    let heaviest = 0;
    for (const el of document.querySelectorAll(
      ".dialkit-root, .dialkit-root *"
    )) {
      heaviest = Math.max(heaviest, Number(getComputedStyle(el).fontWeight));
    }
    return {
      centring: `tools centre ${(t.top + t.height / 2).toFixed(1)}, band lines' centre ${lines.toFixed(1)}`,
      centred: Math.abs(t.top + t.height / 2 - lines) <= 1,
      crumb:
        (root.querySelector(".crumb .num") as HTMLElement | null)
          ?.textContent ?? "",
      nameShown: getComputedStyle(name).display !== "none",
      arrows: texts,
      edges: document.querySelectorAll(".cawco-edges path.cawco-edge").length,
      crossing,
      dials:
        panel && dialRoot
          ? {
              ground: [
                w.__rgb(getComputedStyle(panel).backgroundColor),
                w.__token("--surface-raised", panel),
              ],
              ink: [
                w.__rgb(getComputedStyle(dialRoot).color),
                w.__token("--ink-strong", dialRoot, "color"),
              ],
              face: getComputedStyle(dialRoot).fontFamily,
              theme: dialRoot.dataset.theme ?? "",
              heaviest,
            }
          : null,
    };
  }, ARROWS.source);
  kit.check(
    `N6: ${leg}: Outline and Reset layout stand centred on the band's lines`,
    read.centred,
    read.centring
  );
  kit.check(
    `7c: ${leg}: the crumb says only which frame of how many, the band names the canvas where it stands alone`,
    FRAME_COUNT.test(read.crumb) && read.nameShown,
    `crumb "${read.crumb}", name shown ${read.nameShown}`
  );
  kit.check(
    `8: ${leg}: no arrow or chevron drawn as text in the chrome, the edges, the section heads, the labels or DialKit`,
    read.arrows.length === 0,
    read.arrows.join(" | ") || "none"
  );
  kit.check(
    `N3: ${leg}: no edge's stroke or label crosses any frame's label, body or status or a section head${phone ? " (a phone draws no edge to a frame it doesn't show)" : ", with an edge that skips a row and one across a sheet"}`,
    read.crossing.length === 0 && (phone || read.edges >= 3),
    `${read.edges} edges; ${read.crossing.join("; ") || "none crossing"}`
  );
  kit.check(
    `N1: ${leg}: the dials are DialKit in our tokens: surface-raised ground, ink-strong, Figtree, nothing past 500, its theme the page's (${theme})`,
    !!read.dials &&
      same(read.dials.ground as [string, string]) &&
      same(read.dials.ink as [string, string]) &&
      read.dials.face.includes("Figtree") &&
      read.dials.heaviest <= 500 &&
      read.dials.theme === theme,
    JSON.stringify(read.dials)
  );
  await markLeg(kit, page, leg);
  await roomLeg(kit, page, leg, phone);
  await schemeLeg(kit, page, leg, theme);
  await moveLeg(kit, page, leg, phone, theme);
}

/** Boxes of the chrome that stands over the canvas, and the canvas's own, as drawn. */
const ROOM = () => {
  const box = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0
      ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left }
      : null;
  };
  const root = document.getElementById("cawco-chrome")
    ?.shadowRoot as ShadowRoot;
  return {
    canvas: box(document.querySelector(".cawco-canvas")),
    dials: box(document.getElementById("cawco-dock-dials")),
    timeline: box(document.getElementById("cawco-dock-timeline")),
    outline: box(root.querySelector(".outline")),
    foot: box(root.querySelector(".foot")),
  };
};
type Room = ReturnType<typeof ROOM>;
const roomWords = (room: Room) =>
  Object.entries(room)
    .map(([name, b]) =>
      b
        ? `${name} ${Math.round(b.left)}–${Math.round(b.right)} × ${Math.round(b.top)}–${Math.round(b.bottom)}`
        : `${name} none`
    )
    .join("; ");

/** 4b: the frame in view stays marked with the outline shut: the crumb's "Frame N of M" points at it. */
async function markLeg(kit: Kit, page: Page, leg: string): Promise<void> {
  await page.evaluate(() => {
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    const outline = [...root.querySelectorAll("button")].find(
      (one) => one.textContent === "Outline"
    );
    if (outline?.getAttribute("aria-pressed") === "true") {
      outline.click();
    }
  });
  await page.waitForTimeout(300);
  const read = await page.evaluate(() => {
    const w = window as unknown as {
      __rgb: (c: string) => string;
      __token: (n: string, h: Element, p?: string) => string;
    };
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    const marked = [
      ...document.querySelectorAll<HTMLElement>(
        ".cawco-frame[data-cawco-current]"
      ),
    ];
    const label = marked[0]?.querySelector(".cawco-frame-label") as
      HTMLElement | undefined;
    const all = [...document.querySelectorAll<HTMLElement>(".cawco-frame")];
    return {
      outlineShut: !!(root.querySelector(".outline") as HTMLElement).hidden,
      marked: marked.length,
      fill: label
        ? [
            w.__rgb(getComputedStyle(label).backgroundColor),
            w.__token("--selected-bg", label),
          ]
        : null,
      crumb:
        (root.querySelector(".crumb .num") as HTMLElement).textContent ?? "",
      frames: all.length,
    };
  });
  kit.check(
    `4b: ${leg}: with the outline shut, the frame in view is still marked by its label row (selected-bg), the one the crumb counts`,
    read.outlineShut &&
      read.marked === 1 &&
      !!read.fill &&
      same(read.fill as [string, string]) &&
      FRAME_COUNT.test(read.crumb),
    JSON.stringify(read)
  );
}

/** N2's family: the chrome standing over the canvas takes its room; nothing of it stands on another or on the canvas. */
async function roomLeg(
  kit: Kit,
  page: Page,
  leg: string,
  phone: boolean
): Promise<void> {
  const shut = await page.evaluate(ROOM);
  const ok = (room: Room) =>
    !!room.canvas &&
    !!room.dials &&
    (phone
      ? room.canvas.bottom <= room.dials.top + 0.5 &&
        !!room.foot &&
        room.dials.bottom <= room.foot.top + 0.5
      : room.canvas.right <= room.dials.left + 0.5 &&
        (!room.outline || room.dials.right <= room.outline.left + 0.5));
  kit.check(
    `N2b: ${leg}: the dials stand as chrome: ${phone ? "across the floor over the foot, the canvas ending above them" : "at the inline end, the canvas ending left of them"}`,
    ok(shut),
    roomWords(shut)
  );
  if (!phone) {
    await page.evaluate(() => {
      const root = document.getElementById("cawco-chrome")
        ?.shadowRoot as ShadowRoot;
      [...root.querySelectorAll("button")]
        .find((one) => one.textContent === "Outline")
        ?.click();
    });
    await page.waitForTimeout(400);
    const open = await page.evaluate(ROOM);
    kit.check(
      `N2c: ${leg}: with the outline open, the dials stand left of it and the canvas left of both`,
      ok(open) &&
        !!open.outline &&
        !!open.canvas &&
        open.canvas.right <= open.outline.left + 0.5,
      roomWords(open)
    );
    await page.evaluate(() => {
      const root = document.getElementById("cawco-chrome")
        ?.shadowRoot as ShadowRoot;
      [...root.querySelectorAll("button")]
        .find((one) => one.textContent === "Outline")
        ?.click();
    });
    await page.waitForTimeout(300);
  }
}

/** N1 live: the scheme turned under the page reaches its page-scheme frames and both of DialKit's roots, on one source. */
async function schemeLeg(
  kit: Kit,
  page: Page,
  leg: string,
  theme: "light" | "dark"
): Promise<void> {
  const other = theme === "dark" ? "light" : "dark";
  const read = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __rgb: (c: string) => string;
        __token: (n: string, h: Element, p?: string) => string;
      };
      const body = document.querySelector<HTMLElement>(
        '.cawco-frame[data-cawco-scheme="page"] .cawco-frame-body'
      );
      const dials = document.querySelector<HTMLElement>(
        ".cawco-dock-dials .dialkit-root"
      );
      const panel = document.querySelector<HTMLElement>(
        ".cawco-dock-dials .dialkit-panel-inner"
      );
      return {
        frame: body?.style.colorScheme ?? "",
        dials: dials?.dataset.theme ?? "",
        ground: panel
          ? [
              w.__rgb(getComputedStyle(panel).backgroundColor),
              w.__token("--surface-raised", panel),
            ]
          : null,
      };
    });
  await page.emulateMedia({ colorScheme: other });
  await page.waitForTimeout(500);
  const turned = await read();
  await page.emulateMedia({ colorScheme: theme });
  await page.waitForTimeout(500);
  const back = await read();
  kit.check(
    `N1b: ${leg}: the system's scheme turned to ${other} and back reaches the page-scheme frames and the dials live, the dials' ground the token's in each`,
    turned.frame === other &&
      turned.dials === other &&
      !!turned.ground &&
      same(turned.ground as [string, string]) &&
      back.frame === theme &&
      back.dials === theme,
    `turned ${JSON.stringify(turned)}; back ${JSON.stringify(back)}`
  );
}

/** N2 and N1 on a move's timeline: opened from its edge (desk) or by stepping to its story (phone). */
async function moveLeg(
  kit: Kit,
  page: Page,
  leg: string,
  phone: boolean,
  theme: "light" | "dark"
): Promise<void> {
  if (phone) {
    // The outline's row for the unnamed sheet's One shows it (the canvas's own go); its step ahead plays the move to Two.
    await page.evaluate(() => {
      const root = document.getElementById("cawco-chrome")
        ?.shadowRoot as ShadowRoot;
      root
        .querySelector<HTMLButtonElement>('.row[data-key*="|One|rest|"]')
        ?.click();
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector(".cawco-frame[data-cawco-shown]")
          ?.getAttribute("data-cawco-story") === "One",
      null,
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      const root = document.getElementById("cawco-chrome")
        ?.shadowRoot as ShadowRoot;
      const ahead = [
        ...root.querySelectorAll<HTMLButtonElement>(".steps .ghost"),
      ].find((one) => one.textContent?.includes("Two"));
      ahead?.click();
    });
  } else {
    await page.evaluate(() => {
      document
        .querySelector<SVGElement>('text[data-cawco-move$="|Two"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }
  const opened = await page
    .waitForFunction(
      () =>
        (document.querySelector(".cawco-dock-timeline")?.getBoundingClientRect()
          .height ?? 0) > 0,
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(800);
  const read = await page.evaluate(() => {
    const w = window as unknown as {
      __rgb: (c: string) => string;
      __token: (name: string, host: Element, prop?: string) => string;
    };
    const dock = document.querySelector(".cawco-dock-timeline") as HTMLElement;
    const d = dock.getBoundingClientRect();
    const c = (
      document.querySelector(".cawco-canvas") as Element
    ).getBoundingClientRect();
    const status = document.querySelector<HTMLElement>(
      '.cawco-frame[data-cawco-story="Two"][data-cawco-interaction="rest"] .cawco-frame-status'
    );
    const s = status?.getBoundingClientRect();
    const ground = dock.querySelector<HTMLElement>(".dialkit-timeline-dock");
    const root = dock.querySelector<HTMLElement>(".dialkit-root") ?? dock;
    const dials = document
      .getElementById("cawco-dock-dials")
      ?.getBoundingClientRect();
    const head = document
      .getElementById("cawco-chrome")
      ?.shadowRoot?.querySelector(".head")
      ?.getBoundingClientRect();
    return {
      left: Math.round(c.bottom - (head?.bottom ?? 0)),
      enough: c.bottom - (head?.bottom ?? 0) >= innerHeight * 0.3,
      stacked: !dials || dials.height === 0 || dials.bottom <= d.top + 0.5,
      dials: dials
        ? `${Math.round(dials.top)}–${Math.round(dials.bottom)}`
        : "none",
      dock: `${Math.round(d.top)}–${Math.round(d.bottom)}`,
      canvasBottom: Math.round(c.bottom),
      status: s ? `${Math.round(s.top)}–${Math.round(s.bottom)}` : "none",
      clear:
        !!s &&
        s.height > 0 &&
        s.bottom <= d.top + 0.5 &&
        s.bottom <= c.bottom + 0.5 &&
        c.bottom <= d.top + 0.5,
      ground: ground
        ? [
            w.__rgb(getComputedStyle(ground).backgroundColor),
            w.__token("--surface-raised", ground),
          ]
        : null,
      theme: root.dataset.theme ?? "",
    };
  });
  kit.check(
    `N2: ${leg}: the move's timeline stands above the foot, the canvas ends above it, and the played frame's status line stands clear of it`,
    opened && read.clear && read.stacked && read.enough,
    `opened ${opened}; timeline ${read.dock}, dials ${read.dials}, canvas ends ${read.canvasBottom} (${read.left}px under the head), status ${read.status}`
  );
  kit.check(
    `N1: ${leg}: the timeline is DialKit in our tokens on the page's scheme (${theme})`,
    !!read.ground &&
      same(read.ground as [string, string]) &&
      read.theme === theme,
    JSON.stringify(read)
  );
}

interface HeadRead {
  bar: { key: string; h: number; after: number }[];
  /** The head's gap and each child's box (x, width) and form, as drawn. */
  boxes: string;
  more: string[];
  moreLabel: string;
  name: { whole: boolean; ellipsed: boolean; under: string; width: number };
  path: string;
}

/** The bench's head: what stands, what went to More, the name, the touch areas. */
async function readHead(page: Page): Promise<HeadRead> {
  const read = await page.evaluate(() => {
    const head = document.querySelector(
      "[data-bench-pane] [data-slot=side-head]"
    ) as HTMLElement;
    const trigger = head.querySelector(".identity > *") as HTMLElement;
    const name = trigger.querySelector(".artifact-name") as HTMLElement;
    const r = trigger.getBoundingClientRect();
    const under = document.elementFromPoint(r.right - 2, r.top + r.height / 2);
    const controls = [
      ...head.querySelectorAll<HTMLElement>(
        ":scope > [data-head-item]:not([hidden]) :is(button, a, [role=tab]), :scope > [data-slot=more], :scope > [data-slot=close]"
      ),
    ];
    return {
      name: {
        whole: name.scrollWidth <= name.clientWidth,
        ellipsed: getComputedStyle(name).textOverflow === "ellipsis",
        under:
          under && trigger.contains(under)
            ? "name"
            : (under?.outerHTML.slice(0, 60) ?? "nothing"),
        width: r.width,
      },
      bar: controls.map((one) => {
        const after = getComputedStyle(one, "::after");
        return {
          key:
            one.closest<HTMLElement>("[data-head-item]")?.dataset.headItem ??
            one.dataset.slot ??
            one.getAttribute("aria-label") ??
            "",
          h: one.getBoundingClientRect().height,
          after:
            after.content === "none" ? 0 : Number.parseFloat(after.height) || 0,
        };
      }),
      boxes: `gap ${getComputedStyle(head).columnGap}; ${[...head.children]
        .filter((one) => !(one as HTMLElement).hidden)
        .map((one) => {
          const box = one.getBoundingClientRect();
          const el = one as HTMLElement;
          return `${el.dataset.headItem ?? el.dataset.slot ?? el.className.split(" ")[0]}${el.dataset.form === "compact" ? "(one button)" : ""} x${Math.round(box.x)} w${Math.round(box.width * 10) / 10} h${Math.round(box.height)}`;
        })
        .join(", ")}`,
      moreLabel:
        head.querySelector("[data-slot=more]")?.getAttribute("aria-label") ??
        "",
      path: head.querySelector(".subtitle")?.textContent ?? "",
    };
  });
  let more: string[] = [];
  const trigger = page.locator("[data-bench-pane] [data-slot=more]");
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(400);
    more = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-slot=dropdown-menu-content] :is([role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [data-slot=dropdown-menu-sub-trigger])"
        ),
      ].map((one) => one.textContent?.trim() ?? "")
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  return { ...read, more };
}

/**
 * Every edge an element draws on the line `at` (px from the top): its
 * borders, its outline, and, `shadows` set, a shadow under it. Run in the
 * page; names each `tag.class side width`.
 */
const EDGES_AT = ({
  at,
  inside,
  shadows,
}: {
  at: number;
  inside: string;
  shadows: boolean;
}): string[] => {
  const scopes: (Document | ShadowRoot)[] = [document];
  const shadow = document.getElementById("cawco-chrome")?.shadowRoot;
  if (shadow) {
    scopes.push(shadow);
  }
  const named = (el: Element, r: DOMRect, what: string) =>
    `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${what} ${Math.round(r.width)}px`;
  const near = (y: number) => Math.abs(y - at) <= 3;
  const painted = (width: string, kind: string) =>
    Number.parseFloat(width) > 0 && kind !== "none";
  const marks = (el: Element): string[] => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return [];
    }
    const s = getComputedStyle(el);
    const found: string[] = [];
    if (near(r.top) && painted(s.borderTopWidth, s.borderTopStyle)) {
      found.push(named(el, r, `top ${s.borderTopWidth}`));
    }
    if (near(r.bottom) && painted(s.borderBottomWidth, s.borderBottomStyle)) {
      found.push(named(el, r, `bottom ${s.borderBottomWidth}`));
    }
    const ring = r.bottom + Number.parseFloat(s.outlineOffset);
    if (near(ring) && painted(s.outlineWidth, s.outlineStyle)) {
      found.push(named(el, r, "outline"));
    }
    if (shadows && near(r.bottom) && s.boxShadow !== "none") {
      found.push(named(el, r, "shadow"));
    }
    return found;
  };
  return scopes.flatMap((scope) =>
    [...scope.querySelectorAll(inside)].flatMap(marks)
  );
};

/** 7 and N7 in the panel: the band says no name the head says; nothing but the well's own edge is drawn at the head/well seam, in the panel or the page's top row. */
async function seamLeg(kit: Kit, page: Page, leg: string): Promise<void> {
  const canvasFrame = page
    .frames()
    .find((one) => one.url().includes("/@cawco/canvas"));
  const band = canvasFrame
    ? await canvasFrame.evaluate(() => {
        const root = document.getElementById("cawco-chrome")
          ?.shadowRoot as ShadowRoot;
        const name = root.querySelector(".name") as HTMLElement;
        return {
          nameShown: getComputedStyle(name).display !== "none",
          crumb:
            (root.querySelector(".crumb .num") as HTMLElement | null)
              ?.textContent ?? "",
        };
      })
    : null;
  kit.check(
    `7d: ${leg}: in the panel the band doesn't name the canvas the head names, and its crumb counts frames only`,
    !!band && !band.nameShown && FRAME_COUNT.test(band.crumb),
    JSON.stringify(band)
  );
  const well = await page.evaluate(() => {
    const box = (
      document.querySelector(
        "[data-bench-pane] [data-slot=side-well]"
      ) as HTMLElement
    ).getBoundingClientRect();
    return { top: box.top, width: Math.round(box.width) };
  });
  // The panel's seam, its well's own shadow aside (it's the well's ground).
  const inPanel = (
    await page.evaluate(EDGES_AT, {
      at: well.top,
      inside: "[data-bench-pane] *",
      shadows: true,
    })
  ).filter((one) => !one.startsWith("div.side-well shadow"));
  // The page's top row, under the seam: an edge there narrower than the page would read as a stray line.
  const pageTop = canvasFrame
    ? (
        await canvasFrame.evaluate(EDGES_AT, {
          at: 0,
          inside: "*",
          shadows: true,
        })
      ).filter((one) => !one.endsWith(` ${well.width - 2}px`))
    : ["no canvas frame"];
  // Every box 50–150px wide whose edge meets the seam, whatever it paints (the reviewer's line was 132 device px, 66 CSS px at 2×).
  const touching = await page.evaluate((at) => {
    const near = (y: number) => Math.abs(y - at) <= 3;
    return [...document.querySelectorAll("[data-bench-pane] *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(
        ({ r }) =>
          r.width >= 50 && r.width <= 150 && (near(r.top) || near(r.bottom))
      )
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(r.width)}px ${near(r.top) ? "top" : "bottom"} bg ${getComputedStyle(el).backgroundColor}`
      );
  }, well.top);
  kit.check(
    `N7: ${leg}: at the head/well seam only the well's own edge is drawn, the well's width, and nothing draws an edge in the page's top row`,
    inPanel.length === 1 &&
      inPanel[0]?.endsWith(` ${well.width}px`) === true &&
      pageTop.length === 0,
    `well ${well.width}px; ${inPanel.join("; ") || "nothing"}; page's top row: ${pageTop.join("; ") || "nothing"}; boxes 50–150px meeting the seam: ${touching.join("; ") || "none"}`
  );
}

/** The bench's panel at one pane width and scheme, its canvas loaded (`query` adds to the bench's address); null, said, when it never loads. */
async function openBench(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark",
  query: string
): Promise<Page | null> {
  const page = await kit.page(width < 640 ? "phone" : "desk", {
    theme,
    scale: 2,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n")[0] ?? "");
    }
  });
  await page.setViewportSize({ width: width + 40, height: 844 });
  // The pane's reach check, answered as the hub's preview proxy answers it.
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await page.goto(
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}${query}`
  );
  const ready = await page
    .waitForSelector("[data-bench-pane] iframe.ready", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    const pane = await page.evaluate(
      () =>
        document.querySelector("[data-bench-pane]")?.outerHTML.slice(0, 3000) ??
        `no pane: ${location.href} ${document.body.innerText.slice(0, 600)}`
    );
    kit.check(
      `8: ${width} ${theme}: the canvas loads in the panel`,
      false,
      `${pane} | errors: ${errors.join(" | ")}`
    );
    await page.close();
    return null;
  }
  await page.waitForTimeout(4000);
  return page;
}

/** N7 with the Plan | Preview switch in the head, as the panel stands beside a conversation with a plan. */
async function switchLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  for (const width of [390, 523, 720]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await openBench(kit, bench, stage, width, theme, "&switch=1");
    if (page) {
      await seamLeg(kit, page, `${width} ${theme} with the switch`);
      await page.close();
    }
  }
}

/** The panel at one pane width and scheme, on the bench: the controls that stand in its head (null when it never loaded). */
async function headLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<Set<string> | null> {
  const touch = width < 640;
  const page = await openBench(kit, bench, stage, width, theme, "");
  if (!page) {
    return null;
  }
  const read = await readHead(page);
  const leg = `${width} ${theme}`;
  kit.check(
    `8a: ${leg}: the name is whole or ellipsed, and its own end takes a press`,
    (read.name.whole || read.name.ellipsed) && read.name.under === "name",
    JSON.stringify(read.name)
  );
  kit.check(
    `8b: ${leg}: every head control is 44px tall or reaches 44px through its ::after${touch ? " under a finger" : ""}`,
    !touch || read.bar.every((one) => one.h >= 44 || one.after >= 44),
    read.bar.map((one) => `${one.key} ${one.h}/${one.after}`).join(", ")
  );
  kit.check(
    `8c: ${leg}: the controls past the head's room stand in More`,
    read.bar.length > 0 && (read.more.length > 0 || width >= 640),
    `bar ${read.bar.map((one) => one.key).join(",")}; More ${read.more.join(" | ") || "none"} (${read.moreLabel || "no More"})`
  );
  kit.check(
    `8d: ${leg}: no path line stands under the name`,
    read.path === "",
    read.path || "none"
  );
  kit.note(`head ${leg}: ${read.boxes}`);
  await seamLeg(kit, page, leg);
  const standing = new Set(
    read.bar
      .map((one) => one.key)
      .filter((key) => key !== "more" && key !== "close")
  );
  if (width < 640) {
    kit.check(
      `8e: ${leg}: priority decides who stands, form after: the mode (as one button where its segments have no room) and Comments both stand`,
      standing.has("mode") &&
        standing.has("comments") &&
        !read.more.some((one) => one.startsWith("Mode")),
      `${read.boxes}; More ${read.more.join(" | ")}`
    );
  }
  const commentsInMore = read.more.some((one) => one.startsWith("Comments"));
  if (commentsInMore || read.moreLabel) {
    kit.check(
      `8g: ${leg}: More says Comments' count while it holds Comments, only above 0, in native's words`,
      read.moreLabel === "More" ||
        (commentsInMore && MORE_COUNT.test(read.moreLabel)),
      `${read.moreLabel}; More ${read.more.join(" | ")}`
    );
  }

  if (width < 390) {
    await page.close();
    return standing;
  }
  mkdirSync(CAPS, { recursive: true });
  const name = width < 640 ? String(width) : "desk";
  await page
    .locator("[data-bench-pane]")
    .screenshot({ path: join(CAPS, `canvas-${name}-${theme}.png`) });
  kit.note(`capture: ${join(CAPS, `canvas-${name}-${theme}.png`)}`);
  await page.close();
  return standing;
}

/** A pin as the overlay writes one: open, on the page's body. */
const pinOf = (number: number, at: string) => ({
  id: `00000000-0000-4000-8000-00000000000${number}`,
  number,
  kind: "comment",
  by: "person",
  at,
  anchor: { selector: "body", source: null, text: "" },
  elements: [],
  thread: [
    {
      id: `00000000-0000-4000-8000-00000000010${number}`,
      by: "person",
      text: `Pin ${number}`,
      at,
    },
  ],
});

/**
 * The artifact's live doc as the hub's `/ws/artifact/<session>/<artifact>`
 * serves it (y-websocket's sync protocol), answered in the page's own
 * network: a pick the session has not heard, and the pins `pins()` holds
 * as it changes.
 */
async function serveDoc(page: Page) {
  const yws = Bun.resolveSync("y-websocket", DASHBOARD);
  // The dashboard's own yjs (the probe kit depends on none): the part of it this serves with.
  const Y = (await import(Bun.resolveSync("yjs", DASHBOARD))) as {
    Doc: new () => {
      getMap: (name: string) => { set: (key: string, value: unknown) => void };
      on: (event: "update", run: (update: Uint8Array) => void) => void;
      transact: (run: () => void) => void;
    };
  };
  const sync = await import(Bun.resolveSync("y-protocols/sync", yws));
  const encoding = await import(Bun.resolveSync("lib0/encoding", yws));
  const decoding = await import(Bun.resolveSync("lib0/decoding", yws));
  const doc = new Y.Doc();
  const at = new Date().toISOString();
  doc.getMap("state").set("pick", {
    at,
    note: null,
    options: ["one"],
    pageHash: "bench",
    value: null,
  });
  const sockets: { send: (data: Buffer) => void }[] = [];
  const say = (write: (encoder: unknown) => void) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    write(encoder);
    return Buffer.from(encoding.toUint8Array(encoder));
  };
  doc.on("update", (update: Uint8Array) => {
    for (const ws of sockets) {
      ws.send(say((encoder) => sync.writeUpdate(encoder, update)));
    }
  });
  await page.routeWebSocket(ARTIFACT_SOCKET, (ws) => {
    sockets.push(ws);
    ws.send(say((encoder) => sync.writeSyncStep1(encoder, doc)));
    ws.onMessage((message) => {
      if (typeof message === "string") {
        return;
      }
      const decoder = decoding.createDecoder(new Uint8Array(message));
      if (decoding.readVarUint(decoder) !== 0) {
        return;
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      sync.readSyncMessage(decoder, encoder, doc, null);
      if (encoding.length(encoder) > 1) {
        ws.send(Buffer.from(encoding.toUint8Array(encoder)));
      }
    });
  });
  return {
    pins: (count: number) =>
      doc.transact(() => {
        for (let number = 1; number <= count; number += 1) {
          doc.getMap("pins").set(pinOf(number, at).id, pinOf(number, at));
        }
      }),
  };
}

/** A count element's text, or "none" when it is not drawn (a count of 0 is not). */
const textOr = async (count: Locator): Promise<string> =>
  (await count.count()) > 0
    ? ((await count.first().textContent())?.trim() ?? "")
    : "none";

/** More, read while it holds Comments: its count, its name, the Comments entry, and the panel that entry opens. */
async function readMore(page: Page) {
  const head = "[data-bench-pane] [data-slot=side-head]";
  const trigger = page.locator(`${head} [data-slot=more]`);
  const said = {
    standing: await page.evaluate(
      (sel) =>
        [...(document.querySelector(sel) as HTMLElement).children]
          .filter((one) => !(one as HTMLElement).hidden)
          .map((one) => {
            const el = one as HTMLElement;
            const box = one.getBoundingClientRect();
            return `${el.dataset.headItem ?? el.dataset.slot ?? el.className.split(" ")[0]}${el.dataset.form === "compact" ? "(one button)" : ""} x${Math.round(box.x)} w${Math.round(box.width)}`;
          })
          .join(", "),
      head
    ),
    count: await textOr(trigger.locator(".more-count")),
    label: (await trigger.getAttribute("aria-label")) ?? "",
    entry: "",
    opened: false,
  };
  await trigger.click();
  const entry = page
    .locator("[data-slot=dropdown-menu-content] [role=menuitem]")
    .filter({ hasText: "Comments" });
  said.entry = `${(await entry.textContent())?.trim()} (menu-count ${await textOr(entry.locator(".menu-count"))})`;
  await entry.click();
  said.opened = await page
    .locator("[data-pin-list-pop]")
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return said;
}

/** 8h: Comments in More, at 330 with Send picks standing, at 0 open pins and at 2, under a finger. */
async function moreHoldsComments(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("phone", { theme, scale: 2 });
  await page.setViewportSize({ width: 370, height: 844 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  const doc = await serveDoc(page);
  await page.goto(
    `${bench}/motion/artifact-head?w=330&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  await page.waitForSelector("[data-bench-pane] [data-slot=send]", {
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  for (const open of [0, 2]) {
    if (open > 0) {
      doc.pins(open);
      // biome-ignore lint/performance/noAwaitInLoops: the pins land, then the head is read
      await page.waitForTimeout(1200);
    }
    const said = await readMore(page);
    const count = open > 0 ? String(open) : "none";
    const label = open > 0 ? `More, Comments ${open} open` : "More";
    kit.check(
      `8h: 330 ${theme}, Send picks standing, ${open} open: Comments goes to More, whose count is ${count}, named "${label}", its entry's count ${count}, and choosing it opens the Comments panel`,
      said.standing.includes("send") &&
        !said.standing.includes("comments") &&
        said.count === count &&
        said.label === label &&
        said.entry.endsWith(`(menu-count ${count})`) &&
        said.opened,
      JSON.stringify(said)
    );
  }
  await page.close();
}

/** 8i: Comments itself in the head, at 720, at 0 open pins and at 2: its count drawn only above 0, its name saying it only then. */
async function commentsCount(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { theme });
  await page.setViewportSize({ width: 760, height: 844 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  const doc = await serveDoc(page);
  await page.goto(
    `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  const button = page.locator(
    "[data-bench-pane] [data-slot=side-head] button[data-slot=comments]"
  );
  await button.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  for (const open of [0, 2]) {
    if (open > 0) {
      doc.pins(open);
      // biome-ignore lint/performance/noAwaitInLoops: the pins land, then the head is read
      await page.waitForTimeout(1200);
    }
    const said = {
      count: await textOr(button.locator("[data-slot=count]")),
      label: (await button.getAttribute("aria-label")) ?? "",
    };
    const count = open > 0 ? String(open) : "none";
    const label = open > 0 ? `Comments, ${open} open` : "Comments";
    kit.check(
      `8i: 720 ${theme}, ${open} open: Comments' count is ${count} and its name "${label}"`,
      said.count === count && said.label === label,
      JSON.stringify(said)
    );
  }
  await page.close();
}

/**
 * N7: the canvas page as a desk's side panel draws it, under 640px wide so
 * the phone's band and strip stand, with a mouse's fine pointer: every edge
 * drawn on the head's foot (±3px) is read, and the head's own full-width
 * foot is the only one.
 */
async function footLeg(
  kit: Kit,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { init: [PAINT], theme });
  await page.setViewportSize({ width: 560, height: 844 });
  await page.goto(`${stage.base}${canvasPath()}`);
  await drawn(page);
  const foot = await page.evaluate(
    () =>
      document
        .getElementById("cawco-chrome")
        ?.shadowRoot?.querySelector(".head")
        ?.getBoundingClientRect().bottom ?? 0
  );
  // The head's own shadow aside (it is the head's), every border, outline and shadow on its foot.
  const edges = (
    await page.evaluate(EDGES_AT, { at: foot, inside: "*", shadows: true })
  ).filter((one) => !one.startsWith("div.head shadow"));
  // And, said only, everything painting a line or a shadow within 10px over the foot: where a line read as on the seam may really stand.
  const over = (
    await Promise.all(
      [4, 7, 10].map((up) =>
        page.evaluate(EDGES_AT, { at: foot - up, inside: "*", shadows: true })
      )
    )
  ).flat();
  const strip = await page.evaluate(() => {
    const root = document.getElementById("cawco-chrome")
      ?.shadowRoot as ShadowRoot;
    return getComputedStyle(root.querySelector(".strip") as Element).display;
  });
  kit.check(
    `N7: 560 desk pointer ${theme}: on the foot of the band and strip only the head's own full-width edge is drawn`,
    strip !== "none" &&
      edges.length === 1 &&
      edges[0]?.startsWith("div.head bottom 1px") === true &&
      edges[0]?.endsWith(" 560px") === true,
    `strip ${strip}; head foot at ${Math.round(foot)}; ${edges.join("; ") || "nothing"}; within 10px over it: ${[...new Set(over)].join("; ") || "nothing"}`
  );
  await page.close();
}

const spec: Spec = {
  name: "canvas-design",
  run: async (kit) => {
    const stage = await stageOf();
    // `CANVAS_DESIGN=head` or `=page` runs that half alone.
    const only = process.env.CANVAS_DESIGN;
    try {
      for (const theme of only === "head" ? [] : (["light", "dark"] as const)) {
        for (const width of [390, 523, 1024]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time
          await canvasLeg(kit, stage, width, theme);
        }
        await footLeg(kit, stage, theme);
      }
      const bench = await kit.bench();
      for (const theme of only === "page" ? [] : (["light", "dark"] as const)) {
        const stood: [number, Set<string> | null][] = [];
        for (const width of [330, 390, 523, 720]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time
          stood.push([width, await headLeg(kit, bench, stage, width, theme)]);
        }
        kit.check(
          `8f: ${theme}: the controls standing at a wider pane hold every one that stood at a narrower one`,
          stood.every(([, keys], at) => {
            const narrower = at === 0 ? new Set<string>() : stood[at - 1]?.[1];
            return (
              !!keys &&
              !!narrower &&
              [...narrower].every((key) => keys.has(key))
            );
          }),
          stood
            .map(
              ([width, keys]) =>
                `${width}: ${keys ? [...keys].join(",") : "never loaded"}`
            )
            .join("; ")
        );
        await moreHoldsComments(kit, bench, stage, theme);
        await commentsCount(kit, bench, stage, theme);
        await switchLeg(kit, bench, stage, theme);
      }
    } finally {
      stage.stop();
    }
  },
};
export default spec;
