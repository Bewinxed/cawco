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
 *    `selected-ink`, 4.5:1); the inspector's story by DESIGN.md's
 *    selected marks, never the focus ring's shape: its label's words in
 *    `selected-ink` and a 1px `border-control-strong` edge flush on its
 *    box (a box-shadow; no outline), meeting neither its label nor its
 *    status.
 * 4. A pressed ghost is `surface-pressed`, the current outline row
 *    `selected-bg` with `selected-ink`.
 * 5. The state chips are 30px at `radius-sm` with a 44px touch area under a
 *    finger, the chosen one edged in `brand-solid` (3:1 on the strip); the
 *    story picker is the input recipe, edged in `border-button-outline`
 *    (3:1), with the sort-vertical glyph.
 * 6. An unnamed story's label says "Unnamed" in meta, upright; a label never
 *    repeats its name under it; a section is named in words (no path, no
 *    `.stories`) over its file in meta ink (owner: "the hyperlink thing"),
 *    never underlined; the steps lead and end with Solar's chevrons, no ◀ ▶.
 * 7. The house faces load: `document.fonts.check('500 13px "Figtree
 *    Variable"')`, and JetBrains Mono's once asked for (the page sets no
 *    code at rest; a failed section's details do).
 *
 * The panel (the bench) at 390, 523 and 720, light and dark:
 * 8. (330 too, where the mode stands as one button; and 8h, at 330 with
 *    Send standing, Comments in More at 0 and 2 open pins.)
 *    The name is whole or ellipsed, never under another control; every
 *    head control is 44px tall or reaches 44px through its ::after under a
 *    finger; the controls past the head's room stand in More, in head
 *    order; under the name stands the canvas's ask, one line inside
 *    the head and whole in its tooltip, and no text in the pane holds a
 *    route (owner: "the url should have the description there instead").
 *
 * Map mode on the bench (CanvasMap), at a 720 pane and at 390, light and
 * dark, the hub's map answered by the probe, the live card on the stage:
 * 10. Opened from the head's canvas view (Map), the map stands over the
 *    page: on the desk a graph with the used-in cards above the canvas's
 *    card and the made-of cards below, an edge each, every card inside the
 *    pane; each card counts its states; the canvas's card is chosen and
 *    live (its canvas page, `by=map`, drawn), the others the report's
 *    thumbnail (a rect per frame) or "Not drawn yet". Choosing another
 *    card makes it the live one. The live page posts no report. On a phone
 *    the map is a list: Used in, This canvas, Made of, each card inside it.
 *
 * 8i. In a tab of its own (`/artifact/<id>`, the bench's `own=1`), the
 *    canvas is named once, by its head, its ask on the line under the
 *    name; its page, framed there, names neither.
 * 10d. At the desk, the canvas view's Verify asks the hub once
 *    (`POST …/verify`) and toasts the hub's answer.
 * 12. The owner's crash on nightly 4202 ("i selected plan view and got
 *    this in the side panel": the panel's error boundary): the panel,
 *    showing a page or a canvas, with Inspect shut or open and a canvas
 *    view kept for the session and the page connected (the loop's
 *    condition: the overlay's `cawco:ready`, posted by the frame here), switches to a
 *    canvas whose states file does not exist and whose stage failed
 *    (plan-view's own state); it draws that canvas's failed state in the
 *    pane, its name in the head and its ask under it, and nothing throws.
 * 11. A stage that failed (its doc's `meta.stage` in error, with the words
 *    nightly 4202's hub answered: "Cannot find package 'playwright-core'
 *    imported from /$bunfs/root/cawco") says so where the page would be:
 *    its title, the plain line and Try again, the stage's own words under
 *    Show details only, folded until pressed and then whole; never blank.
 * 13. A canvas whose states file doesn't exist, its doc's stage `live` as
 *    the hub keeps it (the owner's delegate canvas, stuck on "Compiling…"):
 *    within 5 s the canvas says "<Name>'s states file isn't there yet, so
 *    none of its stories are drawn.", the stage's words ("… does not exist
 *    …") under Show details on a ground recessed from its card (in light
 *    too), and the pane never says "Compiling…". The frame says `cawco:ready` only for an HTML answer, as
 *    the hub's proxy injects the overlay only into one.
 * 14. The same for a states file that doesn't compile: "<Name> doesn't
 *    compile, …", Vite's compile error under Show details (not the
 *    browser's "Failed to fetch dynamically imported module"), its place
 *    whole on one line with its full text as a title, and Vite's code frame.
 *    The doc's side of both: the stage keeps the missing file as kind
 *    `missing` in its words and the broken one as kind `compile` at its
 *    place, each filed under its own states file; the pane, its doc carrying
 *    the missing one, titles it "Not written yet:", never "Doesn't
 *    compile:"; written, the open canvas draws the section within 5 s with
 *    no reopen or reload and the problem goes; taken away again it is back.
 * 15. A canvas whose stage the hub's last read couldn't reach (the doc's
 *    `meta.unreached` beside a `live` stage) says so where the page would
 *    be: the machine isn't answering, "Not reached since <when>: <why>", and
 *    Try again. (`CANVAS_DESIGN=refused` runs it after 13 and 14.)
 * 16. That hop back with no read and no stage frame (a scratch hub; the
 *    machine's agent registers): the docs no longer say machine or reach
 *    unreached (a workspace's waits for its stage's word), and the pane on
 *    such a doc stands no down card and no "Not reached since" at any
 *    sample until its page has drawn. (`CANVAS_DESIGN=refused` too.)
 * 17. `reach` on a stage that never dropped (seeded after the machine
 *    registered, on the live stage), shown in a session's panel on the
 *    dashboard with no read and no frame: the page's own requests answered
 *    by the stage through the hub's relay take it away by the time the page
 *    has drawn, and the pane stands no card at any sample.
 *    (`CANVAS_DESIGN=refused` runs 13 and 14 alone.)
 *
 * The bench head swept every px from 300 to 800, light, desk pointer, for a
 * component canvas and a plain preview, with Send standing and
 * without, at 0 and 2 open pins (W0–W4, `CANVAS_DESIGN=sweep` alone): a
 * wider head stands every control a narrower one does, no width alternates
 * between frames, the way down stands what the way up did, and the head's
 * width (what the words key on) is the content box of the size container
 * the old `@container (width < 640px)` label rule queried. D
 * (`CANVAS_DESIGN=desk` alone): at session-sheet leg 18's 523px desk pane
 * that box is under 640 and Comments' word is not drawn.
 *
 * Captures for a second review (never read here) go to the run's output
 * folder (`kit.out`): `canvas-{390,523,desk}-{light,dark}.png`, the panel's
 * pane at 2×, and `map-{desk,phone}-{light,dark}.png`.
 */
import { Database } from "bun:sqlite";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type {
  CanvasMap,
  CanvasSpec,
  StageError,
  StageState,
} from "../../../packages/core/src/stage";
import { commentWords } from "../../../packages/core/src/words/comments";
import { commonWords } from "../../../packages/core/src/words/common";
import { previewWords } from "../../../packages/core/src/words/preview";
import { sheetWords } from "../../../packages/core/src/words/sheet";
import { shellWords } from "../../../packages/core/src/words/shell";
import { MACHINE, until } from "../../scratch-fleet";
import { type Kit, open as openPage, ROOT, type Spec, specOut } from "../kit";
import { shaped } from "../words";

const DASHBOARD = join(ROOT, "apps/dashboard");
/** The artifact's live doc on the dashboard's own origin (artifact-doc.ts `joinArtifact`). */
const ARTIFACT_SOCKET = /\/ws\/artifact\//;
/** More's name while it holds Comments: native's words (PreviewController.swift). */
const MORE_COUNT = /^More, Comments [1-9]\d* open$/;
/** The crumb's words: which frame of how many. */
const FRAME_COUNT = /^Frame \d+ of \d+$/;
const CAPS = specOut("canvas-design");
/** A states file of the probe's own, in the stage's git-ignored folder: one story with no doc comment. */
const UNNAMED_FILE = ".cawco/probe/Unnamed.stories.ts";
const FILES = [
  "src/lib/cawco/StatTile.stories.ts",
  "src/lib/cawco/turn/Who.stories.ts",
  UNNAMED_FILE,
];
/** The canvas's ask: what its frame carries to the head's line under the name. */
const ASK = "Judge the stat tile, the speaker line and an unnamed story";
const CANVAS: CanvasSpec = {
  name: "Dashboard parts",
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
  /** The host's last `errors` word to the daemon (stage-host host.ts `tellErrors`): every section problem it keeps; null before it said one. */
  errors: () => StageError[] | null;
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
    errors: () => {
      const said = words
        .split("\n")
        .filter((line) => line.startsWith('{"cawco":"errors"'))
        .at(-1);
      return said
        ? (JSON.parse(said) as { errors: StageError[] }).errors
        : null;
    },
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
  ring: {
    clear: boolean;
    outline: string;
    shadow: string;
    edge: string;
    ink: [string, string];
  } | null;
  row: { bg: [string, string]; ink: [string, string] } | null;
  sectionFile: {
    color: string;
    decoration: string;
    font: string;
    muted: string;
    size: string;
    text: string;
    title: string;
  } | null;
  steps: { glyphs: number; arrows: boolean } | null;
  unnamed: { text: string; style: string; font: string; small: string } | null;
}

/** One page's reading of every finding on the canvas. */
async function readCanvas(page: Page): Promise<PageRead> {
  // The mono face loads when code is drawn (a failed section's details), not at rest: asked for here, it must come from the stage.
  await page.evaluate(() =>
    document.fonts.load('400 12px "JetBrains Mono Variable"')
  );
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
      // The edge is a 1px box-shadow flush on the body's box.
      const reach = 1;
      const r = body.getBoundingClientRect();
      const top = r.top - reach;
      const bottom = r.bottom + reach;
      const l = (
        selected.querySelector(".cawco-frame-label") as Element
      ).getBoundingClientRect();
      const st = (
        selected.querySelector(".cawco-frame-status") as Element
      ).getBoundingClientRect();
      const named = selected.querySelector(".cawco-frame-words") as Element;
      ring = {
        clear: l.bottom <= top + 0.01 && st.top >= bottom - 0.01,
        outline: style.outlineStyle,
        // Its colour, the lengths taken out; then its lengths alone.
        shadow: `${w.__rgb(
          style.boxShadow.replace(/\s*-?[\d.]+px/g, "").trim()
        )} ${(style.boxShadow.match(/-?[\d.]+px/g) ?? []).join(" ")}`,
        edge: `${w.__token("--border-control-strong", body, "color")} 0px 0px 0px 1px`,
        ink: [
          w.__rgb(getComputedStyle(named).color),
          w.__token("--selected-ink", named, "color"),
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
            size: getComputedStyle(file).fontSize,
            decoration: getComputedStyle(file).textDecorationLine,
            color: w.__rgb(getComputedStyle(file).color),
            muted: w.__token("--ink-muted", file, "color"),
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
  await worldLeg(kit, page, `${width} ${theme}`);
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
    `3b: ${leg}: the inspector's story wears the selected marks (its label's words in selected-ink, a 1px border-control-strong edge flush on its box), no outline in the focus ring's shape, clear of its label and status`,
    !!read.ring &&
      read.ring.clear &&
      read.ring.outline === "none" &&
      read.ring.shadow === read.ring.edge &&
      same(read.ring.ink),
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
    `6b: ${leg}: a section is named in words over its file in meta ink, never underlined`,
    !!read.sectionFile &&
      read.sectionFile.font.includes("Figtree") &&
      read.sectionFile.size === "12px" &&
      read.sectionFile.color === read.sectionFile.muted &&
      read.sectionFile.decoration === "none" &&
      read.sectionFile.text.endsWith(".stories.ts") &&
      read.sectionFile.title.length > 0 &&
      !read.sectionFile.title.includes("/") &&
      !read.sectionFile.title.includes(".stories"),
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
  /** The line under the name: its words, its tooltip, whether it stands on one line inside the head. */
  line: {
    inside: boolean;
    oneLine: boolean;
    text: string;
    tooltip: string;
  } | null;
  more: string[];
  moreLabel: string;
  name: { whole: boolean; ellipsed: boolean; under: string; width: number };
  /** Whether any text in the pane holds a stage route. */
  route: boolean;
}

/** The bench's head: what stands, what went to More, the name, the touch areas. */
async function readHead(page: Page): Promise<HeadRead> {
  const read = await page.evaluate(() => {
    const head = document.querySelector(
      "[data-bench-pane] [data-slot=side-head]"
    ) as HTMLElement;
    const trigger = head.querySelector(
      "[data-slot=identity] > *"
    ) as HTMLElement;
    const name = trigger.querySelector(
      "[data-slot=artifact-name]"
    ) as HTMLElement;
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
      line: (() => {
        const line = head.querySelector<HTMLElement>("[data-slot=subtitle]");
        const box = line?.getBoundingClientRect();
        const edge = head.getBoundingClientRect();
        return line && box
          ? {
              text: line.textContent ?? "",
              tooltip: line.title,
              inside:
                box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5,
              oneLine:
                box.height <=
                Number.parseFloat(getComputedStyle(line).lineHeight) + 1,
            }
          : null;
      })(),
      route: (
        document.querySelector("[data-bench-pane]")?.textContent ?? ""
      ).includes("/@cawco/"),
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
  // An element by its hook: its slot, else its first data attribute, else
  // its first class (the canvas chrome's own DOM keeps classes).
  const hookOf = (el: Element) => {
    const slot = el.getAttribute("data-slot");
    if (slot) {
      return `[data-slot=${slot}]`;
    }
    const data = [...el.attributes].find((a) => a.name.startsWith("data-"));
    if (data) {
      return `[${data.name}]`;
    }
    const [first] = String(el.className).split(" ");
    return first ? `.${first}` : "";
  };
  const named = (el: Element, r: DOMRect, what: string) =>
    `${el.tagName.toLowerCase()}${hookOf(el)} ${what} ${Math.round(r.width)}px`;
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
  // N7's cause, framed: the world clear of the page's head in the panel, after load and after Zoom to fit.
  if (canvasFrame) {
    const loaded = await canvasFrame.evaluate(WORLD_TOP);
    keepLoadX(`${leg} in the panel`, loaded.x);
    await canvasFrame.evaluate(() =>
      dispatchEvent(
        new CustomEvent("cawco:canvas-view", { detail: { zoom: "fit" } })
      )
    );
    await page.waitForTimeout(400);
    const fitted = await canvasFrame.evaluate(WORLD_TOP);
    kit.check(
      `N7b: ${leg} in the panel: the world never stands under the page's head, after load and after Zoom to fit`,
      loaded.clear && fitted.clear,
      `loaded: ${loaded.said}; fitted: ${fitted.said}`
    );
  }
  const band = canvasFrame
    ? await canvasFrame.evaluate(() => {
        const root = document.getElementById("cawco-chrome")
          ?.shadowRoot as ShadowRoot;
        const name = root.querySelector(".name") as HTMLElement;
        return {
          nameShown: getComputedStyle(name).display !== "none",
          lines: root.querySelectorAll(".band > div:not(.name, .crumb, .tools)")
            .length,
          crumb:
            (root.querySelector(".crumb .num") as HTMLElement | null)
              ?.textContent ?? "",
        };
      })
    : null;
  kit.check(
    `7d: ${leg}: in the panel the band says neither the name nor the ask the head says, and its crumb counts frames only`,
    !!band &&
      !band.nameShown &&
      band.lines === 0 &&
      FRAME_COUNT.test(band.crumb),
    JSON.stringify(band)
  );
  const well = await page.evaluate(() => {
    const box = (
      document.querySelector(
        "[data-bench-pane] [data-side-well]"
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
  ).filter((one) => !one.startsWith("div[data-side-well] shadow"));
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
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}${query}`
  );
  const ready = await page
    .waitForSelector("[data-bench-pane] iframe[data-ready]", {
      timeout: 60_000,
    })
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
    `8d: ${leg}: under the name stands the canvas's ask, one line inside the head, whole in its tooltip; no text in the pane holds a route`,
    !!read.line &&
      read.line.text === ASK &&
      read.line.tooltip === ASK &&
      read.line.inside &&
      read.line.oneLine &&
      !read.route,
    `${JSON.stringify(read.line)}; route in the pane: ${read.route}`
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

/** The hub's map of the bench's canvas, as the probe answers it: StatTile, two that render it, two it renders. */
const MAP: CanvasMap = {
  center: {
    name: "StatTile",
    file: "apps/dashboard/src/lib/cawco/StatTile.svelte",
    at: null,
    states: 3,
    drawn: 2,
    statesFiles: ["src/lib/cawco/StatTile.stories.ts"],
    thumb: {
      w: 384,
      h: 216,
      frames: [
        { x: 0, y: 0, w: 180, h: 84, state: "drawn" },
        { x: 204, y: 0, w: 180, h: 84, state: "drawn" },
        { x: 0, y: 132, w: 180, h: 84, state: "failed" },
      ],
    },
  },
  usedIn: [
    {
      name: "Who",
      file: "apps/dashboard/src/lib/cawco/turn/Who.svelte",
      at: "apps/dashboard/src/lib/cawco/turn/Who.svelte:12:3",
      states: 2,
      drawn: 2,
      statesFiles: ["src/lib/cawco/turn/Who.stories.ts"],
      thumb: {
        w: 300,
        h: 40,
        frames: [
          { x: 0, y: 0, w: 140, h: 40, state: "drawn" },
          { x: 160, y: 0, w: 140, h: 40, state: "drawn" },
        ],
      },
    },
    {
      name: "ViewHome",
      file: "apps/dashboard/src/lib/cawco/views/ViewHome.svelte",
      at: null,
      states: 0,
      drawn: 0,
      statesFiles: [],
      thumb: null,
    },
  ],
  madeOf: [
    {
      name: "NumberFlow",
      file: "apps/dashboard/src/lib/cawco/NumberFlow.svelte",
      at: "apps/dashboard/src/lib/cawco/StatTile.svelte:30:5",
      states: 0,
      drawn: 0,
      statesFiles: [],
      thumb: null,
    },
    {
      name: "Tooltip",
      file: "apps/dashboard/src/lib/components/ui/tooltip/tooltip.svelte",
      at: null,
      states: 0,
      drawn: 0,
      statesFiles: [],
      thumb: null,
    },
  ],
};
/** The Who card's name, whole: Playwright's `hasText` alone also finds "vie(wHo)me". */
const WHO = /^Who$/;
/** The bench's artifact (motion/artifact-head), and the one it switches to with `then`. */
const BENCH_ARTIFACT = "00000000-0000-4000-8000-0000000000a1";
const BENCH_THEN = "00000000-0000-4000-8000-0000000000a2";
/** The bench's session (motion/artifact-head). */
const BENCH_INSTANCE = "bench-artifact-head";

/** The canvas view's menu opened from the head: its own button where it stands, else More's Canvas view. */
async function openView(page: Page): Promise<void> {
  const own = page.locator(
    '[data-bench-pane] [data-head-item="view"]:not([hidden]) [aria-label="Canvas view"]'
  );
  if (await own.count()) {
    await own.click();
  } else {
    await page.locator("[data-bench-pane] [data-slot=more]").click();
    await page
      .locator("[data-slot=dropdown-menu-sub-trigger]", {
        hasText: previewWords.canvasView,
      })
      .click();
  }
}

/** Map mode turned on from the head's canvas view. */
async function openMap(page: Page): Promise<void> {
  await openView(page);
  await page.getByRole("menuitemcheckbox", { name: "Map" }).click();
  await page.keyboard.press("Escape");
}

/** The hub's answer to a Verify, as the probe gives it. */
const VERIFY_SAID =
  "A verifier session (never you) is checking it against the project's design system now; its findings come to you as one message, each a must-fix.";

/** The map's cards as drawn: each one's role, box, words, whether it is chosen and live, and its thumbnail. */
const readMap = (page: Page) =>
  page.evaluate(() => {
    const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
    const room = (
      pane.querySelector("[data-slot=canvas-map]") as HTMLElement
    ).getBoundingClientRect();
    const cards = [
      ...pane.querySelectorAll<HTMLElement>("[data-slot=map-card]"),
    ].map((card) => {
      const box = card.getBoundingClientRect();
      return {
        role: card.dataset.role,
        name: card.querySelector("[data-slot=map-name]")?.textContent ?? "",
        counts: card.querySelector("[data-slot=map-counts]")?.textContent ?? "",
        chosen: card.hasAttribute("data-chosen"),
        live: card.querySelector("iframe")?.getAttribute("src") ?? null,
        rects: card.querySelectorAll("svg[data-slot=map-thumb] rect").length,
        none: card.querySelector("p[data-slot=map-thumb]")?.textContent ?? null,
        top: box.top,
        bottom: box.bottom,
        across: box.left >= room.left - 0.5 && box.right <= room.right + 0.5,
        inside:
          box.left >= room.left - 0.5 &&
          box.right <= room.right + 0.5 &&
          box.top >= room.top - 0.5 &&
          box.bottom <= room.bottom + 0.5,
      };
    });
    return {
      cards,
      edges: pane.querySelectorAll(".svelte-flow__edge").length,
      graph: !!pane.querySelector(".svelte-flow"),
      list: !!pane.querySelector("[data-slot=map-list]"),
      groups: [...pane.querySelectorAll("[data-slot=map-list] h3")].map(
        (one) => one.textContent ?? ""
      ),
      legend: (pane.querySelector("[data-slot=legend]")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    };
  });

/** Leg 10: Map mode at one pane width and scheme, on the bench. */
async function mapLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<void> {
  const phone = width < 640;
  const page = await kit.page(phone ? "phone" : "desk", { theme, scale: 2 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mapPosts = 0;
  let panelPosts = 0;
  page.on("request", (request) => {
    if (!request.url().includes("/@cawco/rendered")) {
      return;
    }
    if (request.frame().url().includes("by=map")) {
      mapPosts += 1;
    } else {
      panelPosts += 1;
    }
  });
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await page.route(
    `**/api/instances/${BENCH_INSTANCE}/artifacts/*/map`,
    (route) => route.fulfill({ json: MAP })
  );
  await page.goto(
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
  );
  await page.waitForSelector("[data-bench-pane] iframe[data-ready]", {
    timeout: 60_000,
  });
  await openMap(page);
  await page.waitForSelector("[data-bench-pane] [data-slot=map-card] iframe", {
    timeout: 30_000,
  });
  // The live card's page drawn: its canvas's report, read in its own frame.
  const liveSections = async (): Promise<number> => {
    const frame = page.frames().find((one) => one.url().includes("by=map"));
    if (!frame) {
      return 0;
    }
    try {
      return await frame.evaluate(
        () =>
          (
            window as unknown as {
              __cawcoCanvas?: { report: { sections: unknown[] } | null };
            }
          ).__cawcoCanvas?.report?.sections.length ?? 0
      );
    } catch {
      // The frame went or navigated as it was read: read it again.
      return 0;
    }
  };
  const drewLive = await until(
    "the live card's canvas drawn",
    liveSections,
    (sections) => sections > 0,
    60_000
  ).catch(() => 0);
  await page.waitForTimeout(1500);
  const leg = `${phone ? "390" : "desk"} ${theme}`;
  const read = await readMap(page);
  const center = read.cards.find((one) => one.role === "center");
  const used = read.cards.filter((one) => one.role === "usedIn");
  const made = read.cards.filter((one) => one.role === "madeOf");
  const who = used.find((one) => one.name === "Who");
  const home = used.find((one) => one.name === "ViewHome");
  const cardsSaid =
    read.cards.length === 5 &&
    center?.chosen === true &&
    !!center.live?.includes("by=map") &&
    center.counts === "3 states · 2 drawn" &&
    who?.rects === 2 &&
    who.counts === "2 states · 2 drawn" &&
    home?.none === "Not drawn yet" &&
    home.counts === "No states file" &&
    drewLive > 0;
  if (phone) {
    kit.check(
      `10: ${leg}: Map is a list (Used in, This canvas, Made of), every card across it, opened on the canvas's own card, chosen and live (its page drawn, by=map), the others the report's thumbnail or "Not drawn yet"`,
      read.list &&
        !read.graph &&
        read.groups.join(",") === "Used in,This canvas,Made of" &&
        read.cards.every((one) => one.across) &&
        center?.inside === true &&
        cardsSaid,
      `${JSON.stringify(read)}; live canvas drew ${drewLive} sections`
    );
  } else {
    kit.check(
      `10: ${leg}: Map is a graph over the page, used in above the canvas's card and made of below, an edge each, every card inside the pane; the canvas's card chosen and live (its page drawn, by=map), the others the report's thumbnail or "Not drawn yet"`,
      read.graph &&
        !read.list &&
        !!center &&
        used.length === 2 &&
        made.length === 2 &&
        used.every((one) => one.bottom < center.top) &&
        made.every((one) => one.top > center.bottom) &&
        read.edges === 4 &&
        read.cards.every((one) => one.inside) &&
        read.legend.includes("(2)") &&
        cardsSaid,
      `${JSON.stringify(read)}; live canvas drew ${drewLive} sections`
    );
  }
  mkdirSync(CAPS, { recursive: true });
  await page.locator("[data-bench-pane]").screenshot({
    path: join(CAPS, `map-${phone ? "phone" : "desk"}-${theme}.png`),
  });
  kit.note(
    `capture: ${join(CAPS, `map-${phone ? "phone" : "desk"}-${theme}.png`)}`
  );

  // Another card chosen: it draws live, the canvas's card its thumbnail.
  await page
    .locator("[data-bench-pane] [data-slot=map-card][data-role=usedIn]")
    .filter({
      has: page.locator("[data-slot=map-name]", { hasText: WHO }),
    })
    .locator("button")
    .click();
  await page.waitForTimeout(1500);
  const after = await readMap(page);
  const whoNow = after.cards.find((one) => one.name === "Who");
  const centerNow = after.cards.find((one) => one.role === "center");
  kit.check(
    `10b: ${leg}: choosing Who makes it the live card (its states file, by=map) and the canvas's card its thumbnail; the live page posted no report while the panel's page did`,
    whoNow?.chosen === true &&
      !!whoNow.live?.includes("Who.stories.ts") &&
      !!whoNow.live.includes("by=map") &&
      centerNow?.chosen === false &&
      centerNow.rects === 3 &&
      mapPosts === 0 &&
      panelPosts > 0,
    `Who ${JSON.stringify(whoNow)}; canvas ${JSON.stringify(centerNow)}; report posts from the live page ${mapPosts}, from the panel's ${panelPosts}`
  );
  if (!phone) {
    let asked = 0;
    await page.route(
      `**/api/instances/${BENCH_INSTANCE}/artifacts/*/verify`,
      (route) => {
        asked += 1;
        return route.fulfill({ json: { verify: VERIFY_SAID } });
      }
    );
    await openView(page);
    await page
      .getByRole("menuitem", { name: previewWords.verifyDesign })
      .click();
    const toasted = await page
      .locator("[data-sonner-toast]", { hasText: VERIFY_SAID })
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    kit.check(
      `10d: ${leg}: the canvas view's Verify asks the hub once and says the hub's answer`,
      asked === 1 && toasted,
      `${asked} POST …/verify; the answer ${toasted ? "toasted" : "not shown"}`
    );
  }
  kit.check(
    `10c: ${leg}: no page errors with the map open`,
    errors.length === 0,
    errors.join(" | ") || "none"
  );
  await page.close();
}

/** Leg 12's second canvas: plan-view's, its states file missing, its stage failed as the hub kept it. */
const MISSING_FILE = "src/lib/cawco/plan/proposal/PlanFrame.stories.ts";
const THEN_ASK = "Judge the plan view's frame";
const thenPath = () =>
  `/@cawco/canvas?file=${encodeURIComponent(MISSING_FILE)}&spec=${encodeURIComponent(JSON.stringify({ name: "plan-view" }))}`;
const missingStage = (): StageState => ({
  runs: "sheet",
  toolchain: "vite",
  status: "error",
  dir: "apps/dashboard",
  at: new Date().toISOString(),
  errors: [],
  message: `apps/dashboard/${MISSING_FILE} does not exist in /home/bewinxed/.worktrees/cockpit-b146f292. Write it, then call again.`,
});

/** Leg 12: the panel switches into a canvas whose stage failed, from a page or a canvas, Inspect shut or open. */
async function artifactSwitchLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  for (const from of ["page", "component"] as const) {
    for (const inspect of [false, true]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const page = await kit.page("desk", { theme, scale: 2 });
      // What the page threw (the bench has no hub, so its requests' refusals are not the page's).
      const errors: string[] = [];
      page.on("pageerror", (error) =>
        errors.push(`${error.message} ${error.stack?.split("\n")[1] ?? ""}`)
      );
      page.on("console", (message) => {
        const text = message.text();
        // The canvas page's own words (Vite's client saying the missing states file's module failed) are its section's to show, not the panel's throws.
        if (
          message.type() === "error" &&
          !text.startsWith("Failed to load resource") &&
          !message.location().url.startsWith(stage.base)
        ) {
          errors.push(text.split("\n")[0] ?? "");
        }
      });
      await page.setViewportSize({ width: 760, height: 900 });
      await page.route(`${stage.base}/__cawco/ping`, (route) =>
        route.fulfill({
          status: 204,
          headers: { "access-control-allow-origin": "*" },
        })
      );
      await serveDoc(page, { [BENCH_THEN]: missingStage() });
      // A view kept for the session, as anyone who ever chose one has: with it, nightly 4202's panel looped until its boundary stopped it.
      await page.addInitScript((key) => {
        localStorage.setItem(
          key,
          JSON.stringify({ scheme: "page", width: "own", motion: "on" })
        );
      }, `cawco-canvas-view:${BENCH_INSTANCE}`);
      if (inspect) {
        await page.addInitScript((key) => {
          localStorage.setItem(key, "open");
        }, `cawco-preview-inspect:${BENCH_INSTANCE}`);
      }
      // The hub's overlay says a framed page is ready (`cawco:ready`): the bench's canvas has no hub, so the frame says it here, and the pane connects as it does live (where the canvas view's send ran the loop).
      await page.addInitScript(() => {
        if (window.top !== window && location.pathname.includes("/@cawco/")) {
          addEventListener("load", () =>
            parent.postMessage(
              {
                type: "cawco:ready",
                url: location.href,
                title: document.title,
              },
              "*"
            )
          );
        }
      });
      await page.goto(
        `${bench}/motion/artifact-head?w=720&kind=${from}&then=${encodeURIComponent(thenPath())}&thenName=plan-view&thenAsk=${encodeURIComponent(THEN_ASK)}&after=4000&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
      );
      const down = await page
        .locator("[data-bench-pane] [data-slot=down][role=alert]")
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(1500);
      const read = await page.evaluate(() => {
        const pane = document.querySelector("[data-bench-pane]");
        return {
          name:
            pane
              ?.querySelector("[data-slot=artifact-name]")
              ?.textContent?.trim() ?? null,
          line:
            pane?.querySelector("[data-slot=subtitle]")?.textContent ?? null,
          title:
            pane?.querySelector("[data-slot=down] [data-slot=empty-title]")
              ?.textContent ?? null,
        };
      });
      kit.check(
        `12: ${theme}, from a ${from}${inspect ? " with Inspect open" : ""}: switching to a canvas whose stage failed draws its failed state in the pane, named in the head with its ask, and nothing throws`,
        down &&
          read.name === "plan-view" &&
          read.line === THEN_ASK &&
          read.title === "The stage for apps/dashboard didn't start" &&
          errors.length === 0,
        `${JSON.stringify(read)}; failed state ${down ? "drawn" : "never drawn"}; errors ${errors.join(" | ") || "none"}`
      );
      await page.close();
    }
  }
}

/** The name the own-tab leg gives its canvas: words nothing else in the pane holds. */
const OWN_NAME = "Own tab canvas";

/** Leg 8i: the canvas in a tab of its own (`/artifact/<id>`): named once, by its head, with its ask under the name. */
async function ownTabLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { theme, scale: 2 });
  await page.setViewportSize({ width: 1064, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await page.goto(
    `${bench}/motion/artifact-head?w=1024&own=1&name=${encodeURIComponent(OWN_NAME)}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
  );
  await page.waitForSelector("[data-bench-pane] iframe[data-ready]", {
    timeout: 60_000,
  });
  await page.waitForTimeout(3000);
  const pane = await page.evaluate((name) => {
    const text = document.querySelector("[data-bench-pane]")?.textContent ?? "";
    return {
      line:
        document.querySelector("[data-bench-pane] [data-slot=subtitle]")
          ?.textContent ?? null,
      names: text.split(name).length - 1,
      route: text.includes("/@cawco/"),
    };
  }, OWN_NAME);
  const canvas = page
    .frames()
    .find(
      (frame) =>
        frame.url().includes("/@cawco/canvas") &&
        !frame.url().includes("by=map")
    );
  // What the band shows, not what it holds: a framed band keeps its name hidden, and draws no line under it.
  const band = canvas
    ? await canvas.evaluate(() => {
        const root = document.getElementById("cawco-chrome")?.shadowRoot;
        return [
          ...(root?.querySelectorAll<HTMLElement>(
            ".band > div:not(.crumb, .tools)"
          ) ?? []),
        ]
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => el.textContent ?? "")
          .join(" | ");
      })
    : null;
  kit.check(
    `8i: ${theme}: in its own tab the canvas is named once, by its head, its ask on the line under the name; its page, framed there, says neither`,
    pane.line === ASK &&
      pane.names === 1 &&
      !pane.route &&
      band !== null &&
      !band.includes(CANVAS.name ?? "") &&
      !band.includes(ASK),
    `pane ${JSON.stringify(pane)}; the page's band shows ${JSON.stringify(band)}`
  );
  await page.close();
}

/** What nightly 4202's hub answered when it couldn't draw a canvas: the words a failed stage folds under Show details. */
const NIGHTLY_ERROR =
  "Cannot find package 'playwright-core' imported from /$bunfs/root/cawco";

/** Leg 11: a failed stage on the bench, said with its own words under Show details. */
async function stageDownLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { theme, scale: 2 });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await serveDoc(page, {
    [BENCH_ARTIFACT]: {
      runs: "sheet",
      toolchain: "vite",
      status: "error",
      dir: "apps/dashboard",
      at: new Date().toISOString(),
      errors: [],
      message: NIGHTLY_ERROR,
    },
  });
  await page.goto(
    `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
  );
  const down = page.locator("[data-bench-pane] [data-slot=down][role=alert]");
  const shown = await down
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  const readDown = () =>
    down.evaluate((box) => {
      const details = box.querySelector<HTMLElement>("[data-slot=details]");
      const button = box.querySelector<HTMLElement>("[data-details]");
      const edge = box.getBoundingClientRect();
      const at = details?.getBoundingClientRect();
      return {
        title:
          box.querySelector('[data-slot="empty-title"]')?.textContent ?? "",
        line:
          box.querySelector('[data-slot="empty-line"]')?.textContent?.trim() ??
          "",
        button: button?.textContent?.trim() ?? null,
        expanded: button?.getAttribute("aria-expanded") ?? null,
        details: details?.textContent?.trim() ?? null,
        inside:
          !!at &&
          at.height > 0 &&
          at.left >= edge.left - 0.5 &&
          at.right <= edge.right + 0.5,
        said: (box.textContent ?? "").includes("playwright-core"),
      };
    });
  const folded = shown ? await readDown() : null;
  if (shown) {
    await down.locator("[data-details]").click();
    await page.waitForTimeout(300);
  }
  const open = shown ? await readDown() : null;
  kit.check(
    `11: ${theme}: a failed stage says so where the page would be, its own words under Show details only: folded until pressed, then whole`,
    !!folded &&
      !!open &&
      folded.title === "The stage for apps/dashboard didn't start" &&
      folded.line ===
        "Vite stopped before it served the canvas. Try again starts it again." &&
      folded.button === shellWords.showDetails &&
      folded.expanded === "false" &&
      folded.details === null &&
      !folded.said &&
      open.button === shellWords.hideDetails &&
      open.expanded === "true" &&
      open.details === NIGHTLY_ERROR &&
      open.inside,
    `folded ${JSON.stringify(folded)}; open ${JSON.stringify(open)}`
  );
  await page.close();
}

/** Leg 13's states file: named by the canvas, never written. */
const GONE_FILE = ".cawco/probe/Gone.stories.ts";
/** Leg 14's states file: written with a syntax error, so its module doesn't compile. */
const BROKEN_FILE = ".cawco/probe/Broken.stories.ts";
const BROKEN_SOURCE = `import StatTile from "../../src/lib/cawco/StatTile.svelte";
export default { component: StatTile, args: { label: "Spend" ; } };
export const One = { args: {} };
`;
/** How long a refused states file has to say so in the panel (the brief's 5 s). */
const REFUSED_MS = 5000;
/** The stage as the hub keeps it while it serves: `live`, no errors (owner's delegate canvas, 2026-10-21). */
const liveStage = (): StageState => ({
  runs: "sheet",
  toolchain: "vite",
  status: "live",
  dir: "apps/dashboard",
  at: new Date().toISOString(),
  errors: [],
});

/**
 * The canvas page's failed section, read with its details opened and shut
 * again (what they hold is laid out only while open): its line, the stage's
 * words, its place and whether it stands on one line, the code frame, the
 * words' ground and the card's, and whether all it holds stands inside the
 * card; null while none stands.
 */
const FAILED_READ = () => {
  const box = document.querySelector<HTMLElement>(".cawco-section-failed");
  const details = box?.querySelector("details");
  if (!(box && details)) {
    return null;
  }
  const text = (selector: string) =>
    box.querySelector(selector)?.textContent ?? null;
  const summary = text("summary") ?? "";
  details.open = true;
  const pre = box.querySelector<HTMLElement>("pre");
  const at = box.querySelector<HTMLElement>(".cawco-section-failed-place");
  const oneLine = (el: HTMLElement) =>
    el.getBoundingClientRect().height <=
    Number.parseFloat(getComputedStyle(el).lineHeight) + 0.5;
  const edge = box.getBoundingClientRect().right + 0.5;
  const failed = {
    line: text(".cawco-section-failed-line") ?? "",
    summary,
    details: pre?.textContent ?? "",
    place: at?.textContent ?? null,
    placeTitle: at?.title ?? null,
    placeOneLine: at ? oneLine(at) : null,
    frame: text(".cawco-section-failed-frame"),
    ground: pre ? getComputedStyle(pre).backgroundColor : "",
    card: getComputedStyle(box).backgroundColor,
    inside: [...box.querySelectorAll<HTMLElement>("p, pre, summary")].every(
      (el) => el.getBoundingClientRect().right <= edge
    ),
  };
  details.open = false;
  return failed;
};

/**
 * Legs 13 and 14: a canvas whose states file the stage can't load, its doc's
 * stage `live` as the hub keeps it. The hub's preview proxy injects the
 * overlay only into an HTML answer (agent preview.ts), so the frame here
 * says `cawco:ready` only where the stage answered HTML. Within
 * {@link REFUSED_MS} of the panel opening, no "Compiling…" stands in the
 * pane and the canvas says the section didn't load, the stage's own words
 * under Show details: a missing file named as missing (13), a file that
 * doesn't compile with Vite's compile error (14).
 */
async function refusedLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  writeFileSync(join(DASHBOARD, BROKEN_FILE), BROKEN_SOURCE);
  const legs = [
    {
      leg: "13",
      file: GONE_FILE,
      what: "a canvas whose states file doesn't exist",
      line: "Gone's states file isn't there yet, so none of its stories are drawn.",
      said: (words: string) =>
        words.includes(GONE_FILE) && words.includes("does not exist"),
      place: null,
    },
    {
      leg: "14",
      file: BROKEN_FILE,
      what: "a canvas whose states file doesn't compile",
      line: "Broken doesn't compile, so none of its stories are drawn.",
      said: (words: string) =>
        !words.includes("Failed to fetch dynamically imported module"),
      place: `${BROKEN_FILE}:2:62`,
    },
  ];
  for (const { leg, file, what, line, said, place } of legs) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page("desk", { theme, scale: 2 });
    await page.setViewportSize({ width: 760, height: 900 });
    await page.route(`${stage.base}/__cawco/ping`, (route) =>
      route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*" },
      })
    );
    await serveDoc(page, { [BENCH_ARTIFACT]: liveStage() }, false);
    await page.addInitScript(() => {
      if (
        window.top !== window &&
        location.pathname.includes("/@cawco/") &&
        document.contentType === "text/html"
      ) {
        addEventListener("load", () =>
          parent.postMessage(
            { type: "cawco:ready", url: location.href, title: document.title },
            "*"
          )
        );
      }
    });
    const path = `/@cawco/canvas?file=${encodeURIComponent(file)}&spec=${encodeURIComponent(JSON.stringify({ name: "refused" }))}`;
    const opened = Date.now();
    await page.goto(
      `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(path)}&ask=${encodeURIComponent(ASK)}`
    );
    const read = async () => {
      const compiling = await page.evaluate(
        () =>
          document
            .querySelector("[data-bench-pane]")
            ?.textContent?.includes("Compiling…") ?? false
      );
      const canvas = page
        .frames()
        .find((frame) => frame.url().includes("/@cawco/canvas"));
      const failed = canvas
        ? await canvas.evaluate(FAILED_READ).catch(() => null)
        : null;
      return { compiling, failed };
    };
    let seen = await read();
    while (
      Date.now() - opened < REFUSED_MS &&
      (seen.compiling || !seen.failed)
    ) {
      // biome-ignore lint/performance/noAwaitInLoops: a poll, one read at a time against the leg's clock
      await page.waitForTimeout(100);
      seen = await read();
    }
    const took = Date.now() - opened;
    kit.check(
      `${leg}: ${theme}: ${what} says so within ${REFUSED_MS / 1000}s in the error formula's line, the stage's own words under Show details on a ground recessed from its card${place ? ", its place whole on one line and Vite's code frame under them" : ""}, and the pane never says "Compiling…"`,
      !seen.compiling &&
        !!seen.failed &&
        seen.failed.summary === shellWords.showDetails &&
        seen.failed.line === line &&
        said(seen.failed.details) &&
        seen.failed.ground !== seen.failed.card &&
        seen.failed.inside &&
        seen.failed.place === place &&
        (place === null ||
          (seen.failed.placeOneLine === true &&
            seen.failed.placeTitle === place &&
            !!seen.failed.frame)),
      `after ${took}ms: ${JSON.stringify(seen)}`
    );
    // For a reviewer: the pane with the section folded, then its details open.
    mkdirSync(CAPS, { recursive: true });
    const pane = page.locator("[data-bench-pane]");
    await pane.screenshot({ path: join(CAPS, `refused-${leg}-${theme}.png`) });
    const canvas = page
      .frames()
      .find((frame) => frame.url().includes("/@cawco/canvas"));
    await canvas?.locator(".cawco-section-failed summary").click();
    await page.waitForTimeout(300);
    await pane.screenshot({
      path: join(CAPS, `refused-${leg}-${theme}-open.png`),
    });
    await page.close();
  }
  await keptLeg(kit, bench, stage, theme);
}

/** A states file as leg 13's session would write it: one story. */
const GONE_SOURCE = `import StatTile from "../../src/lib/cawco/StatTile.svelte";
export default { component: StatTile, args: { label: "Spend", value: "1.00" } };
export const One = { args: {} };
`;

/**
 * Legs 13 and 14, the doc's side: what the stage host keeps of each and tells
 * the daemon (its `errors` word), which the hub carries into the canvas's doc
 * (`meta.stage.errors`) for the panel and the agent's read alike. The
 * missing file is kind `missing` in the stage's words, filed under that file
 * alone; the file that doesn't compile is kind `compile` at its place with
 * Vite's frame, filed under itself (its section module's id no longer mangles
 * the key). The pane, its doc's stage `live` carrying the missing one as the
 * hub keeps it, titles it by its kind, never "Doesn't compile:". Written,
 * the missing one goes; taken away again, it is back.
 */
async function keptLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const keptOf = (file: string) =>
    stage.errors()?.find((one) => one.file === file);
  const missing = await until(
    "the host's missing problem",
    () => keptOf(GONE_FILE),
    Boolean,
    REFUSED_MS
  ).catch(() => undefined);
  kit.check(
    `13: ${theme}: the stage keeps the missing states file as its section's problem: kind missing, the stage's words, filed under it alone`,
    missing?.kind === "missing" &&
      missing.message.startsWith(`${GONE_FILE} does not exist in `) &&
      missing.message.endsWith(
        "The canvas draws it once its session writes it."
      ) &&
      JSON.stringify(missing.sheets) === JSON.stringify([GONE_FILE]) &&
      missing.line === null,
    JSON.stringify(stage.errors())
  );
  const broken = keptOf(BROKEN_FILE);
  kit.check(
    `14: ${theme}: the stage keeps the file that doesn't compile as kind compile, at its place with Vite's frame, filed under it`,
    broken?.kind === "compile" &&
      broken.line === 2 &&
      !!broken.frame &&
      JSON.stringify(broken.sheets) === JSON.stringify([BROKEN_FILE]),
    JSON.stringify(broken)
  );
  if (!missing) {
    return;
  }
  const page = await kit.page("desk", { theme, scale: 2 });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await serveDoc(
    page,
    { [BENCH_ARTIFACT]: { ...liveStage(), errors: [missing] } },
    false
  );
  const path = `/@cawco/canvas?file=${encodeURIComponent(GONE_FILE)}&spec=${encodeURIComponent(JSON.stringify({ name: "refused" }))}`;
  await page.goto(
    `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(path)}&ask=${encodeURIComponent(ASK)}`
  );
  const card = page.locator('[data-bench-pane] [data-slot="sheet-error"]');
  await card.waitFor({ timeout: REFUSED_MS }).catch(() => undefined);
  const said = await card
    .evaluate((el) =>
      [...el.querySelectorAll("p")].map(
        (one) => one.textContent?.replace(/\s+/g, " ").trim() ?? ""
      )
    )
    .catch(() => [] as string[]);
  kit.check(
    `13: ${theme}: the pane titles the missing file "${sheetWords.missingTitle}" with its file, the stage's words under it and "${sheetWords.missingNext(0)}", never "${sheetWords.errorTitle}"`,
    said[0] === `${sheetWords.missingTitle} ${GONE_FILE}` &&
      said[1] === missing.message &&
      said[2] === sheetWords.missingNext(0) &&
      !said.join(" ").includes(sheetWords.errorTitle),
    JSON.stringify(said)
  );
  // Written, the open canvas draws its section within 5 s, with no reopen
  // or reload, and the stage lets its problem go.
  const canvas = page
    .frames()
    .find((frame) => frame.url().includes("/@cawco/canvas"));
  await canvas?.evaluate(() => {
    (window as unknown as { __stayed: boolean }).__stayed = true;
  });
  const written = Date.now();
  writeFileSync(join(DASHBOARD, GONE_FILE), GONE_SOURCE);
  const sectionNow = () =>
    canvas
      ? canvas
          .evaluate(() => ({
            drawn: !!document.querySelector(
              '.cawco-section [data-cawco-story="One"]'
            ),
            failed: !!document.querySelector(".cawco-section-failed"),
            stayed:
              (window as unknown as { __stayed?: boolean }).__stayed === true,
          }))
          .catch(() => ({ drawn: false, failed: true, stayed: false }))
      : Promise.resolve({ drawn: false, failed: true, stayed: false });
  let section = await sectionNow();
  while (Date.now() - written < REFUSED_MS && !section.drawn) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll, one read at a time against the leg's clock
    await page.waitForTimeout(100);
    section = await sectionNow();
  }
  const took = Date.now() - written;
  kit.check(
    `13: ${theme}: the states file written, the open canvas draws its section within ${REFUSED_MS / 1000}s, with no reopen and no reload`,
    section.drawn && !section.failed && section.stayed,
    `after ${took}ms: ${JSON.stringify(section)}`
  );
  await page.close();
  const cleared = await until(
    "the missing problem let go",
    () => (keptOf(GONE_FILE) ? undefined : true),
    Boolean,
    REFUSED_MS
  ).catch(() => false);
  // Taken away again (its section loaded), it is back.
  rmSync(join(DASHBOARD, GONE_FILE), { force: true });
  const back = await until(
    "the missing problem back",
    () => keptOf(GONE_FILE),
    Boolean,
    REFUSED_MS
  ).catch(() => undefined);
  kit.check(
    `13: ${theme}: the states file written, the stage lets its problem go; taken away again, it is kept missing again`,
    cleared === true && back?.kind === "missing",
    `cleared ${cleared}; after the file went: ${JSON.stringify(stage.errors())}`
  );
  await unreachedLeg(kit, bench, stage, theme);
}

/** Leg 16's canvases, seeded into a scratch hub: one whose read found its machine down, one its reach, one its workspace. */
const BACK_ROWS = [
  { id: "00000000-0000-4000-8000-0000000000b1", down: "machine" },
  { id: "00000000-0000-4000-8000-0000000000b2", down: "reach" },
  { id: "00000000-0000-4000-8000-0000000000b3", down: "workspace" },
] as const;

/**
 * Leg 16: a canvas whose read found its stage unreached, once the hop is
 * back with no read and no stage frame. On a scratch hub, canvases on the
 * fleet's machine are seeded with `meta.unreached` (machine, reach,
 * workspace) as a failed read leaves it, before that machine's agent is up;
 * the agent registering (hub server.ts register → `artifacts.machineBack`)
 * takes the machine's and the reach's away, and leaves the workspace's for
 * its stage's own word. The pane, opened on the doc as the hub then keeps
 * it, stands no down card and no "Not reached since" at any sample until
 * its page has drawn.
 */
async function backLeg(kit: Kit, bench: string, stage: Stage): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const Y = (await import(Bun.resolveSync("yjs", DASHBOARD))) as {
    applyUpdate: (doc: unknown, update: Uint8Array) => void;
    Doc: new () => {
      getMap: (name: string) => {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        toJSON: () => Record<string, unknown>;
      };
    };
    encodeStateAsUpdate: (doc: unknown) => Uint8Array;
  };
  const store = new Database(join(fleet.sandbox, "hub", "hub.db"));
  store.exec("PRAGMA busy_timeout = 15000");
  const since = new Date(Date.now() - 300_000).toISOString();
  const now = Date.now();
  for (const { id, down } of BACK_ROWS) {
    store
      .query(
        "INSERT INTO artifacts (id, kind, name, machine_id, source_port, source_place, source_stage_dir, source_stage_file, seq, created_at, updated_at) VALUES (?, 'component', ?, ?, ?, ?, 'apps/dashboard', ?, 1, ?, ?)"
      )
      .run(
        id,
        `back-${down}`,
        MACHINE,
        stage.port,
        `place-${down}`,
        FILES[0] as string,
        now,
        now
      );
    const doc = new Y.Doc();
    doc.getMap("meta").set("stage", liveStage());
    doc.getMap("meta").set("unreached", { down, since, why: UNREACHED_WHY });
    store
      .query(
        'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, 1, ?)'
      )
      .run(id, Y.encodeStateAsUpdate(doc));
  }
  /** Each seeded canvas's doc as the hub's log holds it now. */
  const metaOf = (id: string) => {
    const doc = new Y.Doc();
    for (const row of store
      .query(
        'SELECT "update" AS bytes FROM artifact_updates WHERE artifact_id = ? ORDER BY seq'
      )
      .all(id) as { bytes: Uint8Array }[]) {
      Y.applyUpdate(doc, row.bytes);
    }
    return doc.getMap("meta").toJSON();
  };
  const seeded = BACK_ROWS.every(({ id }) => !!metaOf(id).unreached);
  // The machine comes back: its agent registers. No read, no stage frame.
  fleet.launch("agent");
  await fleet.agentUp();
  const after = await until(
    "the machine's and the reach's unreached gone",
    () => {
      const metas = BACK_ROWS.map(({ id }) => metaOf(id));
      return metas[0]?.unreached || metas[1]?.unreached ? undefined : metas;
    },
    Boolean,
    15_000
  ).catch(() => BACK_ROWS.map(({ id }) => metaOf(id)));
  kit.check(
    "16: the machine's agent registered again, with no read and no stage frame, its canvases' docs no longer say machine or reach unreached; a workspace's waits for its stage",
    seeded &&
      !after[0]?.unreached &&
      !after[1]?.unreached &&
      (after[2]?.unreached as { down?: string } | undefined)?.down ===
        "workspace" &&
      (after[0]?.stage as { status?: string } | undefined)?.status === "live",
    `seeded ${seeded}; after: ${JSON.stringify(after.map((one) => one.unreached ?? null))}`
  );
  await fleet.accountSignedIn();
  await answeredLeg(kit, fleet, stage, store, Y, metaOf);
  store.close();
  // The pane on the doc as the hub keeps it now: no down card while its page loads.
  const meta = after[0] ?? {};
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme at a time
    const page = await kit.page("desk", { theme, scale: 2 });
    await page.setViewportSize({ width: 760, height: 900 });
    await page.route(`${stage.base}/__cawco/ping`, (route) =>
      route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*" },
      })
    );
    await serveDoc(
      page,
      {
        [BENCH_ARTIFACT]: (meta.stage as StageState | undefined) ?? liveStage(),
      },
      false,
      { [BENCH_ARTIFACT]: meta.unreached ? { unreached: meta.unreached } : {} }
    );
    await page.addInitScript(() => {
      if (
        window.top !== window &&
        location.pathname.includes("/@cawco/") &&
        document.contentType === "text/html"
      ) {
        addEventListener("load", () =>
          parent.postMessage(
            { type: "cawco:ready", url: location.href, title: document.title },
            "*"
          )
        );
      }
    });
    const path = `/@cawco/canvas?file=${encodeURIComponent(FILES[0] as string)}&spec=${encodeURIComponent(JSON.stringify({ name: "back" }))}`;
    const opened = Date.now();
    await page.goto(
      `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(path)}&ask=${encodeURIComponent(ASK)}`
    );
    const samples: { down: boolean; drawn: boolean; unreached: boolean }[] = [];
    for (;;) {
      const canvas = page
        .frames()
        .find((frame) => frame.url().includes("/@cawco/canvas"));
      const sample = {
        // biome-ignore lint/performance/noAwaitInLoops: a sample, one read at a time against the leg's clock
        ...(await page.evaluate(() => {
          const pane = document.querySelector("[data-bench-pane]");
          return {
            down: !!pane?.querySelector('[data-slot="down"]'),
            unreached: !!pane?.querySelector('[data-slot="unreached"]'),
          };
        })),
        // The canvas page is the stage's origin: read in its own frame.
        drawn: canvas
          ? await canvas
              .evaluate(() => !!document.querySelector("[data-cawco-story]"))
              .catch(() => false)
          : false,
      };
      samples.push(sample);
      if (sample.drawn || Date.now() - opened > 20_000) {
        break;
      }
      await page.waitForTimeout(100);
    }
    kit.check(
      `16: ${theme}: the pane opened on that doc stands no down card and no "Not reached since" at any sample until its page has drawn`,
      samples.at(-1)?.drawn === true &&
        samples.every((one) => !(one.down || one.unreached)),
      `${samples.length} samples over ${Date.now() - opened}ms; down at ${samples.findIndex((one) => one.down)}, unreached at ${samples.findIndex((one) => one.unreached)}, drawn ${samples.at(-1)?.drawn}`
    );
    await page.close();
  }
}

/** Leg 17's canvas: seeded `reach` after its machine registered, on the live stage. */
const ANSWERED_ROW = "00000000-0000-4000-8000-0000000000b4";
/** The session page's artifact panel (session-sheet `PANE`). */
const SESSION_PANE =
  ':is([data-slot="preview-pane"], [data-side-card="preview"])';

/**
 * Leg 17: `reach` on a stage that never dropped. On leg 16's scratch hub,
 * after the machine's agent registered (so no register can clear it), a
 * session's canvas on the live stage is seeded with `meta.unreached`
 * (reach) and shown in its panel on the dashboard. Nothing reads it and the
 * stage sends no frame: the page's own requests through the hub's preview
 * relay, answered by the stage (core `PREVIEW_SERVED_HEADER`), are the hop
 * back. By the time the page has drawn, the doc no longer says unreached,
 * and the pane stands no card then.
 */
async function answeredLeg(
  kit: Kit,
  fleet: Awaited<ReturnType<Kit["fleet"]>>,
  stage: Stage,
  store: Database,
  Y: {
    Doc: new () => {
      getMap: (name: string) => { set: (key: string, value: unknown) => void };
    };
    encodeStateAsUpdate: (doc: unknown) => Uint8Array;
  },
  metaOf: (id: string) => Record<string, unknown>
): Promise<void> {
  const session = await fleet.spawn("claude", "Canvas answered");
  const now = Date.now();
  const path = `/@cawco/canvas?file=${encodeURIComponent(FILES[0] as string)}&spec=${encodeURIComponent(JSON.stringify({ name: "answered" }))}`;
  store
    .query(
      "INSERT INTO artifacts (id, instance_id, made_by, kind, name, ask, machine_id, source_port, source_path, source_stage_dir, source_stage_file, seq, created_at, updated_at) VALUES (?, ?, ?, 'component', 'answered', 'Judge the stat tile', ?, ?, ?, 'apps/dashboard', ?, 1, ?, ?)"
    )
    .run(
      ANSWERED_ROW,
      session,
      session,
      MACHINE,
      stage.port,
      path,
      FILES[0] as string,
      now,
      now
    );
  const doc = new Y.Doc();
  doc.getMap("meta").set("stage", liveStage());
  doc.getMap("meta").set("unreached", {
    down: "reach",
    since: new Date(now - 60_000).toISOString(),
    why: "The stage did not read src/lib/cawco/StatTile.stories.ts's stories within 15 s.",
  });
  store
    .query(
      'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, 1, ?)'
    )
    .run(ANSWERED_ROW, Y.encodeStateAsUpdate(doc));
  const seeded = (
    metaOf(ANSWERED_ROW).unreached as { down?: string } | undefined
  )?.down;
  const page = await kit.page("desk", { theme: "light" });
  await openPage(
    page,
    `${await fleet.dashboard()}/session/${session}`,
    '[data-slot="pane"]'
  );
  const showing = fetch(
    `${fleet.base}/api/instances/${session}/artifacts/${ANSWERED_ROW}/show`,
    { method: "POST" }
  ).then((response) => response.status);
  const opened = Date.now();
  const samples: { card: boolean; drawn: boolean; unreached: boolean }[] = [];
  for (;;) {
    const canvas = page
      .frames()
      .find((frame) => frame.url().includes("/@cawco/canvas"));
    const sample = {
      // biome-ignore lint/performance/noAwaitInLoops: a sample, one read at a time against the leg's clock
      card: await page
        .locator(`${SESSION_PANE} [data-slot="down"]`)
        .count()
        .then((count) => count > 0),
      drawn: canvas
        ? await canvas
            .evaluate(() => !!document.querySelector("[data-cawco-story]"))
            .catch(() => false)
        : false,
      unreached: !!metaOf(ANSWERED_ROW).unreached,
    };
    samples.push(sample);
    if (sample.drawn || Date.now() - opened > 60_000) {
      break;
    }
    await page.waitForTimeout(100);
  }
  const last = samples.at(-1);
  const cardAt = samples.findIndex((one) => one.card);
  kit.check(
    "17: reach on a stage that never dropped: shown in the panel with no read and no frame, the doc no longer says unreached by the time its page has drawn, and the pane stands no card then",
    seeded === "reach" && last?.drawn === true && !last.unreached && !last.card,
    `seeded ${seeded}; show answered ${await showing}; ${samples.length} samples over ${Date.now() - opened}ms; card at ${cardAt}, unreached first gone at ${samples.findIndex((one) => !one.unreached)}, drawn ${last?.drawn}`
  );
  kit.check(
    '17: the pane stands no "isn\'t answering" card at any sample while that page loads',
    cardAt === -1,
    `card at sample ${cardAt} of ${samples.length}`
  );
  await page.close();
}

/** The hub's words for a read that couldn't reach a stage, as its relay refuses one (hub server.ts `onStage`). */
const UNREACHED_WHY =
  "The workspace's machine isn't connected to the hub, so its stage can't be reached.";

/**
 * Leg 15: a canvas whose stage the hub's last read couldn't reach (its doc's
 * `meta.unreached`, as artifact_read answers it beside the doc's last stage,
 * still `live`) says so where the page would be, in the pane's recipe for a
 * machine that isn't answering, with since when and why under it; never a
 * live canvas alone.
 */
async function unreachedLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { theme, scale: 2 });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  const since = new Date(Date.now() - 120_000).toISOString();
  await serveDoc(page, { [BENCH_ARTIFACT]: liveStage() }, false, {
    [BENCH_ARTIFACT]: {
      unreached: { down: "machine", since, why: UNREACHED_WHY },
    },
  });
  const path = `/@cawco/canvas?file=${encodeURIComponent(FILES[0] as string)}&spec=${encodeURIComponent(JSON.stringify({ name: "unreached" }))}`;
  await page.goto(
    `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(path)}&ask=${encodeURIComponent(ASK)}`
  );
  const card = page.locator('[data-bench-pane] [data-slot="down"]').first();
  await card.waitFor({ timeout: REFUSED_MS }).catch(() => undefined);
  // The words go in as the read's argument: it runs in the page, where
  // nothing of this module's scope is.
  const said = await card
    .evaluate(
      (el, again) => ({
        text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
        unreached:
          el
            .querySelector('[data-slot="unreached"]')
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? null,
        retry: [...el.querySelectorAll("button")].some(
          (one) =>
            one.getAttribute("aria-label") === again ||
            !!one.textContent?.trim().startsWith(again)
        ),
      }),
      commonWords.tryAgain
    )
    .catch(() => null);
  kit.check(
    `15: ${theme}: a canvas whose stage the hub's last read couldn't reach says so where the page would be: the machine isn't answering, since when and why, and Try again`,
    !!said &&
      shaped(previewWords.machineNotAnswering).test(said.text) &&
      said.retry &&
      !!said.unreached?.startsWith("Not reached since ") &&
      said.unreached.endsWith(`: ${UNREACHED_WHY}`),
    JSON.stringify(said)
  );
  await page.close();
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
 * Each artifact's live doc as the hub's `/ws/artifact/<session>/<artifact>`
 * serves it (y-websocket's sync protocol), answered in the page's own
 * network, one doc per artifact: a pick the session has not heard (none,
 * `pick` false: Send doesn't stand), the stage `stages` names for it
 * (its `meta.stage`), and the pins `pins()` holds as it changes.
 */
async function serveDoc(
  page: Page,
  stages: Record<string, StageState> = {},
  pick = true,
  /** More of each artifact's `meta`, by key: the hub's `unreached`. */
  metas: Record<string, Record<string, unknown>> = {}
) {
  const yws = Bun.resolveSync("y-websocket", DASHBOARD);
  // The dashboard's own yjs (the probe kit depends on none): the part of it this serves with.
  const Y = (await import(Bun.resolveSync("yjs", DASHBOARD))) as {
    Doc: new () => {
      getMap: (name: string) => { set: (key: string, value: unknown) => void };
      on: (event: "update", run: (update: Uint8Array) => void) => void;
      transact: (run: () => void) => void;
    };
  };
  type YDoc = InstanceType<typeof Y.Doc>;
  const sync = await import(Bun.resolveSync("y-protocols/sync", yws));
  const encoding = await import(Bun.resolveSync("lib0/encoding", yws));
  const decoding = await import(Bun.resolveSync("lib0/decoding", yws));
  const at = new Date().toISOString();
  const say = (write: (encoder: unknown) => void) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    write(encoder);
    return Buffer.from(encoding.toUint8Array(encoder));
  };
  const docs = new Map<
    string,
    { doc: YDoc; sockets: { send: (data: Buffer) => void }[] }
  >();
  const docOf = (artifact: string) => {
    const had = docs.get(artifact);
    if (had) {
      return had;
    }
    const doc = new Y.Doc();
    const stageState = stages[artifact];
    if (stageState) {
      doc.getMap("meta").set("stage", stageState);
    }
    for (const [key, value] of Object.entries(metas[artifact] ?? {})) {
      doc.getMap("meta").set(key, value);
    }
    if (pick) {
      doc.getMap("state").set("pick", {
        at,
        note: null,
        options: ["one"],
        pageHash: "bench",
        value: null,
      });
    }
    const made = { doc, sockets: [] as { send: (data: Buffer) => void }[] };
    doc.on("update", (update: Uint8Array) => {
      for (const ws of made.sockets) {
        ws.send(say((encoder) => sync.writeUpdate(encoder, update)));
      }
    });
    docs.set(artifact, made);
    return made;
  };
  await page.routeWebSocket(ARTIFACT_SOCKET, (ws) => {
    const artifact =
      new URL(ws.url()).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const { doc, sockets } = docOf(artifact);
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
    pins: (count: number) => {
      for (const { doc } of docs.values()) {
        doc.transact(() => {
          for (let number = 1; number <= count; number += 1) {
            doc.getMap("pins").set(pinOf(number, at).id, pinOf(number, at));
          }
        });
      }
    },
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
    count: await textOr(trigger.locator('[data-slot="more-count"]')),
    label: (await trigger.getAttribute("aria-label")) ?? "",
    entry: "",
    opened: false,
  };
  await trigger.click();
  const entry = page
    .locator("[data-slot=dropdown-menu-content] [role=menuitem]")
    .filter({ hasText: "Comments" });
  said.entry = `${(await entry.textContent())?.trim()} (menu-count ${await textOr(entry.locator("[data-slot=count]"))})`;
  await entry.click();
  const opened = await page
    .locator('[data-slot="comment-rail"]')
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  said.opened = opened;
  // The rail closes only by its Close or by Comments, never by Esc (DESIGN.md, The Comments rail).
  if (opened) {
    await page
      .locator('[data-slot="comment-rail"]')
      .getByRole("button", { name: commentWords.closeComments })
      .click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(300);
  return said;
}

/** 8h: Comments in More, at 330 with Send standing, at 0 open pins and at 2, under a finger. */
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
    `${bench}/motion/artifact-head?w=330&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
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
      `8h: 330 ${theme}, Send standing, ${open} open: Comments goes to More, whose count is ${count}, named "${label}", its entry's count ${count}, and choosing it opens the Comments rail`,
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
    `${bench}/motion/artifact-head?w=720&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
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

/** One head width's reading: the head's own width, the content box of the size container around Comments (the old label rule's), and on each of three frames the controls standing (`key` or `key(form)`) and whether More stands. */
interface SweepRead {
  box: number | null;
  frames: string[];
  /** The head read is no longer in the page: something drew a new one. */
  gone: boolean;
  head: number;
  w: number;
}

/**
 * The bench head swept a px at a time from `from` to `to`, in the page:
 * the pane set so the head is `w` wide, two frames to settle, then what
 * stands read on three frames running.
 */
const SWEEP = async ({
  from,
  to,
}: {
  from: number;
  to: number;
}): Promise<SweepRead[]> => {
  const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
  const head = pane.querySelector("[data-slot=side-head]") as HTMLElement;
  const frame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));
  const read = () =>
    [
      ...[
        ...head.querySelectorAll<HTMLElement>(
          ":scope > [data-head-item]:not([hidden])"
        ),
      ].map(
        (one) =>
          `${one.dataset.headItem}${one.dataset.form === "compact" ? "(compact)" : ""}`
      ),
      ...(head.querySelector(":scope > [data-slot=more]") ? ["More"] : []),
    ].join(",");
  let container = head.querySelector("[data-head-item=comments]");
  while (container && getComputedStyle(container).containerType === "normal") {
    container = container.parentElement;
  }
  const box = () => {
    if (!container) {
      return null;
    }
    const style = getComputedStyle(container);
    return (
      container.clientWidth -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd)
    );
  };
  const reads: SweepRead[] = [];
  const outside = pane.getBoundingClientRect().width - head.clientWidth;
  const step = from <= to ? 1 : -1;
  for (let w = from; w !== to + step; w += step) {
    pane.style.inlineSize = `${w + outside}px`;
    // biome-ignore lint/performance/noAwaitInLoops: each width settles before the next
    await frame();
    await frame();
    const frames: string[] = [];
    for (let k = 0; k < 3; k += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame after another
      await frame();
      frames.push(read());
    }
    reads.push({
      w,
      head: head.clientWidth,
      box: box(),
      frames,
      gone: !head.isConnected,
    });
  }
  return reads;
};

/** The standing keys of one frame's reading, forms and More aside. */
const keysOf = (frame: string): Set<string> =>
  new Set(
    frame
      .split(",")
      .filter((one) => one && one !== "More")
      .map((one) => one.replace("(compact)", ""))
  );

/**
 * The head's invariant swept every px from 300 to 800 (DESIGN.md, the
 * head's priority rule): a component canvas (the mode, the view, Inspect)
 * or a plain preview, with Send standing or not, at 0 and 2 open
 * pins. W1: every wider head stands every control a narrower one does; W2:
 * no width alternates between frames; W3: coming back down stands the same
 * controls at each width as going up.
 */
async function sweepLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  kind: "component" | "preview",
  picks: boolean
): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await page.setViewportSize({ width: 860, height: 844 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  const doc = await serveDoc(page, {}, picks);
  await page.goto(
    `${bench}/motion/artifact-head?w=800&kind=${kind}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  const config = `${kind === "component" ? "component canvas" : "plain preview"}, ${picks ? "Send standing" : "no Send"}`;
  const ready = await page
    .waitForSelector(
      picks
        ? "[data-bench-pane] [data-slot=send]"
        : "[data-bench-pane] [data-head-item=comments]",
      { timeout: 60_000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    kit.check(`W: ${config}: the head draws`, false, "never drew");
    await page.close();
    return;
  }
  await page.waitForTimeout(3000);
  for (const open of [0, 2]) {
    if (open > 0) {
      doc.pins(open);
      // biome-ignore lint/performance/noAwaitInLoops: the pins land, then the head is swept
      await page.waitForTimeout(1200);
    }
    const leg = `${config}, ${open} open`;
    const up = await page.evaluate(SWEEP, { from: 300, to: 800 });
    const down = await page.evaluate(SWEEP, { from: 800, to: 300 });
    const sized = up.filter((one) => one.head !== one.w);
    kit.check(
      `W0: ${leg}: the head stands every px 300–800 wide`,
      sized.length === 0,
      sized
        .slice(0, 5)
        .map(
          (one) => `${one.w}: head ${one.head}${one.gone ? " (detached)" : ""}`
        )
        .join("; ") || "every width"
    );
    const apart = up.filter((one) => one.box !== one.head);
    kit.check(
      `W4: ${leg}: the words read the box the old label rule queried: the head's width is its size container's content box at every px`,
      apart.length === 0,
      apart
        .slice(0, 5)
        .map((one) => `${one.w}: head ${one.head}, box ${one.box}`)
        .join("; ") || "the same box"
    );
    const lost: string[] = [];
    for (let at = 1; at < up.length; at += 1) {
      const narrower = up[at - 1] as SweepRead;
      const wider = up[at] as SweepRead;
      const keys = keysOf(wider.frames.at(-1) ?? "");
      const gone = [...keysOf(narrower.frames.at(-1) ?? "")].filter(
        (key) => !keys.has(key)
      );
      if (gone.length > 0) {
        lost.push(
          `${narrower.w}→${wider.w}: loses ${gone.join(",")} (${narrower.frames.at(-1)} → ${wider.frames.at(-1)})`
        );
      }
    }
    kit.check(
      `W1: ${leg}: every wider head stands every control a narrower one does, 300–800 a px at a time`,
      lost.length === 0,
      lost.join("; ") || "no loss"
    );
    const alternating = [...up, ...down].filter(
      (one) => new Set(one.frames).size > 1
    );
    kit.check(
      `W2: ${leg}: no width alternates between frames`,
      alternating.length === 0,
      alternating
        .slice(0, 5)
        .map((one) => `${one.w}: ${one.frames.join(" | ")}`)
        .join("; ") || "none"
    );
    const downAt = new Map(down.map((one) => [one.w, one.frames.at(-1)]));
    const differ = up.filter((one) => downAt.get(one.w) !== one.frames.at(-1));
    kit.check(
      `W3: ${leg}: coming back down, each width stands what it stood going up`,
      differ.length === 0,
      differ
        .slice(0, 5)
        .map(
          (one) =>
            `${one.w}: up ${one.frames.at(-1)}, down ${downAt.get(one.w)}`
        )
        .join("; ") || "the same"
    );
    // Where what stands changes, for the report.
    kit.note(
      `sweep ${leg}: ${up
        .filter(
          (one, at) =>
            at === 0 || up[at - 1]?.frames.at(-1) !== one.frames.at(-1)
        )
        .map((one) => `${one.w} ${one.frames.at(-1)}`)
        .join(" | ")}`
    );
  }
  await page.close();
}

/**
 * Where each fresh load put the first section's title, by leg without its
 * scheme, then scheme: the same canvas at the same width loads to the same
 * place in both (the world placed from its layout, never from a moment).
 */
const LOAD_X = new Map<string, Partial<Record<"light" | "dark", number>>>();
const SCHEME_IN_LEG = / (light|dark)\b/;
const keepLoadX = (leg: string, x: number) => {
  const scheme = SCHEME_IN_LEG.exec(leg)?.[1] as "light" | "dark" | undefined;
  if (!scheme) {
    return;
  }
  const key = leg.replace(SCHEME_IN_LEG, "");
  LOAD_X.set(key, { ...LOAD_X.get(key), [scheme]: x });
};

/** The shown frame's centre against the canvas's, in px (a phone shows its one frame centred). */
const OFF_CENTRE = () => {
  const frame = document
    .querySelector(".cawco-frame[data-cawco-shown]")
    ?.getBoundingClientRect();
  const canvas = document
    .querySelector(".cawco-canvas")
    ?.getBoundingClientRect();
  return frame && canvas
    ? frame.x + frame.width / 2 - (canvas.x + canvas.width / 2)
    : Number.NaN;
};

/**
 * N7c's cause: a phone's frame placed from a moment, not its layout. After
 * load, and after a step whose placement a resize interrupts mid-way (as a
 * panel sliding open does while the canvas loads), the shown frame stands
 * centred: the placement never takes its offset from a position in flight.
 */
async function centredLeg(
  kit: Kit,
  stage: Stage,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page("desk", { theme });
  await page.setViewportSize({ width: 560, height: 844 });
  await page.goto(`${stage.base}${canvasPath()}`);
  await drawn(page);
  const loaded = await page.evaluate(OFF_CENTRE);
  await page.keyboard.press("j");
  await page.waitForTimeout(40);
  await page.setViewportSize({ width: 600, height: 844 });
  await page.waitForTimeout(40);
  await page.setViewportSize({ width: 560, height: 844 });
  await page.waitForTimeout(900);
  const raced = await page.evaluate(OFF_CENTRE);
  kit.check(
    `N7d: 560 desk pointer ${theme}: the shown frame stands centred after load and after a step a resize interrupts`,
    Math.abs(loaded) <= 0.5 && Math.abs(raced) <= 0.5,
    `off centre after load ${loaded.toFixed(1)}px, after the interrupted step ${raced.toFixed(1)}px`
  );
  await page.close();
}

/** N7c: every leg's load placement the same in light and dark. */
function sameLoadPlace(kit: Kit): void {
  const pairs = [...LOAD_X].filter(
    ([, at]) => at.light !== undefined && at.dark !== undefined
  );
  kit.check(
    "N7c: a fresh load places the world the same in light and dark, for the same canvas and width, alone and in the panel",
    pairs.length > 0 &&
      pairs.every(
        ([, at]) => Math.abs((at.light ?? 0) - (at.dark ?? Number.NaN)) <= 0.5
      ),
    pairs
      .map(
        ([leg, at]) =>
          `${leg}: light ${at.light?.toFixed(1)}, dark ${at.dark?.toFixed(1)}`
      )
      .join("; ")
  );
}

/** Where the world's first drawn section head stands against the page's head, and what a press at its title's centre meets. */
const WORLD_TOP = () => {
  const chrome = document.getElementById("cawco-chrome")?.shadowRoot;
  const foot =
    chrome?.querySelector(".head")?.getBoundingClientRect().bottom ?? 0;
  const gap = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--space-2")
  );
  const head = [
    ...document.querySelectorAll<HTMLElement>(".cawco-section-head"),
  ].find((one) => one.getBoundingClientRect().height > 0);
  const title = head?.firstElementChild as HTMLElement | undefined;
  const t = title?.getBoundingClientRect();
  const hit = t
    ? document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2)
    : null;
  const top = head?.getBoundingClientRect().top ?? 0;
  return {
    x: t?.x ?? Number.NaN,
    clear: !!head && !!title && top >= foot + gap - 0.5 && hit === title,
    said: `head's foot ${foot.toFixed(1)}, section head top ${top.toFixed(1)} (needs ≥ ${(foot + gap).toFixed(1)}), a press at "${title?.textContent}" meets ${hit === title ? "it" : hit?.id || hit?.className || "nothing"}`,
  };
};

/**
 * N7's cause: the world placed under the page's head. After load and after
 * Zoom to fit, the first drawn section head stands space-2 or more under
 * the head's foot, and a press at its title's centre meets the title.
 */
async function worldLeg(kit: Kit, page: Page, leg: string): Promise<void> {
  const loaded = await page.evaluate(WORLD_TOP);
  keepLoadX(leg, loaded.x);
  await page.evaluate(() =>
    dispatchEvent(
      new CustomEvent("cawco:canvas-view", { detail: { zoom: "fit" } })
    )
  );
  await page.waitForTimeout(400);
  const fitted = await page.evaluate(WORLD_TOP);
  kit.check(
    `N7b: ${leg}: the world never stands under the page's head: its first section head clear of the head's foot, after load and after Zoom to fit`,
    loaded.clear && fitted.clear,
    `loaded: ${loaded.said}; fitted: ${fitted.said}`
  );
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
  await worldLeg(kit, page, `560 desk pointer ${theme}`);
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

/**
 * The head at session-sheet leg 18's desk pane, as drawn: the head's width
 * (what side/head.ts `standing` reads for the words, against `WORDS_FROM`,
 * 640),
 * the size container the old `@container (width < 640px)` label rule
 * queried (the nearest one around Comments' word) and its content box,
 * and Comments' form and whether its word is drawn.
 */
const DESK_READ = () => {
  const head = document.querySelector<HTMLElement>(
    "[data-bench-pane] [data-slot=side-head]"
  ) as HTMLElement;
  const comments = head.querySelector<HTMLElement>(
    ":scope > [data-head-item=comments]"
  );
  const label = comments?.querySelector<HTMLElement>(
    "[data-slot=comments-label]"
  );
  let container = comments?.parentElement ?? null;
  while (container && getComputedStyle(container).containerType === "normal") {
    container = container.parentElement;
  }
  const inner = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return (
      el.clientWidth -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd)
    );
  };
  return {
    head: head.clientWidth,
    container: container
      ? `${container.tagName.toLowerCase()}.${[...container.classList].join(".")}`
      : null,
    box: container ? inner(container) : null,
    form: comments?.dataset.form ?? null,
    word: !!label && getComputedStyle(label).display !== "none",
  };
};

/**
 * D: the head at session-sheet leg 18's desk pane (523px, a component
 * canvas, no Send, no open pins): its width and the old label rule's
 * container box agree, both under 640, so Comments stands by glyph and
 * count with its word not drawn, as the old rule drew it there.
 */
async function deskLeg(kit: Kit, bench: string, stage: Stage): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await serveDoc(page, {}, false);
  await page.goto(
    `${bench}/motion/artifact-head?w=523&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  const ready = await page
    .waitForSelector("[data-bench-pane] [data-head-item=comments]", {
      timeout: 60_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    kit.check("D: the desk pane's head draws", false, "never drew");
    await page.close();
    return;
  }
  await page.waitForTimeout(3000);
  const read = await page.evaluate(DESK_READ);
  kit.note(`desk pane 523: ${JSON.stringify(read)}`);
  kit.check(
    "D: at leg 18's 523px desk pane the head's width is the old label rule's container box, under 640, and Comments' word is not drawn",
    read.head === read.box && read.head < 640 && !read.word,
    JSON.stringify(read)
  );
  await page.close();
}

/** W0–W3 for a component canvas and a plain preview, with Send standing and without. */
async function sweeps(kit: Kit, bench: string, stage: Stage): Promise<void> {
  for (const kind of ["component", "preview"] as const) {
    for (const picks of [true, false]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      await sweepLeg(kit, bench, stage, kind, picks);
    }
  }
}

const spec: Spec = {
  name: "canvas-design",
  run: async (kit) => {
    const stage = await stageOf();
    // `CANVAS_DESIGN=head` or `=page` runs that half alone; `=switch` runs leg 12 alone (the side panel's 4202 crash); `=sweep` the head's W0–W4 alone; `=desk` leg D alone.
    const only = process.env.CANVAS_DESIGN;
    try {
      if (only === "switch") {
        const bench = await kit.bench();
        for (const theme of ["light", "dark"] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: one theme at a time
          await artifactSwitchLeg(kit, bench, stage, theme);
        }
        return;
      }
      if (only === "refused") {
        const bench = await kit.bench();
        // The stage's and the bench's first compiles, outside the legs' clock.
        const warm = await kit.page("desk", { theme: "light" });
        await warm.goto(`${stage.base}${canvasPath()}`);
        await drawn(warm);
        await warm.close();
        (await openBench(kit, bench, stage, 720, "light", ""))?.close();
        for (const theme of ["light", "dark"] as const) {
          // biome-ignore lint/performance/noAwaitInLoops: one theme at a time
          await refusedLeg(kit, bench, stage, theme);
        }
        await backLeg(kit, bench, stage);
        return;
      }
      if (only === "sweep") {
        await sweeps(kit, await kit.bench(), stage);
        return;
      }
      if (only === "desk") {
        await deskLeg(kit, await kit.bench(), stage);
        return;
      }
      for (const theme of only === "head" ? [] : (["light", "dark"] as const)) {
        for (const width of [390, 523, 1024]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time
          await canvasLeg(kit, stage, width, theme);
        }
        await footLeg(kit, stage, theme);
        await centredLeg(kit, stage, theme);
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
        await mapLeg(kit, bench, stage, 720, theme);
        await mapLeg(kit, bench, stage, 390, theme);
        await stageDownLeg(kit, bench, stage, theme);
        await refusedLeg(kit, bench, stage, theme);
        await ownTabLeg(kit, bench, stage, theme);
        await switchLeg(kit, bench, stage, theme);
        await artifactSwitchLeg(kit, bench, stage, theme);
      }
      if (only !== "page") {
        await backLeg(kit, bench, stage);
        await sweeps(kit, bench, stage);
        await deskLeg(kit, bench, stage);
      }
      sameLoadPlace(kit);
    } finally {
      stage.stop();
    }
  },
};
export default spec;
