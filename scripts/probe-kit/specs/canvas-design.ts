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
 *    Send standing, Comments in More at 0 and 2 open pins; and 8j, at 390
 *    and 680, the open count said as Comments' wherever Comments stands.)
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
 * that box is under 640 and Comments' word is not drawn. B
 * (`CANVAS_DESIGN=bounce` alone), in Chromium and WebKit: the bench pane
 * grown 390 → 1440 → 680 → 390, slowly and a frame or two a step; at each
 * width it settles on, the head holds its controls in its width, Close
 * stands whole and takes a press at its centre, and every folded control is
 * in More.
 */
import { Database } from "bun:sqlite";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Locator, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { type Pin, writePin } from "../../../packages/core/src/comments";
import type { MapDoc } from "../../../packages/core/src/doc-maps";
import {
  injectOverlay,
  overlayResponse,
} from "../../../packages/core/src/preview-proxy";
import { PAGE_SILENT_MS } from "../../../packages/core/src/preview-reach";
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
import { type Box, box as boxAt, overlap, inside as within } from "../geom";
import {
  type Kit,
  open as openPage,
  pressAt,
  ROOT,
  readMotion,
  type Spec,
} from "../kit";
import { reachOf } from "../reach";
import { shaped } from "../words";

const DASHBOARD = join(ROOT, "apps/dashboard");
/** The artifact's live doc on the dashboard's own origin (artifact-doc.ts `joinArtifact`). */
/** The artifact's doc, as the dashboard joins it (`/ws/artifact/…`) and as a page's overlay does on its own origin (`/__cawco/artifact/<id>`, artifact-doc.ts `artifactSyncPath`). */
const ARTIFACT_SOCKET = /\/ws\/artifact\/|\/__cawco\/artifact\/[^/?]+(?:\?|$)/;
/** More's name while it holds Comments: native's words (PreviewController.swift). */
const MORE_COUNT = /^More, Comments [1-9]\d* open$/;
/** A states file of the probe's own, in the stage's git-ignored folder: one story with no doc comment. */
const UNNAMED_FILE = ".cawco/probe/Unnamed.stories.ts";
/**
 * The design graph's states file (G legs), the probe's own beside the
 * dashboard's: the real routine form holding the owner's own routine, as
 * the hub holds it ("Daily reply shortlist for X", 06:30 every day, New
 * York), its hub a stand-in whose create never reaches the hub. Its states
 * stand in one machine, "Saving it" (the agent's `group`); its move is a
 * press on Create from Filled, the reason unfolding above the actions.
 */
const ROUTINE_FILE = ".cawco/probe/RoutineSave.stories.ts";
const ROUTINE_STATES = `import { routinesWords } from "@cawco/core/words/routines";
import RoutineForm from "../../src/lib/cawco/routines/RoutineForm.svelte";
// The app's global sheet, as its root layout loads it on every page (the probe's stage runs without SvelteKit, so no layout loads it): the page's motion tokens the dock offers come from it.
import "../../src/app.css";

/** The owner's own routine, as the hub holds it. */
const daily = {
  name: "Daily reply shortlist for X",
  prompt:
    "Build today's reply shortlist for @CawCoDev. You publish nothing: no posting, replying, liking, following or DMing.",
  cron: "30 6 * * *",
  delegateType: "medium",
};

/** Its runs over the next week, every day at 06:30 on the reader's clock. */
const runs = () => {
  const start = new Date();
  start.setHours(6, 30, 0, 0);
  return Array.from({ length: 8 }, (_, day) => start.getTime() + day * 86_400_000).filter(
    (at) => at > Date.now()
  );
};

const unanswered = routinesWords.createFailed(
  "The hub didn't answer (502).",
  routinesWords.fixTryAgain
);

export default {
  title: "Routines/Routine form",
  component: RoutineForm,
  args: {
    projectId: "cawco",
    draft: daily,
    focus: false,
    hub: {
      types: () =>
        Promise.resolve([
          { name: "medium", description: "Everyday code work: a fix, a small feature, a refactor." },
        ]),
      preview: (_cron, timeZone) =>
        Promise.resolve({ nextRuns: runs(), words: \`At 06:30, every day (\${timeZone})\` }),
      create: () => Promise.reject(new Error("The hub didn't answer (502).")),
    },
    oncreated: () => undefined,
    oncancel: () => undefined,
  },
};

/** Filled in and ready to create. */
export const Filled = { parameters: { viewport: 600 } };

/** Creating: the button keeps its width and its spinner stands over its label. */
export const Saving = { args: { saving: true }, parameters: { viewport: 600 } };

/** Create pressed and the hub didn't answer: the reason unfolds above the actions, every value kept. */
export const SaveFailed = {
  args: { failure: unanswered },
  parameters: { viewport: 600 },
  from: "Filled",
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Create routine/ }));
    await new Promise((done) => setTimeout(done, 600));
  },
};

/** The hub refused the delegate type: its words, and choose another. */
export const TypeRefused = {
  args: {
    failure: routinesWords.createFailed(
      "This project can't run the medium delegate type.",
      routinesWords.fixType
    ),
  },
  parameters: { viewport: 600 },
};
`;
/** The graph legs' canvas: the routine form and the speaker line, the agent's machine, its edge and its dial. */
const GRAPH_FILES = [ROUTINE_FILE, "src/lib/cawco/turn/Who.stories.ts"];
const GRAPH_CANVAS: CanvasSpec = {
  name: "Routine form",
  group: {
    [`${ROUTINE_FILE}:Filled`]: "Saving it",
    [`${ROUTINE_FILE}:Saving`]: "Saving it",
    [`${ROUTINE_FILE}:SaveFailed`]: "Saving it",
    [`${ROUTINE_FILE}:TypeRefused`]: `${ROUTINE_FILE}:SaveFailed`,
  },
  edges: [
    {
      from: `${ROUTINE_FILE}:SaveFailed`,
      to: `${ROUTINE_FILE}:Saving`,
      label: "Try again",
    },
  ],
  // Two of the agent's own, each a slider (pin 7: "the agent decides"): the form's field corners and the room between its fields, each a token the form draws with.
  dials: [
    {
      name: "radius",
      label: "Corner radius",
      kind: "number",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      target: { cssVar: "--radius-md" },
    },
    {
      name: "gap",
      label: "Field gap",
      kind: "number",
      min: 4,
      max: 32,
      step: 1,
      unit: "px",
      target: { cssVar: "--space-3" },
    },
  ],
};
const GRAPH_ASK = "Judge the routine form's save states";
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

interface Stage {
  base: string;
  /** The host's last `errors` word to the daemon (stage-host host.ts `tellErrors`): every section problem it keeps; null before it said one. */
  errors: () => StageError[] | null;
  /** The last of what the host said, for a leg that says why its page never drew. */
  heard: () => string;
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
  writeFileSync(join(DASHBOARD, ROUTINE_FILE), ROUTINE_STATES);
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
    heard: () => words.slice(-1500),
    port,
    stop: () => {
      child.kill("SIGTERM");
      rmSync(join(DASHBOARD, ".cawco/probe"), { recursive: true, force: true });
    },
  };
}

const canvasPath = (files = FILES, drawing = CANVAS) =>
  `/@cawco/canvas?${files.map((file) => `file=${encodeURIComponent(file)}`).join("&")}&spec=${encodeURIComponent(JSON.stringify(drawing))}`;

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

