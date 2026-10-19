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
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type { CanvasSpec } from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const DASHBOARD = join(ROOT, "apps/dashboard");
/** The artifact's live doc on the dashboard's own origin (artifact-doc.ts `joinArtifact`). */
const ARTIFACT_SOCKET = /\/ws\/artifact\//;
/** More's name while it holds Comments: native's words (PreviewController.swift). */
const MORE_COUNT = /^More, Comments \d+ open$/;
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
};

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

/** The panel at one pane width and scheme, on the bench: the controls that stand in its head (null when it never loaded). */
async function headLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<Set<string> | null> {
  const touch = width < 640;
  const page = await kit.page(touch ? "phone" : "desk", { theme, scale: 2 });
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
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  const ready = await page
    .waitForSelector("[data-bench-pane] iframe.ready", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    const said = await page.evaluate(
      () =>
        document.querySelector("[data-bench-pane]")?.outerHTML.slice(0, 3000) ??
        `no pane: ${location.href} ${document.body.innerText.slice(0, 600)}`
    );
    kit.check(
      `8: ${width} ${theme}: the canvas loads in the panel`,
      false,
      `${said} | errors: ${errors.join(" | ")}`
    );
    await page.close();
    return null;
  }
  await page.waitForTimeout(4000);
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
      `8g: ${leg}: More says Comments' count while it holds Comments, 0 too, in native's words`,
      commentsInMore
        ? MORE_COUNT.test(read.moreLabel)
        : read.moreLabel === "More",
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
    // A count of none is not drawn on More: no element to read then.
    count:
      (await trigger.locator(".more-count").count()) > 0
        ? ((await trigger.locator(".more-count").textContent()) ?? "none")
        : "none",
    label: (await trigger.getAttribute("aria-label")) ?? "",
    entry: "",
    opened: false,
  };
  await trigger.click();
  const entry = page
    .locator("[data-slot=dropdown-menu-content] [role=menuitem]")
    .filter({ hasText: "Comments" });
  said.entry = `${(await entry.textContent())?.trim()} (menu-count ${await entry.locator(".menu-count").textContent()})`;
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
    // More says the count only above 0; its Comments entry says it always.
    const count = open > 0 ? String(open) : "none";
    const label = open > 0 ? `More, Comments ${open} open` : "More";
    kit.check(
      `8h: 330 ${theme}, Send picks standing, ${open} open: Comments goes to More, which ${open > 0 ? `says "${open}" and "${label}"` : 'draws no count and says "More"'}, its entry says ${open}, and choosing it opens the Comments panel`,
      said.standing.includes("send") &&
        !said.standing.includes("comments") &&
        said.count === count &&
        said.label === label &&
        said.entry.endsWith(`(menu-count ${open})`) &&
        said.opened,
      JSON.stringify(said)
    );
  }
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
      }
    } finally {
      stage.stop();
    }
  },
};
export default spec;