/** N7 in the panel: nothing but the well's own edge is drawn at the head/well seam, in the panel or the page's top row. */
async function seamLeg(kit: Kit, page: Page, leg: string): Promise<void> {
  const canvasFrame = page
    .frames()
    .find((one) => one.url().includes("/@cawco/canvas"));
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
  const samples: {
    card: boolean;
    drawn: boolean;
    said: string;
    unreached: boolean;
  }[] = [];
  for (;;) {
    const canvas = page
      .frames()
      .find((frame) => frame.url().includes("/@cawco/canvas"));
    // biome-ignore lint/performance/noAwaitInLoops: a sample, one read at a time against the leg's clock
    const said = await page.evaluate(
      (pane) =>
        [...document.querySelectorAll(`${pane} [data-slot="down"]`)]
          .map((one) => one.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .join(" | "),
      SESSION_PANE
    );
    const sample = {
      card: said !== "",
      said,
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
    `card at sample ${cardAt} of ${samples.length}${cardAt === -1 ? "" : `, saying "${samples[cardAt]?.said.slice(0, 300)}"`}`
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
  // The doc's word is said once the pane's own load has had its say: the
  // frame loaded, and its page silent for PAGE_SILENT_MS (PreviewPane `docDown`).
  await page
    .locator('[data-bench-pane] iframe[title="Preview"][data-ready]')
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  const card = page.locator('[data-bench-pane] [data-slot="down"]').first();
  await card
    .waitFor({ timeout: PAGE_SILENT_MS + REFUSED_MS })
    .catch(() => undefined);
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
const pinOf = (number: number, at: string): Pin => ({
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
    Doc: new () => MapDoc & {
      on: (event: "update", run: (update: Uint8Array) => void) => void;
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
    /** The first artifact's doc as the page has written it: its `state` and its pins' heads. */
    read: () => {
      const [first] = docs.values();
      return first
        ? {
            state: first.doc.getMap("state").toJSON() as Record<string, unknown>,
            pins: first.doc.getMap("pins").toJSON() as Record<string, Partial<Pin>>,
          }
        : null;
    },
    pins: (count: number) => {
      for (const { doc } of docs.values()) {
        doc.transact(() => {
          for (let number = 1; number <= count; number += 1) {
            writePin(doc, pinOf(number, at));
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

/**
 * 8j: the open comments' count is said as Comments' wherever Comments
 * stands, at a phone's 390 pane and a 680 one, with Send standing and 2
 * open pins (DESIGN.md, Artifact panel: "Comments in More keeps its open
 * count on More"). Read from the boxes: what stands; the count's box and
 * text, on Comments or on More; and, on More, the glyph inside the count's
 * box, held to the Comments entry's own glyph, so "⋯ 2" never reads as
 * two things in More.
 */
async function headCountLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<void> {
  const page = await kit.page(width < 640 ? "phone" : "desk", {
    theme,
    scale: 2,
  });
  await page.setViewportSize({ width: width + 40, height: 844 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  const doc = await serveDoc(page);
  await page.goto(
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}&ask=${encodeURIComponent(ASK)}`
  );
  await page.waitForSelector("[data-bench-pane] [data-slot=send]", {
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  doc.pins(2);
  await page.waitForTimeout(1200);
  const head = "[data-bench-pane] [data-slot=side-head]";
  const read = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const boxOf = (one: Element | null) => {
      if (!one) {
        return null;
      }
      const box = one.getBoundingClientRect();
      return `x${Math.round(box.x)} w${Math.round(box.width)} h${Math.round(box.height)}`;
    };
    const comments = el.querySelector(
      ":scope > [data-head-item=comments]:not([hidden]) [data-slot=comments]"
    );
    const more = el.querySelector(":scope > [data-slot=more]");
    const moreCount = more?.querySelector("[data-slot=more-count]") ?? null;
    return {
      head: Math.round(el.clientWidth),
      standing: [...el.children]
        .filter((one) => !(one as HTMLElement).hidden)
        .map((one) => {
          const it = one as HTMLElement;
          return `${it.dataset.headItem ?? it.dataset.slot ?? it.tagName}${it.dataset.form === "compact" ? "(compact)" : ""} ${boxOf(one)}`;
        }),
      commentsCount: comments
        ? `${comments.querySelector("[data-slot=count]")?.textContent?.trim() ?? "none"} ${boxOf(comments.querySelector("[data-slot=count]"))}`
        : "not standing",
      moreCount: moreCount
        ? `${moreCount.textContent?.trim()} ${boxOf(moreCount)}`
        : "none",
      moreCountGlyph:
        moreCount?.querySelector("svg")?.innerHTML.replace(/\s+/g, " ") ??
        "none",
      moreLabel: more?.getAttribute("aria-label") ?? "no More",
    };
  }, head);
  let entryGlyph = "none";
  if (read.moreCount !== "none") {
    await page.locator(`${head} [data-slot=more]`).click();
    const entry = page
      .locator("[data-slot=dropdown-menu-content] [role=menuitem]")
      .filter({ hasText: "Comments" });
    entryGlyph =
      (await entry.locator("svg").first().innerHTML()).replace(/\s+/g, " ") ??
      "none";
    await page.keyboard.press("Escape");
  }
  const { moreCountGlyph, ...said } = read;
  kit.note(`8j ${width} ${theme}: ${JSON.stringify(said)}`);
  const onComments = read.commentsCount.startsWith("2 x");
  const onMore =
    read.moreCount.startsWith("2 x") &&
    moreCountGlyph !== "none" &&
    moreCountGlyph === entryGlyph &&
    read.moreLabel === "More, Comments 2 open";
  kit.check(
    `8j: ${width} ${theme}, Send standing, 2 open: the count 2 stands as Comments' (${onComments ? "on Comments" : "on More, beside Comments' own glyph"}), never a bare figure on More`,
    onComments !== onMore && (width < 640 || onComments),
    JSON.stringify({
      ...said,
      moreCountGlyphIsComments: moreCountGlyph === entryGlyph,
      moreCountGlyph: moreCountGlyph === "none" ? "none" : "drawn",
    })
  );
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

/** The pane widths a bounce passes through: a phone's, past WORDS_FROM (640) to a desk's, back under it and to a phone's. */
const BOUNCE = [390, 1440, 680, 390] as const;

/** The head's fit as drawn: its width against what it holds, Close whole and pressable, and the controls standing and folded (each folded one by the names its controls carry). */
interface FitRead {
  /** The controls standing, More and Close, any of whose boxes lies past the head's: each by its key and its box's ends. */
  boxesOut: string[];
  client: number;
  closeHit: string;
  closeWhole: boolean;
  folded: { key: string; names: string[] }[];
  more: boolean;
  scroll: number;
  standing: string[];
  w: number;
}

const FIT_READ = (): FitRead => {
  const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
  const head = pane.querySelector("[data-slot=side-head]") as HTMLElement;
  const close = head.querySelector(":scope > [data-slot=close]") as HTMLElement;
  const edge = head.getBoundingClientRect();
  const box = close.getBoundingClientRect();
  const hit = document.elementFromPoint(
    box.x + box.width / 2,
    box.y + box.height / 2
  );
  const keyOf = (one: Element) => (one as HTMLElement).dataset.headItem ?? "";
  const boxesOut = [
    ...head.querySelectorAll<HTMLElement>(
      ":scope > [data-head-item]:not([hidden]), :scope > [data-slot=more], :scope > [data-slot=close]"
    ),
  ]
    .filter((one) => {
      const at = one.getBoundingClientRect();
      return at.left < edge.left - 0.5 || at.right > edge.right + 0.5;
    })
    .map((one) => {
      const at = one.getBoundingClientRect();
      return `${one.dataset.headItem ?? one.dataset.slot} ${Math.round(at.left)}–${Math.round(at.right)} in ${Math.round(edge.left)}–${Math.round(edge.right)}`;
    });
  return {
    boxesOut,
    w: pane.offsetWidth,
    client: head.clientWidth,
    scroll: head.scrollWidth,
    closeWhole:
      box.width > 0 &&
      box.left >= edge.left - 0.5 &&
      box.right <= edge.right + 0.5,
    closeHit:
      hit && close.contains(hit)
        ? "Close"
        : `${hit?.outerHTML.slice(0, 80) ?? "nothing"} at ${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)} in ${innerWidth}×${innerHeight}`,
    standing: [
      ...head.querySelectorAll(":scope > [data-head-item]:not([hidden])"),
    ].map(keyOf),
    folded: [...head.querySelectorAll(":scope > [data-head-item][hidden]")].map(
      (one) => ({
        key: keyOf(one),
        names: [...one.querySelectorAll("button, a, [role=tab]")]
          .map((each) =>
            (each.getAttribute("aria-label") ?? each.textContent ?? "").trim()
          )
          .filter(Boolean),
      })
    ),
    more: !!head.querySelector(":scope > [data-slot=more]"),
  };
};

/**
 * The pane set to each of `widths` in turn, `frames` frames apart (a quick
 * grow and shrink, as a split dragged or a window snapped does), then left
 * to settle.
 */
const BOUNCE_QUICK = async ({
  widths,
  frames,
  zoomed,
}: {
  frames: number;
  widths: number[];
  zoomed: boolean;
}): Promise<void> => {
  const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
  const frame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));
  pane.style.transformOrigin = "0 0";
  for (const w of widths) {
    pane.style.inlineSize = `${w}px`;
    for (let k = 0; k < frames; k += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame after another
      await frame();
    }
    // Zoomed to fit as a canvas does once its frame has its new width: a
    // phone's 390 at 1, wider frames smaller.
    pane.style.transform = zoomed ? `scale(${Math.min(1, 390 / w)})` : "";
    for (let k = 0; k < frames; k += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame after another
      await frame();
    }
  }
  for (let k = 0; k < 12; k += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the head's fit lands
    await frame();
  }
};

/** More's entries, opened by a press and shut again; none while More doesn't stand. */
async function moreEntries(page: Page): Promise<string[]> {
  const trigger = page.locator(
    "[data-bench-pane] [data-slot=side-head] > [data-slot=more]"
  );
  if ((await trigger.count()) === 0) {
    return [];
  }
  await trigger.click();
  await page
    .locator("[data-slot=dropdown-menu-content]")
    .waitFor({ timeout: 5000 });
  const entries = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-slot=dropdown-menu-content] :is([role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [data-slot=dropdown-menu-sub-trigger])"
      ),
    ].map((one) => one.textContent?.trim() ?? "")
  );
  await page.keyboard.press("Escape");
  await page
    .locator("[data-slot=dropdown-menu-content]")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  return entries;
}

/** The kit's reach reader's line (reach.ts `reachOf`) for the control named `name`: `ok` or `short` first, each side's reach after; null where none stands. */
const reachLine = (all: string, name: string): string | null =>
  all
    .split("\n")
    .find((line) => line.split("\t")[4] === JSON.stringify(name)) ?? null;

/** Close's reach, and New canvas's where it stands: in the head, or folded into More (opened to read it at rest, and shut), as the kit's reach reader reads them. */
async function reaches(page: Page) {
  const head = await page.evaluate(reachOf);
  const close = reachLine(head, "Close");
  const standing = reachLine(head, "New canvas");
  if (standing) {
    return { close, create: `the head: ${standing}` };
  }
  await page
    .locator("[data-bench-pane] [data-slot=side-head] > [data-slot=more]")
    .click();
  await page
    .locator("[data-slot=dropdown-menu-content]")
    .waitFor({ timeout: 5000 });
  // Read at rest: the menu's entrance (a scale) finished, its rows at their
  // own size.
  await page.evaluate(() => {
    for (const run of document
      .querySelector("[data-slot=dropdown-menu-content]")
      ?.getAnimations({ subtree: true }) ?? []) {
      if (Number.isFinite(run.effect?.getComputedTiming().endTime)) {
        run.finish();
      }
    }
  });
  const folded = reachLine(await page.evaluate(reachOf), "New canvas");
  await page.keyboard.press("Escape");
  await page
    .locator("[data-slot=dropdown-menu-content]")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  return { close, create: folded ? `More: ${folded}` : null };
}

/** A check that the head holds its controls, Close stands whole and pressable, and every folded control is in More, read now. */
type Holds = (leg: string) => Promise<void>;

/** The bench pane set to `w` px wide (`transformOrigin` top left, for a zoom), or zoomed to `scale`. */
const SET_PANE = ({ w, scale }: { scale?: number; w?: number }) => {
  const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
  pane.style.transformOrigin = "0 0";
  if (w !== undefined) {
    pane.style.inlineSize = `${w}px`;
  }
  if (scale !== undefined) {
    pane.style.transform = scale === 1 ? "" : `scale(${scale})`;
  }
};

/** Each bounce width settled before it is read; zoomed, the pane is then zoomed to fit (a phone's 390 at 1) and settled again. */
async function slowBounce(page: Page, holds: Holds): Promise<void> {
  for (const zoomed of [false, true]) {
    for (const w of BOUNCE.slice(1)) {
      // biome-ignore lint/performance/noAwaitInLoops: one width settled, then read, before the next
      await page.evaluate(SET_PANE, { w });
      await page.waitForTimeout(600);
      if (zoomed) {
        await page.evaluate(SET_PANE, { scale: Math.min(1, 390 / w) });
        await page.waitForTimeout(600);
      }
      await holds(`slowly${zoomed ? ", zoomed to fit" : ""}`);
    }
  }
  await page.evaluate(SET_PANE, { scale: 1 });
}

/** The bounce a frame, then two, at each width, and the grow-then-shrink ending at each of its narrower widths, plain and zoomed to fit. */
async function quickBounce(page: Page, holds: Holds): Promise<void> {
  const runs = [false, true].flatMap((zoomed) =>
    [1, 2].flatMap((frames) =>
      [
        [1440, 680, 390],
        [1440, 390],
        [1440, 680],
      ].map((widths) => ({ zoomed, frames, widths }))
    )
  );
  for (const run of runs) {
    // biome-ignore lint/performance/noAwaitInLoops: one bounce, settled and read, before the next
    await page.evaluate(BOUNCE_QUICK, run);
    await holds(
      `quickly ${[390, ...run.widths].join("→")}, ${run.frames} frame${run.frames > 1 ? "s" : ""} a step${run.zoomed ? ", zoomed to fit" : ""}`
    );
    await page.evaluate(BOUNCE_QUICK, { ...run, widths: [390], frames: 1 });
  }
  await page.evaluate(SET_PANE, { scale: 1 });
}

/** The pane as wide as the bench's main, the window bounced as a person drags or snaps it, each size handed to the engine at once. */
async function windowBounce(page: Page, holds: Holds): Promise<void> {
  await page.evaluate(() => {
    (
      document.querySelector("[data-bench-pane]") as HTMLElement
    ).style.inlineSize = "100%";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await holds("window fresh");
  for (const sizes of [
    [1440, 680, 390],
    [1440, 390],
  ]) {
    for (const width of sizes) {
      // biome-ignore lint/performance/noAwaitInLoops: one size after another, no wait between
      await page.setViewportSize({ width, height: 844 });
    }
    await page.waitForTimeout(800);
    await holds(`window quickly 390→${sizes.join("→")}`);
  }
}

/**
 * B: the head's invariant at every width however the width got there. The
 * bench pane grown from a phone's 390 to 1440, past WORDS_FROM, and back
 * through 680 to 390: slowly (each width settled) and quickly (a frame or
 * two at each), plain and zoomed to fit after each width as a component
 * canvas zooms its frames, and by the window. At each width it settles on,
 * the head holds its controls in its width (scrollWidth ≤ clientWidth),
 * Close stands whole and a press at its centre meets Close, and every
 * control folded out of the head is in More. The design leaf's reading
 * before the fix, sweeping a canvas frame 1440 → 680 → 390: scrollWidth 454
 * in clientWidth 376, Close cut off (the fit read its controls' drawn
 * widths under the zoom, which changed after).
 */
async function bounceLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  engine: "chromium" | "webkit",
  kind: "component" | "preview",
  picks: boolean,
  view: "desk" | "phone"
): Promise<void> {
  const touch = view === "phone";
  const page = await kit.page(view, { theme: "light", engine });
  await page.setViewportSize({ width: 1920, height: 844 });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  await serveDoc(page, {}, picks);
  await page.goto(
    `${bench}/motion/artifact-head?w=${BOUNCE[0]}&kind=${kind}&port=${stage.port}&path=${encodeURIComponent(canvasPath())}`
  );
  const ready = await page
    .waitForSelector("[data-bench-pane] [data-head-item=create]", {
      state: "attached",
      timeout: 60_000,
    })
    .then(() => true)
    .catch(() => false);
  const config = `${engine}${touch ? " under a finger" : ""}, ${kind === "component" ? "component canvas" : "plain preview"}, ${picks ? "Send standing" : "no Send"}`;
  if (!ready) {
    kit.check(`B: ${config}: the head draws`, false, "never drew");
    await page.close();
    return;
  }
  await page.waitForTimeout(3000);
  const holds: Holds = async (leg) => {
    const read = await page.evaluate(FIT_READ);
    const more = await moreEntries(page);
    const missing = read.folded.filter(
      (one) =>
        !one.names.some((name) => more.some((entry) => entry.startsWith(name)))
    );
    const shared =
      read.closeWhole &&
      read.closeHit === "Close" &&
      (read.folded.length === 0 || read.more) &&
      missing.length === 0;
    if (!touch) {
      kit.check(
        `B: ${config}, ${leg}, at ${read.w}: the head holds its controls (scrollWidth ${read.scroll} ≤ clientWidth ${read.client}), Close whole and pressed at its centre, every folded control in More`,
        read.scroll <= read.client && shared,
        JSON.stringify({ ...read, moreEntries: more, missing })
      );
      return;
    }
    // Under a finger the head's scrollWidth is not read: `touch-hit`'s 44px
    // area is a ::after placed absolutely about its control, so it counts
    // toward its ancestors' scrollable overflow by design, and Close's
    // reach past the head's end makes the head's scrollWidth 7.5px more
    // than its box (it never scrolls, so that draws nothing;
    // touch-sideways holds that nothing scrolls sideways for it). What a
    // person sees and presses is read instead: every control's box inside
    // the head's, and a 44px reach on Close and on New canvas, the control
    // that folds first, where it stands.
    // Zoomed to fit (a canvas's picture of the panel), a control is drawn
    // smaller than its own size and so is its area: its reach is read at a
    // zoom of 1 alone.
    const zoom = await page.evaluate(() => {
      const pane = document.querySelector("[data-bench-pane]") as HTMLElement;
      return pane.getBoundingClientRect().width / pane.offsetWidth;
    });
    const reach =
      Math.abs(zoom - 1) < 0.01
        ? await reaches(page)
        : {
            close: "ok\tread at a zoom of 1 alone",
            create: ": ok\tread at a zoom of 1 alone",
          };
    kit.check(
      `B: ${config}, ${leg}, at ${read.w}: every control's box inside the head's, Close whole and pressed at its centre, every folded control in More, and a 44px reach on Close and on New canvas (${reach.create?.split(":")[0] ?? "not found"})`,
      shared &&
        read.boxesOut.length === 0 &&
        !!reach.close?.startsWith("ok\t") &&
        !!reach.create?.includes(": ok\t"),
      JSON.stringify({ ...read, moreEntries: more, missing, reach })
    );
  };
  await holds("fresh");
  await slowBounce(page, holds);
  await quickBounce(page, holds);
  await windowBounce(page, holds);
  await page.close();
}

/** B in Chromium and WebKit, under a mouse and a finger, for a component canvas and a plain preview, with Send standing and without. */
async function bounces(kit: Kit, bench: string, stage: Stage): Promise<void> {
  for (const view of ["desk", "phone"] as const) {
    for (const engine of ["chromium", "webkit"] as const) {
      for (const kind of ["component", "preview"] as const) {
        for (const picks of [true, false]) {
          // biome-ignore lint/performance/noAwaitInLoops: one page at a time
          await bounceLeg(kit, bench, stage, engine, kind, picks, view);
        }
      }
    }
  }
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

/** 8j at 390 and 680, then 8h, in each scheme: the open count wherever Comments stands. */
async function countLegs(kit: Kit, bench: string, stage: Stage): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [390, 680]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      await headCountLeg(kit, bench, stage, width, theme);
    }
    await moreHoldsComments(kit, bench, stage, theme);
  }
}

/* --- The design graph (Projects spec §5.10, "The design graph") ------------ */

/**
 * The canvas page as the hub serves it into a panel: the overlay's tag in
 * the page (preview-proxy.ts `injectOverlay`) and the overlay answered for
 * the bench's origin (`overlayResponse`), so the page and the pane speak as
 * they do live (`cawco:graph`, `cawco:stage`, `cawco:move`, `cawco:dials`).
 */
async function withOverlay(
  page: Page,
  stage: Stage,
  bench: string
): Promise<void> {
  const parent = new URL(bench).origin;
  await page.route(`${stage.base}/__cawco/overlay.js*`, async (route) => {
    const answer = await overlayResponse([parent], null, null);
    await route.fulfill({
      status: 200,
      headers: {
        "content-type":
          answer.headers.get("content-type") ?? "text/javascript",
        "cache-control": "no-store",
      },
      body: await answer.text(),
    });
  });
  await page.route(
    (url) => url.origin === stage.base && url.pathname === "/@cawco/canvas",
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        body: injectOverlay(await answer.text()),
      });
    }
  );
}

const GRAPH_PANEL = "[data-graph-panel]";
/** A time in whole figures, as the playhead's pill says it. */
const FIGURES = /^\d+$/;
const nodeAt = (story: string) => `${GRAPH_PANEL} [data-node="${story}"]`;
/** A state's own words in its node: a press there keeps the state at rest, past its variations' chips. */
const nodeWordsAt = (story: string) => `${nodeAt(story)} > span:first-child`;

/** The canvas page framed in the bench's pane. */
const canvasFrameOf = (page: Page): Frame | null =>
  page
    .frames()
    .find(
      (one) =>
        one.url().includes("/@cawco/canvas") && !one.url().includes("by=map")
    ) ?? null;

/** The graph legs' bench: the panel on the routine form's canvas, its page overlaid, its doc served; null, said, when it never loads. */
async function openGraphBench(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<{
  doc: Awaited<ReturnType<typeof serveDoc>>;
  errors: string[];
  /** How many times the canvas page has loaded in the pane. */
  loads: () => number;
  page: Page;
} | null> {
  const page = await kit.page(width < 640 ? "phone" : "desk", {
    theme,
    scale: 2,
  });
  // The canvas page comes to the frame through the probe's route (the overlay in it, as the hub serves it), which Chromium holds to be of no address space it knows, so the page's sockets to the stage on 127.0.0.1 ask Local Network Access first: granted, as the person's browser is for their own hub (microsoft/playwright#37861).
  if (page.context().browser()?.browserType().name() === "chromium") {
    await page.context().grantPermissions(["local-network-access"]);
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The bench runs the dashboard with no hub behind it (`/motion/` benches): its own asks of `/api/` answer 503 there, the graph's none.
  const noHub = `${new URL(bench).origin}/api/`;
  page.on("console", (message) => {
    const at = message.location().url;
    if (message.type() === "error" && !at.startsWith(noHub)) {
      errors.push(`${message.text().split("\n")[0] ?? ""} (${at})`);
    }
  });
  // Every frame's own errors, the canvas page's among them, kept where the legs read them (`frameErrors`).
  await page.addInitScript(() => {
    const kept: string[] = [];
    (window as unknown as { __probeErrors: string[] }).__probeErrors = kept;
    addEventListener("error", (event) => {
      const { message, filename, lineno } = event as ErrorEvent;
      kept.push(`${message} (${filename}:${lineno})`);
    });
    addEventListener("unhandledrejection", (event) => {
      const { reason } = event as PromiseRejectionEvent;
      kept.push(
        `unhandled: ${String((reason as Error | undefined)?.stack ?? reason).slice(0, 400)}`
      );
    });
  });
  const doc = await serveDoc(page, {}, false);
  await withOverlay(page, stage, bench);
  // Each load of the canvas page in the pane: one, unless something reloads it under the leg.
  let loads = 0;
  page.on("framenavigated", (one) => {
    if (one.url().includes("/@cawco/canvas")) {
      loads += 1;
    }
  });
  // The bench's page holds the app's shell, its sidebar beside the pane on a desk: the window is wide enough for both, so the pane stands whole in it.
  await page.setViewportSize({
    width: width < 640 ? width + 40 : width + 300,
    height: 844,
  });
  await page.route(`${stage.base}/__cawco/ping`, (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    })
  );
  // A pin's pictures of its marks, kept as the hub keeps them beside the doc's socket (hub artifacts/sync.ts `artifactPictures`): the bench has no hub.
  await page.route(`${stage.base}/__cawco/artifact/*/pictures`, (route) =>
    route.fulfill({ status: 200, json: {} })
  );
  await page.goto(
    `${bench}/motion/artifact-head?w=${width}&port=${stage.port}&path=${encodeURIComponent(canvasPath(GRAPH_FILES, GRAPH_CANVAS))}&ask=${encodeURIComponent(GRAPH_ASK)}&name=${encodeURIComponent(GRAPH_CANVAS.name ?? "")}`
  );
  const ready = await page
    .waitForSelector(nodeAt("Filled"), { timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    kit.check(
      `G0: ${width} ${theme}: the design graph stands over the canvas in the panel`,
      false,
      `${JSON.stringify(
        await page.evaluate(() => {
          const frame = document.querySelector<HTMLIFrameElement>(
            "[data-bench-pane] iframe"
          );
          return {
            frame: frame
              ? [...frame.attributes].map((one) => `${one.name}=${one.value.slice(0, 80)}`)
              : null,
            graph: !!document.querySelector("[data-design-graph-host]"),
          };
        })
      )} | page: ${JSON.stringify(
        await canvasFrameOf(page)
          ?.evaluate(() => ({
            overlay: !!document.querySelector('script[src*="/__cawco/overlay.js"]'),
            graph: String(
              JSON.stringify(
                (window as unknown as { __cawcoDesignGraph?: unknown })
                  .__cawcoDesignGraph
              )
            ).slice(0, 900),
            text: document.body.innerText.slice(0, 300),
            errors: String(
              JSON.stringify(
                (window as unknown as { __cawcoErrors?: unknown }).__cawcoErrors
              )
            ).slice(0, 900),
            frames: document.querySelectorAll(".cawco-frame").length,
            booted: !!(window as unknown as { __cawcoCanvas?: unknown })
              .__cawcoCanvas,
            thrown: (window as unknown as { __probeErrors?: string[] })
              .__probeErrors,
            loads: performance
              .getEntriesByType("resource")
              .map((one) => one.name)
              .filter((one) => one.includes("/@id/"))
              .slice(-4),
            canvas: (() => {
              const r = document
                .querySelector(".cawco-canvas")
                ?.getBoundingClientRect();
              return r ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
            })(),
            sections: [
              ...document.querySelectorAll<HTMLElement>(".cawco-section"),
            ].map((one) => {
              const r = one.getBoundingClientRect();
              return `${[r.left, r.top, r.width, r.height].map(Math.round).join(",")} ${JSON.stringify(one.dataset)}`;
            }),
            world: document.querySelector<HTMLElement>(".cawco-world")?.style
              .transform,
          }))
          .catch((error: Error) => error.message)
      )} | stage: ${JSON.stringify(stage.errors()).slice(0, 900)} ${stage.heard()} | errors: ${errors.join(" | ")}`
    );
    await page.close();
    return null;
  }
  await page.waitForTimeout(1500);
  return { doc, errors, loads: () => loads, page };
}

/** The design graph's panel as the engine draws it: its boxes, regions, states, words and what spills. */
interface GraphRead {
  bands: { box: Box; kept: boolean; text: string }[];
  /** Each band's name and how many elements in the panel say it: its band's alone (the pick "headers"). */
  dialogs: number;
  edges: { from: string; lit: boolean; to: string }[];
  fonts: { at: string; least: number; meta: number };
  mode: string | null;
  namesSaid: Record<string, number>;
  nodes: { box: Box; kept: boolean; machine: string; peek: boolean; story: string }[];
  open: string | null;
  pane: Box | null;
  panel: Box | null;
  regions: { box: Box; machine: string }[];
  /** Text that spills its own box, a box standing out of the pane, the bench scrolling sideways: each by name. */
  spills: string[];
  tabs: string[];
}

async function readGraph(page: Page): Promise<GraphRead> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over the panel, each box and word read where it stands
  return await page.evaluate((selector) => {
    const boxOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const panel = document.querySelector<HTMLElement>(selector);
    const host = document.querySelector("[data-design-graph-host]");
    const frame = document.querySelector("[data-bench-pane] iframe[data-ready]");
    const probe = document.createElement("i");
    probe.style.font = "var(--type-meta)";
    document.body.append(probe);
    const meta = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    const regions = [
      ...(panel?.querySelectorAll<HTMLElement>("[data-machine]") ?? []),
    ];
    const bands = regions.flatMap((region) => {
      const band = region.querySelector<HTMLElement>("[data-band]");
      return band
        ? [
            {
              text: band.textContent?.trim() ?? "",
              kept: region.hasAttribute("data-kept"),
              box: boxOf(band),
            },
          ]
        : [];
    });
    const surfaces = [
      ...(host?.querySelectorAll<HTMLElement>(
        "[data-graph-panel], [data-graph-dock]"
      ) ?? []),
    ];
    const all = surfaces.flatMap((one) => [
      one,
      ...one.querySelectorAll<HTMLElement>("*"),
    ]);
    const namesSaid: Record<string, number> = {};
    for (const band of bands) {
      namesSaid[band.text] = all.filter((el) =>
        [...el.childNodes].some(
          (one) => one.nodeType === 3 && one.textContent?.trim() === band.text
        )
      ).length;
    }
    let least = Number.POSITIVE_INFINITY;
    let at = "";
    const spills: string[] = [];
    const paneBox = frame ? boxOf(frame) : null;
    for (const el of all) {
      const style = getComputedStyle(el);
      const own = [...el.childNodes].some(
        (one) => one.nodeType === 3 && one.textContent?.trim()
      );
      const shown =
        style.visibility !== "hidden" &&
        el.getClientRects().length > 0 &&
        Number(style.opacity) > 0;
      if (!shown) {
        continue;
      }
      if (own) {
        const size = Number.parseFloat(style.fontSize);
        if (size < least) {
          least = size;
          at = `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}"`;
        }
        if (
          el.scrollWidth > el.clientWidth + 1 &&
          style.overflowX === "visible" &&
          el.clientWidth > 0
        ) {
          spills.push(
            `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`
          );
        }
      }
      const b = boxOf(el);
      // Clipped away whole by a box of the surface that hides its overflow (a drawer folded to its head): no one sees it.
      let hidden = false;
      for (
        let up = el.parentElement;
        up && !hidden && host?.contains(up);
        up = up.parentElement
      ) {
        if (getComputedStyle(up).overflow !== "visible") {
          const c = up.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          hidden =
            box.top >= c.bottom ||
            box.bottom <= c.top ||
            box.left >= c.right ||
            box.right <= c.left;
        }
      }
      if (hidden) {
        continue;
      }
      // A drawn box outside the pane, its own scrollers' content aside (a graph or a timeline runs on past its view).
      const scrolled = el.closest("[data-design-graph], [data-lanes], [data-inspector]");
      if (
        paneBox &&
        !scrolled &&
        b.width > 0 &&
        b.height > 0 &&
        (b.left < paneBox.left - 0.5 ||
          b.right > paneBox.right + 0.5 ||
          b.bottom > paneBox.bottom + 0.5)
      ) {
        spills.push(
          `${el.tagName.toLowerCase()}[${[...el.attributes].map((one) => one.name).filter((one) => one.startsWith("data-")).join(",")}] outside the pane: ${Math.round(b.left)}–${Math.round(b.right)} × ${Math.round(b.top)}–${Math.round(b.bottom)} in ${Math.round(paneBox.left)}–${Math.round(paneBox.right)} × ${Math.round(paneBox.top)}–${Math.round(paneBox.bottom)}`
        );
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      spills.push(
        `the bench scrolls sideways: ${document.documentElement.scrollWidth} > ${innerWidth}`
      );
    }
    return {
      bands,
      namesSaid,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      edges: [
        ...(panel?.querySelectorAll<SVGGElement>("g[data-from]") ?? []),
      ].map((one) => ({
        from: one.dataset.from ?? "",
        to: one.dataset.to ?? "",
        lit: one.hasAttribute("data-lit"),
      })),
      fonts: { least, meta, at },
      mode: panel?.dataset.graphPanel ?? null,
      nodes: [
        ...(panel?.querySelectorAll<HTMLElement>("[data-node]") ?? []),
      ].map((one) => ({
        story: one.dataset.node ?? "",
        machine:
          one.closest<HTMLElement>("[data-machine]")?.dataset.machine ?? "",
        box: boxOf(one),
        kept: one.hasAttribute("data-kept"),
        peek: one.hasAttribute("data-peek"),
      })),
      open: panel?.dataset.open ?? null,
      panel: panel ? boxOf(panel) : null,
      pane: paneBox,
      regions: regions.map((one) => ({
        machine: one.dataset.machine ?? "",
        box: boxOf(one),
      })),
      spills,
      tabs: [
        ...(panel?.querySelectorAll('[aria-label="Components"] [role="tab"]') ??
          []),
      ].map((one) => one.textContent?.trim() ?? ""),
    };
  }, GRAPH_PANEL);
}

/** What the canvas page stands: each frame on its stage, whether it is staged, its washes. */
async function readStage(page: Page): Promise<{
  on: { interaction: string; story: string }[];
  seen: number;
  staged: boolean;
  washes: { kind: string }[];
}> {
  const frame = canvasFrameOf(page);
  if (!frame) {
    return { staged: false, on: [], seen: 0, washes: [] };
  }
  return await frame.evaluate(() => {
    const on = [
      ...document.querySelectorAll<HTMLElement>(
        ".cawco-frame[data-cawco-on-stage]"
      ),
    ].map((el) => ({
      story: el.dataset.cawcoStory ?? "",
      interaction: el.dataset.cawcoInteraction ?? "",
    }));
    const view = document.querySelector(".cawco-canvas")?.getBoundingClientRect();
    // Frames a reader would see: drawn, in the canvas's view, and not faded out.
    const seen = [...document.querySelectorAll<HTMLElement>(".cawco-frame")].filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return (
          !!view &&
          Number(getComputedStyle(el).opacity) > 0 &&
          r.right > view.left &&
          r.left < view.right &&
          r.bottom > view.top &&
          r.top < view.bottom
        );
      }
    ).length;
    return {
      staged: document.documentElement.hasAttribute("data-cawco-staged"),
      on,
      seen,
      washes: [...document.querySelectorAll<HTMLElement>(".cawco-wash")].map(
        (el) => ({ kind: el.dataset.kind ?? "" })
      ),
    };
  });
}

/** Waits until the stage stands `story` at rest, or `ms` pass: what it stands then. */
async function stageStands(page: Page, story: string, ms = 15_000) {
  const end = Date.now() + ms;
  let read = await readStage(page);
  while (
    Date.now() < end &&
    !read.on.some((one) => one.story === story && one.interaction === "rest")
  ) {
    // biome-ignore lint/performance/noAwaitInLoops: polling the page's own stage until it answers the ask
    await page.waitForTimeout(150);
    read = await readStage(page);
  }
  return read;
}

/** The asks the dock made of the page's move since the last call, in order (`cawco:move-ask`, heard in the canvas page). */
async function asksSince(page: Page): Promise<string[]> {
  const frame = canvasFrameOf(page);
  return frame
    ? await frame.evaluate(() => {
        const w = window as unknown as { __asks?: string[] };
        if (!w.__asks) {
          w.__asks = [];
          addEventListener("cawco:move-ask", (event) =>
            w.__asks?.push(
              String((event as CustomEvent<{ op?: string }>).detail?.op)
            )
          );
        }
        return w.__asks.splice(0);
      })
    : [];
}

/** Every error thrown in any of the bench's frames, the canvas page's among them, as `openGraphBench` keeps them. */
async function thrownIn(page: Page): Promise<string[]> {
  const all = await Promise.all(
    page.frames().map((frame) =>
      frame
        .evaluate(
          () =>
            (window as unknown as { __probeErrors?: string[] }).__probeErrors ??
            []
        )
        .catch(() => [] as string[])
    )
  );
  return all.flat();
}

/**
 * The pane's mode set as a person sets it: its segment in the head where
 * the head has room for the three, else the mode's one button (or More)
 * and its item.
 */
async function commentMode(
  page: Page,
  mode: "Comment" | "Interact"
): Promise<void> {
  const head = "[data-bench-pane] [data-slot=side-head]";
  const segment = page
    .locator(`${head} [role="tab"]`, { hasText: mode })
    .filter({ visible: true });
  if ((await segment.count()) > 0) {
    await segment.first().click();
    return;
  }
  const compact = page
    .locator(`${head} button[aria-label^="Mode: "]`)
    .filter({ visible: true });
  await ((await compact.count()) > 0
    ? compact.first()
    : page.locator(`${head} [data-slot=more]`)
  ).click();
  await page.getByRole("menuitemradio", { name: mode }).click();
}

/** Pins 11, 13 and 14 on the dock as it stands: its head one row with a hairline its whole width under it, the playhead's pill saying the time. */
async function dockHeadLeg(
  kit: Kit,
  page: Page,
  leg: string,
  when: string
): Promise<void> {
    // Pin 11 and 14: the dock's head is one row, a hairline the dock's whole width under it; pin 13: the playhead's head a pill saying the time.
    const head = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-dock-head]");
      const surface = el?.closest<HTMLElement>(
        '[data-graph-dock], [data-graph-panel="drawer"]'
      );
      const knob = document.querySelector<HTMLElement>("[data-playhead-knob]");
      if (!(el && surface && knob)) {
        return null;
      }
      const r = el.getBoundingClientRect();
      const s = surface.getBoundingClientRect();
      const kids = [...el.children].map((one) => one.getBoundingClientRect());
      const k = knob.getBoundingClientRect();
      const ks = getComputedStyle(knob);
      return {
        // How far the furthest of its children stands off the head's middle: one row is all of them on it.
        off: Math.max(
          0,
          ...kids.map((one) =>
            Math.abs(one.top + one.height / 2 - (r.top + r.height / 2))
          )
        ),
        inside: kids.every(
          (one) => one.left >= r.left - 0.5 && one.right <= r.right + 0.5
        ),
        height: Math.round(r.height),
        hairline: getComputedStyle(el).borderBottomWidth,
        across: Math.round(r.width - s.width + 2),
        pill: Number.parseFloat(ks.borderTopLeftRadius) >= k.height / 2,
        says: knob.textContent?.trim(),
        ink: ks.backgroundColor,
      };
    });
    const rowH = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--c-row-h")
      )
    );
    kit.check(
      `G29 (pins 11, 14): ${leg}, ${when}: the dock's head is one row of the row's height, everything in it inside it, a 1px hairline the dock's whole width under it`,
      !!head &&
        head.off <= 2 &&
        head.inside &&
        head.height <= rowH + 1 &&
        head.hairline === "1px" &&
        Math.abs(head.across) <= 2,
      JSON.stringify({ head, rowH })
    );
    kit.check(
      `G30 (pin 13): ${leg}, ${when}: the playhead's head is a pill saying the time the page stands, in figures`,
      !!head && head.pill && FIGURES.test(head.says ?? ""),
      JSON.stringify(head)
    );
  }

/** A clip bar's box and the clip's duration figure, in the dock. */
const barOf = async (page: Page, id: number) => ({
  box: await boxAt(page, `[data-bar="${id}"]`),
  figure: await page
    .locator(`[data-clip="${id}"] [data-fact="duration"]`)
    .first()
    .textContent()
    .then((one) => Number.parseInt(one ?? "", 10))
    .catch(() => Number.NaN),
  adHoc:
    (await page.locator(`[data-clip="${id}"] [data-ad-hoc="duration"]`).count()) >
    0,
});

/**
 * G: the design graph on the bench at a pane `width`, in `theme`, each of
 * the owner's picks as he picked it (§5.10): headers, washes, the dock and
 * its clips' controls in the row, snap, replay, segments, a spring at any
 * value, pins, the panel's edges, Show and Hide as one object; nothing
 * spills at 390, 680 and 1440; no page error.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk of the graph's flow, each pick checked where the person meets it
async function graphLeg(
  kit: Kit,
  bench: string,
  stage: Stage,
  width: number,
  theme: "light" | "dark"
): Promise<void> {
  const opened = await openGraphBench(kit, bench, stage, width, theme);
  if (!opened) {
    return;
  }
  const { page, errors, doc, loads } = opened;
  const engine = page.context().browser()?.browserType().name() ?? "chromium";
  const leg = `${engine} ${width} ${theme}`;
  const desk = width >= 896;
  const finger = width < 640;
  let read = await readGraph(page);
  kit.check(
    `G1: ${leg}: the graph stands as ${desk ? "a panel at the page's inline end" : "a drawer across the page's foot"}, inside the pane`,
    read.mode === (desk ? "desk" : "drawer") &&
      !!read.panel &&
      !!read.pane &&
      within(read.panel, read.pane, 1),
    JSON.stringify({
      mode: read.mode,
      panel: read.panel,
      pane: read.pane,
      layout: await page.evaluate(() => {
        const out: string[] = [`viewport ${innerWidth}`];
        let el: Element | null = document.querySelector(
          "[data-bench-pane] iframe"
        );
        while (el && el !== document.body) {
          const r = el.getBoundingClientRect();
          out.push(
            `${el.tagName.toLowerCase()}${(el as HTMLElement).dataset.slot ? `[${(el as HTMLElement).dataset.slot}]` : ""} ${Math.round(r.left)}+${Math.round(r.width)}`
          );
          el = el.parentElement;
        }
        return out.join(" < ");
      }),
    })
  );
  kit.check(
    `G2: ${leg}: a tab per component under review, each named in words`,
    read.tabs.length === 2 && read.tabs.every((one) => one.length > 0),
    read.tabs.join(" | ")
  );
  kit.check(
    `G3 (headers): ${leg}: the machine is named by its slab's header, and said nowhere else in the graph`,
    read.bands.map((one) => one.text).join("|") === "Saving it" &&
      Object.values(read.namesSaid).every((count) => count === 1),
    JSON.stringify({ bands: read.bands.map((one) => one.text), said: read.namesSaid })
  );
  let staged = await stageStands(page, "Filled");
  kit.check(
    `G4: ${leg}: the page stands the kept state alone (Filled), every other frame mounted out of sight`,
    staged.staged &&
      staged.on.length >= 1 &&
      staged.on.every((one) => one.story === "Filled") &&
      staged.seen === staged.on.length,
    JSON.stringify(staged)
  );
  const placed = read.nodes.every((node) => {
    const region = read.regions.find((one) => one.machine === node.machine);
    return !!region && within(node.box, region.box, 1);
  });
  const apart = read.nodes.every((a, at) =>
    read.nodes.slice(at + 1).every((b) => overlap(a.box, b.box) <= 0.5)
  );
  kit.check(
    `G5: ${leg}: every state stands inside its slab, none on another`,
    placed && apart && read.nodes.some((one) => one.kept && one.story === "Filled"),
    JSON.stringify(read.nodes.map((one) => [one.story, one.machine, one.kept]))
  );
  const tryAgain = read.edges.find(
    (one) => one.from === "SaveFailed" && one.to === "Saving"
  );
  kit.check(
    `G6: ${leg}: the move and the agent's edge are drawn between the states`,
    !!tryAgain &&
      read.edges.some((one) => one.from === "Filled" && one.to === "SaveFailed"),
    JSON.stringify(read.edges)
  );
  // Dials (pin 7): every dial the agent put up stands as its own slider; one moved draws on the page's frames at once.
  const sliders = page.locator(`${GRAPH_PANEL} [data-dials] input[type="range"]`);
  const sliderNames = await sliders.evaluateAll((all) =>
    all.map((one) => one.getAttribute("aria-label") ?? "")
  );
  if (sliderNames.length > 0) {
    await sliders.first().fill("12");
    await page.waitForTimeout(400);
  }
  const dialed = await canvasFrameOf(page)
    ?.evaluate(() => {
      const body = document.querySelector<HTMLElement>(
        ".cawco-frame[data-cawco-on-stage] .cawco-frame-body"
      );
      if (!body) {
        return null;
      }
      return {
        token: getComputedStyle(body).getPropertyValue("--radius-md").trim(),
        drawn: [...body.querySelectorAll("*")].filter(
          (one) => getComputedStyle(one).borderTopLeftRadius === "12px"
        ).length,
      };
    })
    .catch(() => null);
  kit.check(
    `G28 (dials): ${leg}: the agent's two dials stand as two sliders, and Corner radius at 12 draws on the kept frame at once`,
    sliderNames.join("|") === "Corner radius|Field gap" &&
      dialed?.token === "12px" &&
      dialed.drawn > 0,
    JSON.stringify({ sliderNames, dialed })
  );
  // Washes: a hover previews a state that differs from the kept one, and the page marks what came in.
  if (!finger) {
    await page.hover(nodeWordsAt("SaveFailed"));
    staged = await stageStands(page, "SaveFailed");
    // The washes are drawn once the stage has laid the previewed frames out (runtime.ts `wash`, a frame later).
    const previewed = await until(
      "the preview's washes",
      () => readStage(page),
      (now) => now.washes.length > 0,
      3000
    ).catch(() => readStage(page));
    read = await readGraph(page);
    kit.check(
      `G7 (washes): ${leg}: a hover on Save failed previews it on the page, a wash behind what came in, Filled still kept`,
      previewed.on.some((one) => one.story === "SaveFailed") &&
        previewed.washes.some((one) => one.kind === "add") &&
        !!read.nodes.find((one) => one.story === "SaveFailed")?.peek &&
        !!read.nodes.find((one) => one.story === "Filled")?.kept,
      JSON.stringify({ on: previewed.on, washes: previewed.washes })
    );
    await page.mouse.move(2, 2);
    staged = await stageStands(page, "Filled");
    await page.waitForTimeout(300);
    const back = await readStage(page);
    kit.check(
      `G8 (washes): ${leg}: leaving it, the page stands the kept state again and its washes go`,
      back.on.every((one) => one.story === "Filled") && back.washes.length === 0,
      JSON.stringify(back)
    );
  }
  // A press keeps Save failed: the move into it plays, and the dock stands.
  // The state's own words as its node says them: the pin's path names it so.
  const stateWords =
    (await page.locator(nodeWordsAt("SaveFailed")).textContent())?.trim() ??
    "";
  await page.locator(nodeWordsAt("SaveFailed")).click();
  staged = await stageStands(page, "SaveFailed");
  // Read on the graph's face, before a drawer turns to its timeline.
  read = await readGraph(page);
  const keptNode = read.nodes.find((one) => one.story === "SaveFailed");
  const litEdges = read.edges;
  if (!desk) {
    await page
      .locator(`${GRAPH_PANEL} [role="tab"]`, { hasText: "Timeline" })
      .click({ timeout: 15_000 })
      .catch(() => undefined);
  }
  const docked = await page
    .waitForSelector("[data-move-dock] [data-bar]", { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(
    `G9: ${leg}: a press keeps Save failed: the page stands it, its node the selected one, the move into it drawn strong, and the dock its clips`,
    docked &&
      staged.on.some((one) => one.story === "SaveFailed") &&
      !!keptNode?.kept &&
      litEdges.some((one) => one.to === "SaveFailed" && one.lit),
    JSON.stringify({
      docked,
      on: staged.on,
      kept: keptNode?.kept,
      edges: litEdges,
      dock: await page.evaluate(
        () =>
          document
            .querySelector("[data-move-dock]")
            ?.textContent?.slice(0, 300) ?? null
      ),
      move: await canvasFrameOf(page)
        ?.evaluate(() =>
          String(JSON.stringify((window as unknown as { __cawcoMove?: unknown }).__cawcoMove)).slice(0, 600)
        )
        .catch((error: Error) => error.message),
    })
  );
  if (docked) {
    await dockHeadLeg(kit, page, leg, "before an edit");
  }
  if (!docked) {
    const thrown = [...errors, ...(await thrownIn(page))];
    kit.check(
      `G21: ${leg}: no page error`,
      thrown.length === 0,
      thrown.join(" | ")
    );
    await page.close();
    return;
  }
  // Clip controls open in the row (the seam's default), never a dialog.
  await asksSince(page);
  await page.locator('[data-bar="0"]').click();
  await page.waitForSelector("[data-clip-controls]", { timeout: 5000 }).catch(() => undefined);
  const placement = await page.evaluate(() => {
    const controls = document.querySelector<HTMLElement>("[data-clip-controls]");
    return {
      placement: controls?.dataset.placement ?? null,
      inRow: !!controls?.closest('[data-clip="0"]'),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    };
  });
  kit.check(
    `G10 (controls): ${leg}: a clip's controls open in its row, and nothing opens as a dialog`,
    placement.placement === "row" && placement.inRow && placement.dialogs === 0,
    JSON.stringify(placement)
  );
  // A spring at any value: response and bounce off every token.
  await page.locator('[data-clip-controls] [data-curve="spring"]').click();
  const springOpen = await page
    .waitForSelector('[data-clip-controls] input[data-field="bounce"]', {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);
  if (!springOpen) {
    kit.check(
      `G11 (springs): ${leg}: Spring opens its fields in the clip's controls`,
      false,
      `${loads()} loads; controls ${await page.locator("[data-clip-controls]").count()}; ${await page.evaluate(() => document.querySelector("[data-clip-controls]")?.textContent?.slice(0, 300) ?? "none")}`
    );
    await page.close();
    return;
  }
  await page.waitForSelector("[data-clip-controls] [data-spring]", { timeout: 5000 }).catch(() => undefined);
  for (const [field, value] of [
    ["duration", "437"],
    ["bounce", "0.37"],
  ] as const) {
    const input = page.locator(`[data-clip-controls] input[data-field="${field}"]`);
    // biome-ignore lint/performance/noAwaitInLoops: one field, then the next
    await input.fill(value);
    await input.press("Enter");
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(900);
  const sprung = await page.evaluate(() => ({
    duration: (document.querySelector('[data-clip-controls] input[data-field="duration"]') as HTMLInputElement | null)?.value,
    bounce: (document.querySelector('[data-clip-controls] input[data-field="bounce"]') as HTMLInputElement | null)?.value,
    fields: [...document.querySelectorAll<HTMLInputElement>("[data-clip-controls] [data-spring] input[data-field]")].map((one) => one.dataset.field),
  }));
  const tunedSpring = (doc.read()?.state.tuned as { value?: { spring?: { bounce: number; response: number } | null; durationToken?: string | null }[] } | undefined)?.value?.find((one) => one.spring);
  kit.check(
    "G11 (springs): " +
      `${leg}: a spring takes values off every token (437 ms, 0.37 bounce), its mass, stiffness, damping and velocity stand as figures, and tuned carries it as ad hoc`,
    sprung.duration === "437" &&
      sprung.bounce === "0.37" &&
      ["mass", "stiffness", "damping", "velocity"].every((one) => sprung.fields.includes(one)) &&
      tunedSpring?.spring?.response === 437 &&
      tunedSpring.spring.bounce === 0.37 &&
      tunedSpring.durationToken === null,
    JSON.stringify({ sprung, tuned: doc.read()?.state.tuned })
  );
  const commits = await asksSince(page);
  kit.check(
    `G12 (replay): ${leg}: each value committed plays the move once from the start`,
    commits.filter((one) => one === "play").length >= 2,
    commits.join(",")
  );
  await page.locator("[data-close-controls]").first().click();
  // Snap: the bar's end let go near one of the page's duration tokens lands on it; ⌥ frees it, and its chip turns dashed for the agent to name.
  const bar1 = await barOf(page, 0);
  const said = await canvasFrameOf(page)?.evaluate(
    () =>
      (
        window as unknown as {
          __cawcoMove?: {
            clips: { duration: number; id: number; start: number }[];
            tokens: { durations: { ms: number; name: string }[] };
          };
        }
      ).__cawcoMove
  );
  const barBox = bar1.box;
  if (barBox && said && !finger) {
    const y = barBox.top + barBox.height / 2;
    const perMs = barBox.width / bar1.figure;
    const lane = await boxAt(page, '[data-lane="0"]');
    // A token past the bar's end, clear of every other clip's edges by more than the detent, inside the lane.
    const edges = said.clips
      .filter((one) => one.id !== 0)
      .flatMap((one) => [one.start, one.start + one.duration]);
    const token = said.tokens.durations.find(
      (one) =>
        one.ms > bar1.figure + 20 &&
        edges.every((edge) => Math.abs(edge - one.ms) * perMs > 12) &&
        !!lane &&
        barBox.left + one.ms * perMs < lane.right - 4
    );
    await asksSince(page);
    await page.mouse.move(barBox.right - 2, y);
    await page.mouse.down();
    // Let go 3px short of the token's length: inside the detent's reach.
    const to = barBox.left + (token?.ms ?? bar1.figure) * perMs - 1;
    await page.mouse.move(to, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const snapped = await barOf(page, 0);
    const dropAsks = await asksSince(page);
    kit.check(
      `G13 (snap): ${leg}: the bar's end let go near the page's ${token?.name ?? "(no token in reach)"} lands on it, its token's chip beside the figure, and the drop replays the move`,
      !!token &&
        snapped.figure === token.ms &&
        !snapped.adHoc &&
        dropAsks.includes("play"),
      JSON.stringify({
        before: bar1.figure,
        token,
        after: snapped.figure,
        adHoc: snapped.adHoc,
        asks: dropAsks,
        tokens: said.tokens.durations.length,
      })
    );
    const box2 = snapped.box ?? barBox;
    // Let go a few px past it, where no token stands: held free by ⌥, it stays there.
    const lengths = new Set(said.tokens.durations.map((one) => one.ms));
    // Free, a length lands on the 10ms (clip-words.ts `tens`).
    const freeAt = (px: number) =>
      Math.round((snapped.figure + px / perMs) / 10) * 10;
    const past =
      Array.from({ length: 20 }, (_, at) => 7 + 2 * at).find(
        (px) => freeAt(px) !== snapped.figure && !lengths.has(freeAt(px))
      ) ?? 7;
    await page.mouse.move(box2.right - 2, y);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(box2.right - 2 + past, y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.waitForTimeout(500);
    const freed = await barOf(page, 0);
    kit.check(
      `G14 (snap): ${leg}: with ⌥ held the length is free, off every token, and its chip is the dashed ad-hoc one`,
      freed.adHoc &&
        freed.figure !== snapped.figure &&
        !lengths.has(freed.figure),
      JSON.stringify({ from: snapped.figure, by: past, freed })
    );
    // A key's nudge stays still: no replay.
    await asksSince(page);
    await page.locator('[data-bar="0"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const nudged = await asksSince(page);
    kit.check(
      `G15 (replay): ${leg}: a key's nudge moves the clip and does not replay the move`,
      !nudged.includes("play"),
      nudged.join(",") || "no ask"
    );
  }
  // Segments: Original | Edited once the move has edits; under Original an edited bar is an outline.
  const compare = page.locator('[data-move-dock] [aria-label="Compare"] [role="tab"]', { hasText: "Original" });
  const hasCompare = (await compare.count()) > 0;
  if (hasCompare) {
    await asksSince(page);
    await compare.click();
    await page.waitForTimeout(500);
  }
  const outlined = await page.evaluate(() => ({
    view: document.querySelector<HTMLElement>("[data-move-dock]")?.dataset.view,
    outline: document.querySelectorAll("[data-bar][data-outline]").length,
  }));
  const viewAsks = await asksSince(page);
  kit.check(
    `G16 (segments): ${leg}: once edited, Original | Edited stands in the dock's head; Original plays the agent's timing and draws the edited bar as an outline`,
    hasCompare && outlined.view === "original" && outlined.outline >= 1 && viewAsks.includes("play"),
    JSON.stringify({ hasCompare, outlined, viewAsks })
  );
  if (hasCompare) {
    await page.locator('[data-move-dock] [aria-label="Compare"] [role="tab"]', { hasText: "Edited" }).click();
  }
  await dockHeadLeg(kit, page, leg, "with its edits");
  // Pins: a pin placed while Save failed is kept records its path, said under its words.
  const frame = canvasFrameOf(page);
  if (frame) {
    await page.keyboard.press("Escape");
    await commentMode(page, "Comment");
    // The overlay's comment layer takes the press over the page (app-comment-mode's `commenting`).
    await until(
      "the page's Comment mode on",
      () =>
        frame.evaluate(
          () =>
            document
              .querySelector("cawco-overlay")
              ?.shadowRoot?.querySelector(".layer")
              ?.classList.contains("comment") ?? false
        ),
      Boolean,
      5000
    ).catch(() => false);
    const outer = await page
      .locator("[data-bench-pane] iframe[data-ready]")
      .boundingBox();
    // The middle of the page's view: the kept frame stands there, wherever its move left the view.
    const inner = await frame
      .evaluate(() => {
        const canvas = document
          .querySelector(".cawco-canvas")
          ?.getBoundingClientRect();
        if (!canvas) {
          return null;
        }
        const x = canvas.x + canvas.width / 2;
        const y = canvas.y + canvas.height / 2;
        // Under the comment layer, which takes the press over the whole page.
        const under = document
          .elementsFromPoint(x, y)
          .some((one) => one.closest(".cawco-frame[data-cawco-on-stage]"));
        return under ? { x, y } : null;
      })
      .catch(() => null);
    const view = await frame.evaluate(() => {
      const r = (el: Element | null) => {
        const b = el?.getBoundingClientRect();
        return b ? [b.x, b.y, b.width, b.height].map(Math.round).join(",") : "none";
      };
      return `world ${document.querySelector<HTMLElement>(".cawco-world")?.style.transform}; canvas ${r(document.querySelector(".cawco-canvas"))}; on ${[...document.querySelectorAll(".cawco-frame[data-cawco-on-stage]")].map(r).join(" | ")}; label ${r(document.querySelector(".cawco-frame[data-cawco-on-stage] .cawco-frame-body label"))}; vars ${getComputedStyle(document.documentElement).getPropertyValue("--cawco-stage-bottom")} ${getComputedStyle(document.documentElement).getPropertyValue("--cawco-stage-end")}`;
    });
    const pressed =
      outer && inner
        ? await pressAt(
            frame,
            { x: outer.x + inner.x, y: outer.y + inner.y },
            { how: finger ? "tap" : "click" }
          )
            .then(() => "pressed")
            .catch((error: Error) => error.message.slice(0, 200))
        : "no point";
    const composer = page.locator('[data-slot="pin-composer"]');
    const composed = await composer
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    // What the composer names the pin by, before any words: the pin's title is these.
    const named = composed ? ((await composer.textContent())?.trim() ?? "") : "";
    if (composed) {
      await composer
        .getByRole("combobox")
        .fill("The reason reads well here; keep it above the actions.");
      // Sent as a person sends one: Enter in the field.
      await composer.getByRole("combobox").press("Enter");
    }
    const after = await page
      .evaluate(
        () =>
          document
            .querySelector('[data-slot="pin-composer"]')
            ?.textContent?.slice(0, 200) ?? "composer gone"
      )
      .catch(() => "unread");
    const joined = await frame
      .evaluate(
        () =>
          !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
            .cawcoArtifact?.doc
      )
      .catch(() => false);
    const pinned = await until(
      "the pin in the doc",
      () => Object.values(doc.read()?.pins ?? {}),
      (pins) => pins.length > 0,
      8000
    ).catch(() => Object.values(doc.read()?.pins ?? {}));
    // The pin opened again from its mark on the page: its card says the state it was left on.
    // Back in Interact, as a person reading their pin is: the comment layer no longer over the page's marks.
    await page.keyboard.press("Escape");
    await commentMode(page, "Interact");
    await page.waitForTimeout(300);
    const mark = await frame
      .evaluate(() => {
        const r = document
          .querySelector("[data-cawco-pins] [data-pin]:not([data-pin='new'])")
          ?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      })
      .catch(() => null);
    const card = page.locator('[data-slot="pin-state"]').first();
    const atMark = mark
      ? await frame
          .evaluate(
            ({ x, y }) =>
              document
                .elementsFromPoint(x, y)
                .slice(0, 3)
                .map(
                  (one) =>
                    `${one.tagName.toLowerCase()}${one.getAttribute("data-pin") ? `[data-pin=${one.getAttribute("data-pin")}]` : ""}`
                ),
            mark
          )
          .catch(() => [])
      : [];
    if (outer && mark) {
      await pressAt(
        frame,
        { x: outer.x + mark.x, y: outer.y + mark.y },
        { how: finger ? "tap" : "click" }
      ).catch(() => undefined);
      await card.waitFor({ timeout: 4000 }).catch(() => undefined);
    }
    const cardsOpen = await page
      .locator('[data-slot="pin-card"]')
      .count()
      .catch(() => 0);
    const cardSays = await card
      .textContent({ timeout: 2500 })
      .catch(() => null);
    // The path as the graph says it: the machine's header, then the state's own words in its node.
    const path = `Saving it › ${stateWords}`;
    kit.check(
      `G17 (pins): ${leg}: a pin placed while Save failed is kept records the graph's path to it, its card says so under the words, and its own words reach the doc as the page wrote them (UTF-8)`,
      pinned.length === 1 &&
        pinned[0]?.state === path &&
        cardSays === `Left on ${path}` &&
        !!pinned[0]?.title &&
        named.startsWith(pinned[0].title),
      JSON.stringify({
        pressed,
        atMark,
        cardsOpen,
        view,
        named: named.slice(0, 60),
        charset: await frame.evaluate(() => document.characterSet),
        composed,
        after,
        joined,
        path,
        said: cardSays,
        pins: pinned.map((one) => ({ state: one.state, title: one.title })),
      })
    );
    await page.keyboard.press("Escape");
    await commentMode(page, "Interact");
  }
  // The panel's edges (desk): the width edge widens it, the corner restores it, the handle lit while held.
  if (desk) {
    read = await readGraph(page);
    const before = read.panel;
    const band = await boxAt(page, '[data-sash="width"]');
    if (before && band) {
      const y = band.top + band.height / 2;
      const from = band.left + band.width / 2;
      await page.mouse.move(from, y);
      await page.waitForTimeout(200);
      const reached = await page.evaluate(() => document.querySelector('[data-resize-handle="bl"]')?.hasAttribute("data-reached"));
      await page.mouse.down();
      await page.mouse.move(band.left - 60, y, { steps: 6 });
      const held = await page.evaluate(() => document.querySelector('[data-resize-handle="bl"]')?.hasAttribute("data-held"));
      await page.mouse.up();
      await page.waitForTimeout(400);
      const after = (await readGraph(page)).panel;
      kit.check(
        `G18 (edges): ${leg}: pointed at, the width edge's handle reaches; held, it sweeps; a drag of the edge widens the panel by the drag`,
        !!reached &&
          !!held &&
          !!after &&
          Math.abs(after.width - before.width - (from - (band.left - 60))) <= 1,
        JSON.stringify({ reached, held, before: before.width, after: after?.width })
      );
      await page.locator('[data-sash="corner"]').dblclick();
      await page.waitForTimeout(400);
      const restored = (await readGraph(page)).panel;
      kit.check(
        `G19 (edges): ${leg}: a double-press on the corner puts the panel back to its own width`,
        !!restored && Math.abs(restored.width - before.width) <= 1,
        JSON.stringify({ before: before.width, restored: restored?.width })
      );
    }
    // Hide folds the panel's shell into its tab, read on the clock (the DevTools Animation domain on Chromium).
    const panelBefore = (await readGraph(page)).panel;
    const fold = await readMotion(
      page,
      () => page.locator(`${GRAPH_PANEL} [data-hide-graph]`).click(),
      "[data-show-graph]",
      {
        fractions: [0, 0.5, 1],
        own: true,
        read: async () =>
          await page.evaluate(() => {
            const r = document.querySelector("[data-show-graph]")?.getBoundingClientRect();
            return r ? Math.round(r.width) : 0;
          }),
      }
    ).catch((error: Error) => ({ at: [], by: "clock" as const, runs: [], error: error.message }));
    await page.waitForTimeout(600);
    const tab = await boxAt(page, "[data-show-graph]");
    const tucked = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--c-tucked-tab"
        )
      )
    );
    const widths = fold.at.map((one) => one.value);
    /** Every run of the fold on one clock: one delay, one end, one curve. */
    const clocks = (runs: typeof fold.runs) =>
      new Set(runs.map((one) => `${one.delay}|${one.end}|${one.easing}`));
    kit.check(
      `G20 (show and hide): ${leg}: Hide folds the panel's one box into its tab on one clock (every run one delay, end and curve; its width at 0, past half-way at 0.5, the tab's at the end), read on ${fold.by === "clock" ? "the DevTools Animation domain" : "the page's held clock"}`,
      fold.runs.length > 0 &&
        clocks(fold.runs).size === 1 &&
        widths.length === 3 &&
        (widths[0] ?? 0) > (widths[1] ?? 0) &&
        (widths[1] ?? 0) > (widths[2] ?? 0) &&
        !!tab &&
        Math.abs(tab.width - tucked) <= 1 &&
        !!panelBefore,
      JSON.stringify({
        widths,
        clocks: [...clocks(fold.runs)],
        runs: fold.runs.map((one) => one.name),
        tab,
        error: "error" in fold ? fold.error : null,
      })
    );
    const grow = await readMotion(
      page,
      () => page.locator("[data-show-graph]").click(),
      "[data-show-graph]",
      {
        fractions: [0, 0.5, 1],
        own: true,
        read: async () =>
          await page.evaluate(() => {
            const r = document
              .querySelector("[data-show-graph]")
              ?.getBoundingClientRect();
            return r ? Math.round(r.width) : 0;
          }),
      }
    ).catch((error: Error) => ({
      at: [],
      by: "clock" as const,
      runs: [],
      error: error.message,
    }));
    await page.waitForTimeout(600);
    const reopened = await readGraph(page);
    const grown = grow.at.map((one) => one.value);
    kit.check(
      `G20b (show and hide): ${leg}: Show grows the panel back out of its tab on one clock, to its own width`,
      grow.runs.length > 0 &&
        clocks(grow.runs).size === 1 &&
        (grown[0] ?? 0) < (grown[1] ?? 0) &&
        (grown[1] ?? 0) < (grown[2] ?? 0) &&
        reopened.open === "true" &&
        !!reopened.panel &&
        !!panelBefore &&
        Math.abs(reopened.panel.width - panelBefore.width) <= 1,
      JSON.stringify({
        grown,
        clocks: [...clocks(grow.runs)],
        open: reopened.open,
        panel: reopened.panel?.width,
        error: "error" in grow ? grow.error : null,
      })
    );
  }
  if (!desk) {
    // The drawer's stops: the grabber steps it from peek to full on one clock; its head dragged down folds it to its head; the grabber opens it again.
    const peekH = (await readGraph(page)).panel?.height ?? 0;
    const heightNow = async () =>
      await page.evaluate(
        (selector) =>
          Math.round(
            document.querySelector(selector)?.getBoundingClientRect().height ??
              0
          ),
        GRAPH_PANEL
      );
    const rise = await readMotion(
      page,
      () => page.locator(`${GRAPH_PANEL} [data-grabber]`).click(),
      GRAPH_PANEL,
      { fractions: [0, 0.5, 1], own: true, read: heightNow }
    ).catch((error: Error) => ({
      at: [],
      by: "clock" as const,
      runs: [],
      error: error.message,
    }));
    await page.waitForTimeout(500);
    const fullH = await heightNow();
    const rose = rise.at.map((one) => one.value);
    kit.check(
      `G26 (drawer): ${leg}: the grabber steps the drawer from peek to full, its height rising on one run`,
      fullH > peekH + 1 &&
        rise.runs.length === 1 &&
        (rose[0] ?? 0) < (rose[1] ?? 0) &&
        (rose[1] ?? 0) < (rose[2] ?? 0),
      JSON.stringify({
        peekH,
        fullH,
        rose,
        runs: rise.runs.map((one) => `${one.name} ${one.end} ${one.easing}`),
        error: "error" in rise ? rise.error : null,
      })
    );
    const head = await boxAt(page, `${GRAPH_PANEL} > header`);
    if (head) {
      const x = head.left + 12;
      const y = head.top + head.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + fullH, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
    const folded = await readGraph(page);
    await page.locator(`${GRAPH_PANEL} [data-grabber]`).click();
    // Once its height has run to its stop (--dur-panel; a loaded engine draws late).
    const back = await until(
      "the drawer at its stop again",
      () => readGraph(page),
      (now) => (now.panel?.height ?? 0) > (head?.height ?? 0) + 1,
      3000
    ).catch(() => readGraph(page));
    kit.check(
      `G27 (drawer): ${leg}: its head dragged down folds the drawer to its head, and the grabber opens it again`,
      folded.open === "false" &&
        !!folded.panel &&
        !!head &&
        Math.abs(folded.panel.height - head.height) <= 2 &&
        back.open === "true" &&
        (back.panel?.height ?? 0) > head.height + 1,
      JSON.stringify({
        folded: [folded.open, folded.panel?.height],
        head: head?.height,
        back: [back.open, back.panel?.height],
      })
    );
  }
  read = await readGraph(page);
  kit.check(
    `G22: ${leg}: no text in the graph or the dock is set under the meta size`,
    read.fonts.least >= read.fonts.meta - 0.01,
    JSON.stringify(read.fonts)
  );
  kit.check(
    `G23 (overflow sweep): ${leg}: nothing spills: 0`,
    read.spills.length === 0,
    `${read.spills.length}: ${read.spills.join("; ")}`
  );
  kit.check(
    `G25: ${leg}: the canvas page loaded once in the pane, the whole leg through`,
    loads() === 1,
    `${loads()} loads`
  );
  const thrown = [...errors, ...(await thrownIn(page))];
  kit.check(
    `G24: ${leg}: no page error, in the pane or the canvas page`,
    thrown.length === 0,
    thrown.join(" | ") || "none"
  );
  await page.close();
}

/** G at 390, 680 and 1440, light; and 1440 dark. */
async function graphLegs(kit: Kit, bench: string, stage: Stage): Promise<void> {
  // `CANVAS_GRAPH=<width>[,<theme>]` runs one leg alone, as a change is made.
  const [onlyWidth, onlyTheme] = (process.env.CANVAS_GRAPH ?? "").split(",");
  const legs: [number, "light" | "dark"][] = [
    [1440, "light"],
    [680, "light"],
    [390, "light"],
    [1440, "dark"],
  ];
  // The stage's first compile of the routine form's graph (the dashboard's form kit, its words, its icons), outside the legs' clock.
  const warm = await kit.page("desk", { theme: "light" });
  // What the page asked the stage for and has no answer to yet, by address: a module that never comes is named.
  const pending = new Set<string>();
  warm.on("request", (request) => pending.add(request.url()));
  warm.on("requestfinished", (request) => pending.delete(request.url()));
  warm.on("requestfailed", (request) =>
    pending.add(`${request.url()} failed: ${request.failure()?.errorText}`)
  );
  const since = performance.now();
  // As the stage's own render: every section drawn and every move played, so every module the legs reach is fetched and optimized before them (a dependency Vite finds later reloads the page under a leg).
  await warm.goto(
    `${stage.base}${canvasPath(GRAPH_FILES, GRAPH_CANVAS)}&by=stage`
  );
  const warmed = await warm
    .waitForFunction(
      () =>
        (window as unknown as { __cawcoCanvas?: { swept?: boolean } })
          .__cawcoCanvas?.swept === true &&
        document.querySelectorAll(
          '.cawco-section[data-cawco-file$="RoutineSave.stories.ts"] .cawco-frame'
        ).length >= 4,
      null,
      { timeout: 120_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    "G: the stage draws every section of the graph's canvas and plays its moves",
    warmed,
    `${Math.round(performance.now() - since)}ms: waiting on ${[...pending].join(", ") || "nothing"}; ${await warm.evaluate(() => `${document.querySelectorAll(".cawco-frame").length} frames; ${document.body.innerText.slice(0, 400)}; ${JSON.stringify((window as unknown as { __cawcoCanvas?: { report?: { page?: unknown } } }).__cawcoCanvas?.report?.page)}`)} ${stage.heard()}`
  );
  await warm.close();
  if (!warmed) {
    return;
  }
  for (const [width, theme] of legs) {
    if ((onlyWidth && Number(onlyWidth) !== width) || (onlyTheme && onlyTheme !== theme)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    await graphLeg(kit, bench, stage, width, theme);
  }
}

/** The legs `CANVAS_DESIGN` runs alone on the bench by their name. */
const ALONE: Record<
  string,
  (kit: Kit, bench: string, stage: Stage) => Promise<void>
> = {
  sweep: sweeps,
  desk: deskLeg,
  count: countLegs,
  bounce: bounces,
  graph: graphLegs,
};

const spec: Spec = {
  name: "canvas-design",
  run: async (kit) => {
    const stage = await stageOf();
    // `CANVAS_DESIGN=head` or `=page` runs that half alone; `=switch` runs leg 12 alone (the side panel's 4202 crash); `=sweep` the head's W0–W4 alone; `=desk` leg D alone; `=count` legs 8j and 8h alone; `=bounce` leg B alone.
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
      const alone = ALONE[only ?? ""];
      if (alone) {
        await alone(kit, await kit.bench(), stage);
        return;
      }
      const bench = await kit.bench();
      for (const theme of ["light", "dark"] as const) {
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
        await headCountLeg(kit, bench, stage, 390, theme);
        await headCountLeg(kit, bench, stage, 680, theme);
        await commentsCount(kit, bench, stage, theme);
        await mapLeg(kit, bench, stage, 720, theme);
        await mapLeg(kit, bench, stage, 390, theme);
        await stageDownLeg(kit, bench, stage, theme);
        await refusedLeg(kit, bench, stage, theme);
        await ownTabLeg(kit, bench, stage, theme);
        await switchLeg(kit, bench, stage, theme);
        await artifactSwitchLeg(kit, bench, stage, theme);
      }
      await graphLegs(kit, bench, stage);
      await backLeg(kit, bench, stage);
      await sweeps(kit, bench, stage);
      await deskLeg(kit, bench, stage);
      await bounces(kit, bench, stage);
    } finally {
      stage.stop();
    }
  },
};
export default spec;
